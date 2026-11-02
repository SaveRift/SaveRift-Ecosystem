# Reference data, presets and hosted content policy

These modules run locally without an account. They do not acquire saves or make Xbox requests. Examples and tests use synthetic content and synthetic account-binding digests.

## Immutable reference data

`data.mjs` accepts bounded UTF-8 JSON or CSV and returns an immutable catalog with its content digest. Catalogs carry their own source revision, permitted-use/license label and attribution. A code license does not license the game artwork or imported database.

```js
import { importCatalog, queryCatalog } from './data.mjs';

const catalog = importCatalog({
  format: 'csv',
  text: 'id,type,nativeId,name.en,attributes.material,sourceRef\nexample:item:sword,item,18446744073709551615,Iron Sword,iron,source.synthetic',
  header: {
    catalogId: 'example.reference', version: '1', defaultLocale: 'en',
    gameBuildRange: 'synthetic-v1',
    sources: [{ id: 'source.synthetic', revision: '1', license: 'CC0-1.0',
      attribution: 'Synthetic example', retrievalMethod: 'authored example' }]
  }
});
const page = queryCatalog(catalog, { type: 'item', limit: 50 });
```

IDs are namespaced strings; native IDs remain lossless strings. Entity types and attributes are open ended. Names are localized labels, never identity keys. Missing requirements remain unknown; an imported empty requirement list is not independent proof that an item is base-game content. Explicit crosswalks bind provider IDs to an exact catalog digest; they never approximate a match from an English name.

CSV supports `id`, `type`, `nativeId`, `sourceRef`, `parentId`, `name.<locale>`, `attributes.<field>` and JSON-valued `requirements`, `assets`, `links`, `applicability`. Quoted fields and newlines work. Formulas, prototype-related keys, unsafe integers, oversized input and excessive nesting are rejected. SQLite and NDJSON import are not implemented. Importers make no network requests; a catalog URL cannot become an SSRF request or receive a player save.

`createAssetSnapshot` accepts immutable logical `assets/` paths and separate source provenance. PNG/JPEG/WebP header dimensions and byte sizes are bounded; image headers do not prove successful full image decoding. Serving hosts should decode/re-encode within their resource budget before admitting artwork. `sanitizeSvg` intentionally accepts only a small neutral-vector subset, rejects active elements/external references/entities and does not claim to sanitize arbitrary SVG features. No remote executable assets are supported.

Map transforms currently support explicitly anchored affine 2D coordinate frames. Frames declare axes, units, field, matrix, tolerance and at least three non-collinear evidence-bearing anchors. Unsupported or mismatching transforms fail. A map projection never invents a world-height coordinate and cannot by itself authorize teleportation.

## Preset composition

`presets.mjs` composes immutable preset recipes into the same ordered operations used by manual editing. Every package/data dependency and operation provider is pinned by exact version and digest. Nested recipes are bounded and cycles fail. Domain API mismatches, missing parameters, unregistered operations and undeclared overlapping writes fail before planning. Custom systems remain arbitrary operation parameters; no inventory schema is imposed.

Preset requirements are declarations for review, not entitlement facts. A preset cannot supply publication or ownership authority. The complete resulting candidate must still be independently inspected after all transformations.

## Host-owned entitlement evaluation

The trusted host constructs `createEntitlementPolicy({ classifiers, provider, now, mode })`. Neither a plugin nor an MCP caller selects those integrations or their trust level.

Each admitted independent classifier has its own reviewed digest, exact connector digest and catalog digests. `inspectTransition` receives the original and complete candidate, then reports their exact digests, `coverage: 'complete_transition'`, `complete: true`, and affected records. Supported classifications are:

| Classification | Meaning |
| --- | --- |
| `base` | Reviewed scope establishes no restricted-content effect |
| `restricted` | Explicit nested `allOf`/`anyOf` entitlement requirements apply |
| `unknown` | The affected effect is not classified; block hosted publication |
| `ownership` | Purchase/license/ownership records are protected from modification |

The policy hashes the complete candidate object itself. It does not use a plugin-provided candidate hash, safe flag, DLC label or `entitled: true`. The host must separately validate the immutable bundle and candidate artifact bytes; metadata hashes alone do not validate file contents.

The provider returns fresh facts bound to the destination account digest, destination digest, product and platform. States are `allowed`, `not_entitled`, `unknown`, `unavailable`, `expired`. Unknown/unavailable/expired facts do not authorize a new restricted effect. Evidence expiry is capped by the underlying allowed facts. Provider failures, incomplete inspectors, unsupported package/data pins and unknown candidate effects block publication while preserving read/export. Unchanged restricted records can remain unchanged during an independently established unrelated base edit; their presence does not prove ownership.

Synthetic providers can authorize local synthetic tests, never hosted restricted writes. There is no universal Xbox entitlement provider in this SDK, and no claim that this policy can discover every hidden DLC effect in an opaque game format. A new connector without an admitted complete-transition inspector remains read-only for hosted publication.

`policy.verify(evidence, binding)` authenticates evidence issued by that same in-memory policy instance and verifies account/destination/candidate/lock/freshness. Hosts that persist evidence must use `verifyEntitlementEvidence` with a trusted-store provenance callback. The public evidence digest detects changes; it is not a signature or authority by itself. Callers must never control the trusted-store callback.

The reference integration test exercises the actual draft, registry and publication gate with this policy. A copied, checksum-valid policy report is rejected; account/destination/candidate/operation/source substitutions, expiry and registry revocation during asynchronous verification invalidate the review. These tests start no Xbox transaction.

## Verification

```sh
node --test test/data.test.mjs test/presets.test.mjs test/entitlements.test.mjs test/policy-host-gate.test.mjs
```

These tests establish SDK behavior using synthetic fixtures. They do not establish a game's DLC classification, ownership API availability, in-game acceptance, public redistribution rights or live transport permission.
