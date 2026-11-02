# Scoped GitHub collaboration adapter

This is executable provider and hosted-linking code, tested against mocked HTTP. It has **not** installed a GitHub App, linked a live contributor, created a repository, pushed a branch, opened an issue/PR, merged, published, or contacted Xbox. The existing ChatGPT GitHub connection is not a SaveRift GitHub App installation.

## Private host configuration

The host injects a fixed repository mapping, actor authorization, encrypted conditional storage, and secret-backed adapters. No credential is accepted in a browser/MCP request, source patch, comment, fixture, or package manifest. Installation/user credentials remain in backend closures and the private encrypted store. Constructors with missing App configuration return an explicit setup blocker rather than a simulated connection.

`createGithubProvider({fetcher, tokenBroker, authorize, resolveAuthor, allowedRepositories, committer, coordinationAppId?, coordinationBotUserId?, now?})` exposes:

| Method | Input in addition to `{actor, grant, repository}` | Safe result |
| --- | --- | --- |
| `getRepository` / `readRepo` | — | Canonical repository identity |
| `readHead` | `branch` | `branch, sha, treeSha` |
| `readTree` | `commit` | Pinned complete entries and tree SHA |
| `readSource` | `commit, paths` | Explicit UTF-8 files, entries, source digest |
| `listIssues`, `getIssue` | Optional label/page; issue `number` | Canonical issue metadata |
| `listDraftPRs`, `getPullRequest` | Optional page; PR `number` | Draft/head/base metadata |
| `getCheckRuns` | `commit` | Current check summaries |
| `listIssueComments` | `number, page?` | Canonical public comments and App provenance |
| `createIssueComment` | `number, body` | Known accepted public work-intent comment |
| `createIssue` | `title, body, issueLabel?` | Explicit accepted proposal |
| `createBranch` | `branch, expectedBaseSha, base?` | Created branch and pinned head |
| `checkpoint` | `branch, expectedHead, changes, message?, verifiedAuthor?` | Commit/head/tree and verified attribution |
| `openDraftPR` | `branch, base, title, body, issueNumber?, expectedHead?` | Existing or newly created **draft** |
| `getVerifiedAuthor` | `actor` only | Host-verified GitHub commit identity |

`allowedRepositories` contains one trusted mapping **per game**, including the canonical numeric repository ID (normalized to a decimal string), owner/name, default branch, exact allowed package roots, game branch prefix and private installation ID. Several games may share a repository; their root/prefix mappings must remain distinct. Caller-supplied roots or sibling-game branches cannot broaden these mappings. The actor authorization callback runs before every request, before dispatch and after response. Read-only discovery may have `grant:null`; the host must explicitly permit it. Mutations require the coordinator's fresh game grant and owner-approved destination switch.

Source reads verify the Git blob SHA-1, byte length, UTF-8 and bounded source content. Editable source is capped at 256 files/4 MiB, 1 MiB per file. Writes are capped at 128 changed files. The coordinator selects explicit text paths; binary assets and fixtures are excluded from editing and preserved in the base tree. Traversal, case collisions, symlinks, submodules, policy/SDK/registry paths, credential-like material, raw-save/private paths and workflow changes are rejected. These checks supplement the release scanner and trusted source review; they do not prove arbitrary text is free of private information.

## Commit and coordination behavior

Checkpointing rereads the expected head, builds a tree with `base_tree`, creates a commit with the **single expected head as parent**, rereads the ref and updates with `force:false`. A parallel sibling commit causes a conflict instead of a force retry. GitHub's ref endpoint does not document an expected-old-SHA CAS parameter; the guarded parent/non-force sequence is the implemented concurrency check. An accepted request with a missing/unverifiable response becomes `GITHUB_MUTATION_OUTCOME_UNKNOWN`; the coordinator holds it for authoritative reconciliation. There is no merge, force-update, release, promotion or Xbox endpoint.

Commit authors come from the current linked GitHub user and an explicitly selected verified email. The App committer is separately configured; no DCO certification or human signature is fabricated. Draft PRs use `draft:true` and `maintainer_can_modify:false`; unsupported draft creation fails. Public work comments remain projections of private CAS work intent, never assignment authority. Reconciliation requires both a matching marker/body and configured canonical App or bot-user provenance (`serviceAuthored`); arbitrary commenters cannot supply that flag.

## Genuine GitHub linking

`createGithubIdentityService` uses the GitHub App authorization endpoint, random actor-bound state, S256 PKCE, an exact HTTPS callback and the actual `GET /user` response. Begin/callback attempts have bounded private rate counters. State is consumed once with CAS. Sign-out or another completed link invalidates an in-flight callback. User/refresh tokens stay private, refresh rotation is conditional, and author lookup checks the same current user before returning metadata. Local unlink stops SaveRift use and removes its retained credential state; it does not delete public Git history or revoke the App in GitHub account settings.

