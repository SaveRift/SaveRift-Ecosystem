#!/usr/bin/env python3
"""Read-only token comparisons in an unknown PSIN scalar field; no promotion."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time

import extract_native_lookup as native

VERSION = "saverift-weapon-psin-token-probe/0.1.0"
EXTRACTOR_SHA = "7b3e568cab97e427f5e92b3223e86ad01fa1afcfc5925fc1cae84eaf71665402"
FACTS_SHA = "bccf556847a1417d2c21a00bcf26332528cadc0f88f46b2850d18c3d90eb2188"
DATA_SHA = "85933f5fb560162602f3948121cebc5788f72d0de1cb52c9ff0aa0b4664ecfdd"
ROOT_STRUCT = "51e5454170a06c31"
AUX_STRUCT = "07ddee5b0b8fb773"
FIELD_HASH = "7deba6f8"
NAMESPACE = "psin:" + AUX_STRUCT + ":field:" + FIELD_HASH
SELECTOR = dict(id="unknown-weapon-wrapper-scalar", category="weapons", namespace=NAMESPACE,
                role="unknown", format="psin", struct_hash=AUX_STRUCT, struct_sizes=[32],
                field_index=0, field_hash=FIELD_HASH, field_type="4a", field_subtype="00",
                reference_index=0, extra_hex="00000000", encoding="u32")
SCHEMAS = native.SCHEMAS.replace("WHERE d.format=? AND s.struct_hash=?", """WHERE d.format=? AND s.struct_hash=?
AND EXISTS (SELECT 1 FROM r2_decode_structs root WHERE root.document_id=d.document_id
 AND root.struct_hash='51e5454170a06c31' AND root.byte_size=56 AND root.emitted_instances=1)""")


def joaat(text):
    value = 0
    for char in text.encode("ascii"):
        value = (value + char) & 0xffffffff
        value = (value + (value << 10)) & 0xffffffff
        value ^= value >> 6
    value = (value + (value << 3)) & 0xffffffff
    value ^= value >> 11
    return (value + (value << 15)) & 0xffffffff


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def load_pool(path):
    before = native.stat_signature(path)
    require(before["bytes"] <= 2 * 1024 * 1024, "website_fact_byte_limit")
    raw = path.read_bytes()
    require(native.stat_signature(path) == before and hashlib.sha256(raw).hexdigest() == FACTS_SHA,
            "website_fact_pin_or_identity_mismatch")
    data = json.loads(raw)
    require(data.get("dataSha256") == DATA_SHA, "website_dataset_pin_mismatch")
    tokens = defaultdict(list)

    def add(domain, token, row, location):
        require(isinstance(token, str) and re.fullmatch(r"[A-Za-z0-9_]{1,256}", token), "non_literal_native_token")
        tokens[domain, token].append(dict(sourceRecordId=row["sourceRecordId"], jsonPointer=location))

    for row in data["records"]:
        if row.get("identifierKind") == "website-reported-spec-literal":
            add("WeaponSpec", row["reportedIdentifier"], row, row["sourceLocation"] + "/2")
        for key, domain, kind in (("namedPresets", "WeaponPreset", "reported-native-token-list"),
                                  ("namedRecipes", "WeaponRecipe", "reported-native-token-list"),
                                  ("weaponType", "WeaponType", "reported-native-token")):
            field = row.get("fields", {}).get(key)
            if field is None:
                continue
            require(field.get("kind") == kind, "website_field_kind_changed")
            values = field["value"] if isinstance(field["value"], list) else [field["value"]]
            for index, token in enumerate(values):
                location = field["sourceLocation"] + ("/" + str(index) if isinstance(field["value"], list) else "")
                add(domain, token, row, location)
    counts = Counter(domain for domain, _ in tokens)
    require(dict(counts) == {"WeaponSpec": 137, "WeaponPreset": 227, "WeaponRecipe": 176, "WeaponType": 112},
            "reviewed_token_pool_counts_changed")
    lookup = defaultdict(list)
    for (domain, token), witnesses in sorted(tokens.items()):
        for transform, text in (("exact", token), ("lowercase", token.lower())):
            candidate = dict(domain=domain, token=token, hashInputText=text, method="joaat32_" + transform,
                value=f"0x{joaat(text):08x}", websiteOccurrenceCount=len(witnesses), websiteWitnesses=witnesses[:4])
            lookup[joaat(text)].append(candidate)
    return lookup, dict(counts), dict(factsSha256=FACTS_SHA, datasetSha256=DATA_SHA,
                                     datasetUrl=data["dataUrl"], sourceUrl=data["sourceUrl"])


def probe(args):
    database, master, facts, output = [Path(x).resolve() for x in (args.database, args.original_master, args.facts, args.output)]
    require(not output.exists(), "fresh_output_required")
    require(database != master and not database.samefile(master), "original_master_cannot_be_probe_database")
    require(native.file_sha(Path(native.__file__)) == EXTRACTOR_SHA, "frozen_extractor_helpers_changed")
    require(0 <= args.range_start <= args.range_end, "invalid_inclusive_archive_range")
    lookup, token_counts, website = load_pool(facts)
    native.no_active_journal(database)
    before, master_before = native.stat_signature(database), native.stat_signature(master)
    require(master_before["bytes"] <= 1024 * 1024 * 1024, "original_master_identity_byte_limit")
    db = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    db.execute("BEGIN")
    started, deadline = time.monotonic(), time.monotonic() + args.max_seconds
    db.set_progress_handler(lambda: int(time.monotonic() >= deadline), 10000)
    counts, issues, groups = Counter(), Counter(), {}
    docs, payloads, layouts, locations, values = set(), set(), {}, {}, set()
    stats = defaultdict(lambda: dict(tokens=set(), values=set(), docs=set(), payloads=set(), locations=set(), occurrences=0))
    issues_sample, missing_auxiliary_examples = [], []
    status, stop_reason = "completed", None

    def issue(code, context):
        issues[code] += 1
        if len(issues_sample) < 32:
            issues_sample.append(dict(code=code, **context))

    def check_time():
        if time.monotonic() >= deadline:
            raise native.BoundedStop("elapsed_time_limit")

    try:
        meta = {r[0]: json.loads(r[1]) for r in db.execute("SELECT key,value_json FROM r2_metadata WHERE key IN ('baseline_summary','input_identity')")}
        baseline, identity = meta.get("baseline_summary", {}), meta.get("input_identity", {})
        require(baseline.get("original_tables_preserved") is True and baseline.get("master_unchanged") is True,
                "successful_preserved_baseline_required")
        require(master_before["bytes"] == identity.get("master_bytes") and native.file_sha(master) == identity.get("master_sha256"),
                "original_master_identity_mismatch")
        require(not db.execute("SELECT 1 FROM r2_decode_runs WHERE status NOT IN ('imported','imported_with_rejections') LIMIT 1").fetchone(),
                "decoder_import_incomplete")
        # Count the wrapper scope independently: not every wrapper has this auxiliary layout.
        for raw in db.execute(native.SCHEMAS, ("psin", ROOT_STRUCT)):
            check_time()
            root = dict(raw)
            counts["wrapper_structure_documents"] += 1
            if counts["wrapper_structure_documents"] > args.max_documents:
                raise native.BoundedStop("document_limit")
            try:
                src = native.source_identity(root)
                require(root["byte_size"] == 56 and root["emitted_instances"] == 1, "unreviewed_wrapper_geometry")
                offset = src["source_offset"]
                require(isinstance(offset, str) and offset.isdecimal(), "missing_archive_source_offset")
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                issue(str(exc), dict(documentId=root["document_id"], structure=ROOT_STRUCT))
                continue
            if src["archive"] != args.archive or not args.range_start <= int(offset) <= args.range_end:
                continue
            counts["range_wrapper_documents"] += 1
            auxiliary = db.execute("SELECT 1 FROM r2_decode_structs WHERE document_id=? AND struct_hash=? AND byte_size=32", (root["document_id"], AUX_STRUCT)).fetchone()
            if auxiliary:
                counts["range_wrapper_documents_with_auxiliary"] += 1
            else:
                counts["range_wrapper_documents_without_auxiliary"] += 1
                if len(missing_auxiliary_examples) < 8:
                    structs = [dict(r) for r in db.execute("SELECT struct_hash,byte_size,emitted_instances FROM r2_decode_structs WHERE document_id=? ORDER BY struct_hash LIMIT 17", (root["document_id"],))]
                    missing_auxiliary_examples.append(dict(documentId=root["document_id"], sourceSha256=src["source_sha256"], archiveOffset=offset,
                        structures=structs[:16], structuresTruncated=len(structs) > 16))
        for raw in db.execute(SCHEMAS, ("psin", AUX_STRUCT)):
            check_time()
            row = dict(raw)
            counts["wrapper_and_auxiliary_schema_documents"] += 1
            if counts["wrapper_and_auxiliary_schema_documents"] > args.max_documents:
                raise native.BoundedStop("document_limit")
            context = dict(documentId=row["document_id"], structure=AUX_STRUCT)
            try:
                src = native.source_identity(row)
                if src["archive"] != args.archive:
                    counts["excluded_other_archive"] += 1
                    continue
                offset = src["source_offset"]
                require(isinstance(offset, str) and offset.isdecimal(), "missing_archive_source_offset")
                if not args.range_start <= int(offset) <= args.range_end:
                    counts["excluded_outside_inclusive_range"] += 1
                    continue
                require(src["document_quality"].get("field_key_collision_count") == 0, "decoded_field_key_collision")
                fields = [dict(f) for f in db.execute("SELECT " + native.FIELD_COLUMNS +
                    " FROM r2_decode_fields WHERE document_id=? AND struct_hash=? ORDER BY field_index LIMIT 65", (row["document_id"], AUX_STRUCT))]
                require(len(fields) <= 64, "auxiliary_field_count_limit")
                field = native.schema_check(row, fields, SELECTOR)
                require(field["byte_offset"] == 8 and row["hash64"] == AUX_STRUCT and row["hash32"] == AUX_STRUCT[-8:], "field_offset_or_full_hash_mismatch")
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                issue(str(exc), context)
                continue
            docs.add(row["document_id"])
            payloads.add(src["source_sha256"])
            layout = dict(format="psin", struct_hash=AUX_STRUCT, hash32=row["hash32"], hash64=row["hash64"], byte_size=32,
                          members=[{k: v for k, v in f.items() if k != "field_name"} for f in fields])
            layout_sha = native.digest(layout)
            layouts[layout_sha] = layout
            blocks = [dict(b) for b in db.execute("SELECT block_index,byte_offset,byte_size FROM r2_decode_blocks WHERE document_id=? AND struct_hash=? AND schema_known=1", (row["document_id"], AUX_STRUCT))]
            path = '$.' + json.dumps(field["field_name"])
            sql = """SELECT instance_index,byte_offset,length(object_json) AS chars,
              CASE WHEN length(object_json)<=? THEN json_type(object_json,?) END AS value_type,
              CASE WHEN length(object_json)<=? THEN json_extract(object_json,?) END AS value
              FROM r2_decode_instances WHERE document_id=? AND struct_hash=? ORDER BY instance_index"""
            actual = 0
            for instance in db.execute(sql, (args.max_object_characters, path, args.max_object_characters, path, row["document_id"], AUX_STRUCT)):
                check_time()
                actual += 1
                counts["selected_instance_opportunities"] += 1
                if counts["selected_instance_opportunities"] > args.max_instances:
                    raise native.BoundedStop("instance_limit")
                position = instance["byte_offset"]
                try:
                    require(instance["chars"] <= args.max_object_characters, "object_character_limit")
                    require(type(position) is int and any(b["byte_offset"] <= position and position + 32 <= b["byte_offset"] + b["byte_size"] and
                            (position - b["byte_offset"]) % 32 == 0 for b in blocks if type(b["byte_offset"]) is int), "instance_outside_schema_block")
                    scalar = native.representation(instance["value"], instance["value_type"], "u32")
                except (ValueError, TypeError) as exc:
                    issue(str(exc), dict(context, instanceIndex=instance["instance_index"]))
                    continue
                value = int(scalar["hex"], 16)
                location = native.digest([src["content_key"], layout_sha, str(position), FIELD_HASH, 8])
                require(locations.setdefault(location, value) == value, "repeated_content_location_scalar_disagreement")
                counts["valid_scalar_observations"] += 1
                values.add(value)
                if value == 0:
                    counts["zero_scalar_observations"] += 1
                    continue
                matches = lookup.get(value, [])
                if matches:
                    counts["matching_scalar_observations"] += 1
                witness = dict(sourceSha256=src["source_sha256"], decodedDocumentSha256=src["output_sha256"],
                    contentKeySha256=src["content_key_sha256"], documentId=row["document_id"], archive=args.archive,
                    archiveOffset=offset, structHash=AUX_STRUCT, schemaLayoutSha256=layout_sha,
                    fieldHash=FIELD_HASH, fieldOffset=8, instanceOffset=str(position), instanceIndex=instance["instance_index"],
                    contentLocationId=location, rawBytesReverified=False)
                for candidate in matches:
                    key = candidate["domain"], candidate["token"], candidate["method"], candidate["value"]
                    group = groups.setdefault(key, dict(candidate=candidate, count=0, docs=set(), payloads=set(), locations=set(), witness=witness))
                    group["count"] += 1
                    group["docs"].add(row["document_id"])
                    group["payloads"].add(src["source_sha256"])
                    group["locations"].add(location)
                    stats[candidate["domain"]]["tokens"].add(candidate["token"])
                for domain in {m["domain"] for m in matches}:
                    stat = stats[domain]
                    stat["values"].add(value); stat["docs"].add(row["document_id"]); stat["payloads"].add(src["source_sha256"])
                    stat["locations"].add(location); stat["occurrences"] += 1
            if actual != row["emitted_instances"]:
                issue("stored_instance_count_mismatch", dict(context, actual=actual, recorded=row["emitted_instances"]))
    except native.BoundedStop as exc:
        status, stop_reason = "bounded_stop", str(exc)
    except sqlite3.OperationalError as exc:
        if time.monotonic() >= deadline and "interrupt" in str(exc):
            status, stop_reason = "bounded_stop", "elapsed_time_limit"
        else:
            raise
    finally:
        db.close()
    unchanged = native.stat_signature(database) == before and native.stat_signature(master) == master_before
    try:
        native.no_active_journal(database)
    except ValueError:
        unchanged = False
    if not unchanged:
        status, stop_reason = "failed", "input_changed_during_probe"
    rows = []
    for key, group in sorted(groups.items()):
        rows.append(dict(schema="saverift.gta-vi.unknown-psin-token-match.v1", **group["candidate"],
            nativeFieldNamespace=NAMESPACE, nativeFieldMeaning="unknown", confidence="candidate",
            instanceObservations=group["count"], documentObservations=len(group["docs"]), distinctPayloads=len(group["payloads"]),
            distinctContentLocations=len(group["locations"]), witness=group["witness"],
            definitionIdentityVerified=False, saveMappingVerified=False))
    raw_matches = ("".join(native.packed(r) + "\n" for r in rows)).encode()
    require(len(raw_matches) <= args.max_output_bytes, "match_output_byte_limit")
    by_domain = {domain: dict(sourceTokens=number, matchedTokens=len(stats[domain]["tokens"]),
        matchedNativeValues=len(stats[domain]["values"]), matchingInstanceObservations=stats[domain]["occurrences"],
        matchingDocumentObservations=len(stats[domain]["docs"]), matchingDistinctPayloads=len(stats[domain]["payloads"]),
        matchingContentLocations=len(stats[domain]["locations"])) for domain, number in token_counts.items()}
    summary = dict(tool=VERSION, status=status, scopeComplete=status == "completed", stopReason=stop_reason,
        scriptSha256=native.file_sha(Path(__file__)), helperSha256=EXTRACTOR_SHA, upstreamCommit=native.UPSTREAM, decoderWorkerSha256=native.WORKER,
        website=website, scope=dict(wrapperStructHash=ROOT_STRUCT, auxiliaryStructHash=AUX_STRUCT, fieldHash=FIELD_HASH,
            nativeFieldMeaning="unknown", archive=args.archive, archiveOffsetUnit="decimal bytes", inclusiveRange=[args.range_start, args.range_end]),
        counts=dict(counts), allSelectedScalarsValid=status == "completed" and not issues,
        selectedDocuments=len(docs), distinctSourcePayloads=len(payloads), distinctContentLocations=len(locations),
        distinctScalarValues=len(values), byDomain=by_domain, issues=dict(issues), issueExamples=issues_sample,
        wrapperDocumentsWithoutAuxiliaryExamples=missing_auxiliary_examples,
        matchingGroups=len(rows), matchingHashValuesWithDifferentHashInputs=sum(len({x["hashInputText"] for x in lookup[v]}) > 1 for v in values if v in lookup),
        layouts=layouts, databaseCheckpointUnchanged=unchanged, wholeDatabaseHashComputed=False,
        matches=dict(sha256=hashlib.sha256(raw_matches).hexdigest(), bytes=len(raw_matches), rows=len(rows)),
        limits={k: getattr(args, k) for k in ("max_seconds", "max_documents", "max_instances", "max_object_characters", "max_output_bytes")},
        interpretation=["All selected direct scalar instances are compared, subject to explicit bounds; this is not an instance sample.",
            "Website native tokens retain their original case and source field domains. Exact and lowercase hash comparisons are separate candidates.",
            "This unknown scalar field is not assumed to identify weapon definitions; numeric equality alone establishes neither semantics nor save use.",
            "Source payload hashes are imported provenance; this database-only probe does not reread raw payload bytes.",
            "The pinned decoder ignores subtype 05 for 0x4f, and type 0x63 has no semantic decoder; unrelated fields are not used in these joins."])
    output.mkdir(parents=True)
    (output / "matches.jsonl").write_bytes(raw_matches)
    (output / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return summary


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("database", "original-master", "facts", "output"):
        p.add_argument("--" + name, type=Path, required=True)
    p.add_argument("--archive", default="packs.rpf")
    p.add_argument("--range-start", type=lambda s: int(s, 0), default=202600000)
    p.add_argument("--range-end", type=lambda s: int(s, 0), default=205700000)
    p.add_argument("--max-seconds", type=int, default=120)
    p.add_argument("--max-documents", type=int, default=512)
    p.add_argument("--max-instances", type=int, default=500000)
    p.add_argument("--max-object-characters", type=int, default=65536)
    p.add_argument("--max-output-bytes", type=int, default=16777216)
    args = p.parse_args()
    require(all(getattr(args, k) > 0 for k in ("max_seconds", "max_documents", "max_instances", "max_object_characters", "max_output_bytes")), "positive_limits_required")
    result = probe(args)
    print(native.packed({k: result[k] for k in ("tool", "status", "scopeComplete", "counts", "byDomain", "issues")}))
    return 0 if result["status"] == "completed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
