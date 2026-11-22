#!/usr/bin/env python3
"""Compare website tokens to direct Name/u32 fields in the actual PSIN range."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time

import probe_weapon_psin_tokens as prior

native = prior.native
VERSION = "saverift-weapon-psin-name-probe/0.2.0"
PRIOR_SHA = "ed8a89c489c69d4597427a9fa4885b58f1288387890d2c55e271140b6cd9c98b"
NAME_HASH = "acec22be"
require = prior.require


def probe(args):
    database, master, facts, output = [Path(x).resolve() for x in (args.database, args.original_master, args.facts, args.output)]
    require(not output.exists(), "fresh_output_required")
    require(database != master and not database.samefile(master), "original_master_cannot_be_probe_database")
    require(native.file_sha(Path(native.__file__)) == prior.EXTRACTOR_SHA and native.file_sha(Path(prior.__file__)) == PRIOR_SHA,
            "frozen_probe_helpers_changed")
    require(0 <= args.range_start <= args.range_end and prior.joaat("Name") == int(NAME_HASH, 16), "range_or_field_preimage_mismatch")
    lookup, token_counts, website = prior.load_pool(facts)
    native.no_active_journal(database)
    before, master_before = native.stat_signature(database), native.stat_signature(master)
    require(master_before["bytes"] <= 1024 * 1024 * 1024, "original_master_identity_byte_limit")
    db = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    db.execute("BEGIN")
    started = time.monotonic()
    deadline = started + args.max_seconds
    db.set_progress_handler(lambda: int(time.monotonic() >= deadline), 10000)
    counts, issues, groups, layouts = Counter(), Counter(), {}, {}
    locations, values, selected_docs, selected_payloads = {}, set(), set(), set()
    issues_sample = []
    stats = defaultdict(lambda: dict(tokens=set(), values=set(), docs=set(), payloads=set(), locations=set(), occurrences=0))
    status, stop_reason = "completed", None

    def check_time():
        if time.monotonic() >= deadline:
            raise native.BoundedStop("elapsed_time_limit")

    def issue(code, context):
        issues[code] += 1
        if len(issues_sample) < 32:
            issues_sample.append(dict(code=code, **context))

    try:
        meta = {r[0]: json.loads(r[1]) for r in db.execute("SELECT key,value_json FROM r2_metadata WHERE key IN ('baseline_summary','input_identity')")}
        baseline, identity = meta.get("baseline_summary", {}), meta.get("input_identity", {})
        require(baseline.get("original_tables_preserved") is True and baseline.get("master_unchanged") is True,
                "successful_preserved_baseline_required")
        require(master_before["bytes"] == identity.get("master_bytes") and native.file_sha(master) == identity.get("master_sha256"),
                "original_master_identity_mismatch")
        require(not db.execute("SELECT 1 FROM r2_decode_runs WHERE status NOT IN ('imported','imported_with_rejections') LIMIT 1").fetchone(),
                "decoder_import_incomplete")
        for raw in db.execute(native.SCHEMAS, ("psin", prior.ROOT_STRUCT)):
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
                if src["archive"] != args.archive or not args.range_start <= int(offset) <= args.range_end:
                    counts["excluded_outside_archive_or_inclusive_range"] += 1
                    continue
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                issue(str(exc), dict(documentId=root["document_id"], structure=prior.ROOT_STRUCT))
                continue
            counts["range_wrapper_documents"] += 1
            schemas = db.execute("""SELECT s.struct_hash,s.hash32,s.hash64,s.byte_size,s.expected_instances,s.emitted_instances,f.field_index
                FROM r2_decode_structs s JOIN r2_decode_fields f ON f.document_id=s.document_id AND f.struct_hash=s.struct_hash
                WHERE s.document_id=? AND f.field_hash=? AND f.field_type='4a' AND f.is_array_element=0
                ORDER BY s.struct_hash,f.field_index LIMIT ?""", (root["document_id"], NAME_HASH, args.max_schema_observations + 1)).fetchall()
            if not schemas:
                counts["range_wrapper_documents_without_name_u32"] += 1
            for raw_schema in schemas:
                check_time()
                counts["name_field_schema_observations"] += 1
                if counts["name_field_schema_observations"] > args.max_schema_observations:
                    raise native.BoundedStop("schema_observation_limit")
                schema = dict(raw_schema)
                struct_hash = schema["struct_hash"]
                context = dict(documentId=root["document_id"], structure=struct_hash, fieldIndex=schema["field_index"])
                try:
                    require(isinstance(struct_hash, str) and re.fullmatch("[0-9a-f]{16}", struct_hash) and
                            schema["hash64"] == struct_hash and schema["hash32"] == struct_hash[-8:], "full_structure_identity_required")
                    require(type(schema["byte_size"]) is int and 0 < schema["byte_size"] <= 1048576, "structure_size_limit")
                    fields = [dict(f) for f in db.execute("SELECT " + native.FIELD_COLUMNS +
                        " FROM r2_decode_fields WHERE document_id=? AND struct_hash=? ORDER BY field_index LIMIT 4097", (root["document_id"], struct_hash))]
                    require(len(fields) <= 4096, "schema_member_limit")
                    named = next(f for f in fields if f["field_index"] == schema["field_index"])
                    selector = {k: named[k] for k in ("field_index", "field_hash", "field_type", "field_subtype", "reference_index", "extra_hex")}
                    selector.update(struct_sizes=[schema["byte_size"]], encoding="u32")
                    field = native.schema_check(schema, fields, selector)
                except (ValueError, TypeError, StopIteration) as exc:
                    issue(str(exc) or "selected_name_field_missing", context)
                    continue
                selected_docs.add(root["document_id"])
                selected_payloads.add(src["source_sha256"])
                layout = dict(format="psin", struct_hash=struct_hash, hash32=schema["hash32"], hash64=schema["hash64"], byte_size=schema["byte_size"],
                              members=[{k: v for k, v in f.items() if k != "field_name"} for f in fields])
                layout_sha = native.digest(layout)
                layouts[layout_sha] = layout
                blocks = [dict(b) for b in db.execute("SELECT block_index,byte_offset,byte_size FROM r2_decode_blocks WHERE document_id=? AND struct_hash=? AND schema_known=1 LIMIT 4097", (root["document_id"], struct_hash))]
                if len(blocks) > 4096:
                    issue("schema_block_count_limit", context)
                    continue
                json_path = '$.' + json.dumps(field["field_name"])
                sql = """SELECT instance_index,byte_offset,length(object_json) AS chars,
                  CASE WHEN length(object_json)<=? THEN json_type(object_json,?) END AS value_type,
                  CASE WHEN length(object_json)<=? THEN json_extract(object_json,?) END AS value
                  FROM r2_decode_instances WHERE document_id=? AND struct_hash=? ORDER BY instance_index"""
                actual = 0
                for instance in db.execute(sql, (args.max_object_characters, json_path, args.max_object_characters, json_path, root["document_id"], struct_hash)):
                    check_time()
                    actual += 1
                    counts["selected_instance_field_opportunities"] += 1
                    if counts["selected_instance_field_opportunities"] > args.max_instances:
                        raise native.BoundedStop("instance_limit")
                    position, size = instance["byte_offset"], schema["byte_size"]
                    try:
                        require(instance["chars"] <= args.max_object_characters, "object_character_limit")
                        require(type(position) is int and any(b["byte_offset"] <= position and position + size <= b["byte_offset"] + b["byte_size"] and
                                (position - b["byte_offset"]) % size == 0 for b in blocks if type(b["byte_offset"]) is int), "instance_outside_schema_block")
                        scalar = native.representation(instance["value"], instance["value_type"], "u32")
                    except (ValueError, TypeError) as exc:
                        issue(str(exc), dict(context, instanceIndex=instance["instance_index"]))
                        continue
                    value = int(scalar["hex"], 16)
                    location = native.digest([src["content_key"], layout_sha, str(position), NAME_HASH, field["field_index"], field["byte_offset"]])
                    require(locations.setdefault(location, value) == value, "repeated_content_location_scalar_disagreement")
                    counts["valid_scalar_observations"] += 1
                    values.add(value)
                    if value == 0:
                        counts["zero_scalar_observations"] += 1
                        continue
                    matches = lookup.get(value, [])
                    if matches:
                        counts["matching_scalar_observations"] += 1
                    namespace = "psin:" + struct_hash + ":Name:field-index:" + str(field["field_index"])
                    witness = dict(sourceSha256=src["source_sha256"], decodedDocumentSha256=src["output_sha256"], contentKeySha256=src["content_key_sha256"],
                        documentId=root["document_id"], archive=args.archive, archiveOffset=offset, structHash=struct_hash,
                        structBytes=size, schemaLayoutSha256=layout_sha, field=field, instanceOffset=str(position),
                        instanceIndex=instance["instance_index"], contentLocationId=location, rawBytesReverified=False)
                    for candidate in matches:
                        key = struct_hash, layout_sha, field["field_index"], candidate["domain"], candidate["token"], candidate["method"], candidate["value"]
                        group = groups.setdefault(key, dict(candidate=candidate, namespace=namespace, count=0, docs=set(), payloads=set(), locations=set(), witness=witness))
                        group["count"] += 1
                        group["docs"].add(root["document_id"])
                        group["payloads"].add(src["source_sha256"])
                        group["locations"].add(location)
                        stats[candidate["domain"]]["tokens"].add(candidate["token"])
                    for domain in {m["domain"] for m in matches}:
                        stat = stats[domain]
                        stat["values"].add(value)
                        stat["docs"].add(root["document_id"])
                        stat["payloads"].add(src["source_sha256"])
                        stat["locations"].add(location)
                        stat["occurrences"] += 1
                if actual != schema["emitted_instances"]:
                    issue("stored_instance_count_mismatch", dict(context, actual=actual, recorded=schema["emitted_instances"]))
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
    matches = [dict(schema="saverift.gta-vi.psin-name-token-match.v2", **g["candidate"], nativeFieldNamespace=g["namespace"],
        nativeFieldMeaning="Name field; definition and save domain unknown", confidence="candidate",
        instanceObservations=g["count"], documentObservations=len(g["docs"]), distinctPayloads=len(g["payloads"]),
        distinctContentLocations=len(g["locations"]), witness=g["witness"], definitionIdentityVerified=False, saveMappingVerified=False)
        for _, g in sorted(groups.items())]
    raw_matches = ("".join(native.packed(r) + "\n" for r in matches)).encode()
    by_domain = {domain: dict(sourceTokens=number, matchedTokens=len(stats[domain]["tokens"]), matchedNativeValues=len(stats[domain]["values"]),
        matchingInstanceObservations=stats[domain]["occurrences"], matchingDocumentObservations=len(stats[domain]["docs"]),
        matchingDistinctPayloads=len(stats[domain]["payloads"]), matchingContentLocations=len(stats[domain]["locations"])) for domain, number in token_counts.items()}
    summary = dict(tool=VERSION, status=status, scopeComplete=status == "completed", stopReason=stop_reason,
        allSelectedScalarsValid=status == "completed" and not issues and bool(locations),
        scriptSha256=native.file_sha(Path(__file__)), helperSha256=prior.EXTRACTOR_SHA, tokenPoolHelperSha256=PRIOR_SHA,
        upstreamCommit=native.UPSTREAM, decoderWorkerSha256=native.WORKER, website=website,
        scope=dict(wrapperStructHash=prior.ROOT_STRUCT, selectedFieldHash=NAME_HASH, selectedFieldPreimage="Name", selectedFieldType="4a",
            owningStructures="All full64 structures in selected wrapper documents; no auxiliary-structure assumption",
            archive=args.archive, archiveOffsetUnit="decimal bytes", inclusiveRange=[args.range_start, args.range_end]),
        counts=dict(counts), selectedDocuments=len(selected_docs), distinctSourcePayloads=len(selected_payloads),
        distinctContentLocations=len(locations), distinctScalarValues=len(values), byDomain=by_domain, issues=dict(issues), issueExamples=issues_sample,
        matchingGroups=len(matches), matchingHashValuesWithDifferentHashInputs=sum(len({x["hashInputText"] for x in lookup[v]}) > 1 for v in values if v in lookup),
        layouts=layouts, databaseCheckpointUnchanged=unchanged, wholeDatabaseHashComputed=False,
        matches=dict(sha256=hashlib.sha256(raw_matches).hexdigest(), bytes=len(raw_matches), rows=len(matches)),
        limits={k: getattr(args, k) for k in ("max_seconds", "max_documents", "max_schema_observations", "max_instances", "max_object_characters", "max_output_bytes")},
        interpretation=["Every qualifying direct Name/u32 field instance is compared, subject to explicit bounds.",
            "Match groups retain full owning structure and schema descriptor; unrelated Name namespaces are not merged into a definition ID domain.",
            "Exact and lowercase website token comparisons remain separate candidates; numeric equality alone does not establish identity or save use.",
            "Source hashes are imported provenance. This database-only probe does not reread raw payload bytes or export object JSON."])
    raw_summary = (json.dumps(summary, indent=2, sort_keys=True) + "\n").encode()
    require(len(raw_matches) + len(raw_summary) <= args.max_output_bytes, "probe_output_byte_limit")
    output.mkdir(parents=True)
    (output / "matches.jsonl").write_bytes(raw_matches)
    (output / "summary.json").write_bytes(raw_summary)
    return summary


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("database", "original-master", "facts", "output"):
        p.add_argument("--" + name, type=Path, required=True)
    p.add_argument("--archive", default="packs.rpf")
    p.add_argument("--range-start", type=lambda s: int(s, 0), default=202600000)
    p.add_argument("--range-end", type=lambda s: int(s, 0), default=205700000)
    for name, default in (("seconds", 120), ("documents", 512), ("schema-observations", 8192),
                          ("instances", 500000), ("object-characters", 1048576), ("output-bytes", 16777216)):
        p.add_argument("--max-" + name, type=int, default=default)
    args = p.parse_args()
    require(all(v > 0 for k, v in vars(args).items() if k.startswith("max_")), "positive_limits_required")
    result = probe(args)
    print(native.packed({k: result[k] for k in ("tool", "status", "scopeComplete", "allSelectedScalarsValid", "counts", "byDomain", "issues")}))
    return 0 if result["status"] == "completed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
