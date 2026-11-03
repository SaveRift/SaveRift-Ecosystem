# AC Shadows validation and review workflow

This file is a repeatable procedure, not a claim that its steps passed. Actual
receipts must identify the immutable package digest, execution lock, selected
fixture hashes and candidate job. No fixture or private key belongs in source.

## Local workbench and isolated runtime

Use the complete public snapshot at `09c92ff35097160528a669d753724b3a36c24059`
as baseline. Build AC's runtime/UI before local template discovery. Node 22+ is
required. Use a private absolute `SAVERIFT_WORKBENCH_DIR` outside this checkout.
The local browser, CLI and MCP then share the same revision-checked store.

```sh
node ecosystem/workbench/cli.mjs call saverift_template_list
node ecosystem/workbench/cli.mjs call saverift_project_list
node ecosystem/workbench/cli.mjs call saverift_workspace_create '{"template":"plugin-saverift.ac-shadows","name":"AC Shadows review"}'
node ecosystem/workbench/cli.mjs fixture WORKSPACE_ID /private/prepared.save --role main --allow-ai-inspection
node ecosystem/workbench/cli.mjs fixture WORKSPACE_ID /private/private-transform.ac-key --role ac-key --allow-ai-inspection
node ecosystem/workbench/cli.mjs call saverift_workspace_status '{"workspaceId":"WORKSPACE_ID"}'
node ecosystem/workbench/cli.mjs call saverift_plugin_build '{"workspaceId":"WORKSPACE_ID","expectedRevision":CURRENT_REVISION}'
```

The consent flag is suitable only for fixtures whose owner authorized AI
inspection. It grants no access to another workspace and is not inherited from
Crimson. Upload any required private format-key sidecar using the exact AC role
declared by the connector; never add it to source or operation JSON. Upload any
unrelated sibling file with a distinct role so the bundle preservation check
includes it. Never select or write an Xbox save through these local tools.
Fixture uploads increment the workspace revision; use the revision returned by
the status call after all selected files have been uploaded.

Read `saverift_job_status` for the build's `artifactId`, then use the actual IDs:

```json
{"tool":"saverift_tests_run","arguments":{"workspaceId":"WORKSPACE_ID","artifactId":"ARTIFACT_ID","fixtureIds":["FIXTURE_ID"]}}
{"tool":"saverift_preview_open","arguments":{"workspaceId":"WORKSPACE_ID","artifactId":"ARTIFACT_ID","fixtureIds":["FIXTURE_ID"]}}
{"tool":"saverift_candidate_prepare","arguments":{"workspaceId":"WORKSPACE_ID","artifactId":"ARTIFACT_ID","fixtureIds":["FIXTURE_ID"],"expectedDraftRevision":1}}
```

Each job must end `passed`. `not_run`, timeout, unsupported format and missing
fixture are incomplete checks. The candidate must use the saved custom-UI draft,
not an unrelated operations array. Default budgets remain unchanged; a new AC
digest never inherits Crimson's reviewed profile.

`tests/ac-shadows-private-flow.mjs` automates this public service path in the
actual isolated QuickJS/Wasm runtime. It checks no-op parity and fresh-engine
reopen, persists a preview, optionally stages a supplied typed operation, proves
stale-draft rejection, retrieves exact candidate bytes and checks descriptor
length/SHA-256, and prepares an explicit source-only release review. This script
is **not** browser-form evidence. Set `SAVERIFT_AC_FLOW_CONFIG` to a private JSON
file, for example (placeholders must be replaced, never checked in):

```json
{
  "name": "AC Shadows authorized fixture",
  "stateDirectory": "/private/ac-workbench",
  "outputDirectory": "/private/ac-validation",
  "fixtures": [
    {"path":"/private/prepared.save","role":"main","allowAiInspection":true},
    {"path":"/private/private-transform.ac-key","role":"ac-key","allowAiInspection":true}
  ],
  "query": {"method":"acshadows.inventory.list","offset":0,"limit":10},
  "operations": []
}
```

Leave operations empty to prepare the browser workspace without staging an edit.
Queries expose native identifiers separately from labels. Use a record returned
by the same source query, its exact `sourceSha256`, and its witnessed old value.
The currently declared edits are quantity for existing level-zero stacks and
level for existing gear; the source manifest/schemas are authoritative.

## Required real browser evidence

Start `node ecosystem/workbench/local-server.mjs` with the same private state
directory. Open `http://127.0.0.1:4174`. Select the AC workspace and exact fixtures,
build the current source if needed, run conformance, and open its custom view.
In the packaged AC form, choose an editable existing record, enter a bounded
value, stage it, and verify the shared draft revision and before/after display.
Use the host's **Prepare shared draft** action and wait for all four isolated
phases. Download each artifact through the links for that exact passed job.

The download listing route is
`GET /api/developer/candidates/JOB_ID`; each descriptor supplies its own
`downloadPath`, of the form `/api/developer/candidates/JOB_ID/ARTIFACT_ID`.
Retrieve actual binary responses, not a locally regenerated substitute.
Record their bytes/SHA-256 and match the descriptors. Selected key/reference
inputs declared input-only must not appear in candidate downloads. Retained
siblings must have identical hashes. Record browser name, source/lock IDs,
saved draft revision, job ID and screenshot or concise UI event evidence.
Do not publish signed URLs, raw values, fixture bytes or account identifiers.

