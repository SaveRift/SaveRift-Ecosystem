"""Focused PSIN-origin and section-boundary tests; v0.1 fixtures stay unchanged."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import struct
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("byte_witness_v2", HERE / "verify_native_lookup_bytes_v2.py")
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
spec = importlib.util.spec_from_file_location("old_witness_fixtures", HERE / "test_verify_native_lookup_bytes.py")
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)


def psin_fixture(root, *, section_length=80, gfx=None):
    args = old.WitnessTests().fixture(root, offset=48, sys_size=120, gfx=gfx)
    db = sqlite3.connect(args.database)
    source = json.loads(db.execute("SELECT source_json FROM r2_decode_documents").fetchone()[0])
    raw_path = Path(source["path"])
    raw = bytearray(raw_path.read_bytes())
    raw[:4] = b"PSIN"
    struct.pack_into(">I", raw, 4, section_length)
    # A mistaken additional +8 or +16 must read a different scalar.
    struct.pack_into("<I", raw, 56, 0x11223344)
    struct.pack_into("<I", raw, 64, 0xAABBCCDD)
    raw_path.write_bytes(raw)
    source["sha256"] = v.file_hash(raw_path)
    db.execute("UPDATE r2_decode_documents SET format='psin',source_sha256=?,source_json=?", (source["sha256"], json.dumps(source)))
    db.execute("UPDATE r2_decode_attempts SET source_sha256=?", (source["sha256"],))
    db.commit()
    db.close()
    observation = json.loads(args.observations.read_text())
    observation["namespace"] = "item.referenceTable.ItemId"
    observation["instance_offset"] = "32"
    observation["native_schema"].update(struct_hash="3f7f2239c0458831", hash64="3f7f2239c0458831", hash32="c0458831", byte_size=40)
    observation["native_schema"]["selected_field"].update(byte_offset=16, field_hash="f50c1b43", field_index=0)
    observation["source"]["source_sha256"] = source["sha256"]
    observation["source"]["content_key"].update(format="psin", source_sha256=source["sha256"])
    observation["source"]["content_key_sha256"] = v.digest(observation["source"]["content_key"])
    args.observations.write_text(v.pack(observation) + "\n")
    summary_path = args.observations.with_name("summary.json")
    summary = json.loads(summary_path.read_text())
    summary["outputs"]["observations.jsonl"].update(sha256=v.file_hash(args.observations), bytes=args.observations.stat().st_size)
    summary_path.write_text(json.dumps(summary))
    return args


class PsinWitnessTests(unittest.TestCase):
    def test_psin_scalar_offset_is_magic_origin_plus_field_offset(self):
        with tempfile.TemporaryDirectory() as temporary:
            args = psin_fixture(Path(temporary))
            before = v.file_hash(args.database)
            receipt = v.verify(args)
            self.assertEqual(receipt["tool"], "saverift-native-lookup-byte-verification/0.2.0")
            self.assertTrue(receipt["all_observations_verified"])
            row = json.loads((args.output / "verification.jsonl").read_text())
            self.assertEqual((row["file_offset"], row["actual_scalar_hex"], row["payload_format"], row["offset_space"]),
                             ("48", "f1234567", "psin", "psin-magic-origin"))
            self.assertEqual(v.file_hash(args.database), before)
            self.assertEqual(receipt["verification_sha256"], v.file_hash(args.output / "verification.jsonl"))

    def test_later_section_bytes_cannot_pass_as_psin_instance_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            args = psin_fixture(Path(temporary), section_length=44)
            receipt = v.verify(args)
            self.assertFalse(receipt["all_observations_verified"])
            self.assertEqual(receipt["file_issue_counts"], {"field_outside_psin_section": 1})
            self.assertEqual(receipt["verified_occurrences"], 0)

    def test_invalid_first_section_length_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            args = psin_fixture(Path(temporary), section_length=121)
            receipt = v.verify(args)
            self.assertFalse(receipt["all_observations_verified"])
            self.assertEqual(receipt["file_issue_counts"], {"psin_first_section_length_invalid": 1})

    def test_psin_graphics_input_is_not_silently_reinterpreted(self):
        with tempfile.TemporaryDirectory() as temporary:
            args = psin_fixture(Path(temporary), gfx=16)
            receipt = v.verify(args)
            self.assertFalse(receipt["all_observations_verified"])
            self.assertEqual(receipt["status_counts"], {"invalid_observation_or_source_binding": 1})

    def test_meta7a_split_graphics_still_uses_prior_alignment_rule(self):
        with tempfile.TemporaryDirectory() as temporary:
            args = old.WitnessTests().fixture(Path(temporary), offset=36, sys_size=17, gfx=16, base=9999)
            receipt = v.verify(args)
            self.assertTrue(receipt["all_observations_verified"])
            row = json.loads((args.output / "verification.jsonl").read_text())
            self.assertEqual((row["file_region"], row["file_offset"], row["payload_format"]), ("graphics", "4", "meta7a"))


if __name__ == "__main__":
    unittest.main()
