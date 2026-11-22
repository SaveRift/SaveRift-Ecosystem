import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("native_lookup", HERE / "extract_native_lookup.py")
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)
SYNTHETIC_SCHEMA = (HERE / "synthetic_decode_schema.sql").read_text(encoding="utf-8")


def selector(identity, namespace, field, index, *, fmt="meta7a", struct="11111111", encoding="u32"):
    return {"id": identity, "category": "vehicles" if identity.startswith("vehicle") else "weapons",
            "namespace": namespace, "role": "identifier_candidate", "format": fmt,
            "struct_hash": struct, "struct_sizes": [16], "field_index": index, "field_hash": field,
            "field_type": "4a" if encoding == "u32" else "4d", "field_subtype": "00",
            "reference_index": 0, "extra_hex": "00000000", "encoding": encoding}


class ExtractionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.master = self.root / "original.sqlite"
        self.master.write_bytes(b"synthetic preserved original master")
        self.database = self.root / "r2.sqlite"
        self.db = sqlite3.connect(self.database)
        self.db.executescript(SYNTHETIC_SCHEMA)
        self.db.execute("CREATE TABLE r2_metadata(key TEXT PRIMARY KEY,value_json TEXT NOT NULL)")
        self.db.executemany("INSERT INTO r2_metadata VALUES(?,?)", [
            ("baseline_summary", json.dumps({"original_tables_preserved": True, "master_unchanged": True})),
            ("input_identity", json.dumps({"master_sha256": n.file_sha(self.master), "master_bytes": self.master.stat().st_size, "catalog_revision": "synthetic"}))])
        self.db.execute("INSERT INTO r2_decode_runs(run_id,results_path,status) VALUES('r','synthetic','imported')")
        self.line = 0
        self.selectors = [selector("vehicle-model", "vehicle.model", "aaaaaaaa", 0),
                          selector("weapon-spec", "weapon.spec", "bbbbbbbb", 1)]

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def add(self, doc, payload_sha="1" * 64, *, gfx="", base=0, values=None,
            fields=None, fmt="meta7a", struct="11111111", failure_after=False):
        if values is None:
            values = [{"a": 0x12345678, "b": 0x12345678, "private_unused": "DO_NOT_EXPORT_OBJECT_BODY"}]
        if fields is None:
            fields = [(0, "aaaaaaaa", "a", 0, "4a"), (1, "bbbbbbbb", "b", 4, "4a")]
        source = {"payload_id": doc, "sha256": payload_sha, "archive": "packs.rpf", "offset": 1234,
                  "bytes": 4096, "gfx_sha256": gfx, "gfx_base": base}
        self.db.execute("INSERT INTO r2_decode_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (
            doc, "r", doc, payload_sha, hashlib.sha256(doc.encode()).hexdigest(), "not-read.json", fmt,
            n.ADAPTER, n.UPSTREAM, json.dumps(source), json.dumps({"field_key_collision_count": 0}), "DO_NOT_READ_HEADER"))
        self.line += 1
        self.db.execute("INSERT INTO r2_decode_attempts VALUES(?,?,?,?,?,?,?,?,?,?)", (
            "r", self.line, doc, payload_sha, "decoded_research", "decoded_research", doc, "record",
            json.dumps({"worker_sha256": n.WORKER}), None))
        if failure_after:
            self.line += 1
            self.db.execute("INSERT INTO r2_decode_attempts VALUES(?,?,?,?,?,?,?,?,?,?)", (
                "r", self.line, doc, payload_sha, "error", "error", None, "record", "{}", "synthetic"))
        self.db.execute("INSERT INTO r2_decode_structs VALUES(?,?,?,?,?,?,?,?,?)", (
            doc, struct, struct[-8:], struct if len(struct) == 16 else None, 16, len(values), len(values), None, "{}"))
        for index, field_hash, name, offset, typ in fields:
            self.db.execute("INSERT INTO r2_decode_fields VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (
                doc, struct, index, field_hash, name, offset, typ, "00", 0, "00000000", 0, "{}"))
        self.db.execute("INSERT INTO r2_decode_blocks VALUES(?,?,?,?,?,?,?)", (doc, 1, struct, 16 * len(values), 128, 1, "{}"))
        self.db.executemany("INSERT INTO r2_decode_instances VALUES(?,?,?,?,?)", [
            (doc, struct, i, 128 + i * 16, json.dumps(v)) for i, v in enumerate(values)])

    def run_extract(self, **overrides):
        self.db.commit()
        plan = self.root / "selectors.json"
        plan.write_text(json.dumps({"schema": "saverift.gta-vi.native-lookup-selectors.v1", "selection_basis": {"fixture": True}, "selectors": self.selectors}))
        options = dict(database=self.database, original_master=self.master, output=self.root / "out", selectors=plan,
                       platform="xbox", build=None, inventory_only=False, max_seconds=30, max_documents=100,
                       max_schema_observations=100, max_observations=100, max_object_characters=1024,
                       max_output_bytes=1048576)
        options.update(overrides)
        db_before, master_before = n.file_sha(self.database), n.file_sha(self.master)
        summary = n.extract(argparse.Namespace(**options))
        self.assertEqual(n.file_sha(self.database), db_before)
        self.assertEqual(n.file_sha(self.master), master_before)
        output = Path(options["output"])
        observations = [json.loads(x) for x in (output / "observations.jsonl").read_text().splitlines()]
        for path in output.iterdir():
            text = path.read_text()
            self.assertNotIn("DO_NOT_EXPORT_OBJECT_BODY", text)
            self.assertNotIn("DO_NOT_READ_HEADER", text)
        return summary, observations

    def test_domains_repeated_content_graphics_and_latest_attempt(self):
        self.add("a")
        self.add("b")  # Same bytes, a separate source occurrence.
        self.add("c", gfx="2" * 64, base=4096)  # Same system SHA, different full content key.
        self.add("superseded", failure_after=True)
        summary, obs = self.run_extract()
        self.assertEqual(summary["status"], "completed")
        self.assertEqual(len(obs), 6)
        self.assertEqual(summary["distinct_identifier_values_by_namespace"], {"vehicle.model": 1, "weapon.spec": 1})
        self.assertEqual(summary["distinct_content_locations"], 4)
        by_key = {(o["source"]["document_id"], o["namespace"]): o for o in obs}
        self.assertEqual(by_key[("a", "vehicle.model")]["content_location_id"], by_key[("b", "vehicle.model")]["content_location_id"])
        self.assertNotEqual(by_key[("a", "vehicle.model")]["content_location_id"], by_key[("c", "vehicle.model")]["content_location_id"])
        self.assertNotEqual(by_key[("a", "vehicle.model")]["content_location_id"], by_key[("a", "weapon.spec")]["content_location_id"])
        self.assertTrue(all(o["identifier"]["hex"] == "12345678" and o["identifier"]["width_bits"] == 32 for o in obs))

    def test_full64_values_case_and_exact_full_structure_selector(self):
        self.selectors = [selector("weapon-id64", "weapon.definition", "aaaaaaaa", 0,
                                   fmt="psin", struct="11111111aabbccdd", encoding="hex64")]
        self.add("chosen", fmt="psin", struct="11111111aabbccdd", fields=[(0, "aaaaaaaa", "Name", 0, "4d")],
                 values=[{"Name": "00000001deadbeef"}, {"Name": "FFFFFFFFDEADBEEF"}])
        self.add("same-low-structure", fmt="psin", struct="22222222aabbccdd", fields=[(0, "aaaaaaaa", "Name", 0, "4d")],
                 values=[{"Name": "00000003deadbeef"}])
        summary, obs = self.run_extract()
        self.assertEqual(len(obs), 2)
        self.assertEqual(summary["hash64_low32_collision_groups"], 1)
        self.assertEqual({o["identifier"]["decoded_value_text"] for o in obs}, {"00000001deadbeef", "FFFFFFFFDEADBEEF"})
        self.assertEqual({o["native_schema"]["hash64"] for o in obs}, {"11111111aabbccdd"})
        self.assertTrue(all(o["identifier"]["width_bits"] == 64 and len(o["identifier"]["hex"]) == 16 for o in obs))

    def test_field_key_collision_is_rejected(self):
        self.add("collision", fields=[(0, "aaaaaaaa", "same", 0, "4a"), (1, "bbbbbbbb", "same", 4, "4a")], values=[{"same": 7}])
        summary, obs = self.run_extract()
        self.assertEqual(obs, [])
        self.assertEqual(summary["issues"], {"decoded_field_key_collision": 2})

    def test_conflicting_repeated_content_is_explicit(self):
        self.add("a")
        self.add("b", values=[{"a": 17, "b": 0x12345678}])
        summary, obs = self.run_extract()
        self.assertEqual(len(obs), 4)
        self.assertEqual(summary["conflicting_content_locations"], 1)
        self.assertEqual(summary["issues"]["repeated_content_location_value_conflict"], 1)
        self.assertEqual(summary["distinct_identifier_values_by_namespace"]["vehicle.model"], 2)

    def test_bounded_stop_and_inventory_without_values(self):
        self.add("a")
        summary, obs = self.run_extract(max_observations=1)
        self.assertEqual(summary["status"], "bounded_stop")
        self.assertFalse(summary["scope_complete"])
        self.assertEqual(len(obs), 1)
        self.db.execute("UPDATE r2_decode_instances SET object_json='not JSON at all'")
        summary, obs = self.run_extract(output=self.root / "inventory", inventory_only=True)
        self.assertEqual(summary["status"], "completed")
        self.assertEqual(obs, [])
        self.assertEqual(summary["outputs"]["schema-inventory.jsonl"]["rows"], 2)

    def test_master_baseline_and_ambiguous_type_guards(self):
        self.add("a")
        self.db.execute("UPDATE r2_metadata SET value_json='{}' WHERE key='baseline_summary'")
        with self.assertRaisesRegex(ValueError, "Successful preserved baseline"):
            self.run_extract()
        self.selectors[0]["field_type"] = "65"
        with self.assertRaisesRegex(ValueError, "Only explicit u32"):
            self.run_extract()


if __name__ == "__main__":
    unittest.main()
