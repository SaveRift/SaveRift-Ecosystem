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

Private local compatibility checks on uncommitted, previously decoded files
observed a PS5 `PPSA01547` / `SARC0015` JSAV v3 image and an Xbox backup whose
metadata reported title ID `2035456122` with `SARC0000`, `SARC0001` and
`SARC0015` JSAV v3 images. Each inspected image reported 82 blocks and nine
currently labeled fields; many more hash keys remain unidentified. This is a
parser observation, not public fixture coverage, verified host title binding,
edit safety or in-game acceptance. No player file is included in this project.

## Contribution boundaries

Contribute catalog entries with a source, confidence and platform scope where
relevant. Do not present a candidate save-field association as a proven edit.
Runtime write operations require a separate, independently verified game
load/save/reload test for each platform. A successful parser reopen alone does
not establish in-game acceptance.

See `DEVELOPER_API.md` for the current query contract and the repository's
`docs/ecosystem/public/CONTRIBUTING.md` for review and licensing rules.
