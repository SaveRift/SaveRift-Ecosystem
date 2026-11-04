# SaveRift open ecosystem — source preview

This developer source tree contains public plugin contracts, an
isolated reference runner, a custom-interface bridge, synthetic examples and
local developer-workbench services. It runs without Microsoft credentials.
The hosted SaveRift account and Xbox transaction services remain separate.

The canonical repository and immutable developer prereleases are public:
[original developer preview](https://github.com/SaveRift/SaveRift-Ecosystem/releases/tag/developer-preview-2026-11-02)
and [Crimson Desert 0.1.0-dev.3](https://github.com/SaveRift/SaveRift-Ecosystem/releases/tag/crimson-desert-0.1.0-dev.3).
Use the locked source installs below; no npm package publication is claimed.
Current evidence and remaining gates are tracked in [issue #5](https://github.com/SaveRift/SaveRift-Ecosystem/issues/5).

## Run from this source tree

Use Node.js 22 or newer and npm. Preserve the directory layout: source packages
refer to adjacent public SDK modules. Install the exact lockfiles:

```sh
npm ci --prefix ecosystem --ignore-scripts
npm ci --prefix ecosystem/sdk --ignore-scripts
npm ci --prefix ecosystem/workbench --ignore-scripts
npm ci --prefix ecosystem/plugins/crimson-desert --ignore-scripts
npm run build:plugins --prefix ecosystem
npm test --prefix ecosystem
```

The aggregate command discovers `.test.mjs` files in the public packages'
`test/` and `tests/` folders, including both SDK test directories. It does not run
the private platform suite or contact Xbox. Dependency build scripts are not
needed by the selected reference packages. See the workbench's own README for
implemented CLI/stdio/local-server commands and their exact limitations.

## What goes where

| Directory | Responsibility |
| --- | --- |
| `sdk/` | Manifest/bundle contracts, execution locks, bounded isolated runner, shared drafts, registry/data/policy primitives |
| `ui/` | Packaged custom UI frame and validated message bridge; final approval stays in trusted host UI |
| `workbench/` | Local/mock developer workspaces, fixture handling, MCP tools and release preparation |
| `plugins/synthetic-game/` | Invented save with progression, factions, vehicle and camp; no real-game compatibility claim |
| `plugins/synthetic-extension/` | Separate custom-system extension; uses the connector's public API |
| `plugins/crimson-desert/` | Extracted game-specific implementation and declared external data-provider requirements |
| `plugins/ac-shadows/` | Experimental prepared-PC-v54 existing-inventory connector; raw decoding, hosted admission and game/console acceptance remain separate |
| `registry/` | Immutable package review/submission metadata and policy |

The reviewed Crimson runtime/source integration, editor form/staging fixes and
current-layout quantity fix are merged. Hosted results are artifact- and
schema-specific: historical compatible-layout no-op/scalar/mixed checks passed;
released dev.3 supports quantity-only edits and no-op checks on the newer
103-type layout. These are runtime results, not game-load/recovery acceptance.
The customer-facing editor still uses built-in components; plugin cutover and
registry promotion remain pending. The two-human-contributor test is deferred.

The AC Shadows local prepared-PC milestone is complete and merged in
[PR #12](https://github.com/SaveRift/SaveRift-Ecosystem/pull/12): custom UI,
persisted shared draft, isolated processing, candidate downloads and independent
comparisons use the existing workbench. Its [format support](plugins/ac-shadows/FORMAT_SUPPORT.md)
remains limited to the documented prepared PC container. Separate native Oodle
research proved one authorized compressed context, but the runtime still rejects
raw compressed target contexts. [Issue #13](https://github.com/SaveRift/SaveRift-Ecosystem/issues/13)
tracks game acceptance/recovery, raw-input integration, hosted size/checkpoint
limits and distinct AC enrollment. No Xbox compatibility is claimed.

A missing permitted catalog/art/template provider must be visibly
missing; it is not permission to import private modules or claim complete
parity. The clean source preview excludes real player/donor saves and held
game assets. Self-reopen, conformance and cloud readback are separate from game
load/save/relaunch acceptance. A synthetic extension is not evidence for a
second real game.

## Licenses and contributions

Original scaffolding uses Apache-2.0. Preserve Crimson and other third-party
file notices, including MPL-2.0/BSD-2-Clause. Data/artwork have separate rights;
owner permission to use a reference in SaveRift does not automatically
relicense it for public redistribution. See `NOTICE`, package notices and the
public developer guide under `../docs/ecosystem/public/`.

The hosted no-DLC-bypass rule is an independently enforced service/registry
policy. It is not an added restriction to Apache/MPL. Plugins return candidate
files; they never receive Xbox tokens or direct publication authority. Local
tools and MCP can prepare review, not approve a live write or publish a GitHub
release on the owner's behalf.