The public frame must retain `allow-scripts allow-forms` and
`form-action 'none'`, opaque origin, hashed scripts and the bounded MessagePort
bridge. No AC-specific host page or cross-origin storage access is needed.

## Independent oracle

`tests/ac-shadows-independent-oracle.py` uses the earlier local AnvilToolkit
unpacker, not the new JS serializer. Its private configuration selects the
original full decoded payload and `contexts.json`, original/candidate files,
optional 16-byte base XOR key, existing PowerShell/unpacker paths, exact expected
32-bit field patches and optional sibling file pairs. It verifies seeded payload
CRC32, footer CRC32C, compressed Adler checksums, context framing, every plaintext
byte and non-context bytes. Only intended patches plus lengths/checksums may
change. It never installs the candidate into the game.

```json
{
  "originalContexts":"/private/baseline/contexts.json",
  "originalDecoded":"/private/baseline/snapshot.offset40.candidate.bin",
  "originalFile":"/private/baseline/selected.save",
  "candidateFile":"/private/download/selected.save",
  "keyFile":"/private/selected-base-key.bin",
  "outputDirectory":"/private/independent-check",
  "powershell":"/local/pwsh.exe",
  "unpacker":"/prior-authorized-work/unpack_save_blocks.ps1",
  "expectedPatches":[{"context":12,"offset":0,"format":"<i","before":1,"after":2}],
  "siblings":[]
}
```

The example offset is deliberately not a real field offset. Resolve the intended
record with the previous independent typed-property parser, not by trusting the
new connector's own serialization report. `SAVERIFT_AC_ORACLE_CONFIG` selects
this private file. The public Python helper has no dependency on private paths,
player identities or Oodle binaries in source. Original AnvilToolkit/Oodle files
remain local and are not redistributed.

For an exported progression-context input, use `format:"progression-context"`
with `originalFile`, `candidateFile`, `parserDirectory`, `outputDirectory`,
`expectedPatches` and optional `siblings`. This mode fully parses both inputs
with the earlier Python property parser and proves exact whole-file conservation
outside the specified patches. It explicitly reports native-save CRC/wrapper
validation `not_run` and never labels its context output installable by the game.

`tests/ac-shadows-cli-mcp.mjs` retrieves the already-completed job through both
an actual CLI child process and the official MCP SDK client/stdio server. It
checks that job and execution-lock IDs match, without rerunning the codec or
putting fixture bytes in tool arguments. It uses the same private flow config.

## Negative cases and evidence labels

Cover wrong/truncated signature, wrong platform/format version, bad CRC32,
CRC32C and block checksum, invalid lengths, unsupported storage/compression,
unknown operation, wrong source hash, wrong old value, out-of-range level and
quantity, ambiguous record identity, stale shared draft/source revision, and
cancelled/exhausted isolated runtime. Fail closed rather than silently dropping
unknown data. New synthetic fixtures can be public; real inputs stay private.

Report separately: implemented; locally synthetic-tested; locally real-fixture
tested; actual browser/download tested; hosted-tested; in-game/recovery tested.
The earlier level study and engine observations establish research provenance,
not acceptance of this newly generated candidate. Game load/save/quit/relaunch
and exact original recovery remain `not_run` unless deliberately exercised.

## Review-only export

Call `saverift_release_prepare` with the built `artifactId`, an explicit source
allowlist and accurate
license evidence. Download `/api/developer/releases/RELEASE_ID`. This produces a
review bundle and `publication:not_performed`; it does not activate a package.
The harness uses `package-lock.generated.json`'s canonical compiled paths plus
`manifest.json`, first checking each file against the actual tested artifact.
This includes format-support documentation and dependency notices. Editable
source and tests belong in the separately audited full-source archive.
Record the tested editable-source package digest, canonical compiled-package
digest and review bundle digest. The review digest hashes the files map and is
not the SDK package digest, even when the reviewed closure is canonical.
Never promote the registry, switch production, publish a release or perform an
Xbox write as a side effect of this workflow.

## Package identity and editable source

There are deliberately different fingerprints:

1. `package-lock.generated.json` pins the controlled build's canonical compiled
   package: manifest plus compiled runtime/UI, notices/licenses and selected
   documentation. It excludes dependencies' installation directories and raw
   editable build source.
2. Local template discovery produces an editable-source package. It contains
   the same compiled runtime/UI plus connector source, `src/`, build scripts,
   package metadata/locks, generated build inventory and public synthetic tests.
   The SDK hashes every packaged path, so this closure has a different digest.
3. A workbench source digest covers its revision's text source map. An execution
   lock hashes the exact connector/extension/data package selection. A release
   review digest hashes the explicit source allowlist. These are not synonyms
   and must not be substituted for one another in evidence.

Run `tests/ac-shadows-fingerprints.mjs` after the final build, with optional
`SAVERIFT_AC_FINGERPRINT_OUTPUT` pointing outside source. It verifies the saved
canonical descriptors, recomputes both package digests, proves all shared
runtime/UI files are byte-identical and lists the extra editable-source files.
It fails if a built file or manifest changed without rebuilding. Its output
does not claim tests on an untested digest. Keep each runtime/browser receipt
bound to the exact artifact it exercised; final source changes require fresh
evidence for that new artifact. Local template discovery excludes hidden,
`node_modules`, fixture/private/log directories. Private state, candidate bytes,
downloaded saves, account keys and fixture configurations must remain outside
the checkout and all release allowlists.
