"""Opt-in independent AC candidate oracle using the pre-existing Anvil unpacker.

No import from the new JavaScript connector. No save bytes, key or owner identity
are written to the report. All paths and exact expected field patches come from
a private JSON config in SAVERIFT_AC_ORACLE_CONFIG. Does not write a game folder.
"""
# SPDX-License-Identifier: Apache-2.0
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import zlib


def sha(data):
    return hashlib.sha256(data).hexdigest()


def crc32c(data):
    table = []
    for n in range(256):
        for _ in range(8):
            n = (n >> 1) ^ (0x82F63B78 if n & 1 else 0)
        table.append(n)
    value = 0xF4C3B8A2 ^ 0xFFFFFFFF
    for byte in data:
        value = table[(value ^ byte) & 255] ^ (value >> 8)
    return value ^ 0xFFFFFFFF


def validate_frame(data, contexts):
    assert len(data) >= 24 and data[:4] == bytes.fromhex('acdbfe00'), 'Unsupported decoded signature'
    assert zlib.crc32(data[20:-4], 0xF4C3B8A2) == struct.unpack_from('<I', data, 16)[0], 'Payload CRC32 mismatch'
    assert crc32c(data[:-4]) == struct.unpack_from('<I', data, len(data) - 4)[0], 'Footer CRC32C mismatch'
    for row in contexts:
        magic, end = row['magic_offset'], row['end_offset']
        assert 8 <= magic < end <= len(data) - 4
        assert data[magic:magic + 8] == bytes.fromhex('33aafb5799fa0410')
        assert struct.unpack_from('<II', data, magic - 8) == (end - magic + 4, row['bytes'])
        for block in row['blocks']:
            if block['flag'] == 1:
                packed = data[block['offset'] + 13:block['offset'] + 13 + block['compressed']]
                assert len(packed) == block['compressed']
                assert zlib.adler32(packed, 0) == block['checksum'], 'Block Adler checksum mismatch'
        plain = Path(row['output']).read_bytes()
        assert len(plain) == row['bytes'] and sha(plain) == row['sha256']


def external(path):
    result = Path(path).resolve()
    checkout = Path(__file__).resolve().parents[1]
    assert result != checkout and checkout not in result.parents, 'Private data must be outside the source checkout'
    return result


