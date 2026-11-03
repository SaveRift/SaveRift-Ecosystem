# AC Shadows implementation checkpoint

Updated 2026-11-03. Submission branch: `saverift/ac-shadows/11-inventory-support`.
Base: `09c92ff35097160528a669d753724b3a36c24059`, the full public source snapshot.
All 23 handoff checksums, including the 18 original developer-release assets,
were verified. Work is in a separate checkout; existing Crimson work, grants,
registry entries, production pins and release assets are unchanged.

## Implemented and locally verified

- Distinct `saverift.ac-shadows` connector with typed, witnessed edits for
  existing gear levels (1–100) and existing multi-item stack quantities
  (1–999999). Up to 16 edits; unsupported/ambiguous records remain read-only.
- Packaged custom inventory UI, search, shared revision-bound draft, trusted
  host review, candidate creation, binary download and unchanged siblings.
- Prepared native PC v54 saves with a separately selected input-only key;
  extracted progression contexts as an explicitly context-only alternative.
- Native wrapper/checksum/block preservation and a local preparation command
  using an already verified authorized extraction. No Oodle binary distributed.
- Actual default isolated QuickJS/Wasm phases, real browser/result retrieval,
  CLI/MCP, source-only release review, independent Anvil/Python validation.

The selected context contains 86,929 objects, 193,505 fields and 2,174 inventory
records. Native preparation expanded the original 901,776-byte save to
7,459,585 bytes by storing context 12 uncompressed. Independent decoding proved
all 61 contexts' plaintext unchanged during preparation.

## Immutable final evidence

Canonical compiled package:
`a41b1d17233b8130fe6b62c972dac74e45f1db56f5bccabad4f2350ab37b033a`.

Tested editable-source package (same runtime/UI bytes, additional build sources):
`495c32b2d17c941a44ae0f7d744a29fa23a22557f706d69982cc0e95ff3e36da`.

Execution lock:
`d63f961aaaffdd1e7aab5ab3e279a66e6d52f220c0f77050441d94f92ea54760`.

Workspace: `workspace_016affb0bdd3470c9da49e4f482a9f81`.
Artifact: `artifact_e6b4aee0fa2a465c87884a05b98dfd5f`.
Service candidate: `job_224d69b472204a2f807450e83966a097`.
Browser candidate: `job_fe5e88ca463341b7b901428175aa9ffe`.
Canonical source-only review: `release_d6623010f26145e59173f4843804da8b`.
Review files-map digest (not a package digest):
`0807ab240cbdde6f9f2c86ee6062e6730d39a090d8482458c05ed75a3b8459e2`.

No-op preserved the prepared native file byte-for-byte. The service candidate
changed gear level 62 to 61 and stack quantity 7 to 8. The actual Chrome form
changed the gear level to 60, retained quantity 8, saved the shared draft,
opened host review, prepared a candidate and downloaded it with the unchanged
sibling. The key was absent from output listings and downloads.

Browser download SHA-256:
`749f640d0d76f32e9a72fbdee14c92507b6077cb8ee1024821697a2b5f6afdb5`.
Anvil/Python independently decoded all 61 contexts: 60 were identical; context
12 had exactly the two intended scalar-byte changes. Integrity fields,
non-context framing and sibling preservation passed. No assertion depends only
on the new serializer validating its own output.

Final runtime phases stayed within unchanged default limits: browser phases
4,976 / 8,236 / 7,874 / 4,958 ms; peak 61,734,912 bytes. Two earlier CPU-limit
failures were resolved by removing duplicate parsing/copying, not raising
budgets. The complete public suite passed 446/446. An initial suite run had a
Windows UNKNOWN file-read error in an installed dependency; the focused MCP
test and complete rerun passed without source changes. Release-audit tests:
9 passed, 1 skipped (Windows symlink privilege unavailable); GNU tar required.

Private receipts/state remain outside source in the parent project's
`outputs/saverift-ac-native-2026-11-03/`; browser receipts/screenshots in
`outputs/saverift-ac-integration-2026-11-03/evidence/`. The review package in
`outputs/saverift-ac-review-2026-11-03/` contains source and redacted evidence,
not private fixtures, transform keys or credentials.

## Explicit boundaries and next integration steps

Untouched Oodle-compressed progression contexts reject with
`AC_OODLE_REQUIRED`. A verified local preparation plus a private transform key
is required. Other native versions and Xbox saves are unsupported. Player
level/XP/mastery, engraving changes and item additions are not implemented.

Hosted AC execution/enrollment/Git collaboration: `not_run` (the connected
registry exposes Crimson and synthetic projects only; connector transport is
synthetic-fixture-only). Local branch/diff and release review are ready. No Git
commit/DCO identity was fabricated; no hosted grant or production pin changed.
Actual in-game load/save/reload and recovery: `not_run`. The deferred
two-real-contributor test remains deferred. No publication, registry promotion,
production switch or Xbox write occurred.

Next: a maintainer reviews the source/diff and inactive AC registration
proposal, then supplies an AC-specific hosted project/fixture admission and
verified Git identity if hosted collaboration is desired. Independently test
game acceptance/recovery before advertising playable save output. Do not
replace these missing checks with earlier AC research results.

## Publication follow-up

The user subsequently requested the exact developer publication/submission
workflow. The connected GitHub account was verified as a repository writer.
Issue #11 was opened in the public `SaveRift/SaveRift-Ecosystem` repository.
The branch was fast-forwarded to current main
`efa95e9ec2ed2b9fa8d6ded475b2705e2db1cc0a`, preserving its two README updates.
The tested plugin source/runtime/UI and package digests remain unchanged.

Fixture-free review evidence is checked in under `docs/ac-shadows-review/`.
Submission uses an authenticated, DCO-signed Git contribution and draft PR;
the earlier absence of local Git identity is resolved by the connected account.
Hosted game enrollment remains unavailable and is not bypassed. The final
commit, PR URL and CI results are recorded in the external publication receipt.
This source submission does not promote a registry or switch production.
