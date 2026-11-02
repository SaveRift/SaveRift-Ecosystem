// SPDX-License-Identifier: Apache-2.0
// Private deployment supplies its identity, encryption and statically compiled
// runtime. This portable entry imports no Microsoft account or cloud publisher.
import {createWorkspaceService} from './service.mjs';
import {createWorkbenchRouter} from './router.mjs';
import {createDeveloperMcpHandler} from './mcp.mjs';
import {createGameAccess} from '../collaboration/enrollment.mjs';
import {createCollaborationService} from '../collaboration/service.mjs';
import {DEFAULT_GAME_PROJECTS} from '../collaboration/projects.mjs';
import {createGithubRouter} from '../collaboration/github-router.mjs';

export function createDeveloperWorker({authenticate, createStore, executeJob, templates, allowedHosts, allowedOrigins, assetFetch, projects = DEFAULT_GAME_PROJECTS, createGitAdapter, createGithubIdentity, externalMutationsEnabled = false, reviewSource, hostCapabilities, resumableJobs = false, resolveReferenceData}) {
  if (typeof authenticate !== 'function' || typeof createStore !== 'function' || typeof assetFetch !== 'function') throw Error('Trusted deployment adapters are required.');
  return {
    async fetch(request, env, ctx) {
      const store = await createStore(env);
      const access = createGameAccess({store, projects});
      const identity = typeof createGithubIdentity === 'function' ? await createGithubIdentity(env, {access}) : null;
      const git = typeof createGitAdapter === 'function' ? await createGitAdapter(env, {access, identity}) : null;
      const collaboration = createCollaborationService({store, access, git, externalMutationsEnabled, reviewSource});
      const service = createWorkspaceService({store, access, collaboration, executeJob, templates, hostCapabilities, resumableJobs, resolveReferenceData, schedule: promise => ctx.waitUntil(promise)});
      const options = {service, authenticate: req => authenticate(req, env), allowedHosts, allowedOrigins};
      const url = new URL(request.url);
      if (url.pathname === '/mcp') return createDeveloperMcpHandler(options).fetch(request);
      const githubResponse = await createGithubRouter({...options, identity})(request);
      if (githubResponse) return githubResponse;
      const response = await createWorkbenchRouter(options)(request);
      if (response) return response;
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Not found', {status: 404});
      return assetFetch(request, env, ctx);
    }
  };
}
