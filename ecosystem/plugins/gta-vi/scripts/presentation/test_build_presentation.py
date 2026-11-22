import copy
import json
import math
import unittest

import build_presentation as bp


def field(key, kind="number", **kw):
    return {"k": key, "l": key, "t": kind, **kw}


def sample_source(slug, fields, rows):
    return {"slug": slug, "f": fields, "e": rows, "ct": {}, "tr": {}}


def catalog_entry(slug, rid, native, cid="gta-vi:weapons:test-spec", domain=None):
    spec = bp.SOURCE_SPECS[slug]
    if domain is None:
        domain = spec["domain"]
    return {"id": cid, "nativeIds": {"referenceId": native}, "name": {"en": "Synthetic"},
            "attributes": {"reportedIdentifierMetadata": {"referenceId": {"domain": domain}},
                "crosswalk": [{"sourceRef": spec["identityRef"], "sourceRecordId": rid}]}}


class PresentationTests(unittest.TestCase):
    def test_source_pin_rejects_changed_bytes(self):
        with self.assertRaisesRegex(ValueError, "digest"):
            bp.decode_source("vehiculos", b"{}")

    def test_fact_types_preserve_zero_and_false(self):
        data = sample_source("vehiculos", [field("uiVelocidad"), field("electrico", "boolean")], [])
        stats, props = bp.extract_facts(data, ["a", "A", "a", "Test", [0, False]], 2)
        self.assertEqual(stats[0]["value"], 0)
        self.assertIs(props[0]["value"], False)
        self.assertEqual(stats[0]["valuePointer"], "/e/2/4/0")
        self.assertEqual(stats[0]["scaleMax"], 10)

    def test_booleans_and_nonfinite_numbers_are_not_stats(self):
        for value in (True, float("nan"), float("inf"), "12"):
            self.assertFalse(bp.validate_value("number", value))
        self.assertFalse(bp.validate_value("integer", 2.5))

    def test_units_retain_source_assumptions(self):
        self.assertEqual(bp.unit_status(field("range", u="m", x="Assumed unit.")), "source-assumed")
        self.assertEqual(bp.unit_status(field("speed", u="km/h", x="Source unit")), "source-stated")
        self.assertEqual(bp.unit_status(field("force")), "not-specified")

    def test_no_price_is_inferred_from_generic_value(self):
        catalog = {"vehicles": [], "weapons": [catalog_entry("armas", "test", "WEAPONSPEC_TEST")], "items": []}
        data = sample_source("armas", [field("puntuacion")], [["test", "Test", "WEAPONSPEC_TEST", "Test", [500]]])
        output, _, report = bp.build_sidecars(catalog, {"armas": data})
        self.assertIsNone(output["weapons"]["entries"][0]["price"])
        self.assertEqual(report["categories"]["weapons"]["purchasePrices"], 0)

    def test_item_domain_gates(self):
        row = ["i", "I", "0x01020304", "Modelos de bebida", []]
        self.assertFalse(bp.selected_row("bebidas-y-drogas", row, {}))
        row[3] = "Bebidas"
        self.assertTrue(bp.selected_row("bebidas-y-drogas", row, {}))
        row[2] = "0x0102030405060708"
        self.assertFalse(bp.selected_row("bebidas-y-drogas", row, {}))
        self.assertFalse(bp.selected_row("piezas-caza", ["i", "I", "hash", "Test", ["Sellable"]], {"tipoEntrada": 0}))

    def test_image_descriptor_shapes_and_missing(self):
        row = ["a", "A", "a", "Test", [], ["/media/icons/a.webp", 256, 256]]
        image = bp.image_descriptor(row, 3, "armas")
        self.assertEqual(image["thumbnailUrl"], image["url"])
        self.assertEqual(image["sourcePointer"], "/e/3/5")
        row[5] = ["/media/icons/a.webp", 256, 256, "/media/icons/a-sm.webp", 180]
        self.assertNotEqual(bp.image_descriptor(row, 3, "armas")["thumbnailUrl"], image["url"])
        row[5] = 0
        self.assertIsNone(bp.image_descriptor(row, 3, "armas"))

    def test_image_urls_cannot_escape_source_origin(self):
        for value in ("//evil.example/a.webp", "https://evil.example/a.webp", "/media/../a.webp", "/media/a.webp?token=abc", "/media/a.webp#x", "/media/\\evil.webp", "/media/a.glb"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                bp.safe_media_url(value)

    def test_associated_models_are_not_item_ids_or_unique_item_icons(self):
        data = sample_source("bebidas-y-drogas", [field("modelos", "reflist")], [
            ["0x01020304", "Drink", "0x01020304", "Bebidas", [["prop-test"]]],
            ["prop-test", "Prop", "prop_test", "Modelos de bebida", [None], ["/media/props/p.webp", 64, 64]],
        ])
        models, media = bp.models_and_media(data, data["e"][0], 0, {"modelos": 0})
        self.assertEqual(models[0]["value"], "prop_test")
        self.assertEqual(models[0]["sourcePointer"], "/e/1/2")
        self.assertEqual(models[0]["relationPointer"], "/e/0/4/0/0")
        self.assertEqual(media[0]["role"], "associated-model-preview")
        self.assertIsNone(media[0]["assetId"])

    def test_join_never_matches_display_name(self):
        catalog = {"vehicles": [], "weapons": [catalog_entry("armas", "other-record", "WEAPONSPEC_TEST")], "items": []}
        data = sample_source("armas", [field("dano")], [["test", "Synthetic", "WEAPONSPEC_TEST", "Test", [5]]])
        output, _, report = bp.build_sidecars(catalog, {"armas": data})
        self.assertFalse(output["weapons"]["entries"])
        self.assertEqual(report["datasets"][0]["withoutCatalogJoin"], 1)

    def test_changed_native_identity_blocks_existing_join(self):
        catalog = {"vehicles": [], "weapons": [catalog_entry("armas", "test", "WEAPONSPEC_ORIGINAL")], "items": []}
        data = sample_source("armas", [], [["test", "Synthetic", "WEAPONSPEC_CHANGED", "Test", []]])
        with self.assertRaisesRegex(ValueError, "identity changed"):
            bp.build_sidecars(catalog, {"armas": data})

    def test_descriptor_compaction_is_lossless(self):
        data = sample_source("vehiculos", [field("marca", "enum"), field("uiVelocidad", u="raw")], [])
        data["tr"] = {"marca": {"A/B~C": "Brand"}}
        stats, properties = bp.extract_facts(data, ["a", "A", "a", "Test", ["A/B~C", 0]], 4)
        original = {"sourceRef": "s", "sourceRowPointer": "/e/4", "stats": stats, "properties": properties}
        document = {"entries": [copy.deepcopy(original)]}
        bp.compact_fields(document)
        self.assertEqual(bp.expand_record(document, document["entries"][0]), original)

    def test_preset_links_do_not_inherit_base_stats_or_image(self):
        base = catalog_entry("armas", "test", "WEAPONSPEC_TEST")
        preset = catalog_entry("armas", "test", "WEAPONPRESET_TEST", cid="gta-vi:weapons:test-preset", domain="preset")
        preset["attributes"]["websiteReportedRelations"] = [{"relation": "reportedForSpec", "relatedCatalogId": base["id"], "sourceLocation": "/e/0/4/1/0"}]
        catalog = {"vehicles": [], "weapons": [base, preset], "items": []}
        data = sample_source("armas", [field("dano")], [["test", "Synthetic", "WEAPONSPEC_TEST", "Test", [5], ["/media/test.webp", 64, 64]]])
        output, _, report = bp.build_sidecars(catalog, {"armas": data})
        result = next(r for r in output["weapons"]["entries"] if r["catalogId"] == preset["id"])
        self.assertEqual(result["relatedSpecCatalogIds"], [base["id"]])
        self.assertEqual(result["stats"], [])
        self.assertEqual(result["media"], [])
        self.assertEqual(report["derivedWeaponRelations"], {"preset": 1})


if __name__ == "__main__":
    unittest.main()
