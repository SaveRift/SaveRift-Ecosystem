"""Synthetic contract tests; no network, database, or game-source access."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from match_website_labels import canonical, joaat32_exact, match_website_labels


def record(key="source:one", label="gym", slug=None):
    return {"record_key": key, "site": "synthetic", "site_record_id": key,
            "namespace": "website:synthetic:vehicle", "category": "vehicles",
            "entity_type": "vehicle", "label": label,
            "url": "https://example.test/" + key.replace(":", "/"),
            "site_status": "unconfirmed",
            "identifiers": [] if slug is None else [
                {"kind": "website_slug", "namespace": "synthetic:page_slug", "raw_text": slug}],
            "evidence": [{"source_id": "synthetic:fixture", "response_id": "response:1",
                          "json_pointer": "/records/0", "selector": None,
                          "body_sha256": "1" * 64}]}


def target(value="0x047430ea", **extra):
    return {"value": value, "category": "vehicles", "namespace": "native:model_hash",
            "build": "synthetic-build", **extra}


class WebsiteMatchingTests(unittest.TestCase):
    def test_fixed_hash_vectors(self):
        # Fixed preimages recorded by the earlier independent website experiment.
        self.assertEqual(joaat32_exact("gym"), 0x047430ea)
        self.assertEqual(joaat32_exact("fishing"), 0x31ffe8bb)
        self.assertEqual(joaat32_exact("Challenges"), 0x3000010d)
        self.assertEqual(joaat32_exact("Gym"), 0x90a29654)

    def test_equal_transform_paths_and_slug_paths_are_preserved(self):
        r = record(slug="gym")
        result = match_website_labels({"records": [r]}, [target()])
        self.assertEqual(result["counts"]["matching_trials"], 4)
        self.assertEqual(result["counts"]["hash_trials"], 4)
        self.assertEqual(len({m["candidate_id"] for m in result["matches"]}), 4)
        self.assertEqual({(m["comparison_field"], m["method"]) for m in result["matches"]},
                         {("label", "joaat32_exact"), ("label", "joaat32_lowercase"),
                          ("identifiers/0/raw_text", "joaat32_exact"),
                          ("identifiers/0/raw_text", "joaat32_lowercase")})
        self.assertEqual(result["ambiguities"], [])
        for m in result["matches"]:
            self.assertEqual(m["namespace"], r["namespace"])
            self.assertEqual(m["native_targets"][0]["namespace"], "native:model_hash")
            self.assertEqual(m["matchMethod"], m["method"])
            self.assertEqual(m["hash_input_encoding"], "ascii")
            self.assertEqual(m["site_status"], "unconfirmed")
            self.assertEqual(m["site_status_scope"], "website_claim")
            self.assertFalse(m["game_definition_confirmed"])
            self.assertFalse(m["editable"])
            self.assertEqual(m["evidence"], r["evidence"])

    def test_slug_is_not_relabelled_as_display_name_or_native_namespace(self):
        result = match_website_labels({"records": [record(label="Synthetic Display Label", slug="gym")]}, [target()])
        self.assertEqual(len(result["matches"]), 2)
        for m in result["matches"]:
            self.assertEqual(m["label"], "Synthetic Display Label")
            self.assertEqual(m["comparedText"], "gym")
            self.assertEqual(m["identifier_namespace"], "synthetic:page_slug")

    def test_lowercase_is_a_separate_explicit_transform(self):
        result = match_website_labels({"records": [record(label="Gym")]}, [target()])
        self.assertEqual(len(result["matches"]), 1)
        m = result["matches"][0]
        self.assertEqual(m["method"], "joaat32_lowercase")
        self.assertEqual(m["comparedText"], "Gym")
        self.assertEqual(m["hashInputText"], "gym")

    def test_no_prefix_brand_whitespace_or_punctuation_rewriting(self):
        labels = ["WEAPON_gym", "Brand gym", " gym", "gym ", "g-ym", "g ym"]
        rows = [record(key="source:" + str(i), label=text) for i, text in enumerate(labels)]
        self.assertEqual(match_website_labels({"records": rows}, [target()])["matches"], [])

    def test_non_ascii_comparison_text_is_skipped_but_ascii_slug_can_match(self):
        r = record(label="Synthetic \u00dcbermacht Label", slug="gym")
        r["identifiers"].append({"kind": "website_slug", "namespace": "synthetic:page_slug", "raw_text": "g\u00fdm"})
        result = match_website_labels({"records": [r]}, [target()])
        self.assertEqual(result["counts"]["comparison_inputs"], 3)
        self.assertEqual(result["counts"]["skipped_non_ascii_comparison_inputs"], 2)
        self.assertEqual(result["counts"]["hashed_comparison_inputs"], 1)
        self.assertEqual(result["counts"]["hash_trials"], 2)
        self.assertEqual(len(result["matches"]), 2)
        for m in result["matches"]:
            self.assertEqual(m["label"], r["label"])
            self.assertEqual(m["comparedText"], "gym")
        with self.assertRaises(UnicodeEncodeError):
            joaat32_exact("\u0130")

    def test_non_vehicle_labels_do_not_match_model_hashes(self):
        r = record()
        r.update(category="weapons", entity_type="weapon")
        result = match_website_labels({"records": [r]}, [target()])
        self.assertEqual(result["matches"], [])
        self.assertEqual(result["counts"]["skipped_non_vehicle_source_records"], 1)
        self.assertEqual(result["counts"]["hash_trials"], 0)
        with self.assertRaises(ValueError):
            match_website_labels({"records": [record()]}, [target(category="weapons")])

    def test_cms_integer_and_other_identifier_kinds_are_not_native_ids(self):
        r = record(label="Unrelated Label")
        r["identifiers"] = [
            {"kind": "cms_id", "namespace": "synthetic:cms", "raw_text": str(0x047430ea)},
            {"kind": "model_name", "namespace": "website:unverified", "raw_text": "gym"},
            {"kind": "WEBSITE_SLUG", "namespace": "synthetic:page_slug", "raw_text": "gym"}]
        result = match_website_labels({"records": [r]}, [target()])
        self.assertEqual(result["matches"], [])
        self.assertEqual(result["counts"]["comparison_inputs"], 1)

    def test_missing_source_identity_or_exact_location_rejects(self):
        for field in ("source_id", "response_id", "body_sha256"):
            with self.subTest(field=field):
                r = record()
                r["evidence"][0][field] = None
                with self.assertRaises(ValueError):
                    match_website_labels({"records": [r]}, [target()])
        for change in ("no_location", "no_evidence", "no_site_record_id", "bad_hash"):
            with self.subTest(change=change):
                r = record()
                if change == "no_location":
                    r["evidence"][0]["json_pointer"] = None
                elif change == "no_evidence":
                    r["evidence"] = []
                elif change == "no_site_record_id":
                    r["site_record_id"] = ""
                else:
                    r["evidence"][0]["body_sha256"] = "not-a-sha256"
                with self.assertRaises(ValueError):
                    match_website_labels({"records": [r]}, [target()])

    def test_html_selector_or_document_root_are_preserved(self):
        for pointer, selector in ((None, "#equipment li:nth-of-type(3)"), ("", None)):
            with self.subTest(pointer=pointer):
                r = record()
                r["evidence"][0].update(json_pointer=pointer, selector=selector)
                result = match_website_labels({"records": [r]}, [target()])
                self.assertEqual(result["matches"][0]["evidence"], r["evidence"])

    def test_multiple_labels_are_not_a_hash_collision_or_a_preferred_label(self):
        result = match_website_labels({"records": [record("s:1", "Gym"), record("s:2", "GYM")]}, [target()])
        self.assertEqual(len(result["matches"]), 2)
        self.assertEqual(result["preferred_labels_selected"], 0)
        a = result["ambiguities"][0]
        self.assertIn("multiple_website_records", a["flags"])
        self.assertIn("multiple_labels", a["flags"])
        self.assertNotIn("distinct_hash_inputs_share_hash", a["flags"])
        self.assertEqual(a["labels"], ["GYM", "Gym"])

    def test_actual_joaat_collision_remains_explicit(self):
        left, right = "synthetic_collision_23904", "synthetic_collision_27200"
        self.assertEqual(joaat32_exact(left), 0xeda6c2f2)
        self.assertEqual(joaat32_exact(right), 0xeda6c2f2)
        result = match_website_labels({"records": [record("s:1", left), record("s:2", right)]},
                                      [target("0xeda6c2f2")])
        self.assertEqual(len(result["matches"]), 4)
        self.assertEqual(result["counts"]["hash_collision_groups"], 1)
        self.assertIn("distinct_hash_inputs_share_hash", result["ambiguities"][0]["flags"])
        self.assertEqual(result["ambiguities"][0]["hash_input_texts"], [left, right])

    def test_multiple_native_occurrences_and_duplicates_remain_visible(self):
        first, second = target(origin="one"), target(origin="two")
        result = match_website_labels({"records": [record()]}, [first, first, second])
        for m in result["matches"]:
            self.assertEqual(len(m["native_targets"]), 3)
            self.assertIn("multiple_native_target_records", m["ambiguity_flags"])
            self.assertIn("duplicate_native_target_records", m["ambiguity_flags"])

    def test_deterministic_record_target_evidence_order_and_no_input_mutation(self):
        a, b = record("s:1", "Gym"), record("s:2", "gym")
        a["evidence"].append({**a["evidence"][0], "response_id": "response:2", "json_pointer": "/copy/0"})
        factual, targets = {"records": [a, b]}, [target(origin="two"), target(origin="one")]
        saved = deepcopy((factual, targets))
        result = match_website_labels(factual, targets)
        self.assertEqual((factual, targets), saved)
        reordered = deepcopy(factual)
        reordered["records"].reverse()
        reordered["records"][1]["evidence"].reverse()
        self.assertEqual(canonical(result), canonical(match_website_labels(reordered, list(reversed(targets)))))
        result["matches"][0]["evidence"][0]["json_pointer"] = "/changed-output"
        self.assertEqual((factual, targets), saved)

    def test_duplicate_source_keys_and_non_u32_targets_are_rejected(self):
        with self.assertRaises(ValueError):
            match_website_labels({"records": [record(), record()]}, [target()])
        for bad in (0x047430ea, "74723562", "0x047430e", "0x00000000047430ea", "0xzzzzzzzz"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                match_website_labels({"records": [record()]}, [{"value": bad}])

    def test_cli_is_fresh_output_only_and_leaves_sources_unchanged(self):
        script = Path(__file__).with_name("match_website_labels.py")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            factual, targets, out = root / "facts.json", root / "targets.json", root / "matches.json"
            factual.write_text(json.dumps({"records": [record()]}), encoding="utf-8")
            targets.write_text(json.dumps([target()]), encoding="utf-8")
            original = {p: p.read_bytes() for p in (factual, targets)}
            command = [sys.executable, str(script), "--factual-json", str(factual),
                       "--targets-json", str(targets), "--output", str(out)]
            run = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            data, output_bytes = json.loads(out.read_bytes()), out.read_bytes()
            self.assertEqual(data["input_sha256"]["factual"], hashlib.sha256(original[factual]).hexdigest())
            self.assertEqual(data["counts"]["matching_trials"], 2)
            second = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(second.returncode, 2)
            self.assertEqual(out.read_bytes(), output_bytes)
            self.assertEqual({p: p.read_bytes() for p in (factual, targets)}, original)
            self.assertEqual({p.name for p in root.iterdir()}, {"facts.json", "targets.json", "matches.json"})


if __name__ == "__main__":
    unittest.main()
