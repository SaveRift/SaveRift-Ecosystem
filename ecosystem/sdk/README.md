# SaveRift SDK reference runtime

This is a development package, not a public release or a claim of hosted Xbox
compatibility. It runs save-processing JavaScript inside a separate QuickJS
WebAssembly instance per session. It does not use Node `vm`, a worker thread, or
the host's `eval` as its security boundary. No Xbox or Microsoft sign-in code is
part of this package.

## Run the conformance tests

```sh
npm ci --prefix ecosystem/sdk --ignore-scripts
npm test --prefix ecosystem/sdk
```

Tested locally on Node 24.22.1, Linux x64, with QuickJS/Emscripten packages 0.32.0
and workerd 1.20261102.1. The workerd test actually builds a Worker, attaches the
fixed Wasm module, starts it on loopback, and verifies guest isolation and limits.
It does not contact Microsoft, Xbox, or any player account.

## Runtime contract

`contracts.mjs` validates immutable package files, minimal save-bundle metadata,
operations, JSON envelopes and content digests. A package is `{manifest, files}`;
`files` is a plain object or `Map` of logical paths to UTF-8 strings/`Uint8Array`.
The package digest hashes the canonical manifest plus path-sorted file lengths
and SHA-256 hashes. The runtime never resolves a semver range or downloads code.
Data/assets/preset/UI-only packages do not require a runtime entrypoint and
cannot be executed by this runner.

Operation parameters use the [bounded schema interpreter](./SCHEMA.md), resolved
from the exact pinned package. Unsupported schema constraints fail closed.

An executable package's entrypoint exports a default connector with the
`detect`, `open`, `describe`, `query`, `plan`, `validate`, `close` lifecycle.
Additional namespaced methods, such as an extension's `expand`, are explicitly
listed in `manifest.methods`. Runtime profile `isolated-js-v1` means the concrete
QuickJS Wasm implementation here, not permission to substitute Node `vm`.

`createExecutionLock(package)` makes a standalone exact single-package lock.
The hosted registry supplies its complete connector/extension/data lock instead.
`createPluginSession({package,bundle,artifacts,executionLock,limits,signal})`
returns `call(method,args)`, `artifacts()`, `metrics()`, and `close()`. Each call
appends the bounded context as its last argument. Document handles remain opaque
inside that session. `runPlugin({...options,method,args})` is the one-call helper
and always disposes the session. Its result is `{result,artifacts,metrics,
executionLock}`; `artifacts` is an output-only binary `Map`.

The context exposes:

- `readArtifact(id,{offset,length})`: only selected inputs or this session's outputs.
- `writeArtifact({logicalPath,role},Uint8Array)`: returns a hashed artifact descriptor.
- `randomBytes(length)`: secure host randomness, 1–64 bytes per request.
- `reportProgress({phase,completed,total})`, `checkCancelled()`, `clock()`.
- `catalogQuery(query)`: an optional trusted, digest-pinned offline catalog service.
- Immutable-by-copy input bundle and execution-lock metadata, never cloud revisions.

Raw files travel through the binary channel, not multi-megabyte JSON/base64.
The context has no publication, lock, account, environment, filesystem, network,
shell, token, URL or database API. A candidate is evidence for the trusted host;
the plugin cannot authorize a write or approve its own entitlement assertions.

## Bounds and cancellation

Default ceilings are 64 MiB Wasm linear memory, 48 MiB QuickJS heap, 256 KiB guest
stack, 8 MiB per input/output artifact, 24 MiB total input/output bytes, 256 KiB
JSON, 32 outputs, 4,096 host calls, 10,000 promise jobs and 100,000 interpreter
interrupt ticks. Calls may only reduce ceilings. Module source and expanded
package sizes are separately bounded. Inputs, output metadata, source and locks
are verified before the guest receives them. Guest module imports are restricted
to relative packaged JavaScript; native, bare, network and escaped imports fail.

