#!/usr/bin/env python3
"""Attach candidate PSIN Name/u32 token correlations to existing website rows.

No catalog rows, nativeIds, labels, confidence or save bindings are promoted.
An optional complete native-byte proof strengthens only the scalar evidence.
"""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re

import augment_native_references as common
import probe_weapon_psin_tokens as pool

VERSION = "saverift-weapon-name-evidence/0.1.0"
HERE = Path(__file__).resolve().parent
COMMON_SHA = "6d4f671a3aa51ccb0f14af0d02c85e8de8cae3da544001fe487e77f838e7c69c"
PROBE_SHA = "b791523a331a652094776ee71a91a3a8f1f6f7f7ddcd6346676eab4cb58e3eb3"
POOL_SHA = "ed8a89c489c69d4597427a9fa4885b58f1288387890d2c55e271140b6cd9c98b"
PLAN_SHA = "457d6c685c79366dba084733b604859752fd4a2529a4967af445f310204b53a2"
SOURCE = "saverift-psin-weapon-name-correlations-2026-11-22"
WEBSITE_SOURCE = "gtazone-weapons-identifiers-2026-11-22"
DATA_URL = "https://negentropy.studio/assets/data/en/armas.8a77b0ac6c.json"
DOMAIN = {"WeaponSpec": "spec", "WeaponPreset": "preset", "WeaponRecipe": "recipe"}
SHAPES = {
    "WeaponSpec": {"473f474cbc92474a": (144, 0, 8)},
    "WeaponPreset": {"165141788d690ccf": (80, 0, 8)},
    "WeaponRecipe": {"adb0a97cdaa66e06": (112, 0, 8)},
    "WeaponType": {"ba6a7ba6454c2e3b": (1088, 0, 8), "18bfebf8f6ff3137": (264, 2, 16)},
}
POOL_COUNTS = {"WeaponSpec": 137, "WeaponPreset": 227, "WeaponRecipe": 176, "WeaponType": 112}
require, read_bytes, sha, pack = common.require, common.bounded_bytes, common.sha, common.pack


def check_tools():
    for filename, expected in (("augment_native_references.py", COMMON_SHA), ("probe_weapon_psin_names_v2.py", PROBE_SHA),
                               ("probe_weapon_psin_tokens.py", POOL_SHA), ("extract_native_lookup.py", common.EXTRACTOR),
                               ("weapon-name-selectors.json", PLAN_SHA)):
        require(sha(read_bytes(HERE / filename, 262144)) == expected, "frozen_name_evidence_dependency_changed")


def bucket(row):
    w = row["witness"]
    return w["structHash"], w["schemaLayoutSha256"], w["field"]["field_index"], row["value"]


def group_identity(row):
    return bucket(row) + (row["domain"], row["token"], row["method"])


