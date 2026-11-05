# SaveRift-Ecosystem

Public plugin contracts, isolated execution, a custom editor bridge and the
SaveRift developer workbench. Start with the [source guide](ecosystem/README.md).

Published immutable developer prereleases:

- [Developer preview — 2026-11-02](https://github.com/SaveRift/SaveRift-Ecosystem/releases/tag/developer-preview-2026-11-02)
- [Crimson Desert 0.1.0-dev.3](https://github.com/SaveRift/SaveRift-Ecosystem/releases/tag/crimson-desert-0.1.0-dev.3), including the editor form/staging and current-layout quantity fixes.

GitHub App connection, merged runtime work and version-specific hosted
no-op/scalar/mixed receipts are complete. The customer-facing editor still
uses the separate built-in path; release publication does not perform that
cutover or establish in-game acceptance. See [issue #5](https://github.com/SaveRift/SaveRift-Ecosystem/issues/5)
for the remaining Git-source binding migration, game/recovery, customer-download
and production-cutover gates. The released dev.3 browser journey and workbench
package-default reconciliation are complete. The two-human-contributor
acceptance test remains deferred by the owner.

The owner-private developer workbench's mobile/disclosure refinements are deployed
in v22. External tester access and attributed contributor acceptance remain separate.

The separate large original-download route has passed hosted capture, native
browser download and independent artifact checks for a synthetic 1 GiB
collection (eight 128 MiB files) and an authorized native save collection.
Public v113 unifies standard and larger originals under one Download original
action, with compact progress/ready feedback and native result links; see [issue #5](https://github.com/SaveRift/SaveRift-Ecosystem/issues/5).
Temporary copies have 24-hour access and a 2 GiB per-account allowance, with an
explicit Discard action; physical cleanup can lag expiry. An individual 1 GiB
file timed out safely incomplete, so the collection proof does not establish that
case. This route downloads originals only; existing editor and Send limits remain
unchanged.

The experimental [AC Shadows prepared-PC-v54 plugin](ecosystem/plugins/ac-shadows/README.md)
is merged in [PR #12](https://github.com/SaveRift/SaveRift-Ecosystem/pull/12).
Its local shared-UI, draft, isolated-processing, download and independent-comparison
milestone is complete. [Issue #13](https://github.com/SaveRift/SaveRift-Ecosystem/issues/13)
tracks stored-context game acceptance/recovery, integrated raw input, measured
hosted limits and a distinct hosted AC research project. Separate native Oodle
decoding research passed; that decoder is not integrated or distributed here.
Hosted readiness and Xbox/publisher-route compatibility remain unverified.
