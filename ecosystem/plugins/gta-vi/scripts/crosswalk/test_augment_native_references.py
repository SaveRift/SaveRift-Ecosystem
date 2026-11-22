"""Manufactured native/reference joins; no game data, DB, network or Epic access."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

import augment_native_references as a

PRIVATE = "PRIVATE_PAYLOAD_PATH_OR_OBJECT_JSON"


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value) + "\n", encoding="utf-8")


def jl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = ("".join(a.pack(r) + "\n" for r in rows)).encode()
    path.write_bytes(raw)
    return raw


def observation(selector, document, value="12345678"):
    content = dict(format=selector["format"], source_sha256="a" * 64, gfx_sha256="", gfx_base="0",
                   adapter=a.ADAPTER, upstream_commit=a.UPSTREAM, worker_sha256=a.WORKER)
    layout, offset = "b" * 64, "64"
    field = {k: selector[k] for k in ("field_index", "field_hash", "field_type", "field_subtype", "reference_index", "extra_hex")}
    field.update(byte_offset=16 if selector["format"] == "psin" else 4 * selector["field_index"],
                 field_name=selector["field_hash"], is_array_element=0)
    record = a.digest([content, layout, offset])
    return dict(schema="saverift.gta-vi.native-lookup-observation.v1", selector_id=selector["id"],
        category=selector["category"], namespace=selector["namespace"], identifier_role=selector["role"],
        identifier=dict(value_kind="hash32", width_bits=32, hex=value, decoded_json_type="integer",
                        decoded_value_text=str(int(value, 16)), zero_value=int(value, 16) == 0),
        source=dict(document_id=document * 64, run_id="test", payload_id="test-" + document,
            source_sha256=content["source_sha256"], output_sha256="c" * 64,
            content_key=content, content_key_sha256=a.digest(content),
            document_quality=dict(field_key_collision_count=0, missing_instance_count=0, unavailable_blocks=0),
            source_bytes=4096, path=PRIVATE, archive=PRIVATE, object_json=PRIVATE),
        native_schema=dict(struct_hash=selector["struct_hash"], hash32=selector["struct_hash"][-8:],
            hash64=selector["struct_hash"] if selector["format"] == "psin" else None,
            byte_size=selector["struct_sizes"][0], layout_sha256=layout, selected_field=field),
        instance_index=0, instance_offset=offset, record_key=record,
        content_location_id=a.digest([record, selector["id"], field["field_index"], field["field_hash"]]),
        occurrence_id=a.digest([document * 64, selector["id"], layout, 0, offset]),
        applicability=dict(platforms=["xbox"], build=None), confidence="observed_decoded_metadata", save_mapping=None)


def entry(identifier, domain="spec", suffix="one", representation="hex"):
    return dict(id="gta-vi:" + ("items" if domain == "item" else "weapons") + ":website-test-" + suffix,
        name={"en": "Synthetic label " + suffix}, confidence="candidate", applicability=dict(platforms=["xbox"], build=None),
        nativeIds=dict(referenceId=identifier, referenceNamespace="website-reported:GTA.ZONE:" + domain),
        attributes=dict(recordRole="website_reported_identifier", editorReady=False, saveMapping="unvalidated",
            runtimeAvailability="unverified", websiteClaimedBuild="1.0.2.1", websiteClaimedBuildScope="website-claim",
            nativeUnknownScope=True, reportedIdentifierMetadata=dict(referenceId=dict(domain=domain,
                representation=representation, bitWidth=32 if representation == "hex" else None, confidence="candidate")),
            crosswalk=[dict(kind="website-native-id", nativeIdKey="referenceId", sourceRef="web-source", sourceRecordId="source-" + suffix,
                location="body-sha256:" + "d" * 64 + "; json-pointer:/e/0/4/34", label="Synthetic label " + suffix,
                comparedText=identifier, namespace="website-reported:GTA.ZONE:" + domain,
                url="https://gta.zone/drinks-and-drugs/", matchMethod="literal_exact", confidence="candidate")]),
        evidence=[dict(sourceRef="web-source", location="json-pointer:/e/0/4/34", method="Website claim only")])


class Fixture:
    def __init__(self, root):
        self.root, self.base, self.output = root, root / "base", root / "out"
        self.rows = {}
        for key, p in a.PROFILES.items():
            plan = json.loads((a.HERE / p["plan"]).read_bytes())
            if key == "weapon":
                self.rows[key] = [observation(plan["selectors"][0], "1", "87654321"),
                                  observation(plan["selectors"][1], "1"), observation(plan["selectors"][1], "2")]
            else:
                self.rows[key] = [observation(plan["selectors"][0], "3", "abcdef01")]
        self.weapons = [entry("0x12345678"), entry("0x87654321", suffix="name-only"),
                        entry("0x12345678", domain="preset", suffix="wrong-domain"),
                        entry("0x99999999", suffix="unmatched"), entry("0x00000000", suffix="zero"),
                        entry("WEAPONSPEC_LITERAL", suffix="calculated-only", representation="literal")]
        self.weapons[-1]["attributes"]["hashCandidates"] = [dict(value="0x12345678", algorithm="joaat32")]
        self.items = [entry("0xABCDEF01", domain="item"), entry("0x12345678", domain="item", suffix="cross-domain")]
        self.write_base()
        self.write_native()

    def write_base(self):
        save(self.base / "entities/vehicles.json", dict(entries=[dict(id="gta-vi:vehicles:untouched", preserve=True)]))
        save(self.base / "entities/weapons.json", dict(entries=self.weapons))
        save(self.base / "entities/items.json", dict(entries=self.items))
        save(self.base / "sources.json", dict(sources=[dict(id="web-source", title="Synthetic website source")]))
        save(self.base / "website-crosswalk-report.json", dict(existing="report preserved"))
        save(self.base / "save-mappings/xbox.json", dict(entries=[dict(editable=False)]))

    def write_native(self):
        for key, rows in self.rows.items():
            p = a.PROFILES[key]
            native, proof_dir = self.root / key, self.root / (key + "-proof")
            plan = json.loads((a.HERE / p["plan"]).read_bytes())
            obs = jl(native / "observations.jsonl", rows)
            summary = dict(tool="saverift-native-lookup-staging/0.1.0", script_sha256=a.EXTRACTOR, selectors_sha256=p["plan_sha"],
                selection_basis=plan["selection_basis"], status="completed", scope_complete=True, inventory_only=False,
                all_selected_observations_valid=True, issues={}, conflicting_content_locations=0,
                distinct_content_locations=len({r["content_location_id"] for r in rows}), original_master_sha256="f" * 64,
                counts=dict(emitted_observations=len(rows)), selector_counts={sid: dict(emitted_observations=sum(r["selector_id"] == sid for r in rows))
                    for sid in {r["selector_id"] for r in rows}},
                outputs={"observations.jsonl": dict(rows=len(rows), bytes=len(obs), sha256=a.sha(obs))})
            save(native / "summary.json", summary)
            proof = []
            for number, row in enumerate(rows, 1):
                r = {k: row[k] for k in ("occurrence_id", "content_location_id", "namespace")}
                r.update(document_id=row["source"]["document_id"], input_line=number, status="verified", field_byte_count=4,
                         expected_scalar_hex=row["identifier"]["hex"], actual_scalar_hex=row["identifier"]["hex"],
                         file_region="system", file_offset=str(int(row["instance_offset"]) + row["native_schema"]["selected_field"]["byte_offset"]))
                if key == "item":
                    r.update(payload_format="psin", offset_space="psin-magic-origin")
                proof.append(r)
            proof_raw = jl(proof_dir / "verification.jsonl", proof)
            save(proof_dir / "receipt.json", dict(tool="saverift-native-lookup-byte-verification/" + p["verifier_version"],
                script_sha256=p["verifier_sha"], extractor_sha256=a.EXTRACTOR, extractor_summary_sha256=a.sha((native / "summary.json").read_bytes()),
                selectors_sha256=p["plan_sha"], status="completed", all_observations_verified=True, database_checkpoint_unchanged=True,
                issues=0, issue_counts={}, file_issue_counts={}, observations_sha256=a.sha(obs), observations_bytes=len(obs),
                verification_sha256=a.sha(proof_raw), verification_bytes=len(proof_raw), observations_count=len(rows),
                verified_occurrences=len(rows), written_verification_rows=len(rows), remaining_verification_rows=0,
                verified_content_locations=summary["distinct_content_locations"], status_counts=dict(verified=len(rows))))

    def run(self):
        return a.augment(self.base, self.root / "weapon", self.root / "weapon-proof/receipt.json",
                         self.root / "item", self.root / "item-proof/receipt.json", self.output)


class AugmentationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.f = Fixture(Path(self.tmp.name))

    def test_exact_native_values_add_only_correlated_existing_rows_and_preserve_claims(self):
        f = self.f
        before = {p: p.read_bytes() for p in f.root.rglob("*") if p.is_file()}
        report = f.run()
        weapons = json.loads((f.output / "entities/weapons.json").read_bytes())["entries"]
        items = json.loads((f.output / "entities/items.json").read_bytes())["entries"]
        self.assertEqual(len(weapons), len(f.weapons))
        self.assertEqual(weapons[1:], f.weapons[1:])
        self.assertEqual(items[1:], f.items[1:])
        self.assertEqual(weapons[0]["nativeIds"]["weaponSpecHash32"], "0x12345678")
        self.assertEqual(items[0]["nativeIds"]["itemHash32"], "0xabcdef01")
        self.assertEqual(items[0]["nativeIds"]["referenceId"], "0xABCDEF01")
        attrs = weapons[0]["attributes"]
        self.assertEqual((attrs["nativeObservationCount"], attrs["distinctContentLocations"]), (2, 1))
        self.assertEqual(attrs["nativeWitnesses"][0]["observationCount"], 2)
        for new, old in ((weapons[0], f.weapons[0]), (items[0], f.items[0])):
            self.assertEqual(new["confidence"], "candidate")
            self.assertEqual(new["applicability"], old["applicability"])
            for k in ("editorReady", "saveMapping", "runtimeAvailability", "websiteClaimedBuild", "websiteClaimedBuildScope", "nativeUnknownScope", "reportedIdentifierMetadata"):
                self.assertEqual(new["attributes"][k], old["attributes"][k])
            relation = new["attributes"]["crosswalk"][-1]
            self.assertEqual((relation["kind"], relation["matchMethod"], relation["comparedText"], relation["confidence"]),
                             ("website-label", "hash32_value_exact", old["nativeIds"]["referenceId"], "candidate"))
            self.assertEqual(new["attributes"]["crosswalk"][0], old["attributes"]["crosswalk"][0])
        self.assertEqual(report["newEntities"], 0)
        self.assertEqual(report["newSaveLinks"], 0)
        self.assertEqual(report["categories"]["weapon"]["excludedOtherSelectorOccurrences"], 1)
        self.assertEqual((f.output / "entities/vehicles.json").read_bytes(), before[f.base / "entities/vehicles.json"])
        self.assertEqual((f.output / "website-crosswalk-report.json").read_bytes(), before[f.base / "website-crosswalk-report.json"])
        self.assertEqual((f.output / "save-mappings/xbox.json").read_bytes(), before[f.base / "save-mappings/xbox.json"])
        self.assertEqual({p: p.read_bytes() for p in before}, before)
        for p in f.output.rglob("*.json"):
            self.assertNotIn(PRIVATE, p.read_text())

    def test_provenance_receipt_or_exact_input_tampering_is_rejected(self):
        cases = [("weapon-proof/receipt.json", "script_sha256", "0" * 64),
                 ("item-proof/receipt.json", "selectors_sha256", "0" * 64),
                 ("weapon-proof/receipt.json", "extractor_summary_sha256", "0" * 64),
                 ("item/summary.json", "script_sha256", "0" * 64)]
        for filename, field, value in cases:
            with self.subTest(field=field, file=filename):
                self.f.write_native()
                path = self.f.root / filename
                data = json.loads(path.read_bytes())
                data[field] = value
                save(path, data)
                with self.assertRaises(ValueError): self.f.run()
                self.assertFalse(self.f.output.exists())
        self.f.write_native()
        p = self.f.root / "item-proof/verification.jsonl"
        p.write_bytes(p.read_bytes().replace(b"abcdef01", b"abcdef02", 1))
        with self.assertRaises(ValueError): self.f.run()

    def test_rebound_but_wrong_descriptor_namespace_or_full_hash_cannot_promote(self):
        original = deepcopy(self.f.rows)
        for change in ("namespace", "type", "fullhash"):
            with self.subTest(change=change):
                self.f.rows = deepcopy(original)
                row = self.f.rows["item"][0]
                if change == "namespace": row["namespace"] = "vehicle.configuration.itemId"
                if change == "type": row["native_schema"]["selected_field"]["field_type"] = "15"
                if change == "fullhash": row["native_schema"]["struct_hash"] = "00000000c0458831"
                self.f.write_native()
                with self.assertRaises(ValueError): self.f.run()
                self.assertFalse(self.f.output.exists())

    def test_rebound_per_row_byte_proof_mismatch_is_rejected(self):
        p = self.f.root / "item-proof/verification.jsonl"
        row = json.loads(p.read_bytes())
        row["actual_scalar_hex"] = "abcdef02"
        raw = jl(p, [row])
        receipt_path = p.with_name("receipt.json")
        receipt = json.loads(receipt_path.read_bytes())
        receipt.update(verification_sha256=a.sha(raw), verification_bytes=len(raw))
        save(receipt_path, receipt)
        with self.assertRaisesRegex(ValueError, "per_observation_byte_proof_mismatch"): self.f.run()

    def test_no_save_ready_or_observed_label_promotion_and_fresh_output_required(self):
        self.f.weapons[0]["attributes"]["editorReady"] = True
        self.f.write_base()
        with self.assertRaisesRegex(ValueError, "website_candidate_scope"): self.f.run()
        self.f.weapons[0]["attributes"]["editorReady"] = False
        self.f.write_base()
        self.f.run()
        with self.assertRaisesRegex(ValueError, "fresh_export"): self.f.run()


if __name__ == "__main__":
    unittest.main()
