#!/usr/bin/env python3
"""Add pinned GTA.ZONE identifier claims to a fresh public catalog export.

Offline only. Existing native witnesses/IDs and save links remain unchanged.
Website claims stay candidate references; this step never creates observed
weaponSpecHash32/itemHash32 values or a new native model row.
"""
import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import urlsplit

from match_website_labels import joaat32_exact

VERSION = "saverift-website-catalog-augmentation/1.0.0"
MAX_JSON_BYTES = 32 * 1024 * 1024
INPUT_PINS = {
    "facts": "8d76954f863a2804f755b73bad22d649f19b0f174e853a7079ed0eb4b4d20719",
    "weapons_facts": "bccf556847a1417d2c21a00bcf26332528cadc0f88f46b2850d18c3d90eb2188",
    "weapons_provenance": "9f47c45dfaadd9aa36a9ef5dd9c916d876a2a4435ef7ee9a92c44646190c20d7",
}
SOURCE_PINS = {
    "vehicles": {"id": "gtazone-vehicles-identifiers-2026-11-22", "slug": "vehiculos",
        "url": "https://negentropy.studio/assets/data/en/vehiculos.5c062fad5b.json",
        "sha256": "a556f3b769a36eb192093e0c9cdf4d3ea0fc3b651c1d9a5d7019a8cd8e54441c",
        "section": "https://negentropy.studio/vehicles/", "title": "GTA.ZONE vehicle identifier claims"},
    "weapons": {"id": "gtazone-weapons-identifiers-2026-11-22", "slug": "armas",
        "url": "https://negentropy.studio/assets/data/en/armas.8a77b0ac6c.json",
        "sha256": "85933f5fb560162602f3948121cebc5788f72d0de1cb52c9ff0aa0b4664ecfdd",
        "section": "https://negentropy.studio/weapons/", "title": "GTA.ZONE weapon-spec identifier claims"},
    "items": {"id": "gtazone-items-identifiers-2026-11-22", "slug": "bebidas-y-drogas",
        "url": "https://negentropy.studio/assets/data/en/bebidas-y-drogas.af5c5b34b5.json",
        "sha256": "bb4971a95b3633c2b9db442cf729f1a791c3327e310b06b80ac73137dabac2df",
        "section": "https://negentropy.studio/drinks-and-drugs/", "title": "GTA.ZONE drink and drug ItemId claims"},
}
HASH32 = re.compile(r"^0[xX][0-9a-fA-F]{8}$")
HEX_LOOKING = re.compile(r"^0[xX][0-9a-fA-F]+$")