An interpreter interrupt checks cancellation and budget during execution.
Cancellation is observed before calls and at callbacks/interrupts; it is not
an OS-level preemption promise. JavaScript cannot deliver a queued AbortSignal
event while a synchronous interpreter call owns the thread. A host must cancel
the enclosing job/isolate for immediate preemption. A 10-second host deadline
also applies where the host clock advances. Workers freeze `Date.now()` during
synchronous execution, so instruction ticks, memory limits and the enclosing
Worker CPU quota are the applicable bounds there. Pending promises that require
unavailable ambient I/O fail rather than keeping a session alive indefinitely.
The runner tracks every context created through QuickJS's public context factory,
including secondary contexts made by library callbacks, and disposes all of them
before freeing the runtime. This prevents the observed full-provider teardown
assertion; the regression exercises an actual secondary QuickJS system context.

The host should enforce one active job per isolated execution allocation,
account-scoped admission/rate/retention quotas, and no production secrets in the
build worker. Runtime isolation is one boundary; it is not a blanket claim that
review, supply-chain controls, or host transaction validation are unnecessary.

## Worker integration

`worker-runner.mjs` imports a fixed reviewed Wasm module statically. The trusted
`build-worker.mjs` uses `workerd`/browser export conditions, bundles host glue,
and writes `index.js`, `quickjs.wasm`, and a local `config.capnp`. It never runs
author package scripts. Example:

```sh
node ecosystem/sdk/build-worker.mjs ecosystem/sdk/test/worker-probe.mjs /tmp/saverift-worker
ecosystem/sdk/node_modules/.bin/workerd serve /tmp/saverift-worker/config.capnp
```

The same fixed script and attached Wasm module were deployed to a separate
owner-private Sites developer preview, version 1. The live probe returned the
expected absent ambient APIs and secure randomness; CPU and memory probes
returned `CPU_LIMIT` and `MEMORY_LIMIT`. Anonymous and forged-header requests
were rejected by the host access gate. This establishes static Wasm attachment
for that private deployment, independently of the local workerd test. Production
SaveRift transport was not changed. Full developer workspace/MCP and Crimson
parity remain separate verification gates; this probe does not establish them.

## Portable format helpers

`buffer.mjs` exports the browser Buffer implementation. `crypto.mjs` supplies
SHA-256, incremental SHA-256 and HMAC-SHA256 plus a deliberately narrow
`formatCrypto` adapter. In the isolated runner, fixed SHA-256 math may use a
bounded host primitive; HMAC construction, parsing and format decisions remain
in QuickJS. Format HMAC keys are public format knowledge. The primitive has no
account keys, account signer, ambient I/O or caller-selected algorithm/encoding,
and cannot sign Xbox requests.

Each fresh engine permits at most eight active hash streams and 128 MiB of
hashed input. Binary chunks and ASCII text contain at most 64 KiB; non-ASCII BMP
text is limited to 16 Ki UTF-16 units. Primitive type, intrinsic length and fixed
character checks run before host materialization. NUL, BOM and surrogate chunks
use the existing binary path, preserving exact UTF-8 and separate-update
semantics. Every init/update/final/abort callback consumes the existing shared
4,096-call job budget and checks cancellation/deadlines before and after work.
This does not increase the default 10-second phase / 60-second job bounds; the
separate [reviewed artifact profile](../workbench/RESUMABLE_JOBS.md) remains
limited to 30 seconds / 90 seconds and requires a trusted exact-digest pin.

`text-encoding.mjs` provides UTF-8 encoding and fatal decoding for the extracted
parser. Bundle these helpers and all executable dependencies into a release,
not remote runtime imports.

Dependencies are exact-pinned in the adjacent lockfile. QuickJS/Emscripten,
Noble hashes, Buffer, and their transitive notices must accompany distributed
artifacts. No source, player fixture or public release has been authorized by
the existence of this reference runner.
