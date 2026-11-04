# AC Shadows domain API 0.1.0

Package `saverift.ac-shadows`; extension API `acshadows.inventory`.
Runtime `isolated-js-v1`. One primary serializer. No ambient network/filesystem,
native DLL, account transport, host-specific UI page or parallel application.

## Queries

- `acshadows.inspect`: format, source SHA256, counts, capabilities, limits.
- `acshadows.inventory.list`: `offset`, `limit` (1–50), `search` (at most 200
  characters). Returns bounded inventory records with exact IDs, owner, current
  values and eligible fields. Only the named query methods are accepted.

Source hashes refer to the selected **main artifact**, including the wrapper for
native files. A `recordId` is valid only for that source and must not be reused
after a game save reorders/recreates records. Private key material is never a
query value. Native field witnesses are evidence, not arbitrary-write controls.

## Operations

`acshadows.inventory.setLevel` parameters:

```json
{"recordId":"source-bound record returned by query","expectedLevel":62,"level":61,"sourceSha256":"64 lowercase hexadecimal characters"}
```

`acshadows.inventory.setQuantity` parameters:

```json
{"recordId":"source-bound record returned by query","expectedQuantity":20,"quantity":21,"sourceSha256":"64 lowercase hexadecimal characters"}
```

Both use `apiVersion: "0.1.0"`, ordered write domain `inventory`; max 16
operations per plan. Exact schemas are in `manifest.json`. Additional properties,
unknown operations, invalid source/record/precondition, read-only fields,
duplicate field writes and out-of-range values fail closed. The custom UI
replaces an existing draft edit for the same record/field while retaining others.

Draft changes use the SDK CAS revision and subscription APIs. Stale revisions
reject. The UI stages requests; the trusted host compiles the draft and validates
the source and execution lock before preparing a candidate. UI code cannot
approve a candidate or publish it.

## Binary inputs and outputs

Native: one `main` file, one private 16-byte `ac-key`, optional `sibling` files.
Context: one `progression` (or `main`) file, optional siblings. All use opaque
binary artifact handles. `ac-key` is an input-only role declared in the manifest;
it must be supplied again to reopen a native candidate and must never be offered
as a result download. Actual main logical path is retained.

Candidate metadata binds source bundle digest, execution lock and operation
digest. The change report names resolved field offsets/before/after values and
explicitly reports `gameAcceptance: "not_run"`. The candidate validator checks
emitted binary artifacts, not only the in-memory planning buffer. Fresh-engine
reopen is a separate workbench phase. Context output never claims native-game
file status.

## Resources and unsupported inputs

Use default runner limits. Unknown native versions or non-stored target blocks
fail; a package must not inherit a Crimson trusted profile. No automated
production/registry action is part of this API. Optional local preparation is a
source utility, not a callable sandbox escape or new host primitive.
