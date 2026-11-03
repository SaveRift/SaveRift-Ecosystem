# Assassin’s Creed Shadows — SaveRift connector

Experimental PC inventory support through SaveRift's existing isolated runtime,
custom UI and revision-bound shared draft. No game installation or account
connection is required to inspect a prepared file. This package does not contain
private saves, an account key, a proprietary decoder, or a third-party item catalog.

## Supported journey

1. Build the source with Node 22+: `npm ci --prefix ecosystem --ignore-scripts`,
   `npm ci --prefix ecosystem/sdk --ignore-scripts`,
   `npm ci --prefix ecosystem/workbench --ignore-scripts`, then
   `node ecosystem/plugins/ac-shadows/scripts/build.mjs` from the repository root.
2. Set `SAVERIFT_WORKBENCH_DIR` to a private directory **outside this checkout**.
   Run `node ecosystem/workbench/local-server.mjs` and open
   `http://127.0.0.1:4174` in a browser. Create an Assassin’s Creed Shadows workspace.
3. Select a supported prepared PC `.save` as role `main` and its local private
   transform file as role `ac-key`. Select any additional save-set files as
   `sibling`. Alternatively select an extracted progression context as
   `progression`; this fallback returns a context, not an installable save.
4. Build/test the selected plugin, then open its custom preview. Search/select an
   existing inventory record. Eligible records expose item level or quantity.
   Save an edit to the shared draft; review its original and proposed values.
5. Use **Review changes** to hand the draft to SaveRift's trusted host. Prepare
   the candidate, wait for all required phases, and download artifacts from that
   exact passed job. The private `ac-key` is input-only and is never a candidate.

The initial catalog uses exact item settings/instance IDs. It does not invent
localized item names. Unsupported fields have no enabled edit controls.

## Preparing an existing PC save

Raw PC saves normally contain Oodle-compressed contexts. The isolated runner has
no Oodle decoder. The optional **local authoring** command below converts only
the already-extracted inventory context to native stored blocks and preserves
every other context. It never runs a DLL, downloads a codec, opens the game,
changes ownership, or writes into a live save directory.

```text
node ecosystem/plugins/ac-shadows/scripts/prepare-native.mjs \
  --input /private/original.save \
  --decoded /private/extraction/snapshot.offset40.candidate.bin \
  --contexts /private/extraction/contexts.json \
  --output-dir /private/new-prepared-directory
```

Use a fresh verified extraction from your authorized local tools. The command
requires the prior AC extraction manifest shape (context/block offsets, lengths,
plaintext hashes and output paths). It checks that the decoded container belongs
to the exact input file, verifies its checksums and extraction metadata, walks
the inventory tree, and creates the prepared save, `private-transform.ac-key`,
and a receipt. It refuses overwrites and files inside the source checkout.

This command does **not independently decode Oodle**; validate the preparation
with an external decompressor before relying on it. The private opt-in oracle
under `tests/ac-shadows-independent-oracle.py` does this for the existing AC
research environment. Stored blocks are a recognized native container branch;
**game load/save/reload/recovery of this connector's output has not been tested**.
Untouched compressed target contexts fail with `AC_OODLE_REQUIRED` rather than
silently producing a context mislabeled as a complete save.

## Development and review

```text
node --test ecosystem/plugins/ac-shadows/tests/*.test.mjs
node ecosystem/workbench/cli.mjs call saverift_template_list
node ecosystem/workbench/stdio.mjs
```

The CLI, MCP server and browser share the same private workbench directory.
`tests/ac-shadows-private-flow.mjs` and `tests/ac-shadows-cli-mcp.mjs` exercise
the public service, real isolated execution and result retrieval. Private paths
enter through environment-selected config files; real bytes are never public
fixtures. See repository `docs/ac-shadows-validation.md` for the evidence split.

Source-only release review uses the existing `saverift_release_prepare` tool.
No AC hosted enrollment, production default, registry promotion or publication
is implied by a local package build or candidate success.
