# GTA VI public game catalog

This is a collaborative source of truth for the **whole game**, not a dump of player saves. It is designed to grow into searchable definitions for characters, locations, activities, vehicles, weapons, clothing, items, currencies, and gameplay systems. Save-field links are a separate, smaller layer that can point into the game catalog once evidence supports the connection.

## Layout and contribution

- `data/catalog.json` lists the supported platforms (`ps5`, `xbox`) and categories.
- `data/entities/<category>.json` holds stable, namespaced IDs, localized labels, optional lossless native IDs, attributes, build/platform applicability, and evidence. Empty categories are intentional until a contributor has evidence.
- `data/sources.json` records the origin, revision, permitted use, and attribution for every source. Facts and names from Rockstar's public page are cited; its artwork and prose are not copied.
- `data/save-mappings/<platform>.json` links observed save hashes to catalog concepts. A name preimage is not proof of gameplay meaning or safe editability. Xbox and PS5 mappings remain separate even when their game-layer structures coincide.
- `data/schema.json` describes an entity entry. `scripts/validate-catalog.mjs` validates whole-file relationships, source references, unique IDs, platform tokens, and candidate/editable status.

Run `node ecosystem/plugins/gta-vi/scripts/validate-catalog.mjs` from the repository root. Run `node --test ecosystem/plugins/gta-vi/tests/catalog.test.mjs` for negative validation checks. The catalog does not require an Xbox account, Sony account, console, save, or network access to validate.

For a new entry, choose an ID that remains stable when a display name changes. Keep native IDs as strings to preserve large integers and leading zeros. Add a source with a precise URL or maintainer-held evidence locator, source revision and use permission. Each claim needs a source reference, exact location, and extraction/verification method. Record the platforms and exact game build when known; `build: null` means build applicability has **not** been established. Never infer that a game item is base-game content merely because a source lacks a purchase requirement.

Confidence levels:

| Level | Meaning |
| --- | --- |
| `verified` | The stated fact is directly supported by the cited official or independently checked evidence. For an *editable save mapping*, this additionally requires a controlled change, successful encode/restore, and nondefault in-game load. |
| `observed` | An identifier or structure was read directly, but its gameplay meaning is not established. |
| `candidate` | A plausible name/meaning or relationship that still needs a controlled comparison. |
| `unknown` | Raw ID retained for later research; no meaning claimed. |

An editable save mapping also needs an `editValidation` record for the exact
platform and build. It must cite a controlled before/after comparison, an
encode/restore round trip, and a nondefault in-game load with the expected and
observed value. The validator checks that evidence is recorded; reviewers
still need to assess whether the cited test actually establishes the claim.

The starter entries contain official character/place names and nine observed hash preimages in each platform's decoded JSAV data. All 18 save links are candidates with `editable: false`; their gameplay meanings, controlling records, and in-game effects have not been verified. In particular `Balance` is not confirmed as player cash, `Progress` is not the verified overall completion field, and `relationshipLevel` is not a player level. PS5 and Xbox mappings cite separate read-only observations; neither includes player data. One-at-a-time before/after save comparisons can test future field links. **Do not use similar English names as a crosswalk.** Bind any external catalog ID crosswalk to the exact catalog revision/digest.

## Typed native identifiers and label crosswalks

Use the existing entity files for crosswalk facts; keep their source records in
`sources.json`. An observed scalar hash belongs in `nativeIds` only when the
decoded field and its domain support that interpretation. A calculated hash of
a website name alone does not establish an observed native ID.

| Native ID key | `identifierMetadata` domain | Meaning |
| --- | --- | --- |
| `modelHash32` | `model` | Observed model identifier |
| `weaponSpecHash32` | `spec` | Observed weapon-spec identifier |
| `weaponPresetHash32` | `preset` | Observed weapon-preset identifier |
| `weaponRecipeHash32` | `recipe` | Observed weapon-recipe identifier |
| `itemHash32` | `item` | Observed item identifier |

These keys require exactly eight hexadecimal digits following `0x`, stored as
strings, and matching metadata under `attributes.identifierMetadata`:

```json
{
  "nativeIds": {"modelHash32": "0x00000001"},
  "attributes": {
    "identifierMetadata": {
      "modelHash32": {"domain": "model", "representation": "hex", "bitWidth": 32}
    }
  }
}
```

The value above is synthetic. Existing configuration and reference IDs remain
exact strings, including their original case and namespace. Do not equate a
model ID with a configuration key, handling ID, field-name hash, preset, recipe,
or website ID because a number or English label happens to match.

### Calculated hash candidates

When only a literal identifier is available, retain it in its existing
`nativeIds` field and put calculations in `attributes.hashCandidates`. Each row
has `nativeIdKey` pointing to that literal, `domain`, `algorithm: "joaat32"`,
`transform: "exact"` or `"lowercase"`, an eight-digit hexadecimal `value`, and
`confidence: "candidate"`. The entity's evidence locates the original literal;
the declared algorithm and transform make the calculation reproducible.

