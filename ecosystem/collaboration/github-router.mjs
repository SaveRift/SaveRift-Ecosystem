// SPDX-License-Identifier: Apache-2.0
// Optional hosted identity seam. No GitHub credential enters browser/MCP JSON.
import { parseSchemaJson } from "../sdk/schema.mjs";
import { githubFail } from "./github-provider.mjs";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const json = (value, status = 200) => Response.json(value, { status, headers });
async function input(request, keys) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) githubFail("GITHUB_INPUT_INVALID", "Expected a JSON request.", 400);
  const reader = request.body?.getReader(), chunks = [];
  let length = 0;
  if (!reader) githubFail("GITHUB_INPUT_INVALID", "Expected a JSON request.", 400);
  try {
    for (; ; ) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 2048) {
        await reader.cancel();
        githubFail("GITHUB_INPUT_LIMIT", "This GitHub identity request exceeds its limit.", 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value;
  try {
    value = parseSchemaJson(all);
  } catch {
    githubFail("GITHUB_INPUT_INVALID", "Expected unique, bounded JSON fields.", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) githubFail("GITHUB_INPUT_INVALID", "Unexpected GitHub identity fields.", 400);
  return value;
}
function scope(actor, required) {
  if (!actor || typeof actor.id !== "string" || !actor.id || actor.id.length > 300 || !Array.isArray(actor.scopes) || !actor.scopes.includes(required)) githubFail("GITHUB_ROUTE_SCOPE_DENIED", "This developer session does not permit the GitHub identity operation.", 403);
}
function createGithubRouter({ identity = null, authenticate, allowedHosts, allowedOrigins = [], basePath = "/api/developer/github" } = {}) {
  if (typeof authenticate !== "function" || !Array.isArray(allowedHosts) || !allowedHosts.length || typeof basePath !== "string" || !/^\/[a-z0-9/-]+$/i.test(basePath) || basePath.endsWith("/")) throw Error("A trusted identity adapter and exact hosted route are required.");
  return async function route(request) {
    const url = new URL(request.url);
    if (url.pathname !== basePath && !url.pathname.startsWith(basePath + "/")) return null;
    const path = url.pathname.slice(basePath.length), callback = path === "/callback" && request.method === "GET", origin = request.headers.get("origin");
    if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.includes(url.host) || !callback && (request.headers.get("sec-fetch-site") === "cross-site" || origin && !allowedOrigins.includes(origin) || request.method !== "GET" && (!origin || !allowedOrigins.includes(origin)))) return json({ status: "failed", code: "GITHUB_ROUTE_ORIGIN_REJECTED", error: "Use the trusted developer workbench." }, 403);
    try {
      const actor = await authenticate(request);
      if (!actor) githubFail("DEVELOPER_SIGN_IN_REQUIRED", "Sign in to the developer workbench.", 401);
      scope(actor, path === "/identity" ? "git:commit" : "git:read");
      if (path === "/status" && request.method === "GET") return json(identity ? await identity.status({ actor }) : { configured: false, linked: false, githubUser: null, commitIdentityReady: false });
      if (!["/begin", "/identity", "/unlink", "/callback"].includes(path)) githubFail("GITHUB_ROUTE_NOT_FOUND", "This GitHub identity route is unavailable.", 404);
      if (path === "/callback" && request.method !== "GET" || path !== "/callback" && request.method !== "POST") githubFail("GITHUB_ROUTE_METHOD_REJECTED", "This GitHub identity method is unavailable.", 405);
      if (!identity) githubFail("GITHUB_APP_NOT_CONFIGURED", "A SaveRift GitHub App and callback have not been configured.", 503);
      if (path === "/begin") {
        await input(request, []);
        return json(await identity.begin({ actor, origin }));
      }
      if (path === "/identity") {
        const body = await input(request, ["email"]);
        if (typeof body.email !== "string" || !body.email || body.email.length > 254) githubFail("GITHUB_INPUT_INVALID", "Choose a verified public commit email.", 400);
        return json(await identity.selectCommitIdentity({ actor, origin, email: body.email }));
      }
      if (path === "/unlink") {
        await input(request, []);
        return json(await identity.unlink({ actor, origin }));
      }
      if (url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length !== 1 || url.searchParams.has("error")) githubFail("GITHUB_CALLBACK_REJECTED", "GitHub did not return an accepted authorization callback.", 400);
      await identity.complete({ actor, state: url.searchParams.get("state"), code: url.searchParams.get("code"), url: url.href });
      return new Response(null, { status: 303, headers: { ...headers, Location: new URL("/developer?github=linked", url.origin).href } });
    } catch (error) {
      const code = /^[A-Z0-9_]{1,100}$/.test(error?.code || "") ? error.code : "GITHUB_IDENTITY_FAILED", status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 400;
      return json({ status: "failed", code, error: code === "GITHUB_APP_NOT_CONFIGURED" ? "A SaveRift GitHub App and callback have not been configured." : "GitHub linking could not be completed." }, status);
    }
  };
}
export {
  createGithubRouter
};
