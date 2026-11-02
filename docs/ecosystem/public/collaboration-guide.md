# Contribute to a game

Public source, documentation and local examples are available under their
licenses without a SaveRift or Microsoft account. Hosted developer tools use
separate per-game enrollment. Linking a Microsoft account is for the player's
saves; it does not grant GitHub maintainer or release rights.

## Start with existing work

Choose a game project and read its capabilities, package/source pins, active
issues, contributors and draft pull requests before creating a workspace.
Join an existing feature or claim a small unclaimed task. Proposing an
alternative approach is supported; claiming a task is not ownership of a
whole game.

GitHub issues, discussion, commits and pull requests are canonical. The portal
is a synchronized view plus private workspace state. A stale or unavailable
GitHub connection is shown explicitly; cached information must not be treated
as current authority.

Enable developer tools for the selected game to create hosted workspaces.
Self-service enrollment grants contributor capabilities only. Review,
maintainer, registry promotion and live-save approval remain separate.
Disabling enrollment stops new privileged actions and invalidates captured
job/preview grants. It does not delete open-source commits or PR history;
exporting one's own licensed source remains available.

## GitHub setup and attribution

Use the normal GitHub authorization screen when repository contribution is
configured. Do not paste a personal access token, session cookie, password,
or private key into the workbench or an MCP prompt. A trusted backend verifies
the GitHub identity; typed usernames, matching emails and Xbox gamertags do
not establish authorship.

The hosted integration uses a narrowly installed GitHub App on ecosystem
repositories. Its installation authority is still constrained by the current
actor's game, workspace, package paths and head revision. An installation
token is never available to plugin code or model tools. CODEOWNERS routes
reviews; it is not a folder-access security boundary.

If a project says `unconfigured`, public/local examples remain usable, but
remote branch, checkpoint and PR operations cannot run. The ChatGPT GitHub
connection and SaveRift's hosted GitHub App are separate connections.

## Work on pinned source

A branch workspace records the exact repository ID, package root, issue,
base commit, branch head, local revision, dependency pins and synchronization
state. Private autosave does not publish a commit for every keystroke.

1. Read the current source and revision.
2. Edit using the expected local revision and Git head.
3. Build, test and preview using a permitted synthetic fixture first.
4. Review the source diff, then explicitly prepare and approve a checkpoint.
5. Update from upstream when needed; resolve visible conflicts without
   discarding either contributor's private changes.
6. Prepare and open a draft PR containing source changes and safe summaries.

Stale revisions/heads are rejected. There is no force-push or last-write-wins
fallback. A changed source tree, dependency lock or upstream base invalidates
the old build evidence. Source merging never rebases a prepared player-save
candidate onto newer progress.

Keep fixtures, backups, credentials, signed URLs, private logs and account
transport out of commits and PR descriptions. Fixture ownership and explicit
AI inspection consent are separate from developer enrollment. Another
contributor cannot inspect private fixtures merely by joining an issue.

## Add a new system

Use a separate public extension package with an exact dependency on the
connector's documented domain/document API. Declare its input schema, write
domains, operations and custom UI. Expansion converts user intent into
connector-owned operations; the primary connector serializes once and the
host independently validates the complete candidate. New connector concepts
and typed document operations can be added in public package source without
changing the private host page.

`ecosystem/plugins/synthetic-extension` is the Progression Workshop example.
It supplies a graph interface and derives linked progression values through
`example.synthetic.document@0.1.0`. It is intentionally synthetic; Crimson
Desert does not have character levels. Neither a successful build nor a
self-reopened output proves real-game acceptance.

From the clean source root, use the checked-in locks and build before tests:

```sh
npm ci --ignore-scripts --prefix ecosystem
npm ci --ignore-scripts --prefix ecosystem/sdk
npm ci --ignore-scripts --prefix ecosystem/workbench
npm ci --ignore-scripts --prefix ecosystem/plugins/crimson-desert
npm run build:plugins --prefix ecosystem
npm test --prefix ecosystem
```

The public tests use synthetic inputs and require no Xbox credentials. Real
catalogs, artwork, donor saves and player fixtures are intentionally excluded
unless separately cleared; permitted-data recipes explain exact pins and
neutral fallbacks. Follow the workbench README to run local browser/MCP
tools. Browser and MCP call the same hosted authorization service.

## Review and release

Contributor submissions do not merge themselves. Maintainer review, protected
merge, exact-source release build, immutable artifact, registry review and
channel selection are separate steps. CI runs untrusted contribution code
without production credentials, private fixtures, release keys or Xbox
access. A merge or registry update never sends a save to Xbox.

Before production selection, a game package needs its required real-fixture,
performance and game-load/recovery evidence. Rollback selects a compatible
package for future operations; it never silently restores older player
progress.