def main():
    config = json.loads(Path(os.environ['SAVERIFT_AC_ORACLE_CONFIG']).read_text(encoding='utf-8-sig'))
    if config.get('format') == 'progression-context':
        return progression_context(config)
    original_manifest = external(config['originalContexts'])
    original_decoded = external(config['originalDecoded']).read_bytes()
    source_raw = external(config['originalFile']).read_bytes()
    candidate_raw = external(config['candidateFile']).read_bytes()
    output = external(config['outputDirectory'])
    output.mkdir(parents=True, exist_ok=True)
    if config.get('keyFile'):
        key = external(config['keyFile']).read_bytes()
        assert len(key) == 16, 'A selected private 16-byte base key is required'
        assert source_raw[:40] == candidate_raw[:40], 'Original ACST wrapper changed'
        encoded = candidate_raw[40:]
        rotation = len(encoded) % 16
        key = key[-rotation:] + key[:-rotation] if rotation else key
        decoded = bytes(b ^ key[i % 16] for i, b in enumerate(encoded))
    else:
        decoded = candidate_raw
    (output / 'candidate.offset40.candidate.bin').write_bytes(decoded)
    manifest = output / 'contexts.json'
    completed = subprocess.run([str(external(config['powershell'])), '-NoProfile', '-File',
        str(external(config['unpacker'])), '-SnapshotPath', str(output), '-ManifestPath', str(manifest)],
        capture_output=True, text=True)
    if completed.returncode:
        (output / 'unpacker-error.txt').write_text(completed.stdout + '\n' + completed.stderr, encoding='utf8')
        raise AssertionError('Independent Anvil unpacker failed; see private error file')
    original = json.loads(original_manifest.read_text(encoding='utf-8-sig'))
    candidate = json.loads(manifest.read_text(encoding='utf-8-sig'))
    validate_frame(original_decoded, original)
    validate_frame(decoded, candidate)
    assert len(original) == len(candidate), 'Context count changed'
    changes = []
    applied = 0
    for before, after in zip(original, candidate):
        assert before['context'] == after['context'], 'Context order changed'
        old = Path(before['output']).read_bytes()
        expected = bytearray(old)
        for patch in config.get('expectedPatches', []):
            if patch['context'] != before['context']:
                continue
            assert patch['format'] in ('<i', '<I'), 'Only the reviewed fixed-width 32-bit fields are supported'
            offset = patch['offset']
            assert struct.unpack_from(patch['format'], expected, offset)[0] == patch['before'], 'Independent precondition mismatch'
            struct.pack_into(patch['format'], expected, offset, patch['after'])
            applied += 1
        actual = Path(after['output']).read_bytes()
        assert actual == bytes(expected), f'Unexpected plaintext change in context {before["context"]}'
        if actual != old:
            changes.append({'context': before['context'], 'changedBytes': sum(a != b for a, b in zip(old, actual)),
                'beforeSha256': sha(old), 'afterSha256': sha(actual)})
    assert applied == len(config.get('expectedPatches', [])), 'Not all expected patches were checked'
    # Non-context bytes must be unchanged except record sizes and the two CRCs.
    def gaps(data, rows):
        result, previous = [], 0
        for row in rows:
            gap = bytearray(data[previous:row['magic_offset'] - 8])
            if previous == 0 and len(gap) >= 20:
                gap[16:20] = bytes(4)
            result.append(bytes(gap))
            previous = row['end_offset']
        result.append(data[previous:-4])
        return result
    assert gaps(original_decoded, original) == gaps(decoded, candidate), 'Non-context bytes changed beyond CRC/record lengths'
    siblings = []
    for pair in config.get('siblings', []):
        left, right = external(pair['before']).read_bytes(), external(pair['after']).read_bytes()
        assert left == right, 'Unrelated selected sibling changed'
        siblings.append({'role': pair.get('role', 'sibling'), 'byteLength': len(left), 'sha256': sha(left), 'byteIdentical': True})
    report = {'schema': 'saverift.ac-shadows.independent-oracle.v1', 'status': 'passed',
        'oracle': 'Existing AnvilToolkit decompressor plus independent Python seeded CRC32/CRC32C/Adler and exact plaintext comparison',
        'originalSha256': sha(source_raw), 'candidateSha256': sha(candidate_raw),
        'originalByteLength': len(source_raw), 'candidateByteLength': len(candidate_raw),
        'contextCount': len(original), 'unchangedContexts': len(original) - len(changes),
        'changedContexts': changes, 'expectedFieldPatches': applied, 'siblings': siblings,
        'allUnrelatedPlaintextPreserved': True, 'nonContextFramingPreserved': True,
        'candidateIntegrity': 'passed', 'sourceIntegrity': 'passed', 'inGame': 'not_run', 'recovery': 'not_run'}
    (output / 'oracle-report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps(report))


def progression_context(config):
    """Narrow fallback: independently validate an exported progression context.

    This path cannot claim native save-wrapper acceptance or ready-to-load output.
    """
    source = external(config['originalFile']).read_bytes()
    candidate = external(config['candidateFile']).read_bytes()
    parser_directory = external(config['parserDirectory'])
    sys.path.insert(0, str(parser_directory))
    from parse_saved_properties import Parser
    for label, data in [('source', source), ('candidate', candidate)]:
        parser = Parser(data)
        tree, used = parser.obj(0, len(data))
        assert used == len(data) and not parser.errors, f'{label} property parse incomplete'
        assert tree['type_hash'] == '1868920887' and tree['type'] == 'AssassinProgressionSaveData', 'Unsupported progression root'
    expected = bytearray(source)
    for patch in config['expectedPatches']:
        assert patch['format'] in ('<i', '<I')
        assert struct.unpack_from(patch['format'], expected, patch['offset'])[0] == patch['before']
        struct.pack_into(patch['format'], expected, patch['offset'], patch['after'])
    assert bytes(expected) == candidate, 'Candidate differs outside the independently declared property patches'
    siblings = []
    for pair in config.get('siblings', []):
        left, right = external(pair['before']).read_bytes(), external(pair['after']).read_bytes()
        assert left == right, 'Unrelated selected sibling changed'
        siblings.append({'role': pair.get('role', 'sibling'), 'byteLength': len(left), 'sha256': sha(left), 'byteIdentical': True})
    report = {'schema': 'saverift.ac-shadows.independent-oracle.v1', 'status': 'passed',
        'oracle': 'Previous Python typed-property parser plus exact whole-context plaintext comparison',
        'format': 'exported progression context; not an installable native save',
        'originalSha256': sha(source), 'candidateSha256': sha(candidate),
        'originalByteLength': len(source), 'candidateByteLength': len(candidate),
        'sourceAndCandidateFullyParsed': True, 'expectedFieldPatches': len(config['expectedPatches']),
        'changedBytes': sum(a != b for a, b in zip(source, candidate)),
        'allUnrelatedPlaintextPreserved': True, 'siblings': siblings,
        'nativeSaveIntegrity': 'not_run', 'inGame': 'not_run', 'recovery': 'not_run'}
    output = external(config['outputDirectory'])
    output.mkdir(parents=True, exist_ok=True)
    (output / 'oracle-report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
