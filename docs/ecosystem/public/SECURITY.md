# Security and privacy

This is a developer source preview, not an independent security audit or
guarantee of valid game edits. Do not include Microsoft credentials, account
cookies, device private keys, live saves or production environment variables
in plugin packages or builds. A library returning an Xbox token is unrelated
to the permission a plugin receives.

The runner and custom UI expose only selected artifacts and narrow typed
methods. Limits, CSP/opaque origin, account/object bindings, cancellation and
final host policy are defenses that must be tested together. A sandbox label
or iframe alone is not a confidentiality proof. Content from a save/catalog
cannot grant tool scopes or authorize a release or live write.

Keep suspected exposures private. An approved private vulnerability-report
destination is pending maintainer/repository setup; do not create a public
issue containing exploit payloads, tokens or player files. The hosted
application's existing Issues & Feedback path can report a summary without
secrets. Remove/rotate exposed credentials using the responsible service;
deleting a committed secret alone does not remediate exposure.

No external publication or live Xbox operation is performed by release-audit
tooling. The host must independently validate candidate effects, entitlement
scope, revision/backup/approval/one-use transaction bindings and recovery.
