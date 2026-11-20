#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Export reviewed identifier observations from the maintainer-held catalogue.

This reads the small payload catalogue, never the master or original game files.
The pinned input is deliberate: another research snapshot requires a new review.
Only literal identifiers, research classifications and structural provenance are
exported. XML bodies, descendant field values and player observations are not.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sqlite3

VERSION = "1.0.0"
CATALOGUE_SHA256 = "2d5476d81779585fdacd2759b28df4dc52bb8f7576eedac0a760d936588880d2"
COMMON_SHA256 = "31dc6aa5394dd8cd3c83b90c9661f37325f22851cc6d5d7150e11041c7618ced"
ANALYSIS_SHA256 = "9ad5c115c8a95f3b4502457b09ff14ddafb8bfebfdc89370219b7dfa69a9e5d0"
ROLES = {
    "ped_loadout_configuration": ("items", "loadout configuration", 569),
    "mission_configuration": ("activities", "mission configuration", 145),
    "energy_configuration_map_entry": ("systems", "energy configuration key", 192),
    "health_singleton_configuration": ("systems", "health configuration", 1),
    "body_profile_configuration": ("systems", "body-profile configuration", 67),
    "vehicle_performance_map_entry": ("vehicles", "vehicle performance-map key", 285),
    "vehicle_base_ratings_and_estimates_entry": ("vehicles", "vehicle rating-map key", 252),
    "loadout_weapon_spec_reference": ("weapons", "WeaponSpec reference", 14),
    "loadout_weapon_preset_reference": ("weapons", "WeaponPreset reference", 447),
    "loadout_weapon_recipe_reference": ("weapons", "WeaponRecipe reference", 308),
}


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def hex_digest(value):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value), "Invalid source digest")
    return value


def text(value):
    require(isinstance(value, str) and 0 < len(value) <= 1024, "Invalid literal identifier or path")
    require(not any(ord(c) < 32 for c in value), "Control character in identifier or path")
    return value


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def observation_id(record):
    category = ROLES[record["subtype"]][0]
    namespace = record["game_definition_id_namespace"] or record["referenced_id_namespace"]
    literal = record["game_definition_id"] or record["referenced_id"]
    identity = ["rpf9-observation-v1", COMMON_SHA256, record["source_xml_sha256"],
                record["subtype"], namespace, literal, record["occurrence_path"]]
    return f"gta-vi:{category}:rpf9-observation-{hashlib.sha256(canonical(identity)).hexdigest()}"


def document_source(record, exporter_sha):
    xml_sha = hex_digest(record["source_xml_sha256"])
    root = record["occurrence_path"].split("/")[1].split("[")[0]
    extents = []
    require(record["source_extents"], "Missing source extents")
    for extent in record["source_extents"]:
        offset, length = extent["rpf_offset"], extent["packed_size"]
        require(type(offset) is int and type(length) is int and offset >= 0 and length > 0,
                "Invalid compressed-stream extent")
        require(offset + length <= 6642192, "Compressed-stream extent exceeds common.rpf")
        extents.append({"offset": str(offset), "packedBytes": str(length),
                        "packedSha256": hex_digest(extent["packed_sha256"]),
                        "decodedSha256": hex_digest(extent["decoded_sha256"])})
    require(record["source_document_kind"] in {"single_stream_xml", "candidate_xml_chain"},
            "Unsupported document recovery kind")
    return {
        "id": "saverift-rpf9-xml-" + xml_sha,
        "kind": "maintainer-research-summary",
        "title": f"Reviewed Xbox RPF9 {root} identifier observations",
        "locator": f"maintainer-held common.rpf; recovered XML sha256:{xml_sha}",
        "revision": "2026-11-20; payload-catalogue-sha256:" + CATALOGUE_SHA256,
        "license": "SaveRift original research metadata; no license to underlying game files or assets is granted",
        "attribution": "SaveRift research; identifiers observed in the owner-supplied Xbox file set",
        "allowedUse": "Reviewed factual identifiers, research classifications and structural provenance; no payloads, XML field trees, artwork or player state",
        "provenance": {
            "archive": "common.rpf", "archiveSha256": COMMON_SHA256,
            "archiveBytes": "6642192", "xmlSha256": xml_sha, "rootTag": root,
            "recoveryKind": record["source_document_kind"], "compressedStreams": extents,
            "analysisDatabaseSha256": ANALYSIS_SHA256, "catalogueDatabaseSha256": CATALOGUE_SHA256,
            "exporter": "scripts/export-reviewed-rpf9.py", "exporterVersion": VERSION,
            "exporterSha256": exporter_sha, "gameBuild": None,
            "originalDirectoryMembershipProven": False,
            "method": "Checksum-valid RFC1950 stream recovery; bounded candidate-page joining where needed; complete XML parse; reviewed literal-identifier selection",
        },
    }


