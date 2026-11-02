// SPDX-License-Identifier: Apache-2.0
// Shared operation names. The browser and MCP route these to the same service.
const target = {gameId: 'string'};
const workspace = {...target, workspaceId: 'string'};
const mutate = {...workspace, expectedRevision: 'integer', expectedGitHead: 'sha40'};
const work = {...target, discoveryId: 'string', issueNumber: 'integer', featureKey: 'string', expectedRevision: 'integer'};
export const COLLABORATION_ACTION_ARGUMENTS = Object.freeze({
  project_discover: target,
  project_reconcile: target,
  discovery_verify: {...target, discoveryId: 'string'},
  work_claim: work, work_join: work, work_release: work,
  work_publish_prepare: work,
  work_publish: {...work, reviewId: 'string'},
  work_publish_reconcile: work,
  issue_propose: {...target, discoveryId: 'string', title: 'string', summary: 'string', featureKey: 'string', expectedRevision: 'integer'},
  issue_submit: {...target, discoveryId: 'string', proposalId: 'string', expectedRevision: 'integer'},
  branch_workspace_create: {...work, expectedGitHead: 'sha40'},
  branch_workspace_status: workspace, branch_workspace_read: workspace, branch_workspace_diff: workspace,
  branch_workspace_verify: mutate,
  branch_workspace_patch: {...mutate, changes: 'sourceChanges'},
  branch_workspace_export: workspace,
  checkpoint_prepare: mutate,
  checkpoint_commit: {...mutate, reviewId: 'string'},
  workspace_update_upstream: mutate,
  branch_workspace_reconcile: mutate,
  pr_prepare: mutate,
  pr_open: {...mutate, reviewId: 'string'}
});
export const COLLABORATION_ACTIONS = Object.freeze(Object.keys(COLLABORATION_ACTION_ARGUMENTS));
