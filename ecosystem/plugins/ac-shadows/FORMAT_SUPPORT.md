# Format, compatibility and evidence

| Input / domain | Support | Evidence and limitation |
|---|---|---|
| Windows PC outer wrapper + native container v54, prepared progression context at index 12 | Implemented | 40-byte wrapper retained; one selected 16-byte private transform key; target blocks must be flag 0; default 8 MiB per artifact applies |
| Extracted `AssassinProgressionSaveData` context | Implemented | Complete typed-property traversal; outputs remain extracted contexts |
| Untouched Oodle-compressed progression context | Rejected | `AC_OODLE_REQUIRED`; explicit local preparation required |
| Unknown native version, compression info, root, field type or truncated layout | Rejected | No guessed fallback offsets or opaque inventory skips |
| Xbox / PlayStation | Unsupported | No interchangeable-format claim, console title ID, transport or account grant |
| Existing Naoe/Yasuke gear level, 1–100 | Typed edit | Existing singleton gear with a positive level; exact record/precondition/source witnesses |
| Existing Naoe/Yasuke inventory stack, 1–999999 | Typed edit | Already-stacked level-zero entries only; no insertion or ownership change |
| Other owner profiles; singleton level-zero records | Read-only | Insufficient item-category evidence for safe edits |
| Player level, XP, prestige/mastery, skills, loadouts, engravings, item addition | Unsupported in this release | Prior research does not automatically qualify a new isolated operation |
| Localized catalog/art/stat calculator | Not bundled | Internal settings and instance IDs remain visible; no private data-provider reuse |

## Recovered structural facts

These rules derive from the existing AC research implementation, checked against
the selected authorized native fixture. They are not a new generic schema guess.

| Layer | Rule |
|---|---|
| Outer file | 40-byte header; first little-endian u64 is 36. Preserve all 40 bytes. Remaining bytes use a repeating 16-byte XOR transformation; rotate the base key by payload length modulo 16. This is obfuscation, not authentication. |
| Decoded header | u32 signature `0x00fedbac`, version 54, next word 4. The word at offset 12 is **not** the context count. Parse bounded framing to the footer. |
| Payload integrity | Seeded IEEE CRC32 (`0xF4C3B8A2`) stored at offset 16 over `[20, length-4)`. |
| Footer integrity | Seeded CRC32C/Castagnoli, reflected polynomial `0x82F63B78`, same seed, over `[0, length-4)`, stored in the final four bytes. Recompute after the payload CRC. |
| Context | 8-byte resource key, u32 record length, u32 plaintext length, magic `0x1004fa9957fbaa33`, seven compression-info bytes `03 00 05 00 00 04 00`, then bounded blocks. Record length includes the uncompressed-size field. |
| Block | Flag 0: u32 size followed by stored bytes. Flag 1: packed size, plain size, Adler32 seed 0 over packed data, then data. Maximum block size 262144. |
| Compression naming | Prior extraction labels the algorithm `OODLEMERMAIDOPTIMAL3`; inspected compressed block headers start `8c06`. Treat the decoder identity as external evidence, not a reason to embed a guessed Mermaid implementation. |
| Inventory root | `AssassinProgressionSaveData`, type hash 1868920887. Nested typed lengths/arrays/properties fully consumed. Exact IDs are decimal strings; never coerce 64-bit settings IDs to floating-point numbers. |
| Edits | Four-byte unsigned little-endian quantity/level writes at structurally resolved property offsets. No record regeneration or identifier allocation. |
| Preservation | Same-width native edits require only intended field bytes and two integrity words to change in decoded data. Wrapper, ordering, other contexts, unknown bytes and selected siblings stay identical. |

Selected baseline: native file 901,776 bytes, 61 contexts, 108 compressed blocks,
19,039,487 total plaintext bytes. Inventory context: 6,819,042 bytes,
86,929 objects, 193,505 fields, 2,174 inventory records. The local prepared
container is 7,459,585 bytes. Counts describe this fixture, not a version rule.

The key is selected private data, never an inferred user credential or public
constant. `inputOnlyRoles: ["ac-key"]` excludes it from candidate artifacts and
downloads. Additional selected sibling artifacts are returned unchanged. The
fixture contains a self-contained PC save; no assumption about a mandatory
console sibling set is made.

## Validation boundary

Prepared-file no-op is byte-identical to the **prepared selected input**. Local
preparation intentionally changes compression representation and container
integrity; its independent test must show identical plaintext in **all** contexts
relative to the original raw input. Do not call that conversion byte-identical.

The isolated connector validates container structure, both seeded CRCs, packed
block Adler values, and the entire editable progression tree. It preserves other
compressed contexts without claiming to understand their semantic fields. An
external independent oracle decompresses every original/candidate context and
checks exact plaintext conservation and whitelisted field changes.

Exact tested artifact/lock hashes and observed resource limits live in the review
receipts. Game execution, persistence and recovery are distinct checks and remain
`not_run` unless a receipt explicitly records them for the exact candidate.