def export(catalogue, output):
    require(not output.exists(), "Use a new output directory")
    require(digest(catalogue) == CATALOGUE_SHA256, "Catalogue differs from the reviewed snapshot")
    exporter_sha = digest(Path(__file__).resolve())
    db = sqlite3.connect(catalogue.resolve().as_uri() + "?mode=ro", uri=True)
    try:
        db.execute("PRAGMA query_only=ON")
        require(db.execute("PRAGMA quick_check").fetchone()[0] == "ok", "Catalogue integrity failure")
        rows = db.execute("SELECT record_json FROM rpfc_records ORDER BY catalogue_record_id").fetchmany(2281)
        require(len(rows) == 2280, "Unexpected reviewed record count")
        records = [json.loads(row[0]) for row in rows]
    finally:
        db.close()
    counts = Counter(r["subtype"] for r in records)
    require(dict(counts) == {key: value[2] for key, value in ROLES.items()}, "Reviewed role counts changed")
    ids = {r["catalogue_record_id"]: observation_id(r) for r in records}
    require(len(ids) == 2280 and len(set(ids.values())) == 2280, "Observation ID collision")
    groups, sources = {}, {}
    for r in records:
        require(r["source_archive"] == "common.rpf" and r["source_database_sha256"] == ANALYSIS_SHA256,
                "Unexpected archive/analysis source")
        require(r["player_save_value"] is None and r["editable"] is False
                and r["original_membership_proven"] is False, "Unreviewed player or validation claim")
        require(r["source_observation_coverage_complete"] is True, "Incomplete source observations")
        text(r["occurrence_path"])
        source = document_source(r, exporter_sha)
        previous = sources.setdefault(source["id"], source)
        require(previous == source, "Conflicting source-document provenance")
        category, qualifier, _ = ROLES[r["subtype"]]
        entry = {
            "id": ids[r["catalogue_record_id"]],
            "name": {"en": f"{text(r['label'])} — {qualifier}"},
            "attributes": {
                "recordRole": r["subtype"], "semanticRole": r["semantic_role"],
                "nameKind": "qualified-source-identifier" if r["game_definition_id"] or r["referenced_id"] else "qualified-XML-root-tag",
                "editorReady": False, "runtimeAvailability": "unverified",
                "saveMapping": "unvalidated", "originalArchiveMembershipProven": False,
                "sourceRecordId": hex_digest(r["catalogue_record_id"]),
            },
            "confidence": "observed", "applicability": {"platforms": ["xbox"], "build": None},
            "evidence": [{"sourceRef": source["id"],
                          "location": text(r["occurrence_path"]),
                          "method": "Literal " + text(r["identifier_field"] or "XML root") + " observation in the recovered XML document; gameplay role and save link unvalidated"}],
        }
        if r["game_definition_id"] is not None:
            require(r["referenced_id"] is None, "Definition/reference role conflict")
            entry["nativeIds"] = {"configurationId": text(r["game_definition_id"]),
                                  "configurationNamespace": text(r["game_definition_id_namespace"])}
        elif r["referenced_id"] is not None:
            require(r["game_definition_id_namespace"] is None and r["semantic_role"] == "unresolved_reference",
                    "Weapon reference promoted to a definition")
            entry["nativeIds"] = {"referenceId": text(r["referenced_id"]),
                                  "referenceNamespace": text(r["referenced_id_namespace"])}
        else:
            require(r["subtype"] == "health_singleton_configuration", "Unexpected unnamed record")
            entry["evidence"][0]["method"] = "Observed XML root structure; no native definition ID or player health link established"
        if r["parent_catalogue_record_id"] is not None:
            parent = ids.get(r["parent_catalogue_record_id"])
            require(parent and parent.startswith("gta-vi:items:"), "Unresolved parent loadout")
            entry["attributes"]["parentCatalogId"] = parent
        groups.setdefault(category, []).append(entry)
    require(len(sources) == 8, "Unexpected source-document count")
    require(digest(catalogue) == CATALOGUE_SHA256, "Source changed during export")
    output.mkdir(parents=True)
    (output / "entities").mkdir()
    files = []

    def write(relative, value):
        data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        (output / relative).write_bytes(data)
        files.append({"path": relative, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})

    for category, entries in sorted(groups.items()):
        write(f"entities/{category}.json", {"schema": "saverift.gta-vi.entities.v1", "category": category,
              "entries": sorted(entries, key=lambda e: e["id"])})
    write("sources.json", {"schema": "saverift.gta-vi.sources.v1", "sources": sorted(sources.values(), key=lambda s: s["id"])})
    manifest = {
        "schema": "saverift.gta-vi.reviewed-export.v1", "revision": "2026-11-20",
        "exporterVersion": VERSION, "exporterSha256": exporter_sha,
        "sourceCatalogueSha256": CATALOGUE_SHA256, "sourceCatalogueUnchanged": True,
        "sourceRecords": len(records), "sourceDocuments": len(sources),
        "categoryCounts": {k: len(v) for k, v in sorted(groups.items())},
        "recordRoleCounts": dict(sorted(counts.items())), "newSaveLinks": 0,
        "identity": "SHA-256 of compact UTF-8 JSON [rpf9-observation-v1, archive SHA-256, recovered XML SHA-256, record role, native namespace or null, exact native identifier or null, XML occurrence path]; source-observation identity, not cross-build entity identity",
        "scope": "Reviewed identifier observations only; no master database, original archives, payloads, full field trees or player data",
        "files": files,
    }
    (output / "export-manifest.json").write_bytes((json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogue", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(export(args.catalogue, args.out), indent=2))
