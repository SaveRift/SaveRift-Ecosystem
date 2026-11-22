"""Manufactured probe, catalog and proof receipts; no private facts or game data."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import augment_weapon_definition_names as a


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value) + "\n", encoding="utf-8")


def write_lines(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = ("".join(a.pack(r) + "\n" for r in rows)).encode()
    path.write_bytes(raw)
    return raw


class Fixture:
    def __init__(self, root):
        self.root, self.base, self.probe, self.out = root, root / "base", root / "probe", root / "out"
        self.rows, self.native_rows, self.layouts, self.entries = [], [], {}, []
        self.plan = json.loads((a.HERE / "weapon-name-selectors.json").read_bytes())
        for number, (domain, token) in enumerate((("WeaponSpec", "WEAPONSPEC_SYNTHETIC"),
                ("WeaponPreset", "weaponpreset_synthetic"), ("WeaponRecipe", "WEAPONRECIPE_SYNTHETIC"),
                ("WeaponType", "WEAPON_SYNTHETIC"))):
            self.add(domain, token, number)
        self.entries.append(dict(id="gta-vi:weapons:unrelated", name={"en": "Untouched"}, nativeIds={"referenceId": "OTHER"}))
        self.write_base()
        self.write_probe()
        self.write_native()

    def add(self, domain, token, number):
        struct_hash, (size, index, offset) = next(iter(a.SHAPES[domain].items()))
        f = dict(field_index=index, field_hash="acec22be", field_name="Name", byte_offset=offset, field_type="4a",
                 field_subtype="00", reference_index=0, extra_hex="00000000", is_array_element=0)
        layout = dict(format="psin", struct_hash=struct_hash, hash32=struct_hash[-8:], hash64=struct_hash, byte_size=size,
                      members=[{k: v for k, v in f.items() if k != "field_name"}])
        layout_sha = a.common.digest(layout)
        self.layouts[layout_sha] = layout
        content = dict(format="psin", source_sha256=a.sha((token + "source").encode()), gfx_sha256="", gfx_base="0",
                       adapter=a.common.ADAPTER, upstream_commit=a.common.UPSTREAM, worker_sha256=a.common.WORKER)
        docid, output_sha, position = a.sha((token + "doc").encode()), a.sha((token + "decoded").encode()), "64"
        value = a.pool.joaat(token.lower())
        if domain in a.DOMAIN:
            selector = next(s for s in self.plan["selectors"] if s["struct_hash"] == struct_hash)
            record = a.common.digest([content, layout_sha, position])
            obs = dict(schema="saverift.gta-vi.native-lookup-observation.v1", selector_id=selector["id"], category="weapons",
                namespace=selector["namespace"], identifier_role=selector["role"],
                identifier=dict(value_kind="hash32", width_bits=32, hex=f"{value:08x}", decoded_value_text=str(value), decoded_json_type="integer", zero_value=False),
                native_schema=dict(struct_hash=struct_hash, hash32=struct_hash[-8:], hash64=struct_hash, byte_size=size, layout_sha256=layout_sha, selected_field=f),
                source=dict(document_id=docid, run_id="synthetic", payload_id=token, source_sha256=content["source_sha256"], output_sha256=output_sha,
                    content_key=content, content_key_sha256=a.common.digest(content), archive="packs.rpf", source_offset=str(202665984 + number),
                    source_bytes=4096, graphics_bytes=None, line_number=number + 1,
                    document_quality=dict(field_key_collision_count=0, missing_instance_count=0, unavailable_blocks=0)),
                instance_index=0, instance_offset=position, record_key=record,
                content_location_id=a.common.digest([record, selector["id"], index, "acec22be"]),
                occurrence_id=a.common.digest([docid, selector["id"], layout_sha, 0, position]),
                applicability=dict(platforms=["xbox"], build=None), confidence="observed_decoded_metadata", save_mapping=None)
            self.native_rows.append(obs)
        witness = dict(sourceSha256=content["source_sha256"], decodedDocumentSha256=output_sha,
            contentKeySha256=a.common.digest(content), documentId=docid, archive="packs.rpf", archiveOffset=str(202665984 + number),
            structHash=struct_hash, structBytes=size, schemaLayoutSha256=layout_sha, field=f, instanceOffset=position, instanceIndex=0,
            contentLocationId=a.common.digest([content, layout_sha, position, "acec22be", index, offset]), rawBytesReverified=False)
        pointer = f"/e/{number}/2" if domain == "WeaponSpec" else f"/e/{number}/4/54/0"
        methods = ["joaat32_lowercase"] + (["joaat32_exact"] if token == token.lower() else [])
        for method in methods:
            self.rows.append(dict(schema="saverift.gta-vi.psin-name-token-match.v2", domain=domain, token=token,
                hashInputText=token.lower(), method=method, value=f"0x{value:08x}", websiteOccurrenceCount=1,
                websiteWitnesses=[dict(sourceRecordId="record-" + str(number), jsonPointer=pointer)],
                nativeFieldNamespace="psin:" + struct_hash + ":Name:field-index:" + str(index),
                nativeFieldMeaning="Name field; definition and save domain unknown", confidence="candidate",
                instanceObservations=1, documentObservations=1, distinctPayloads=1, distinctContentLocations=1,
                witness=witness, definitionIdentityVerified=False, saveMappingVerified=False))
        if domain not in a.DOMAIN:
            return
        short = a.DOMAIN[domain]
        location = f"url:{a.DATA_URL}; body-sha256:{a.pool.DATA_SHA}; json-pointer:{pointer}"
        self.entries.append(dict(id="gta-vi:weapons:website-synthetic-" + short, name={"en": token}, confidence="candidate",
            applicability=dict(platforms=["xbox"], build=None), nativeIds=dict(referenceId=token, referenceNamespace="website-reported:GTA.ZONE:" + short),
            attributes=dict(editorReady=False, saveMapping="unvalidated", runtimeAvailability="unverified", websiteClaimedBuild="1.0.2.1",
                websiteIdentityVerified=False, reportedIdentifierMetadata=dict(referenceId=dict(domain=short, representation="literal", bitWidth=None, confidence="candidate")),
                crosswalk=[dict(kind="website-native-id", nativeIdKey="referenceId", sourceRef=a.WEBSITE_SOURCE,
                    sourceRecordId="record-" + str(number), location=location, comparedText=token, label=token,
                    matchMethod="literal_exact", confidence="candidate")]),
            evidence=[dict(sourceRef=a.WEBSITE_SOURCE, location=location, method="Website candidate")]))

    def write_base(self):
        save(self.base / "entities/weapons.json", dict(entries=self.entries))
        save(self.base / "entities/vehicles.json", dict(entries=[]))
        save(self.base / "entities/items.json", dict(entries=[]))
        save(self.base / "sources.json", dict(sources=[dict(id=a.WEBSITE_SOURCE, provenance=dict(dataSha256=a.pool.DATA_SHA, dataUrl=a.DATA_URL))]))
        save(self.base / "save-mappings/xbox.json", dict(entries=[dict(editable=False)]))
        save(self.base / "native-reference-report.json", dict(existing=True))

    def write_probe(self):
        raw = write_lines(self.probe / "matches.jsonl", self.rows)
        by_domain = {}
        for domain, source_count in a.POOL_COUNTS.items():
            found = [r for r in self.rows if r["domain"] == domain]
            buckets = {a.bucket(r): r for r in found}
            by_domain[domain] = dict(sourceTokens=source_count, matchedTokens=len({r["token"] for r in found}),
                matchedNativeValues=len({r["value"] for r in found}), matchingInstanceObservations=sum(r["instanceObservations"] for r in buckets.values()),
                matchingDocumentObservations=len({r["witness"]["documentId"] for r in found}),
                matchingDistinctPayloads=len({r["witness"]["sourceSha256"] for r in found}),
                matchingContentLocations=sum(r["distinctContentLocations"] for r in buckets.values()))
        self.summary = dict(tool="saverift-weapon-psin-name-probe/0.2.0", scriptSha256=a.PROBE_SHA,
            helperSha256=a.common.EXTRACTOR, tokenPoolHelperSha256=a.POOL_SHA, upstreamCommit=a.common.UPSTREAM, decoderWorkerSha256=a.common.WORKER,
            status="completed", scopeComplete=True, allSelectedScalarsValid=True, databaseCheckpointUnchanged=True, issues={},
            matches=dict(sha256=a.sha(raw), bytes=len(raw), rows=len(self.rows)), matchingGroups=len(self.rows),
            scope=dict(wrapperStructHash=a.pool.ROOT_STRUCT, selectedFieldHash="acec22be", selectedFieldPreimage="Name", selectedFieldType="4a",
                archive="packs.rpf", archiveOffsetUnit="decimal bytes", inclusiveRange=[202600000, 205700000]),
            website=dict(factsSha256=a.pool.FACTS_SHA, datasetSha256=a.pool.DATA_SHA, datasetUrl=a.DATA_URL),
            counts=dict(valid_scalar_observations=4, matching_scalar_observations=sum(r["instanceObservations"] for r in {a.bucket(r): r for r in self.rows}.values())),
            byDomain=by_domain, layouts=self.layouts)
        save(self.probe / "summary.json", self.summary)

    def write_native(self):
        native_dir, proof_dir = self.root / "native", self.root / "proof"
        raw = write_lines(native_dir / "observations.jsonl", self.native_rows)
        summary = dict(tool="saverift-native-lookup-staging/0.1.0", script_sha256=a.common.EXTRACTOR,
            selectors_sha256=a.PLAN_SHA, selection_basis=self.plan["selection_basis"], status="completed", scope_complete=True,
            inventory_only=False, all_selected_observations_valid=True, original_master_sha256="f" * 64, issues={}, conflicting_content_locations=0,
            outputs={"observations.jsonl": dict(sha256=a.sha(raw), bytes=len(raw), rows=len(self.native_rows))},
            counts=dict(emitted_observations=len(self.native_rows)), distinct_content_locations=len({r["content_location_id"] for r in self.native_rows}),
            selector_counts={s["id"]: dict(emitted_observations=sum(r["selector_id"] == s["id"] for r in self.native_rows)) for s in self.plan["selectors"]})
        save(native_dir / "summary.json", summary)
        proof = []
        for number, r in enumerate(self.native_rows, 1):
            proof.append(dict(occurrence_id=r["occurrence_id"], content_location_id=r["content_location_id"], namespace=r["namespace"],
                document_id=r["source"]["document_id"], input_line=number, status="verified", field_byte_count=4,
                actual_scalar_hex=r["identifier"]["hex"], expected_scalar_hex=r["identifier"]["hex"], file_region="system",
                file_offset=str(int(r["instance_offset"]) + r["native_schema"]["selected_field"]["byte_offset"]), payload_format="psin", offset_space="psin-magic-origin"))
        proof_raw = write_lines(proof_dir / "verification.jsonl", proof)
        save(proof_dir / "receipt.json", dict(tool="saverift-native-lookup-byte-verification/0.2.0", script_sha256=a.common.PROFILES["item"]["verifier_sha"],
            extractor_sha256=a.common.EXTRACTOR, extractor_summary_sha256=a.sha((native_dir / "summary.json").read_bytes()), selectors_sha256=a.PLAN_SHA,
            status="completed", all_observations_verified=True, database_checkpoint_unchanged=True, issues=0, issue_counts={}, file_issue_counts={},
            observations_sha256=a.sha(raw), observations_bytes=len(raw), verification_sha256=a.sha(proof_raw), verification_bytes=len(proof_raw),
            observations_count=len(self.native_rows), verified_occurrences=len(self.native_rows), written_verification_rows=len(self.native_rows),
            remaining_verification_rows=0, status_counts=dict(verified=len(self.native_rows)), verified_content_locations=summary["distinct_content_locations"]))

    def run(self, with_proof=False):
        return a.augment(self.base, self.probe, self.out, self.root / "native" if with_proof else None,
                         self.root / "proof/receipt.json" if with_proof else None)


class NameEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.f = Fixture(Path(self.tmp.name))

    def test_adds_candidate_evidence_only_and_deduplicates_exact_lowercase_aliases(self):
        f = self.f
        before = {p: p.read_bytes() for p in f.root.rglob("*") if p.is_file()}
        report = f.run()
        entries = json.loads((f.out / "entities/weapons.json").read_bytes())["entries"]
        self.assertEqual(len(entries), len(f.entries))
        self.assertEqual(entries[-1], f.entries[-1])
        for new, old in zip(entries[:-1], f.entries[:-1]):
            self.assertEqual(new["nativeIds"], old["nativeIds"])
            self.assertEqual(new["name"], old["name"])
            self.assertEqual(new["confidence"], "candidate")
            self.assertEqual(new["applicability"], old["applicability"])
            self.assertFalse(new["attributes"]["editorReady"])
            for ev in new["attributes"]["nativeDefinitionNameEvidence"]:
                self.assertFalse(ev["rawBytesReverified"])
                self.assertFalse(ev["definitionIdentityVerified"])
                self.assertFalse(ev["nativeLiteralStringObserved"])
                self.assertFalse(ev["saveMappingVerified"])
        preset = entries[1]["attributes"]
        self.assertEqual(len(preset["nativeDefinitionNameEvidence"]), 2)
        self.assertEqual((preset["nativeDefinitionNameObservationCount"], preset["nativeDefinitionNameContentLocations"]), (1, 1))
        self.assertEqual(report["nativeObservationCount"], 3)
        self.assertEqual(report["newNativeIds"], 0)
        self.assertEqual(report["newEntities"], 0)
        self.assertEqual(report["excludedWeaponTypeGroups"], 1)
        self.assertEqual((f.out / "save-mappings/xbox.json").read_bytes(), before[f.base / "save-mappings/xbox.json"])
        self.assertEqual({p: p.read_bytes() for p in before}, before)

    def test_complete_optional_proof_corroborates_every_bucket_without_promoting_ids(self):
        report = self.f.run(with_proof=True)
        self.assertTrue(report["provenance"]["fullScalarByteCoverageEstablished"])
        entries = json.loads((self.f.out / "entities/weapons.json").read_bytes())["entries"]
        self.assertTrue(all(e["rawBytesReverified"] for entry in entries[:-1] for e in entry["attributes"]["nativeDefinitionNameEvidence"]))
        self.assertEqual([x["nativeIds"] for x in entries], [x["nativeIds"] for x in self.f.entries])

    def test_probe_digest_owner_or_website_case_tamper_rejects(self):
        f = self.f
        path = f.probe / "matches.jsonl"
        path.write_bytes(path.read_bytes() + b" ")
        with self.assertRaises(ValueError): f.run()
        f.write_probe()
        f.rows[0]["witness"]["structHash"] = "00000000bc92474a"
        f.write_probe()
        with self.assertRaisesRegex(ValueError, "unreviewed_name_owner"): f.run()
        self.assertFalse(f.out.exists())

    def test_exact_case_and_occurrence_source_are_required(self):
        self.f.entries[0]["nativeIds"]["referenceId"] = self.f.entries[0]["nativeIds"]["referenceId"].lower()
        self.f.write_base()
        with self.assertRaisesRegex(ValueError, "matched_website_token_missing"): self.f.run()

    def test_aliased_groups_with_different_counts_cannot_be_summed_or_silently_deduped(self):
        preset_exact = next(r for r in self.f.rows if r["domain"] == "WeaponPreset" and r["method"] == "joaat32_exact")
        preset_exact["instanceObservations"] = 2
        self.f.write_probe()
        with self.assertRaisesRegex(ValueError, "conflicting_occurrence_sets"): self.f.run()

    def test_optional_proof_requires_full_occurrences_and_correct_source_witness(self):
        self.f.native_rows[0]["source"]["archive"] = "other.rpf"
        self.f.write_native()
        with self.assertRaisesRegex(ValueError, "native_byte_coverage"): self.f.run(with_proof=True)
        self.f.native_rows[0]["source"]["archive"] = "packs.rpf"
        self.f.write_native()
        self.f.rows[0]["witness"]["contentLocationId"] = "0" * 64
        self.f.write_probe()
        with self.assertRaisesRegex(ValueError, "native_byte_proof_witness"): self.f.run(with_proof=True)

    def test_transport_shape_limit_is_enforced(self):
        self.f.entries[0]["attributes"]["manyNodes"] = [None] * 10001
        self.f.write_base()
        with self.assertRaisesRegex(ValueError, "entry_transport_shape_limit"): self.f.run()

    def test_same_count_changed_proof_between_selectors_is_rejected(self):
        original = a.common.load_native
        calls = 0

        def changed(*args):
            nonlocal calls
            groups, provenance, counts = original(*args)
            calls += 1
            if calls == 2:
                provenance["byteVerificationReceiptSha256"] = "0" * 64
            return groups, provenance, counts

        with patch.object(a.common, "load_native", side_effect=changed):
            with self.assertRaisesRegex(ValueError, "receipts_changed_between_selectors"):
                self.f.run(with_proof=True)


if __name__ == "__main__":
    unittest.main()
