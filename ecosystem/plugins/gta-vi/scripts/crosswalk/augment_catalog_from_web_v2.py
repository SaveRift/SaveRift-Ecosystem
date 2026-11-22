#!/usr/bin/env python3
"""Broaden the frozen website augmentation without promoting source claims.

Retain unjoined vehicle identities as reported model candidates. Expose exact
named preset/recipe tokens as candidate rows, retaining every source occurrence
and its relationship to the source's spec. No network or native payload reads.
"""
import argparse
from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
from pathlib import Path
import tempfile

import augment_catalog_from_web as v1

VERSION = "saverift-website-catalog-augmentation/2.0.0"
FROZEN_V1_SHA = "7cf2c7cf11c5d463420e89cf71d3cd8e3ce926ff632eda9712f8c9170cc04e7e"


def check_foundation():
    if v1.digest(v1.__file__) != FROZEN_V1_SHA:
        raise ValueError("Frozen v1 website augmenter changed")


def candidate_entry(category, domain, identifier, label, identity_key):
    if domain not in ("model", "preset", "recipe") or not v1.nonempty(identifier) or not v1.nonempty(label):
        raise ValueError("Expected an explicit reported model/preset/recipe identifier")
    is_hex = bool(v1.HASH32.fullmatch(identifier))
    if v1.HEX_LOOKING.fullmatch(identifier) and not is_hex or is_hex and domain != "model":
        raise ValueError("Named preset/recipe claims must be literals; model hex claims must be complete u32 values")
    suffix = hashlib.sha256(identity_key.encode("utf-8")).hexdigest()[:24]
    namespace = "website-reported:GTA.ZONE:" + domain
    attrs = {"recordRole": "website_reported_identifier", "editorReady": False, "runtimeAvailability": "unverified",
        "saveMapping": "unvalidated", "websiteIdentityVerified": False, "websiteClaimedBuild": "1.0.2.1",
        "websiteClaimedBuildScope": "website-claim", "websiteClaimedPlatform": "Xbox Series",
        "reportedIdentifierMetadata": {"referenceId": {"domain": domain, "representation": "hex" if is_hex else "literal",
            "bitWidth": 32 if is_hex else None, "confidence": "candidate"}}, "crosswalk": []}
    if not is_hex and identifier.isascii():
        attrs["hashCandidates"] = v1.hash_candidates(identifier, domain)
    return {"id": f"gta-vi:{category}:website-gtazone-{domain}-{suffix}", "name": {"en": label},
        "nativeIds": {"referenceId": identifier, "referenceNamespace": namespace}, "attributes": attrs,
        "confidence": "candidate", "applicability": {"platforms": ["xbox"], "build": None}, "evidence": []}


def add_occurrence(entry, pin, source_record_id, pointer, url, label_pointer=None):
    identifier = entry["nativeIds"]["referenceId"]
    evidence_location = v1.location(pin, pointer, label_pointer)
    entry["attributes"]["crosswalk"].append({"kind": "website-native-id", "nativeIdKey": "referenceId",
        "comparedText": identifier, "matchMethod": "literal_exact", "label": entry["name"]["en"],
        "namespace": entry["nativeIds"]["referenceNamespace"], "sourceRef": pin["id"],
        "sourceRecordId": source_record_id, "location": evidence_location,
        "url": v1.safe_url(url, pin["section"]), "confidence": "candidate"})
    entry["evidence"].append({"sourceRef": pin["id"], "location": evidence_location,
        "method": "Exact website-published identifier occurrence; source claim only; native definition and save meaning unvalidated"})


