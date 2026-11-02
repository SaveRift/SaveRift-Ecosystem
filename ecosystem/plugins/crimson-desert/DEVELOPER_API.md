# Crimson document API 0.1.0

The public connector supports custom contributor interfaces and operations beyond
its inventory views. It exposes the actual typed PARC document, without a private
writer or an invented universal gameplay model. An unknown field is not labelled
as a real faction, level, skill or unlock merely because it can be decoded.

Open the selected bundle through the normal isolated runner. Keep the returned
document handle in that session and call `query(handle, request, ctx)`:

| Query | Parameters | Result |
| --- | --- | --- |
| `crimson.document` | Optional type/root offsets and limits, each at most100 | Original plaintext/schema hashes, audit, paginated type names/field counts and root bounds |
| `crimson.document.schema` | `typeIndex`, optional field `offset`/`limit` at most100 | Original typed field descriptors, including absent/array/object kinds |
| `crimson.document.fields` | Optional path `prefix`, `offset`, `limit` at most100 | Present fixed-width scalar locators: path, exact byte offset/width, type, lossless value and field SHA256 |
| `crimson.document.bytes` | `offset`, `length` from1 to4096 | Original decoded bytes as hexadecimal, bound to the plaintext/schema hashes |

The byte ranges are **decoded plaintext**, never encrypted SAVE header offsets.
Absent fields do not become zero. Omitted-list markers, list metadata, schemas,
object wrappers and locator offsets are not writable through the scalar API.
Large custom readers should use the paginated field/schema queries instead of
assuming a full inspection projection fits one bridge response.

The following operation is experimental format research:

```json
{
  "id": "crimson.document.patchFixedWidth",
  "apiVersion": "0.1.0",
  "instanceId": "my-extension:change-1",
  "params": {
    "plaintextSha256": "<original plaintext digest>",
    "schemaSha256": "<original schema digest>",
    "patches": [
      {
        "path": "<exact path returned by the fields query>",
        "offset": 1234,
        "expectedHex": "0903000000000000",
        "replacementHex": "0a03000000000000"
      }
    ]
  }
}
```

The example byte values are the invented test field777→778. They are not a
claim about a Crimson Desert gameplay field. A custom extension can inspect its
understood system, draw a complete custom view, and expand its operation into
this registered connector operation. Source bytes and schema stay pinned.

The connector accepts at most16 fixed-width patches in one plan. Each patch must
match a complete present scalar in both the immutable original and the current
composed candidate, with the exact path, offset, width and expected bytes. It
rejects overlap, stale source/schema, absent/unknown locators, metadata targets
and serialization changes. It strictly traverses the resulting document,
compares intended decoded changes, uses native-compatible LZ4, preserves unknown
SAVE header bytes, verifies HMAC, and reopens the encoded result.

Patches can follow supported scalar/item/companion/cartography operations when
their exact locators remain valid. A structural relocation or another operation
changing the same field causes a conflict; it is not silently rebased by an
offset guess. Full adventure replacement remains exclusive. String/list/object
insertion and arbitrary-length raw splicing are not part of this fixed-width
research primitive. Public `crimson-document.mjs` and
`crimson-structural-layout.mjs` remain available for codec/constructor research;
new structural semantics require their own tested public operation, not a hidden
private serializer.

Every research candidate declares `experimentalFixedWidthPatch:true`, unreviewed
entitlement effects and a required independent host inspector. These declarations
are hints, not authority. Hosted publication must still establish the complete
transition and no DLC/license-entitlement bypass through the trusted independent
inspector, followed by its usual backup/revision/approval transaction. This local
primitive does not enable a live write or claim game-engine acceptance.

Data packs have ordinary immutable package digests. The host resolves
`catalogQuery({method:'saverift.data.resource',id,artifactId})` from the pinned data
package's `manifest.data.resources` and returns `{package:{id,version,digest},
resource:{id,path,byteLength,sha256}}`. The connector checks that package pin
against the execution lock and the resource against the selected artifact; the
runner independently checks the bytes. A raw catalog-body checksum is not used
as a substitute for a registry package digest.
