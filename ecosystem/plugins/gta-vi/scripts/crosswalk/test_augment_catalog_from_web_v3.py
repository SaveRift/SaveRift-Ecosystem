"""Item-only hunting candidates, source identity, provenance and frozen wrappers."""
from copy import deepcopy
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import augment_catalog_from_web as v1
import augment_catalog_from_web_v2 as v2
import augment_catalog_from_web_v3 as v3
from test_augment_catalog_from_web import fixture, factual_record


def hunting_fixture():
    data = fixture()
    facts = data["facts"]
    facts["records"] = [r for r in facts["records"] if r.get("claimed_domain") != "loot-item-leaf-id32"]
    facts["source_claims"].update(source_url="https://negentropy.studio/", source_html_sha256="d" * 64)
    source = {"source_id": "synthetic:hunting", "url": v3.HUNTING_PIN["url"], "sha256": v3.HUNTING_PIN["sha256"],
        "section_page_sha256": v3.HUNTING_PIN["page_sha256"], "bytes": 100,
        "rows_in_source": 327, "retained_records": 2, "leaf_type_counts": {"Item": 2, "Sellable": 321, "None": 4},
        "excluded_records": {"leaf_type:Sellable": 321, "leaf_type:None": 4}}
    facts["sources"].append(source)
    for index, identifier in enumerate(("0x000000Af", "0x00000bCd")):
        record = factual_record("items", identifier, "Hunting Carcass " + str(index), index=index)
        record.update(record_key="gtazone:piezas-caza:hunting-" + str(index), site_record_id="hunting-" + str(index),
            source_id=source["source_id"], namespace="GTA.ZONE:piezas-caza:published-internal-name",
            claimed_domain="loot-item-leaf-id32", site_category="Synthetic animal group",
            detail_url=v3.HUNTING_PIN["section"] + "hunting-" + str(index) + "/",
            retained_fields=[{"field_key": "tipoEntrada", "value": "Item", "descriptor_pointer": "/f/22",
                              "value_pointer": f"/e/{index}/4/22"}])
        facts["records"].append(record)
    return data


def hunting_rows(outputs):
    return [entry for entry in outputs["entities/items.json"]["entries"]
            if entry.get("attributes", {}).get("reportedItemSubtype") == "hunting-carcass-loot-item"]


