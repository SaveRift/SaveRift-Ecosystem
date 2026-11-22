#!/usr/bin/env python3
"""Add explicitly classified hunting Item references to frozen website v2.

The already-pinned facts contain only the retained Item leaves. Source counts
record excluded Sellable/missing-type leaves. No native proof is required to
include a source-backed candidate, and no observed identifier is manufactured.
"""
import argparse
from collections import Counter
from copy import deepcopy
import hashlib
from pathlib import Path
import tempfile

import augment_catalog_from_web as v1
import augment_catalog_from_web_v2 as v2

VERSION = "saverift-website-catalog-augmentation/3.0.0"
FROZEN_V2_SHA = "c80619aa644c5c2cf3a84258b1749cd167ab89eaf97afa8e0c7dd7e8060a8b0a"
HUNTING_PIN = {
    "id": "gtazone-hunting-item-identifiers-2026-11-22",
    "url": "https://negentropy.studio/assets/data/en/piezas-caza.71fefc3e88.json",
    "sha256": "aa82f30b3e16eb791bf3a60e30c7aadabd3c5f67770d9102c6e6d2dd66ce84e0",
    "section": "https://negentropy.studio/hunting-loot/",
    "page_sha256": "121ba3a59bbfa4604225f9e38fd9af8efcbc3d34fe5f069175ffdcbb1b30ec8c",
}


def check_foundation():
    v2.check_foundation()
    if v1.digest(v2.__file__) != FROZEN_V2_SHA:
        raise ValueError("Frozen v2 website augmenter changed")


def hunting_records(facts):
    sources = [s for s in facts["sources"] if s.get("url") == HUNTING_PIN["url"]]
    if len(sources) != 1:
        raise ValueError("Expected one pinned hunting source")
    source = sources[0]
    if source.get("sha256") != HUNTING_PIN["sha256"] or source.get("section_page_sha256") != HUNTING_PIN["page_sha256"]:
        raise ValueError("Hunting source pin changed")
    counts = source.get("leaf_type_counts", {})
    if (set(counts) != {"Item", "Sellable", "None"} or any(type(n) is not int or n < 0 for n in counts.values()) or
            sum(counts.values()) != source.get("rows_in_source") or
            source.get("excluded_records") != {"leaf_type:Sellable": counts["Sellable"], "leaf_type:None": counts["None"]}):
        raise ValueError("Hunting source leaf-type accounting is incomplete")
    records = []
    for record in facts["records"]:
        if record.get("claimed_domain") != "loot-item-leaf-id32" and record.get("source_id") != source["source_id"]:
            continue
        identifier = record.get("published_identifier")
        if (record.get("source_id") != source["source_id"] or record.get("claimed_domain") != "loot-item-leaf-id32" or
                record.get("namespace") != "GTA.ZONE:piezas-caza:published-internal-name" or
                record.get("claim_status") != "website-claim" or record.get("game_definition_independently_verified") is not False or
                record.get("save_mapping_verified") is not False or not isinstance(identifier, str) or
                not v1.HASH32.fullmatch(identifier) or int(identifier, 16) == 0 or record.get("published_identifier_format") != "hex32" or
                not all(v1.nonempty(record.get(k)) for k in ("record_key", "site_record_id", "label"))):
            raise ValueError("Hunting candidate is not an attributed complete Item reference")
        pointer = record.get("published_identifier_pointer", "")
        row = pointer.removesuffix("/2")
        leaf_types = [f for f in record.get("retained_fields", []) if f.get("field_key") == "tipoEntrada"]
        if (pointer != row + "/2" or record.get("label_pointer") != row + "/1" or len(leaf_types) != 1 or
                leaf_types[0].get("value") != "Item" or leaf_types[0].get("descriptor_pointer") != "/f/22" or
                leaf_types[0].get("value_pointer") != row + "/4/22"):
            raise ValueError("Hunting Item discriminator or exact source location is invalid")
        v1.location(HUNTING_PIN, pointer, record["label_pointer"])
        v1.safe_url(record["detail_url"], HUNTING_PIN["section"])
        records.append(record)
    if len(records) != counts["Item"] or len(records) != source.get("retained_records"):
        raise ValueError("Retained hunting Item count differs from the pinned source summary")
    if len({r["record_key"] for r in records}) != len(records):
        raise ValueError("Duplicate hunting website record identity")
    return records, source, counts


