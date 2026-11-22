#!/usr/bin/env python3
"""Compare public, explicitly listed media URLs by exact bytes and decoded pixels.

This makes website-to-website evidence only. It does not establish native archive
identity, original texture naming, a save identifier, or permission to redistribute.
It retains hashes and provenance rather than a copy of the downloaded artwork.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, build_opener
import argparse
import hashlib
import io
import json

from PIL import Image

BASE = "https://negentropy.studio"
from media_helpers import media_url as safe_media_url, exact_image_matches
from materialize_media_assets import BodyBudget, SameOriginRedirect
HERE = None
INPUT = None
LIMIT = 400_000
BUDGET = 32 * 1024 * 1024
budget = BodyBudget(BUDGET, LIMIT)


def get_one(job):
    u = safe_media_url(job['mediaPath'])
    try:
        allowance = budget.reserve(); consumed = 0
        try:
            request = Request(u, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity'})
            with build_opener(SameOriginRedirect()).open(request, timeout=25) as r:
                if r.url != u or r.status != 200 or r.headers.get_content_type() != 'image/webp':
                    raise ValueError('Unexpected response identity/type')
                length = r.headers.get('Content-Length')
                if length and int(length) > LIMIT:
                    raise ValueError('Image exceeds bounded limit')
                b = r.read(LIMIT + 1); consumed = len(b)
                if len(b) > LIMIT or (length and int(length) != len(b)):
                    raise ValueError('Unexpected bounded response length')
        finally:
            budget.finish(allowance, consumed)
        im = Image.open(io.BytesIO(b))
        if im.format != 'WEBP' or im.width * im.height > 4_000_000:
            raise ValueError('Image dimensions exceed limit')
        im.load()
        return {**job, 'url': u, 'status': 'ok', 'bytes': len(b),
                'sha256': hashlib.sha256(b).hexdigest(),
                'pixelSha256': hashlib.sha256(im.convert('RGBA').tobytes()).hexdigest(),
                'width': im.width, 'height': im.height}
    except Exception as e:
        return {**job, 'url': u, 'status': 'failed', 'error': str(e)}


def main():
    global HERE, INPUT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, required=True, help='Directory containing pinned images.json and vehiculos.json')
    parser.add_argument('--out', type=Path, required=True, help='Receipt/output directory, resumable')
    args = parser.parse_args()
    HERE, INPUT = args.out, args.inputs
    HERE.mkdir(parents=True, exist_ok=True)
    gallery_bytes = (INPUT / 'images.json').read_bytes()
    vehicles_bytes = (INPUT / 'vehiculos.json').read_bytes()
    if hashlib.sha256(gallery_bytes).hexdigest() != 'bcb3a6273cc7a59d9b887787359bd270ffd51d91a96f5e9fa2e97cad51117aca':
        raise ValueError('Unreviewed gallery snapshot')
    if hashlib.sha256(vehicles_bytes).hexdigest() != 'a556f3b769a36eb192093e0c9cdf4d3ea0fc3b651c1d9a5d7019a8cd8e54441c':
        raise ValueError('Unreviewed vehicle snapshot')
    gallery, vehicles = json.loads(gallery_bytes), json.loads(vehicles_bytes)
    jobs = []
    for source, data, category in [('images', gallery, 'Vehículos'), ('vehicles', vehicles, None)]:
        for i, row in enumerate(data['e']):
            if (category and row[3] != category) or len(row) < 6 or not row[5]:
                continue
            jobs.append({'source': source, 'sourceLocation': f'/e/{i}', 'recordId': row[0],
                         'publishedIdentifier': row[2], 'mediaPath': row[5][0]})
    # Reuse prior exact fetches so a resumed run never reads a URL twice.
    receipts = HERE / 'vehicle-image-hashes.jsonl'
    prior = {}
    if receipts.exists():
        for line in receipts.read_text().splitlines():
            row = json.loads(line)
            if row['status'] == 'ok': prior[row['url']] = row
    sample = HERE / 'sample-media-receipts.json'
    if sample.exists():
        for row in json.loads(sample.read_text()):
            prior.setdefault(row['url'], row)
    records, pending = [], []
    for j in jobs:
        old = prior.get(safe_media_url(j['mediaPath']))
        if old:
            records.append({**j, **{k: old[k] for k in ('url','bytes','sha256','pixelSha256','width','height')}, 'status': 'ok'})
        else: pending.append(j)
    with receipts.open('w') as f:
        for rec in records: f.write(json.dumps(rec) + '\n')
        f.flush()
        with ThreadPoolExecutor(max_workers=6) as ex:
            futures = [ex.submit(get_one, j) for j in pending]
            for future in as_completed(futures):
                rec = future.result(); records.append(rec)
                f.write(json.dumps(rec) + '\n'); f.flush()
                if len(records) % 50 == 0:
                    print(json.dumps({'done': len(records), 'total': len(jobs), 'downloadedBytes': budget.consumed}), flush=True)
    pairs, duplicate_matches, missing_matches = exact_image_matches(records)
    matches = []
    for rec, g, comparison in pairs:
        matches.append({'vehicleRecordId': rec['recordId'], 'vehicleToken': rec['publishedIdentifier'],
                            'vehicleSourceLocation': rec['sourceLocation'], 'vehicleImageUrl': rec['url'],
                            'galleryRecordId': g['recordId'], 'gallerySourceLocation': g['sourceLocation'],
                            'galleryImageUrl': g['url'], 'textureHash64Claim': g['publishedIdentifier'],
                            'comparison': comparison,
                            'vehicleFileSha256': rec['sha256'], 'galleryFileSha256': g['sha256'],
                            'rgbaSha256': rec['pixelSha256'], 'width': rec['width'], 'height': rec['height'],
                            'nativeArchiveVerified': False, 'saveMappingVerified': False})
    ambiguous = [{'recordId': rec['recordId'], 'galleryRecordIds': [g['recordId'] for g in candidates]}
                 for rec, candidates in duplicate_matches]
    unmatched = [rec['recordId'] for rec in missing_matches]
    output = {'schemaVersion': 1, 'method': 'exact-public-media-byte-or-rgba-equality; unique gallery match only',
              'checkedAt': datetime.now(timezone.utc).isoformat(),
              'sources': {'images': {'sha256': hashlib.sha256(gallery_bytes).hexdigest(), 'url': BASE+'/assets/data/en/imagenes.7156e004db.json'},
                          'vehicles': {'sha256': hashlib.sha256(vehicles_bytes).hexdigest(), 'url': BASE+'/assets/data/en/vehiculos.5c062fad5b.json'}},
              'summary': {'jobs': len(jobs), 'successfulFetches': sum(r['status']=='ok' for r in records),
                          'failedFetches': sum(r['status']!='ok' for r in records), 'downloadedBytesThisRun': budget.consumed,
                          'matches': len(matches), 'ambiguous': len(ambiguous), 'unmatched': len(unmatched)},
              'matches': sorted(matches,key=lambda r:r['vehicleRecordId']), 'ambiguous': ambiguous, 'unmatched': unmatched,
              'failures': [r for r in records if r['status']!='ok']}
    (HERE / 'vehicle-texture-image-matches.json').write_text(json.dumps(output, indent=2)+'\n')
    print(json.dumps(output['summary']), flush=True)


if __name__ == '__main__': main()
