# SaveRift developer workbench

An original Apache-2.0 developer preview. The local browser, CLI and MCP server use the same revision-checked workspace service and isolated QuickJS runtime. No Microsoft account, Xbox credentials, paid plan or AI API key is required locally.

From the clean exported repository root, with Node.js 22 or newer:

```bash
npm ci --prefix ecosystem --ignore-scripts
npm ci --prefix ecosystem/sdk --ignore-scripts
npm ci --prefix ecosystem/workbench --ignore-scripts
npm test --prefix ecosystem/workbench
npm start --prefix ecosystem/workbench
```

Open `http://127.0.0.1:4174`. Create a synthetic workspace or fork an available connector's source, edit source, import permitted CSV/JSON data, build, run conformance, open its custom UI and prepare a source-only review bundle. The local template discovery reads permitted text files from connector manifests in the public `ecosystem/plugins` tree and never imports player fixtures. Local source and fixtures persist in `.saverift-workbench` under the command's working directory; override with `SAVERIFT_WORKBENCH_DIR`. That folder is private and must never enter source control or exports. The local server binds only `127.0.0.1` and rejects foreign Host/Origin requests. Source quotas are 256 files, 1 MiB per file and 4 MiB per workspace, enough to fork the current compiled Crimson reference.

Build a connector in one workspace and an extension in another. Paste the extension's built artifact ID into **Built extension dependencies** on the connector workspace, then open its custom package view. The exact dependency lock and public domain API are checked before testing or editing. The extension's view queries the primary connector and can stage only its own declared operations; all selected views share one durable revision-checked log. Candidate preparation expands extension intent in isolation and invokes exactly one primary serializer. There is no extension-specific code in the workbench page. MCP exposes the same selection through optional `extensionArtifactIds` on tests/candidates/previews and `uiArtifactId` on previews.

`templateFromPackage` imports an exact canonical package into editable source. The editor materializes a `manifest.json`; immutable packaging keeps that metadata separate from `package.files`, matching the release builder. A regression builds the actual canonical Crimson package, forks it into a workspace and verifies the rebuilt package digest is identical. A broad source-directory fork may intentionally contain more source files than a canonical release package, and therefore has its own digest.

## Local MCP

The official server/client SDKs are pinned to **2.4.0**. This implementation verifies the current **2026-07-28** protocol and SDK-managed legacy compatibility, rather than combining incompatible session models. Stdout is exclusively JSON-RPC. Run:

```bash
node ecosystem/workbench/stdio.mjs
```

Configure a local client to launch that absolute file path with Node. For example, in a client's MCP configuration:

```json
{
  "mcpServers": {
    "saverift-dev": {
      "command": "node",
      "args": ["/absolute/path/to/checkout/ecosystem/workbench/stdio.mjs"],
      "env": {"SAVERIFT_WORKBENCH_DIR": "/absolute/private/workbench-state"}
    }
  }
}
```

The conformance suite launches the real stdio server with the official client and tests HTTP transport separately. The independent official Inspector CLI2.13.0 also completed source-build and validated candidate/re-open workflows through stdio. The Codex executable was unavailable, so no Codex desktop/cloud/CLI connection is claimed. Hosted URLs must be documented only after deployment and authorization checks succeed; the source alone is not a live service.

## Typed operations and private fixtures

The MCP tools expose workspace source patches, catalog import/query, isolated build/test/candidate jobs, expiring previews, source-only release preparation and private registry/trial review requests. There is no shell, password entry, Microsoft-token output, direct Xbox writer or GitHub publication tool.

Fixture upload uses a one-use trusted UI upload intent and a raw binary body. Files stay outside the source tree and exports. By default, an uploaded fixture has **no AI access**. The owner can test and preview it in the browser without granting AI access. MCP test/candidate requests and private job reports require the separate current fixture grant. The owner can enable or revoke bounded inspection per fixture in the browser; there is no MCP consent-grant tool. Original synthetic fixtures are marked synthetic. Local command-line fixture upload supports a deliberate `--allow-ai-inspection` option:

```bash
node ecosystem/workbench/cli.mjs call saverift_template_list
node ecosystem/workbench/cli.mjs call saverift_workspace_create '{"template":"synthetic-json","name":"My game"}'
node ecosystem/workbench/cli.mjs fixture WORKSPACE_ID /path/to/owned.save --role main
```

