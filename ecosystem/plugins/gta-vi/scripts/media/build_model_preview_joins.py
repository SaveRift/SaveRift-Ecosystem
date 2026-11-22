#!/usr/bin/env python3
"""Join pinned website entity rows to model rows by exact token or image URL."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from media_helpers import model_matches

PINS = {
    '3d-models': '71754a044e394bb1599be0615a23cd93e9b7a7380646d4b5d90b434c405bedac',
    'vehiculos': 'a556f3b769a36eb192093e0c9cdf4d3ea0fc3b651c1d9a5d7019a8cd8e54441c',
    'armas': '85933f5fb560162602f3948121cebc5788f72d0de1cb52c9ff0aa0b4664ecfdd',
    'bebidas-y-drogas': 'bb4971a95b3633c2b9db442cf729f1a791c3327e310b06b80ac73137dabac2df',
    'piezas-caza': 'aa82f30b3e16eb791bf3a60e30c7aadabd3c5f67770d9102c6e6d2dd66ce84e0',
}


def read_pinned(inputs, name):
    data = (inputs / (name + '.json')).read_bytes()
    if hashlib.sha256(data).hexdigest() != PINS[name]:
        raise ValueError('Unreviewed source snapshot: ' + name)
    return json.loads(data)


def build(inputs):
    models = read_pinned(inputs, '3d-models')['e']
    matches, summary = [], {}
    for section in PINS:
        if section == '3d-models': continue
        data = read_pinned(inputs, section)
        counts = Counter()
        for match in model_matches(data['e'], models):
            if match['status'] != 'unique':
                counts[match['status']] += 1
                continue
            row = match['sourceRow']; i = match['sourceIndex']; mi, model = match['matches'][0]
            counts[match['method']] += 1
            matches.append({'sourceSection': section, 'sourceLocation': f'/e/{i}',
                            'sourceRecordId': row[0], 'publishedIdentifier': row[2],
                            'modelSourceLocation': f'/e/{mi}', 'modelSourceRecordId': model[0],
                            'modelToken': model[2], 'method': match['method'], 'saveMappingVerified': False})
        summary[section] = dict(counts)
    return {'scope': 'Exact source-site token/image equality, not proof of save linkage',
            'modelSourceSha256': PINS['3d-models'], 'summary': summary, 'matches': matches}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = build(args.inputs)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(result['summary']))
