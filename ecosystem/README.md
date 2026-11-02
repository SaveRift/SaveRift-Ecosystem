# SaveRift open ecosystem — source preview

This unpublished developer preview contains public plugin contracts, an
isolated reference runner, a custom-interface bridge, synthetic examples and
local developer-workbench services. It runs without Microsoft credentials.
The hosted SaveRift account and Xbox transaction services remain separate.

Public repository destinations and the first release are awaiting owner
review. There are no published npm installation commands or public release
URLs to substitute for this checkout.

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
| `registry/` | Immutable package review/submission metadata and policy |

Crimson source is being migrated against the existing production regression
control. A missing permitted catalog/art/template provider must be visibly
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
