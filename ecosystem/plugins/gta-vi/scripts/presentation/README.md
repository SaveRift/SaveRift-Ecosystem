# GTA VI presentation metadata

The presentation sidecars add original factual descriptions, source-reported
stats, model references and existing image locators to the reviewed catalog.
They preserve the existing identity domains and do not establish save-array
bindings or editability.

## Reviewed coverage

| Group | Direct catalog identities | With numeric stats | With an image locator | With a model reference |
| --- | ---: | ---: | ---: | ---: |
| Vehicles | 334 | 326 | 327 | 334 |
| Weapon specifications | 160 | 160 | 126 | 125 |
| Drink/drug items | 178 | 178 | 9 | 9 |
| Hunting loot Item leaves | 294 | 0 | 294 | 294 |

Another 227 presets and 176 recipes have links to the relevant base
specifications. They do not inherit base stats or images as if they had been
verified for that variant. There are 1,369 detail records, representing 966
direct identities and 403 relation records.

The image counts are records with locators, not unique images: the vehicle,
weapon and item sidecars reference 327, 123 and 104 distinct image URLs,
respectively. Hunting records reuse animal previews across qualities. Nine
drink/drug items link to one or more consumption-prop previews through the
source's explicit item-to-model relationship. These are associated model
previews, not independently verified inventory icons.

## Source and interpretation rules

Four already reviewed GTA.ZONE dataset responses are pinned by SHA-256 in
`build_presentation.py`. The vehicle and weapon source data distinguish menu
ratings from handling or weapon-entry values. The sidecars preserve the
distinction, the exact value, the unit displayed by the source, and whether the
source marks its interpretation or unit as inferred. They never convert an
unspecified unit to a physical unit.

Prices are `null`. None of the four datasets has a purchase-price or sale-price
field. The bounded follow-up also checked the site's linked Tunables dataset
(1,115 rows) and Properties dataset (48 rows); neither establishes item prices.
The only two money-named tunables found are visual-mask parameters. A generic
`Value`, menu rating or loot quantity is not a price. See
`docs/research/price-coverage-check.json` for the exact endpoints and hashes.

Descriptions are deterministic, original summaries of the retained facts and
are marked `generated-factual-summary`. Source-authored descriptive prose is
not copied. The website claims Xbox Series build 1.0.2.1; matching that claim to
the independently inspected archive build remains unverified.

## Contract

`data/details/{vehicles,weapons,items}.json` has this structure:

```json
{
  "schema": "saverift.gta-vi.presentation.v1",
  "category": "weapons",
  "fieldEncoding": "shared-descriptors-v1",
  "fieldDefinitions": {
    "source-id": {
      "damage": {
        "index": 0,
        "label": "Damage",
        "type": "number",
        "unit": null,
        "unitStatus": "not-specified",
        "sourceInterpreted": false,
        "descriptorPointer": "/f/0"
      }
    }
  },
  "entries": [
    {
      "catalogId": "gta-vi:weapons:synthetic-example",
      "sourceRef": "source-id",
      "sourceRowPointer": "/e/0",
      "price": null,
      "stats": [{ "key": "damage", "value": 0 }],
      "properties": [],
      "models": [],
      "media": [],
      "relatedSpecCatalogIds": []
    }
  ]
}
```

The example above is synthetic. Actual entries also retain the source record
ID, published identifier, claim status, original summary and source category.
Descriptors are stored once per source to avoid duplicating them thousands of
times. For an expanded fact, its precise value pointer is
`sourceRowPointer + "/4/" + descriptor.index`. The producer's `expand_record`
function is a reference implementation. An English display-value translation
retains its separate `/tr/<field>/<raw-value>` pointer.

`data/details/sources.json` records the response hashes, discovery section
URLs, scope and source claims. Image descriptors are locators only. `assetId`
is `null` until an independently reviewed host asset is assigned. The runtime
does not fetch external images from these URLs. Model references preserve the
difference between a vehicle identity, a weapon base-element/projectile model,
a consumption prop and an animal associated with a hunting-loot record.

The category JSON totals 2,978,340 bytes. The largest expanded detail record is
18,750 bytes before the API envelope and source metadata. The source JSON and
the corresponding runtime modules remain separately pinned package inputs.

## Reproduction

The producer reads four local JSON files by default, using their source slugs
as filenames. The source bodies are not committed. To retrieve the same pinned
responses, use the explicit `--fetch` option; a changed digest causes failure.

From the repository root:

```sh
python ecosystem/plugins/gta-vi/scripts/presentation/build_presentation.py \
  --catalog ecosystem/plugins/gta-vi/data \
  --fetch \
  --output /tmp/gta-vi-presentation
```

Alternatively, replace `--fetch` with `--input-dir <local-source-directory>`.
The output directory must not exist. The script emits the three category
files, `sources.json` and a report containing source/catalog/producer hashes.
Only the four data files belong in `data/details`; the report belongs in
`docs/research/presentation-report.json`.

Run the offline synthetic checks with:

```sh
python -m unittest discover \
  -s ecosystem/plugins/gta-vi/scripts/presentation \
  -p 'test_*.py'
```

The 13 tests cover changed source pins, numeric zero/false distinctions,
non-finite values, unit assumptions, item/model role separation, safe image
locators, both image descriptor layouts, exact source-record joins, changed
native identifiers, lossless descriptor compaction and preset relation scope.
A separate complete data check resolved all 27,787 fact pointers, 768 model
pointers and 762 image pointers back to the pinned source responses. That
check verifies extraction fidelity; it does not independently confirm the
website's gameplay claims.
