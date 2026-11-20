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

The starter catalog contains only official character/place names and nine observed hash preimages in each platform's decoded JSAV data. All save links are candidates with `editable: false`; their gameplay meanings, controlling records, and in-game effects have not been verified. In particular `Balance` is not confirmed as player cash, `Progress` is not the verified overall completion field, and `relationshipLevel` is not a player level. PS5 and Xbox mappings cite separate read-only observations; neither includes player data. The first future catalog contributions should come from bounded structural indexes of the small RPF9 archives and public game metadata, with exact archive/member/build provenance. One-at-a-time before/after save comparisons can then test field links. **Do not use similar English names as a crosswalk.** Bind any external catalog ID crosswalk to the exact catalog revision/digest.

Never commit raw or decoded player saves, account IDs, authentication material, whole game archives, extracted copyrighted assets, or unlicensed icons/art. An icon may be represented by a source asset ID and citation, but binaries require a separate redistribution review. Synthetic fixtures should be used for public tests. A parser accepting its own output is not proof that a game accepts an edited save. These rules follow the repository's public ecosystem policy and [SDK data policy](../../../sdk/DATA_AND_POLICY.md).
