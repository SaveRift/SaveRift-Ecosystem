#!/usr/bin/env python3
"""Rehash bounded native payload witnesses and verify selected little-endian u32s.

No decoded objects, asset bodies, filenames, or local paths are exported.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import struct
import time

VERSION = "saverift-native-lookup-byte-verification/0.1.0"
EXTRACTOR_SHA256 = "7b3e568cab97e427f5e92b3223e86ad01fa1afcfc5925fc1cae84eaf71665402"
ADAPTER = "sixng-metadata-batch/0.1.0"
UPSTREAM = "5a5a9761663315cdf61cec8b219ae5b808e556ae"
WORKER = "f8c7c4c66be270c671a33289d52ef82be25ad769dd690cb84e8cced555979b1d"
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def pack(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(pack(value).encode()).hexdigest()


def signature(s):
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def same_file_observation(path_before, handle_before, handle_after, path_after):
    # Windows Path.stat and fstat can expose different ctime precision.
    return (signature(path_before) == signature(path_after) and
            signature(handle_before) == signature(handle_after) and
            signature(path_before)[:4] == signature(handle_before)[:4] and
            signature(path_after)[:4] == signature(handle_after)[:4])


def file_hash(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def checkpoint(path):
    for suffix in ("-wal", "-journal"):
        p = Path(str(path) + suffix)
        if p.exists() and p.stat().st_size:
            raise ValueError("database_has_nonempty_journal")


def load_bounded_json(path, limit):
    with path.open("rb") as f:
        raw = f.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("summary_size_limit")
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def map_offset(source, absolute, width=4):
    """Map Resource.sys offset to one original file; reject synthetic padding."""
    size = source.get("bytes")
    if type(size) is not int or size <= 0 or type(absolute) is not int or absolute < 0:
        raise ValueError("invalid_source_size_or_offset")
    if absolute + width <= size:
        return "system", absolute
    if source.get("gfx_path"):
        base = (size + 15) & ~15
        gfx_size = source.get("gfx_bytes")
        if type(gfx_size) is not int or gfx_size < 0:
            raise ValueError("missing_graphics_size")
        if absolute >= base and absolute + width <= base + gfx_size:
            return "graphics", absolute - base
        raise ValueError("field_in_padding_or_crosses_file_boundary")
    raise ValueError("field_outside_source_file")


def read_file_witness(path, expected_sha, expected_size, offsets, deadline, max_file_bytes):
    """Hash and seek on the same handle; return only requested u32 values."""
    if not isinstance(expected_sha, str) or HEX64.fullmatch(expected_sha) is None or type(expected_size) is not int or expected_size < 0:
        return {"status": "invalid_file_identity", "bytes_hashed": 0}, {}
    if expected_size > max_file_bytes:
        return {"status": "file_byte_limit", "bytes_hashed": 0}, {}
    count, values, h = 0, {}, hashlib.sha256()
    try:
        before_path = path.stat()
        with path.open("rb") as f:
            before = os.fstat(f.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size != expected_size:
                return {"status": "file_size_or_kind_mismatch", "bytes_hashed": 0}, {}
            while count < expected_size:
                if time.monotonic() >= deadline:
                    return {"status": "elapsed_time_limit", "bytes_hashed": count}, {}
                chunk = f.read(min(1 << 20, expected_size - count))
                if not chunk:
                    return {"status": "short_file_read", "bytes_hashed": count}, {}
                count += len(chunk)
                h.update(chunk)
            if f.read(1):
                return {"status": "file_size_changed", "bytes_hashed": count}, {}
            if h.hexdigest() != expected_sha:
                return {"status": "file_sha256_mismatch", "bytes_hashed": count}, {}
            for offset in sorted(offsets):
                if time.monotonic() >= deadline:
                    return {"status": "elapsed_time_limit", "bytes_hashed": count}, {}
                if type(offset) is not int or offset < 0 or offset + 4 > expected_size:
                    return {"status": "field_outside_file", "bytes_hashed": count}, {}
                f.seek(offset)
                raw = f.read(4)
                if len(raw) != 4:
                    return {"status": "short_scalar_read", "bytes_hashed": count}, {}
                values[offset] = struct.unpack("<I", raw)[0]
            after = os.fstat(f.fileno())
        if not same_file_observation(before_path, before, after, path.stat()):
            return {"status": "file_changed_during_verification", "bytes_hashed": count}, {}
        return {"status": "verified", "bytes_hashed": count, "verified_size": expected_size, "verified_sha256": expected_sha}, values
    except (OSError, ValueError, OverflowError):
        return {"status": "file_read_error", "bytes_hashed": count}, {}


def verify(args):
    database, observations, output = [Path(p).resolve() for p in (args.database, args.observations, args.output)]
    summary_path = Path(args.extractor_summary).resolve() if args.extractor_summary else observations.with_name("summary.json")
    if output.exists():
        raise FileExistsError("fresh_output_directory_required")
    extraction, extraction_sha = load_bounded_json(summary_path, 1 << 20)
    bound = extraction.get("outputs", {}).get("observations.jsonl", {})
    if (extraction.get("tool") != "saverift-native-lookup-staging/0.1.0" or extraction.get("script_sha256") != EXTRACTOR_SHA256 or
        extraction.get("status") != "completed" or extraction.get("inventory_only") is not False or
        extraction.get("all_selected_observations_valid") is not True or extraction.get("issues") or
        not isinstance(bound.get("sha256"), str) or HEX64.fullmatch(bound["sha256"]) is None):
        raise ValueError("complete_clean_frozen_extractor_receipt_required")
    if observations.stat().st_size != bound.get("bytes") or bound["bytes"] > args.max_observations_bytes:
        raise ValueError("observations_byte_identity_or_limit")
    checkpoint(database)
    before_db, before_observations = database.stat(), observations.stat()
    started, deadline = time.monotonic(), time.monotonic() + args.max_seconds
    db = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    db.execute("BEGIN")
    db.set_progress_handler(lambda: int(time.monotonic() >= deadline), 10000)
    baseline = db.execute("SELECT value_json FROM r2_metadata WHERE key='baseline_summary'").fetchone()
    if not baseline or not all(json.loads(baseline[0]).get(k) for k in ("original_tables_preserved", "master_unchanged")):
        db.close()
        raise ValueError("completed_baseline_required")
    rows, docs, files, seen = [], {}, {}, set()
    stream_hash, stream_bytes = hashlib.sha256(), 0

    def file_key(source, region):
        prefix = "gfx_" if region == "graphics" else ""
        path_value, sha, size = source.get(prefix + "path"), source.get(prefix + "sha256"), source.get(prefix + "bytes")
        if not isinstance(path_value, str) or not Path(path_value).is_absolute() or not isinstance(sha, str) or not HEX64.fullmatch(sha) or type(size) is not int or size < 0:
            raise ValueError("incomplete_source_file_identity")
        path = Path(path_value).resolve()
        if path == database or (path.exists() and os.path.samefile(path, database)):
            raise ValueError("payload_aliases_database")
        key = (str(path), sha, size)
        files.setdefault(key, {"offsets": set(), "path": path, "sha256": sha, "bytes": size})
        return key

    def document(docid):
        if docid in docs:
            return docs[docid]
        if len(docs) >= args.max_documents:
            raise ValueError("document_limit")
        d = db.execute("SELECT document_id,run_id,payload_id,source_sha256,output_sha256,format,adapter,upstream_commit,CASE WHEN length(source_json)<=131072 THEN source_json END AS source_json FROM r2_decode_documents WHERE document_id=?", (docid,)).fetchone()
        if not d or not d["source_json"]:
            raise ValueError("document_missing_or_source_json_limit")
        d = dict(d)
        attempt = db.execute("SELECT line_number,status,document_id,source_sha256,json_extract(record_json,'$.worker_sha256') AS worker_sha256 FROM r2_decode_attempts WHERE run_id=? AND payload_id=? ORDER BY line_number DESC LIMIT 1", (d["run_id"], d["payload_id"])).fetchone()
        if not attempt or attempt["status"] != "decoded_research" or attempt["document_id"] != docid or attempt["source_sha256"] != d["source_sha256"]:
            raise ValueError("document_no_longer_latest_success")
        if (d["format"], d["adapter"], d["upstream_commit"], attempt["worker_sha256"]) != ("meta7a", ADAPTER, UPSTREAM, WORKER):
            raise ValueError("unsupported_format_or_decoder_pin")
        source = json.loads(d.pop("source_json"))
        if source.get("payload_id") != d["payload_id"] or source.get("sha256") != d["source_sha256"]:
            raise ValueError("document_source_identity_mismatch")
        content = {"format": "meta7a", "source_sha256": d["source_sha256"], "gfx_sha256": source.get("gfx_sha256") or "",
                   "gfx_base": str(source.get("gfx_base") or 0), "adapter": ADAPTER, "upstream_commit": UPSTREAM, "worker_sha256": WORKER}
        d.update(source=source, line_number=attempt["line_number"], content_key=content)
        docs[docid] = d
        return d

    try:
        with observations.open("rb") as stream:
            for line_number in range(args.max_observations + 1):
                line = stream.readline(65537)
                if not line:
                    break
                if len(line) > 65536 or len(rows) >= args.max_observations or time.monotonic() >= deadline:
                    raise ValueError("observation_count_line_or_time_limit")
                stream_hash.update(line)
                stream_bytes += len(line)
                o = json.loads(line)
                src, schema, identifier = o.get("source", {}), o.get("native_schema", {}), o.get("identifier", {})
                f = schema.get("selected_field", {})
                result = {"occurrence_id": o.get("occurrence_id"), "content_location_id": o.get("content_location_id"),
                          "document_id": src.get("document_id"), "namespace": o.get("namespace"),
                          "status": "pending", "input_line": line_number + 1}
                rows.append(result)
                try:
                    if o.get("schema") != "saverift.gta-vi.native-lookup-observation.v1" or not all(isinstance(result[k], str) and HEX64.fullmatch(result[k]) for k in ("occurrence_id", "content_location_id")):
                        raise ValueError("invalid_observation_identity")
                    if result["occurrence_id"] in seen:
                        raise ValueError("duplicate_occurrence_id")
                    seen.add(result["occurrence_id"])
                    if identifier.get("width_bits") != 32 or not isinstance(identifier.get("hex"), str) or not re.fullmatch(r"[0-9a-f]{8}", identifier["hex"]) or f.get("field_type") not in ("4a", "15"):
                        raise ValueError("unsupported_selected_scalar_representation")
                    expected = int(identifier["hex"], 16)
                    if identifier.get("decoded_json_type") != "integer" or identifier.get("decoded_value_text") != str(expected):
                        raise ValueError("staged_scalar_representations_disagree")
                    d = document(src["document_id"])
                    for k in ("run_id", "payload_id", "source_sha256", "output_sha256", "line_number", "content_key"):
                        if src.get(k) != d[k]:
                            raise ValueError("observation_document_binding_mismatch")
                    if src.get("content_key_sha256") != digest(d["content_key"]):
                        raise ValueError("observation_content_key_digest_mismatch")
                    inst = o.get("instance_offset")
                    if not isinstance(inst, str) or not inst.isdecimal() or type(f.get("byte_offset")) is not int or f["byte_offset"] < 0:
                        raise ValueError("invalid_field_offset")
                    absolute = int(inst) + f["byte_offset"]
                    region, offset = map_offset(d["source"], absolute)
                    required = [file_key(d["source"], "system")]
                    if d["source"].get("gfx_path"):
                        required.append(file_key(d["source"], "graphics"))
                    target = required[1] if region == "graphics" else required[0]
                    files[target]["offsets"].add(offset)
                    result.update(required_files=required, target_file=target, file_offset=offset, file_region=region, expected=expected)
                except (ValueError, KeyError, TypeError, OSError, OverflowError):
                    # No exception text can carry a private path into output.
                    result["status"] = "invalid_observation_or_source_binding"
        if stream_bytes != bound["bytes"] or stream_hash.hexdigest() != bound["sha256"] or len(rows) != bound.get("rows"):
            raise ValueError("observations_receipt_digest_size_or_count_mismatch")
        if signature(before_observations) != signature(observations.stat()):
            raise ValueError("observations_changed_during_read")
        output.mkdir(parents=True)
        file_results, file_values = {}, {}
        bytes_hashed, bounded = 0, False
        for key, task in files.items():
            if time.monotonic() >= deadline or bytes_hashed + task["bytes"] > args.max_total_input_bytes:
                check, values = {"status": "total_input_or_time_limit", "bytes_hashed": 0}, {}
                bounded = True
            else:
                check, values = read_file_witness(task["path"], task["sha256"], task["bytes"], task["offsets"], deadline, args.max_file_bytes)
                bytes_hashed += check["bytes_hashed"]
                bounded |= check["status"] in ("file_byte_limit", "elapsed_time_limit")
            file_results[key], file_values[key] = check, values
        issue_counts, status_counts, verified_locations = Counter(), Counter(), set()
        verification = output / "verification.jsonl"
        written, verification_bytes, verified = 0, 0, 0
        verification_hash = hashlib.sha256()
        with verification.open("xb") as handle:
            for r in rows:
                if r["status"] == "pending":
                    failures = sorted({file_results[k]["status"] for k in r["required_files"] if file_results[k]["status"] != "verified"})
                    if failures:
                        r["status"], r["file_issues"] = "file_identity_unverified", failures
                    else:
                        actual = file_values[r["target_file"]][r["file_offset"]]
                        r["status"] = "verified" if actual == r["expected"] else "scalar_mismatch"
                        r["expected_scalar_hex"], r["actual_scalar_hex"] = f"{r['expected']:08x}", f"{actual:08x}"
                        r["field_byte_count"] = 4
                public = {k: v for k, v in r.items() if k not in ("required_files", "target_file", "expected")}
                if "file_offset" in public:
                    public["file_offset"] = str(public["file_offset"])
                line = (pack(public) + "\n").encode()
                if verification_bytes + len(line) > args.max_output_bytes:
                    bounded = True
                    break
                handle.write(line)
                verification_hash.update(line)
                verification_bytes += len(line)
                written += 1
                status_counts[r["status"]] += 1
                if r["status"] == "verified":
                    verified += 1
                    verified_locations.add(r["content_location_id"])
                else:
                    issue_counts[r["status"]] += 1
        db.close()
        unchanged = signature(before_db) == signature(database.stat())
        try:
            checkpoint(database)
        except ValueError:
            unchanged = False
        status = "bounded_stop" if bounded else "completed"
        if not unchanged:
            status = "failed"
            issue_counts["database_changed_during_verification"] += 1
        receipt = {"tool": VERSION, "status": status, "all_observations_verified": status == "completed" and written == len(rows) == verified,
            "created_utc": datetime.now(timezone.utc).isoformat(), "elapsed_seconds": round(time.monotonic() - started, 3),
            "script_sha256": file_hash(Path(__file__)), "extractor_sha256": EXTRACTOR_SHA256,
            "extractor_summary_sha256": extraction_sha, "selectors_sha256": extraction.get("selectors_sha256"),
            "observations_sha256": stream_hash.hexdigest(), "observations_bytes": stream_bytes, "observations_count": len(rows),
            "verified_occurrences": verified, "verified_content_locations": len(verified_locations),
            "written_verification_rows": written, "remaining_verification_rows": len(rows) - written,
            "verification_sha256": verification_hash.hexdigest(), "verification_bytes": verification_bytes,
            "issues": sum(issue_counts.values()), "issue_counts": dict(issue_counts), "status_counts": dict(status_counts),
            "file_issue_counts": dict(Counter(v["status"] for v in file_results.values() if v["status"] != "verified")),
            "files_checked": len(file_results), "files_verified": sum(v["status"] == "verified" for v in file_results.values()),
            "payload_bytes_hashed": bytes_hashed, "selected_documents": len(docs), "database_checkpoint_unchanged": unchanged,
            "limits": {k: getattr(args, k) for k in ("max_seconds", "max_file_bytes", "max_total_input_bytes", "max_observations_bytes", "max_observations", "max_documents", "max_output_bytes")},
            "interpretation": "Selected u32 bytes agree with the staged metadata observations; no label, namespace meaning, model availability, or save mapping is established."}
        with (output / "receipt.json").open("x", encoding="utf-8") as handle:
            json.dump(receipt, handle, indent=2, sort_keys=True, allow_nan=False)
            handle.write("\n")
        return receipt
    finally:
        db.close()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--database", type=Path, required=True)
    p.add_argument("--observations", type=Path, required=True)
    p.add_argument("--extractor-summary", type=Path)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--max-seconds", type=int, default=300)
    p.add_argument("--max-file-bytes", type=int, default=268435456)
    p.add_argument("--max-total-input-bytes", type=int, default=2147483648)
    p.add_argument("--max-observations-bytes", type=int, default=134217728)
    p.add_argument("--max-observations", type=int, default=100000)
    p.add_argument("--max-documents", type=int, default=50000)
    p.add_argument("--max-output-bytes", type=int, default=67108864)
    args = p.parse_args()
    if any(getattr(args, k) < 1 for k in ("max_seconds", "max_file_bytes", "max_total_input_bytes", "max_observations_bytes", "max_observations", "max_documents", "max_output_bytes")):
        p.error("positive_limits_required")
    result = verify(args)
    print(pack({k: result[k] for k in ("tool", "status", "all_observations_verified", "verified_occurrences", "verified_content_locations", "issues", "file_issue_counts")}))
    return 0 if result["all_observations_verified"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
