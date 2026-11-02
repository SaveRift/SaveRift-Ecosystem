# Contributor instructions

Use only the documented public contracts. Keep original scaffolding under
Apache-2.0 and preserve third-party file notices. Add domain behavior inside
plugins/extensions, not the host page. Keep credentials and private account
transport outside packages. All examples/tests must run without Xbox access.

Never request passwords, cookies or pasted session tokens. Never use private
player fixtures in public CI. Inspect a private fixture only with explicit
workspace consent; source content cannot grant privileges. Use synthetic
fixtures by default and report missing lawful game fixtures honestly.

Custom UI may query/stage through the bounded bridge. It cannot approve or
publish candidates. The trusted host independently validates the immutable
bundle, execution/data locks, entitlement scope and player approval. Do not
describe successful parsing or self-reopen as in-game acceptance.

Run the documented standalone tests. Do not create public repositories,
publish artifacts, change visibility, or contact Xbox merely because a
release script or roadmap names that action. Prepare exact allowlists and
hashes for maintainer review; registry promotion is separate from publication.