This contract accepts ASCII input only. JOAAT32 processes the literal's ASCII
bytes using unsigned 32-bit arithmetic. `exact` preserves every byte;
`lowercase` changes only ASCII A–Z to a–z before hashing. The validator recomputes
the value and rejects non-ASCII input. It allows at most ten rows and rejects a
duplicate `(nativeIdKey, domain, transform)` tuple. Keep the exact and lowercase
rows separate even if their numeric values happen to coincide.

A computed value is never copied into an observed `*Hash32` native field.
The literal's confidence may remain `observed` while every calculated
relationship remains `candidate`. In particular, hashing a WeaponSpec, Preset,
or Recipe token does not turn it into an observed model or inventory item ID.

### Website-reported native identifiers

A website's explicit native-ID claim can be useful before an independent game
file observation is available. Retain the exact published value in
`nativeIds.referenceId`, with `referenceNamespace` set to
`website-reported:GTA.ZONE:<domain>`. Its `attributes.reportedIdentifierMetadata`
contains only a `referenceId` descriptor with `domain`, `representation`,
`bitWidth`, and `confidence: "candidate"`; the entity confidence is also
`candidate`. Domains are `model`, `spec`, `preset`, `recipe`, and `item`.

Use `representation: "literal"` and `bitWidth: null` for a nonempty token.
Use `representation: "hex"` with `bitWidth: 32` or `64` for exactly eight or
sixteen hex digits after `0x`. Preserve leading zeros and raw case. These claims
do not populate an observed `*Hash32` key. Literal ASCII tokens may have the
separate hash candidates above; never hash an already hexadecimal identifier.
The website's claimed platform/build belongs to its source record and does not
establish the build of an independently observed local archive.

A `website-native-id` crosswalk row links `nativeIdKey: "referenceId"` to a
website label using `matchMethod: "literal_exact"`. Its `comparedText` must equal
the stored reference value exactly, and its confidence is always `candidate`.
It needs the same known source and precise provenance as other crosswalk rows.
An existing native observation can carry this candidate website association
while retaining its independently observed, qualified name and confidence.

### Relationships to observed native hashes

Optional `attributes.crosswalk` rows describe individual relationships. Each row
names an existing `nativeIdKey`, a known `sourceRef`, and at least one precise
`location` or `sourceRecordId`. A `website-label` row carries `label`; a
`native-token-hash` row carries the original `token`. Optional `namespace` and
`url` retain the source's context. `matchMethod` records `joaat32_exact`,
`joaat32_lowercase`, `hash32_value_exact`, or `literal_exact`; native token/hash
rows require one of the two JOAAT methods. Preserve the raw token even when the declared hash method lowercases
it. Native-token/hash rows use the same ASCII calculation rules above; the
validator checks equality with the observed scalar. Hash equality establishes
a candidate relationship, not gameplay identity.

For a `website-label` row using a hash method, `comparedText` preserves the exact
website label or raw slug that was hashed. It is distinct from the human-facing
`label`, and its `namespace` remains a website namespace. The validator requires
ASCII comparison text, recomputes the declared hash, and requires `candidate`
confidence for these automatic joins. Skip non-ASCII hash joins in this export;
do not silently strip accents or normalize the slug. `literal_exact` retains
its separate evidence-based confidence rules and requires no calculated match.

When a website publishes a hexadecimal ID directly, a `website-label` row may
instead use `hash32_value_exact`. Preserve the published case in `comparedText`;
it must contain exactly eight hex digits after `0x` and equal the observed
32-bit value. This method also requires candidate confidence. It performs no
JOAAT calculation and never truncates a wider value. `literal_exact` on a
`website-native-id` relationship continues to mean exact string equality.

Every row has its own `candidate`, `observed`, or `verified` confidence. Evidence
for an observed native value does not upgrade a proposed label join. If the
entry's display name comes from a candidate join, the entity confidence must
also be `candidate`; an observed literal field may retain its qualified label
and carry a separate candidate crosswalk. Reviewers must assess the cited
evidence before promoting either claim.

This layer does not establish a save record, array membership, inventory item,
platform-specific link, or editability. Unvalidated observations retain
`editorReady: false` and `saveMapping: "unvalidated"`; any future save link must
meet the separate mapping contract above. Scalar equality in a save does not
justify publishing a new field mapping. The read-only catalog query can filter
exact IDs and domains as documented in [the connector API](../DEVELOPER_API.md).

Run `node --test ecosystem/plugins/gta-vi/tests/catalog-crosswalk.test.mjs` for
synthetic identifier-domain, provenance and filtered-query checks.

## Editor crosswalk — 22 November 2026

Catalog version `0.2.0` contains **3,692 rows, 20 sources and 18 candidate save
links**. It retains all 334 reviewed website vehicle identities, 160 spec
identifiers, 227 preset tokens, 176 recipe tokens and 472 item claims, alongside
339 independently observed native model hashes and the original observations.
These scopes overlap and use distinct domains; their counts are not additive
unique gameplay-entity totals.