def load_probe(directory):
    summary_raw = read_bytes(Path(directory) / "summary.json", 8 * 1024 * 1024)
    matches_raw = read_bytes(Path(directory) / "matches.jsonl", 16 * 1024 * 1024)
    s, rows = json.loads(summary_raw), common.lines(matches_raw)
    require(s.get("tool") == "saverift-weapon-psin-name-probe/0.2.0" and s.get("scriptSha256") == PROBE_SHA and
            s.get("helperSha256") == common.EXTRACTOR and s.get("tokenPoolHelperSha256") == POOL_SHA and
            s.get("upstreamCommit") == common.UPSTREAM and s.get("decoderWorkerSha256") == common.WORKER and
            s.get("status") == "completed" and s.get("scopeComplete") is True and s.get("allSelectedScalarsValid") is True and
            s.get("databaseCheckpointUnchanged") is True and not s.get("issues"), "complete_pinned_name_probe_required")
    require(s.get("matches") == dict(sha256=sha(matches_raw), bytes=len(matches_raw), rows=len(rows)) and
            s.get("matchingGroups") == len(rows) and rows, "probe_match_digest_size_or_count_changed")
    scope, website = s.get("scope", {}), s.get("website", {})
    require(scope.get("wrapperStructHash") == pool.ROOT_STRUCT and scope.get("selectedFieldHash") == "acec22be" and
            scope.get("selectedFieldPreimage") == "Name" and scope.get("selectedFieldType") == "4a" and
            scope.get("archive") == "packs.rpf" and scope.get("archiveOffsetUnit") == "decimal bytes" and
            scope.get("inclusiveRange") == [202600000, 205700000], "name_probe_scope_changed")
    require(website.get("factsSha256") == pool.FACTS_SHA and website.get("datasetSha256") == pool.DATA_SHA and
            website.get("datasetUrl") == DATA_URL, "website_token_pool_pin_changed")
    count_keys = {"wrapper_structure_documents", "excluded_outside_archive_or_inclusive_range", "range_wrapper_documents",
        "range_wrapper_documents_without_name_u32", "name_field_schema_observations", "selected_instance_field_opportunities",
        "valid_scalar_observations", "zero_scalar_observations", "matching_scalar_observations"}
    require(isinstance(s.get("counts"), dict) and set(s["counts"]) <= count_keys and
            all(type(n) is int and 0 <= n <= 1000000 for n in s["counts"].values()) and
            set(s.get("byDomain", {})) == set(POOL_COUNTS), "probe_count_contract_changed")
    seen, unique = set(), {}
    domains = defaultdict(list)
    for r in rows:
        w, domain, token = r["witness"], r["domain"], r["token"]
        require(domain in SHAPES and isinstance(token, str) and re.fullmatch(r"[A-Za-z0-9_]{1,256}", token), "invalid_token_domain")
        require(r.get("schema") == "saverift.gta-vi.psin-name-token-match.v2" and r.get("confidence") == "candidate" and
                r.get("definitionIdentityVerified") is False and r.get("saveMappingVerified") is False and
                w.get("rawBytesReverified") is False, "probe_claim_status_changed")
        require(r.get("method") in ("joaat32_exact", "joaat32_lowercase"), "unreviewed_hash_comparison")
        text = token if r["method"] == "joaat32_exact" else token.lower()
        require(r.get("hashInputText") == text and r.get("value") == f"0x{pool.joaat(text):08x}" and int(r["value"], 16) != 0,
                "token_hash_calculation_mismatch")
        require(w.get("structHash") in SHAPES[domain], "unreviewed_name_owner_for_token_domain")
        size, index, offset = SHAPES[domain][w["structHash"]]
        f = w["field"]
        require(set(f) == set(pool.native.FIELD_COLUMNS.split(",")) and
                w.get("structBytes") == size and f.get("field_index") == index and f.get("byte_offset") == offset and
                f.get("field_hash") == "acec22be" and f.get("field_name") == "Name" and f.get("field_type") == "4a" and
                f.get("field_subtype") == "00" and f.get("reference_index") == 0 and f.get("extra_hex") == "00000000" and
                f.get("is_array_element") in (False, 0), "name_field_descriptor_changed")
        require(r.get("nativeFieldNamespace") == "psin:" + w["structHash"] + ":Name:field-index:" + str(index), "native_name_namespace_changed")
        layout = s.get("layouts", {}).get(w["schemaLayoutSha256"])
        require(isinstance(layout, dict) and common.digest(layout) == w["schemaLayoutSha256"] and layout.get("format") == "psin" and
                layout.get("struct_hash") == layout.get("hash64") == w["structHash"] and layout.get("hash32") == w["structHash"][-8:] and
                layout.get("byte_size") == size and {k: v for k, v in f.items() if k != "field_name"} in layout.get("members", []),
                "name_schema_layout_binding_mismatch")
        require(all(common.valid_sha(w.get(k)) for k in ("sourceSha256", "decodedDocumentSha256", "contentKeySha256", "documentId", "contentLocationId")) and
                w.get("archive") == "packs.rpf" and isinstance(w.get("archiveOffset"), str) and w["archiveOffset"].isdecimal() and
                202600000 <= int(w["archiveOffset"]) <= 205700000 and isinstance(w.get("instanceOffset"), str) and w["instanceOffset"].isdecimal() and
                type(w.get("instanceIndex")) is int and w["instanceIndex"] >= 0, "name_witness_identity_or_scope_mismatch")
        require(all(type(r.get(k)) is int and r[k] >= 1 for k in ("instanceObservations", "documentObservations", "distinctPayloads", "distinctContentLocations", "websiteOccurrenceCount")) and
                r["documentObservations"] <= r["instanceObservations"] and r["distinctPayloads"] <= r["documentObservations"] and
                r["distinctContentLocations"] <= r["instanceObservations"], "invalid_probe_group_counts")
        require(isinstance(r.get("websiteWitnesses"), list) and 1 <= len(r["websiteWitnesses"]) <= 4 and
                all(isinstance(x.get("sourceRecordId"), str) and x["sourceRecordId"] and isinstance(x.get("jsonPointer"), str) and
                    re.fullmatch(r"/e/\d+(?:/\d+)+", x["jsonPointer"]) for x in r["websiteWitnesses"]), "website_witness_missing")
        require(group_identity(r) not in seen, "duplicate_probe_group")
        seen.add(group_identity(r))
        # The pinned probe gives all same-owner/value groups the same occurrence set.
        # Exact/lowercase aliases therefore must have identical counts and witness.
        identity = pack({k: r[k] for k in ("instanceObservations", "documentObservations", "distinctPayloads", "distinctContentLocations", "witness")})
        require(unique.setdefault(bucket(r), identity) == identity, "same_scalar_bucket_has_conflicting_occurrence_sets")
        domains[domain].append(r)
    native_buckets = {bucket(r): r for r in rows}
    require(s.get("counts", {}).get("matching_scalar_observations") == sum(r["instanceObservations"] for r in native_buckets.values()) and
            s.get("counts", {}).get("valid_scalar_observations", 0) >= s["counts"]["matching_scalar_observations"], "probe_scalar_totals_mismatch")
    for domain, source_count in POOL_COUNTS.items():
        found = domains[domain]
        unique_domain = {bucket(r): r for r in found}
        total = s.get("byDomain", {}).get(domain, {})
        require(set(total) == {"sourceTokens", "matchedTokens", "matchedNativeValues", "matchingInstanceObservations", "matchingDocumentObservations", "matchingDistinctPayloads", "matchingContentLocations"} and
                all(type(n) is int and 0 <= n <= 1000000 for n in total.values()) and
                total.get("sourceTokens") == source_count and total.get("matchedTokens") == len({r["token"] for r in found}) and
                total.get("matchedNativeValues") == len({r["value"] for r in found}) and
                total.get("matchingInstanceObservations") == sum(r["instanceObservations"] for r in unique_domain.values()) and
                total.get("matchingContentLocations") == sum(r["distinctContentLocations"] for r in unique_domain.values()), "probe_domain_totals_mismatch")
        require(len({r["witness"]["documentId"] for r in found}) <= total["matchingDocumentObservations"] <= sum(r["documentObservations"] for r in unique_domain.values()) and
                len({r["witness"]["sourceSha256"] for r in found}) <= total["matchingDistinctPayloads"] <=
                min(total["matchingDocumentObservations"], sum(r["distinctPayloads"] for r in unique_domain.values())), "probe_domain_identity_totals_mismatch")
    return rows, s, dict(summarySha256=sha(summary_raw), matchesSha256=sha(matches_raw), matchesBytes=len(matches_raw))