def hunting_entry(record):
    identifier = record["published_identifier"]
    suffix = hashlib.sha256(record["record_key"].encode("utf-8")).hexdigest()[:24]
    namespace = "website-reported:GTA.ZONE:item"
    leaf_pointer = record["published_identifier_pointer"].removesuffix("/2") + "/4/22"
    identifier_location = v1.location(HUNTING_PIN, record["published_identifier_pointer"], record["label_pointer"])
    leaf_location = v1.location(HUNTING_PIN, leaf_pointer)
    return {"id": "gta-vi:items:website-gtazone-hunting-item-" + suffix, "name": {"en": record["label"]},
        "nativeIds": {"referenceId": identifier, "referenceNamespace": namespace}, "confidence": "candidate",
        "applicability": {"platforms": ["xbox"], "build": None},
        "attributes": {"recordRole": "website_reported_identifier", "editorReady": False, "saveMapping": "unvalidated",
            "runtimeAvailability": "unverified", "websiteIdentityVerified": False,
            "websiteClaimedBuild": "1.0.2.1", "websiteClaimedBuildScope": "website-claim", "websiteClaimedPlatform": "Xbox Series",
            "reportedItemSubtype": "hunting-carcass-loot-item", "reportedSourceNamespace": "GTA.ZONE:piezas-caza:loot-entry-item",
            "reportedIdentifierMetadata": {"referenceId": {"domain": "item", "representation": "hex", "bitWidth": 32, "confidence": "candidate"}},
            "websiteReportedLeafType": {"value": "Item", "sourceRef": HUNTING_PIN["id"], "sourceLocation": leaf_pointer,
                "descriptorLocation": "/f/22", "reportedOriginalField": "Entries/Type", "confidence": "candidate"},
            "crosswalk": [{"kind": "website-native-id", "nativeIdKey": "referenceId", "comparedText": identifier,
                "matchMethod": "literal_exact", "label": record["label"], "namespace": namespace, "sourceRef": HUNTING_PIN["id"],
                "sourceRecordId": record["record_key"], "location": identifier_location, "url": record["detail_url"], "confidence": "candidate"}]},
        "evidence": [{"sourceRef": HUNTING_PIN["id"], "location": identifier_location,
            "method": "Website-reported hunting loot-item identifier and label; inventory definition and save meaning unvalidated"},
            {"sourceRef": HUNTING_PIN["id"], "location": leaf_location,
             "method": "Website leaf discriminator Entries/Type is Item; Sellable and missing-type records excluded"}]}


