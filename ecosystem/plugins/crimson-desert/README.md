# SaveRift Crimson Desert plugin

An extracted game-format connector, operation engine, and custom interface. It
returns candidate artifacts through the public SDK. The trusted host controls
Microsoft authentication, backups, cloud revisions, approval, and Xbox transport.

From a clean ecosystem source tree, install the SDK's exact dependencies and this
package's build dependency, then run `npm run build` and `npm test` here. The
runtime artifact is self-contained and runs in the same bounded QuickJS/Wasm
runner as a contributor package. `package-lock.generated.json` records its exact
digest and source closure; UI assets are built by the shared workbench build.

The package contains **no player fixture, donor save, catalog dump, art, or map**.
Without reference providers, reading uses numeric fallback labels and operations
requiring absent definitions stop with a specific unsupported/provider error.
`scripts/import-data.mjs` imports separately obtained reference JSON by exact
hash. Supply them as `reference-data` artifacts and pin each digest in the
execution lock before opening the connector. An import does not establish
redistribution rights or DLC ownership.

Queries cover paginated inventory/companions/catalogs, progress, locations,
packs, preset previews, and Advanced import inspection. Eight gameplay operation
families preserve scalar/item/companion/cartography composition and a separately
pinned whole-adventure preset replacement. Unknown serialization, required
templates, or schema is rejected. Unverified treasure, teleportation, story, and
arbitrary PC-to-Xbox transfer remain unavailable. A ninth experimental operation
and the versioned typed document queries support local fixed-width research for
contributor-defined systems; see `DEVELOPER_API.md`. Unknown entitlement effects
require independent host inspection and do not enable hosted publication.

The public tests generate invented data, exercise the actual isolated runner,
compare encryption/integrity against independent OpenSSL, and assert intended
decoded changes plus marker/header preservation. Native player golden-fixture
comparison and a separately approved game-load/recovery canary remain gates.
Production v99 stays the temporary regression control; this source extraction
alone is not a production cutover or a new in-game compatibility claim.

See `NOTICE`, the separate `licenses` directory, and data-provider provenance
requirements. The first public release and redistribution contents need owner
review.