class HuntingCandidateTests(unittest.TestCase):
    def test_item_candidates_preserve_case_width_labels_and_narrow_role(self):
        data = hunting_fixture()
        before = deepcopy(data)
        outputs = v3.augment_catalog(**data)
        self.assertEqual(data, before)
        rows = hunting_rows(outputs)
        self.assertEqual([r["nativeIds"]["referenceId"] for r in rows], ["0x000000Af", "0x00000bCd"])
        self.assertEqual([r["name"]["en"] for r in rows], ["Hunting Carcass 0", "Hunting Carcass 1"])
        for row in rows:
            attrs = row["attributes"]
            self.assertEqual(row["nativeIds"]["referenceNamespace"], "website-reported:GTA.ZONE:item")
            self.assertEqual(set(row["nativeIds"]), {"referenceId", "referenceNamespace"})
            self.assertEqual(attrs["reportedIdentifierMetadata"]["referenceId"],
                {"domain": "item", "representation": "hex", "bitWidth": 32, "confidence": "candidate"})
            self.assertEqual(attrs["reportedSourceNamespace"], "GTA.ZONE:piezas-caza:loot-entry-item")
            self.assertNotIn("hashCandidates", attrs)
            self.assertEqual(row["confidence"], "candidate")
            self.assertFalse(attrs["editorReady"])
            self.assertEqual(attrs["saveMapping"], "unvalidated")
            self.assertEqual(row["applicability"], {"platforms": ["xbox"], "build": None})
        report = outputs["web-augmentation-report.json"]
        self.assertEqual((report["addedDrinkDrugItemClaims"], report["addedHuntingItemClaims"], report["addedItemClaims"]), (1, 2, 3))
        self.assertEqual(report["excludedHuntingLeafTypes"], {"Sellable": 321, "missing": 4})
        self.assertEqual(report["newSources"], 4)

    def test_same_numeric_drink_and_hunting_id_keeps_both_rows_and_sources(self):
        outputs = v3.augment_catalog(**hunting_fixture())
        shared = [row for row in outputs["entities/items.json"]["entries"]
                  if row.get("nativeIds", {}).get("referenceId") == "0x000000Af"]
        self.assertEqual(len(shared), 2)
        self.assertEqual(len({r["id"] for r in shared}), 2)
        self.assertEqual({r["name"]["en"] for r in shared}, {"Synthetic Drink", "Hunting Carcass 0"})
        self.assertEqual({r["evidence"][0]["sourceRef"] for r in shared},
                         {v1.SOURCE_PINS["items"]["id"], v3.HUNTING_PIN["id"]})
        self.assertEqual(outputs["web-augmentation-report.json"]["sharedNumericItemValuesAcrossWebsiteSources"], 1)
        self.assertEqual(outputs["web-augmentation-report.json"]["crossSourceItemClaimsMerged"], 0)

    def test_leaf_type_and_identity_gates_reject_sellable_unknown_and_wrong_width(self):
        changes = [lambda r: r["retained_fields"][0].update(value="Sellable"),
                   lambda r: r.update(retained_fields=[]),
                   lambda r: r["retained_fields"][0].update(value_pointer="/e/0/4/21"),
                   lambda r: r.update(published_identifier="0x00000000000000Af"),
                   lambda r: r.update(published_identifier="0x00000000"),
                   lambda r: r.update(claimed_domain="loot-table-key"),
                   lambda r: r.update(namespace="GTA.ZONE:botin:published-internal-name")]
        for index, change in enumerate(changes):
            data = hunting_fixture()
            record = next(r for r in data["facts"]["records"] if r.get("source_id") == "synthetic:hunting")
            change(record)
            with self.subTest(change=index), self.assertRaises(ValueError):
                v3.augment_catalog(**data)

    def test_exact_identifier_and_discriminator_evidence_resolve_to_pinned_source(self):
        outputs = v3.augment_catalog(**hunting_fixture())
        registered = {s["id"]: s for s in outputs["sources.json"]["sources"]}
        source = registered[v3.HUNTING_PIN["id"]]
        self.assertEqual(source["provenance"]["dataSha256"], v3.HUNTING_PIN["sha256"])
        self.assertEqual(source["provenance"]["includedLeafType"], "Item")
        self.assertFalse(source["provenance"]["identityVerified"])
        row = hunting_rows(outputs)[0]
        relation = row["attributes"]["crosswalk"][0]
        self.assertEqual((relation["comparedText"], relation["matchMethod"]), ("0x000000Af", "literal_exact"))
        self.assertIn("json-pointer:/e/0/2", relation["location"])
        self.assertIn("label-json-pointer:/e/0/1", relation["location"])
        self.assertEqual(row["attributes"]["websiteReportedLeafType"]["sourceLocation"], "/e/0/4/22")
        self.assertTrue(any("json-pointer:/e/0/4/22" in ev["location"] for ev in row["evidence"]))
        self.assertTrue(all(ev["sourceRef"] in registered for ev in row["evidence"]))

    def test_source_pin_and_leaf_count_mismatch_reject(self):
        for key, value in (("sha256", "0" * 64), ("section_page_sha256", "0" * 64), ("retained_records", 3), ("rows_in_source", 328)):
            data = hunting_fixture()
            source = next(s for s in data["facts"]["sources"] if s["source_id"] == "synthetic:hunting")
            source[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                v3.augment_catalog(**data)

    def test_fresh_file_build_keeps_inputs_links_and_frozen_earlier_versions(self):
        data = hunting_fixture()
        frozen = {p: p.read_bytes() for p in (Path(v1.__file__), Path(v2.__file__))}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            base, baseline, output = root / "base", root / "baseline", root / "output"
            for path, key in (("entities/vehicles.json", "vehicles"), ("entities/weapons.json", "weapons"),
                              ("sources.json", "sources"), ("crosswalk-report.json", "base_report")):
                v1.write_json(base / path, data[key])
            v1.write_json(baseline / "entities/items.json", data["items"])
            v1.write_json(base / "links.json", {"preserved": True})
            paths = {}
            for name in ("facts", "weapons_facts", "weapons_provenance"):
                paths[name] = root / (name + ".json")
                v1.write_json(paths[name], data[name])
            pins = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in paths.items()}
            before = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
            args = (base, baseline, paths["facts"], paths["weapons_facts"], paths["weapons_provenance"], output)
            with patch.dict(v1.INPUT_PINS, pins):
                report = v3.build(*args)
                with self.assertRaises(ValueError):
                    v3.build(*args)
            self.assertEqual(report["augmenter"], v3.VERSION)
            self.assertEqual(report["addedHuntingItemClaims"], 2)
            self.assertEqual((output / "links.json").read_bytes(), (base / "links.json").read_bytes())
            self.assertEqual({p: p.read_bytes() for p in before}, before)
        self.assertEqual({p: p.read_bytes() for p in frozen}, frozen)


if __name__ == "__main__":
    unittest.main()
