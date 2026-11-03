# Assassin’s Creed Shadows support — review candidate

Prepared 2026-11-03. Implemented in the complete SaveRift SDK/workbench at public
base `09c92ff35097160528a669d753724b3a36c24059`, branch
`feat/ac-shadows-support`. This is a local review candidate, not a published
release or hosted production integration.

## What works

The distinct `saverift.ac-shadows` game connector exposes existing Naoe/Yasuke
inventory through SaveRift's packaged custom UI. The complete tested journey is
**open selected prepared save → inspect/search → edit → shared draft → trusted
preview/review → isolated candidate → binary download**.

Two bounded typed operations are implemented:

| Operation | Admitted records | Bounds and witnesses |
| --- | --- | --- |
| `acshadows.inventory.setLevel` | Existing known-character singleton gear with a positive level | Level 1–100; exact source SHA-256, record ID and expected old value |
| `acshadows.inventory.setQuantity` | Existing known-character level-zero stacks already containing more than one unit | Quantity 1–999999; the same source/record/value witnesses |

At most 16 operations are accepted. Duplicate/ambiguous properties, unknown
owners, stale sources/old values, duplicate edits, unsupported fields, malformed
containers and unsupported versions fail closed. Other inventory data is
read-only. The UI uses exact native identifiers; it does not invent localized
names or redistribute an unreviewed item catalog.

The custom React UI uses the existing bounded bridge and revision-bound shared
draft. It cannot approve candidates or publish. Game behavior is entirely in
the plugin; no AC-specific host page or separate application was introduced.
The existing extension/data interfaces remain available; no unrelated extension
or external data provider is needed for these scalar inventory edits.

## Exact native-format boundary

Supported native input is a **prepared PC v54 container** whose progression
context uses the native stored-block branch, accompanied by its separately
selected private 16-byte transform file (`ac-key`, input-only). This is a full
native save container, not a context renamed to `.save`.

Untouched PC saves generally use Oodle compression. The default isolated runner
does not supply that codec. They are explicitly rejected with
`AC_OODLE_REQUIRED` when the target context is compressed. A local preparation
command reuses the prior authorized extraction and changes only the storage of
context 12. It verifies original/decoded pairing, integrity fields, extraction
metadata and the typed object tree. It neither installs nor invokes a bundled
proprietary decoder. Independent decoding of the preparation is a separate
required check and passed for the selected real fixture.

The selected original was 901,776 bytes; its prepared counterpart is 7,459,585
bytes. All 61 contexts decode to identical plaintext before edits. Within the
6,819,042-byte progression context the parser traverses 86,929 objects, 193,505
fields and 2,174 inventory records. The precise supported versions and native
framing/checksum rules are documented in the plugin's `FORMAT_SUPPORT.md`.

The alternative extracted-progression input is explicitly context-only and
does not produce an installable native save. Other native versions and Xbox
formats are unsupported. Player level/XP/prestige/mastery, equipment additions,
engraving changes, unlocks and stat simulation are not implemented by this
connector. Prior AC research is provenance, not proof of those features here.

## Actual evidence

| Area | Result | Scope |
| --- | --- | --- |
| Handoff provenance | Passed | All 23 supplied checksums, including all 18 original release assets |
| Full public test suite | 446/446 passed | Complete local SDK/workbench/plugin suite, not only AC unit tests |
| Aggregate package build | Passed | AC built through the full tooling; Crimson compiled digest unchanged |
| Release-audit tests | 9 passed; 1 skipped | Windows symlink privilege unavailable; GNU tar used |
| Native preparation | Passed independently | Existing Anvil decompressor plus independent Python checks; all 61 contexts unchanged |
| Native no-op | Passed | Actual default isolated runtime; prepared source bytes and selected sibling preserved |
| Intended edits | Passed | Service run: gear 62→61 and quantity 7→8; exactly two plaintext bytes changed |
| Real browser workflow | Passed | Chrome custom form, shared draft, trusted host review, isolated execution and actual downloads |
| Downloaded-byte validation | Passed independently | Browser run: gear 62→60 and quantity 7→8; 60 unchanged contexts, only the two intended scalar bytes in context 12 |
| Sibling preservation | Passed | Downloaded 901,776-byte sibling exactly matches original |
| Key exclusion | Passed | Input-only key absent from candidate artifacts and download links |
| CLI/MCP | Passed | Actual CLI child and official MCP SDK 2.4.0 stdio client retrieved the same job and lock; 55 tools, protocol 2026-07-28 |
| Source-only release review | Prepared | Canonical compiled closure reviewed through existing service; publication not performed |
| Hosted AC runtime/browser/Git workflow | Not run | AC project is absent from connected registry; transport is synthetic-fixture-only |
| Actual game load/save/relaunch/recovery | Not run | Independent format validity does not establish in-game acceptance |
| Two real contributors | Deferred | Synthetic tests or parallel coding agents are not this acceptance test |

