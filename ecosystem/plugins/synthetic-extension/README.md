# Progression Workshop

A separate contributor extension for the synthetic RPG connector. It declares
`example.synthetic.document@0.1.0`, registers `example.level-tools.setLevel`,
and supplies a fully custom graph application. No core page, inventory schema,
Microsoft account, save transport or Crimson Desert code is involved.

`expand({document,operation,priorOperations})` reads the public progression domain
and emits one connector-owned `example.synthetic.setProgression` operation. Level,
XP and available skill points change together. The connector remains the only
serializer and preserves unrelated/unknown records. The host owns the operation
log, revision conflicts, final review and exports.

Build in the developer-preview tree with `node ecosystem/plugins/synthetic-extension/build.mjs`.
The bundled application uses the public `sdk/ui-bridge.mjs`; it makes no network
requests. The package's exact release digest is resolved by the execution lock.
The manifest is a development candidate, not a published registry release.

This demonstrates extension mechanics using clearly labelled synthetic data. It
does not establish real-game compatibility or imply Crimson Desert has levels.