Fixtures expire after 30 days; source and workspace records remain until the developer's local directory is removed or a deployment's separately configured lifecycle policy deletes them. Expiry is enforced on reads. Generic host-side JSON inspection/comparison is capped at 128 KiB; larger fixtures receive metadata-only reports and need isolated game queries for decoding. This preview does not yet provide automatic physical garbage collection or workspace deletion, and must not advertise those features.

Custom UI packages declare already compiled `manifest.ui` body/script/css paths. The preview does not run npm lifecycle scripts or discover/evaluate arbitrary HTML dependencies. The isolated runner loads only packaged relative JavaScript dependencies, with no ambient network/filesystem/environment and bounded CPU, memory and artifact I/O. A passed structural/no-op/reopen check does not establish game-engine acceptance or permission to publish to Xbox. DLC/entitlement authorization remains a separate trusted-host decision.

Artifact roles are game-defined strings, not a fixed inventory schema. Set the fixture role in the browser or with CLI `--role`; the synthetic Frontier example uses `world`. Inspection, extension expansion, primary serialization, validation and independent re-open use fresh isolated engines. The default is 10 seconds per engine and 60 seconds for the whole job. A trusted hosted adapter can select the existing `developer-large-save-v1` profile for an exact reviewed artifact: 30 seconds per primary engine and 90 seconds per job. Extensions retain the default engine limit. Manifests, browser requests and MCP inputs cannot select or raise that profile.

Every profile shares the original 100,000 interrupt/4,096 host-call allowance plus 24 MiB of output/32 output artifacts. Remaining counters are passed to each new engine, so a frozen Worker clock does not allow fresh phases to multiply instruction or host-call authority. Memory limits remain per engine, and closed phase references are released. A hosted adapter can opt into one fresh engine per authenticated request with private, owner-bound continuation storage; pauses between requests count against the job deadline. See [optional hosted phases and reviewed profiles](RESUMABLE_JOBS.md) for the exact bounds, cancellation and checkpoint rules. Metrics report phases and aggregate usage. Real-save performance must still be measured on the intended hosted runner; a synthetic pass or a larger reviewed profile does not waive a CPU or memory failure.

Every stageable operation declares its API version, write domains and a pinned input schema, inline or in an exact package file. The same interpreted schema validator checks browser staging and MCP candidate operations before the shared draft changes. It enforces nested types, required fields and additional-property rules, rejects unsupported schema features and unsafe patterns explicitly, and never evaluates schema code. Legacy operation-name strings are inspectable metadata; they do not authorize untyped draft edits. The explicit release allowlist must include any declared schema files.

## Hosted adapter

`createDeveloperWorker` accepts deployment-owned `authenticate`, `createStore`, `executeJob`, `assetFetch`, host and origin allowlists. Authentication is distinct from Microsoft/Xbox linkage. `createR2Store` requires host-supplied encryption and key-associated-data sealing; conditional writes use R2 ETags. Identity is injected after the platform validates it; incoming XUIDs, gamertags and MCP argument fields never establish ownership.

The portable source neither issues OAuth tokens nor treats a request header as independently trustworthy. A hosted platform must verify its authenticated identity boundary and reject anonymous/forged identities before it is described as production-ready. Service-to-service asset bypass is not developer authorization. A direct bearer deployment must supply a real resource-server authorization adapter with issuer/audience/expiry/scope/client/resource validation and protected-resource metadata; this package does not pretend to register an issuer for you.

Serve `index.html`, `browser.mjs`, `browser.css`, `ecosystem/ui/{vanilla-frame.mjs,frame-document.mjs,plugin-frame.css}` and `ecosystem/sdk/ui-bridge.mjs` at the paths used by the local server. Use the SDK's statically imported WebAssembly module for Workers; if no isolated executor is configured, jobs report `not_run`.

Release preparation creates a private allowlisted JSON review bundle and excludes fixtures/logs/credential-like material. Reviewers must inspect the exact complete export and licenses; pattern scanning is not a certification that arbitrary source is public-safe. Public GitHub publication, registry promotion, paid infrastructure and live Xbox operations remain separate approvals.

Primary protocol references checked November 2, 2026:

- https://modelcontextprotocol.io/specification/2026-07-28
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html
- https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html
- https://github.com/modelcontextprotocol/typescript-sdk
