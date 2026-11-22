#!/usr/bin/env python3
"""Deterministic, candidate-only matching of website text to native u32 hashes.

Pure entry point: match_website_labels(factual, native_targets).
Only vehicle records' literal labels and identifiers with kind == "website_slug"
are tried against vehicle model hashes. Non-ASCII comparison inputs are skipped
and counted. The lowercase trial lowercases only these ASCII inputs; it is a named
research transform, not a claim about the game's string normalization. No text is
trimmed, case-folded, stripped of brands/prefixes, or otherwise rewritten.

Evidence locations are required and preserved, but this helper does not fetch or
authenticate their source bytes. Native targets must already carry the caller's
title/build/namespace provenance. It neither establishes nor edits save mappings.
"""
import argparse
from collections import defaultdict
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import sys

VERSION = "website-native-hash-candidates/1.0.1"
MAX_INPUT_BYTES = 32 * 1024 * 1024
HASH32 = re.compile(r"0x[0-9a-fA-F]{8}\Z")
SHA256 = re.compile(r"[0-9a-fA-F]{64}\Z")
RECORD_FIELDS = ("record_key", "site", "site_record_id", "namespace", "category",
                 "entity_type", "label", "url", "site_status")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False)


def joaat32_exact(text):
    """Jenkins one-at-a-time, unsigned 32-bit, over literal ASCII bytes."""
    h = 0
    for byte in text.encode("ascii"):
        h = (h + byte) & 0xffffffff
        h = (h + (h << 10)) & 0xffffffff
        h ^= h >> 6
    h = (h + (h << 3)) & 0xffffffff
    h ^= h >> 11
    return (h + (h << 15)) & 0xffffffff


def required_text(value, where):
    if not isinstance(value, str) or not value:
        raise ValueError(where + " must be a nonempty string")
    # Reject malformed Unicode rather than silently changing the hash input.
    value.encode("utf-8")


def validate_record(record, index):
    where = "records[" + str(index) + "]"
    if not isinstance(record, dict):
        raise ValueError(where + " must be an object")
    for key in RECORD_FIELDS:
        if key not in record:
            raise ValueError(where + " is missing " + key)
        if key in ("entity_type", "site_status") and record[key] is None:
            continue
        required_text(record[key], where + "." + key)
    identifiers = record.get("identifiers")
    if not isinstance(identifiers, list):
        raise ValueError(where + ".identifiers must be an array")
    for identifier in identifiers:
        if not isinstance(identifier, dict):
            raise ValueError(where + ".identifiers entries must be objects")
        for key in ("kind", "namespace", "raw_text"):
            required_text(identifier.get(key), where + ".identifiers[]." + key)
    evidence = record.get("evidence")
    if not isinstance(evidence, list) or not evidence:
        raise ValueError(where + " requires nonempty evidence")
    for item in evidence:
        if not isinstance(item, dict):
            raise ValueError(where + ".evidence entries must be objects")
        required_text(item.get("source_id"), where + ".evidence[].source_id")
        response = item.get("response_id")
        if not ((isinstance(response, str) and response) or type(response) is int):
            raise ValueError(where + ".evidence[] requires a response_id")
        pointer, selector = item.get("json_pointer"), item.get("selector")
        # Empty JSON Pointer is the valid document-root locator.
        pointer_ok = isinstance(pointer, str) and (pointer == "" or pointer.startswith("/"))
        selector_ok = isinstance(selector, str) and bool(selector)
        if not pointer_ok and not selector_ok:
            raise ValueError(where + ".evidence[] requires an exact JSON pointer or selector")
        if not isinstance(item.get("body_sha256"), str) or not SHA256.fullmatch(item["body_sha256"]):
            raise ValueError(where + ".evidence[] requires a SHA-256 body identity")