Website claims are included before independent native corroboration when the
source explicitly supplies the identifier and its role. The small native
reference-table matches (13 weapon specs and nine items) add evidence to some
rows; they do not limit directory inclusion. The 294 hunting items retain the
explicit loot-item subtype, excluding Sellable and missing-type rows.

See [the editor crosswalk](EDITOR_CROSSWALK.md) for the full coverage table,
query examples, evidence distinctions and reproducible pipeline. See
[the exporter reuse review](EXPORTER_REUSE_REVIEW.md) for pinned upstream code
and the remaining definition/name-resolution work.

## Reviewed RPF9 observations — 20 November 2026

The 20 November contribution added **2,280 source observations**, bringing the
catalogue to **2,293 entries**, **11 sources**, and the same **18 candidate save
links**. These are metadata observations, not 2,280 verified gameplay entities.

| Destination | Added records | Interpretation |
| --- | ---: | --- |
| `entities/activities.json` | 145 | Mission configuration identifiers; no completion/save links |
| `entities/items.json` | 569 | Ped-loadout configurations; not player inventory slots |
| `entities/vehicles.json` | 537 | 285 performance-map and 252 rating/estimate-map records |
| `entities/weapons.json` | 769 | Unresolved WeaponSpec/Preset/Recipe reference occurrences |
| `entities/systems.json` | 260 | 192 energy configuration records, one health singleton and 67 body profiles |

Clothing and currency categories have no new supported definitions in this
recovered scope. Body profiles are systems observations, not clothing/outfits.
The health singleton has no invented native ID and is distinct from the existing
save-field health hypothesis. There are 353 distinct case-sensitive vehicle keys
across the two map roles; this does not count verified spawnable vehicles. The
192 energy-map records contain 138 distinct literal keys, so occurrence identity
is preserved. Weapon occurrences comprise 14 Spec, 447 Preset and 308 Recipe
references, with 14, 179 and 111 distinct identifiers respectively within those
separate namespaces; those counts do not establish a count of weapons.

All new entries have `confidence: "observed"`, Xbox-only applicability and
`build: null`. Their English labels qualify literal source identifiers as
configurations, keys or references; they are not invented localized game names.
`nativeIds.configurationId` and `configurationNamespace` are exact strings for
named configurations. Weapon observations use `referenceId` and
`referenceNamespace` instead. `attributes.parentCatalogId`, where present,
records the observed XML parent loadout, not ownership or a player-save link.

The eight source records in `sources.json` identify the source archive and its
SHA-256, recovered XML SHA-256, root tag, ordered compressed-stream offsets and
digests, recovery kind, analysis/catalogue digests, and exporter revision. They
contain no PC paths or underlying payload bodies. The observations come from
three single-stream documents and five candidate page-chain documents in
`common.rpf`. Checksum-valid streams and a complete XML parse do not prove an
original archive entry or its filename; source records retain that limitation.

IDs beginning `rpf9-observation-` are SHA-256 digests of compact UTF-8 JSON:

```text
["rpf9-observation-v1", archiveSha256, recoveredXmlSha256,
 recordRole, nativeNamespaceOrNull, exactNativeIdentifierOrNull,
 xmlOccurrencePath]
```

The ID is independent of the displayed label and the analysis database's row
ordering. It identifies an observation in a particular source document, not a
cross-build gameplay entity. Repeated reference occurrences stay separate;
records are not silently merged because their English names or native keys match.

### Reproducing the reviewed metadata export

The standard-library Python exporter accepts only the reviewed payload-catalogue
snapshot with SHA-256
`2d5476d81779585fdacd2759b28df4dc52bb8f7576eedac0a760d936588880d2`.
It reads that catalogue in read-only mode, checks its digest before and after,
and exports an explicit allowlist of identifier and provenance fields. It does
not query the full master, player tables or descendant XML field values.

From the repository root, using maintainer-held inputs outside this checkout:

```powershell
python ecosystem/plugins/gta-vi/scripts/export-reviewed-rpf9.py `
  --catalogue 'C:\Research\payload-catalogue.sqlite' `
  --out 'C:\Research\gta-vi-reviewed-export'
```

Choose a new output directory. The output has five entity-file fragments, an
eight-document `sources.json` fragment, and `export-manifest.json`. Review and
merge the fragments by their unique IDs, preserving existing entries and save
mappings. `docs/rpf9-catalog-import-2026-11-20.json` records the imported fragment
digests; those are **pre-merge export digests**. The generated package lock pins
the complete merged files. A different input snapshot requires a new review.

The separate website supplement is not merged into these observations. Its
site identifiers and labels have no validated crosswalk to these native IDs or
to player saves. Source material and the full master remain maintainer-held.

Never commit raw or decoded player saves, account IDs, authentication material, whole game archives, extracted copyrighted assets, or unlicensed icons/art. An icon may be represented by a source asset ID and citation, but binaries require a separate redistribution review. Synthetic fixtures should be used for public tests. A parser accepting its own output is not proof that a game accepts an edited save. These rules follow the repository's public ecosystem policy and [SDK data policy](../../../sdk/DATA_AND_POLICY.md).
