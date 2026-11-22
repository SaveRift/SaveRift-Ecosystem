#!/usr/bin/env python3
"""Materialize published catalog image locators into a private immutable asset pack.

The source sidecars are read-only. Optional bound sidecars are written inside the
output folder. No host upload, registry publication, or model download is made.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import tempfile
import threading
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from PIL import Image
from media_helpers import media_url

MAX_IMAGE_BYTES = 1024 * 1024
DEFAULT_BUDGET = 32 * 1024 * 1024
CATEGORIES = ('vehicles', 'weapons', 'items')


class SameOriginRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, target):
        p = urlsplit(target)
        if p.scheme != 'https' or p.netloc != 'negentropy.studio':
            raise ValueError('Image redirect changes origin')
        media_url(p.path)
        if p.query or p.fragment:
            raise ValueError('Unexpected redirected image locator')
        return super().redirect_request(request, fp, code, message, headers, target)


class BodyBudget:
    """Reserve a whole per-response allowance before opening any HTTP request."""
    def __init__(self, limit, response_limit=MAX_IMAGE_BYTES):
        self.limit = limit
        self.response_limit = response_limit
        self.remaining = limit
        self.consumed = 0
        self.lock = threading.Lock()

    def reserve(self):
        allowance = self.response_limit + 1
        with self.lock:
            if self.remaining < allowance:
                raise ValueError('Image download budget exhausted')
            self.remaining -= allowance
        return allowance

    def finish(self, allowance, consumed):
        if consumed > allowance:
            raise ValueError('Response exceeded reserved byte allowance')
        with self.lock:
            self.remaining += allowance - consumed
            self.consumed += consumed


def validated_url(url):
    p = urlsplit(url)
    if p.scheme != 'https' or p.netloc != 'negentropy.studio' or p.query or p.fragment:
        raise ValueError('Unexpected published image origin')
    if not p.path.endswith('.webp'):
        raise ValueError('Only the reviewed WebP image locators are accepted')
    return media_url(p.path)


def inspect_image(data, dimensions, expected_sha=None):
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError('Image exceeds per-asset byte limit')
    digest = hashlib.sha256(data).hexdigest()
    if expected_sha and digest != expected_sha:
        raise ValueError('Image bytes changed from the independently recorded response')
    image = Image.open(io.BytesIO(data))
    if image.format != 'WEBP':
        raise ValueError('Image body is not WebP')
    if (image.width, image.height) != dimensions:
        raise ValueError('Image dimensions disagree with the source descriptor')
    if image.width * image.height > 4_000_000:
        raise ValueError('Image pixel limit exceeded')
    image.load()
    return {'assetId': 'gta-vi:media:' + digest, 'sha256': digest, 'bytes': len(data),
            'mimeType': 'image/webp', 'width': image.width, 'height': image.height,
            'rgbaSha256': hashlib.sha256(image.convert('RGBA').tobytes()).hexdigest()}


def load_inputs(details):
    documents, jobs, inputs = {}, {}, []
    for category in CATEGORIES:
        path = details / (category + '.json')
        raw = path.read_bytes(); doc = json.loads(raw); documents[category] = doc
        inputs.append({'path': 'data/details/' + path.name, 'sha256': hashlib.sha256(raw).hexdigest()})
        for row in doc['entries']:
            for index, media in enumerate(row.get('media', [])):
                url = validated_url(media['url'])
                dims = (media['width'], media['height'])
                if any(type(n) is not int or n <= 0 for n in dims):
                    raise ValueError('Invalid source dimensions')
                binding = {'category': category, 'catalogId': row['catalogId'], 'mediaIndex': index,
                           'role': media['role'], 'sourceRef': media['sourceRef'],
                           'sourcePointer': media['sourcePointer'], 'sourceUrl': url}
                if url in jobs:
                    if jobs[url]['dimensions'] != dims:
                        raise ValueError('Conflicting dimensions for one source URL')
                    jobs[url]['bindings'].append(binding)
                else:
                    jobs[url] = {'url': url, 'dimensions': dims, 'bindings': [binding]}
    return documents, list(jobs.values()), inputs


def load_expected(path):
    hashes = {}
    if path:
        for line in path.read_text().splitlines():
            row = json.loads(line)
            if row.get('status') == 'ok':
                url = validated_url(row['url'])
                digest = row['sha256']
                if url in hashes and hashes[url] != digest:
                    raise ValueError('Conflicting expected image hashes')
                hashes[url] = digest
    return hashes


def materialize(job, root, budget, expected, cached):
    url = job['url']; known = expected.get(url); used_network = False
    try:
        data = None
        cache = cached.get(url)
        if cache and cache.exists():
            candidate = cache.read_bytes()
            inspect_image(candidate, job['dimensions'], known)
            data = candidate
        if data is None:
            allowance = budget.reserve(); consumed = 0
            try:
                request = Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity'})
                with build_opener(SameOriginRedirect()).open(request, timeout=25) as response:
                    if response.url != url or response.status != 200:
                        raise ValueError('Image response changed locator or HTTP status')
                    if response.headers.get_content_type() != 'image/webp':
                        raise ValueError('Image response MIME type is not image/webp')
                    length = response.headers.get('Content-Length')
                    if length and int(length) > MAX_IMAGE_BYTES:
                        raise ValueError('Image response exceeds per-asset byte limit')
                    data = response.read(MAX_IMAGE_BYTES + 1); consumed = len(data); used_network = True
                    if length and len(data) != int(length):
                        raise ValueError('Image response length differs from Content-Length')
            finally:
                budget.finish(allowance, consumed)
        asset = inspect_image(data, job['dimensions'], known)
        relative = 'assets/' + asset['sha256'] + '.webp'; target = root / relative
        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() != asset['sha256']:
                raise ValueError('Existing immutable asset bytes changed')
        else:
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False, suffix='.tmp') as tmp:
                tmp.write(data); temporary = Path(tmp.name)
            temporary.replace(target)
        return {'status': 'ok', **asset, 'path': relative, 'sourceUrl': url,
                'validatedExpectedSha256': bool(known), 'reusedCachedBytes': not used_network,
                'bindings': job['bindings']}
    except Exception as exc:
        return {'status': 'failed', 'sourceUrl': url, 'error': str(exc), 'bindings': job['bindings']}


def run(args):
    documents, jobs, inputs = load_inputs(args.details)
    expected = load_expected(args.expected_hashes)
    root = args.out; root.mkdir(parents=True, exist_ok=True); (root/'assets').mkdir(exist_ok=True)
    cache = {}
    if args.sample_receipts:
        for row in json.loads(args.sample_receipts.read_text()):
            if row.get('path'):
                url = validated_url(row['url'])
                cache[url] = Path(row['path'])
                expected.setdefault(url, row['sha256'])
    receipts_path = root / 'download-receipts.jsonl'
    if receipts_path.exists():
        for line in receipts_path.read_text().splitlines():
            row = json.loads(line)
            if row.get('status') == 'ok':
                relative = Path(row['path'])
                if relative.is_absolute() or '..' in relative.parts:
                    raise ValueError('Invalid cached asset path')
                cache[row['sourceUrl']] = root / relative
                expected.setdefault(row['sourceUrl'], row['sha256'])
    budget = BodyBudget(args.budget_mib * 1024 * 1024)
    rows = []
    with receipts_path.open('w') as receipts:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(materialize, j, root, budget, expected, cache) for j in jobs]
            for future in as_completed(futures):
                row = future.result(); rows.append(row)
                receipts.write(json.dumps(row, separators=(',', ':')) + '\n'); receipts.flush()
                if len(rows) % 50 == 0:
                    print(json.dumps({'completed': len(rows), 'total': len(jobs),
                                      'downloadedBytes': budget.consumed,
                                      'failed': sum(r['status'] != 'ok' for r in rows)}), flush=True)
    assets, bindings, failures = {}, [], []
    for row in rows:
        if row['status'] != 'ok': failures.append(row); continue
        asset = assets.setdefault(row['assetId'], {k: row[k] for k in
                                  ('assetId','sha256','bytes','mimeType','width','height','rgbaSha256','path')})
        asset.setdefault('sourceUrls', []).append(row['sourceUrl'])
        for binding in row['bindings']:
            bindings.append({**binding, 'assetId': row['assetId'], 'sha256': row['sha256'],
                             'mimeType': row['mimeType'], 'width': row['width'], 'height': row['height']})
    manifest = {'schema': 'saverift.gta-vi.private-media-assets.v1', 'createdAt': datetime.now(timezone.utc).isoformat(),
                'sourceSidecars': inputs, 'assets': sorted(assets.values(), key=lambda r:r['assetId']),
                'bindings': sorted(bindings,key=lambda r:(r['catalogId'],r['mediaIndex'])), 'failures':failures,
                'summary': {'sourceUrls':len(jobs),'successfulUrls':len(jobs)-len(failures),'failedUrls':len(failures),
                            'uniqueAssetFiles':len(assets),'catalogBindings':len(bindings),
                            'catalogEntries':len({r['catalogId'] for r in bindings}),
                            'assetBytes':sum(a['bytes'] for a in assets.values()),
                            'downloadedBytesThisRun':budget.consumed,'budgetBytes':budget.limit},
                'scope':'Private host-materializable image pack. No source catalog mutation, upload, redistribution grant, save linkage promotion, or console acceptance claim.'}
    (root/'asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    if args.bind_details:
        bound = {(r['catalogId'],r['mediaIndex']):r for r in bindings}
        dest=root/'bound-details';dest.mkdir(exist_ok=True)
        for category, doc in documents.items():
            for entry in doc['entries']:
                for i, media in enumerate(entry.get('media',[])):
                    if binding := bound.get((entry['catalogId'],i)):
                        media['assetId'] = binding['assetId']
                        media['availability'] = 'materialized-private-asset'
            (dest/(category+'.json')).write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps(manifest['summary']),flush=True)
    return 1 if failures else 0


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--details',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--expected-hashes',type=Path,help='Independent image-hash JSONL receipts')
    parser.add_argument('--sample-receipts',type=Path,help='Existing local sample image receipts to reuse')
    parser.add_argument('--bind-details',action='store_true')
    parser.add_argument('--workers',type=int,choices=range(1,7),default=6)
    parser.add_argument('--budget-mib',type=int,choices=range(1,33),default=32)
    raise SystemExit(run(parser.parse_args()))