def match_website_labels(factual, native_targets):
    """Return matches, explicit ambiguity groups and counts; never choose a label.

    factual: {"records": [...]} in the documented factual-snapshot schema.
    native_targets: [{"value": "0x........", "category": "vehicles", ...}]
    containing model hashes with caller-owned provenance.
    Other native-target fields are preserved without interpretation. Multiple
    target records sharing a hash remain visible. No native-token field is guessed.
    Invalid input raises ValueError before a result is returned.
    """
    if not isinstance(factual, dict) or not isinstance(factual.get("records"), list):
        raise ValueError("factual must be an object with a records array")
    if not isinstance(native_targets, list):
        raise ValueError("native_targets must be an array")
    # Validate serializability before making any candidates.
    canonical(factual)
    canonical(native_targets)
    records = factual["records"]
    seen = set()
    for index, record in enumerate(records):
        validate_record(record, index)
        if record["record_key"] in seen:
            raise ValueError("Duplicate record_key; preserve each source row under its own key")
        seen.add(record["record_key"])
    targets = defaultdict(list)
    for index, target in enumerate(native_targets):
        if not isinstance(target, dict) or not isinstance(target.get("value"), str) or not HASH32.fullmatch(target["value"]):
            raise ValueError("native_targets[" + str(index) + "].value must be 0x plus exactly eight hex digits")
        if target.get("category") != "vehicles":
            raise ValueError("native_targets[" + str(index) + "] must have category vehicles for model-hash matching")
        targets[target["value"].lower()].append(deepcopy(target))
    for group in targets.values():
        group.sort(key=canonical)

    matches, input_count, skipped_non_ascii = [], 0, 0
    eligible_records = 0
    for record in sorted(records, key=lambda row: row["record_key"]):
        if record["category"] != "vehicles":
            continue
        eligible_records += 1
        inputs = [("label", record["label"], None)]
        inputs.extend(("identifiers/" + str(i) + "/raw_text", item["raw_text"], item["namespace"])
                      for i, item in enumerate(record["identifiers"]) if item["kind"] == "website_slug")
        input_count += len(inputs)
        for field, text, identifier_namespace in inputs:
            if not text.isascii():
                skipped_non_ascii += 1
                continue
            for method, transformed in (("joaat32_exact", text), ("joaat32_lowercase", text.lower())):
                value = "0x%08x" % joaat32_exact(transformed)
                if value not in targets:
                    continue
                identity = {"record_key": record["record_key"], "comparison_field": field,
                            "comparedText": text, "method": method, "matched_hash": value}
                candidate = {key: deepcopy(record[key]) for key in RECORD_FIELDS}
                candidate.update(identity)
                candidate.update(candidate_id="website-match:" + hashlib.sha256(canonical(identity).encode()).hexdigest(),
                                 matchMethod=method, hashInputText=transformed,
                                 hash_input_encoding="ascii", hash_bits=32,
                                 identifier_namespace=identifier_namespace,
                                 evidence=sorted(deepcopy(record["evidence"]), key=canonical),
                                 native_targets=deepcopy(targets[value]),
                                 site_status_scope="website_claim", status="candidate_only",
                                 game_definition_confirmed=False, editable=False)
                matches.append(candidate)

    grouped = defaultdict(list)
    for candidate in matches:
        grouped[candidate["matched_hash"]].append(candidate)
    ambiguities = []
    for value, group in sorted(grouped.items()):
        record_keys = sorted({row["record_key"] for row in group})
        labels = sorted({row["label"] for row in group})
        inputs = sorted({row["hashInputText"] for row in group})
        flags = []
        if len(record_keys) > 1:
            flags.append("multiple_website_records")
        if len(labels) > 1:
            flags.append("multiple_labels")
        if len(inputs) > 1:
            flags.append("distinct_hash_inputs_share_hash")
        target_variants = len({canonical(target) for target in targets[value]})
        if target_variants > 1:
            flags.append("multiple_native_target_records")
        if len(targets[value]) > target_variants:
            flags.append("duplicate_native_target_records")
        for candidate in group:
            candidate["ambiguity_flags"] = list(flags)
            candidate["ambiguity_key"] = value if flags else None
        if flags:
            ambiguities.append({"matched_hash": value, "flags": flags, "record_keys": record_keys,
                                "labels": labels, "hash_input_texts": inputs,
                                "native_target_record_count": len(targets[value]),
                                "candidate_count": len(group),
                                "candidate_ids": sorted(row["candidate_id"] for row in group)})
    matches.sort(key=lambda row: (row["matched_hash"], row["record_key"], row["comparison_field"], row["method"]))
    return {"version": VERSION, "status": "candidate_only", "preferred_labels_selected": 0,
            "counts": {"source_records": len(records), "eligible_vehicle_source_records": eligible_records,
                       "skipped_non_vehicle_source_records": len(records) - eligible_records,
                       "native_target_records": len(native_targets),
                       "native_hash_values": len(targets), "comparison_inputs": input_count,
                       "hashed_comparison_inputs": input_count - skipped_non_ascii,
                       "skipped_non_ascii_comparison_inputs": skipped_non_ascii,
                       "hash_trials": (input_count - skipped_non_ascii) * 2, "matching_trials": len(matches),
                       "matched_source_records": len({row["record_key"] for row in matches}),
                       "ambiguity_groups": len(ambiguities),
                       "hash_collision_groups": sum("distinct_hash_inputs_share_hash" in a["flags"] for a in ambiguities)},
            "matches": matches, "ambiguities": ambiguities}


def read_json(path):
    with Path(path).open("rb") as source:
        raw = source.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("Input JSON exceeds the 32 MiB bound")
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--factual-json", type=Path, required=True)
    parser.add_argument("--targets-json", type=Path, required=True, help="JSON array of native u32-hash targets")
    parser.add_argument("--output", type=Path, required=True, help="Fresh result path; existing files are never replaced")
    args = parser.parse_args(argv)
    try:
        if args.output.exists():
            raise ValueError("Output already exists; choose a fresh path")
        factual, factual_sha = read_json(args.factual_json)
        targets, targets_sha = read_json(args.targets_json)
        result = match_website_labels(factual, targets)
        result["input_sha256"] = {"factual": factual_sha, "native_targets": targets_sha}
        with args.output.open("x", encoding="utf-8", newline="\n") as out:
            json.dump(result, out, sort_keys=True, indent=2, ensure_ascii=True, allow_nan=False)
            out.write("\n")
        print(canonical({"status": result["status"], "counts": result["counts"]}))
        return 0
    except (ValueError, OSError, TypeError) as exc:
        print(canonical({"status": "rejected", "error": str(exc)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
