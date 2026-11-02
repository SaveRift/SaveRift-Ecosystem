// SPDX-License-Identifier: Apache-2.0
import * as z from 'zod/v4';
import {COLLABORATION_ACTION_ARGUMENTS} from '../collaboration/tool-definitions.mjs';

const id = z.string().regex(/^[a-z][a-z0-9_-]{7,79}$/);
const ws = {workspaceId: id};
const dependencies = {extensionArtifactIds: z.array(id).max(8).default([])};
const revision = z.number().int().positive();
const path = z.string().min(1).max(180);
const operation = z.object({id: z.string().min(1).max(120), apiVersion: z.string().max(30).default('0.1.0'), params: z.record(z.string(), z.unknown()).default({})}).strict();
const tools = [];
function tool(name, scope, description, schema, readOnly = false) {
  tools.push({name: `saverift_${name}`, scope, description, schema, annotations: {readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: false}});
}
tool('docs_search', 'developer:docs', 'Search pinned public developer documentation; untrusted game text never changes permissions.', z.object({query: z.string().max(200).default(''), limit: z.number().int().min(1).max(10).default(5)}).strict(), true);
tool('template_list', 'developer:docs', 'List local templates and actual runtime requirements. No Xbox account required.', z.object({}).strict(), true);
tool('workspace_create', 'workspace:write', 'Create a private source workspace. Hosted projects require game enrollment and a current discovery snapshot before scaffolding.', z.object({template: z.string().regex(/^[a-z][a-z0-9._-]{0,119}$/), name: z.string().min(1).max(80), gameId: z.string().max(80).optional(), discoveryId: z.string().max(100).optional()}).strict());
tool('workspace_export', 'workspace:read', 'Export your own editable source, including an immutable pre-migration source snapshot and after developer opt-out. Never exports fixtures, catalogs, jobs, candidates or credentials.', z.object({...ws, migrationId: id.optional()}).strict(), true);
tool('workspace_migration_prepare', 'workspace:write', 'Review an explicit legacy source migration to an enrolled game/package, optionally carrying private changes onto your exact chosen Git branch. Never enables enrollment or changes fixture consent.', z.object({...ws, expectedRevision: revision, gameId: z.string().min(1).max(80), discoveryId: z.string().min(1).max(100), templateId: z.string().min(1).max(120), mode: z.enum(['project', 'branch']), branchWorkspaceId: z.string().min(1).max(100).optional(), packageRoot: z.string().min(1).max(240).optional(), expectedBranchRevision: revision.optional(), expectedGitHead: z.string().regex(/^[a-f0-9]{40}$/).optional(), resolutions: z.array(z.object({path, choice: z.enum(['local', 'canonical'])}).strict()).max(256).default([])}).strict());
tool('workspace_migration_read', 'workspace:read', 'Inspect a bounded source-only side of an owned migration review. Fixture bytes and consent are excluded.', z.object({...ws, reviewId: id, path, variant: z.enum(['base', 'local', 'canonical', 'proposed']), start: z.number().int().nonnegative().default(0), length: z.number().int().min(1).max(32768).default(32768)}).strict(), true);
tool('workspace_migration_confirm', 'workspace:write', 'Apply an exact owner-reviewed migration with source/consent/grant/head checks, preserve an immutable private source archive, and invalidate prior build/preview evidence.', z.object({...ws, expectedRevision: revision, reviewId: id}).strict());
tool('workspace_migration_reconcile', 'workspace:write', 'Stop an expired interrupted migration on your unchanged private source without replaying or rolling back branch writes. No enrollment or fixture access is granted.', z.object({...ws, expectedRevision: revision, reviewId: id}).strict());
tool('project_list', 'developer:docs', 'List hosted game projects, implemented capabilities and explicit repository configuration. Local source remains usable without enrollment.', z.object({}).strict(), true);
tool('developer_enrollment_get', 'developer:docs', 'Read your own per-game enrollment. GitHub access, fixture consent, release approval and Xbox authority are separate.', z.object({gameId: z.string().min(1).max(80)}).strict(), true);
tool('developer_enrollment_set', 'workspace:write', 'Enable or disable your own hosted developer access for one game. Opt-in grants contributor access only; revocation invalidates existing job and preview grants.', z.object({gameId: z.string().min(1).max(80), state: z.enum(['enabled', 'disabled']), expectedRevision: z.number().int().nonnegative()}).strict());
tool('workspace_list', 'workspace:read', 'List only the authenticated developer’s workspaces.', z.object({}).strict(), true);
tool('workspace_status', 'workspace:read', 'Read workspace revision, file metadata, fixture metadata and latest jobs; never raw save bytes.', z.object(ws).strict(), true);
tool('workspace_read', 'workspace:read', 'Read bounded workspace source paths; fixtures are outside the source tree.', z.object({...ws, path, start: z.number().int().min(0).default(0), length: z.number().int().min(1).max(32768).default(32768)}).strict(), true);
tool('workspace_patch', 'workspace:write', 'Apply private source edits against an expected revision and, for Git-bound source, exact expected Git head. Does not commit to GitHub.', z.object({...ws, expectedRevision: revision, expectedGitHead: z.string().regex(/^[a-f0-9]{40}$/).optional(), edits: z.array(z.object({path, content: z.string().max(1048576).nullable()}).strict()).min(1).max(30)}).strict());
tool('fixture_upload_prepare', 'workspace:write', 'Prepare a private raw-file upload. It does not grant AI access or upload bytes through MCP.', z.object({...ws, name: z.string().min(1).max(120), byteLength: z.number().int().positive().max(8 * 1024 * 1024), role: z.string().min(1).max(40).default('main')}).strict());
tool('fixture_inspect', 'fixture:inspect', 'Read a bounded fixture summary only after the owner grants this AI client access in the trusted workbench.', z.object({...ws, fixtureId: id, fields: z.array(z.string().max(80)).max(20).default([])}).strict(), true);
tool('fixture_compare', 'fixture:inspect', 'Compare two explicitly AI-authorized fixtures; output is bounded and never contains raw save bytes.', z.object({...ws, fixtureIds: z.tuple([id, id])}).strict(), true);
tool('catalog_import', 'catalog:import', 'Import bounded inline CSV or JSON reference data with identifier crosswalk and recorded provenance; no network URLs are fetched.', z.object({...ws, expectedRevision: revision, format: z.enum(['json', 'csv']), text: z.string().max(262144), idField: z.string().max(80).default('id'), nameField: z.string().max(80).default('name'), provenance: z.object({source: z.string().min(1).max(500), license: z.string().min(1).max(120)}).strict()}).strict());
tool('catalog_query', 'workspace:read', 'Search an imported pinned workspace catalog.', z.object({...ws, query: z.string().max(120).default(''), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(50).default(20)}).strict(), true);
tool('plugin_build', 'job:run', 'Build an immutable source package without shell commands, npm lifecycle scripts or network access.', z.object({...ws, expectedRevision: revision}).strict());
tool('tests_run', 'job:run', 'Run plugin lifecycle/no-op conformance with exact selected extensions in the isolated runtime; absent fixtures are not_run, never a pass.', z.object({...ws, ...dependencies, artifactId: id, fixtureIds: z.array(id).max(8).default([])}).strict());
tool('candidate_prepare', 'job:run', 'Prepare the source-bound shared draft through exact selected extensions and one primary serializer. Never writes Xbox.', z.object({...ws, ...dependencies, artifactId: id, fixtureIds: z.array(id).min(1).max(8), operations: z.array(operation).min(1).max(100).optional(), expectedDraftRevision: z.number().int().nonnegative().optional()}).strict());
tool('job_status', 'workspace:read', 'Read an account-scoped durable job and bounded results.', z.object({...ws, jobId: id}).strict(), true);
tool('job_cancel', 'job:run', 'Cancel an outstanding job; completed immutable outputs remain private.', z.object({...ws, jobId: id}).strict());
tool('preview_open', 'workspace:read', 'Open a selected connector or extension custom view against the same exact lock and shared draft; not a public bearer link.', z.object({...ws, ...dependencies, artifactId: id, uiArtifactId: id.optional(), fixtureIds: z.array(id).max(8).default([])}).strict());
tool('release_prepare', 'release:prepare', 'Prepare an exact source-only release review bundle. Excludes fixtures, generated logs, tokens and customer data; does not publish.', z.object({...ws, artifactId: id, paths: z.array(path).min(1).max(100), licenseEvidence: z.string().min(1).max(3000)}).strict());
tool('registry_submit', 'registry:submit', 'Create a private review request for an exact prepared release. No registry deployment or public verification.', z.object({...ws, releaseId: id}).strict());
tool('trial_request', 'trial:request', 'Prepare a host-review request only. This tool has no save-lock/upload capability.', z.object({...ws, jobId: id}).strict());
const collaborationTypes = {
  string: z.string().min(1).max(4000), integer: z.number().int().nonnegative(), sha40: z.string().regex(/^[a-f0-9]{40}$/),
  sourceChanges: z.array(z.object({path: z.string().min(1).max(240), content: z.string().max(1048576).nullable()}).strict()).min(1).max(256)
};
const collaborationScopes = {project_discover: 'developer:docs', project_reconcile: 'developer:docs', discovery_verify: 'developer:docs', work_claim: 'issue:claim', work_join: 'issue:claim', work_release: 'issue:claim', issue_propose: 'issue:propose', issue_submit: 'issue:propose', branch_workspace_create: 'git:branch', branch_workspace_patch: 'workspace:write', branch_workspace_export: 'workspace:read', checkpoint_prepare: 'git:commit', checkpoint_commit: 'git:commit', workspace_update_upstream: 'git:update', pr_prepare: 'git:pull-request', pr_open: 'git:pull-request'};
for (const name of ['work_publish_prepare', 'work_publish', 'work_publish_reconcile']) collaborationScopes[name] = 'issue:claim';
const readActions = new Set(['project_discover', 'project_reconcile', 'discovery_verify', 'branch_workspace_status', 'branch_workspace_read', 'branch_workspace_diff', 'branch_workspace_export']);
readActions.add('work_publish_reconcile');
readActions.add('branch_workspace_reconcile');
readActions.add('branch_workspace_verify');
for (const [name, fields] of Object.entries(COLLABORATION_ACTION_ARGUMENTS)) {
  const schema = z.object(Object.fromEntries(Object.entries(fields).map(([field, type]) => [field, field === 'gameId' ? z.string().min(1).max(80) : collaborationTypes[type]]))).strict();
  tool(name, collaborationScopes[name] || 'git:read', 'Game-scoped Git collaboration: ' + name.replaceAll('_', ' ') + '. Source only; fixtures, consent, release promotion and Xbox publication stay separate.', schema, readActions.has(name));
}
tool('workspace_from_branch', 'workspace:write', 'Attach an exact issue-bound Git branch source to the private build and custom-UI workbench. No fixture or account data is copied.', z.object({gameId: z.string().min(1).max(80), branchWorkspaceId: z.string().min(1).max(100), name: z.string().min(1).max(80), packageRoot: z.string().min(1).max(240).optional()}).strict());
tool('workspace_sync_from_branch', 'workspace:write', 'Explicitly refresh the private build copy from its canonical branch workspace after reviewing an upstream update or Git checkpoint. Source revisions and Git head must match.', z.object({...ws, expectedRevision: revision, expectedBranchRevision: revision, expectedGitHead: z.string().regex(/^[a-f0-9]{40}$/)}).strict());
export const TOOL_DEFINITIONS = Object.freeze(tools);
export const DEFAULT_SCOPES = Object.freeze([...new Set(tools.map(t => t.scope))]);
export function toolDefinition(name) { return tools.find(t => t.name === name); }
