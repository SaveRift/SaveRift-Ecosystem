"""Synthetic export regressions. No Epic, real payloads, or network access."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
SPEC = importlib.util.spec_from_file_location("reviewed_crosswalk_builder", HERE / "export-editor-crosswalk.py")
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)
PRIVATE = "PRIVATE_ONLY_CAPTURE_PATH_COOKIE_OR_PROSE"


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False) + "\n", encoding="utf-8")


def entry(key, native_ids):
    return {"id": key, "name": {"en": "Existing synthetic entry"}, "nativeIds": native_ids,
            "attributes": {"preserveMe": ["original", 7]}, "confidence": "observed",
            "applicability": {"platforms": ["xbox"], "build": None},
            "evidence": [{"sourceRef": "existing-source", "location": "/synthetic/item/1",
                          "method": "Synthetic literal observation"}]}


def observation(value="047430ea", variation=False):
    return {"occurrence_id": "2" * 64 if variation else "1" * 64,
            "content_location_id": "4" * 64 if variation else "3" * 64,
            "selector_id": "vehicle-variation-model-reference" if variation else "vehicle-configuration-model-reference",
            "namespace": "vehicle.variation.modelReference" if variation else "vehicle.configuration.modelReference",
            "identifier_role": "model_reference", "instance_offset": "80", "instance_index": 0,
            "identifier": {"width_bits": 32, "value_kind": "hash32", "hex": value,
                           "decoded_value_text": str(int(value, 16))},
            "applicability": {"platforms": ["xbox"], "build": None},
            "native_schema": {"struct_hash": "fc1c7000" if variation else "51019114",
                              "byte_size": 168 if variation else 144, "layout_sha256": "5" * 64,
                              "selected_field": {"field_index": 2 if variation else 3,
                                                 "field_hash": "fb1f80ff", "field_type": "4a",
                                                 "field_subtype": "00", "reference_index": 0,
                                                 "extra_hex": "00000000", "is_array_element": False,
                                                 "byte_offset": 24}},
            "source": {"source_sha256": "a" * 64, "content_key_sha256": "b" * 64,
                       "output_sha256": "c" * 64, "archive": "packs.rpf", "source_offset": "16",
                       "content_key": {"gfx_sha256": "", "gfx_base": "0"},
                       "document_quality": {"field_key_collision_count": 0, "missing_instance_count": 0,
                                            "unavailable_blocks": 0},
                       "private_payload_path": PRIVATE, "object_json": PRIVATE}}


def website(key="synthetic:first", label="Synthetic Vehicle Label", slug="gym"):
    return {"record_key": key, "site": "gta6database", "site_record_id": key,
            "namespace": "gta6database:catalog-record", "category": "vehicles", "entity_type": "vehicle",
            "label": label, "url": "https://www.gta6database.com/database/vehicles/synthetic-fixture",
            "site_status": "unconfirmed", "description": PRIVATE,
            "identifiers": [{"kind": "website_slug", "namespace": "gta6database:website_slug", "raw_text": slug}],
            "evidence": [{"source_id": "synthetic:captured-site", "response_id": "synthetic:response:7",
                          "json_pointer": "/catalog/3", "selector": None, "body_sha256": "d" * 64,
                          "request_url": "https://www.gta6database.com/private?cookie=" + PRIVATE}]}


class Fixture:
    def __init__(self, root, value="047430ea"):
        self.data, self.native, self.output = root / "baseline", root / "native", root / "output"
        self.factual_path, self.receipt_path = root / "facts.json", root / "receipt.json"
        self.vehicles = {"category": "vehicles", "entries": [
            entry("gta-vi:vehicles:existing-token", {"configurationId": "Gym", "configurationNamespace": "XML:CVehiclePerformanceMaps:MapKey"}),
            entry("gta-vi:vehicles:other-domain", {"configurationId": "gym", "configurationNamespace": "XML:NotAModel:MapKey"})]}
        self.weapons = {"category": "weapons", "entries": [
            entry("gta-vi:weapons:existing-" + domain, {"referenceId": literal, "referenceNamespace": ns})
            for domain, literal, ns in [("spec", "SPEC_SYNTHETIC", "XML:WeaponSpec_reference"),
                                        ("preset", "PresetSynthetic", "XML:WeaponPreset_reference"),
                                        ("recipe", "RecipeSynthetic", "XML:WeaponRecipe_reference"),
                                        ("loadout", "NPC_LOADOUT_SYNTHETIC", "XML:NPCLoadout_reference")]]}
        self.sources = {"sources": [{"id": "existing-source", "title": "Existing public synthetic source",
                                     "locator": "synthetic:baseline", "preserveMe": "unchanged"}]}
        self.factual = {"records": [website()], "sources": [
            {"source_id": "synthetic:captured-site", "source_kind": "har", "source_filename": PRIVATE,
             "source_sha256": "e" * 64, "source_bytes": 128, "site_origin": "https://www.gta6database.com",
             "captured_at": "2026-11-20T17:04:58.555Z", "source_sha256_scope": "whole-capture"}]}
        self.rows = [observation(value), observation(value, variation=True)]
        wrong_domain = observation("12345678")
        wrong_domain.update(occurrence_id="6" * 64, content_location_id="7" * 64,
                            selector_id="vehicle-model-info-game-name", namespace="vehicle.modelInfo.gameName",
                            identifier_role="display_name_reference")
        self.rows.append(wrong_domain)
        self.write_baseline()
        self.write_native()

    def write_baseline(self):
        save(self.data / "entities/vehicles.json", self.vehicles)
        save(self.data / "entities/weapons.json", self.weapons)
        save(self.data / "sources.json", self.sources)
        save(self.data / "entities/items.json", {"entries": [entry("gta-vi:items:npc-loadout", {"referenceId": "NPC_LOADOUT_SYNTHETIC"})]})
        save(self.data / "save-mappings/xbox.json", {"entries": [{"id": "existing-map", "editable": False}]})
        save(self.factual_path, self.factual)

    def write_native(self):
        self.native.mkdir(exist_ok=True)
        path = self.native / "observations.jsonl"
        path.write_text("".join(json.dumps(row) + "\n" for row in self.rows), encoding="utf-8")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        save(self.native / "summary.json", {"status": "completed", "scope_complete": True, "issues": {},
             "all_selected_observations_valid": True, "conflicting_content_locations": 0,
             "outputs": {"observations.jsonl": {"sha256": digest}}, "counts": {"emitted_observations": len(self.rows)},
             "selection_basis": {"upstream_commit": "f" * 40}, "selectors_sha256": "8" * 64,
             "script_sha256": builder.EXTRACTOR_SHA})
        proof = self.receipt_path.with_name("verification.jsonl")
        proof.write_text("".join(json.dumps({"occurrence_id": row["occurrence_id"], "status": "verified"}) + "\n"
                                 for row in self.rows), encoding="utf-8")
        save(self.receipt_path, {"status": "completed", "all_observations_verified": True,
             "observations_sha256": digest, "verified_occurrences": len(self.rows),
             "tool": "saverift-native-lookup-byte-verification/0.1.0", "script_sha256": builder.VERIFIER_SHA,
             "extractor_sha256": builder.EXTRACTOR_SHA,
             "extractor_summary_sha256": hashlib.sha256((self.native / "summary.json").read_bytes()).hexdigest(),
             "selectors_sha256": "8" * 64, "issues": 0, "issue_counts": {}, "file_issue_counts": {},
             "verification_sha256": hashlib.sha256(proof.read_bytes()).hexdigest(),
             "verification_bytes": proof.stat().st_size, "status_counts": {"verified": len(self.rows)},
             "written_verification_rows": len(self.rows), "remaining_verification_rows": 0})

    def run(self):
        return builder.build(self.data, self.native, self.factual_path, self.receipt_path, self.output)

    def read_output(self, path):
        return json.loads((self.output / path).read_text(encoding="utf-8"))

    def new_model(self):
        return next(e for e in self.read_output("entities/vehicles.json")["entries"] if e["id"].startswith("gta-vi:vehicles:model-hash-"))


class ExportCrosswalkTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.fixture = Fixture(Path(self.temporary.name))

    def test_additive_rows_preserve_existing_ids_names_provenance_and_input_files(self):
        f = self.fixture
        before = {p: p.read_bytes() for p in Path(self.temporary.name).rglob("*") if p.is_file()}
        report = f.run()
        for category, original in (("vehicles", f.vehicles), ("weapons", f.weapons)):
            result = {e["id"]: e for e in f.read_output("entities/" + category + ".json")["entries"]}
            for old in original["entries"]:
                retained = deepcopy(result[old["id"]])
                retained["attributes"].pop("hashCandidates", None)
                self.assertEqual(retained, old)
        self.assertEqual(f.read_output("sources.json")["sources"][0], f.sources["sources"][0])
        self.assertEqual({p: p.read_bytes() for p in before}, before)
        self.assertEqual(report["observedModelHashes"], 1)
        self.assertEqual(report["modelObservationCount"], 2)
        self.assertEqual(report["excludedNativeObservations"], {"vehicle.modelInfo.gameName": 1})
        self.assertEqual(report["newSaveLinks"], 0)
        self.assertEqual(report["editabilityChanges"], 0)
        self.assertFalse((f.output / "save-mappings").exists())
        with self.assertRaises(ValueError):
            f.run()

    def test_website_evidence_is_precise_and_source_origin_is_not_the_site_key(self):
        f = self.fixture
        f.run()
        model = f.new_model()
        sources = {s["id"]: s for s in f.read_output("sources.json")["sources"]}
        rows = [r for r in model["attributes"]["crosswalk"] if r["kind"] == "website-label"]
        self.assertEqual({r["matchMethod"] for r in rows}, {"joaat32_exact", "joaat32_lowercase"})
        self.assertEqual(len(rows), 2)
        for row in rows:
            self.assertEqual(row["label"], "Synthetic Vehicle Label")
            self.assertEqual(row["comparedText"], "gym")
            self.assertEqual(row["namespace"], "gta6database:website_slug")
            self.assertEqual(row["sourceRecordId"], "synthetic:first")
            self.assertIn("response:synthetic:response:7", row["location"])
            self.assertIn("body-sha256:" + "d" * 64, row["location"])
            self.assertIn("json-pointer:/catalog/3", row["location"])
            self.assertEqual(row["confidence"], "candidate")
            self.assertEqual(row["siteStatusScope"], "website-claim")
            self.assertEqual(row["siteStatus"], "unconfirmed")
            source = sources[row["sourceRef"]]
            self.assertEqual(source["locator"], "https://www.gta6database.com/")
            self.assertEqual(source["provenance"]["captureSha256"], "e" * 64)
            self.assertFalse(source["provenance"]["websiteIdentifiersAreNativeIds"])
        self.assertEqual(model["confidence"], "candidate")
        self.assertFalse(model["attributes"]["editorReady"])
        for witness in model["attributes"]["nativeWitnesses"]:
            self.assertEqual(witness["instanceOffsetSpace"], "decoder-combined-system-plus-aligned-graphics")
            self.assertEqual(witness["contentKeyGraphicsBase"], "0")
            self.assertNotIn("graphicsBase", witness)
        for ev in model["evidence"]:
            self.assertIn(ev["sourceRef"], sources)
        for path in f.output.rglob("*.json"):
            self.assertNotIn(PRIVATE, path.read_text(encoding="utf-8"))

    def test_only_lowercase_matches_uppercase_slug_without_changing_compared_text(self):
        f = self.fixture
        f.factual["records"][0]["identifiers"][0]["raw_text"] = "Gym"
        f.write_baseline()
        f.run()
        rows = [r for r in f.new_model()["attributes"]["crosswalk"] if r["kind"] == "website-label"]
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["comparedText"], rows[0]["matchMethod"]), ("Gym", "joaat32_lowercase"))

    def test_multiple_website_labels_remain_visible_without_a_preferred_website_label(self):
        f = self.fixture
        f.vehicles["entries"] = f.vehicles["entries"][1:]
        f.factual["records"] = [website("synthetic:a", "First Label"), website("synthetic:b", "Second Label")]
        f.write_baseline()
        f.run()
        model = f.new_model()
        self.assertEqual(model["name"]["en"], "Vehicle model 0x047430ea")
        self.assertEqual(model["confidence"], "observed")
        self.assertTrue(model["attributes"]["labelAmbiguity"]["multipleWebsiteLabels"])
        self.assertEqual({r["label"] for r in model["attributes"]["crosswalk"]}, {"First Label", "Second Label"})
        self.assertTrue(all(r["confidence"] == "candidate" for r in model["attributes"]["crosswalk"]))

    def test_real_hash_collision_with_one_display_label_forces_numeric_name(self):
        f = self.fixture
        for row in f.rows[:2]:
            row["identifier"].update(hex="eda6c2f2", decoded_value_text=str(0xeda6c2f2))
        f.write_native()
        f.factual["records"] = [website(label="synthetic_collision_23904", slug="synthetic_collision_27200")]
        f.write_baseline()
        f.run()
        model = f.new_model()
        self.assertEqual(model["name"]["en"], "Vehicle model 0xeda6c2f2")
        self.assertEqual(model["confidence"], "observed")
        flags = model["attributes"]["labelAmbiguity"]
        self.assertFalse(flags["multipleWebsiteLabels"])
        self.assertTrue(flags["distinctHashInputsShareHash"])
        self.assertEqual(len(model["attributes"]["crosswalk"]), 4)

    def test_collision_between_native_token_and_website_slug_is_also_ambiguous(self):
        f = self.fixture
        for row in f.rows[:2]:
            row["identifier"].update(hex="eda6c2f2", decoded_value_text=str(0xeda6c2f2))
        f.write_native()
        f.vehicles["entries"][0]["nativeIds"]["configurationId"] = "synthetic_collision_23904"
        f.factual["records"] = [website(label="Single Website Label", slug="synthetic_collision_27200")]
        f.write_baseline()
        f.run()
        model = f.new_model()
        self.assertEqual(model["name"]["en"], "Vehicle model 0xeda6c2f2")
        self.assertTrue(model["attributes"]["labelAmbiguity"]["distinctHashInputsShareHash"])
        self.assertEqual({r["kind"] for r in model["attributes"]["crosswalk"]},
                         {"native-token-hash", "website-label"})
        self.assertEqual(len(model["attributes"]["crosswalk"]), 4)

    def test_weapon_domains_are_calculations_only_and_loadouts_get_no_item_hash(self):
        f = self.fixture
        f.run()
        weapons = f.read_output("entities/weapons.json")["entries"]
        for index, domain in enumerate(("spec", "preset", "recipe")):
            row = weapons[index]
            self.assertEqual(row["nativeIds"], f.weapons["entries"][index]["nativeIds"])
            self.assertEqual({h["domain"] for h in row["attributes"]["hashCandidates"]}, {domain})
            self.assertEqual({h["transform"] for h in row["attributes"]["hashCandidates"]}, {"exact", "lowercase"})
            self.assertTrue(all(h["confidence"] == "candidate" for h in row["attributes"]["hashCandidates"]))
        self.assertEqual(weapons[3], f.weapons["entries"][3])
        self.assertFalse((f.output / "entities/items.json").exists())
        for group in (weapons, f.read_output("entities/vehicles.json")["entries"]):
            for row in group:
                self.assertNotIn("itemHash32", row["nativeIds"])
                self.assertFalse(any(key.startswith("weapon") and key.endswith("Hash32") for key in row["nativeIds"]))
        other = next(e for e in f.read_output("entities/vehicles.json")["entries"] if e["id"].endswith("other-domain"))
        self.assertNotIn("hashCandidates", other["attributes"])

    def test_failed_or_mismatched_byte_receipt_rejects_before_output(self):
        f = self.fixture
        original = json.loads(f.receipt_path.read_text())
        for change in ({"status": "failed"}, {"all_observations_verified": False},
                       {"observations_sha256": "f" * 64}, {"verified_occurrences": 999},
                       {"script_sha256": "f" * 64}, {"extractor_sha256": "f" * 64},
                       {"extractor_summary_sha256": "f" * 64}, {"selectors_sha256": "f" * 64},
                       {"issues": 1}, {"file_issue_counts": {"source_changed": 1}},
                       {"verification_bytes": 0}, {"status_counts": {"rejected": len(f.rows)}},
                       {"written_verification_rows": 0}, {"remaining_verification_rows": 1}):
            with self.subTest(change=change):
                save(f.receipt_path, {**original, **change})
                with self.assertRaises(ValueError):
                    f.run()
                self.assertFalse(f.output.exists())

    def test_changed_verification_proof_rejects_even_with_the_same_byte_length(self):
        f = self.fixture
        proof = f.receipt_path.with_name("verification.jsonl")
        before = proof.read_bytes()
        changed = before.replace(b"verified", b"rejected", 1)
        self.assertNotEqual(changed, before)
        self.assertEqual(len(changed), len(before))
        proof.write_bytes(changed)
        with self.assertRaises(ValueError):
            f.run()
        self.assertFalse(f.output.exists())

    def test_changed_observations_or_wrong_selected_field_domain_reject(self):
        f = self.fixture
        path = f.native / "observations.jsonl"
        original = path.read_bytes()
        path.write_bytes(original + b"\n")
        with self.assertRaises(ValueError):
            f.run()
        self.assertFalse(f.output.exists())
        path.write_bytes(original)
        f.rows[0]["namespace"] = "vehicle.modelInfo.gameName"
        f.write_native()  # Receipt now matches the bytes, but not the allowed field role.
        with self.assertRaises(ValueError):
            f.run()
        self.assertFalse(f.output.exists())

    def test_private_or_unapproved_detail_urls_are_rejected_without_export(self):
        f = self.fixture
        for url in ("https://www.gta6database.com/path?token=" + PRIVATE,
                    "https://user:secret@www.gtabase.com/path", "https://unapproved.example/path"):
            with self.subTest(host=urlsplit(url).hostname):
                f.factual["records"][0]["url"] = url
                f.write_baseline()
                with self.assertRaises(ValueError):
                    f.run()
                self.assertFalse(f.output.exists())


if __name__ == "__main__":
    unittest.main()
