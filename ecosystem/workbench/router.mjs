// SPDX-License-Identifier: Apache-2.0
import {Buffer} from 'node:buffer';
import {LIMITS} from './service.mjs';
import {fail} from './storage.mjs';
const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
async function limitedBytes(request, limit) {
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const chunks = []; let length = 0;
  try { for (;;) { const {done, value} = await reader.read(); if (done) break; length += value.length; if (length > limit) { await reader.cancel(); fail('REQUEST_TOO_LARGE', 'This developer request exceeds its limit.', 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const data = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; } return data;
}
const validId = value => /^[a-z][a-z0-9_-]{7,79}$/.test(value || '');

export function createWorkbenchRouter({service, authenticate, allowedHosts, allowedOrigins = [], basePath = '/api/developer'}) {
  if (!service || typeof authenticate !== 'function' || !allowedHosts?.length) throw Error('A workspace service and verified identity adapter are required.');
  return async function route(request) {
    const url = new URL(request.url), origin = request.headers.get('origin');
    if (!url.pathname.startsWith(`${basePath}/`)) return null;
    if (!allowedHosts.includes(url.host) || request.method !== 'GET' && (!origin || !allowedOrigins.includes(origin)) || request.headers.get('sec-fetch-site') === 'cross-site') return json({code: 'DEVELOPER_ORIGIN_REJECTED', error: 'Use the trusted developer workbench.'}, 403);
    try {
      const principal = await authenticate(request); if (!principal) fail('DEVELOPER_SIGN_IN_REQUIRED', 'Sign in to the developer workbench.', 401);
      const path = url.pathname.slice(basePath.length);
      if (path === '/status' && request.method === 'GET') return json({authenticated: true, developer: true, xboxRequired: false, scopes: principal.scopes, tools: service.tools(principal).map(t => ({name: t.name, description: t.description}))});
      if (path === '/call' && request.method === 'POST') {
        let body; try { body = JSON.parse(new TextDecoder().decode(await limitedBytes(request, 2 * 1024 * 1024))); } catch (e) { if (e.code) throw e; fail('INPUT_INVALID', 'Expected a JSON developer request.'); }
        return json(await service.dispatch(principal, body.name, body.arguments, {channel: 'trusted-ui'}));
      }
      const parts = path.split('/').filter(Boolean);
      if (parts[0] === 'uploads' && parts.length === 2 && validId(parts[1]) && request.method === 'POST') return json({status: 'passed', fixture: await service.trustedUploadFixture(principal, parts[1], await limitedBytes(request, LIMITS.fixtureBytes))});
      if (parts[0] === 'fixtures' && validId(parts[1]) && parts[2] === 'consent' && request.method === 'POST') {
        const body = JSON.parse(new TextDecoder().decode(await limitedBytes(request, 2048)));
        if (!validId(body.workspaceId) || typeof body.aiAccess !== 'boolean') fail('INPUT_INVALID', 'An exact fixture consent choice is required.');
        return json({status: 'passed', fixture: await service.trustedSetFixtureConsent(principal, body.workspaceId, parts[1], body.aiAccess)});
      }
      if (parts[0] === 'fixtures' && validId(parts[1]) && request.method === 'DELETE') {
        if (!validId(url.searchParams.get('workspaceId'))) fail('INPUT_INVALID', 'An exact workspace is required.');
        return json(await service.trustedDeleteFixture(principal, url.searchParams.get('workspaceId'), parts[1]));
      }
      if (parts[0] === 'previews' && parts.length === 2 && validId(parts[1]) && request.method === 'GET') {
        const {preview, artifact} = await service.readPreview(principal, parts[1]);
        const uiFiles = Object.fromEntries(Object.entries(artifact.files).filter(([path]) => path.startsWith('ui/')));
        return json({preview, package: {manifest: artifact.manifest, files: uiFiles}, packageDigest: artifact.digest, artifactId: artifact.id});
      }
      if (parts[0] === 'previews' && validId(parts[1]) && parts[2] === 'query' && request.method === 'POST') {
        const body = JSON.parse(new TextDecoder().decode(await limitedBytes(request, 8192)));
        return json(await service.queryPreview(principal, parts[1], body.query, request.signal));
      }
      if (parts[0] === 'previews' && validId(parts[1]) && parts[2] === 'draft') {
        if (request.method === 'GET') return json({draft: await service.readPreviewDraft(principal, parts[1])});
        if (request.method === 'POST') {
          const body = JSON.parse(new TextDecoder().decode(await limitedBytes(request, 128 * 1024)));
          return json({draft: await service.editPreviewDraft(principal, parts[1], body)});
        }
      }
      if (parts[0] === 'releases' && validId(parts[1]) && request.method === 'GET') {
        const release = await service.downloadRelease(principal, parts[1]);
        return new Response(JSON.stringify(release, null, 2), {headers: {'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${release.id}-review.json"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
      }
      if (parts[0] === 'candidates' && validId(parts[1]) && request.method === 'GET') {
        const candidate = await service.downloadCandidate(principal, parts[1]);
        if (parts.length === 3) {
          const artifact = candidate.artifacts.find(a => a.id === parts[2]); if (!artifact) fail('OBJECT_NOT_FOUND', 'Candidate artifact unavailable.', 404);
          const bytes = Buffer.from(artifact.bytes, 'base64');
          return new Response(bytes, {headers: {'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length), 'Content-Disposition': `attachment; filename="${artifact.logicalPath.replaceAll(/[^a-zA-Z0-9_.-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
        }
        return json({artifacts: candidate.artifacts.map(({bytes, ...a}) => ({...a, downloadPath: `${basePath}/candidates/${parts[1]}/${a.id}`}))});
      }
      fail('DEVELOPER_ROUTE_NOT_FOUND', 'This developer operation is unavailable.', 404);
    } catch (error) { return json({status: 'failed', code: error.code || 'DEVELOPER_REQUEST_FAILED', error: error.code ? error.message : 'The developer request could not be completed.'}, error.status || 400); }
  };
}
