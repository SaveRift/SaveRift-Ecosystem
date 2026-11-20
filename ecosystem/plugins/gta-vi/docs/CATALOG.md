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

## Reviewed RPF9 observations — 20 November 2026

The current contribution adds **2,280 source observations**, bringing the
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
