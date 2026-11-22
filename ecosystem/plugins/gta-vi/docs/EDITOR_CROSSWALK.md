# GTA VI editor lookup crosswalk

Reviewed 22 November 2026. Catalog version `0.2.0`.

The crosswalk provides display labels, exact native tokens or published numeric
identifiers, identifier domains and source evidence for editor lookup. A useful
lookup record does not require a verified save-array binding. Website claims,
calculated hashes and direct native observations are represented separately so
that a later save adapter can select the appropriate domain without discarding
the broader catalog today.

## Coverage

The reviewed website contribution retains the following identifier identities:

| Domain | Identities | Interpretation |
| --- | ---: | --- |
| Vehicle model | 334 | All published vehicle identities; 309 have candidate joins to locally observed model hashes, and 25 remain standalone reported candidates |
| Weapon spec | 160 | 137 literal spec tokens and 23 complete published 32-bit identifiers |
| Weapon preset | 227 | Exact named preset tokens, each linked back to its reported spec |
| Weapon recipe | 176 | Exact named recipe tokens, each linked back to its reported spec |
| Drink/drug item | 178 | 174 drink and four drug identifiers; excludes prop-model and intoxication-profile identities |
| Hunting loot item | 294 | Explicit `Entries/Type = Item` leaves; excludes 321 `Sellable` rows and four rows without a type |

These are distinct roles. The 563 weapon identities are not 563 base weapons.
Hunting loot references remain marked with their narrower subtype; catalog
presence does not establish that a particular character can own the item.
The website claims Xbox Series build 1.0.2.1. That claim does not establish the
build of the independently inspected local archive.

The native vehicle export separately retains **339 distinct nonzero model
hashes** from 8,501 selected field occurrences. It includes models without a
resolved website name. All 334 website vehicle identities are retained across
matched native rows and the 25 standalone candidates; these two counts should
not be added to claim 673 distinct vehicles.

The catalog also preserves the original 2,293 entries, including 537 vehicle
configuration occurrences, 769 weapon reference occurrences and 569 ped-loadout
configurations. Those are source observations, not additional unique vehicles,
weapons or inventory items. Exact case and distinct source occurrences remain
available rather than being silently deduplicated.

The complete catalog contains **3,692 entries, 20 sources and 18 candidate save
links**:

| Category | Catalog rows |
| --- | ---: |
| Vehicles | 901 |
| Weapons | 1,332 |
| Items | 1,041 |
| Activities | 145 |
| Systems | 269 |
| Characters | 2 |
| Locations | 2 |
| Clothing | 0 |
| Currencies | 0 |

Counts and producer pins are recorded in `docs/research/crosswalk-report.json`,
`web-augmentation-report.json` and `native-reference-report.json`. Category
files contain the complete reviewed deliverable; `data/sources.json` contains
its source records.

## Why the earlier 13 and nine counts were small

The **13 weapon-spec matches** came from a selected `WeaponSpec` field in three
meta7a documents. That narrow reference table contains 17 distinct spec values,
principally vehicle/device weapon references. It does not enumerate the main
weapon definitions. The **nine item matches** came from a selected `ItemId`
child structure, with 37 distinct values across five PSIN documents. It also
does not enumerate all inventory definitions.

Those matches add independent native-value evidence to existing website rows.
They are not catalog inclusion gates, and they are not the number of weapons
or items available for lookup. The larger website-backed directories above are
usable as attributed candidates even where this additional corroboration is
not yet available.

All 348 selected weapon-field observations (174 `WeaponName` and 174 `WeaponSpec`)
and 316 selected item observations were checked independently against the original payload bytes. The vehicle
pass checked 26,552 fields before selecting the 8,501 nonzero owner-model
references. Handling IDs, display-name references and zero values did not
become model identifiers through this process.

## Main weapon definition Name matches

The follow-up traversed actual primary weapon-container documents in the
reviewed packs.rpf range. It inspected 16,771 Name/u32 observations across 131
wrapper documents. The published literal tokens correlate with native values as
follows:

| Token role | Matched tokens | Reviewed literal tokens | Full owning structure |
| --- | ---: | ---: | --- |
| Weapon spec | 126 | 137 | `473f474cbc92474a` |
| Weapon preset | 207 | 227 | `165141788d690ccf` |
| Weapon recipe | 147 | 176 | `adb0a97cdaa66e06` |
| Weapon type | 105 | 112 | Primarily `ba6a7ba6454c2e3b`; retained in research counts |

The first three groups enrich **480 existing catalog rows** through
`attributes.nativeDefinitionNameEvidence`. They retain the original token,
exact/lowercase hash method, numeric Name value, full structure/field descriptor,
source digest and byte location. A separate extraction and independent byte
check verified all **1,060 Name fields** selected from those three structures
across the research database. That broader selection contains 157 spec-owner,
694 preset-owner and 209 recipe-owner distinct Name values; these are not counts
of recovered literal names or independently established gameplay definitions.
The augmenter reconciles complete matched occurrence sets with that proof.

`rawBytesReverified: true` describes the numeric scalar. The relationship to a
website token and the inferred definition role remain candidates. It does not
mean the literal token was read from the native file, and it does not create a
save binding. WeaponType matches remain in the report and do not become new
catalog identities. The authoritative run summary is
`docs/research/weapon-name-evidence-report.json`, linked to the twentieth source.

## Identifier and query contract

An observed scalar uses a typed key such as `modelHash32`, `weaponSpecHash32` or
`itemHash32`, with its domain and bit width in `attributes.identifierMetadata`.
An explicitly published website identifier uses the exact `referenceId` and
`website-reported:GTA.ZONE:<domain>` namespace, with
`attributes.reportedIdentifierMetadata`. These rows remain candidates.

