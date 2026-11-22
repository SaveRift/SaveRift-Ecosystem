#!/usr/bin/env python3
"""Export reviewed scalar crosswalks from private staging into the public catalog.

Inputs are factual observations, never game assets or player saves. Native model
hashes require a complete byte-verification receipt. Name joins and calculated
hashes remain explicit candidates. Existing save-mapping files are not inputs.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

from match_website_labels import match_website_labels, joaat32_exact

VERSION = 'saverift-editor-crosswalk/1.0.0'
NATIVE_SOURCE = 'saverift-native-model-crosswalk-2026-11-22'
EXTRACTOR_SHA = '7b3e568cab97e427f5e92b3223e86ad01fa1afcfc5925fc1cae84eaf71665402'
VERIFIER_SHA = 'aa9e1e810edea88fe61f7d31bfe798ff9909dcc131f35c5f70c08f0cea596484'
MODEL_SELECTORS = {
    'vehicle-configuration-model-reference': ('vehicle.configuration.modelReference', '51019114', 144, 3),
    'vehicle-variation-model-reference': ('vehicle.variation.modelReference', 'fc1c7000', (168, 240), 2),
}
VEHICLE_NAMESPACES = {
    'XML:CVehiclePerformanceMaps:MapKey',
    'XML:CVehicleBaseRatingsAndEstimatesMap:MapKey',
}
WEAPON_NAMESPACES = {
    'XML:WeaponSpec_reference': 'spec',
    'XML:WeaponPreset_reference': 'preset',
    'XML:WeaponRecipe_reference': 'recipe',
}
SHA = re.compile(r'^[0-9a-f]{64}$')


def sha_file(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def pack(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')


def hash_candidates(key, literal, domain):
    if not literal or not literal.isascii():
        raise ValueError('Native hash candidates require exact ASCII literal tokens')
    return [dict(nativeIdKey=key, domain=domain, algorithm='joaat32', transform=transform,
                 value=f'0x{joaat32_exact(text):08x}', confidence='candidate')
            for transform, text in [('exact', literal), ('lowercase', literal.lower())]]


def source_ref(source_id):
    return 'saverift-website-' + hashlib.sha256(source_id.encode('utf-8')).hexdigest()[:24]


def website_location(ev):
    locator = 'json-pointer:' + ev['json_pointer'] if isinstance(ev.get('json_pointer'), str) else 'selector:' + ev['selector']
    return f"response:{ev['response_id']}; body-sha256:{ev['body_sha256']}; {locator}"


def website_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in {'www.gta6database.com', 'gta6database.com', 'www.gtabase.com', 'gtabase.com'}:
        raise ValueError('Unexpected website reference origin')
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Website reference must be a public detail URL without credentials/query/fragment')
    return url


def validate_verification(native_dir, verification_path):
    receipt = read(verification_path)
    summary = read(native_dir / 'summary.json')
    if (receipt.get('tool') != 'saverift-native-lookup-byte-verification/0.1.0' or
            receipt.get('script_sha256') != VERIFIER_SHA or receipt.get('extractor_sha256') != EXTRACTOR_SHA or
            summary.get('script_sha256') != EXTRACTOR_SHA or
            receipt.get('extractor_summary_sha256') != sha_file(native_dir / 'summary.json') or
            receipt.get('selectors_sha256') != summary.get('selectors_sha256') or
            receipt.get('issues') != 0 or receipt.get('issue_counts') or receipt.get('file_issue_counts')):
        raise ValueError('Byte verification does not bind the reviewed extractor, selectors and verifier')
    proof = verification_path.with_name('verification.jsonl')
    if (receipt.get('verification_sha256') != sha_file(proof) or
            receipt.get('verification_bytes') != proof.stat().st_size or
            receipt.get('status_counts') != {'verified': receipt.get('verified_occurrences')} or
            receipt.get('written_verification_rows') != receipt.get('verified_occurrences') or
            receipt.get('remaining_verification_rows') != 0):
        raise ValueError('Byte-verification proof changed or is incomplete')
    return receipt


def model_observations(native_dir, verification):
    summary = read(native_dir / 'summary.json')
    observations_path = native_dir / 'observations.jsonl'
    observations_sha = sha_file(observations_path)
    if summary.get('status') != 'completed' or not summary.get('scope_complete') or summary.get('issues'):
        raise ValueError('Native extraction is incomplete or has unresolved issues')
    if not summary.get('all_selected_observations_valid') or summary.get('conflicting_content_locations'):
        raise ValueError('Native extraction did not pass all selected-field checks')
    if observations_sha != summary['outputs']['observations.jsonl']['sha256']:
        raise ValueError('Native observations changed after extraction')
    if verification.get('status') != 'completed' or verification.get('all_observations_verified') is not True or verification.get('observations_sha256') != observations_sha:
        raise ValueError('Complete byte verification of the exact observations is required')
    groups = defaultdict(list)
    seen_occurrences, locations = set(), {}
    excluded = Counter()
    read_count = 0
    with observations_path.open(encoding='utf-8') as f:
        for line in f:
            if len(line) > 1024 * 1024 or read_count >= 100000:
                raise ValueError('Native observations exceed reviewed export bounds')
            row = json.loads(line)
            read_count += 1
            if row['occurrence_id'] in seen_occurrences:
                raise ValueError('Duplicate occurrence identity')
            seen_occurrences.add(row['occurrence_id'])
            if row['selector_id'] not in MODEL_SELECTORS:
                excluded[row['namespace']] += 1
                continue
            namespace, struct_hash, sizes, index = MODEL_SELECTORS[row['selector_id']]
            sizes = sizes if isinstance(sizes, tuple) else (sizes,)
            schema, identifier = row['native_schema'], row['identifier']
            field = schema['selected_field']
            if (row['namespace'] != namespace or row['identifier_role'] != 'model_reference' or
                    schema['struct_hash'] != struct_hash or schema['byte_size'] not in sizes or
                    field['field_index'] != index or field['field_hash'] != 'fb1f80ff' or
                    field['field_type'] != '4a' or field['field_subtype'] != '00' or field['reference_index'] != 0 or
                    field['extra_hex'] != '00000000' or field['is_array_element']):
                raise ValueError('Native model selector differs from the reviewed field contract')
            if identifier['width_bits'] != 32 or identifier['value_kind'] != 'hash32' or not re.fullmatch('[0-9a-f]{8}', identifier['hex']):
                raise ValueError('Model reference is not a complete 32-bit scalar')
            if int(identifier['decoded_value_text']) != int(identifier['hex'], 16):
                raise ValueError('Lossless integer representation mismatch')
            if row['applicability'] != {'platforms': ['xbox'], 'build': None}:
                raise ValueError('Unexpected platform/build scope; review before export')
            quality = row['source']['document_quality']
            if any(quality.get(k) != 0 for k in ('field_key_collision_count', 'missing_instance_count', 'unavailable_blocks')):
                raise ValueError('Model reference comes from a document with incomplete decoding')
            if not SHA.fullmatch(row['source']['source_sha256']):
                raise ValueError('Missing native content identity')
            value = '0x' + identifier['hex']
            previous = locations.setdefault(row['content_location_id'], value)
            if previous != value:
                raise ValueError('Conflicting repeated content location')
            if value == '0x00000000':
                excluded['zero_model_reference'] += 1
                continue
            groups[value].append(row)
    if read_count != summary['counts']['emitted_observations'] or read_count != verification['verified_occurrences']:
        raise ValueError('Native verification/extraction occurrence counts differ')
    return groups, summary, dict(excluded)


def witness(row):
    source, schema = row['source'], row['native_schema']
    field = schema['selected_field']
    return dict(namespace=row['namespace'], sourceSha256=source['source_sha256'],
                contentKeySha256=source['content_key_sha256'], graphicsSha256=source['content_key']['gfx_sha256'] or None,
                contentKeyGraphicsBase=source['content_key']['gfx_base'],
                instanceOffsetSpace='decoder-combined-system-plus-aligned-graphics',
                archive=source['archive'], archiveOffset=source['source_offset'],
                decodedDocumentSha256=source['output_sha256'], structHash=schema['struct_hash'],
                structBytes=schema['byte_size'], schemaLayoutSha256=schema['layout_sha256'],
                fieldHash=field['field_hash'], fieldIndex=field['field_index'], fieldOffset=str(field['byte_offset']),
                instanceOffset=row['instance_offset'], instanceIndex=row['instance_index'],
                contentLocationId=row['content_location_id'], rawBytesVerified=True)


def native_location(w):
    return (f"payload-sha256:{w['sourceSha256']}; struct:0x{w['structHash']}; "
            f"instance-offset:{w['instanceOffset']}; field:0x{w['fieldHash']}; field-offset:{w['fieldOffset']}")


def build(data_dir, native_dir, factual_path, verification_path, output):
    if output.exists():
        raise ValueError('Choose a fresh export directory')
    factual, verification = read(factual_path), validate_verification(native_dir, verification_path)
    groups, native_summary, excluded = model_observations(native_dir, verification)
    vehicles, weapons, sources = [read(data_dir / p) for p in ('entities/vehicles.json', 'entities/weapons.json', 'sources.json')]
    if any(e['id'].startswith('gta-vi:vehicles:model-hash-') for e in vehicles['entries']) or any(s['id'] == NATIVE_SOURCE for s in sources['sources']):
        raise ValueError('Baseline already contains this export; use the recorded baseline to reproduce it')
    candidates_by_value = defaultdict(list)
    derived_counts = Counter()
    distinct_tokens = defaultdict(set)
    for category, group in [('vehicles', vehicles), ('weapons', weapons)]:
        for entry in group['entries']:
            ids = entry.get('nativeIds', {})
            if category == 'vehicles' and ids.get('configurationNamespace') in VEHICLE_NAMESPACES:
                key, domain, namespace = 'configurationId', 'model', ids['configurationNamespace']
            elif category == 'weapons' and ids.get('referenceNamespace') in WEAPON_NAMESPACES:
                key, namespace = 'referenceId', ids['referenceNamespace']
                domain = WEAPON_NAMESPACES[namespace]
            else:
                continue
            literal = ids[key]
            entry.setdefault('attributes', {})['hashCandidates'] = hash_candidates(key, literal, domain)
            derived_counts[domain] += 1
            distinct_tokens[domain].add(literal)
            if category != 'vehicles':
                continue
            for calculation in entry['attributes']['hashCandidates']:
                if calculation['value'] not in groups:
                    continue
                for ev in entry['evidence']:
                    candidates_by_value[calculation['value']].append(dict(kind='native-token-hash', nativeIdKey='modelHash32',
                        token=literal, namespace=namespace, sourceRef=ev['sourceRef'], sourceRecordId=entry['id'],
                        location=ev['location'], matchMethod='joaat32_' + calculation['transform'], confidence='candidate'))
    website_result = match_website_labels(factual, [dict(value=value, category='vehicles') for value in sorted(groups)])
    web_by_value = defaultdict(list)
    used_website_sources = set()
    website_origins = defaultdict(set)
    for item in website_result['matches']:
        if item['category'] != 'vehicles':
            raise ValueError('Cross-category website/native match')
        for ev in item['evidence']:
            used_website_sources.add(ev['source_id'])
            website_origins[ev['source_id']].add('https://' + urlsplit(website_url(item['url'])).hostname + '/')
            web_by_value[item['matched_hash']].append(dict(kind='website-label', nativeIdKey='modelHash32',
                label=item['label'], comparedText=item['comparedText'], comparisonField=item['comparison_field'],
                namespace=item['identifier_namespace'] or item['namespace'], sourceRef=source_ref(ev['source_id']),
                sourceRecordId=item['record_key'], location=website_location(ev), url=website_url(item['url']),
                siteStatus=item['site_status'], siteStatusScope='website-claim', matchMethod=item['method'], confidence='candidate'))
    rows = []
    named_web = named_token = 0
    for value, observations in sorted(groups.items()):
        # At most one reproducible witness per selector, with all occurrence counts retained.
        chosen = {}
        for row in sorted(observations, key=lambda r: (r['namespace'], r['source']['content_key_sha256'], int(r['instance_offset']), r['occurrence_id'])):
            chosen.setdefault(row['namespace'], row)
        witnesses = [witness(row) for row in chosen.values()]
        crosswalk = list({pack(r): r for r in candidates_by_value[value] + web_by_value[value]}.values())
        crosswalk.sort(key=pack)
        labels = sorted({r['label'] for r in crosswalk if r['kind'] == 'website-label'})
        tokens = sorted({r['token'] for r in crosswalk if r['kind'] == 'native-token-hash'})
        hash_inputs = {((r.get('comparedText') or r.get('token')).lower() if r['matchMethod'] == 'joaat32_lowercase'
                        else (r.get('comparedText') or r.get('token'))) for r in crosswalk}
        input_collision = len(hash_inputs) > 1
        if len(labels) == 1 and not input_collision:
            name, confidence, name_kind = labels[0], 'candidate', 'candidate-website-label'
            named_web += 1
        elif len(tokens) == 1 and not input_collision:
            name, confidence, name_kind = tokens[0], 'candidate', 'candidate-native-token'
            named_token += 1
        else:
            name, confidence, name_kind = f'Vehicle model {value}', 'observed', 'observed-model-reference'
        attrs = dict(recordRole='native_vehicle_model_reference', nameKind=name_kind, editorReady=False,
                     runtimeAvailability='unverified', saveMapping='unvalidated', originalArchiveMembershipProven=False,
                     identifierMetadata={'modelHash32': {'domain': 'model', 'representation': 'hex', 'bitWidth': 32}},
                     nativeObservationCount=len(observations),
                     distinctContentLocations=len({o['content_location_id'] for o in observations}),
                     nativeObservationCountsByNamespace=dict(Counter(o['namespace'] for o in observations)),
                     nativeWitnesses=witnesses,
                     crosswalk=crosswalk,
                     crosswalkStatus='candidate-labels' if crosswalk else 'unresolved-label',
                     labelAmbiguity={'multipleWebsiteLabels': len(labels) > 1, 'multipleNativeTokens': len(tokens) > 1,
                                     'distinctHashInputsShareHash': input_collision})
        rows.append(dict(id='gta-vi:vehicles:model-hash-' + value[2:], name={'en': name},
                         nativeIds={'modelHash32': value}, attributes=attrs, confidence=confidence,
                         applicability={'platforms': ['xbox'], 'build': None},
                         evidence=[dict(sourceRef=NATIVE_SOURCE, location=native_location(w),
                             method='Schema-selected metadata u32, verified against source payload bytes; save-element meaning unvalidated') for w in witnesses]))
    vehicles['entries'].extend(rows)
    sources['sources'].append(dict(id=NATIVE_SOURCE, kind='maintainer-research-summary',
        title='Reviewed Xbox native vehicle model-reference scalar crosswalk',
        locator='Maintainer-held RPF9 metadata; only selected identifier scalars and structural provenance exported',
        revision='2026-11-22; observations-sha256:' + native_summary['outputs']['observations.jsonl']['sha256'],
        license='SaveRift original research metadata; no license to underlying game files or assets is granted',
        attribution='SaveRift research; metadata field roles informed by the pinned SixNG vehicle parser',
        allowedUse='Factual identifier scalars, candidate name joins and provenance; no payloads, assets or player state',
        provenance=dict(upstream='https://github.com/holdmysocks/SixNG', upstreamCommit=native_summary['selection_basis']['upstream_commit'],
            decoderWorkerSha256='f8c7c4c66be270c671a33289d52ef82be25ad769dd690cb84e8cced555979b1d',
            selectorPlanSha256=native_summary['selectors_sha256'], extractorSha256=native_summary['script_sha256'],
            observationsSha256=native_summary['outputs']['observations.jsonl']['sha256'],
            byteVerificationReceiptSha256=sha_file(verification_path), byteVerificationSha256=verification['verification_sha256'],
            exporter=VERSION, exporterSha256=sha_file(__file__), gameBuild=None, originalDirectoryMembershipProven=False,
            method='Explicit meta7a configuration/variation owner-model field 0xfb1f80ff; full u32 and source-byte checks; gameName and handlingId are separate domains')))
    source_by_id = {s['source_id']: s for s in factual['sources']}
    for source_id in sorted(used_website_sources):
        s = source_by_id[source_id]
        relevant = [r for r in factual['records'] if any(e['source_id'] == source_id for e in r['evidence'])]
        domains = sorted({r['site'] for r in relevant})
        sources['sources'].append(dict(id=source_ref(source_id), kind='captured-public-website-facts',
            title='Attributed factual labels from ' + ', '.join(domains), locator='; '.join(sorted(website_origins[source_id])),
            revision=str(s['captured_at']) + '; capture-sha256:' + s['source_sha256'],
            license='Factual names and source locators only; no copied prose, artwork or source capture redistribution',
            attribution=', '.join(domains), allowedUse='Attributed website labels and explicit candidate relationships to native scalar observations',
            provenance=dict(captureSha256=s['source_sha256'], captureBytes=str(s['source_bytes']), capturedAt=s['captured_at'],
                captureHashScope=s['source_sha256_scope'], sourceKind=s['source_kind'], websiteIdentifiersAreNativeIds=False,
                gameBuild=None, crosswalkVerification='candidate; hash equality alone does not establish identity')))
    report = dict(schema='saverift.gta-vi.editor-crosswalk-report.v1', exporter=VERSION,
        inputSha256={'baselineVehicles': sha_file(data_dir / 'entities/vehicles.json'), 'baselineWeapons': sha_file(data_dir / 'entities/weapons.json'),
                     'baselineSources': sha_file(data_dir / 'sources.json'), 'websiteFacts': sha_file(factual_path),
                     'nativeObservations': native_summary['outputs']['observations.jsonl']['sha256'], 'byteVerificationReceipt': sha_file(verification_path)},
        observedModelHashes=len(rows), modelObservationCount=sum(len(v) for v in groups.values()),
        modelContentLocations=len({r['content_location_id'] for v in groups.values() for r in v}),
        nativeReferencesByNamespace={ns: len({r['identifier']['hex'] for v in groups.values() for r in v if r['namespace'] == ns}) for ns in sorted({r['namespace'] for v in groups.values() for r in v})},
        displayNames={'uniqueWebsiteLabelCandidates': named_web, 'uniqueNativeTokenCandidates': named_token, 'numericReferenceLabels': len(rows) - named_web - named_token},
        derivedHashCandidates={'occurrencesByDomain': dict(derived_counts), 'distinctLiteralTokensByDomain': {k: len(v) for k, v in distinct_tokens.items()},
                               'transforms': ['exact', 'lowercase'], 'confidence': 'candidate'},
        websiteMatching=website_result['counts'], excludedNativeObservations=excluded,
        websiteCoverage={'recordsIngested': len(factual['records']), 'recordsByCategory': dict(Counter(r['category'] for r in factual['records']))},
        newSources=1 + len(used_website_sources), newSaveLinks=0, editabilityChanges=0,
        limitations=['Model-reference bytes are observed; website/native-token identity joins remain candidates.',
                     'Derived weapon spec/preset/recipe hashes are calculations from observed literals, not observed numeric weapon IDs.',
                     'NPC loadouts are not ordinary inventory items; no itemHash32 is inferred.',
                     'No new vehicle/weapon/item save-array binding is established.'])
    output.mkdir(parents=True)
    (output / 'entities').mkdir()
    for path, data in [('entities/vehicles.json', vehicles), ('entities/weapons.json', weapons), ('sources.json', sources), ('crosswalk-report.json', report)]:
        write(output / path, data)
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data-dir', type=Path, required=True)
    p.add_argument('--native-dir', type=Path, required=True)
    p.add_argument('--website-facts', type=Path, required=True)
    p.add_argument('--byte-verification', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    result = build(a.data_dir, a.native_dir, a.website_facts, a.byte_verification, a.output)
    print(pack(result))


if __name__ == '__main__':
    main()