def proof_key(row):
    return row["native_schema"]["struct_hash"], row["native_schema"]["layout_sha256"], row["native_schema"]["selected_field"]["field_index"], "0x" + row["identifier"]["hex"]


def native_probe_location(row):
    f = row["native_schema"]["selected_field"]
    return common.digest([row["source"]["content_key"], row["native_schema"]["layout_sha256"], row["instance_offset"],
                          "acec22be", f["field_index"], f["byte_offset"]])


def match_byte_coverage(probe_rows, native_rows):
    indexed = defaultdict(list)
    for r in native_rows:
        src = r["source"]
        offset = src.get("source_offset")
        if src.get("archive") == "packs.rpf" and isinstance(offset, str) and offset.isdecimal() and 202600000 <= int(offset) <= 205700000:
            indexed[proof_key(r)].append(r)
    for key, r in {bucket(r): r for r in probe_rows if r["domain"] in DOMAIN}.items():
        found = indexed.get(key, [])
        w = r["witness"]
        require((len(found), len({x["source"]["document_id"] for x in found}), len({x["source"]["source_sha256"] for x in found}),
                 len({native_probe_location(x) for x in found})) ==
                (r["instanceObservations"], r["documentObservations"], r["distinctPayloads"], r["distinctContentLocations"]),
                "native_byte_coverage_does_not_match_probe_bucket")
        require(any(x["source"]["document_id"] == w["documentId"] and x["source"]["source_sha256"] == w["sourceSha256"] and
                    x["source"]["output_sha256"] == w["decodedDocumentSha256"] and x["source"]["content_key_sha256"] == w["contentKeySha256"] and
                    x["instance_offset"] == w["instanceOffset"] and x["instance_index"] == w["instanceIndex"] and
                    native_probe_location(x) == w["contentLocationId"] for x in found), "native_byte_proof_witness_mismatch")