Literal identifiers can additionally carry reproducible `hashCandidates`:
unsigned JOAAT32 of the exact ASCII token, and a separate ASCII-lowercase form.
A calculated value is not promoted to an observed scalar. Already hexadecimal
identifiers retain their complete width and are not hashed as text.

For example:

| Source token | Domain | Exact JOAAT32 | ASCII-lowercase JOAAT32 |
| --- | --- | --- | --- |
| `WEAPONSPEC_PISTOL_MILITARY_DEFAULT` | `spec` | `0x5e4fe11c` | `0x362c337e` |
| `WEAPONPRESET_AUTORIFLE_CARBINE_STANDARD` | `preset` | `0xcf77342d` | `0xae11dba5` |
| `burrito` | `model` | `0xafbb2ca4` | `0xafbb2ca4` |

These calculations demonstrate why casing is preserved. A schema field-name
hash, a model hash and a weapon-spec value can all be 32-bit numbers while
identifying different things.

The read-only `gtavi.catalog.list` query supports a domain filter and an exact
native-ID key/value filter. For example, use these method arguments:

```json
{
  "category": "weapons",
  "identifierDomain": "preset",
  "nativeIdKey": "referenceId",
  "nativeIdValue": "WEAPONPRESET_AUTORIFLE_CARBINE_STANDARD",
  "offset": 0,
  "limit": 25
}
```

```json
{
  "category": "items",
  "identifierDomain": "item",
  "offset": 0,
  "limit": 25
}
```

Filtering occurs before pagination. The returned `total` is the filtered row
count, and pages contain at most 25 rows. Pages may be shorter to fit the
UI byte and shape limits; continue with `nextOffset` until it is null. Exact ID matching is case-sensitive;
calculated hash candidates do not masquerade as native-ID values. Preserve
multiple matching source rows where present. Preset and recipe rows retain
the related spec's catalog ID, original token, label and exact source pointer.
See [the API contract](../DEVELOPER_API.md) for errors and examples.

## Source provenance

The website URLs were discovered from the section pages' `script#gz-cfg`
dataset declarations. Reviewed exports retain identifier and label facts,
precise JSON pointers and source digests; they do not copy artwork, models,
descriptions or statistics.

| Source | Pinned source SHA-256 |
| --- | --- |
| [Vehicle identifiers](https://negentropy.studio/assets/data/en/vehiculos.5c062fad5b.json) | `a556f3b769a36eb192093e0c9cdf4d3ea0fc3b651c1d9a5d7019a8cd8e54441c` |
| [Weapon identifiers and relations](https://negentropy.studio/assets/data/en/armas.8a77b0ac6c.json) | `85933f5fb560162602f3948121cebc5788f72d0de1cb52c9ff0aa0b4664ecfdd` |
| [Drink/drug identifiers](https://negentropy.studio/assets/data/en/bebidas-y-drogas.af5c5b34b5.json) | `bb4971a95b3633c2b9db442cf729f1a791c3327e310b06b80ac73137dabac2df` |
| [Hunting loot item leaves](https://negentropy.studio/assets/data/en/piezas-caza.71fefc3e88.json) | `aa82f30b3e16eb791bf3a60e30c7aadabd3c5f67770d9102c6e6d2dd66ce84e0` |

Native evidence records payload digests, full structure IDs, field descriptors,
instance offsets, decoder revision and the independent selected-byte check.
The actual decoder is pinned to SixNG commit
`5a5a9761663315cdf61cec8b219ae5b808e556ae`; the newer-source comparison is
documented separately in [the exporter reuse review](EXPORTER_REUSE_REVIEW.md).
Reviewing a later revision does not retroactively change the provenance of an
existing decode.

## Reproducing and validating

The offline pipeline and synthetic tests live in `scripts/crosswalk/`. Its
README documents the order and required maintainer-held input receipts.
Frozen producer files are retained byte-for-byte because provenance pins their
SHA-256 digests. The versioned website wrappers expand the scope without
rewriting the earlier producer used by an existing receipt.

The original master database remains on the authorized research workstation.
The research copy, archives, payloads, full decoded objects and player saves
are not repository inputs. Reproduction of native observations requires the
maintainer-held research inputs; public CI uses only synthetic fixtures.

From the repository root:

```sh
python -m unittest discover -s ecosystem/plugins/gta-vi/scripts/crosswalk -p 'test_*.py'
node ecosystem/plugins/gta-vi/scripts/validate-catalog.mjs
node ecosystem/plugins/gta-vi/scripts/build.mjs
node --test ecosystem/plugins/gta-vi/tests/*.test.mjs
```

The schema and validator check identifier width, domain, source references,
hash calculations and claim status. Python tests check evidence-chain guards,
read-only extraction, byte-verification failures, collision handling, exact
case, website discrimination and preservation of unrelated catalog records.

## Remaining definition work

Existing exporters already expose more than model previews. SixNG exports PSO
root and block objects and follows count-first arrays and polymorphic entries.
The next native pass should traverse the main weapon containers and broaden
name evidence using the reviewed literal tokens and RBF vocabulary methods.
The exporter reuse review gives pinned code links and concrete commands.

The observed consumables root's type `0x71` fields currently decode as empty
lists. SixNG can return an empty list when a pool pointer fails to resolve, so
these outputs need pointer/layout diagnostics before being interpreted as an
empty inventory directory. Unknown `0x63` diagnostics also need instance bounds;
`0x44`, `0x65` and LSNS remain separately documented research topics.

These parser tasks can increase independent native coverage. They do not block
the current lookup directory. Actual save insertion still needs the relevant
array's record layout and related fields; the current connector exposes no
write operation. All 18 existing platform-specific save links remain candidates
with `editable: false`, and this contribution adds no new save binding.