def packed(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_json(path, expected=None):
    path = Path(path)
    if path.is_symlink() or path.stat().st_size > MAX_JSON_BYTES:
        raise ValueError("Expected a bounded regular JSON input")
    raw = path.read_bytes()
    if expected and hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError(f"Pinned factual input changed: {path.name}")
    return json.loads(raw.decode("utf-8-sig"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def nonempty(value):
    return isinstance(value, str) and bool(value)


def safe_url(value, section):
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or parsed.hostname != "negentropy.studio" or
            parsed.port not in (None, 443) or parsed.username or parsed.password or parsed.query or parsed.fragment or
            not value.startswith(section)):
        raise ValueError("Expected the pinned public detail URL namespace")
    return value


def location(pin, pointer, label_pointer=None):
    if not isinstance(pointer, str) or not re.fullmatch(r"/e/\d+(?:/\d+)*", pointer):
        raise ValueError("Missing exact website JSON location")
    text = f"url:{pin['url']}; body-sha256:{pin['sha256']}; json-pointer:{pointer}"
    if label_pointer:
        if not re.fullmatch(r"/e/\d+/1", label_pointer):
            raise ValueError("Missing exact website label location")
        text += "; label-json-pointer:" + label_pointer
    return text


def hash_candidates(literal, domain):
    if not nonempty(literal) or not literal.isascii() or HEX_LOOKING.fullmatch(literal):
        raise ValueError("Hash calculations require a non-hex ASCII literal")
    return [{"nativeIdKey": "referenceId", "domain": domain, "algorithm": "joaat32",
             "transform": transform, "value": f"0x{joaat32_exact(text):08x}", "confidence": "candidate"}
            for transform, text in (("exact", literal), ("lowercase", literal.lower()))]


def source_record(category, data_source, build_claim):
    pin = SOURCE_PINS[category]
    return {"id": pin["id"], "kind": "public-website-factual-identifiers", "title": pin["title"],
        "locator": pin["section"], "revision": "JSON SHA-256 " + pin["sha256"],
        "license": "No explicit dataset reuse license established; factual identifiers and source references only.",
        "attribution": "GTA.ZONE; website claims kept separate from SaveRift native observations.",
        "allowedUse": "Attributed factual names, identifiers and candidate relations; excludes prose, artwork, models and game payloads.",
        "provenance": {"dataUrl": pin["url"], "dataSha256": pin["sha256"],
            "dataBytes": str(data_source["bytes"]), "pageUrl": pin["section"],
            "pageSha256": data_source["page_sha256"], "dataLastModified": data_source.get("last_modified"),
            "websiteBuildClaim": deepcopy(build_claim), "gameBuild": None,
            "identityVerified": False, "sourceClaimsOnly": True, "saveMappingEstablished": False}}


def select_facts(facts, weapons_facts, weapons_provenance):
    if facts.get("site") != "GTA.ZONE" or facts.get("source_claims", {}).get("build") != "1.0.2.1":
        raise ValueError("Unexpected website/build claim")
    source_lookup = {s["source_id"]: s for s in facts["sources"]}
    if len(source_lookup) != len(facts["sources"]):
        raise ValueError("Duplicate factual source identity")
    records = {"vehicles": [], "items": [], "weapons": []}
    source_data = {}
    for category in ("vehicles", "items"):
        pin = SOURCE_PINS[category]
        matches = [s for s in source_lookup.values() if s["url"] == pin["url"] and s["sha256"] == pin["sha256"]]
        if len(matches) != 1:
            raise ValueError("Missing pinned website data source")
        source = matches[0]
        source_data[category] = {"bytes": source["bytes"], "page_sha256": source["section_page_sha256"],
                                 "last_modified": source.get("last_modified")}
        domain = "vehicle-internal-name" if category == "vehicles" else "inventory-item-id32"
        for record in facts["records"]:
            if record.get("claimed_domain") != domain:
                continue
            if (record["source_id"] != source["source_id"] or record.get("claim_status") != "website-claim" or
                    record.get("game_definition_independently_verified") is not False or record.get("save_mapping_verified") is not False or
                    record.get("namespace") != f"GTA.ZONE:{pin['slug']}:published-internal-name"):
                raise ValueError("Website identity claim has the wrong source or namespace")
            identifier = record["published_identifier"]
            if not all(nonempty(record[k]) for k in ("record_key", "site_record_id", "label", "published_identifier")):
                raise ValueError("Incomplete website factual identity")
            if category == "items":
                keys = [f for f in record["retained_fields"] if f["field_key"] == "clave"]
                if (record["site_category"] not in ("Bebidas", "Drogas") or not HASH32.fullmatch(identifier) or
                        record["published_identifier_format"] != "hex32" or len(keys) != 1 or keys[0]["value"] != identifier or
                        keys[0]["descriptor_pointer"] != "/f/34" or
                        keys[0]["value_pointer"] != record["published_identifier_pointer"].removesuffix("/2") + "/4/34"):
                    raise ValueError("Item claim crossed the ItemId/model/profile boundary")
            elif (record["published_identifier_format"] not in ("literal", "hex32") or
                    (record["published_identifier_format"] == "hex32") != bool(HASH32.fullmatch(identifier)) or
                    record["published_identifier_format"] == "literal" and HEX_LOOKING.fullmatch(identifier)):
                raise ValueError("Vehicle published identifier width/representation mismatch")
            records[category].append(record)
    wp = weapons_provenance
    pin = SOURCE_PINS["weapons"]
    if (weapons_facts.get("dataUrl") != pin["url"] or weapons_facts.get("dataSha256") != pin["sha256"] or
            wp["discovery"].get("dataUrl") != pin["url"] or wp["discovery"].get("dataSha256") != pin["sha256"] or
            wp["websiteBuildClaim"].get("build") != "1.0.2.1" or wp["websiteBuildClaim"].get("independentlyVerified") is not False):
        raise ValueError("Unexpected pinned weapon source or build claim")
    source_data["weapons"] = {"bytes": wp["discovery"]["dataBytes"], "page_sha256": wp["discovery"]["pageSha256"],
                              "last_modified": wp["discovery"].get("dataLastModified")}
    excluded_weapon_kinds = Counter()
    for record in weapons_facts["records"]:
        kind, identifier = record["identifierKind"], record["reportedIdentifier"]
        if kind == "website-reported-weapon-entry-without-spec":
            excluded_weapon_kinds[kind] += 1
            continue
        if (kind not in ("website-reported-spec-literal", "website-reported-spec-hash32") or
                record.get("confidence") != "candidate" or record.get("identityVerified") is not False or not nonempty(identifier)):
            raise ValueError("Weapon record is not a candidate spec claim")
        if kind == "website-reported-spec-hash32" and not HASH32.fullmatch(identifier):
            raise ValueError("Weapon hash claim must preserve all 32 bits")
        if kind == "website-reported-spec-literal" and HEX_LOOKING.fullmatch(identifier):
            raise ValueError("Hexadecimal weapon identifier was presented as a literal")
        records["weapons"].append(record)
    for category, rows in records.items():
        keys = [r["sourceRecordId"] if category == "weapons" else r["record_key"] for r in rows]
        if len(set(keys)) != len(keys):
            raise ValueError("Duplicate website record identity")
    build_claim = {"platform": "Xbox Series", "build": "1.0.2.1", "scope": "website-claim",
                   "sourceUrl": wp["websiteBuildClaim"]["sourceUrl"], "sourceSha256": wp["websiteBuildClaim"]["sourceSha256"],
                   "independentlyVerified": False, "appliesToSaveRiftArchiveBuild": False}
    return records, [source_record(k, source_data[k], build_claim) for k in ("vehicles", "weapons", "items")], dict(excluded_weapon_kinds)


def choose_model_name(entry):
    attrs = entry["attributes"]
    crosswalk = attrs.get("crosswalk", [])
    all_labels = {r["label"] for r in crosswalk if r["kind"] == "website-label"}
    labels = sorted(label for label in all_labels if not HEX_LOOKING.fullmatch(label))
    tokens = sorted({r["token"] for r in crosswalk if r["kind"] == "native-token-hash"})
    inputs = set()
    for row in crosswalk:
        if row["matchMethod"] not in ("joaat32_exact", "joaat32_lowercase"):
            continue  # A published numeric value is not a second hash preimage.
        text = row["token"] if row["kind"] == "native-token-hash" else row["comparedText"]
        if not text.isascii():
            raise ValueError("Existing hash comparison contains non-ASCII text")
        value = text.lower() if row["matchMethod"] == "joaat32_lowercase" else text
        if joaat32_exact(value) != int(entry["nativeIds"]["modelHash32"], 16):
            raise ValueError("Existing model crosswalk contains a mismatched hash")
        inputs.add(value)
    collision = len(inputs) > 1
    if len(labels) == 1 and not collision:
        name, confidence, kind = labels[0], "candidate", "candidate-website-label"
    elif len(tokens) == 1 and not collision:
        name, confidence, kind = tokens[0], "candidate", "candidate-native-token"
    else:
        name, confidence, kind = "Vehicle model " + entry["nativeIds"]["modelHash32"], "observed", "observed-model-reference"
    entry["name"]["en"], entry["confidence"], attrs["nameKind"] = name, confidence, kind
    attrs.setdefault("labelAmbiguity", {}).update(multipleWebsiteLabels=len(labels) > 1, multipleNativeTokens=len(tokens) > 1,
        distinctHashInputsShareHash=collision, hashOnlyWebsiteLabels=len(all_labels) - len(labels))
    attrs["crosswalkStatus"] = "candidate-labels" if crosswalk else "unresolved-label"


def add_vehicle_claims(vehicles, records):
    models = {}
    for entry in vehicles["entries"]:
        if entry.get("attributes", {}).get("recordRole") != "native_vehicle_model_reference":
            continue
        value = entry.get("nativeIds", {}).get("modelHash32")
        if not isinstance(value, str) or not HASH32.fullmatch(value) or int(value, 16) == 0 or value.lower() in models:
            raise ValueError("Observed model rows must have unique nonzero 32-bit model identifiers")
        models[value.lower()] = entry
    pin = SOURCE_PINS["vehicles"]
    methods, joined_records, joined_models, unmatched, skipped = Counter(), set(), set(), [], 0
    for record in records:
        text = record["published_identifier"]
        if HASH32.fullmatch(text):
            trials = [("hash32_value_exact", "0x" + text[2:].lower())]
        elif text.isascii():
            trials = [("joaat32_exact", f"0x{joaat32_exact(text):08x}"),
                      ("joaat32_lowercase", f"0x{joaat32_exact(text.lower()):08x}")]
        else:
            skipped += 1
            unmatched.append(record["record_key"])
            continue
        found = False
        for method, value in trials:
            if value not in models:
                continue
            found = True
            row = {"kind": "website-label", "nativeIdKey": "modelHash32", "label": record["label"],
                   "comparedText": text, "namespace": record["namespace"], "sourceRef": pin["id"],
                   "sourceRecordId": record["record_key"],
                   "location": location(pin, record["published_identifier_pointer"], record["label_pointer"]),
                   "url": safe_url(record["detail_url"], pin["section"]), "matchMethod": method, "confidence": "candidate"}
            models[value]["attributes"].setdefault("crosswalk", []).append(row)
            methods[method] += 1
            joined_records.add(record["record_key"])
            joined_models.add(value)
        if not found:
            unmatched.append(record["record_key"])
    changed = 0
    for entry in models.values():
        before = (entry["name"]["en"], entry["confidence"])
        choose_model_name(entry)
        changed += before != (entry["name"]["en"], entry["confidence"])
    return {"observedModels": len(models), "websiteVehicleRecords": len(records), "matchedWebsiteVehicleRecords": len(joined_records),
            "modelsWithGtaZoneCandidates": len(joined_models), "addedCrosswalkRowsByMethod": dict(methods),
            "unmatchedWebsiteRecordKeys": unmatched, "skippedNonAsciiVehiclePreimages": skipped,
            "modelsWithoutGtaZoneCandidates": sorted(set(models) - joined_models),
            "modelsWithoutAnyCandidate": sorted(v for v, e in models.items() if not e["attributes"].get("crosswalk")),
            "numericDisplayModels": sorted(v for v, e in models.items() if e["attributes"]["nameKind"] == "observed-model-reference"),
            "changedDisplayNamesOrConfidence": changed,
            "displayNameKinds": dict(Counter(e["attributes"]["nameKind"] for e in models.values()))}


def claim_entry(category, record):
    is_weapon = category == "weapons"
    pin, domain = SOURCE_PINS[category], "spec" if is_weapon else "item"
    identifier = record["reportedIdentifier"] if is_weapon else record["published_identifier"]
    source_id = record["sourceRecordId"] if is_weapon else record["record_key"]
    site_id = record["sourceRecordId"] if is_weapon else record["site_record_id"]
    row_pointer = record["sourceLocation"] if is_weapon else record["published_identifier_pointer"].removesuffix("/2")
    pointer = row_pointer + "/2" if is_weapon else next(f["value_pointer"] for f in record["retained_fields"] if f["field_key"] == "clave")
    label = record["label"]
    if not nonempty(label):
        raise ValueError("Website claim lacks a display label")
    suffix = site_id if re.fullmatch(r"[a-z0-9-]+", site_id) else hashlib.sha256(site_id.encode("utf-8")).hexdigest()[:24]
    namespace = "website-reported:GTA.ZONE:" + domain
    evidence_location = location(pin, pointer, row_pointer + "/1")
    is_hex = bool(HASH32.fullmatch(identifier))
    attrs = {"recordRole": "website_reported_identifier", "editorReady": False, "runtimeAvailability": "unverified",
        "saveMapping": "unvalidated", "websiteIdentityVerified": False, "websiteClaimedBuild": "1.0.2.1",
        "websiteClaimedBuildScope": "website-claim", "websiteClaimedPlatform": "Xbox Series",
        "reportedIdentifierMetadata": {"referenceId": {"domain": domain, "representation": "hex" if is_hex else "literal",
            "bitWidth": 32 if is_hex else None, "confidence": "candidate"}},
        "crosswalk": [{"kind": "website-native-id", "nativeIdKey": "referenceId", "comparedText": identifier,
            "matchMethod": "literal_exact", "label": label, "namespace": namespace, "sourceRef": pin["id"],
            "sourceRecordId": source_id, "location": evidence_location,
            "url": safe_url(record["url"] if is_weapon else record["detail_url"], pin["section"]), "confidence": "candidate"}]}
    if is_weapon and not is_hex and identifier.isascii():
        attrs["hashCandidates"] = hash_candidates(identifier, domain)
    if is_weapon:
        relations = []
        for field_name, relation_domain in (("weaponType", "weapon-type"), ("namedPresets", "preset"), ("namedRecipes", "recipe")):
            field = record["fields"].get(field_name)
            if field is None:
                continue
            expected_kind = "reported-native-token" if field_name == "weaponType" else "reported-native-token-list"
            if field.get("kind") != expected_kind:
                raise ValueError("Named relation does not carry a native-token claim")
            values = [field["value"]] if field_name == "weaponType" else field["value"]
            if not isinstance(values, list) or any(not nonempty(v) or HEX_LOOKING.fullmatch(v) for v in values):
                raise ValueError("Named website relations must remain explicit literal tokens")
            for value in values:
                relations.append({"relation": field_name, "domain": relation_domain, "value": value,
                    "sourceRef": pin["id"], "sourceRecordId": source_id, "sourceLocation": field["sourceLocation"],
                    "location": location(pin, field["sourceLocation"]), "confidence": "candidate", "identityVerified": False})
        attrs["websiteReportedRelations"] = relations
    return {"id": f"gta-vi:{category}:website-gtazone-{domain}-{suffix}", "name": {"en": label},
        "nativeIds": {"referenceId": identifier, "referenceNamespace": namespace}, "attributes": attrs,
        "confidence": "candidate", "applicability": {"platforms": ["xbox"], "build": None},
        "evidence": [{"sourceRef": pin["id"], "location": evidence_location,
            "method": "Website-reported identifier and label; native identity, archive build and save meaning unvalidated"}]}


def augment_catalog(vehicles, weapons, items, sources, base_report, facts, weapons_facts, weapons_provenance):
    vehicles, weapons, items, sources, report = deepcopy((vehicles, weapons, items, sources, base_report))
    existing_ids = [e["id"] for group in (vehicles, weapons, items) for e in group["entries"]]
    if len(existing_ids) != len(set(existing_ids)):
        raise ValueError("Duplicate existing catalog identity")
    if any(s["id"] in {p["id"] for p in SOURCE_PINS.values()} for s in sources["sources"]):
        raise ValueError("This website augmentation is already present")
    selected, new_sources, excluded_weapon_kinds = select_facts(facts, weapons_facts, weapons_provenance)
    vehicle_report = add_vehicle_claims(vehicles, selected["vehicles"])
    if base_report.get("observedModelHashes") != vehicle_report["observedModels"]:
        raise ValueError("Observed model count differs from the base export receipt")
    known_ids = set(existing_ids)
    for category, group in (("weapons", weapons), ("items", items)):
        for record in selected[category]:
            entry = claim_entry(category, record)
            if entry["id"] in known_ids:
                raise ValueError("Website claim ID would replace an existing row")
            known_ids.add(entry["id"])
            group["entries"].append(entry)
    sources["sources"].extend(new_sources)
    summary = {"schema": "saverift.gta-vi.website-augmentation-report.v1", "augmenter": VERSION,
        "vehicleCoverage": vehicle_report, "addedWeaponSpecClaims": len(selected["weapons"]),
        "weaponIdentifierRepresentations": dict(Counter("hex32" if HASH32.fullmatch(r["reportedIdentifier"]) else "literal" for r in selected["weapons"])),
        "excludedWeaponKinds": excluded_weapon_kinds, "addedItemClaims": len(selected["items"]),
        "itemCategoryCounts": dict(Counter(r["site_category"] for r in selected["items"])),
        "newSources": 3, "newSaveLinks": 0, "editabilityChanges": 0, "observedIdentifierPromotions": 0,
        "publishedSourcePins": {k: {"url": p["url"], "sha256": p["sha256"]} for k, p in SOURCE_PINS.items()}}
    report["websiteAugmentation"] = summary
    report["displayNames"] = {"uniqueWebsiteLabelCandidates": vehicle_report["displayNameKinds"].get("candidate-website-label", 0),
        "uniqueNativeTokenCandidates": vehicle_report["displayNameKinds"].get("candidate-native-token", 0),
        "numericReferenceLabels": len(vehicle_report["numericDisplayModels"])}
    report["newSources"] = base_report.get("newSources", 0) + 3
    return {"entities/vehicles.json": vehicles, "entities/weapons.json": weapons, "entities/items.json": items,
            "sources.json": sources, "crosswalk-report.json": report, "web-augmentation-report.json": summary}


def build(base_export, baseline_data, facts_path, weapons_facts_path, weapons_provenance_path, output):
    base_export, baseline_data, output = Path(base_export), Path(baseline_data), Path(output)
    if output.exists() or output.resolve().is_relative_to(base_export.resolve()):
        raise ValueError("Choose a fresh output outside the input export")
    item_path = baseline_data / "entities/items.json" if baseline_data.is_dir() else baseline_data
    paths = {"facts": Path(facts_path), "weapons_facts": Path(weapons_facts_path), "weapons_provenance": Path(weapons_provenance_path)}
    factual = {name: read_json(path, INPUT_PINS[name]) for name, path in paths.items()}
    base_paths = ["entities/vehicles.json", "entities/weapons.json", "sources.json", "crosswalk-report.json"]
    vehicles, weapons, sources, base_report = [read_json(base_export / p) for p in base_paths]
    if (base_export / "entities/items.json").exists() and (base_export / "entities/items.json").read_bytes() != item_path.read_bytes():
        raise ValueError("Base export items differ from the requested original item baseline")
    outputs = augment_catalog(vehicles, weapons, read_json(item_path), sources, base_report,
                              factual["facts"], factual["weapons_facts"], factual["weapons_provenance"])
    input_hashes = {**{name: digest(path) for name, path in paths.items()}, "baseline_items": digest(item_path),
                    **{p: digest(base_export / p) for p in base_paths}}
    outputs["web-augmentation-report.json"]["inputSha256"] = input_hashes
    outputs["web-augmentation-report.json"]["augmenterSha256"] = digest(__file__)
    files = [p for p in base_export.rglob("*") if p.is_file() or p.is_symlink()]
    if any(p.is_symlink() for p in base_export.rglob("*")) or sum(p.stat().st_size for p in files) > 128 * 1024 * 1024:
        raise ValueError("Expected a bounded regular public export tree")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".website-augmentation-", dir=output.parent) as temporary:
        staging = Path(temporary) / "export"
        shutil.copytree(base_export, staging)
        for relative, value in outputs.items():
            write_json(staging / relative, value)
        if output.exists():
            raise ValueError("Output appeared during augmentation")
        staging.rename(output)
    return outputs["web-augmentation-report.json"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-export", required=True, type=Path)
    parser.add_argument("--baseline-data", required=True, type=Path)
    parser.add_argument("--facts", required=True, type=Path)
    parser.add_argument("--weapons-facts", required=True, type=Path)
    parser.add_argument("--weapons-provenance", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    print(packed(build(args.base_export, args.baseline_data, args.facts, args.weapons_facts, args.weapons_provenance, args.output)))


if __name__ == "__main__":
    main()
