# Crimson Desert custom interface

This is the existing Crimson explorer extracted as a public custom application:
Upgrades, inventory/search/quantity/add-item planner, companion pets/mounts,
Cartography, progress dialog, preset previews and their responsive styles.
It uses the same public bridge available to community interfaces. It contains no
account login, cloud API client, private queue storage, or Xbox publisher.

The connector's `crimson.explorer` query returns its safe presentation DTO, and
namespaced queries provide bound previews. `bridge.jsx` translates the current
game-specific intention representation into registered canonical operations.
Compound pack changes use one host revision-CAS batch. Other extensions' entries
remain in the shared draft; the host resolves owners from pinned declarations.
The host, outside this frame, owns final diff, destination, approval and sending.

Reference catalogs, art and donor presets are separate pinned providers. None is
silently copied into this source package. A clean build uses numeric/empty catalog
fallbacks until permitted providers are attached to the execution lock. The host
resolves a legacy asset reference only if it belongs to the pinned reviewed asset
index; `resolveAsset` is not an arbitrary URL fetcher. Network access from the
frame is blocked, and image results must be bounded data artifacts.

UI bootstrap asks `catalogQuery({catalogId:'crimson.ui.providers',limit:32})`
for immutable `{id,assetId,byteLength,sha256}` provider descriptors, resolves each
through the binary asset channel, validates the pins, and configures them before
lazy-loading game modules. The host returns an empty list when no permitted
provider is attached; an advertised provider that fails validation stops startup.

`node ecosystem/plugins/crimson-desert/scripts/build-ui.mjs` compiles the standalone
UI with the public SDK and normal React dependencies. `ui/dist` is a build output,
not source data. The old private UI remains a temporary production regression
control until whole-package parity, entitlement and hosted canary gates pass.
Extraction alone does not establish the production cutover.

The `crimson.import` custom view is available only with Advanced enabled. It
preserves the PC/native upload checker and result presentation while asking the
trusted host to select files and download a checked copy. Source descriptors,
not file bytes, cross the UI bridge. `crimson.import.inspect` is routed by the
host to a fresh isolated session using that temporary imported bundle; outputs
are `native-export` artifacts with exact hash/length metadata. The interface
rejects mismatched originals, failed integrity/structure/native re-open checks,
base64 output, or any claim that these files can already be sent to Xbox. The
Advanced view clears all state and cancels work on context change or close;
turning Advanced off unmounts it and closes its port. The host additionally
revokes and clears its temporary scope. Until a trusted picker/download handler
is provided, those controls report that the capability is unavailable.