GitHub now documents `scope=offline_access` for GitHub Apps to request expiring access/refresh tokens. It is the only supported App scope and **does not grant resource permissions**. The registration and installation permissions remain separate. Commit email verification uses GitHub's read-only **Email addresses** user permission, with explicit public commit-email consent in the trusted UI.

`createGithubRouter({identity, authenticate, allowedHosts, allowedOrigins, basePath?})` is an optional hosted seam, mounted before the general developer router:

| Route under `/api/developer/github` | Required scope | Behavior |
| --- | --- | --- |
| `GET /status` | `git:read` | Safe configured/link identity status |
| `POST /begin` | `git:read` | Genuine authorization URL, empty JSON object |
| `POST /identity` | `git:commit` | Explicit verified commit email selection |
| `POST /unlink` | `git:read` | Stop retained SaveRift use |
| `GET /callback` | `git:read` | Validate state/code, then same-origin 303 to `/developer?github=linked` |

There is no `developer` wildcard scope exception. Exact trusted host/origin checks apply; the genuine callback is the sole cross-site exception and still requires the authenticated principal plus validated OAuth state. JSON is limited to 2 KiB, rejects duplicate/unknown fields, and responses are `no-store` with generic redacted errors. Unconfigured status is honest; other link operations return `GITHUB_APP_NOT_CONFIGURED`.

## Installation tokens and webhooks

`createGithubTokenBroker` signs a short RS256 App JWT, then requests a one-hour installation token with **one repository ID** and exact reduced permissions. It verifies the returned repository, permissions and expiry. New variable-length installation tokens are supported. Tokens are never a result object; the broker invokes a private callback. Invalidation prevents a token minted in flight from reaching the repository operation.

`verifyGithubSignature` validates the bounded original body with HMAC-SHA256 and constant-time comparison, including GitHub's official test vector. `createGithubWebhookReceiver` validates repository/installation scope, deduplicates both delivery ID and signed-body digest using durable CAS, then queues only bounded metadata. Webhook content never grants access, applies commits, or replaces authoritative state. Processing rereads current state through the injected reconciliation adapter. CAS leases allow crash recovery, stale workers cannot overwrite a later reconciliation, failures back off and stop after three attempts. A durable scheduler and retention sweep remain host responsibilities. Repository-less installation/user-revocation events require a trusted configured association/fan-out; they must not invent a repository mapping or act as access grants. Periodic reconciliation remains necessary after missed deliveries.

## External setup still required

1. Owner approval of the exact fresh ecosystem destination, visibility, initialized default branch and canonical repository ID. The proposed private `saverift-ecosystem` is a recommendation, not an existing or approved resource.
2. A SaveRift GitHub App registered by the owner, exact hosted callback, private key/client secret, expiring user tokens, installation on **only the ecosystem repository**, and verified installation/App/bot IDs.
3. Minimum repository permissions: Contents write, Issues write, Pull requests write, Checks read; Metadata read is implicit. Account permission: Email addresses read for commit identity selection. Administration, Workflows, Actions write and organization membership access are unnecessary here.
4. Private host injection of adapters, encrypted CAS store, authorization callbacks, allowed per-game mappings, optional identity router, App webhook endpoint/secret, durable queue/reconciliation and revocation handling. None is inferred from a ChatGPT connector.
5. Owner-reviewed branch protection/ruleset and CI setup. The App token can technically reach other files in its selected repository, so package scope is enforced by the trusted service; CODEOWNERS alone is not a folder permission boundary. Enable external mutations only after approving the prepared destination and contents.
6. A controlled live validation of genuine user linking, branch/checkpoint/comment/draft-PR requests and webhook delivery. Current tests establish implementation behavior against mocked transport, not successful GitHub delivery or repository permissions.

## Verification and primary sources

Run `node --test ecosystem/collaboration/tests/github-*.test.mjs`. This covers actual request shapes, scoped tokens/JWT signature verification, stale heads/non-force races, protected paths, verified attribution, callback state/replay/origin/scope, token refresh/revocation, raw HMAC/replay/CAS leases and the real provider through the coordinator's two-contributor branch/checkpoint/draft-PR flow. All transport in this suite is synthetic.

Official GitHub documentation checked November 2, 2026; requests pin API version `2026-03-10`:

- [App user tokens, PKCE, offline access and revocation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Installation token repository and permission reduction](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [App REST API and token formats](https://docs.github.com/en/rest/apps/apps)
- [Git references](https://docs.github.com/en/rest/git/refs), [trees](https://docs.github.com/en/rest/git/trees), [commits](https://docs.github.com/en/rest/git/commits)
- [Draft pull requests](https://docs.github.com/en/rest/pulls/pulls), [issue comments](https://docs.github.com/en/rest/issues/comments), [issue assignees](https://docs.github.com/en/rest/issues/assignees)
- [Verified email addresses](https://docs.github.com/en/rest/users/emails)
- [Webhook signature validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [delivery best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners), [repository rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