The initial full-suite run encountered a Windows `UNKNOWN` read error in an
installed `cross-spawn` file. The three focused MCP tests and the full 446-test
rerun passed without changing source. Both runs remain in the evidence. Earlier
native prototypes hit the CPU budget twice; redundant parsing/copying was then
removed. The successful final runs use the unchanged default profile, not a
borrowed Crimson grant or enlarged budget.

Final browser phases took 4,976 / 8,236 / 7,874 / 4,958 ms. Peak runtime memory
was 61,734,912 bytes, within the existing limits. Larger/different saves and
hosted resumable storage limits have not been validated. Near-limit performance
on this fixture should not be generalized to every supported-looking file.

An additional clean-export build/test receipt is supplied in `evidence/`.
It documents the actual checks performed on the reviewed source snapshot.

## Identities reviewers can reproduce

| Identity | Value |
| --- | --- |
| Canonical compiled package | `a41b1d17233b8130fe6b62c972dac74e45f1db56f5bccabad4f2350ab37b033a` |
| Tested editable-source template | `495c32b2d17c941a44ae0f7d744a29fa23a22557f706d69982cc0e95ff3e36da` |
| Execution lock | `d63f961aaaffdd1e7aab5ab3e279a66e6d52f220c0f77050441d94f92ea54760` |
| Service candidate | `job_224d69b472204a2f807450e83966a097` |
| Actual browser candidate | `job_fe5e88ca463341b7b901428175aa9ffe` |
| Browser-downloaded native save SHA-256 | `749f640d0d76f32e9a72fbdee14c92507b6077cb8ee1024821697a2b5f6afdb5` |
| Source-only review | `release_d6623010f26145e59173f4843804da8b` |
| Review files-map digest | `0807ab240cbdde6f9f2c86ee6062e6730d39a090d8482458c05ed75a3b8459e2` |

Package, execution-lock, source-map and review-map digests are different
identities. The editable template additionally includes source/build/test files;
all 15 shared canonical runtime/UI/document files are byte-identical. Receipts
bind to the exact package actually executed, without substituting the compiled
package digest for the tested template digest.

## Framework changes and preservation

Only small general host changes were required:

- Explicit local mode (`hostedEnrollment:false`) enables local work without
  impersonating a hosted project or importing another game's grants.
- Review loads the exact persisted shared draft into the trusted run panel,
  preventing a stale synthetic operations example from replacing the form's edits.
- Source-review export includes `FORMAT_SUPPORT.md` and excludes `.ac-key` files.
- The existing aggregate build/export allowlists include the new plugin and its
  public test helpers. Default runtime profiles remain unchanged.

Crimson code, registry defaults, source pins, grants and unrelated unpublished
work were preserved. Hosted discovery was read-only. No release publication,
registry promotion, production switch, Xbox transport/write or new game save
installation occurred.

## Review and continuation

The package contains the audited full source snapshot, a Git patch against the
pinned public base, canonical source-only review JSON, fingerprints, independent
oracle reports, browser/CLI/MCP receipts, tests and dependency inventory. It
contains no private save bytes, account key, credentials, private workbench
state or proprietary decoder. Existing deliberately synthetic SDK fixtures are
retained as part of the public test tooling. Private evidence screenshots and
actual candidates remain local outside the source/export.

One unchanged optional `ecosystem/sdk/scripts/profile-crypto.mjs` benchmark is
excluded from the audited snapshot because its embedded import strings trigger
the conservative static export scanner. Its hash and reason are recorded. It
remains in the complete original checkout and Git patch base; no SDK runtime,
contract, runner, UI, CLI/MCP or collaboration feature was omitted. The clean
export is built/tested separately. The dependency SBOM records lockfile license
declarations; it is not a claim of completed legal review.

The branch and patch are ready for a maintainer. A local commit/DCO identity was
not invented. Hosted enrollment, work claims, checkpoints and PR opening require
an AC-specific project and verified repository/actor binding, currently absent.
`docs/ac-shadows-hosted-integration.md` supplies an inactive additive proposal
and the exact existing collaboration workflow without modifying current pins.

Before enabling this for users: review the patch, perform actual game
load/save/relaunch and recovery on an explicitly selected test copy, admit the
specific format/runtime/fixture scope on a distinct hosted AC project, then run
that hosted browser workflow. Publication and registry promotion remain separate
future decisions. The two-real-contributor test stays deferred.
