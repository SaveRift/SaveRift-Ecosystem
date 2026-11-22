"""Offline regression checks for native texture sampling evidence gates."""
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

import sample_native_ui as sampler


HASH = '0123456789abcdef'
OTHER_HASH = 'fedcba9876543210'


def png_bytes(width=1, height=1):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    pixels = (b'\x00' + bytes(width * 4)) * height
    return (sampler.PNG_SIGNATURE + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b''))


class NativeSampleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.directory = self.root / 'decoded'
        self.directory.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def result(self, key=HASH):
        path = self.directory / f'{key}_m0.png'
        path.write_bytes(png_bytes())
        return {'hash': key, 'png': str(path), 'partial': False, 'undecoded_bytes': 0,
                'w': 1, 'h': 1, 'format': 'BC7_UNORM', 'slice': 0, 'slices': 1}

    def verify(self, results, wanted=None, returncode=0):
        return sampler.verify_decode_results(returncode, json.dumps(results).encode(), wanted or [HASH], self.directory)

    def test_current_complete_png_has_a_verified_digest(self):
        result = self.result()
        verified = self.verify([result])
        self.assertEqual(verified[0]['hash'], HASH)
        self.assertEqual(verified[0]['sha256'], hashlib.sha256(png_bytes()).hexdigest())
        self.assertEqual(verified[0]['bytes'], len(png_bytes()))
        self.assertEqual(verified[0]['mip'], 0)
        self.assertFalse(verified[0]['partial'])

    def test_exit_zero_error_record_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'failed|undecoded'):
            self.verify([{'hash': HASH, 'error': 'synthetic decode failure'}])

    def test_nonzero_exit_and_malformed_output_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exited'):
            self.verify([self.result()], returncode=1)
        for output in (b'not json', b'{}', b'null'):
            with self.subTest(output=output), self.assertRaises(ValueError):
                sampler.verify_decode_results(0, output, [HASH], self.directory)

    def test_partial_missing_flags_or_undecoded_bytes_are_rejected(self):
        original = self.result()
        for updates, remove in (({'partial': True}, None), ({'undecoded_bytes': 8}, None), ({}, 'partial'), ({}, 'undecoded_bytes'), ({'error': ''}, None)):
            candidate = {**original, **updates}
            if remove:
                del candidate[remove]
            with self.subTest(updates=updates, remove=remove), self.assertRaises(ValueError):
                self.verify([candidate])

    def test_missing_result_and_missing_file_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'every requested'):
            self.verify([])
        candidate = self.result()
        Path(candidate['png']).unlink()
        with self.assertRaisesRegex(ValueError, 'missing'):
            self.verify([candidate])

    def test_duplicate_requested_and_result_hashes_are_rejected(self):
        candidate = self.result()
        with self.assertRaisesRegex(ValueError, 'Duplicate requested'):
            self.verify([candidate, candidate], [HASH, '0x' + HASH.upper()])
        with self.assertRaisesRegex(ValueError, 'duplicate hash'):
            self.verify([candidate, candidate], [HASH, OTHER_HASH])

    def test_unrequested_hash_is_rejected(self):
        candidate = self.result(OTHER_HASH)
        with self.assertRaisesRegex(ValueError, 'unexpected'):
            self.verify([candidate])

    def test_outside_and_wrong_named_paths_are_rejected(self):
        candidate = self.result()
        for path in (self.root / f'{HASH}_m0.png', self.directory / 'unrelated.png'):
            path.write_bytes(png_bytes())
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'outside'):
                self.verify([{**candidate, 'png': str(path)}])

    def test_symlink_png_is_rejected(self):
        candidate = self.result()
        path = Path(candidate['png'])
        path.unlink()
        outside = self.root / 'outside.png'
        outside.write_bytes(png_bytes())
        try:
            path.symlink_to(outside)
        except OSError:
            self.skipTest('This platform does not permit test symlinks')
        with self.assertRaisesRegex(ValueError, 'outside'):
            self.verify([candidate])

    def test_stale_unreported_png_is_rejected(self):
        candidate = self.result()
        self.result(OTHER_HASH)
        with self.assertRaisesRegex(ValueError, 'unexpected PNG'):
            self.verify([candidate])

    def test_png_header_and_default_slice_must_match(self):
        candidate = self.result()
        for change in ({'w': 2}, {'slice': 1}, {'slice': False}, {'slices': 0}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.verify([{**candidate, **change}])
        Path(candidate['png']).write_bytes(b'not a png' * 10)
        with self.assertRaisesRegex(ValueError, 'PNG header'):
            self.verify([candidate])

    def test_fresh_output_rejects_existing_files_without_modifying_them(self):
        output = sampler.fresh_output(self.root / 'new-output')
        sentinel = output / 'prior.png'
        sentinel.write_bytes(b'old evidence')
        with self.assertRaises(FileExistsError):
            sampler.fresh_output(output)
        self.assertEqual(sentinel.read_bytes(), b'old evidence')
        with self.assertRaises(FileExistsError):
            sampler.fresh_output(sentinel)
        self.assertTrue(sampler.fresh_output(self.root / 'fresh-parent' / 'out').is_dir())

    def test_fresh_output_rejects_dangling_symlink(self):
        link = self.root / 'linked-output'
        target = self.root / 'missing-output'
        try:
            link.symlink_to(target, target_is_directory=True)
        except OSError:
            self.skipTest('This platform does not permit test symlinks')
        with self.assertRaises(FileExistsError):
            sampler.fresh_output(link)
        self.assertFalse(target.exists())

    def test_stored_member_path_cannot_escape_mirror(self):
        self.assertEqual(sampler.validate_store_path('data/ttdb/ui/ttdb_ui.ttpf'), 'data/ttdb/ui/ttdb_ui.ttpf')
        for path in ('/absolute.ttpf', '../outside.ttpf', 'data/../outside.ttpf', 'C:/outside.ttpf', 'data\\file.ttpf', './file.ttpf', 'data//file.ttpf'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                sampler.validate_store_path(path)

    def test_member_read_checks_bounds_and_preserves_exact_range(self):
        calls, ranges = [], []
        def fetch(start, count):
            calls.append((start, count))
            return b'x' * count, {'etag_sha256': 'a' * 64}
        member = {'data_offset': 10, 'packed_size': 30}
        self.assertEqual(sampler.read_member(fetch, member, 7, 3, 100, ranges), b'xxx')
        self.assertEqual(calls, [(17, 3)])
        self.assertEqual(ranges[0]['memberOffset'], 7)
        self.assertEqual(ranges[0]['sha256'], hashlib.sha256(b'xxx').hexdigest())
        for offset, count in ((-1, 1), (0, 0), (29, 2), (1.5, 1), (False, 1), (0, sampler.MAX_READ + 1)):
            with self.subTest(offset=offset, count=count), self.assertRaises(ValueError):
                sampler.read_member(fetch, member, offset, count, 100, ranges)
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(ranges), 1)

    def test_outer_source_bounds_and_short_or_excess_responses(self):
        calls = []
        def fetch(start, count):
            calls.append((start, count))
            return b'x' * count, {}
        for start, count, total in ((0, 1, 0), (98, 3, 100), (0, sampler.MAX_READ + 1, sampler.MAX_READ + 10), (0, True, 100)):
            with self.subTest(start=start, count=count, total=total), self.assertRaises(ValueError):
                sampler.fetch_exact(fetch, start, count, total)
        self.assertFalse(calls)
        for returned in (b'xx', b'xxxx', 'xxx'):
            with self.subTest(returned=returned), self.assertRaisesRegex(ValueError, 'exact requested'):
                sampler.fetch_exact(lambda start, count: (returned, {}), 0, 3, 100)

    def test_byte_accounting_includes_prefix_and_overlapping_requests(self):
        receipt = {'archivePrefix': {'bytes': 64}, 'ranges': [{'bytes': 24}, {'bytes': 16}, {'bytes': 1024}]}
        self.assertEqual(sampler.downloaded_bytes(receipt), 1128)


if __name__ == '__main__':
    unittest.main()
