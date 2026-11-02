# Prepare a release for review

The canonical ecosystem repository is
[`SaveRift/SaveRift-Ecosystem`](https://github.com/SaveRift/SaveRift-Ecosystem).
It is private; source on a review branch is not a public release. Keep the
release audience explicit. Do not change the private application repository's
visibility or copy its history into the ecosystem repository.

Prepare source-only candidates from an explicit file allowlist. The local
audit tool never contacts GitHub or Xbox:

```sh
node scripts/ecosystem-release-audit.mjs --discover --plan /tmp/export-plan.json
```

Discovery creates **pending**, unlicensed review entries, not automatic
approval. A reviewer must classify each file's exact SHA-256, license, origin
and rights (`original`, `licensed-code`, `synthetic`, `import-recipe`), then set
`review` to `approved-local-candidate`. No public approval is implied. Paths,
private modules, credential patterns, held data, changed hashes and omitted
local imports fail closed. Findings report locations/rules without secret
values. A scanner is a check alongside human rights/privacy inspection.

```sh
node scripts/ecosystem-release-audit.mjs --plan /tmp/export-plan.json --report /tmp/audit.json
node scripts/ecosystem-release-audit.mjs --plan /tmp/export-plan.json --stage /tmp/saverift-candidate --archive
```

Staging requires a fresh directory outside the source repository. It copies
only reviewed files, no Git history, and adds `SHA256SUMS`/`EXPORT-REVIEW.json`.
The archive has normalized times/owners. Source hashes are rechecked during
copy. Run clean installs/tests inside the staged tree, generate per-package
SBOM/notices from actual dependencies and inspect final files/archives again.
Do not call builds reproducible until a second clean build matches the
appropriate deterministic payloads.

Audit/staging require Node.js. Deterministic archive creation additionally
uses **GNU tar**, verified in the Linux release environment; archive creation
has not been tested against macOS BSD tar or native Windows tooling. This
limitation does not affect the local SDK/workbench's file-in/file-out flow.

Required review assets: source revision, package artifact/manifest/lock,
SHA-256 sums, full notices, dependency inventory/SBOM, test/conformance report,
missing-fixture/format limits, independent semantic evidence, compatibility
matrix and exact registry metadata. Data/art/template permission is separate
from code licensing; absent rights remain a blocker even if tests pass.

After review of the exact source, artifacts, contents and intended audience,
maintainers can prepare a draft prerelease in the approved ecosystem
repository. Keep its current private audience unless the owner explicitly
approves a change. Publication and registry promotion are separate approved
steps. Verify real immutable-release settings before claiming immutability.
Attestations prove provenance, not game acceptance.
Use protected trusted release jobs; PR checks receive no production secrets,
player fixtures or write privileges. Never use privileged untrusted checkout
through `pull_request_target`.
