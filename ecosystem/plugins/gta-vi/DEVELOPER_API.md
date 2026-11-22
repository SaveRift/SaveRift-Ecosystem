# GTA VI connector API (experimental)

Package: `saverift.gta-vi`. Runtime profile: `isolated-js-v1`. The host selects
one `memory`, `jsav` or `main` artifact containing decoded JSAV `memory.dat`,
and may select one `chives` artifact. Hints must identify
`grand-theft-auto-vi` (or `gta-vi` / `saverift.gta-vi`) and platform `xbox` or
`ps5`. The runtime hashes selected artifacts and fails closed on a mismatch.

`detect` returns `supported`, `not_a_match` or `recognized_unsupported`.
`open` returns a digest-bound handle and a summary. `describe` advertises
`gtavi.inspect` version `0.1.0`, with no write operations. `query` supports:

| Method | Result |
| --- | --- |
| `gtavi.inspect` | Format, platform, source digest, block counts, labeled field count, exact-integer flag and any observed completion/time metadata. `fieldCount` is retained as an alias of `labeledFieldCount`; it does not count every distinct hash key. |
| `gtavi.fields.list` | Bounded field page; `params.offset` starts at 0 and `params.limit` is clamped to 1-50. |
| `gtavi.catalog.categories` | Public catalog category names and entry counts. |
| `gtavi.catalog.list` | One category from `characters`, `vehicles`, `weapons`, `clothing`, `items`, `currencies`, `locations`, `activities`, `systems`; optional exact native-ID/domain filters; bounded to 25 entries per page. |
| `gtavi.catalog.details` | One exact catalog ID with source-attributed descriptions, statistics, properties, model references and image locators when available. |

### Catalog lookup

`gtavi.catalog.list` accepts `category`, `offset` (default 0), and `limit`
(default 25, clamped to 1–25) in `params` or `args`. Optional `nativeIdKey` and
`nativeIdValue` must be supplied together as nonempty strings. They match the
stored key and value exactly, preserving case, leading zeros and integer width.
Optional `identifierDomain` is one of `model`, `spec`, `preset`, `recipe`, or
`item`. A domain combined with a native-ID pair must describe that same ID in
`identifierMetadata`, `reportedIdentifierMetadata`, or refer to that same input
key in `hashCandidates`. A domain alone selects entries with at least one
observed ID, website-reported ID, or calculated candidate in that domain.
Website-reported rows remain candidates in an explicit website namespace.
The candidate's confidence and source literal remain
explicit; `nativeIdValue` never matches a calculated value in `hashCandidates`.
Filtering happens before pagination, and `total` is the number of matching
observations. Equal values in different domains and repeated observations remain
separate. Invalid filter combinations return `GTAVI_CATALOG_FILTER_INVALID`.

`limit` remains the requested count clamped to 1–25. A page may contain fewer
entries to keep its complete JSON result within 112 KiB, 10,000 nodes and 20
levels, leaving room for the bounded UI response envelope. No entry or witness
is shortened. Continue with the returned `nextOffset`, which is the offset plus
the actual number of entries, or `null` at the end; do not advance by `limit`.
An individual entry that cannot fit returns `GTAVI_CATALOG_ENTRY_LIMIT` instead
of omitting that entry. Empty or exhausted results return `nextOffset: null`.

For example, a synthetic lookup for an observed model hash is:

```json
{"method":"gtavi.catalog.list","params":{"category":"vehicles","nativeIdKey":"modelHash32","nativeIdValue":"0x00000001","identifierDomain":"model","limit":25}}
```

Entries retain `attributes.identifierMetadata` and per-relationship
`attributes.crosswalk` evidence/confidence. To look up derived weapon candidates,
use `nativeIdKey: "referenceId"`, the exact token such as
`nativeIdValue: "WEAPONSPEC_PISTOL_MILITARY_DEFAULT"`, and
`identifierDomain: "spec"`. The entry retains the observed literal reference
and returns its separate `attributes.hashCandidates`, without promoting the
calculations to observed native scalar IDs. A proposed label or token/hash match
is a lookup aid, not evidence of an inventory slot or safe array insertion.
The existing open-document handle requirement and read-only permissions apply.

### Rich catalog details

`gtavi.catalog.details` accepts a single exact `catalogId` in `params` or `args`.
Use an `id` returned by `gtavi.catalog.list`; a model hash or weapon token is not
a catalog ID. For example:

```json
{"method":"gtavi.catalog.details","params":{"catalogId":"gta-vi:vehicles:model-hash-00abb0c0"}}
```

The response contains `catalogId`, `category`, `name`, `applicability`,
`confidence`, `available`, `details`, and the referenced `sources`. An existing
catalog identity without rich data returns `available: false`, `details: null`,
and an empty `sources` array. A malformed ID returns `GTAVI_CATALOG_ID_INVALID`;
an unknown identity returns `GTAVI_CATALOG_ENTRY_UNKNOWN`. The open document
handle remains required on both platforms.

The complete detail response uses the same 112 KiB / 10,000-node / 20-level
budget as a catalog page. Oversized records return `GTAVI_CATALOG_DETAILS_LIMIT`
without shortening facts or provenance. Rich details live in separately pinned
`data/details/*.json` files and generated `runtime/details/*.mjs` modules; list
pages continue to return their original complete catalog entries.

Shared field definitions expand on lookup into each statistic/property's
label, type, unit, unit interpretation, source reference, value JSON pointer,
and descriptor JSON pointer. Translated `displayValue` fields also retain an
escaped `displayValuePointer` into the source translation table. Zero and false values are preserved. `scaleMax`
distinguishes menu ratings from physical quantities. `sourceInterpreted` and
`unitStatus` retain assumptions made by the published source. Descriptions are
original factual summaries, marked `generated-factual-summary`; they do not
pretend to be official game descriptions. A missing price remains `null`.

Presets and recipes retain `relatedSpecCatalogIds`; they do not inherit a
specification's statistics or image as though it were variant-specific evidence.
The UI can query the related specification explicitly. Model IDs retain their
width and role, separate from weapon specifications and inventory items.

Media URLs are research locators. They are never fetched by the connector or
custom view. The view renders an image only for a non-null opaque `assetId`
resolved by `client.resolveAsset({assetId})` through the existing host binary
channel. It requires matching returned asset identity, image MIME and exact
byte length, then creates a temporary blob URL. The host's immutable execution
lock and digest verification remain authoritative; the package does not change
the frame CSP or grant access to remote image URLs. Without a pinned asset, the
UI displays an explicit missing-preview state.

`plan` and `validate` reject with `GTAVI_READ_ONLY`. A catalog entry, parser
match or decoded artifact does not authorize a save change. The host owns
account and title binding, immutable package locks, permissions, player review
and any later export or restore action.
