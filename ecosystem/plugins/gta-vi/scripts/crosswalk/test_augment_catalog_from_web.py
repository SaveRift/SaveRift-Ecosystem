"""Offline regression fixtures for candidate-only website catalog augmentation."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import augment_catalog_from_web as augment

PRIVATE = "PRIVATE_PAYLOAD_PATH_CAPTURE_COOKIE_OR_PROSE"


def old_entry(category, suffix):
    return {"id": f"gta-vi:{category}:{suffix}", "name": {"en": "Existing entry"},
            "nativeIds": {"referenceId": "PreserveExactCase", "referenceNamespace": "existing:domain"},
            "attributes": {"original": [1, "keep"]}, "confidence": "observed",
            "applicability": {"platforms": ["xbox"], "build": None},
            "evidence": [{"sourceRef": "existing-source", "location": "/original/1", "method": "existing"}]}


def model(value="0x047430ea", crosswalk=None):
    result = old_entry("vehicles", "model-hash-" + value[2:])
    result["name"]["en"] = "Vehicle model " + value
    result["nativeIds"] = {"modelHash32": value}
    result["attributes"] = {"recordRole": "native_vehicle_model_reference", "crosswalk": crosswalk or [],
        "nameKind": "observed-model-reference", "editorReady": False, "saveMapping": "unvalidated",
        "nativeWitnesses": [{"rawBytesVerified": True, "sourceSha256": "1" * 64}],
        "identifierMetadata": {"modelHash32": {"domain": "model", "representation": "hex", "bitWidth": 32}}}
    return result


def prior_alias(label="Prior Label", token="gym", kind="website-label", method="joaat32_exact"):
    row = {"kind": kind, "nativeIdKey": "modelHash32", "matchMethod": method, "confidence": "candidate",
           "sourceRef": "existing-source", "sourceRecordId": "prior-record", "location": "/prior/4", "namespace": "prior:namespace"}
    if kind == "website-label":
        row.update(label=label, comparedText=token)
    else:
        row["token"] = token
    return row


def source(category):
    pin = augment.SOURCE_PINS[category]
    return {"source_id": "synthetic:" + category, "url": pin["url"], "sha256": pin["sha256"], "bytes": 100,
            "section_page_sha256": "a" * 64, "last_modified": "synthetic", "private_capture": PRIVATE}


def factual_record(category, token, label, index=0, category_value=None):
    pin = augment.SOURCE_PINS[category]
    row = f"/e/{index}"
    site_id = "synthetic-" + str(index)
    return {"record_key": "gtazone:" + pin["slug"] + ":" + site_id, "site_record_id": site_id,
        "source_id": "synthetic:" + category, "namespace": f"GTA.ZONE:{pin['slug']}:published-internal-name",
        "claimed_domain": "vehicle-internal-name" if category == "vehicles" else "inventory-item-id32",
        "label": label, "label_pointer": row + "/1", "published_identifier": token,
        "published_identifier_pointer": row + "/2", "published_identifier_format": "hex32" if augment.HASH32.fullmatch(token) else "literal",
        "site_category": category_value or ("Vehicles" if category == "vehicles" else "Bebidas"),
        "claim_status": "website-claim", "game_definition_independently_verified": False, "save_mapping_verified": False,
        "detail_url": pin["section"] + site_id + "/", "description": PRIVATE,
        "retained_fields": [] if category == "vehicles" else [{"field_key": "clave", "value": token,
            "descriptor_pointer": "/f/34", "value_pointer": row + "/4/34"}]}


def weapon(source_id, token, kind, index):
    row = f"/e/{index}"
    return {"sourceRecordId": source_id, "sourceLocation": row, "url": augment.SOURCE_PINS["weapons"]["section"] + source_id + "/",
        "label": "Synthetic " + source_id, "reportedIdentifier": token, "identifierKind": kind,
        "confidence": "candidate", "identityVerified": False, "description": PRIVATE,
        "fields": {"weaponType": {"value": "WEAPON_SYNTHETIC", "kind": "reported-native-token", "sourceLocation": row + "/4/50"},
                   "namedPresets": {"value": ["WeaponPreset_SYNTHETIC"], "kind": "reported-native-token-list", "sourceLocation": row + "/4/54"},
                   "namedRecipes": {"value": ["WeaponRecipe_SYNTHETIC"], "kind": "reported-native-token-list", "sourceLocation": row + "/4/55"},
                   "relatedSpecRecordIds": {"value": [PRIVATE], "kind": "website-record-id-list", "sourceLocation": row + "/4/52"}}}


def fixture():
    wp = augment.SOURCE_PINS["weapons"]
    return dict(
        vehicles={"category": "vehicles", "entries": [old_entry("vehicles", "original"), model()]},
        weapons={"category": "weapons", "entries": [old_entry("weapons", "original")]},
        items={"category": "items", "entries": [old_entry("items", "original")]},
        sources={"sources": [{"id": "existing-source", "title": "Original", "locator": "synthetic:original"}]},
        base_report={"observedModelHashes": 1, "newSources": 1, "newSaveLinks": 0, "editabilityChanges": 0},
        facts={"site": "GTA.ZONE", "source_claims": {"build": "1.0.2.1"},
            "sources": [source("vehicles"), source("items")],
            "records": [factual_record("vehicles", "gym", "New Website Label"),
                        factual_record("items", "0x000000Af", "Synthetic Drink"),
                        {"record_key": "excluded-hunting", "claimed_domain": "loot-item-leaf-id32", "private": PRIVATE}]},
        weapons_facts={"dataUrl": wp["url"], "dataSha256": wp["sha256"], "records": [
            weapon("literal-spec", "WeaponSpec_Mixed_Default", "website-reported-spec-literal", 0),
            weapon("hex-spec", "0x0000000A", "website-reported-spec-hash32", 1),
            weapon("not-a-spec", "weapon_rotors", "website-reported-weapon-entry-without-spec", 2)]},
        weapons_provenance={"discovery": {"dataUrl": wp["url"], "dataSha256": wp["sha256"], "dataBytes": 100,
            "pageSha256": "b" * 64, "dataLastModified": "synthetic"},
            "websiteBuildClaim": {"build": "1.0.2.1", "independentlyVerified": False,
                "sourceUrl": "https://negentropy.studio/about/", "sourceSha256": "c" * 64},
            "valueComparison": {"private_payload": PRIVATE}})


def run(data):
    return augment.augment_catalog(**data)


class AugmentationTests(unittest.TestCase):
    def test_preserves_existing_rows_ids_sources_witnesses_and_input_objects(self):
        data = fixture()
        before = deepcopy(data)
        out = run(data)
        self.assertEqual(data, before)
        for category in ("vehicles", "weapons", "items"):
            self.assertEqual(out[f"entities/{category}.json"]["entries"][0], before[category]["entries"][0])
        current = out["entities/vehicles.json"]["entries"][1]
        original = before["vehicles"]["entries"][1]
        for key in ("id", "nativeIds", "evidence", "applicability"):
            self.assertEqual(current[key], original[key])
        self.assertEqual(current["attributes"]["nativeWitnesses"], original["attributes"]["nativeWitnesses"])
        self.assertEqual(out["sources.json"]["sources"][0], before["sources"]["sources"][0])
        report = out["web-augmentation-report.json"]
        self.assertEqual((report["addedWeaponSpecClaims"], report["addedItemClaims"], report["newSources"]), (2, 1, 3))
        self.assertEqual((report["newSaveLinks"], report["editabilityChanges"], report["observedIdentifierPromotions"]), (0, 0, 0))

    def test_exact_and_lowercase_methods_survive_even_when_inputs_equal(self):
        row = run(fixture())["entities/vehicles.json"]["entries"][1]
        self.assertEqual({r["matchMethod"] for r in row["attributes"]["crosswalk"]}, {"joaat32_exact", "joaat32_lowercase"})
        self.assertEqual(row["name"]["en"], "New Website Label")
        self.assertEqual(row["confidence"], "candidate")
        self.assertTrue(all(r["comparedText"] == "gym" and r["confidence"] == "candidate" for r in row["attributes"]["crosswalk"]))
        data = fixture()
        data["facts"]["records"][0]["published_identifier"] = "Gym"
        row = run(data)["entities/vehicles.json"]["entries"][1]
        self.assertEqual([r["matchMethod"] for r in row["attributes"]["crosswalk"]], ["joaat32_lowercase"])
        self.assertEqual(row["attributes"]["crosswalk"][0]["comparedText"], "Gym")

    def test_published_hash_matches_value_without_becoming_a_hash_preimage(self):
        data = fixture()
        data["vehicles"]["entries"][1]["attributes"]["crosswalk"] = [prior_alias(token="gym", kind="native-token-hash")]
        data["facts"]["records"][0] = factual_record("vehicles", "0x047430EA", "Published Hash Label")
        row = run(data)["entities/vehicles.json"]["entries"][1]
        web = row["attributes"]["crosswalk"][-1]
        self.assertEqual((web["matchMethod"], web["comparedText"]), ("hash32_value_exact", "0x047430EA"))
        self.assertFalse(row["attributes"]["labelAmbiguity"]["distinctHashInputsShareHash"])
        self.assertEqual(row["name"]["en"], "Published Hash Label")
        for invalid in ("0x47430EA", "0x00000000047430EA"):
            data["facts"]["records"][0]["published_identifier"] = invalid
            with self.subTest(value=invalid), self.assertRaises(ValueError):
                run(data)

    def test_conflicting_sources_keep_all_labels_and_use_unique_native_token(self):
        data = fixture()
        data["vehicles"]["entries"][1]["attributes"]["crosswalk"] = [prior_alias(), prior_alias(token="gym", kind="native-token-hash")]
        row = run(data)["entities/vehicles.json"]["entries"][1]
        self.assertEqual(row["name"]["en"], "gym")
        self.assertTrue(row["attributes"]["labelAmbiguity"]["multipleWebsiteLabels"])
        self.assertEqual({r["label"] for r in row["attributes"]["crosswalk"] if r["kind"] == "website-label"},
                         {"Prior Label", "New Website Label"})
        data["vehicles"]["entries"][1]["attributes"]["crosswalk"] = [prior_alias()]
        row = run(data)["entities/vehicles.json"]["entries"][1]
        self.assertEqual((row["name"]["en"], row["confidence"]), ("Vehicle model 0x047430ea", "observed"))

    def test_real_collision_forces_numeric_name_even_with_unique_native_token(self):
        data = fixture()
        data["vehicles"]["entries"][1] = model("0xeda6c2f2", [prior_alias(token="synthetic_collision_23904", kind="native-token-hash")])
        data["facts"]["records"][0] = factual_record("vehicles", "synthetic_collision_27200", "One Label")
        row = run(data)["entities/vehicles.json"]["entries"][1]
        self.assertEqual((row["name"]["en"], row["confidence"]), ("Vehicle model 0xeda6c2f2", "observed"))
        self.assertTrue(row["attributes"]["labelAmbiguity"]["distinctHashInputsShareHash"])
        self.assertEqual(len(row["attributes"]["crosswalk"]), 3)

    def test_hex_only_label_does_not_hide_a_unique_human_label(self):
        data = fixture()
        data["vehicles"]["entries"][1]["attributes"]["crosswalk"] = [prior_alias(label="0x047430EA")]
        row = run(data)["entities/vehicles.json"]["entries"][1]
        self.assertEqual(row["name"]["en"], "New Website Label")
        self.assertEqual(row["attributes"]["labelAmbiguity"]["hashOnlyWebsiteLabels"], 1)

    def test_weapon_item_claims_preserve_case_width_and_never_become_observed_ids(self):
        out = run(fixture())
        weapons = out["entities/weapons.json"]["entries"][1:]
        items = out["entities/items.json"]["entries"][1:]
        self.assertEqual([r["nativeIds"]["referenceId"] for r in weapons], ["WeaponSpec_Mixed_Default", "0x0000000A"])
        self.assertEqual(items[0]["nativeIds"]["referenceId"], "0x000000Af")
        self.assertEqual({h["transform"] for h in weapons[0]["attributes"]["hashCandidates"]}, {"exact", "lowercase"})
        self.assertNotIn("hashCandidates", weapons[1]["attributes"])
        self.assertNotIn("hashCandidates", items[0]["attributes"])
        for entry in weapons + items:
            ids, attrs = entry["nativeIds"], entry["attributes"]
            self.assertEqual(set(ids), {"referenceId", "referenceNamespace"})
            meta = attrs["reportedIdentifierMetadata"]["referenceId"]
            self.assertEqual(ids["referenceNamespace"], "website-reported:GTA.ZONE:" + meta["domain"])
            self.assertEqual(entry["confidence"], "candidate")
            self.assertFalse(attrs["editorReady"])
            self.assertFalse(attrs["websiteIdentityVerified"])
            self.assertEqual(attrs["saveMapping"], "unvalidated")
            self.assertEqual(entry["applicability"], {"platforms": ["xbox"], "build": None})
            self.assertEqual((attrs["websiteClaimedBuild"], attrs["websiteClaimedBuildScope"]), ("1.0.2.1", "website-claim"))
            link = attrs["crosswalk"][0]
            self.assertEqual((link["kind"], link["matchMethod"], link["comparedText"]), ("website-native-id", "literal_exact", ids["referenceId"]))
        self.assertEqual(weapons[1]["attributes"]["reportedIdentifierMetadata"]["referenceId"]["bitWidth"], 32)
        self.assertEqual(items[0]["attributes"]["reportedIdentifierMetadata"]["referenceId"]["bitWidth"], 32)

    def test_named_relations_are_claims_and_site_relation_ids_are_not_copied(self):
        out = run(fixture())
        relations = out["entities/weapons.json"]["entries"][1]["attributes"]["websiteReportedRelations"]
        self.assertEqual({r["relation"] for r in relations}, {"weaponType", "namedPresets", "namedRecipes"})
        self.assertEqual({r["domain"] for r in relations}, {"weapon-type", "preset", "recipe"})
        self.assertTrue(all(r["sourceLocation"].startswith("/e/0/4/") and r["confidence"] == "candidate" and not r["identityVerified"] for r in relations))
        self.assertNotIn(PRIVATE, json.dumps(out))
        registered = {s["id"] for s in out["sources.json"]["sources"]}
        for category in ("vehicles", "weapons", "items"):
            for entry in out[f"entities/{category}.json"]["entries"]:
                for evidence in entry["evidence"] + entry["attributes"].get("crosswalk", []):
                    self.assertIn(evidence["sourceRef"], registered)

    def test_model_profile_and_hunting_rows_cannot_enter_the_item_namespace(self):
        data = fixture()
        self.assertEqual(run(data)["web-augmentation-report.json"]["addedItemClaims"], 1)
        for category in ("Modelos de bebida", "Modelos de droga", "Perfiles de embriaguez"):
            data["facts"]["records"][1]["site_category"] = category
            with self.subTest(category=category), self.assertRaises(ValueError):
                run(data)
        data = fixture()
        data["facts"]["records"][1]["published_identifier"] = "0x00000000000000Af"
        with self.assertRaises(ValueError):
            run(data)

    def test_file_build_preserves_link_bytes_and_rejects_changed_pinned_facts(self):
        data = fixture()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            base, baseline, output = root / "base", root / "baseline", root / "out"
            for relative, key in (("entities/vehicles.json", "vehicles"), ("entities/weapons.json", "weapons"),
                                  ("sources.json", "sources"), ("crosswalk-report.json", "base_report")):
                augment.write_json(base / relative, data[key])
            augment.write_json(baseline / "entities/items.json", data["items"])
            augment.write_json(base / "save-mappings/xbox.json", {"unchanged": [{"id": "prior-save-link"}]})
            augment.write_json(base / "links.json", {"unchanged": True})
            paths = {}
            for name in ("facts", "weapons_facts", "weapons_provenance"):
                paths[name] = root / (name + ".json")
                augment.write_json(paths[name], data[name])
            pins = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in paths.items()}
            before = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
            args = (base, baseline, paths["facts"], paths["weapons_facts"], paths["weapons_provenance"], output)
            with patch.dict(augment.INPUT_PINS, pins):
                augment.build(*args)
                self.assertEqual({p: p.read_bytes() for p in before}, before)
                for relative in ("save-mappings/xbox.json", "links.json"):
                    self.assertEqual((output / relative).read_bytes(), (base / relative).read_bytes())
                with self.assertRaises(ValueError):
                    augment.build(*args)
                paths["facts"].write_bytes(paths["facts"].read_bytes() + b" ")
                second = root / "changed-input-output"
                with self.assertRaises(ValueError):
                    augment.build(*args[:-1], second)
                self.assertFalse(second.exists())


if __name__ == "__main__":
    unittest.main()
