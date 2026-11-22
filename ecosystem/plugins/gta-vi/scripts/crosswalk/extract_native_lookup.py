#!/usr/bin/env python3
"""Bounded, read-only identifier observations from the imported R2 metadata.

Only explicit schema/field selectors are accepted. This emits selected scalar
observations and provenance, never whole objects, assets, labels, or save links.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time

VERSION = "saverift-native-lookup-staging/0.1.0"
ADAPTER = "sixng-metadata-batch/0.1.0"
UPSTREAM = "5a5a9761663315cdf61cec8b219ae5b808e556ae"
WORKER = "f8c7c4c66be270c671a33289d52ef82be25ad769dd690cb84e8cced555979b1d"
HEX = re.compile(r"^[0-9a-fA-F]+$")
FIELD_COLUMNS = "field_index,field_hash,field_name,byte_offset,field_type,field_subtype,reference_index,extra_hex,is_array_element"
CURRENT = """WITH current AS MATERIALIZED (
 SELECT document_id,run_id,payload_id,source_sha256,line_number,
        json_extract(record_json,'$.worker_sha256') AS worker_sha256
 FROM r2_decode_latest WHERE status='decoded_research'
)
"""
SCHEMAS = CURRENT + """
SELECT d.document_id,d.run_id,d.payload_id,d.source_sha256,d.output_sha256,
 d.format,d.adapter,d.upstream_commit,c.worker_sha256,c.line_number,
 c.run_id AS attempt_run_id,c.payload_id AS attempt_payload_id,c.source_sha256 AS attempt_source_sha256,
 CASE WHEN length(d.source_json)<=131072 THEN d.source_json END AS source_json,
 CASE WHEN length(d.quality_json)<=131072 THEN d.quality_json END AS quality_json,
 s.struct_hash,s.hash32,s.hash64,s.byte_size,s.role,s.expected_instances,s.emitted_instances