def expand_outputs(outputs, facts, weapons_facts, weapons_provenance):
    """Extend a completed v1 transformation in memory; never mutate caller inputs."""
    outputs = deepcopy(outputs)
    selected, _, _ = v1.select_facts(facts, weapons_facts, weapons_provenance)
    vehicles = outputs["entities/vehicles.json"]["entries"]
    weapons = outputs["entities/weapons.json"]["entries"]
    all_ids = {entry["id"] for category in ("vehicles", "weapons", "items")
               for entry in outputs[f"entities/{category}.json"]["entries"]}

    def append_entry(group, entry):
        if entry["id"] in all_ids:
            raise ValueError("New reported identity would replace an existing catalog row")
        all_ids.add(entry["id"])
        group.append(entry)

    vehicle_pin = v1.SOURCE_PINS["vehicles"]
    joined = {relation["sourceRecordId"] for entry in vehicles
              if entry.get("attributes", {}).get("recordRole") == "native_vehicle_model_reference"
              for relation in entry["attributes"].get("crosswalk", [])
              if relation.get("kind") == "website-label" and relation.get("sourceRef") == vehicle_pin["id"]}
    unjoined = [record for record in selected["vehicles"] if record["record_key"] not in joined]
    for record in unjoined:
        entry = candidate_entry("vehicles", "model", record["published_identifier"], record["label"], record["record_key"])
        entry["attributes"]["nameKind"] = "candidate-website-label"
        entry["attributes"]["nativeModelValueCorroborated"] = False
        add_occurrence(entry, vehicle_pin, record["record_key"], record["published_identifier_pointer"],
                       record["detail_url"], record["label_pointer"])
        append_entry(vehicles, entry)

    weapon_pin = v1.SOURCE_PINS["weapons"]
    spec_catalog_ids = {}
    for entry in weapons:
        if entry.get("nativeIds", {}).get("referenceNamespace") != "website-reported:GTA.ZONE:spec":
            continue
        for relation in entry.get("attributes", {}).get("crosswalk", []):
            if relation.get("kind") == "website-native-id" and relation.get("sourceRef") == weapon_pin["id"]:
                key = relation["sourceRecordId"]
                if key in spec_catalog_ids and spec_catalog_ids[key] != entry["id"]:
                    raise ValueError("Ambiguous parent spec catalog identity")
                spec_catalog_ids[key] = entry["id"]

    # Identity is the domain plus the exact literal token. Case variants stay distinct.
    occurrences = defaultdict(list)
    for spec in selected["weapons"]:
        for field_name, domain in (("namedPresets", "preset"), ("namedRecipes", "recipe")):
            field = spec["fields"].get(field_name)
            if field is None:
                continue
            if field.get("kind") != "reported-native-token-list" or not isinstance(field.get("value"), list):
                raise ValueError("Expected an explicit named preset/recipe token list")
            for index, token in enumerate(field["value"]):
                if not v1.nonempty(token) or v1.HEX_LOOKING.fullmatch(token):
                    raise ValueError("Named relation cannot substitute an unresolved numeric identifier")
                occurrences[(domain, token)].append({"spec": spec, "field_name": field_name,
                    "list_pointer": field["sourceLocation"], "pointer": field["sourceLocation"] + "/" + str(index)})
    relation_counts = Counter()
    for (domain, token), found in sorted(occurrences.items()):
        entry = candidate_entry("weapons", domain, token, token, domain + "\0" + token)
        attrs = entry["attributes"]
        attrs.update(nameKind="reported-native-token", websiteNameScope="literal-token",
                     websiteReportedRelations=[], sourceOccurrenceCount=len(found),
                     relatedSpecCount=len({occurrence["spec"]["sourceRecordId"] for occurrence in found}))
        for occurrence in found:
            spec, pointer = occurrence["spec"], occurrence["pointer"]
            add_occurrence(entry, weapon_pin, spec["sourceRecordId"], pointer, spec["url"])
            attrs["websiteReportedRelations"].append({"relation": "reportedForSpec", "domain": "spec",
                "value": spec["reportedIdentifier"], "relatedCatalogId": spec_catalog_ids[spec["sourceRecordId"]],
                "relatedSpecLabel": spec["label"], "sourceRef": weapon_pin["id"], "sourceRecordId": spec["sourceRecordId"],
                "sourceLocation": pointer, "sourceListLocation": occurrence["list_pointer"],
                "relatedSpecSourceLocation": spec["sourceLocation"] + "/2",
                "location": v1.location(weapon_pin, pointer), "confidence": "candidate", "identityVerified": False})
            relation_counts[domain] += 1
        append_entry(weapons, entry)

    summary = outputs["web-augmentation-report.json"]
    summary.update(schema="saverift.gta-vi.website-augmentation-report.v2", augmenter=VERSION,
        foundationAugmenter={"version": v1.VERSION, "sha256": FROZEN_V1_SHA},
        addedReportedModelClaims=len(unjoined),
        addedWeaponPresetClaims=sum(domain == "preset" for domain, _ in occurrences),
        addedWeaponRecipeClaims=sum(domain == "recipe" for domain, _ in occurrences),
        namedWeaponRelationOccurrencesByDomain=dict(relation_counts),
        retainedVehicleWebsiteIdentities=len(selected["vehicles"]),
        nativeProofRequiredForWebsiteClaimInclusion=False)
    summary["addedWeaponClaimsTotal"] = summary["addedWeaponSpecClaims"] + summary["addedWeaponPresetClaims"] + summary["addedWeaponRecipeClaims"]
    summary["vehicleCoverage"]["reportedModelCandidatesForUnjoinedRecords"] = len(unjoined)
    summary["vehicleCoverage"]["websiteIdentitiesRetained"] = len(joined) + len(unjoined)
    if summary["vehicleCoverage"]["websiteIdentitiesRetained"] != len(selected["vehicles"]):
        raise ValueError("Vehicle website identity coverage does not balance")
    outputs["crosswalk-report.json"]["websiteAugmentation"] = summary
    return outputs


