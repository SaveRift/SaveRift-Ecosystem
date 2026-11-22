# Reproducible editor crosswalk pipeline

This directory contains the original SaveRift scalar extraction, verification,
crosswalk export and synthetic tests. It reads an already ingested research
copy; it does not implement an archive extractor or modify a player save.

Producer and selector bytes are pinned by downstream evidence receipts. Keep
existing versions unchanged when adding new behavior; introduce a new version
and review its evidence chain. Python 3.10+ is required. The scripts use the
standard library only.

## Inputs and order

All example paths below are placeholders selected by the maintainer. Keep the
research database, original master, raw payloads and private capture bodies
outside the repository. Use fresh output directories at every step.

1. `extract_native_lookup.py` reads selected scalar fields from the completed
   R2 database, after checking its preserved-baseline receipt against the
   original master. Run separately with `vehicle-selectors.json`,
   `weapon-reference-selectors.json` and `item-selectors.json`. Selectors bind
   full structure IDs, field descriptors, widths and distinct namespaces.
2. `verify_native_lookup_bytes.py` independently verifies the meta7a vehicle and
   weapon observations. `verify_native_lookup_bytes_v2.py` additionally verifies
   the PSIN item observations. Each tool hashes the original payloads and
   compares the selected four bytes; it exports receipts rather than payloads.
3. `export-editor-crosswalk.py` builds the vehicle model rows and calculated
   token-hash candidates from the original reviewed public catalog, clean native
   staging, verified receipts and the existing factual website-name snapshot.
4. `augment_catalog_from_web_v3.py` adds the pinned GTA.ZONE identity claims.
   It wraps the frozen v2 and v1 implementations: v1 adds specs and drink/drug
   items; v2 retains unmatched vehicle claims and flattens preset/recipe
   relations; v3 adds explicitly discriminated hunting `Item` leaves.
5. `augment_native_references.py` adds native scalar witnesses to the matching
   website-reported hexadecimal spec/item records. It does not require such
   corroboration for inclusion of other website candidates.
6. `probe_weapon_psin_names_v2.py` traverses Name/u32 fields in the primary
   weapon-container range, retaining token/hash matches as candidates. It uses
   the frozen `probe_weapon_psin_tokens.py` only for its pinned token-pool and
   provenance helpers; the older probe's auxiliary selection was rejected.
   Extract the three exact structures with `weapon-name-selectors.json`, then
   verify those observations with the frozen v2 byte verifier.
7. `augment_weapon_definition_names.py` adds candidate Name-field evidence to
   matching website spec/preset/recipe rows and a separate provenance source.
   Its optional native/proof arguments bind all matched occurrences to the
   independent byte check, without changing native IDs or save status.

Example extraction and verification:

```sh
python extract_native_lookup.py \
  --database /research/game-index-round2.sqlite \
  --original-master /research/original/game-index.sqlite \
  --selectors vehicle-selectors.json --platform xbox \
  --output /research/staging/native-vehicles

python verify_native_lookup_bytes.py \
  --database /research/game-index-round2.sqlite \
  --observations /research/staging/native-vehicles/observations.jsonl \
  --output /research/staging/vehicle-byte-proof
```

Example final transformations, run with this directory as the working directory:

```sh
python export-editor-crosswalk.py \
  --data-dir /research/original-public-catalog/data \
  --native-dir /research/staging/native-vehicles \
  --website-facts /research/staging/website-facts.json \
  --byte-verification /research/staging/vehicle-byte-proof/receipt.json \
  --output /research/staging/export-base

python augment_catalog_from_web_v3.py \
  --base-export /research/staging/export-base \
  --baseline-data /research/original-public-catalog/data \
  --facts /research/staging/public_identifier_facts.json \
  --weapons-facts /research/staging/weapons-identifiers.json \
  --weapons-provenance /research/staging/weapons-provenance.json \
  --output /research/staging/export-web

python augment_native_references.py \
  --base-export /research/staging/export-web \
  --weapon-native-dir /research/staging/native-weapons \
  --weapon-proof /research/staging/weapon-byte-proof/receipt.json \
  --item-native-dir /research/staging/native-items \
  --item-proof /research/staging/item-byte-proof/receipt.json \
  --output /research/staging/export-final
```

The original public catalog is commit
`c1d447c2c884b6de5d80038b1ce73c19b93e933b`. Do not use an already augmented item
file as the baseline: that would repeat earlier website claims.

## Pinned factual inputs

The website steps consume reviewed facts-only snapshots, not arbitrary scraped
pages. Full HTML, raw dataset bodies, model data and artwork are not distributed
here. The source URLs, source JSON pointers and digests are in the final catalog
and its source records. The maintainer-held input pins are:

| Snapshot | SHA-256 |
| --- | --- |
| `public_identifier_facts.json` | `8d76954f863a2804f755b73bad22d649f19b0f174e853a7079ed0eb4b4d20719` |
| `weapons-identifiers.json` | `bccf556847a1417d2c21a00bcf26332528cadc0f88f46b2850d18c3d90eb2188` |
| `weapons-provenance.json` | `9f47c45dfaadd9aa36a9ef5dd9c916d876a2a4435ef7ee9a92c44646190c20d7` |

Changing a source body or factual snapshot requires a new review and explicit
producer pins. Re-fetching a website at a later time does not automatically
reproduce the reviewed capture.

## Tests and publication

```sh
python -m unittest discover -s . -p 'test_*.py'
```

All tests use manufactured rows and payload bytes. The SQL fixture records the
research importer's schema contract and retains its separate GPL-3.0-only
notice; it is test-only and is not bundled into the connector runtime. The
pipeline does not copy third-party parser implementations.

Copy only the final reviewed `entities/*.json` category exports and
`sources.json` into the public data tree, with the non-sensitive summary reports
in `docs/research/`. Then run the required catalog validator, build and plugin
tests documented in `docs/EDITOR_CROSSWALK.md`. Keep staging JSONL, databases,
archives, extracted files and player saves on the research workstation.

## Adding the primary weapon Name evidence

Use fresh directories for the database probe and the three-structure extraction.
The Name probe uses the same research database, original master and pinned
`weapons-identifiers.json` inputs shown above. Then run:

```sh
python augment_weapon_definition_names.py \
  --base-export /research/staging/export-final \
  --probe-dir /research/staging/weapon-definition-probe-v2 \
  --name-native-dir /research/staging/native-weapon-names \
  --name-proof /research/staging/weapon-name-byte-proof/receipt.json \
  --output /research/staging/export-with-name-evidence
```

The public tests for this stage are fully manufactured. The two older probe
test files are deliberately absent because they use a separate research-workspace
snapshot; `test_augment_weapon_definition_names.py` verifies the public evidence
boundary without that snapshot. The generated `weapon-name-evidence-report.json`
belongs alongside the other public summary reports.
