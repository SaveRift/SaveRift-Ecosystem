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

The reviewed RPF9 contribution adds 2,280 identifier/configuration observations
from eight recovered XML documents in the owner-supplied Xbox `common.rpf`.
Each observation is Xbox-only, has an unknown game build, and retains its exact
source identity and research role. Weapon references are unresolved references;
loadouts and vehicle-map records do not establish player inventory or available
vehicles. The 18 existing candidate save links remain separate and unchanged.
See `docs/CATALOG.md` for counts, provenance and the bounded export command.

## Local development

From the repository root, install the `ecosystem` dependencies with Node 22+,
then run:

```text
node ecosystem/plugins/gta-vi/scripts/build.mjs
node --test ecosystem/plugins/gta-vi/tests/*.test.mjs
```

Use only synthetic JSAV fixtures in public tests. Keep private player saves,
account data and proprietary game files outside this checkout. The source files
for the shared parser and platform preparation live under `src/shared`, `src/xbox`
and `src/ps5` respectively. The package build includes the reviewed public
catalog under `data` and emits a self-contained isolated runtime bundle.

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
