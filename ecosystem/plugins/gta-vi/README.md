# Grand Theft Auto VI - SaveRift game project

This is one public game project and one connector package for Xbox and PS5. The
shared catalog covers the game as a whole: characters, vehicles, weapons,
clothing, items, currencies, locations, activities and systems. Save-field
mappings are a subset of that catalog. Entries distinguish observed facts,
candidate mappings and unresolved fields, with source evidence kept alongside
them. The catalog is not a collection of player saves.

The first runtime is **read-only**. It inspects an already decoded GTA VI JSAV
`memory.dat` artifact selected by the player. Xbox Connected Storage and PS5
save-container extraction remain in their respective local preparation paths.
This package does not request an account token, decode an encrypted cloud save,
claim a working edit/encode route, or restore a save to either console.

The editor lookup crosswalk retains all 334 reviewed website vehicle identities,
160 weapon specs, 227 presets, 176 recipes and 472 item claims. It also adds
339 independently observed nonzero vehicle model hashes, including unresolved
models. The 309 vehicle name/hash joins remain candidates; 25 unmatched
website identities remain searchable reported model claims. Exact identifiers,
calculated hash candidates, native scalar observations and save links retain
separate evidence and domains.

The catalog contains 3,692 rows and 20 sources, including the original 2,280
RPF9 identifier/configuration observations. These rows are not a count of unique
playable entities. The 18 candidate save links remain unchanged. Read
`docs/EDITOR_CROSSWALK.md` for coverage and reproducibility,
`docs/CATALOG.md` for the data contract, and `docs/EXPORTER_REUSE_REVIEW.md` for
the source-backed parser and name-resolution review.

## Local development

From the repository root, install both the UI/build and SDK dependencies with
Node 22+, then run:

```text
npm --prefix ecosystem ci --ignore-scripts
npm --prefix ecosystem/sdk ci --ignore-scripts
node ecosystem/plugins/gta-vi/scripts/build.mjs
node --test ecosystem/plugins/gta-vi/tests/*.test.mjs
```

Use only synthetic JSAV fixtures in public tests. Keep private player saves,
account data and proprietary game files outside this checkout. The source files
for the shared parser and platform preparation live under `src/shared`, `src/xbox`
and `src/ps5` respectively. The package build includes the reviewed public
catalog under `data` and emits an offline isolated runtime with complete per-category modules.

The `gameTargets` identity references are logical project references, **not**
verified Xbox Connected Storage title IDs or PS5 package IDs. A trusted host
must bind the exact game and platform identity before invoking this connector.
The runtime also requires explicit GTA VI and Xbox/PS5 bundle hints and refuses
ambiguous input.

Public compatibility tests use synthetic fixtures. Parser observations do not
establish verified host title binding, edit safety or in-game acceptance. No
private fixture identifiers or player files are included in this documentation.

## Contribution boundaries

Contribute catalog entries with a source, confidence and platform scope where
relevant. Do not present a candidate save-field association as a proven edit.
Runtime write operations require a separate, independently verified game
load/save/reload test for each platform. A successful parser reopen alone does
not establish in-game acceptance.

See `DEVELOPER_API.md` for the current query contract and the repository's
`docs/ecosystem/public/CONTRIBUTING.md` for review and licensing rules.
