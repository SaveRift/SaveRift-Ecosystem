"""Inspect selected native UI textures without downloading an entire archive.

Use the existing verified HTTP-range transport and read-only research index.
Sparse files are research mirrors, never complete archive exports. Decode only
explicitly selected hashes after recording every compressed span they require.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import struct
import subprocess


MAX_READ = 32 * 1024 * 1024
PREFIX_BYTES = 64
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'


def fresh_output(path):
    """A fresh directory prevents an older decode from becoming new evidence."""
    requested = Path(path).absolute()
    if requested.exists() or requested.is_symlink():
        raise FileExistsError('Sampling output must not already exist')
    out = requested.resolve()
    out.mkdir(parents=True, exist_ok=False)
    return out


def validate_store_path(store):
    if not isinstance(store, str) or not store or '\\' in store or ':' in store:
        raise ValueError('Store must be a relative archive-member path')
    if store.startswith('/') or any(part in ('', '.', '..') for part in store.split('/')):
        raise ValueError('Store must be a relative archive-member path')
    return store


def normalize_hash(value):
    if not isinstance(value, str):
        raise ValueError('Texture hash must be a 64-bit hexadecimal string')
    key = value.lower().removeprefix('0x')
    if len(key) != 16 or any(c not in '0123456789abcdef' for c in key):
        raise ValueError('Texture hash must be a 64-bit hexadecimal string')
    return key


def unique_hashes(values):
    keys = [normalize_hash(value) for value in values]
    if len(keys) != len(set(keys)):
        raise ValueError('Duplicate requested texture hash')
    return keys


def fetch_exact(fetch_range, start, size, source_size):
    if any(type(value) is not int for value in (start, size, source_size)) or start < 0 or not 0 < size <= MAX_READ or start + size > source_size:
        raise ValueError('Source range is outside the bounded source extent')
    data, validators = fetch_range(start, size)
    if not isinstance(data, bytes) or len(data) != size:
        raise ValueError('Range response does not have the exact requested byte count')
    return data, validators


def read_member(fetch_range, member, offset, size, source_size, ranges):
    if any(type(value) is not int for value in (offset, size)) or offset < 0 or not 0 < size <= MAX_READ or offset + size > member['packed_size']:
        raise ValueError('Member range is outside the pinned bounds')
    data, validators = fetch_exact(fetch_range, member['data_offset'] + offset, size, source_size)
    ranges.append({'memberOffset': offset, 'bytes': size, 'sha256': hashlib.sha256(data).hexdigest(), **validators})
    return data


def downloaded_bytes(receipt):
    return receipt.get('archivePrefix', {}).get('bytes', 0) + sum(item['bytes'] for item in receipt['ranges'])


def verify_decode_results(returncode, stdout, requested_hashes, decoded_directory):
    """Verify this invocation's default mip-0/slice-0 PNGs, not just exit status."""
    if returncode != 0:
        raise ValueError('Decoder exited unsuccessfully')
    wanted = unique_hashes(requested_hashes)
    if not wanted:
        raise ValueError('No texture hashes were requested for decoding')
    try:
        results = json.loads(stdout)
    except (ValueError, UnicodeError) as error:
        raise ValueError('Decoder output is not a JSON result array') from error
    if not isinstance(results, list) or len(results) != len(wanted):
        raise ValueError('Decoder did not return one result for every requested hash')
    directory = Path(decoded_directory).resolve()
    verified, seen, paths = [], set(), set()
    for result in results:
        if not isinstance(result, dict):
            raise ValueError('Malformed texture decode result')
        key = normalize_hash(result.get('hash'))
        if key not in wanted or key in seen:
            raise ValueError('Decoder returned an unexpected or duplicate hash')
        seen.add(key)
        if 'error' in result or result.get('partial') is not False or type(result.get('undecoded_bytes')) is not int or result['undecoded_bytes'] != 0:
            raise ValueError('Texture decode failed or contains undecoded bytes')
        if type(result.get('slice')) is not int or result['slice'] != 0 or type(result.get('slices')) is not int or result['slices'] < 1:
            raise ValueError('Decoder did not return the requested default slice')
        if not all(type(result.get(key)) is int and 0 < result[key] <= 16384 for key in ('w', 'h')):
            raise ValueError('Decoder returned invalid PNG dimensions')
        if not isinstance(result.get('png'), str) or not result['png']:
            raise ValueError('Decoder did not report a PNG path')
        reported = Path(result['png'])
        expected = directory / f'{key}_m0.png'
        if reported.is_symlink() or expected.is_symlink() or reported.resolve() != expected:
            raise ValueError('Decoder PNG path is outside the current requested output')
        if not expected.is_file():
            raise ValueError('Decoder PNG output is missing')
        size = expected.stat().st_size
        if not 33 <= size <= 128 * 1024 * 1024:
            raise ValueError('Decoder PNG output is outside the bounded size')
        digest = hashlib.sha256()
        with expected.open('rb') as stream:
            header = stream.read(33)
            if header[:8] != PNG_SIGNATURE or header[8:16] != b'\x00\x00\x00\x0dIHDR' or struct.unpack('>II', header[16:24]) != (result['w'], result['h']):
                raise ValueError('PNG header does not match the current decode result')
            digest.update(header)
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(block)
        paths.add(expected)
        verified.append({'hash': key, 'name': expected.name, 'bytes': size, 'sha256': digest.hexdigest(),
                         'width': result['w'], 'height': result['h'], 'slice': 0, 'slices': result['slices'],
                         'mip': 0, 'format': result.get('format'), 'partial': False, 'undecodedBytes': 0})
    if seen != set(wanted) or set(directory.glob('*.png')) != paths:
        raise ValueError('Missing or unexpected PNG files in the current decode directory')
    return sorted(verified, key=lambda item: item['hash'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', required=True)
    parser.add_argument('--config', required=True)
    parser.add_argument('--transport', required=True)
    parser.add_argument('--decoder', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--store', default='data/ttdb/ui/ttdb_ui.ttpf')
    parser.add_argument('--hash', action='append', default=[])
    args = parser.parse_args()
    validate_store_path(args.store)
    requested_hashes = unique_hashes(args.hash)
    out = fresh_output(args.output)
    os.environ['SAVERIFT_HTTP_CONFIG'] = args.config
    spec = importlib.util.spec_from_file_location('range_transport', args.transport)
    transport = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(transport)
    db = sqlite3.connect(Path(args.database).resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    row = db.execute('select id,path,data_offset,packed_size,logical_size,method,sha256 from outer_files where path=?', (args.store,)).fetchone()
    if row is None or row['method'] != 0x30 or row['packed_size'] != row['logical_size']:
        raise ValueError('Expected one pinned, directly readable stored member')
    member = dict(row)
    db.close()
    receipt = {'schema':'saverift.native-texture-sample.v1', 'member':member,
               'mirrorComplete':False, 'transportSha256':hashlib.sha256(Path(args.transport).read_bytes()).hexdigest(),
               'decoderSha256':hashlib.sha256(Path(args.decoder).read_bytes()).hexdigest(), 'ranges':[], 'selected':[],
               'memberHashEvidence': {'expectedSha256': member.get('sha256'), 'basis': 'historical-index', 'verifiedThisRun': False},
               'decodeScope': {'mip': 0, 'slice': 0}}
    config = transport.configuration()

    def read(offset, size):
        return read_member(transport.fetch_range, member, offset, size, config['expected_size'], receipt['ranges'])

    prefix, prefix_validators = fetch_exact(transport.fetch_range, 0, PREFIX_BYTES, config['expected_size'])
    prefix_digest = hashlib.sha256(prefix).hexdigest()
    if prefix_digest != config['expected_prefix_sha256']:
        raise ValueError('Archive prefix changed')
    receipt['archivePrefix'] = {'sourceOffset': 0, 'bytes': PREFIX_BYTES, 'sha256': prefix_digest,
                                'matchedExpectedSha256': True, **prefix_validators}
    header = read(0, 24)
    if header[:4] != b'RDS5':
        raise ValueError('Not an RDS5 texture store')
    count = struct.unpack_from('<I', header, 4)[0]
    if not 2 <= count <= 1_000_000:
        raise ValueError('Unexpected chunk-table count')
    etpf_offset = (0x10+8*count+0xff)&~0xff
    etpf = read(etpf_offset, 16)
    if etpf[:4] != b'ETPF':
        raise ValueError('ETPF marker is missing')
    nt = struct.unpack_from('<I', etpf, 8)[0]
    if not 1 <= nt <= 100_000:
        raise ValueError('Unexpected texture count')
    metadata_end = max(24+8*count, etpf_offset+16+24*nt)
    metadata = read(0, metadata_end)
    table = []
    for i in range(count):
        a,b = struct.unpack_from('<II', metadata, 24+8*i)
        if a == b == 0:
            break
        table.append({'offset':(a&0xffffff)<<8,'virt':0x1000+(b&0xfffff)*0x4000+(a>>30)*0x1000,'codec':(a>>24)&0x3f,'padding':b>>20})
    if len(table)<2 or any(b['offset']<a['offset'] or b['virt']<=a['virt'] for a,b in zip(table,table[1:])):
        raise ValueError('Nonmonotonic texture chunk table')
    if table[-1]['offset'] > member['packed_size']:
        raise ValueError('Chunk table exceeds member')
    receipt.update(textureCount=nt,chunkCount=len(table)-1,metadataBytes=metadata_end)
    mirror = out/'sparse-install'/args.store
    mirror.parent.mkdir(parents=True,exist_ok=True)
    mirror.write_bytes(metadata)
    if os.name == 'nt':
        sparse = subprocess.run(['fsutil','sparse','setflag',str(mirror)],capture_output=True)
        receipt['sparseFileFlagSet'] = sparse.returncode == 0
    command = [args.decoder,'--game',str(out/'sparse-install'),'--work',str(out/'decoder-work'),'--quiet','ttpf',args.store]
    listing = subprocess.run(command,capture_output=True,check=True)
    (out/'store-listing.json').write_bytes(listing.stdout)
    listing_json = json.loads(listing.stdout)
    textures = listing_json if isinstance(listing_json,list) else listing_json.get('textures',[])
    if len(textures) != nt:
        print(json.dumps({'status':'listing_schema_review_needed','keys':list(listing_json) if isinstance(listing_json,dict) else None,'expectedTextures':nt,'listedTextures':len(textures)}))
        receipt['downloadedBytes'] = downloaded_bytes(receipt)
        (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
        return 2
    by_hash = {f"{t['hash']:016x}" if isinstance(t['hash'],int) else t['hash'].lower().removeprefix('0x'):t for t in textures}
    if len(by_hash) != len(textures):
        raise ValueError('Texture listing contains duplicate hashes')
    selected = []
    wanted_chunks = {}
    for key in requested_hashes:
        if key not in by_hash:
            raise ValueError('Selected hash is absent or invalid')
        t = by_hash[key]
        if not 0<t['size']<=64*1024*1024:
            raise ValueError('Texture extent exceeds sampling budget')
        start,end=t['virt'],t['virt']+t['size']
        spans=[]
        for index,(a,b) in enumerate(zip(table,table[1:])):
            if a['virt']<end and b['virt']>start:
                n=b['offset']-a['offset']-a['padding']
                if n<=0 or a['offset']<metadata_end:
                    raise ValueError('Invalid data span')
                span={**a,'index':index,'bytes':n,'virtualEnd':b['virt']}
                spans.append(span)
                wanted_chunks[index]=span
        if not spans or spans[0]['virt']>start or spans[-1]['virtualEnd']<end:
            raise ValueError('Texture virtual extent is not fully covered')
        selected.append({'hash':key,'texture':t,'chunks':spans,'coverageVerified':True,'visualVerified':False})
    if sum(v['bytes'] for v in wanted_chunks.values()) > 128*1024*1024:
        raise ValueError('Compressed texture sampling budget exceeded')
    with mirror.open('r+b') as f:
        for index,span in sorted(wanted_chunks.items()):
            data=read(span['offset'],span['bytes'])
            f.seek(span['offset']);f.write(data)
    receipt['selected']=selected
    receipt['downloadedBytes']=downloaded_bytes(receipt)
    (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    if selected:
        decoded_directory = out/'decoded'
        if decoded_directory.exists():
            raise ValueError('Decode directory must be fresh')
        decode_args=command+['--out',str(decoded_directory)]
        for t in selected:decode_args+=['--hash',t['hash']]
        decoded=subprocess.run(decode_args,capture_output=True)
        (out/'decode-result.json').write_bytes(decoded.stdout)
        (out/'decode-stderr.txt').write_bytes(decoded.stderr)
        receipt['decodeExitCode']=decoded.returncode
        try:
            receipt['pngs'] = verify_decode_results(decoded.returncode, decoded.stdout, requested_hashes, decoded_directory)
            receipt['decodeStatus'] = 'complete'
        except ValueError as error:
            receipt['decodeStatus'] = 'failed'
            receipt['decodeVerificationError'] = str(error)
            receipt['pngs'] = []
        (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    status = receipt.get('decodeStatus', 'listed')
    print(json.dumps({'status':status,'textureCount':nt,'selected':len(selected),'downloadedBytes':receipt['downloadedBytes'],'pngs':receipt.get('pngs',[]),'decoderExitCode':receipt.get('decodeExitCode')}))
    return 1 if status == 'failed' else 0


if __name__=='__main__':
    raise SystemExit(main())