def optional_proof(native_dir, proof_path, probe_rows):
    require(bool(native_dir) == bool(proof_path), "provide_both_name_native_dir_and_name_proof")
    if not native_dir:
        return None
    plan = json.loads(read_bytes(HERE / "weapon-name-selectors.json"))
    rows, provenance, input_counts = [], [], []
    for selector in plan["selectors"]:
        profile = dict(plan="weapon-name-selectors.json", plan_sha=PLAN_SHA, selector=selector["id"],
            verifier="verify_native_lookup_bytes_v2.py", verifier_version="0.2.0", verifier_sha=common.PROFILES["item"]["verifier_sha"],
            offsets={s["id"]: 8 for s in plan["selectors"]})
        groups, source, counts = common.load_native(native_dir, proof_path, profile)
        rows.extend(r for rs in groups.values() for r in rs)
        provenance.append(source)
        input_counts.append(counts["verifiedInputOccurrences"])
    match_byte_coverage(probe_rows, rows)
    first = provenance[0]
    require(len(set(input_counts)) == 1, "native_proof_input_changed_between_selectors")
    binding_keys = ("extractorSummarySha256", "observationsSha256", "byteVerificationReceiptSha256", "byteVerificationSha256")
    require(all(tuple(p[k] for k in binding_keys) == tuple(first[k] for k in binding_keys) for p in provenance),
            "native_proof_receipts_changed_between_selectors")
    return dict({k: first[k] for k in ("selectorPlanSha256", "extractorSha256", "extractorSummarySha256", "observationsSha256",
        "observationsBytes", "byteVerifierSha256", "byteVerifierVersion", "byteVerificationReceiptSha256", "byteVerificationSha256")},
        verifiedInputOccurrences=input_counts[0])


def original_relations(entry):
    token = entry["nativeIds"]["referenceId"]
    result = []
    for c in entry.get("attributes", {}).get("crosswalk", []):
        if ((c.get("kind"), c.get("nativeIdKey"), c.get("sourceRef"), c.get("matchMethod"), c.get("confidence"), c.get("comparedText")) !=
                ("website-native-id", "referenceId", WEBSITE_SOURCE, "literal_exact", "candidate", token)):
            continue
        parts = dict(part.split(":", 1) for part in c.get("location", "").split("; ") if ":" in part)
        if parts.get("url") == DATA_URL and parts.get("body-sha256") == pool.DATA_SHA and "json-pointer" in parts:
            result.append((c["sourceRecordId"], parts["json-pointer"], c["location"]))
    return result


def transport_check(entry):
    require(len(pack(entry).encode()) <= 111 * 1024, "entry_transport_byte_limit")
    stack, nodes = [(entry, 2)], 0
    while stack:
        value, depth = stack.pop()
        nodes += 1
        require(nodes <= 9990 and depth <= 20, "entry_transport_shape_limit")
        children = value.values() if isinstance(value, dict) else value if isinstance(value, list) else ()
        stack.extend((child, depth + 1) for child in children)


