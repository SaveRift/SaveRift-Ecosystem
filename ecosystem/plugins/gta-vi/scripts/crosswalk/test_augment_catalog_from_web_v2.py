"""Focused tests for broader source-backed identities; no network or Epic."""
from copy import deepcopy
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import augment_catalog_from_web as v1
import augment_catalog_from_web_v2 as v2
from test_augment_catalog_from_web import fixture, factual_record, old_entry


def run(data):
    return v2.augment_catalog(**data)


def reported(outputs, category, domain):
    return [entry for entry in outputs[f"entities/{category}.json"]["entries"]
            if entry.get("nativeIds", {}).get("referenceNamespace") == "website-reported:GTA.ZONE:" + domain]


class BroadWebsiteIdentityTests(unittest.TestCase):
    def test_unmatched_models_are_retained_without_observed_model_hashes(self):
        data = fixture()
        data["facts"]["records"].extend([
            factual_record("vehicles", "Model_Not_In_Native_Sample", "Unmatched Model", index=7),
            factual_record("vehicles", "0x000000Af", "Unmatched Numeric Model", index=8)])
        original = deepcopy(data)
        outputs = run(data)
        self.assertEqual(data, original)
        rows = reported(outputs, "vehicles", "model")
        self.assertEqual({e["nativeIds"]["referenceId"] for e in rows}, {"Model_Not_In_Native_Sample", "0x000000Af"})
        for entry in rows:
            self.assertEqual(set(entry["nativeIds"]), {"referenceId", "referenceNamespace"})
            self.assertFalse(entry["attributes"]["nativeModelValueCorroborated"])
            self.assertFalse(entry["attributes"]["editorReady"])
            self.assertEqual(entry["confidence"], "candidate")
            self.assertEqual(entry["applicability"], {"platforms": ["xbox"], "build": None})
        literal = next(e for e in rows if e["nativeIds"]["referenceId"].startswith("Model_"))
        self.assertEqual({h["transform"] for h in literal["attributes"]["hashCandidates"]}, {"exact", "lowercase"})
        numeric = next(e for e in rows if e["nativeIds"]["referenceId"].startswith("0x"))
        self.assertNotIn("hashCandidates", numeric["attributes"])
        self.assertEqual(numeric["attributes"]["reportedIdentifierMetadata"]["referenceId"]["bitWidth"], 32)
        summary = outputs["web-augmentation-report.json"]
        self.assertEqual(summary["addedReportedModelClaims"], 2)
        self.assertEqual(summary["retainedVehicleWebsiteIdentities"], 3)
        self.assertEqual(summary["vehicleCoverage"]["matchedWebsiteVehicleRecords"], 1)

    def test_flattened_tokens_preserve_all_occurrences_and_parent_specs(self):
        outputs = run(fixture())
        for domain in ("preset", "recipe"):
            rows = reported(outputs, "weapons", domain)
            self.assertEqual(len(rows), 1)
            row = rows[0]
            self.assertEqual(row["name"]["en"], row["nativeIds"]["referenceId"])
            self.assertEqual(row["attributes"]["websiteNameScope"], "literal-token")
            self.assertEqual(row["attributes"]["sourceOccurrenceCount"], 2)
            self.assertEqual(row["attributes"]["relatedSpecCount"], 2)
            relationships = row["attributes"]["websiteReportedRelations"]
            self.assertEqual({r["sourceRecordId"] for r in relationships}, {"literal-spec", "hex-spec"})
            self.assertEqual({r["value"] for r in relationships}, {"WeaponSpec_Mixed_Default", "0x0000000A"})
            self.assertTrue(all(r["sourceLocation"] == r["sourceListLocation"] + "/0" for r in relationships))
            parent_ids = {e["id"] for e in reported(outputs, "weapons", "spec")}
            self.assertTrue(all(r["relatedCatalogId"] in parent_ids for r in relationships))
            self.assertEqual(len(row["evidence"]), 2)
            self.assertEqual(len(row["attributes"]["crosswalk"]), 2)
            for occurrence in row["attributes"]["crosswalk"]:
                self.assertEqual(occurrence["comparedText"], row["nativeIds"]["referenceId"])
                self.assertEqual(occurrence["matchMethod"], "literal_exact")
                self.assertTrue(occurrence["location"].endswith("/0"))

    def test_identity_is_exact_case_and_domain_and_repeated_list_elements_survive(self):
        data = fixture()
        first = data["weapons_facts"]["records"][0]
        first["fields"]["namedPresets"]["value"] = ["CaseToken", "casetoken", "CaseToken"]
        first["fields"]["namedRecipes"]["value"] = ["CaseToken"]
        for key in ("namedPresets", "namedRecipes"):
            data["weapons_facts"]["records"][1]["fields"].pop(key)
        outputs = run(data)
        rows = reported(outputs, "weapons", "preset") + reported(outputs, "weapons", "recipe")
        self.assertEqual(len(rows), 3)
        self.assertEqual(len({e["id"] for e in rows}), 3)
        self.assertEqual({(e["attributes"]["reportedIdentifierMetadata"]["referenceId"]["domain"], e["nativeIds"]["referenceId"]) for e in rows},
                         {("preset", "CaseToken"), ("preset", "casetoken"), ("recipe", "CaseToken")})
        upper = next(e for e in reported(outputs, "weapons", "preset") if e["nativeIds"]["referenceId"] == "CaseToken")
        self.assertEqual({r["sourceLocation"] for r in upper["attributes"]["websiteReportedRelations"]},
                         {"/e/0/4/54/0", "/e/0/4/54/2"})
        self.assertEqual(upper["attributes"]["sourceOccurrenceCount"], 2)
        self.assertEqual(upper["attributes"]["relatedSpecCount"], 1)

    def test_existing_xml_references_remain_unchanged_and_are_not_merged(self):
        data = fixture()
        existing = old_entry("weapons", "observed-xml-preset")
        existing["nativeIds"] = {"referenceId": "WeaponPreset_SYNTHETIC", "referenceNamespace": "XML:WeaponPreset_reference"}
        data["weapons"]["entries"].append(existing)
        outputs = run(data)
        self.assertEqual(next(e for e in outputs["entities/weapons.json"]["entries"] if e["id"] == existing["id"]), existing)
        row = reported(outputs, "weapons", "preset")[0]
        self.assertNotEqual(row["id"], existing["id"])
        self.assertEqual(row["confidence"], "candidate")
        self.assertEqual(set(row["nativeIds"]), {"referenceId", "referenceNamespace"})

    def test_all_new_domains_have_source_evidence_without_runtime_promotions(self):
        outputs = run(fixture())
        registered = {s["id"] for s in outputs["sources.json"]["sources"]}
        for domain in ("preset", "recipe"):
            for row in reported(outputs, "weapons", domain):
                self.assertEqual(row["attributes"]["reportedIdentifierMetadata"]["referenceId"],
                    {"domain": domain, "representation": "literal", "bitWidth": None, "confidence": "candidate"})
                self.assertEqual({h["domain"] for h in row["attributes"]["hashCandidates"]}, {domain})
                self.assertEqual({h["transform"] for h in row["attributes"]["hashCandidates"]}, {"exact", "lowercase"})
                self.assertEqual(row["attributes"]["saveMapping"], "unvalidated")
                self.assertFalse(row["attributes"]["websiteIdentityVerified"])
                self.assertTrue(all(ev["sourceRef"] in registered for ev in row["evidence"]))
                self.assertTrue(all(r["sourceRef"] in {ev["sourceRef"] for ev in row["evidence"]}
                                    for r in row["attributes"]["websiteReportedRelations"]))
        self.assertEqual(outputs["web-augmentation-report.json"]["observedIdentifierPromotions"], 0)
        self.assertEqual(outputs["web-augmentation-report.json"]["newSaveLinks"], 0)

    def test_build_preserves_v1_file_inputs_and_public_links_and_adds_v2_report(self):
        data = fixture()
        frozen_before = Path(v1.__file__).read_bytes()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            base, baseline, output = root / "base", root / "baseline", root / "out"
            for relative, key in (("entities/vehicles.json", "vehicles"), ("entities/weapons.json", "weapons"),
                                  ("sources.json", "sources"), ("crosswalk-report.json", "base_report")):
                v1.write_json(base / relative, data[key])
            v1.write_json(baseline / "entities/items.json", data["items"])
            v1.write_json(base / "links.json", {"unchanged": True})
            v1.write_json(base / "save-mappings/xbox.json", {"unchanged": True})
            paths = {}
            for name in ("facts", "weapons_facts", "weapons_provenance"):
                paths[name] = root / (name + ".json")
                v1.write_json(paths[name], data[name])
            pins = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in paths.items()}
            before = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
            with patch.dict(v1.INPUT_PINS, pins):
                result = v2.build(base, baseline, paths["facts"], paths["weapons_facts"], paths["weapons_provenance"], output)
            self.assertEqual({p: p.read_bytes() for p in before}, before)
            self.assertEqual(result["augmenter"], v2.VERSION)
            self.assertEqual((result["addedWeaponPresetClaims"], result["addedWeaponRecipeClaims"]), (1, 1))
            self.assertEqual(result["foundationAugmenter"]["sha256"], v2.FROZEN_V1_SHA)
            for relative in ("links.json", "save-mappings/xbox.json"):
                self.assertEqual((base / relative).read_bytes(), (output / relative).read_bytes())
            with self.assertRaises(ValueError):
                v2.build(base, baseline, paths["facts"], paths["weapons_facts"], paths["weapons_provenance"], output)
        self.assertEqual(Path(v1.__file__).read_bytes(), frozen_before)

    def test_frozen_foundation_mismatch_rejects(self):
        with patch.object(v1, "digest", return_value="0" * 64), self.assertRaises(ValueError):
            run(fixture())


if __name__ == "__main__":
    unittest.main()
