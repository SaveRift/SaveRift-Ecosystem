# AC Shadows hosted registration and collaboration review

The supplied public source has local template discovery, isolated execution,
custom UI, shared drafts, CLI/MCP, collaboration and source-only release review.
Its default collaboration registry contains only `crimson-desert` and `synthetic`,
with no configured repository transport. The local workbench does not attach
that optional hosted service: its actual `project_list` response is
`hostedEnrollment:false, projects:[], host:null`. This is an observed source limitation,
not a permission to reuse Crimson enrollment, fixture grants or source pins.
Local implementation/testing does not need a hosted enrollment or sign-in.

An AC entry can be added through the existing trusted project registry; it does
not require a game-specific host route. The following is a review template,
not active configuration. Replace null digest/base/repository only with reviewed
values, append it to existing projects, and preserve all existing entries:

```js
{
  id: 'ac-shadows',
  displayName: "Assassin's Creed Shadows",
  packageId: 'saverift.ac-shadows',
  packageRoots: ['ecosystem/plugins/ac-shadows/'],
  templateIds: ['plugin-saverift.ac-shadows'],
  license: 'Apache-2.0 AND MIT AND BSD-3-Clause',
  packageDigest: null, // replace with the exact reviewed immutable AC package
  baseCommit: null,    // replace with the actual reviewed Git source commit
  repository: null,   // resolve the real repo ID/branch through configured GitHub transport
  maintainers: [],
  capabilities: ['existing inventory inspection', 'bounded existing stack quantities', 'bounded existing equipment levels'],
  enrollmentOpen: false
}
```

Platform and save-family admission remain in the connector's manifest. No Xbox
title ID or PC/console interchangeability is asserted. If compressed native
files require an unavailable isolated codec, the host must report that exact
format boundary rather than selecting a Crimson private format provider.
Any reviewed AC execution profile is bound to an exact new digest; default
limits and existing Crimson capabilities remain unchanged.

Once the host is explicitly configured, follow the implemented tool schemas:
`saverift_project_list` → `saverift_project_discover` → reviewed enrollment/work
claim → `saverift_branch_workspace_create` → revision/head-bound patches →
`saverift_checkpoint_prepare` → reviewed `saverift_checkpoint_commit` →
`saverift_pr_prepare` → reviewed draft `saverift_pr_open`. GitHub repository
access and SaveRift project enrollment are independent. Do not synthesize actor
identity, issue numbers, grants or source heads. If the connection is absent,
record those steps `not_run` and provide the local diff/source review bundle.

The deferred two-real-contributor acceptance test remains deferred. Synthetic
collaboration tests and two agent names are not two human contributors. This
task neither changes production nor reopens Crimson's existing acceptance or
customer-recovery work.