def expand_outputs(outputs, facts):
    outputs = deepcopy(outputs)
    records, source, counts = hunting_records(facts)
    sources = outputs["sources.json"]["sources"]
    if any(s["id"] == HUNTING_PIN["id"] for s in sources):
        raise ValueError("Hunting source augmentation is already present")
    items = outputs["entities/items.json"]["entries"]
    existing_ids = {e["id"] for e in items}
    existing_reported_values = {int(e["nativeIds"]["referenceId"], 16) for e in items
        if e.get("nativeIds", {}).get("referenceNamespace") == "website-reported:GTA.ZONE:item"
        and v1.HASH32.fullmatch(e["nativeIds"].get("referenceId", ""))}
    for record in records:
        entry = hunting_entry(record)
        if entry["id"] in existing_ids:
            raise ValueError("Hunting identity would replace an existing item row")
        existing_ids.add(entry["id"])
        items.append(entry)  # Numeric equality with a drink claim never merges source identities.
    sources.append({"id": HUNTING_PIN["id"], "kind": "public-website-factual-identifiers",
        "title": "GTA.ZONE hunting carcass Item-leaf identifier claims", "locator": HUNTING_PIN["section"],
        "revision": "JSON SHA-256 " + HUNTING_PIN["sha256"],
        "license": "No explicit dataset reuse license established; factual identifiers and source references only.",
        "attribution": "GTA.ZONE; website loot-item claims remain separate from native observations.",
        "allowedUse": "Attributed factual identifiers, labels and Item leaf classification; excludes prose, artwork, models and payloads.",
        "provenance": {"dataUrl": HUNTING_PIN["url"], "dataSha256": HUNTING_PIN["sha256"], "dataBytes": str(source["bytes"]),
            "pageUrl": HUNTING_PIN["section"], "pageSha256": HUNTING_PIN["page_sha256"],
            "dataLastModified": source.get("last_modified"), "gameBuild": None, "identityVerified": False,
            "sourceClaimsOnly": True, "saveMappingEstablished": False,
            "websiteBuildClaim": {"platform": "Xbox Series", "build": "1.0.2.1", "scope": "website-claim",
                "sourceUrl": facts["source_claims"]["source_url"], "sourceSha256": facts["source_claims"]["source_html_sha256"],
                "independentlyVerified": False, "appliesToSaveRiftArchiveBuild": False},
            "includedLeafType": "Item", "originalDiscriminatorField": "Entries/Type",
            "discriminatorDescriptorLocation": "/f/22", "excludedLeafTypes": {"Sellable": counts["Sellable"], "missing": counts["None"]}}})
    summary = outputs["web-augmentation-report.json"]
    previous_item_count = summary["addedItemClaims"]
    summary.update(schema="saverift.gta-vi.website-augmentation-report.v3", augmenter=VERSION,
        foundationV2Augmenter={"version": v2.VERSION, "sha256": FROZEN_V2_SHA},
        addedDrinkDrugItemClaims=previous_item_count, addedHuntingItemClaims=len(records),
        addedItemClaims=previous_item_count + len(records),
        huntingLeafTypeCounts=dict(counts), excludedHuntingLeafTypes={"Sellable": counts["Sellable"], "missing": counts["None"]},
        itemSubtypeCounts={"drink-or-drug": previous_item_count, "hunting-carcass-loot-item": len(records)},
        sharedNumericItemValuesAcrossWebsiteSources=len(existing_reported_values & {int(r["published_identifier"], 16) for r in records}),
        crossSourceItemClaimsMerged=0)
    summary["itemCategoryCounts"] = dict(Counter(summary["itemCategoryCounts"]) + Counter(r["site_category"] for r in records))
    summary["newSources"] += 1
    summary["publishedSourcePins"]["huntingItems"] = {"url": HUNTING_PIN["url"], "sha256": HUNTING_PIN["sha256"]}
    outputs["crosswalk-report.json"]["websiteAugmentation"] = summary
    outputs["crosswalk-report.json"]["newSources"] += 1
    return outputs


def augment_catalog(vehicles, weapons, items, sources, base_report, facts, weapons_facts, weapons_provenance):
    check_foundation()
    outputs = v2.augment_catalog(vehicles, weapons, items, sources, base_report, facts, weapons_facts, weapons_provenance)
    return expand_outputs(outputs, facts)


def build(base_export, baseline_data, facts_path, weapons_facts_path, weapons_provenance_path, output):
    check_foundation()
    base_export, output = Path(base_export), Path(output)
    if output.exists() or output.resolve().is_relative_to(base_export.resolve()):
        raise ValueError("Choose a fresh output outside the input export")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".website-augmentation-v3-", dir=output.parent) as temporary:
        staging = Path(temporary) / "export"
        v2.build(base_export, baseline_data, facts_path, weapons_facts_path, weapons_provenance_path, staging)
        outputs = {name: v1.read_json(staging / name) for name in ("entities/vehicles.json", "entities/weapons.json",
            "entities/items.json", "sources.json", "crosswalk-report.json", "web-augmentation-report.json")}
        outputs = expand_outputs(outputs, v1.read_json(facts_path, v1.INPUT_PINS["facts"]))
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
