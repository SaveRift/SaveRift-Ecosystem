# Optional hosted isolated phases

Local `createIsolatedExecutor()` retains its complete inspection, operation
compilation, validation and independent reopen pipeline. The default remains
10 seconds per fresh engine and 60 seconds for the complete job, with shared
100,000 interrupts, 4,096 host calls, 24 MiB output and 32 output artifacts.

A hosted adapter may explicitly opt in to `resumableJobs: true` when constructing
`createWorkspaceService`. `tests_run`, `candidate_prepare`, and authenticated
`job_status` each await at most one new fresh isolated engine before their HTTP
response. They do not place the complete multi-engine job in post-response
`waitUntil` work. Source packaging keeps its existing short background path.

Continuation state is stored separately through the host's encrypted private
store. It includes intermediate private bytes; it must never be published,
logged, passed to a model or returned in job status. The job stores only a
checkpoint digest. Each continuation binds the immutable package/dependency
lock, selected fixture content, operations, execution profile, catalogs, job,
workspace evidence epoch and captured enrollment grants. Model-origin jobs also
pin fixture authorization revisions, so revocation followed by renewed consent
does not revive an old continuation.

One CAS lease permits one phase. The default lease is 45 seconds. An expired or
unknown in-progress phase becomes `JOB_PHASE_INTERRUPTED`; a new job is required.
Completed engines are never automatically replayed. A canceled or revoked job
cannot start its next phase or retain late candidate bytes. A different request
cannot synchronously abort an engine already executing in another isolate;
that engine remains subject to its interrupt and host/platform limits, and its
result is discarded. Candidate download additionally requires job status
`passed`. Phase checkpoints have an additional 8 MiB serialized quota, including
at most 2 MiB non-artifact control state; unsupported larger jobs fail explicitly.

## Reviewed large-save staging profile

The host-only `createReviewedLargeSaveProfile({packageDigest})` factory in
`ecosystem/sdk/execution-profiles.mjs` creates an opaque in-memory capability for
`developer-large-save-v1`: 30 seconds per primary engine and 90 seconds for the
whole job. Its use is limited to an independently reviewed immutable artifact
whose digest is recomputed by the runner. The trusted host selects the capability
through `createIsolatedExecutor({executionProfileFor})`; it is not an option in
manifests, tool inputs, serialized checkpoints, user UI or MCP. Serialized copies,
fake tokens and different package digests are rejected. Extensions retain the
default 10-second engine ceiling. Every other resource ceiling remains unchanged,
and explicit limits remain reduce-only within the selected fixed profile.

A host must pin only the reviewed package digest; package ID or version alone is
insufficient. A new artifact needs fresh review and a fresh digest pin. This
profile does not approve a release, registry promotion, production cutover or
Xbox publication.

The whole-job deadline includes storage/network work and pauses between polls.
A pause that exceeds the deadline requires a new job. Hosts must test this on the
actual target platform: some Worker clocks advance only with I/O, so JavaScript
wall-clock checks alone are not proof of a CPU deadline. The shared interrupt
ceiling and platform CPU/memory controls remain mandatory. Local timing and
self-reopen results do not establish hosted execution or in-game acceptance.

## Deployment-owned reference packages

An optional trusted-host `resolveReferenceData` callback may attach an exact
data package to a verified executable closure. The callback receives the primary
pin, every extension pin and the base execution-lock digest, and its result must
echo that exact digest as `baseExecutionLockDigest` alongside `primaryDigest`.
Changing an extension or base catalog therefore requires a new host approval.
The host must approve every executable that can read the selected data; primary
identity alone is insufficient. The callback is disabled by default
and has no browser/MCP argument or consent-grant capability. The host remains
responsible for permitted use and exact package selection; package metadata
never grants access.

Every resource is checked against its package's byte/hash manifest. The data
package enters the execution lock, and its read-only handles enter the same
bundle used by the source-bound draft, full/resumed runner and preview. A
changed package invalidates an existing job/preview lock. Resource lookup
requires the exact resource method, identifier and selected artifact handle.

Managed bytes remain outside workspace source, fixture records and exports.
They do not consume a player's fixture slots or change that fixture's AI
consent. Existing package, input, engine and job limits still apply. Managed
handles, roles and exact resource-byte copies cannot be returned as candidate
saves/downloads. Source, account grants and player-fixture consent are checked
independently, including after asynchronous host resolution.

Those output guards prevent accidental artifact mixing; they are not data-loss
prevention. Approved connector/extension code can read selected reference bytes
and may return reference values in bounded queries or derived output. Permitted
use, confidentiality and complete-closure approval remain host responsibilities.
Completed candidates retain their validated historical provider pin. A later
provider change invalidates pending jobs/previews but does not erase an already
passed candidate download or backup; publication/revocation checks are separate.
