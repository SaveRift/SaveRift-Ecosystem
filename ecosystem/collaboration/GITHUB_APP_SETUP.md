# Owner-operated GitHub App setup

The manifest helper registers SaveRift's own organization App. It does not
reuse the ChatGPT connector's credentials or accept pasted keys, passwords,
session cookies or access tokens. Application setup does not grant developer
enrollment, fixture consent, release authority or Xbox publication.

This code is implemented and tested with synthetic HTTP. A ready form is not
evidence that an App exists, is installed, or can read a repository. Record
those live results separately after the owner completes GitHub's screens.

## Trusted host contract

`createGithubAppSetup({store, authorizeOwner, origin, organization, repository,
fetcher?, now?, random?, appName?})` requires:

- A fixed HTTPS workbench origin and exact organization/repository IDs.
- An injected owner check. Contributor scopes, per-game enrollment and caller
  fields cannot establish ownership. Run this check again after asynchronous
  work and before retaining verified configuration.
- Encrypted private conditional storage. The memory store is for tests only.
  App credentials belong in the host vault, outside workspaces and exports.
- Normal TLS verification and fixed GitHub endpoints. Redirects are refused.

The host mounts `createGithubAppSetupRouter` **before** the normal GitHub
identity router. Both use the same trusted authentication adapter. Owner
initialization is a private deployment responsibility; this module cannot
claim the first visitor as owner or turn a contributor into an administrator.

| Route under `/api/developer/github/setup` | Method | Result |
| --- | --- | --- |
| `/status` | GET | Owner-only safe configuration/installation metadata |
| `/begin` | POST `{}` | Bounded actor-bound registration-form path |
| `/register?state=…` | GET | Script-free form posting a manifest to genuine GitHub |
| `/callback?code=…&state=…` | GET | One-use backend conversion, then a safe same-origin redirect |
| `/installation` | POST `{}` | Independently verify the selected App installation and private repository |

Only the exact callback permits cross-site navigation; actor, nonce,
generation, URL and expiry checks still apply. Other requests enforce trusted
hosts/origins, a bounded empty JSON object, no-store responses and redacted
errors. Credential-bearing callback URLs must not be written into host logs.

## Owner steps

1. Start setup from the trusted owner interface. Its form submits only public
   App metadata to GitHub's organization registration page.
2. On GitHub, create the organization-owned private App. Its repository
   permissions are Contents, Issues and Pull requests write; Checks and
   Metadata read. Email addresses read permits the later verified commit
   identity selection. Administration and workflow-write access are omitted.
3. GitHub returns a temporary code. The backend consumes it once and retains
   the resulting App key/client secret/webhook secret in encrypted storage.
   Browser and MCP responses contain only App IDs, URLs and state.
4. Use the genuine installation link. Its documented parameters preselect
   the target organization and the one ecosystem repository. The owner must
   retain **Only select repositories** on GitHub's permission screen.
5. Return to the owner interface and verify installation. The backend checks
   the App/organization identity, selected installation, permission set,
   one-repository reduced token, and the repository's actual private identity.
   Subsequent developer identity linking uses the existing explicit OAuth
   state/PKCE flow; installation itself does not establish a commit author.

The manifest handshake uses random state; its conversion endpoint does not
use OAuth PKCE. User authorization remains a separate PKCE-protected flow.
The helper expires registration attempts after 30 minutes, within GitHub's
documented one-hour manifest handshake window.

## Secret and recovery boundary

Before runtime-specific RSA validation, the bounded conversion response is
sealed in a host-only recovery record. A malformed key, owner revocation or
platform validation problem cannot expose that response or activate adapters.
Only a fully verified configuration is available to
`withPrivateCredentials(callback)`. That callback method is **host-only**;
never expose it through generic JSON dispatch or a model tool.

After verified configuration becomes durable, the helper redacts the recovery
copy when possible. Failure retains an encrypted copy rather than losing a
one-use result. An ambiguous network exchange enters `recovery_required` and
is never blindly retried or replaced by another App. Owner recovery requires
a separate trusted host procedure; the helper has no key-download or secret-
output endpoint.

Installation verification proves effective one-repository token scope and a
selected installation. It does not claim to enumerate the App's complete
organization-wide installation selection. The fixed host repository mapping
and broker continue to constrain every operation.

## Private-host webhooks

The initial manifest deliberately disables webhook delivery and subscribes
to no events. An owner-private Site gateway cannot receive an unauthenticated
GitHub server callback as if it were a signed-in owner. Direct GitHub reads
and periodic reconciliation can prove discovery while the authenticated App
is configured. A reachable, separately approved HMAC-verified ingress and
durable scheduler are required before enabling live webhook delivery. Do not
change the private workbench audience to make callbacks work.

## Verification

Run:

```sh
node --test ecosystem/collaboration/tests/github-app-setup.test.mjs
```

Tests cover real manifest/form shape, narrow installation-link parameters,
owner/state/generation/expiry checks, duplicate callbacks, bounded responses,
sealed recovery, revocation during exchange, permission/organization
mismatches, scoped token proof, safe routing and error redaction. Transport is
mocked and credentials are generated/synthetic; no live App is created.

Primary GitHub references checked November 2, 2026:

- [GitHub App manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest)
- [Manifest conversion API](https://docs.github.com/en/rest/apps/apps#create-a-github-app-from-a-manifest)
- [Documented installation preselection parameters](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/migrating-oauth-apps-to-github-apps)
- [Installing your own App](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app)
- [Verified email-address permission](https://docs.github.com/en/rest/users/emails#list-email-addresses-for-the-authenticated-user)
