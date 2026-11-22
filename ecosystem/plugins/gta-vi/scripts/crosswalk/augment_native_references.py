#!/usr/bin/env python3
"""Add byte-proved native scalar witnesses to existing website spec/item rows.

This exporter creates no entities, computes no identifier hashes and adds no save
bindings. Native reference meaning and website label relationships stay candidates.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re

VERSION = "saverift-native-reference-augmentation/0.1.0"
HERE = Path(__file__).resolve().parent
EXTRACTOR = "7b3e568cab97e427f5e92b3223e86ad01fa1afcfc5925fc1cae84eaf71665402"
ADAPTER = "sixng-metadata-batch/0.1.0"
UPSTREAM = "5a5a9761663315cdf61cec8b219ae5b808e556ae"
WORKER = "f8c7c4c66be270c671a33289d52ef82be25ad769dd690cb84e8cced555979b1d"
SHA = re.compile(r"[0-9a-f]{64}\Z")
HEX = re.compile(r"0[xX]([0-9a-fA-F]{8})\Z")
MAX_BYTES = 64 * 1024 * 1024
MAX_ROWS = 100000
PROFILES = {
    "weapon": dict(category="weapons", domain="spec", key="weaponSpecHash32",
        selector="weapon-reference-table-spec", plan="weapon-reference-selectors.json",
        plan_sha="b647ef0b2c9896bb1aff850e4d3b93f1a44fa00f75cd91db0997355d8b201507",
        verifier="verify_native_lookup_bytes.py", verifier_version="0.1.0",
        verifier_sha="aa9e1e810edea88fe61f7d31bfe798ff9909dcc131f35c5f70c08f0cea596484",
        offsets={"weapon-reference-table-name": 0, "weapon-reference-table-spec": 4},
        source_id="saverift-native-weapon-spec-references-2026-11-22"),
    "item": dict(category="items", domain="item", key="itemHash32",
        selector="item-reference-table-item-id", plan="item-selectors.json",
        plan_sha="aa4d31c81777630794a5f3bab1c40e562ab42837d23098f3200f686026eeec78",
        verifier="verify_native_lookup_bytes_v2.py", verifier_version="0.2.0",
        verifier_sha="28e798951f047fceaed3298b00ace31e4a2ad26eee5d6c4f25450853ff330f0f",
        offsets={"item-reference-table-item-id": 16},
        source_id="saverift-native-item-id-references-2026-11-22"),
}


def pack(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def digest(value):
    return sha(pack(value).encode())


def signature(s):
    return s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns


def bounded_bytes(path, limit=MAX_BYTES):
    path = Path(path)
    before = path.stat()
    if not path.is_file() or before.st_size > limit:
        raise ValueError("input_kind_or_byte_limit")
    with path.open("rb") as handle:
        raw = handle.read(limit + 1)
    if len(raw) != before.st_size or len(raw) > limit or signature(before) != signature(path.stat()):
        raise ValueError("input_changed_or_byte_limit")
    return raw


def require(condition, message):
    if not condition:
        raise ValueError(message)


def lines(raw):
    result = []
    for line in raw.splitlines():
        require(len(line) <= 65536 and len(result) < MAX_ROWS, "jsonl_line_or_row_limit")
        result.append(json.loads(line))
    return result


def valid_sha(value):
    return isinstance(value, str) and SHA.fullmatch(value) is not None


def load_native(native_dir, proof_path, profile):
    """Bind the exact producer, plan, summary, observation bytes and proof rows."""
    native_dir, proof_path = Path(native_dir), Path(proof_path)
    for filename, expected in (("extract_native_lookup.py", EXTRACTOR),
                               (profile["plan"], profile["plan_sha"]),
                               (profile["verifier"], profile["verifier_sha"])):
        require(sha(bounded_bytes(HERE / filename, 262144)) == expected, "local_frozen_tool_or_selector_changed")
    plan = json.loads(bounded_bytes(HERE / profile["plan"], 262144))
    selectors = {s["id"]: s for s in plan["selectors"]}
    summary_raw = bounded_bytes(native_dir / "summary.json", 2 * 1024 * 1024)
    receipt_raw = bounded_bytes(proof_path, 2 * 1024 * 1024)
    obs_raw = bounded_bytes(native_dir / "observations.jsonl")
    proof_raw = bounded_bytes(proof_path.with_name("verification.jsonl"))
    summary, receipt = json.loads(summary_raw), json.loads(receipt_raw)
    bound = summary.get("outputs", {}).get("observations.jsonl", {})
    require(summary.get("tool") == "saverift-native-lookup-staging/0.1.0" and
            summary.get("script_sha256") == EXTRACTOR and summary.get("selectors_sha256") == profile["plan_sha"] and
            summary.get("selection_basis") == plan["selection_basis"] and summary.get("status") == "completed" and
            summary.get("scope_complete") is True and summary.get("inventory_only") is False and
            summary.get("all_selected_observations_valid") is True and valid_sha(summary.get("original_master_sha256")) and not summary.get("issues") and
            summary.get("conflicting_content_locations") == 0, "complete_frozen_extraction_required")
    require(bound.get("sha256") == sha(obs_raw) and bound.get("bytes") == len(obs_raw), "observations_digest_or_size_changed")
    require(receipt.get("tool") == "saverift-native-lookup-byte-verification/" + profile["verifier_version"] and
            receipt.get("script_sha256") == profile["verifier_sha"] and receipt.get("extractor_sha256") == EXTRACTOR and
            receipt.get("extractor_summary_sha256") == sha(summary_raw) and receipt.get("selectors_sha256") == profile["plan_sha"] and
            receipt.get("status") == "completed" and receipt.get("all_observations_verified") is True and
            receipt.get("database_checkpoint_unchanged") is True and receipt.get("issues") == 0 and
            not receipt.get("issue_counts") and not receipt.get("file_issue_counts"), "complete_frozen_byte_verification_required")
    require(receipt.get("observations_sha256") == sha(obs_raw) and receipt.get("observations_bytes") == len(obs_raw) and
            receipt.get("verification_sha256") == sha(proof_raw) and receipt.get("verification_bytes") == len(proof_raw),
            "proof_or_observation_digest_or_size_changed")
    observations, proof = lines(obs_raw), lines(proof_raw)
    count = len(observations)
    require(count > 0 and count == len(proof) == bound.get("rows") == summary.get("counts", {}).get("emitted_observations") ==
            receipt.get("observations_count") == receipt.get("verified_occurrences") == receipt.get("written_verification_rows") and
            receipt.get("remaining_verification_rows") == 0 and receipt.get("status_counts") == {"verified": count},
            "proof_or_extraction_count_mismatch")
    groups, selected_counts, seen, locations = defaultdict(list), Counter(), set(), {}
    for number, (row, verified) in enumerate(zip(observations, proof), 1):
        sid = row.get("selector_id")
        require(sid in selectors, "observation_outside_pinned_selector_plan")
        selector = selectors[sid]
        src, schema, value = row["source"], row["native_schema"], row["identifier"]
        field, content = schema["selected_field"], src["content_key"]
        require(row.get("schema") == "saverift.gta-vi.native-lookup-observation.v1" and
                row.get("namespace") == selector["namespace"] and row.get("identifier_role") == selector["role"] and
                row.get("category") == selector["category"] and schema.get("struct_hash") == selector["struct_hash"] and
                schema.get("byte_size") in selector["struct_sizes"] and content.get("format") == selector["format"],
                "native_field_domain_or_full_structure_mismatch")
        require(all(field.get(k) == selector[k] for k in ("field_index", "field_hash", "field_type", "field_subtype", "reference_index", "extra_hex")) and
                field.get("byte_offset") == profile["offsets"][sid] and field.get("is_array_element") in (False, 0),
                "native_field_descriptor_mismatch")
        require(schema.get("hash32") == selector["struct_hash"][-8:] and
                schema.get("hash64") == (selector["struct_hash"] if selector["format"] == "psin" else None) and
                valid_sha(schema.get("layout_sha256")), "native_full_hash_or_layout_identity_mismatch")
        require(value.get("value_kind") == "hash32" and value.get("width_bits") == 32 and
                isinstance(value.get("hex"), str) and re.fullmatch("[0-9a-f]{8}", value["hex"]) and
                value.get("decoded_json_type") == "integer" and value.get("decoded_value_text") == str(int(value["hex"], 16)) and
                value.get("zero_value") is (int(value["hex"], 16) == 0), "native_scalar_is_not_lossless_u32")
        require(row.get("applicability") == {"platforms": ["xbox"], "build": None} and row.get("save_mapping") is None and
                row.get("confidence") == "observed_decoded_metadata" and
                all(src.get("document_quality", {}).get(k) == 0 for k in ("field_key_collision_count", "missing_instance_count", "unavailable_blocks")),
                "native_scope_or_quality_not_reviewed")
        require(all(valid_sha(src.get(k)) for k in ("document_id", "source_sha256", "output_sha256", "content_key_sha256")) and
                content.get("source_sha256") == src["source_sha256"] and content.get("adapter") == ADAPTER and
                content.get("upstream_commit") == UPSTREAM and content.get("worker_sha256") == WORKER and
                (content.get("gfx_sha256") == "" or valid_sha(content.get("gfx_sha256"))) and
                isinstance(content.get("gfx_base"), str) and content["gfx_base"].isdecimal() and
                src["content_key_sha256"] == digest(content), "native_source_identity_or_decoder_mismatch")
        if selector["format"] == "psin":
            require(content["gfx_sha256"] == "" and content["gfx_base"] == "0", "psin_graphics_identity_not_allowed")
        require(isinstance(row.get("instance_offset"), str) and row["instance_offset"].isdecimal() and
                type(row.get("instance_index")) is int and row["instance_index"] >= 0, "invalid_instance_geometry")
        record = digest([content, schema["layout_sha256"], row["instance_offset"]])
        location = digest([record, sid, field["field_index"], field["field_hash"]])
        occurrence = digest([src["document_id"], sid, schema["layout_sha256"], row["instance_index"], row["instance_offset"]])
        require(row.get("record_key") == record and row.get("content_location_id") == location and
                row.get("occurrence_id") == occurrence and occurrence not in seen, "native_observation_identity_mismatch")
        seen.add(occurrence)
        require(locations.setdefault(location, value["hex"]) == value["hex"], "conflicting_repeated_content_location")
        require(all(verified.get(k) == row[k] for k in ("occurrence_id", "content_location_id", "namespace")) and
                verified.get("document_id") == src["document_id"] and verified.get("input_line") == number and
                verified.get("status") == "verified" and verified.get("field_byte_count") == 4 and
                verified.get("actual_scalar_hex") == value["hex"] == verified.get("expected_scalar_hex") and
                verified.get("file_region") in ("system", "graphics") and isinstance(verified.get("file_offset"), str) and
                verified["file_offset"].isdecimal(), "per_observation_byte_proof_mismatch")
        if selector["format"] == "psin":
            require(verified.get("payload_format") == "psin" and verified.get("offset_space") == "psin-magic-origin" and
                    verified["file_region"] == "system" and int(verified["file_offset"]) == int(row["instance_offset"]) + field["byte_offset"],
                    "psin_byte_proof_offset_mismatch")
        selected_counts[sid] += 1
        if sid == profile["selector"] and value["hex"] != "00000000":
            groups["0x" + value["hex"]].append(row)
    require(receipt.get("verified_content_locations") == len(locations) == summary.get("distinct_content_locations"),
            "content_location_count_mismatch")
    require(all(summary.get("selector_counts", {}).get(k, {}).get("emitted_observations") == n for k, n in selected_counts.items()),
            "selector_observation_count_mismatch")
    provenance = dict(upstream="https://github.com/holdmysocks/SixNG", upstreamCommit=UPSTREAM,
        decoderAdapter=ADAPTER, decoderWorkerSha256=WORKER, selectorPlanSha256=profile["plan_sha"],
        extractorSha256=EXTRACTOR, extractorSummarySha256=sha(summary_raw), observationsSha256=sha(obs_raw),
        observationsBytes=len(obs_raw), byteVerifierSha256=profile["verifier_sha"], byteVerifierVersion=receipt["tool"],
        byteVerificationReceiptSha256=sha(receipt_raw), byteVerificationSha256=sha(proof_raw),
        originalMasterSha256=summary.get("original_master_sha256"),
        exporter=VERSION, exporterSha256=sha(bounded_bytes(__file__, 262144)),
        platforms=["xbox"], gameBuild=None, originalDirectoryMembershipProven=False,
        selectedField=selectors[profile["selector"]], selectedFieldOffset=profile["offsets"][profile["selector"]],
        sourcePayloadSha256=sorted({r["source"]["source_sha256"] for rs in groups.values() for r in rs}),
        schemaLayoutSha256=sorted({r["native_schema"]["layout_sha256"] for rs in groups.values() for r in rs}),
        semanticDomainConfidence="candidate", saveMapping="unvalidated")
    counts = dict(verifiedInputOccurrences=count, selectedOccurrences=selected_counts[profile["selector"]],
        excludedOtherSelectorOccurrences=count - selected_counts[profile["selector"]],
        nonzeroSelectedOccurrences=sum(map(len, groups.values())), distinctNonzeroNativeValues=len(groups),
        zeroSelectedOccurrences=selected_counts[profile["selector"]] - sum(map(len, groups.values())))
    return groups, provenance, counts


def witness(row, occurrences):
    src, schema = row["source"], row["native_schema"]
    field, content = schema["selected_field"], src["content_key"]
    return dict(namespace=row["namespace"], sourceSha256=src["source_sha256"],
        decodedDocumentSha256=src["output_sha256"], contentKeySha256=src["content_key_sha256"],
        graphicsSha256=content["gfx_sha256"] or None, contentKeyGraphicsBase=content["gfx_base"],
        format=content["format"], structHash=schema["struct_hash"], structHash32=schema["hash32"],
        structHash64=schema["hash64"], structBytes=schema["byte_size"], schemaLayoutSha256=schema["layout_sha256"],
        fieldHash=field["field_hash"], fieldIndex=field["field_index"], fieldOffset=str(field["byte_offset"]),
        fieldType=field["field_type"], fieldSubtype=field["field_subtype"],
        fieldReferenceIndex=field["reference_index"], fieldExtraHex=field["extra_hex"],
        instanceOffset=row["instance_offset"], instanceIndex=row["instance_index"],
        instanceOffsetSpace="psin-magic-origin" if content["format"] == "psin" else "decoder-combined-system-plus-aligned-graphics",
        contentLocationId=row["content_location_id"], observationCount=occurrences,
        rawBytesVerified=True, platforms=["xbox"], gameBuild=None)


def augment(base_export, weapon_native_dir, weapon_proof, item_native_dir, item_proof, output):
    base_export, output = Path(base_export), Path(output)
    require(not output.exists(), "fresh_export_directory_required")
    files = {name: bounded_bytes(base_export / name) for name in
             ("entities/vehicles.json", "entities/weapons.json", "entities/items.json", "sources.json")}
    documents = {name: json.loads(raw) for name, raw in files.items()}
    sources = documents["sources.json"]["sources"]
    source_ids = {s["id"] for s in sources}
    require(len(source_ids) == len(sources), "duplicate_source_identity")
    require(not any(p["source_id"] in source_ids for p in PROFILES.values()), "base_export_already_augmented")
    datasets = {}
    for key, native, proof in (("weapon", weapon_native_dir, weapon_proof), ("item", item_native_dir, item_proof)):
        datasets[key] = load_native(native, proof, PROFILES[key])
    stats = {}
    for key, profile in PROFILES.items():
        groups, provenance, counts = datasets[key]
        entries = documents["entities/" + profile["category"] + ".json"]["entries"]
        require(len(entries) <= MAX_ROWS and len({e["id"] for e in entries}) == len(entries), "entity_count_or_identity_limit")
        matched, matched_values = [], set()
        for entry in entries:
            ids, attrs = entry.get("nativeIds", {}), entry.get("attributes", {})
            if ids.get("referenceNamespace") != "website-reported:GTA.ZONE:" + profile["domain"]:
                continue
            raw_reference = ids.get("referenceId")
            match = HEX.fullmatch(raw_reference) if isinstance(raw_reference, str) else None
            if not match or not int(match[1], 16):
                continue
            value = "0x" + match[1].lower()
            if value not in groups:
                continue
            reported = attrs.get("reportedIdentifierMetadata", {}).get("referenceId")
            require(reported == dict(domain=profile["domain"], representation="hex", bitWidth=32, confidence="candidate") and
                    entry.get("confidence") == "candidate" and entry.get("applicability") == {"platforms": ["xbox"], "build": None} and
                    attrs.get("editorReady") is False and attrs.get("saveMapping") == "unvalidated" and
                    attrs.get("runtimeAvailability") == "unverified", "website_candidate_scope_or_representation_changed")
            require(profile["key"] not in ids and not any(k in attrs for k in ("nativeWitnesses", "nativeObservationCount", "distinctContentLocations")),
                    "entry_already_has_native_reference_evidence")
            original = [c for c in attrs.get("crosswalk", []) if c.get("kind") == "website-native-id" and
                        c.get("nativeIdKey") == "referenceId" and c.get("matchMethod") == "literal_exact" and
                        c.get("confidence") == "candidate" and c.get("comparedText") == raw_reference]
            require(original and all(c.get("sourceRef") in source_ids and isinstance(c.get("label"), str) and c["label"] and
                    (c.get("sourceRecordId") or c.get("location")) for c in original), "original_website_identifier_evidence_required")
            by_location = defaultdict(list)
            for row in groups[value]:
                by_location[row["content_location_id"]].append(row)
            witnesses = [witness(sorted(rs, key=lambda r: r["occurrence_id"])[0], len(rs)) for _, rs in sorted(by_location.items())]
            ids[profile["key"]] = value
            attrs.setdefault("identifierMetadata", {})[profile["key"]] = dict(domain=profile["domain"], representation="hex", bitWidth=32)
            attrs.update(nativeObservationCount=len(groups[value]), distinctContentLocations=len(by_location), nativeWitnesses=witnesses,
                nativeObservationCountsByNamespace=dict(Counter(r["namespace"] for r in groups[value])), nativeDomainConfidence="candidate")
            for original_relation in original:
                relation = {k: original_relation[k] for k in ("sourceRef", "sourceRecordId", "location", "label", "namespace", "url") if k in original_relation}
                relation.update(kind="website-label", nativeIdKey=profile["key"], comparedText=raw_reference,
                                matchMethod="hash32_value_exact", confidence="candidate")
                attrs["crosswalk"].append(relation)
            for w in witnesses:
                entry["evidence"].append(dict(sourceRef=profile["source_id"],
                    location=f"payload-sha256:{w['sourceSha256']}; struct:0x{w['structHash']}; instance-offset:{w['instanceOffset']}; field:0x{w['fieldHash']}; field-offset:{w['fieldOffset']}",
                    method="Schema-selected little-endian u32 verified against full-hash source payload; native reference meaning and website label relation remain candidates; save mapping unvalidated"))
            matched.append(entry["id"])
            matched_values.add(value)
        sources.append(dict(id=profile["source_id"], kind="maintainer-research-summary",
            title="Reviewed native " + ("WeaponSpec" if key == "weapon" else "ItemId") + " reference scalar observations",
            locator="Maintainer-held metadata; selected scalar identifiers and structural provenance only",
            revision="2026-11-22; observations-sha256:" + provenance["observationsSha256"],
            license="SaveRift original research metadata; no license to underlying game files or assets is granted",
            attribution="SaveRift research using the pinned standalone SixNG metadata reader",
            allowedUse="Factual identifier scalars, candidate website relationships and provenance; no payloads, assets or player state",
            provenance=provenance))
        stats[key] = dict(counts, augmentedEntries=len(matched), corroboratedDistinctValues=len(matched_values),
            corroboratingNativeOccurrences=sum(len(groups[v]) for v in matched_values),
            corroboratingContentLocations=len({r["content_location_id"] for v in matched_values for r in groups[v]}),
            nativeValuesRemainingOnlyInStaging=len(groups) - len(matched_values))
    report = dict(schema="saverift.gta-vi.native-reference-augmentation-report.v1", tool=VERSION, status="completed",
        exporterSha256=sha(bounded_bytes(__file__, 262144)), baseFileSha256={name: sha(raw) for name, raw in files.items()},
        categories=stats, newEntities=0, newSources=2, newSaveLinks=0, editabilityChanges=0,
        interpretation=["Only existing website-reported hexadecimal spec/item candidates with equal native scalar values are augmented.",
            "Observation counts retain repeated document occurrences; content-location counts deduplicate repeated native content.",
            "WeaponName, computed hashes, other reference domains and unmatched numeric values do not create identifiers or entities.",
            "Candidate labels, unknown native game build, runtime availability and save mapping remain unvalidated."])
    # Preserve prior public reports, never copy arbitrary directories or sidecars.
    prior_reports = sorted(base_export.glob("*-report.json"))
    require(len(prior_reports) <= 16 and not any(p.name == "native-reference-report.json" for p in prior_reports), "prior_report_limit_or_already_augmented")
    for path in prior_reports:
        files[path.name] = bounded_bytes(path, 8 * 1024 * 1024)
    for name in ("links.json", "save-mappings/ps5.json", "save-mappings/xbox.json"):
        if (base_export / name).exists():
            files[name] = bounded_bytes(base_export / name, 8 * 1024 * 1024)
    report["baseFileSha256"] = {name: sha(raw) for name, raw in files.items()}
    for name in ("entities/weapons.json", "entities/items.json", "sources.json"):
        files[name] = (json.dumps(documents[name], indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()
    files["native-reference-report.json"] = (json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()
    require(sum(map(len, files.values())) <= 128 * 1024 * 1024, "public_export_byte_limit")
    output.mkdir(parents=True)
    for name, raw in files.items():
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as handle:
            handle.write(raw)
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("base-export", "weapon-native-dir", "weapon-proof", "item-native-dir", "item-proof", "output"):
        p.add_argument("--" + name, type=Path, required=True)
    args = p.parse_args()
    report = augment(**vars(args))
    print(pack({k: report[k] for k in ("tool", "status", "categories", "newEntities", "newSaveLinks")}))


if __name__ == "__main__":
    main()
