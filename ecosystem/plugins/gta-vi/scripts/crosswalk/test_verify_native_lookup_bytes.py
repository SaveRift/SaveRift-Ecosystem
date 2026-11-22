import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import struct
import tempfile
import time
from types import SimpleNamespace
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("raw_witness", HERE / "verify_native_lookup_bytes.py")
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


class WitnessTests(unittest.TestCase):
    def fixture(self, root, *, offset=20, sys_size=64, gfx=None, base=0, corrupt=False):
        sys_data = bytearray(sys_size)
        expected = 0xF1234567
        if offset + 4 <= sys_size:
            struct.pack_into("<I", sys_data, offset, expected)
        gfx_data = bytearray(gfx or 0)
        actual_base = (sys_size + 15) & ~15
        if gfx is not None and actual_base <= offset and offset + 4 <= actual_base + gfx:
            struct.pack_into("<I", gfx_data, offset - actual_base, expected)
        path = root / "PRIVATE_SYS_PAYLOAD.bin"
        path.write_bytes(sys_data)
        source = {"payload_id": "p", "path": str(path), "sha256": v.file_hash(path), "bytes": sys_size, "gfx_base": base}
        if gfx is not None:
            gp = root / "PRIVATE_GFX_PAYLOAD.bin"
            gp.write_bytes(gfx_data)
            source.update(gfx_path=str(gp), gfx_sha256=v.file_hash(gp), gfx_bytes=len(gfx_data))
        if corrupt:
            sys_data[0] ^= 0xFF
            path.write_bytes(sys_data)
        database = root / "PRIVATE_DATABASE.sqlite"
        doc_id, output_sha = "1" * 64, "2" * 64
        db = sqlite3.connect(database)
        db.executescript("""
        CREATE TABLE r2_metadata(key TEXT PRIMARY KEY,value_json TEXT);
        CREATE TABLE r2_decode_documents(document_id TEXT PRIMARY KEY,run_id TEXT,payload_id TEXT,source_sha256 TEXT,output_sha256 TEXT,format TEXT,adapter TEXT,upstream_commit TEXT,source_json TEXT);
        CREATE TABLE r2_decode_attempts(run_id TEXT,line_number INTEGER,payload_id TEXT,status TEXT,document_id TEXT,source_sha256 TEXT,record_json TEXT);
        CREATE INDEX attempt_payload ON r2_decode_attempts(run_id,payload_id,line_number);
        """)
        db.execute("INSERT INTO r2_metadata VALUES('baseline_summary',?)", (json.dumps({"original_tables_preserved": True, "master_unchanged": True}),))
        db.execute("INSERT INTO r2_decode_documents VALUES(?,?,?,?,?,?,?,?,?)", (doc_id, "r", "p", source["sha256"], output_sha, "meta7a", v.ADAPTER, v.UPSTREAM, json.dumps(source)))
        db.execute("INSERT INTO r2_decode_attempts VALUES(?,?,?,?,?,?,?)", ("r", 1, "p", "decoded_research", doc_id, source["sha256"], json.dumps({"worker_sha256": v.WORKER})))
        db.commit()
        db.close()
        content = {"format": "meta7a", "source_sha256": source["sha256"], "gfx_sha256": source.get("gfx_sha256") or "",
                   "gfx_base": str(base), "adapter": v.ADAPTER, "upstream_commit": v.UPSTREAM, "worker_sha256": v.WORKER}
        o = {"schema": "saverift.gta-vi.native-lookup-observation.v1", "occurrence_id": "3" * 64, "content_location_id": "4" * 64,
             "namespace": "vehicle.configuration.modelReference", "instance_offset": str(offset),
             "native_schema": {"selected_field": {"field_type": "4a", "byte_offset": 0}},
             "identifier": {"width_bits": 32, "hex": f"{expected:08x}", "decoded_json_type": "integer", "decoded_value_text": str(expected)},
             "source": {"document_id": doc_id, "run_id": "r", "payload_id": "p", "source_sha256": source["sha256"], "output_sha256": output_sha,
                        "line_number": 1, "content_key": content, "content_key_sha256": v.digest(content)}}
        observations = root / "observations.jsonl"
        observations.write_text(v.pack(o) + "\n", encoding="utf-8")
        summary = {"tool": "saverift-native-lookup-staging/0.1.0", "script_sha256": v.EXTRACTOR_SHA256,
                   "status": "completed", "inventory_only": False, "all_selected_observations_valid": True, "issues": {},
                   "selectors_sha256": "5" * 64,
                   "outputs": {"observations.jsonl": {"sha256": v.file_hash(observations), "bytes": observations.stat().st_size, "rows": 1}}}
        (root / "summary.json").write_text(json.dumps(summary))
        args = argparse.Namespace(database=database, observations=observations, extractor_summary=None, output=root / "proof",
                                  max_seconds=30, max_file_bytes=1 << 20, max_total_input_bytes=2 << 20,
                                  max_observations_bytes=1 << 20, max_observations=100, max_documents=100, max_output_bytes=1 << 20)
        return args

    def run_case(self, **kwargs):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            args = self.fixture(root, **kwargs)
            before = v.file_hash(args.database)
            result = v.verify(args)
            self.assertEqual(before, v.file_hash(args.database))
            rows = [json.loads(x) for x in (args.output / "verification.jsonl").read_text().splitlines()]
            self.assertEqual(result["verification_sha256"], v.file_hash(args.output / "verification.jsonl"))
            for path in args.output.iterdir():
                text = path.read_text()
                self.assertNotIn("PRIVATE_", text)
                self.assertNotIn(str(root), text)
            return result, rows

    def test_direct_system_and_combined_offsets_have_no_header_adjustment(self):
        result, rows = self.run_case(offset=20)
        self.assertTrue(result["all_observations_verified"])
        self.assertEqual((rows[0]["file_region"], rows[0]["file_offset"], rows[0]["actual_scalar_hex"]), ("system", "20", "f1234567"))
        result, rows = self.run_case(offset=36, base=32)
        self.assertTrue(result["all_observations_verified"])
        self.assertEqual(rows[0]["file_offset"], "36")

    def test_split_graphics_uses_computed_alignment(self):
        result, rows = self.run_case(offset=36, sys_size=17, gfx=16, base=9999)
        self.assertTrue(result["all_observations_verified"])
        self.assertEqual(result["files_verified"], 2)
        self.assertEqual((rows[0]["file_region"], rows[0]["file_offset"]), ("graphics", "4"))

    def test_padding_and_cross_file_spans_are_rejected(self):
        for offset in (20, 15, 30):
            with self.subTest(offset=offset):
                result, rows = self.run_case(offset=offset, sys_size=17, gfx=16)
                self.assertFalse(result["all_observations_verified"])
                self.assertEqual(result["verified_occurrences"], 0)
                self.assertEqual(rows[0]["status"], "invalid_observation_or_source_binding")

    def test_hash_mismatch_is_not_scalar_proof(self):
        result, rows = self.run_case(corrupt=True)
        self.assertFalse(result["all_observations_verified"])
        self.assertEqual(result["file_issue_counts"], {"file_sha256_mismatch": 1})
        self.assertEqual(rows[0]["status"], "file_identity_unverified")
        self.assertNotIn("actual_scalar_hex", rows[0])

    def test_budget_stop_cannot_certify_all_observations(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.fixture(Path(tmp))
            args.max_total_input_bytes = 16
            result = v.verify(args)
            self.assertEqual(result["status"], "bounded_stop")
            self.assertFalse(result["all_observations_verified"])
            self.assertEqual(result["payload_bytes_hashed"], 0)

    def test_windows_ctime_precision_does_not_hide_real_changes(self):
        def s(ctime=100, **kw):
            return SimpleNamespace(**dict({"st_dev": 1, "st_ino": 2, "st_size": 64, "st_mtime_ns": 50, "st_ctime_ns": ctime}, **kw))
        self.assertTrue(v.same_file_observation(s(100), s(101), s(101), s(100)))
        self.assertFalse(v.same_file_observation(s(100), s(101), s(102), s(100)))
        self.assertFalse(v.same_file_observation(s(100), s(101), s(101), s(100, st_ino=3)))
        self.assertFalse(v.same_file_observation(s(100), s(101, st_mtime_ns=51), s(101, st_mtime_ns=51), s(100)))


if __name__ == "__main__":
    unittest.main()