def augment(base_export, probe_dir, output, name_native_dir=None, name_proof=None):
    check_tools()
    base_export, output = Path(base_export), Path(output)
    require(not output.exists() and not output.resolve().is_relative_to(base_export.resolve()), "fresh_output_outside_base_required")
    rows, summary, probe_binding = load_probe(probe_dir)
    byte_proof = optional_proof(name_native_dir, name_proof, rows)
    files = {name: read_bytes(base_export / name) for name in ("entities/vehicles.json", "entities/weapons.json", "entities/items.json", "sources.json")}
    weapons, sources = json.loads(files["entities/weapons.json"]), json.loads(files["sources.json"])
    source_ids = {s["id"] for s in sources["sources"]}
    require(len(source_ids) == len(sources["sources"]) and WEBSITE_SOURCE in source_ids and SOURCE not in source_ids, "source_registry_missing_duplicate_or_already_augmented")
    website_source = next(s for s in sources["sources"] if s["id"] == WEBSITE_SOURCE)
    require(website_source.get("provenance", {}).get("dataSha256") == pool.DATA_SHA and
            website_source["provenance"].get("dataUrl") == DATA_URL, "base_website_source_pin_changed")
    entries = defaultdict(list)
    require(len({e["id"] for e in weapons["entries"]}) == len(weapons["entries"]), "duplicate_catalog_identity")
    for entry in weapons["entries"]:
        ids = entry.get("nativeIds", {})
        for source_domain, domain in DOMAIN.items():
            if ids.get("referenceNamespace") == "website-reported:GTA.ZONE:" + domain:
                entries[source_domain, ids.get("referenceId")].append(entry)
    selected = defaultdict(list)
    for row in rows:
        if row["domain"] in DOMAIN:
            selected[row["domain"], row["token"]].append(row)
    augmented, by_domain = [], Counter()
    for (domain, token), evidence_rows in sorted(selected.items()):
        found = entries.get((domain, token), [])
        require(found, "matched_website_token_missing_from_base_export")
        relations = {pair[:2] for entry in found for pair in original_relations(entry)}
        require(all((w["sourceRecordId"], w["jsonPointer"]) in relations for row in evidence_rows for w in row["websiteWitnesses"]),
                "probe_website_occurrence_not_in_original_catalog_evidence")
        evidence = []
        for row in evidence_rows:
            w = row["witness"]
            evidence.append(dict(sourceRef=SOURCE, evidenceKind="imported-u32-token-hash-correlation", domain=DOMAIN[domain],
                comparedText=token, hashInputText=row["hashInputText"], matchMethod=row["method"], decodedScalarValue=row["value"],
                representation="hex", bitWidth=32, nativeFieldNamespace=row["nativeFieldNamespace"], field=w["field"],
                structHash=w["structHash"], structBytes=w["structBytes"], schemaLayoutSha256=w["schemaLayoutSha256"],
                sourceSha256=w["sourceSha256"], decodedDocumentSha256=w["decodedDocumentSha256"], contentKeySha256=w["contentKeySha256"],
                instanceOffset=w["instanceOffset"], instanceIndex=w["instanceIndex"], contentLocationId=w["contentLocationId"],
                nativeObservationCount=row["instanceObservations"], distinctContentLocations=row["distinctContentLocations"],
                documentObservations=row["documentObservations"], distinctPayloads=row["distinctPayloads"], confidence="candidate",
                definitionIdentityVerified=False, nativeLiteralStringObserved=False, saveMappingVerified=False,
                rawBytesReverified=bool(byte_proof), rawByteVerificationScope="all occurrences in this probe bucket" if byte_proof else "not performed by the database probe"))
        # One probe bucket's exact and lowercase comparisons refer to the same set.
        unique = {bucket(r): r for r in evidence_rows}
        for entry in found:
            attrs = entry.get("attributes", {})
            require(entry.get("confidence") == "candidate" and entry.get("applicability") == {"platforms": ["xbox"], "build": None} and
                    attrs.get("editorReady") is False and attrs.get("saveMapping") == "unvalidated" and attrs.get("runtimeAvailability") == "unverified" and
                    attrs.get("reportedIdentifierMetadata", {}).get("referenceId") == dict(domain=DOMAIN[domain], representation="literal", bitWidth=None, confidence="candidate") and
                    "nativeDefinitionNameEvidence" not in attrs and original_relations(entry), "website_claim_scope_or_prior_evidence_changed")
            attrs["nativeDefinitionNameEvidence"] = evidence
            attrs["nativeDefinitionNameObservationCount"] = sum(r["instanceObservations"] for r in unique.values())
            attrs["nativeDefinitionNameContentLocations"] = sum(r["distinctContentLocations"] for r in unique.values())
            entry["evidence"].append(dict(sourceRef=SOURCE,
                location="probe-matches-sha256:" + probe_binding["matchesSha256"] + "; token-domain:" + DOMAIN[domain] + "; token:" + token,
                method="Candidate JOAAT comparison of a website literal to a PSIN Name/u32 value; native literal string, definition role and save meaning remain unverified"))
            transport_check(entry)
            augmented.append(entry["id"])
            by_domain[DOMAIN[domain]] += 1
    provenance = dict(probe=summary["tool"], probeSha256=PROBE_SHA, tokenPoolHelperSha256=POOL_SHA,
        extractorHelperSha256=common.EXTRACTOR, upstreamCommit=common.UPSTREAM, decoderWorkerSha256=common.WORKER,
        **probe_binding, websiteFactsSha256=pool.FACTS_SHA, websiteDatasetSha256=pool.DATA_SHA,
        scope={k: summary["scope"][k] for k in ("wrapperStructHash", "selectedFieldHash", "selectedFieldPreimage", "selectedFieldType", "archive", "archiveOffsetUnit", "inclusiveRange")},
        rawByteVerification=byte_proof, fullScalarByteCoverageEstablished=bool(byte_proof),
        scalarByteVerificationScope=["WeaponSpec", "WeaponPreset", "WeaponRecipe"], excludedFromScalarByteCoverage=["WeaponType"],
        definitionIdentityVerified=False, nativeLiteralStringsObserved=False, saveMappingEstablished=False,
        platforms=["xbox"], gameBuild=None, exporter=VERSION, exporterSha256=sha(read_bytes(__file__, 262144)))
    sources["sources"].append(dict(id=SOURCE, kind="maintainer-research-summary", title="PSIN Name/u32 correlations with reported weapon tokens",
        locator="Maintainer-held PSIN metadata and pinned website identifier facts; structural provenance and candidate relationships only",
        revision="2026-11-22; probe-matches-sha256:" + probe_binding["matchesSha256"],
        license="SaveRift original research metadata; no license to game files or assets is granted",
        attribution="SaveRift research using the pinned SixNG reader and attributed GTA.ZONE native-token claims",
        allowedUse="Factual scalar observations, candidate token relationships and provenance; no payloads, assets or player state", provenance=provenance))
    report = dict(schema="saverift.gta-vi.weapon-name-evidence-report.v1", tool=VERSION, status="completed", provenance=provenance,
        sourceProbeCounts=summary["counts"], sourceProbeDomains=summary["byDomain"],
        matchedWebsiteTokensByDomain={DOMAIN[d]: len({r["token"] for r in rows if r["domain"] == d}) for d in DOMAIN},
        augmentedRowsByDomain=dict(by_domain), augmentedRows=len(augmented),
        nativeObservationCount=sum(r["instanceObservations"] for r in {bucket(r): r for r in rows if r["domain"] in DOMAIN}.values()),
        nativeContentLocations=sum(r["distinctContentLocations"] for r in {bucket(r): r for r in rows if r["domain"] in DOMAIN}.values()),
        excludedWeaponTypeGroups=sum(r["domain"] == "WeaponType" for r in rows),
        newEntities=0, newNativeIds=0, newSources=1, newSaveLinks=0, editabilityChanges=0,
        interpretation=["Matched tokens are candidate correlations with numeric Name fields, not recovered native literal strings or newly established definition IDs.",
            "Exact/lowercase groups sharing an owner/layout/descriptor/value bucket count once; different owning namespaces remain separate.",
            "WeaponType results remain in the probe summary and do not create or augment independent public identity rows."])
    for path in sorted(base_export.glob("*-report.json")):
        require(path.name != "weapon-name-evidence-report.json", "base_already_has_name_report")
        files[path.name] = read_bytes(path, 8 * 1024 * 1024)
    for name in ("links.json", "save-mappings/ps5.json", "save-mappings/xbox.json"):
        if (base_export / name).exists():
            files[name] = read_bytes(base_export / name, 8 * 1024 * 1024)
    report["baseFileSha256"] = {name: sha(raw) for name, raw in files.items()}
    for name, value in (("entities/weapons.json", weapons), ("sources.json", sources), ("weapon-name-evidence-report.json", report)):
        files[name] = (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()
    require(sum(map(len, files.values())) <= 128 * 1024 * 1024, "export_byte_limit")
    output.mkdir(parents=True)
    for name, raw in files.items():
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("base-export", "probe-dir", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--name-native-dir", type=Path)
    parser.add_argument("--name-proof", type=Path)
    report = augment(**vars(parser.parse_args()))
    print(pack({k: report[k] for k in ("tool", "status", "matchedWebsiteTokensByDomain", "augmentedRows", "newEntities", "newNativeIds", "newSources")}))


if __name__ == "__main__":
    main()
