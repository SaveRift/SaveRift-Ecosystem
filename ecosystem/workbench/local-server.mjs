#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createLocalWorkbench} from './local.mjs';
import {createWorkbenchRouter} from './router.mjs';
import {createDeveloperMcpHandler} from './mcp.mjs';

const port = Number(process.env.SAVERIFT_WORKBENCH_PORT || 4174);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error('Choose an unprivileged workbench port.');
const origin = `http://127.0.0.1:${port}`, {service, principal} = await createLocalWorkbench();
const authenticate = async () => principal;
const options = {service, authenticate, allowedHosts: [`127.0.0.1:${port}`], allowedOrigins: [origin]};
const router = createWorkbenchRouter(options), mcp = createDeveloperMcpHandler(options);
const assets = new Map([
  ['/', new URL('./index.html', import.meta.url)], ['/developer', new URL('./index.html', import.meta.url)],
  ['/developer-assets/workbench/browser.mjs', new URL('./browser.mjs', import.meta.url)], ['/developer-assets/workbench/browser.css', new URL('./browser.css', import.meta.url)],
  ['/developer-assets/ui/vanilla-frame.mjs', new URL('../ui/vanilla-frame.mjs', import.meta.url)], ['/developer-assets/ui/frame-document.mjs', new URL('../ui/frame-document.mjs', import.meta.url)],
  ['/developer-assets/sdk/ui-bridge.mjs', new URL('../sdk/ui-bridge.mjs', import.meta.url)], ['/developer-assets/ui/plugin-frame.css', new URL('../ui/plugin-frame.css', import.meta.url)]
]);
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, origin), headers = new Headers(); for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    const request = new Request(url, {method: incoming.method, headers, ...(!['GET', 'HEAD'].includes(incoming.method) ? {body: incoming, duplex: 'half'} : {})});
    let response;
    if (url.pathname === '/mcp') response = await mcp.fetch(request);
    else response = await router(request);
    if (!response && assets.has(url.pathname) && ['GET', 'HEAD'].includes(request.method)) {
      const file = assets.get(url.pathname), path = fileURLToPath(file), content = await readFile(file);
      response = new Response(request.method === 'HEAD' ? null : content, {headers: {'Content-Type': path.endsWith('.mjs') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}});
    }
    response ||= new Response('Not found', {status: 404}); outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) outgoing.write(chunk); outgoing.end();
  } catch { outgoing.writeHead(500, {'Content-Type': 'text/plain'}); outgoing.end('The local developer request failed.'); }
});
server.listen(port, '127.0.0.1', () => console.error(`SaveRift local developer workbench: ${origin}`));
