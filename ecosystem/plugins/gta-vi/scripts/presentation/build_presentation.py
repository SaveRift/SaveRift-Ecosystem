#!/usr/bin/env python3
"""Build factual presentation sidecars from pinned public source datasets.

Input JSON is read locally by default. --fetch explicitly fetches the four
previously reviewed public endpoints. Only factual scalars, identifiers,
relationships, media locators and original summaries enter the output.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

BASE = "https://negentropy.studio/"
LIMIT = 2 * 1024 * 1024
SCHEMA = "saverift.gta-vi.presentation.v1"
SOURCE_SPECS = {
    "vehiculos": {
        "version": "5c062fad5b", "sha256": "a556f3b769a36eb192093e0c9cdf4d3ea0fc3b651c1d9a5d7019a8cd8e54441c",
        "rows": 334, "category": "vehicles", "domain": "model", "page": "vehicles",
        "identityRef": "gtazone-vehicles-identifiers-2026-11-22",
    },
    "armas": {
        "version": "8a77b0ac6c", "sha256": "85933f5fb560162602f3948121cebc5788f72d0de1cb52c9ff0aa0b4664ecfdd",
        "rows": 163, "category": "weapons", "domain": "spec", "page": "weapons",
        "identityRef": "gtazone-weapons-identifiers-2026-11-22",
    },
    "bebidas-y-drogas": {
        "version": "af5c5b34b5", "sha256": "bb4971a95b3633c2b9db442cf729f1a791c3327e310b06b80ac73137dabac2df",
        "rows": 289, "category": "items", "domain": "item", "page": "drinks-and-drugs",
        "identityRef": "gtazone-items-identifiers-2026-11-22",
    },
    "piezas-caza": {
        "version": "71fefc3e88", "sha256": "aa82f30b3e16eb791bf3a60e30c7aadabd3c5f67770d9102c6e6d2dd66ce84e0",
        "rows": 619, "category": "items", "domain": "item", "page": "hunting-loot",
        "identityRef": "gtazone-hunting-item-identifiers-2026-11-22",
    },
}
LIST_FIELDS = {"armas": {"banderas"}, "bebidas-y-drogas": {"otrosModelos"}, "piezas-caza": {"estadoAnimal"}}
SCALAR_TYPES = {"number", "integer", "boolean", "enum", "id", "ref", "reflist", "range"}
MENU_TEN = {"uiVelocidad", "uiAceleracion", "uiManejoAsfalto", "uiManejoTodoterreno", "uiDurabilidad", "uiDano", "uiPrecision", "uiManejo", "uiAlcance"}


def source_ref(slug):
    return f"gtazone-{slug}-presentation-2026-11-22"


def source_url(slug):
    spec = SOURCE_SPECS[slug]
    return f"{BASE}assets/data/en/{slug}.{spec['version']}.json"


def decode_source(slug, body):
    spec = SOURCE_SPECS[slug]
    if len(body) > LIMIT or hashlib.sha256(body).hexdigest() != spec["sha256"]:
        raise ValueError(f"Source length/digest mismatch: {slug}")
    data = json.loads(body, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Non-finite JSON {value}")))
    if data.get("slug") != slug or len(data.get("e", [])) != spec["rows"]:
        raise ValueError(f"Source identity/row count mismatch: {slug}")
    if len({f["k"] for f in data["f"]}) != len(data["f"]):
        raise ValueError("Duplicate field keys")
    if len({r[0] for r in data["e"]}) != len(data["e"]):
        raise ValueError("Duplicate source record IDs")
    return data


def load_sources(input_dir=None, fetch=False):
    def one(slug):
        if fetch:
            url = source_url(slug)
            with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as response:
                if response.status != 200 or response.url != url:
                    raise ValueError(f"Unexpected source response: {slug}")
                body = response.read(LIMIT + 1)
        else:
            body = (Path(input_dir) / (slug + ".json")).read_bytes()
        return slug, decode_source(slug, body)
    with ThreadPoolExecutor(max_workers=3) as pool:
        return dict(pool.map(one, SOURCE_SPECS))


def pointer_escape(value):
    return str(value).replace("~", "~0").replace("/", "~1")


def safe_media_url(path):
    if not isinstance(path, str) or not path.startswith("/media/"):
        raise ValueError("Media locator must be an observed /media/ path")
    p = urlsplit(path)
    if p.scheme or p.netloc or p.query or p.fragment or ".." in p.path.split("/") or "\\" in path:
        raise ValueError("Unsafe media locator")
    if not re.search(r"\.(?:webp|png|jpe?g)$", p.path, re.I):
        raise ValueError("Unsupported image locator")
    return urljoin(BASE, path)


def image_descriptor(row, row_index, slug, role="source-row-image", relation_pointer=None):
    value = row[5] if len(row) > 5 else None
    if not value:
        return None
    if not isinstance(value, list) or len(value) not in (3, 5):
        raise ValueError("Unexpected image descriptor shape")
    full, width, height = value[:3]
    small, small_width = value[3:] if len(value) == 5 else (full, width)
    if not all(type(x) is int and 0 < x <= 16384 for x in (width, height, small_width)):
        raise ValueError("Unexpected image dimensions")
    result = {"url": safe_media_url(full), "thumbnailUrl": safe_media_url(small),
              "width": width, "height": height, "thumbnailWidth": small_width,
              "assetId": None, "role": role, "sourceRef": source_ref(slug),
              "sourcePointer": f"/e/{row_index}/5", "availability": "source-published-locator",
              "archiveMembershipVerified": False}
    if relation_pointer is not None:
        result["relationPointer"] = relation_pointer
    return result


def field_value(row, fields, key):
    index = fields.get(key)
    return row[4][index] if index is not None and index < len(row[4]) else None


def selected_row(slug, row, fields):
    if slug == "bebidas-y-drogas":
        return row[3] in ("Bebidas", "Drogas") and bool(re.fullmatch(r"0x[0-9A-Fa-f]{8}", row[2]))
    if slug == "piezas-caza":
        return field_value(row, fields, "tipoEntrada") == "Item"
    return True


def validate_value(field_type, value):
    if field_type in ("number", "integer"):
        return type(value) in (int, float) and math.isfinite(value) and (field_type != "integer" or value == int(value))
    if field_type == "boolean":
        return type(value) is bool
    if field_type in ("enum", "id", "ref"):
        return isinstance(value, str) and len(value) <= 512
    if field_type in ("reflist", "list"):
        return isinstance(value, list) and len(value) <= 500 and all(isinstance(v, str) and len(v) <= 512 for v in value)
    if field_type == "range":
        return isinstance(value, list) and len(value) == 2 and all(type(v) in (int, float) and math.isfinite(v) for v in value)
    return False


def unit_status(field):
    if not field.get("u"):
        return "not-specified"
    explanation = field.get("x", "").lower()
    return "source-assumed" if any(x in explanation for x in ("assumed", "inferred", "probably", "appears to")) else "source-stated"


def extract_facts(data, row, row_index):
    stats, properties = [], []
    for i, f in enumerate(data["f"]):
        if f["t"] not in SCALAR_TYPES and f["k"] not in LIST_FIELDS.get(data["slug"], set()):
            continue
        value = row[4][i] if i < len(row[4]) else None
        if value is None:
            continue
        if not validate_value(f["t"], value):
            raise ValueError(f"Invalid value at /e/{row_index}/4/{i} ({f['k']})")
        item = {"key": f["k"], "label": f["l"], "value": value, "type": f["t"],
                "unit": f.get("u"), "unitStatus": unit_status(f), "sourceInterpreted": bool(f.get("i")),
                "valuePointer": f"/e/{row_index}/4/{i}", "descriptorPointer": f"/f/{i}"}
        if f["k"] in MENU_TEN:
            item.update(scaleMax=10, scaleBasis="source-described-menu-bar")
        if f.get("ds"):
            item["referenceDataset"] = f["ds"]
        translation = data.get("tr", {}).get(f["k"], {})
        if isinstance(value, str) and value in translation:
            item["displayValue"] = translation[value]
            item["displayValuePointer"] = f"/tr/{pointer_escape(f['k'])}/{pointer_escape(value)}"
        if f["t"] in ("number", "integer", "range"):
            stats.append(item)
        else:
            properties.append(item)
    return stats, properties


def catalog_sources(catalog_dir):
    data = {}
    for category in ("vehicles", "weapons", "items"):
        document = json.loads((Path(catalog_dir) / "entities" / f"{category}.json").read_text(encoding="utf-8"))
        data[category] = document["entries"]
    ids = [e["id"] for rows in data.values() for e in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate catalog IDs")
    return data


def catalog_join_index(catalog, slug):
    spec = SOURCE_SPECS[slug]
    result = {}
    for row in catalog[spec["category"]]:
        domain = row.get("attributes", {}).get("reportedIdentifierMetadata", {}).get("referenceId", {}).get("domain")
        if slug == "armas" and domain != "spec":
            continue
        for cross in row.get("attributes", {}).get("crosswalk", []):
            if cross.get("sourceRef") != spec["identityRef"]:
                continue
            rid = cross["sourceRecordId"]
            prefix = f"gtazone:{slug}:"
            if rid.startswith(prefix):
                rid = rid[len(prefix):]
            result.setdefault(rid, {})[row["id"]] = row
    return {key: list(rows.values()) for key, rows in result.items()}


def display_fact(data, row, fields, key):
    value = field_value(row, fields, key)
    return data.get("tr", {}).get(key, {}).get(value, value) if isinstance(value, str) else value


def summary(data, row, fields):
    slug = data["slug"]
    category = data.get("ct", {}).get(row[3], row[3])
    used = []
    if slug == "vehiculos":
        brand = display_fact(data, row, fields, "marca")
        text = f"{brand + ' ' if brand else ''}{category.lower()}."
        if brand:
            used.append("marca")
        values = [(key, label) for key, label in (("uiVelocidad", "speed"), ("uiAceleracion", "acceleration")) if field_value(row, fields, key) is not None]
        if values:
            text += " Reported menu ratings: " + ", ".join(f"{label} {field_value(row, fields, key):g}/10" for key, label in values) + "."
            used.extend(key for key, _ in values)
    elif slug == "armas":
        brand, caliber, mode = (display_fact(data, row, fields, key) for key in ("marca", "calibre", "modoDisparo"))
        text = f"Weapon specification in the {category.lower()} category."
        parts = [("marca", "Brand", brand), ("calibre", "caliber", caliber), ("modoDisparo", "fire mode", mode)]
        parts = [(key, label, value) for key, label, value in parts if value is not None]
        if parts:
            text += " " + "; ".join(f"{label}: {value}" for _, label, value in parts) + "."
            used.extend(key for key, _, _ in parts)
    elif slug == "bebidas-y-drogas":
        text = "Drink item." if row[3] == "Bebidas" else "Drug item."
        for key, label in (("drunkValue", "drunkenness change"), ("drugValue", "drug intensity")):
            value = field_value(row, fields, key)
            if value is not None:
                text += f" Source-reported {label}: {value:g}; no unit is specified."
                used.append(key)
    else:
        quality = display_fact(data, row, fields, "calidad")
        animal = display_fact(data, row, fields, "grupoVisible")
        text = "Hunting loot item."
        if quality:
            text += f" Quality: {quality}."
            used.append("calidad")
        if animal:
            text += f" Associated animal group: {animal}."
            used.append("grupoVisible")
    return {"en": text, "kind": "generated-factual-summary", "factKeys": used, "categoryPointer": "/3"}


def models_and_media(data, row, row_index, fields):
    slug = data["slug"]
    models, media = [], []
    image = image_descriptor(row, row_index, slug)
    if image:
        if slug == "piezas-caza":
            image["role"] = "associated-animal-preview"
        media.append(image)
    if slug == "vehiculos":
        models.append({"role": "published-vehicle-model", "value": row[2],
                       "representation": "hex32" if re.fullmatch(r"0x[0-9A-Fa-f]{8}", row[2]) else "literal",
                       "sourcePointer": f"/e/{row_index}/2"})
    elif slug == "armas":
        value = field_value(row, fields, "modelo")
        if value:
            models.append({"role": "base-element-or-projectile-model", "value": value, "representation": "literal",
                           "sourcePointer": f"/e/{row_index}/4/{fields['modelo']}", "sourceInterpreted": True})
    elif slug == "piezas-caza":
        value = field_value(row, fields, "tablaPresa")
        if value:
            models.append({"role": "associated-animal-model", "value": value, "representation": "literal",
                           "sourcePointer": f"/e/{row_index}/4/{fields['tablaPresa']}"})
    elif slug == "bebidas-y-drogas":
        by_id = {r[0]: (i, r) for i, r in enumerate(data["e"])}
        for j, rid in enumerate(field_value(row, fields, "modelos") or []):
            relation = f"/e/{row_index}/4/{fields['modelos']}/{j}"
            if rid not in by_id:
                raise ValueError(f"Missing associated model: {rid}")
            model_index, model_row = by_id[rid]
            if model_row[3] not in ("Modelos de bebida", "Modelos de droga"):
                raise ValueError("Item/model domain crossing")
            value = model_row[2]
            models.append({"role": "associated-consumption-prop", "value": value,
                           "representation": "hex64" if re.fullmatch(r"0x[0-9A-Fa-f]{16}", value) else "literal",
                           "sourcePointer": f"/e/{model_index}/2", "relationPointer": relation,
                           "sourceRecordId": rid, "sourceInterpreted": True})
            preview = image_descriptor(model_row, model_index, slug, "associated-model-preview", relation)
            if preview:
                media.append(preview)
    return models, media


def build_sidecars(catalog, datasets):
    output = {category: {"schema": SCHEMA, "category": category, "entries": []} for category in catalog}
    source_records, dataset_reports = [], []
    for slug, data in datasets.items():
        spec = SOURCE_SPECS[slug]
        joins = catalog_join_index(catalog, slug)
        fields = {field["k"]: i for i, field in enumerate(data["f"])}
        counters = Counter()
        field_counts = Counter()
        for index, row in enumerate(data["e"]):
            if not selected_row(slug, row, fields):
                continue
            counters["sourceDomainRows"] += 1
            linked = joins.get(row[0], [])
            if not linked:
                counters["withoutCatalogJoin"] += 1
                continue
            counters["sourceRowsJoined"] += 1
            stats, properties = extract_facts(data, row, index)
            models, media = models_and_media(data, row, index, fields)
            for fact in stats + properties:
                field_counts[fact["key"]] += 1
            for entry in linked:
                if spec["domain"] != "model" and entry.get("nativeIds", {}).get("referenceId") != row[2]:
                    raise ValueError(f"Published identity changed: {entry['id']}")
                description = summary(data, row, fields)
                description["categoryPointer"] = f"/e/{index}/3"
                record = {"catalogId": entry["id"], "sourceRef": source_ref(slug), "sourceRecordId": row[0],
                          "sourceRowPointer": f"/e/{index}", "publishedIdentifier": row[2],
                          "claimStatus": "website-reported", "categoryLabel": data.get("ct", {}).get(row[3], row[3]),
                          "description": description, "price": None, "stats": stats, "properties": properties,
                          "models": models, "media": media, "related": [], "relatedSpecCatalogIds": []}
                output[spec["category"]]["entries"].append(record)
                counters["catalogRowsEnriched"] += 1
                counters["withStats"] += bool(stats)
                counters["withModelReferences"] += bool(models)
                counters["withImageLocators"] += bool(media)
                counters["stats"] += len(stats)
                counters["properties"] += len(properties)
        price_fields = [f["k"] for f in data["f"] if re.search(r"price|precio|purchase|cost|costo|sale|venta|sell|buy", f["k"] + " " + f["l"], re.I)]
        source_records.append({"id": source_ref(slug), "kind": "website-factual-presentation", "title": f"GTA.ZONE {spec['page']} factual presentation metadata",
                               "url": source_url(slug), "locator": source_url(slug), "revision": f"sha256:{spec['sha256']}",
                               "sha256": spec["sha256"], "sourceRows": spec["rows"], "sectionUrl": BASE + spec["page"] + "/",
                               "identitySourceRef": spec["identityRef"], "claimStatus": "website-reported",
                               "websiteClaimedPlatform": "Xbox Series", "websiteClaimedBuild": "1.0.2.1", "archiveBuildVerified": False,
                               "scope": "Factual values and media locators; no image/model bytes or source-authored descriptions",
                               "summaryKind": "SaveRift original deterministic factual summaries",
                               "priceStatus": "not-published-in-reviewed-dataset" if not price_fields else "requires-field-review",
                               "priceFieldsFound": price_fields,
                               "mediaUse": "Locator evidence only; runtime display requires a host-resolved assetId",
                               "saveMappingEstablished": False})
        dataset_reports.append({"dataset": slug, **counters, "populatedFields": dict(field_counts), "priceFields": price_fields})
    known_details = {entry["catalogId"] for doc in output.values() for entry in doc["entries"]}
    derived = Counter()
    for entry in catalog["weapons"]:
        domain = entry.get("attributes", {}).get("reportedIdentifierMetadata", {}).get("referenceId", {}).get("domain")
        if domain not in ("preset", "recipe"):
            continue
        relations = entry.get("attributes", {}).get("websiteReportedRelations", [])
        specs = sorted({r["relatedCatalogId"] for r in relations if r.get("relation") == "reportedForSpec"})
        if not specs or any(cid not in known_details for cid in specs):
            raise ValueError(f"Missing related spec presentation: {entry['id']}")
        records = [{"relation": "reportedForSpec", "catalogId": r["relatedCatalogId"], "sourcePointer": r["sourceLocation"]} for r in relations if r.get("relation") == "reportedForSpec"]
        output["weapons"]["entries"].append({"catalogId": entry["id"], "sourceRef": source_ref("armas"),
            "sourceRecordId": None, "sourceRowPointer": None, "publishedIdentifier": entry["nativeIds"]["referenceId"],
            "claimStatus": "website-reported", "categoryLabel": f"Weapon {domain}",
            "description": {"en": f"Weapon {domain} linked to {len(specs)} base specification{'s' if len(specs) != 1 else ''}. See the related specification for base-model metadata.", "kind": "generated-factual-summary", "factKeys": [], "basis": "reportedForSpec relations"},
            "price": None, "stats": [], "properties": [], "models": [], "media": [],
            "related": records, "relatedSpecCatalogIds": specs})
        derived[domain] += 1
    for doc in output.values():
        doc["entries"].sort(key=lambda row: row["catalogId"])
        if len({r["catalogId"] for r in doc["entries"]}) != len(doc["entries"]):
            raise ValueError("Ambiguous source presentations require explicit alternatives")
    report = {"schema": "saverift.gta-vi.presentation-report.v1", "datasets": dataset_reports, "derivedWeaponRelations": dict(derived),
              "categories": {category: {"entries": len(doc["entries"]), "direct": sum(r["sourceRowPointer"] is not None for r in doc["entries"]),
                                          "withStats": sum(bool(r["stats"]) for r in doc["entries"]),
                                          "withMedia": sum(bool(r["media"]) for r in doc["entries"]),
                                          "distinctImageUrls": len({m["url"] for r in doc["entries"] for m in r["media"]}),
                                          "withModelReferences": sum(bool(r["models"]) for r in doc["entries"]),
                                          "purchasePrices": sum(r["price"] is not None for r in doc["entries"])} for category, doc in output.items()}}
    for document in output.values():
        compact_fields(document)
    return output, {"schema": "saverift.gta-vi.presentation-sources.v1", "sources": source_records}, report


def compact_fields(document):
    """Store invariant descriptors once; reconstruct exact value pointers on read."""
    definitions = {}
    excluded = {"key", "value", "valuePointer", "displayValue", "displayValuePointer"}
    for record in document["entries"]:
        for collection in ("stats", "properties"):
            compact = []
            for field in record[collection]:
                descriptor = {key: value for key, value in field.items() if key not in excluded}
                descriptor["index"] = int(descriptor["descriptorPointer"].rsplit("/", 1)[1])
                existing = definitions.setdefault(record["sourceRef"], {}).setdefault(field["key"], descriptor)
                if existing != descriptor:
                    raise ValueError("Conflicting field descriptor")
                value = {"key": field["key"], "value": field["value"]}
                if "displayValue" in field:
                    value["displayValue"] = field["displayValue"]
                compact.append(value)
            record[collection] = compact
    document["fieldEncoding"] = "shared-descriptors-v1"
    document["fieldDefinitions"] = definitions


def expand_record(document, record):
    """Reference expansion for readers and independent synthetic verification."""
    expanded = {**record}
    for collection in ("stats", "properties"):
        expanded[collection] = []
        for value in record[collection]:
            descriptor = document["fieldDefinitions"][record["sourceRef"]][value["key"]]
            field = {**descriptor, **value, "valuePointer": record["sourceRowPointer"] + "/4/" + str(descriptor["index"])}
            del field["index"]
            if "displayValue" in value:
                field["displayValuePointer"] = f"/tr/{pointer_escape(value['key'])}/{pointer_escape(value['value'])}"
            expanded[collection].append(field)
    return expanded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", required=True, type=Path)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--input-dir", type=Path)
    group.add_argument("--fetch", action="store_true")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Refusing to overwrite an existing presentation output")
    catalog = catalog_sources(args.catalog)
    output, sources, report = build_sidecars(catalog, load_sources(args.input_dir, args.fetch))
    report["producer"] = {"name": "build_presentation.py", "sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    report["catalogInputs"] = {category: hashlib.sha256((args.catalog / "entities" / f"{category}.json").read_bytes()).hexdigest() for category in catalog}
    report["sourceInputs"] = {slug: spec["sha256"] for slug, spec in SOURCE_SPECS.items()}
    args.output.mkdir(parents=True)
    for category, document in output.items():
        path = args.output / (category + ".json")
        path.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
        report["categories"][category]["bytes"] = path.stat().st_size
        report["categories"][category]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        report["categories"][category]["largestRecordBytes"] = max(len(json.dumps(r, ensure_ascii=False, separators=(",", ":")).encode()) for r in document["entries"])
        report["categories"][category]["largestExpandedRecordBytes"] = max(len(json.dumps(expand_record(document, r), ensure_ascii=False, separators=(",", ":")).encode()) for r in document["entries"])
    (args.output / "sources.json").write_text(json.dumps(sources, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (args.output / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"categories": report["categories"], "derivedWeaponRelations": report["derivedWeaponRelations"]}, indent=2))


if __name__ == "__main__":
    main()