def augment_catalog(vehicles, weapons, items, sources, base_report, facts, weapons_facts, weapons_provenance):
    check_foundation()
    outputs = v1.augment_catalog(vehicles, weapons, items, sources, base_report, facts, weapons_facts, weapons_provenance)
    return expand_outputs(outputs, facts, weapons_facts, weapons_provenance)


def build(base_export, baseline_data, facts_path, weapons_facts_path, weapons_provenance_path, output):
    check_foundation()
    base_export, output = Path(base_export), Path(output)
    if output.exists() or output.resolve().is_relative_to(base_export.resolve()):
        raise ValueError("Choose a fresh output outside the input export")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".website-augmentation-v2-", dir=output.parent) as temporary:
        staging = Path(temporary) / "export"
        v1.build(base_export, baseline_data, facts_path, weapons_facts_path, weapons_provenance_path, staging)
        outputs = {name: v1.read_json(staging / name) for name in ("entities/vehicles.json", "entities/weapons.json",
            "entities/items.json", "sources.json", "crosswalk-report.json", "web-augmentation-report.json")}
        facts = v1.read_json(facts_path, v1.INPUT_PINS["facts"])
        weapons_facts = v1.read_json(weapons_facts_path, v1.INPUT_PINS["weapons_facts"])
        weapons_provenance = v1.read_json(weapons_provenance_path, v1.INPUT_PINS["weapons_provenance"])
        outputs = expand_outputs(outputs, facts, weapons_facts, weapons_provenance)
        outputs["web-augmentation-report.json"]["augmenterSha256"] = v1.digest(__file__)
        outputs["crosswalk-report.json"]["websiteAugmentation"] = outputs["web-augmentation-report.json"]
        for name, data in outputs.items():
            v1.write_json(staging / name, data)
        if output.exists():
            raise ValueError("Output appeared during augmentation")
        staging.rename(output)
    return outputs["web-augmentation-report.json"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("base-export", "baseline-data", "facts", "weapons-facts", "weapons-provenance", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    print(v1.packed(build(args.base_export, args.baseline_data, args.facts, args.weapons_facts, args.weapons_provenance, args.output)))


if __name__ == "__main__":
    main()
