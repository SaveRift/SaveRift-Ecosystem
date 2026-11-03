# Custom views

Custom views are compiled applications, not a fixed inventory form. Any framework,
canvas, graph, map, or game-specific navigation can use `sdk/ui-bridge.mjs`.
Bundle executable dependencies ahead of time into one module and one stylesheet.
`createFrameDocument` pins their exact hashes in CSP. The frame has only
`allow-scripts allow-forms`: its origin is opaque and cannot share the signed-in
parent's DOM, cookies or storage. Native form validation and submit events reach
framework handlers, which can prevent the default action and stage changes through
the bridge. The separate enforced `form-action 'none'` policy blocks native form
navigation, including `HTMLFormElement.submit()` calls that bypass submit handlers.
Fetch, workers, nested frames and external resources remain blocked. Approved
images use data/blob artifacts resolved by the host.

Keep `form-action 'none'` when enabling native form processing. The sandbox forms
flag otherwise aborts the HTML submission algorithm before its `submit` event,
preventing normal framework forms from working. This does not add a publication
method or permit top navigation, popups, same-origin access or account credentials.
The form-action directive concerns form navigation; the separate navigation
revocation and package-review requirements below still apply.
See the [HTML form submission algorithm](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#form-submission-algorithm)
and the [CSP form-action pre-navigation check](https://www.w3.org/TR/CSP3/#directive-form-action).

`resolveAsset` also has a dedicated binary response on that same private port.
The trusted handler returns `await createUiAsset({id,mimeType,bytes,sha256})` only
after resolving an opaque immutable asset/provider handle from the execution lock.
The client verifies the correlated response's MIME, exact length and SHA-256 before
returning `{id,mimeType,byteLength,sha256,bytes:Uint8Array}`. Limits are 4 MiB per
asset and 8 MiB per view session. Images and JSON/text catalog providers are the
only accepted types. Raw buffers do not travel inside tool JSON or base64. This
method must not fetch an arbitrary URL supplied by a plugin.

Advanced native-file inspection uses two separate trusted-host dialogs:

- `requestFileImport({purpose:'native-save-inspection',maxFiles:2,maxTotalBytes:4194304})`
  returns `null` on cancel or `{schema:'saverift.file-import.v1',source:'user_upload',importId,files:[{id,logicalPath,byteLength,sha256}],retained:false}`.
- `requestDownload({artifactId,filename,expectedSha256,expectedByteLength,purpose:'native-format-copy'})`
  returns `{state:'downloaded'|'cancelled'|'unavailable'}` after the trusted host
  independently verifies the scoped output artifact and performs the explicit download.

Neither takes a URL, base64 file, raw cloud endpoint or publication consent. Hosts
without these capabilities return `UI_METHOD_UNAVAILABLE`; there is no silent
filesystem fallback. Import scopes are bound to the exact account/frame/package
and source selection, expire when the view closes, and do not authorize AI/MCP
fixture access. The developer host must obtain any separate fixture-processing
grant it requires. The current intake profile permits at most two files/4 MiB.
Close/unmount/revoke aborts pending dialog and inspection work; `onClose` from
`bindPluginFrame` or the renderer is where the host deletes ephemeral imports and
exports. Advanced-off or a changed source/package must revoke that scope.

The hash-based script policy does not allow inline handlers/eval. CSS attributes
are permitted for framework positioning; packaged styles are hash-pinned and CSS
cannot fetch resources. This is a specific style policy, not permission to load
external executable dependencies.

The host establishes one MessagePort after matching the exact frame window,
opaque origin and one-use instance identifier. Messages then carry strict sequence,
correlation and instance bindings, bounded JSON and cancellation. The host must
bind every handler to the current account, selected artifact bundle and execution
lock. Never pass an arbitrary `/api` route through `query`. Revoke on unmount,
navigation, logout or selection/package change. `openReview` opens trusted chrome;
there is no commit, authorization, cloud-write or arbitrary URL method.

Use `client.query({method:'example.system.list',args:{cursor:null,limit:30}})` and
`client.stage({expectedRevision:draft.revision,operation:{id:'example.system.change',apiVersion:'0.1.0',params:{...}}})`.
Compound packs use the exclusive batch variant
`stage({expectedRevision,operations:[...],removeInstanceIds:[...]})`: the host
checks the complete proposed log and applies one CAS revision, with no partially
queued pack. The host assigns operation-instance IDs and resolves operation owners.
The host owns CAS, canonical operation IDs, entitlement checks, candidate review,
destination choice and final approval. It must validate each method's input and
output schema in addition to the transport's JSON and size checks.

The sandbox is one defense. It is not a universal confidentiality guarantee or a
substitute for package review: deceptive in-frame presentation and navigation
side channels still require review and minimal data exposure. Trusted author
identity and final publication status remain outside the frame.

This implementation is a local developer preview. Public production loading and
full Crimson cutover remain subject to the migration parity and release gates.
