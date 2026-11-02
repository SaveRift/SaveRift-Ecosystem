// SPDX-License-Identifier: Apache-2.0
// Signed events are reconciliation hints, never authority to grant access or overwrite source.
import { createHmac, createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { githubFail } from "./github-provider.mjs";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const events = /* @__PURE__ */ new Set(["push", "issues", "issue_comment", "pull_request", "pull_request_review", "check_run", "check_suite", "installation", "installation_repositories", "github_app_authorization", "repository"]);
const header = (headers, key) => headers instanceof Headers ? headers.get(key) : Object.entries(headers || {}).find(([name]) => name.toLowerCase() === key)?.[1];
function verifyGithubSignature({ rawBody, headers, secret, maxBytes = 1024 * 1024 }) {
  if (!(rawBody instanceof Uint8Array) || rawBody.byteLength > maxBytes) githubFail("GITHUB_WEBHOOK_LIMIT", "Webhook body exceeds the bounded endpoint.", 413);
  if (typeof secret !== "string" || secret.length < 16) githubFail("GITHUB_WEBHOOK_NOT_CONFIGURED", "A private webhook secret is required.", 503);
  const supplied = header(headers, "x-hub-signature-256");
  if (typeof supplied !== "string" || !/^sha256=[a-f0-9]{64}$/.test(supplied)) githubFail("GITHUB_WEBHOOK_SIGNATURE_INVALID", "The webhook signature is not valid.", 401);
  const actual = createHmac("sha256", secret).update(rawBody).digest(), received = Buffer.from(supplied.slice(7), "hex");
  if (received.length !== actual.length || !timingSafeEqual(actual, received)) githubFail("GITHUB_WEBHOOK_SIGNATURE_INVALID", "The webhook signature is not valid.", 401);
  return true;
}
function verifyGithubWebhook({ rawBody, headers, secret, maxBytes = 1024 * 1024 }) {
  verifyGithubSignature({ rawBody, headers, secret, maxBytes });
  const delivery = header(headers, "x-github-delivery"), event = header(headers, "x-github-event");
  if (typeof delivery !== "string" || !/^[a-f0-9-]{16,80}$/i.test(delivery) || typeof event !== "string") githubFail("GITHUB_WEBHOOK_HEADERS_INVALID");
  let payload;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    githubFail("GITHUB_WEBHOOK_JSON_INVALID");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) githubFail("GITHUB_WEBHOOK_JSON_INVALID");
  return { delivery, event, bodyDigest: digest(rawBody), handled: events.has(event), repositoryId: payload.repository?.id == null ? null : String(payload.repository.id), installationId: payload.installation?.id == null ? null : String(payload.installation.id), action: typeof payload.action === "string" ? payload.action.slice(0, 100) : null };
}
/** Durable store uses CAS. Queue records contain no raw issue/source/fixture text. */
function createGithubWebhookReceiver({ store, secret, reconcile, resolveRepository, now = Date.now, maxBytes = 1024 * 1024 } = {}) {
  if (!store || typeof reconcile !== "function" || typeof resolveRepository !== "function") throw Error("Private durable deduplication and trusted reconciliation adapters are required.");
  return Object.freeze({
    async accept({ rawBody, headers }) {
      const event = verifyGithubWebhook({ rawBody, headers, secret, maxBytes });
      if (!event.handled) return { accepted: true, ignored: true };
      const mapping = await resolveRepository(event);
      if (!mapping || event.repositoryId && String(mapping.id) !== event.repositoryId || event.installationId && String(mapping.installationId) !== event.installationId) githubFail("GITHUB_WEBHOOK_SCOPE_DENIED", "This signed event is outside the configured ecosystem repositories.", 403);
      const prefix = "github/webhooks/", deliveryKey = prefix + "delivery/" + digest(event.delivery), bodyKey = prefix + "body/" + event.bodyDigest;
      const known = await store.get(deliveryKey);
      if (known) {
        if (known.value.bodyDigest !== event.bodyDigest) githubFail("GITHUB_WEBHOOK_DELIVERY_CONFLICT");
        const queued = await store.get(prefix + "body/" + event.bodyDigest);
        return { accepted: true, duplicate: true, state: queued?.value.state || known.value.state };
      }
      const body = await store.get(bodyKey);
      if (body) {
        try {
          await store.put(deliveryKey, { state: "duplicate", bodyDigest: event.bodyDigest, receivedAt: now() }, { ifAbsent: true });
        } catch (error) {
          if (error.code !== "REVISION_CONFLICT") throw error;
        }
        return { accepted: true, duplicate: true, state: body.value.state };
      }
      const record = { schema: "saverift.github-webhook.v1", state: "pending", event: event.event, action: event.action, delivery: event.delivery, bodyDigest: event.bodyDigest, repositoryId: String(mapping.id), installationId: String(mapping.installationId), receivedAt: now() };
      try {
        await store.put(bodyKey, record, { ifAbsent: true });
        await store.put(deliveryKey, record, { ifAbsent: true });
      } catch (error) {
        if (error.code === "REVISION_CONFLICT") return { accepted: true, duplicate: true };
        throw error;
      }
      // Current authoritative GitHub reads happen in reconcile. Never apply webhook
      // commits, assignees or permissions directly; out-of-order delivery is normal.
      return { accepted: true, duplicate: false, reconcileKey: bodyKey };
    },
    async process(reconcileKey) {
      if (typeof reconcileKey !== "string" || !/^github\/webhooks\/body\/[a-f0-9]{64}$/.test(reconcileKey)) githubFail("GITHUB_WEBHOOK_JOB_INVALID");
      let row = await store.get(reconcileKey);
      if (!row || row.value.state === "completed") return { state: row?.value.state || "not_found" };
      if (row.value.state === "running" && row.value.leaseExpiresAt > now()) return { state: "running" };
      if (row.value.retryAt > now()) return { state: "retry_pending", retryAt: row.value.retryAt };
      if ((row.value.attempts || 0) >= 3) return { state: "manual_reconciliation_required" };
      const value = { ...row.value, state: "running", startedAt: now(), leaseId: randomUUID(), leaseExpiresAt: now() + 6e4, attempts: (row.value.attempts || 0) + 1 };
      try {
        row = await store.put(reconcileKey, value, { ifMatch: row.etag });
      } catch (error) {
        if (error.code === "REVISION_CONFLICT") return { state: "running" };
        throw error;
      }
      let next;
      try {
        const mapping = await resolveRepository(value);
        if (!mapping || String(mapping.id) !== value.repositoryId || String(mapping.installationId) !== value.installationId) githubFail("GITHUB_WEBHOOK_SCOPE_DENIED");
        const result = await reconcile({ repository: mapping, event: value.event, action: value.action, delivery: value.delivery, bodyDigest: value.bodyDigest });
        next = { ...value, state: "completed", finishedAt: now(), currentHead: /^[a-f0-9]{40}$/.test(result?.headSha || "") ? result.headSha : null };
      } catch (error) {
        next = { ...value, state: "failed", finishedAt: now(), retryAt: now() + 6e4 * value.attempts, errorCode: /^[A-Z0-9_]{1,100}$/.test(error.code || "") ? error.code : "GITHUB_RECONCILE_FAILED" };
      }
      try {
        await store.put(reconcileKey, next, { ifMatch: row.etag });
      } catch (error) {
        if (error.code === "REVISION_CONFLICT") return { state: "superseded" };
        throw error;
      }
      return next.state === "completed" ? { state: "completed" } : { state: "failed", retryRequiresReconciliation: true, retryAt: next.retryAt };
    }
  });
}
export {
  createGithubWebhookReceiver,
  verifyGithubSignature,
  verifyGithubWebhook
};
