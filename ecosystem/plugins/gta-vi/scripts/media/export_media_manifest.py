#!/usr/bin/env python3
"""Normalize two pinned public media indexes without fetching asset bodies."""
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import argparse
import hashlib
import json
import re

from media_helpers import ORIGIN as BASE, media_url as same_origin, preview_ref as image_ref

SOURCES = {
    'images': ('/assets/data/en/imagenes.7156e004db.json', 'bcb3a6273cc7a59d9b887787359bd270ffd51d91a96f5e9fa2e97cad51117aca'),
    '3d-models': ('/assets/data/en/modelos-3d.e8c2626663.json', '71754a044e394bb1599be0615a23cd93e9b7a7380646d4b5d90b434c405bedac'),
}


def build(inputs, receipts_dir, output):
    sources, images, models = [], [], []
    model_receipts = {}
    for p in receipts_dir.glob('*-model-receipt.json'):
        r = json.loads(p.read_text())
        model_receipts[r['pageUrl']] = r
    sample_file = receipts_dir / 'sample-media-receipts.json'
    sample_receipts = {r['url']: r for r in json.loads(sample_file.read_text())} if sample_file.exists() else {}
    for key, (path, expected) in SOURCES.items():
        b = (inputs/(key+'.json')).read_bytes()
        digest = hashlib.sha256(b).hexdigest()
        if digest != expected: raise ValueError('Pinned source changed')
        d = json.loads(b)
        fields = {f['k']: i for i, f in enumerate(d['f'])}
        sources.append({'id': 'gtazone-media:'+key, 'url': same_origin(path, '/assets/data/'),
                        'sha256': digest, 'bytes': len(b), 'sourceRows': len(d['e']),
                        'claimStatus': 'website-claim', 'gameBuildIndependentlyVerified': False})
        for i, r in enumerate(d['e']):
            ptr = f'/e/{i}'
            item = {'id': 'gtazone-media:'+key+':'+r[0], 'sourceId': 'gtazone-media:'+key,
                    'sourceLocation': ptr, 'sourceRecordId': r[0], 'publishedIdentifier': r[2],
                    'label': r[1], 'category': d.get('ct',{}).get(r[3],r[3]),
                    'claimStatus': 'website-claim', 'saveMappingVerified': False,
                    'preview': image_ref(r,ptr)}
            if item['preview'] and item['preview']['url'] in sample_receipts:
                sr = sample_receipts[item['preview']['url']]
                item['preview'].update(retrievalStatus='http-200-image-decoded',sha256=sr['sha256'],bytes=sr['bytes'])
            vals = dict(zip(fields, r[4]))
            if key == 'images':
                item['texture'] = {'width': vals.get('ancho'), 'height': vals.get('alto'), 'format': vals.get('formato'),
                                   'archiveClaim': vals.get('archivo'), 'mipCount': vals.get('mips'),
                                   'tilingClaim': vals.get('mosaico'), 'nativeLocatorClaim': vals.get('origen'),
                                   'nameHashClaim': vals.get('hashNombre'),
                                   'sourceLocations': {k:ptr+'/4/'+str(fields[k]) for k in fields}}
                loc = vals.get('origen') or ''
                if m := re.fullmatch(r'(.+\.ttpf)#([A-Fa-f0-9]{16})', loc):
                    item['texture']['parsedLocator'] = {'kind':'ttpf-hash64', 'storeBasename':m[1], 'textureHash64':m[2].lower(),
                                                        'archiveVerified':False}
                elif m := re.fullmatch(r'(.+\.rpf)@0x([A-Fa-f0-9]+)',loc):
                    item['texture']['parsedLocator'] = {'kind':'rpf-resource-offset','archive':m[1], 'offsetHex':'0x'+m[2].lower(),
                                                        'dictionaryTextureNameHash32':(vals.get('hashNombre') or '').lower(),
                                                        'archiveVerified':False}
                images.append(item)
            else:
                slug = r[6] if len(r)>6 and r[6] else r[0]
                if not re.fullmatch(r'[a-zA-Z0-9_-]+',slug): raise ValueError('Unexpected detail slug')
                detail = same_origin(d['url']+slug+'/', '/3d-models/')
                item['model'] = {'mainResource': vals.get('recurso'), 'assembledResources': vals.get('recursos'),
                                 'unmountedParts': vals.get('sinMontar'), 'sourceArchiveClaim': vals.get('archivo'),
                                 'sourceOffsetClaim': vals.get('offset'), 'lod': vals.get('lod'),
                                 'vertices': vals.get('vertices'), 'triangles': vals.get('triangulos'),
                                 'resourceCount': vals.get('piezas'), 'publishedSizeMiB': vals.get('tamano'),
                                 'sourceLocations': {k:ptr+'/4/'+str(fields[k]) for k in fields},
                                 'detailUrl':detail, 'urlResolver':{'selector':'.v3d[data-model]','attribute':'data-model',
                                                                 'allowedOrigin':BASE,'allowedPathPrefix':'/media/3d/','allowedExtension':'.glb'},
                                 'modelUrl':None,'modelUrlStatus':'resolve-from-detail-page'}
                receipt = model_receipts.get(detail)
                if receipt:
                    item['model'].update(modelUrl=validated_model_url(receipt['modelUrl']),
                                         modelUrlStatus='observed-page-and-glb2-header-checked',
                                         evidence={k:receipt[k] for k in ['pageSha256','jsonChunkSha256','totalBytes','jsonChunkBytes','meshes','materials','textures','images','geometryDownloaded']})
                models.append(item)
    out = {'schemaVersion':1,'createdAt':datetime.now(timezone.utc).isoformat(),
           'scope':'Media references and website-native-locator claims; no game assets embedded and no save editability promotion.',
           'sources':sources,'summary':{'imageRows':len(images),'modelRows':len(models),
                                       'imageCategories':dict(Counter(x['category'] for x in images)),
                                       'modelCategories':dict(Counter(x['category'] for x in models)),
                                       'parsedImageLocators':dict(Counter(x['texture'].get('parsedLocator',{}).get('kind','unknown') for x in images)),
                                       'modelHeadersVerified':sum(x['model']['modelUrl'] is not None for x in models)},
           'images':images,'models':models}
    target = output
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({'file':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),**out['summary']}))


def validated_model_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'negentropy.studio' or parsed.query or parsed.fragment or not parsed.path.endswith('.glb'):
        raise ValueError('Unexpected observed model URL')
    return same_origin(parsed.path, '/media/3d/')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs',type=Path,required=True,help='Directory with pinned images.json and 3d-models.json')
    parser.add_argument('--receipts',type=Path,help='Optional directory of locally checked page/model/image receipts')
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    build(args.inputs,args.receipts or args.inputs,args.out)
