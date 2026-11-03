# AC Shadows contribution evidence

This directory contains fixture-free evidence for issue #11 and the initial
`saverift.ac-shadows` contribution. Private save bytes, keys, credentials,
workbench state and screenshots are excluded. Input/output hashes and local
opaque job identifiers bind the reports without exposing fixture contents.

The implementation was tested on full public source
`09c92ff35097160528a669d753724b3a36c24059`. Before submission it was fast-forwarded
to `efa95e9ec2ed2b9fa8d6ded475b2705e2db1cc0a`; the intervening upstream changes
touch only the repository and ecosystem READMEs. The AC runtime/UI and exact
tested package/lock are unchanged. Publication adds this evidence directory,
updates the durable checkpoint and includes the evidence in export discovery.

`IMPLEMENTATION_REPORT.md` records the completed local review stage; its
not-published/not-committed statements describe that earlier checkpoint. This
submission follows the user's subsequent explicit publication request. The
current Git commit/PR and CI are the authoritative submission state.

The canonical compiled package digest is
`a41b1d17233b8130fe6b62c972dac74e45f1db56f5bccabad4f2350ab37b033a`.
The editable-source package actually executed has digest
`495c32b2d17c941a44ae0f7d744a29fa23a22557f706d69982cc0e95ff3e36da`.
The complete original canonical source-only review is included so its files-map
digest can be recomputed; it is not a hosted registry entry or verified badge.

Hosted AC execution/enrollment and game acceptance/recovery remain `not_run`.
The private developer service currently lists Crimson and synthetic projects
only. This is an ordinary authenticated GitHub submission, not an attempt to
reuse either project's grants. No production selection, registry promotion or
Xbox operation is part of this contribution. The two-contributor test remains
deferred.