FROM current c JOIN r2_decode_documents d USING(document_id)
JOIN r2_decode_structs s USING(document_id)
WHERE d.format=? AND s.struct_hash=?
ORDER BY d.document_id,s.struct_hash
"""


def packed(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(packed(value).encode("utf-8")).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def hex_text(value, digits):
    return isinstance(value, str) and len(value) == digits and HEX.fullmatch(value) is not None


def stat_signature(path):
    s = path.stat()
    return {"device": s.st_dev, "inode": s.st_ino, "bytes": s.st_size,
            "mtime_ns": s.st_mtime_ns, "ctime_ns": s.st_ctime_ns}


def no_active_journal(path):
    for suffix in ("-wal", "-journal"):
        p = Path(str(path) + suffix)
        if p.exists() and p.stat().st_size:
            raise ValueError("Input must be a stopped database checkpoint without nonempty WAL/journal")


def load_plan(path):
    with path.open("rb") as handle:
        raw = handle.read(262145)
    if len(raw) > 262144:
        raise ValueError("Selector plan exceeds 256 KiB")
    plan = json.loads(raw)
    if plan.get("schema") != "saverift.gta-vi.native-lookup-selectors.v1":
        raise ValueError("Unsupported selector plan")
    selectors = plan.get("selectors", [])
    if not isinstance(selectors, list) or not 1 <= len(selectors) <= 64:
        raise ValueError("Plan needs 1..64 explicit selectors")
    ids = set()
    for s in selectors:
        if not all(isinstance(s.get(k), str) and 0 < len(s[k]) <= 160 for k in ("id", "category", "namespace", "role")) or s["id"] in ids:
            raise ValueError("Invalid or duplicate selector identity/domain")
        ids.add(s["id"])
        if s.get("format") not in ("meta7a", "psin") or not (hex_text(s.get("struct_hash"), 8) or hex_text(s.get("struct_hash"), 16)):
            raise ValueError("Selector needs an exact full structure hash and format")
        if not hex_text(s.get("field_hash"), 8) or not hex_text(s.get("field_subtype"), 2) or not hex_text(s.get("extra_hex"), 8):
            raise ValueError("Invalid field descriptor hashes")
        if type(s.get("field_index")) is not int or s["field_index"] < 0 or type(s.get("reference_index")) is not int:
            raise ValueError("Invalid field descriptor indices")
        sizes = s.get("struct_sizes")
        if not isinstance(sizes, list) or not 1 <= len(sizes) <= 16 or any(type(n) is not int or not 0 < n <= 1048576 for n in sizes):
            raise ValueError("Explicit bounded structure sizes required")
        if (s.get("encoding"), s.get("field_type")) not in {("u32", "4a"), ("u32", "15"), ("hex64", "4d")}:
            raise ValueError("Only explicit u32/known hash64 scalar representations are supported")
    return plan, hashlib.sha256(raw).hexdigest()


class BoundedStop(Exception):
    pass


class Writer:
    def __init__(self, directory, max_bytes):
        self.handles = {name: (directory / name).open("x", encoding="utf-8", newline="\n")
                        for name in ("observations.jsonl", "schema-inventory.jsonl", "issues.jsonl")}
        self.bytes = 0
        self.max_bytes = max_bytes
        self.counts = Counter()

    def put(self, name, value):
        line = packed(value) + "\n"
        n = len(line.encode("utf-8"))
        if n > 1048576 or self.bytes + n > self.max_bytes:
            raise BoundedStop("staging_output_byte_limit")
        self.handles[name].write(line)
        self.bytes += n
        self.counts[name] += 1

    def close(self):
        for f in self.handles.values():
            f.close()


def representation(value, json_type, encoding):
    if encoding == "u32":
        if json_type != "integer" or type(value) is not int or not 0 <= value <= 0xFFFFFFFF:
            raise ValueError("expected_exact_unsigned_32bit_integer")
        return {"value_kind": "hash32", "width_bits": 32,
                "hex": f"{value:08x}", "decoded_value_text": str(value), "decoded_json_type": json_type,
                "zero_value": value == 0}
    if json_type != "text" or not hex_text(value, 16):
        raise ValueError("expected_full_16digit_hash64_string")
    return {"value_kind": "hash64", "width_bits": 64, "hex": value.lower(),
            "decoded_value_text": value, "decoded_json_type": json_type, "zero_value": int(value, 16) == 0}


def schema_check(row, fields, selector):
    if row["byte_size"] not in selector["struct_sizes"]:
        raise ValueError("unreviewed_structure_size")
    choices = [f for f in fields if f["field_index"] == selector["field_index"]]
    if len(choices) != 1:
        raise ValueError("selected_field_index_missing_or_duplicate")
    f = choices[0]
    for k in ("field_hash", "field_type", "field_subtype", "reference_index", "extra_hex"):
        if f[k] != selector[k]:
            raise ValueError("selected_field_descriptor_mismatch_" + k)
    if f["is_array_element"] or not isinstance(f["field_name"], str) or not re.fullmatch(r"[A-Za-z0-9_]+", f["field_name"]):
        raise ValueError("selected_field_not_direct_named_scalar")
    if sum(x["field_name"] == f["field_name"] for x in fields if not x["is_array_element"]) != 1:
        raise ValueError("decoded_field_key_collision")
    width = 4 if selector["encoding"] == "u32" else 8
    offset = f["byte_offset"]
    if type(offset) is not int or offset < 0 or offset + width > row["byte_size"]:
        raise ValueError("selected_field_outside_structure")
    if any(not x["is_array_element"] and x["field_index"] != f["field_index"] and
           offset <= x["byte_offset"] < offset + width for x in fields):
        raise ValueError("selected_field_overlaps_named_boundary")
    return f


def source_identity(row):
    if (row["run_id"], row["payload_id"], row["source_sha256"]) != (row["attempt_run_id"], row["attempt_payload_id"], row["attempt_source_sha256"]):
        raise ValueError("latest_attempt_document_identity_mismatch")
    if row["adapter"] != ADAPTER or row["upstream_commit"] != UPSTREAM or row["worker_sha256"] != WORKER:
        raise ValueError("unreviewed_decoder_pin")
    if not hex_text(row["source_sha256"], 64) or not hex_text(row["output_sha256"], 64):
        raise ValueError("invalid_document_content_hash")
    source = json.loads(row["source_json"] or "null")
    if not isinstance(source, dict) or source.get("payload_id") != row["payload_id"] or source.get("sha256") != row["source_sha256"]:
        raise ValueError("source_identity_mismatch_or_bounded_source_json")
    gfx = source.get("gfx_sha256") or ""
    base = source.get("gfx_base") or 0
    if gfx and not hex_text(gfx, 64):
        raise ValueError("invalid_graphics_identity")
    if type(base) is not int or base < 0:
        raise ValueError("invalid_graphics_base")
    quality = json.loads(row["quality_json"] or "null")
    if not isinstance(quality, dict):
        raise ValueError("missing_or_bounded_quality_metadata")
    content = {"format": row["format"], "source_sha256": row["source_sha256"],
               "gfx_sha256": gfx, "gfx_base": str(base), "adapter": ADAPTER,
               "upstream_commit": UPSTREAM, "worker_sha256": WORKER}
    provenance = {k: row[k] for k in ("document_id", "run_id", "payload_id", "source_sha256", "output_sha256", "line_number")}
    provenance.update(content_key=content, content_key_sha256=digest(content),
                      archive=source.get("archive"), source_offset=str(source["offset"]) if source.get("offset") is not None else None,
                      source_bytes=source.get("bytes"), graphics_bytes=source.get("gfx_bytes"),
                      document_quality={k: quality.get(k) for k in ("unavailable_blocks", "missing_instance_count", "field_key_collision_count")})
    return provenance


def extract(args):
    database, master, output, plan_path = [Path(p).resolve() for p in (args.database, args.original_master, args.output, args.selectors)]
    if database == master or database.samefile(master):
        raise ValueError("Original master cannot be the extraction input")
    if output.exists():
        raise FileExistsError("Choose a fresh staging output directory")
    no_active_journal(database)
    before, master_before = stat_signature(database), stat_signature(master)
    plan, plan_sha = load_plan(plan_path)
    db = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    db.execute("BEGIN")
    meta = {r[0]: json.loads(r[1]) for r in db.execute("SELECT key,value_json FROM r2_metadata WHERE key IN ('baseline_summary','input_identity')")}
    baseline, identity = meta.get("baseline_summary", {}), meta.get("input_identity", {})
    if not baseline.get("original_tables_preserved") or not baseline.get("master_unchanged"):
        db.close()
        raise ValueError("Successful preserved baseline required")
    if master_before["bytes"] != identity.get("master_bytes") or file_sha(master) != identity.get("master_sha256"):
        db.close()
        raise ValueError("Original master differs from baseline identity")
    bad_runs = list(db.execute("SELECT run_id,status FROM r2_decode_runs WHERE status NOT IN ('imported','imported_with_rejections')"))
    if bad_runs:
        db.close()
        raise ValueError("A decoder import is not completed")
    output.mkdir(parents=True)
    writer = Writer(output, args.max_output_bytes)
    started, deadline = time.monotonic(), time.monotonic() + args.max_seconds
    db.set_progress_handler(lambda: int(time.monotonic() >= deadline), 10000)
    counts, issue_counts = Counter(), Counter()
    selector_counts = {s["id"]: Counter() for s in plan["selectors"]}
    docs, locations, domain_values, low32 = set(), {}, defaultdict(set), defaultdict(set)
    schema_seen, content_conflicts = set(), set()
    status, stop_reason = "completed", None

    def check_time():
        if time.monotonic() >= deadline:
            raise BoundedStop("elapsed_time_limit")

    def issue(code, context):
        issue_counts[code] += 1
        writer.put("issues.jsonl", {"code": code, **context})

    try:
        for selector in plan["selectors"]:
            for raw in db.execute(SCHEMAS, (selector["format"], selector["struct_hash"])):
                check_time()
                counts["selected_schema_observations"] += 1
                selector_counts[selector["id"]]["matching_schemas"] += 1
                if counts["selected_schema_observations"] > args.max_schema_observations:
                    raise BoundedStop("schema_observation_limit")
                row = dict(raw)
                context = {"selector_id": selector["id"], "document_id": row["document_id"], "struct_hash": row["struct_hash"]}
                fields = [dict(f) for f in db.execute("SELECT " + FIELD_COLUMNS + " FROM r2_decode_fields WHERE document_id=? AND struct_hash=? ORDER BY field_index LIMIT 4097", (row["document_id"], row["struct_hash"]))]
                if len(fields) > 4096:
                    issue("schema_member_limit", context)
                    continue
                try:
                    provenance = source_identity(row)
                    field = schema_check(row, fields, selector)
                except (ValueError, TypeError, json.JSONDecodeError) as exc:
                    issue(str(exc), context)
                    continue
                docs.add(row["document_id"])
                selector_counts[selector["id"]]["accepted_schemas"] += 1
                if len(docs) > args.max_documents:
                    raise BoundedStop("document_limit")
                layout = {"format": row["format"], "struct_hash": row["struct_hash"], "hash32": row["hash32"], "hash64": row["hash64"],
                          "byte_size": row["byte_size"], "members": [{k: v for k, v in f.items() if k != "field_name"} for f in fields]}
                layout_sha = digest(layout)
                schema = {"struct_hash": row["struct_hash"], "hash32": row["hash32"], "hash64": row["hash64"], "byte_size": row["byte_size"],
                          "layout_sha256": layout_sha, "candidate_struct_role": row["role"], "selected_field": field}
                schema_key = (selector["id"], row["document_id"], layout_sha)
                if schema_key not in schema_seen:
                    schema_seen.add(schema_key)
                    writer.put("schema-inventory.jsonl", {**context, "schema": schema, "source": provenance,
                        "expected_instances": row["expected_instances"], "emitted_instances": row["emitted_instances"]})
                if args.inventory_only:
                    continue
                blocks = [dict(b) for b in db.execute("SELECT block_index,byte_size,byte_offset FROM r2_decode_blocks WHERE document_id=? AND struct_hash=? AND schema_known=1 ORDER BY block_index", (row["document_id"], row["struct_hash"]))]
                path = '$.' + json.dumps(field["field_name"])
                sql = """SELECT instance_index,byte_offset,length(object_json) AS json_characters,
                CASE WHEN length(object_json)<=? THEN json_type(object_json,?) END AS value_type,
                CASE WHEN length(object_json)<=? THEN json_extract(object_json,?) END AS value
                FROM r2_decode_instances WHERE document_id=? AND struct_hash=? ORDER BY instance_index"""
                actual = 0
                for instance in db.execute(sql, (args.max_object_characters, path, args.max_object_characters, path, row["document_id"], row["struct_hash"])):
                    check_time()
                    actual += 1
                    counts["selected_instance_field_opportunities"] += 1
                    selector_counts[selector["id"]]["instance_field_opportunities"] += 1
                    if counts["selected_instance_field_opportunities"] > args.max_observations:
                        raise BoundedStop("instance_field_opportunity_limit")
                    loc = {**context, "instance_index": instance["instance_index"], "instance_offset": str(instance["byte_offset"])}
                    if instance["json_characters"] > args.max_object_characters:
                        issue("object_json_character_limit", loc)
                        continue
                    off, size = instance["byte_offset"], row["byte_size"]
                    matching = [b["block_index"] for b in blocks if type(b["byte_offset"]) is int and type(off) is int and
                                b["byte_offset"] <= off and off + size <= b["byte_offset"] + b["byte_size"] and (off - b["byte_offset"]) % size == 0]
                    if not matching:
                        issue("instance_outside_matching_schema_block", loc)
                        continue
                    try:
                        value = representation(instance["value"], instance["value_type"], selector["encoding"])
                    except ValueError as exc:
                        issue(str(exc), loc)
                        continue
                    if selector["field_type"] == "15":
                        value["value_kind"] = "unsigned_integer_identifier_candidate"
                    record_key = digest([provenance["content_key"], layout_sha, str(off)])
                    location = digest([record_key, selector["id"], field["field_index"], field["field_hash"]])
                    value_key = (value["width_bits"], value["hex"])
                    previous = locations.setdefault(location, value_key)
                    if previous != value_key:
                        content_conflicts.add(location)
                        issue("repeated_content_location_value_conflict", {**loc, "content_location_id": location})
                    domain_values[selector["namespace"]].add(value_key)
                    if value["width_bits"] == 64:
                        low32[(selector["namespace"], value["hex"][-8:])].add(value["hex"])
                    observation = {"schema": "saverift.gta-vi.native-lookup-observation.v1", "selector_id": selector["id"],
                        "category": selector["category"], "namespace": selector["namespace"], "identifier_role": selector["role"],
                        "identifier": value, "source": provenance, "native_schema": schema,
                        "instance_index": instance["instance_index"], "instance_offset": str(off), "matching_block_indices": matching,
                        "record_key": record_key, "content_location_id": location,
                        "occurrence_id": digest([row["document_id"], selector["id"], layout_sha, instance["instance_index"], str(off)]),
                        "applicability": {"platforms": [args.platform] if args.platform != "unknown" else [], "build": args.build},
                        "confidence": "observed_decoded_metadata", "save_mapping": None,
                        "limits": ["not_reverified_against_raw_payload_in_this_pass", "metadata_domain_not_save_element_domain", "upstream_may_default_unavailable_values"]}
                    writer.put("observations.jsonl", observation)
                    counts["emitted_observations"] += 1
                    selector_counts[selector["id"]]["emitted_observations"] += 1
                if actual != row["emitted_instances"]:
                    issue("stored_emitted_instance_count_mismatch", {**context, "actual": actual, "recorded": row["emitted_instances"]})
            if not selector_counts[selector["id"]]["matching_schemas"]:
                issue("selector_has_no_matching_schema", {"selector_id": selector["id"]})
    except BoundedStop as exc:
        status, stop_reason = "bounded_stop", str(exc)
    except sqlite3.OperationalError as exc:
        if time.monotonic() >= deadline and "interrupted" in str(exc):
            status, stop_reason = "bounded_stop", "elapsed_time_limit"
        else:
            status, stop_reason = "failed", type(exc).__name__
    except Exception as exc:
        status, stop_reason = "failed", type(exc).__name__
    finally:
        writer.close()
        db.close()
    after, master_after = stat_signature(database), stat_signature(master)
    if after != before or master_after != master_before:
        status, stop_reason = "failed", "input_changed_during_extraction"
    try:
        no_active_journal(database)
    except ValueError:
        status, stop_reason = "failed", "database_journal_appeared"
    summary = {"tool": VERSION, "status": status, "stop_reason": stop_reason, "scope_complete": status == "completed",
        "created_utc": datetime.now(timezone.utc).isoformat(), "elapsed_seconds": round(time.monotonic() - started, 3),
        "script_sha256": file_sha(__file__), "selectors_sha256": plan_sha, "selection_basis": plan.get("selection_basis"),
        "inventory_only": args.inventory_only, "counts": dict(counts), "issues": dict(issue_counts),
        "selector_counts": {k: dict(v) for k, v in selector_counts.items()}, "all_selected_observations_valid": status == "completed" and not issue_counts,
        "selected_documents": len(docs), "distinct_content_locations": len(locations),
        "conflicting_content_locations": len(content_conflicts), "conflicting_content_location_ids": sorted(content_conflicts)[:32],
        "distinct_identifier_values_by_namespace": {k: len(v) for k, v in sorted(domain_values.items())},
        "hash64_low32_collision_groups": sum(len(v) > 1 for v in low32.values()),
        "database_identity": {"bytes": before["bytes"], "stat_before": before, "stat_after": after, "whole_database_hash_computed": False},
        "original_master_sha256": identity["master_sha256"], "baseline_catalog_revision": identity.get("catalog_revision"),
        "limits": {k: getattr(args, k) for k in ("max_seconds", "max_documents", "max_schema_observations", "max_observations", "max_object_characters", "max_output_bytes")},
        "outputs": {name: {"rows": writer.counts[name], "bytes": (output / name).stat().st_size, "sha256": file_sha(output / name)} for name in writer.handles},
        "interpretation": ["All occurrences retained; content-location keys identify repeated content independently of document/run occurrence.",
            "Namespaces and full hash widths remain distinct; low32 collisions do not merge full64 IDs.",
            "No object JSON, raw payload, asset, label inference or save mapping is exported.",
            "Completeness covers selected fields only; issues and bounded stops must remain visible."]}
    with (output / "summary.json").open("x", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, sort_keys=True, allow_nan=False)
        handle.write("\n")
    return summary


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--original-master", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--selectors", type=Path, default=Path(__file__).with_name("vehicle-selectors.json"))
    ap.add_argument("--platform", choices=("xbox", "ps5", "unknown"), default="unknown")
    ap.add_argument("--build")
    ap.add_argument("--inventory-only", action="store_true")
    ap.add_argument("--max-seconds", type=int, default=300)
    ap.add_argument("--max-documents", type=int, default=50000)
    ap.add_argument("--max-schema-observations", type=int, default=100000)
    ap.add_argument("--max-observations", type=int, default=100000)
    ap.add_argument("--max-object-characters", type=int, default=1048576)
    ap.add_argument("--max-output-bytes", type=int, default=134217728)
    args = ap.parse_args()
    if any(getattr(args, k) < 1 for k in ("max_seconds", "max_documents", "max_schema_observations", "max_observations", "max_object_characters", "max_output_bytes")):
        ap.error("All limits must be positive")
    result = extract(args)
    print(packed({k: result[k] for k in ("tool", "status", "scope_complete", "counts", "issues", "distinct_identifier_values_by_namespace")}))
    return 0 if result["status"] == "completed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
