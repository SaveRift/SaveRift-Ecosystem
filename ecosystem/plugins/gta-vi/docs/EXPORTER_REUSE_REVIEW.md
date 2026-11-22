# GTA VI exporter reuse and identifier coverage

Reviewed 2026-11-22. This review inspects public source at the commits below; it does not claim that every exporter has been run against the local archive build.

## Conclusion

The user's expectation of broader definition extraction is justified. Existing tools already parse schema, instance blocks, arrays and references; SaveRift should reuse those exports and name dictionaries, follow the primary definition containers, and ingest the larger website identifier catalog now. The earlier **13 weapon / 9 item matches describe narrow native-table corroboration, not the number of identifiers available to the catalog**.

The weapon comparison considered only 17 distinct values in the `WeaponSpec` field of three meta7a documents, with 174 instances of struct `74bd18f6`. Thirteen matched the website's explicit hexadecimal spec identifiers, chiefly vehicle/device weapons. That does not measure the full weapon definitions. The item comparison likewise covered a selected keyed-child table, not all inventory definitions. These are independent corroboration counts, not inclusion requirements for clearly attributed website claims.

The reviewed website extraction supplies **160 spec identifiers** (137 literal tokens and 23 explicit 32-bit values), **227 distinct named presets**, **176 distinct named recipes**, and **178 drink/drug ItemId claims**. The first three are distinct weapon roles, not 563 interchangeable base weapons. The site itself says that its displayed weapon coverage excludes eight unnamed specs. Counts are derived from the pinned factual exports; source claims remain distinct from native observations. [Weapons source](https://negentropy.studio/weapons/) · [Drinks/drugs source](https://negentropy.studio/drinks-and-drugs/)

## What the current projects actually export

| Project and reviewed commit | Reusable capability | Limit for a typed weapon/item crosswalk |
| --- | --- | --- |
| [SixNG `80ac18931d007d20b592f4dac7f6a1745610eede`](https://github.com/holdmysocks/SixNG/tree/80ac18931d007d20b592f4dac7f6a1745610eede) | [`pso.rs`](https://github.com/holdmysocks/SixNG/blob/80ac18931d007d20b592f4dac7f6a1745610eede/crates/sixng-core/src/pso.rs) exports the root **and all block objects**, grouped by full 64-bit structure identifiers. [`names.rs`](https://github.com/holdmysocks/SixNG/blob/80ac18931d007d20b592f4dac7f6a1745610eede/crates/sixng-core/src/names.rs) supplies source-tagged exact/lowercase hash-name candidates. | Strongest direct reuse path found. No dedicated, complete weapon/ItemId directory command was found. Unknown field names and unsupported value types remain visible. |
| [RageForge `5f2726cc554f67464665d5a75da050a2b624bf91`](https://github.com/nullbrik/RageForge/tree/5f2726cc554f67464665d5a75da050a2b624bf91) | [`ModelLookup.cs`](https://github.com/nullbrik/RageForge/blob/5f2726cc554f67464665d5a75da050a2b624bf91/src/RageForge.Core/Index/ModelLookup.cs) builds model hash/name lookup; index/search can contribute model names. | [`AssetCategory.cs`](https://github.com/nullbrik/RageForge/blob/5f2726cc554f67464665d5a75da050a2b624bf91/src/RageForge.Core/Index/AssetCategory.cs) classifies weapon models using prefixes such as `w_` and `weapon_`. [`AssetExporter.cs`](https://github.com/nullbrik/RageForge/blob/5f2726cc554f67464665d5a75da050a2b624bf91/src/RageForge.Core/Exporters/AssetExporter.cs) exports models/media/XML; PSO falls through to raw `.bin`. A weapon model is not a WeaponSpec or ItemId definition. |
| [PercyStar `1c00206f60f1e3e5f02b7fab285ef06db3e08bc2`](https://github.com/rpatty-dev/PercyStar/tree/1c00206f60f1e3e5f02b7fab285ef06db3e08bc2) | [`psin.rs`](https://github.com/rpatty-dev/PercyStar/blob/1c00206f60f1e3e5f02b7fab285ef06db3e08bc2/src/psin.rs) exposes schema, fields, instances and placement/MLO exports. Useful as an independent inspection reference. | Its current decoder groups `0x52` and `0x5c` together and reads both as pointer-first/count-at-8. This differs from SixNG's count-first PSO `0x5c`. It also groups `0x44` with 32-bit hashes. Do not replace the current decoder wholesale on this evidence. |
| [rpf9-explorer `e2939175c36a02d6ed25fa2c217b9d6ddcb8b516`](https://github.com/breadbbbb/rpf9-explorer/tree/e2939175c36a02d6ed25fa2c217b9d6ddcb8b516) | [`PsinMetadata.cs`](https://github.com/breadbbbb/rpf9-explorer/blob/e2939175c36a02d6ed25fa2c217b9d6ddcb8b516/Core/PsinMetadata.cs) checks the PSIN section layout and reports trailer/platform values. | This inspected path is section inspection, not a typed weapon or item definition exporter. |
| [6stars `480d9a4d00ed11560f7b4d989643723a0f5c451c`](https://github.com/meetox80/6stars/tree/480d9a4d00ed11560f7b4d989643723a0f5c451c) | [`psonames.py`](https://github.com/meetox80/6stars/blob/480d9a4d00ed11560f7b4d989643723a0f5c451c/tools/psonames.py) harvests names and string values from parsed RBF files and extra vocabularies. [`psodump.py`](https://github.com/meetox80/6stars/blob/480d9a4d00ed11560f7b4d989643723a0f5c451c/tools/psodump.py) follows polymorphic pointers and distinguishes both array layouts. | Reuse the vocabulary and traversal ideas. The dump script's entry point hardcodes a different root, `0x5d09873f`; it is not an arbitrary weapon export CLI. `0x63` is unsupported and `0x65` is interpreted differently from SixNG. |

The [awesome-gta6-reverse-engineering index](https://github.com/Ahmet-Dedeler/awesome-gta6-reverse-engineering) is useful for discovering these projects. Capability conclusions above come from their own pinned source, not the index's descriptions.

## Existing commands to reuse

Use existing decoded PSO files and cached indexes first. Commands below are documented/code-backed forms, not a record of new extraction runs. Set `GAME`, `WORK`, `IDS`, `OUT`, `PSO` and `OUT_JSON` to the intended local paths.

```sh
# Inspect the existing name dictionary; all candidates retain their source.
sixng --game "$GAME" --work "$WORK" names --lookup 6005b689,1aba12c5,7deba6f8

# Decode only selected indexed PSO entries; IDS contains entry IDs/hex offsets.
sixng --game "$GAME" --work "$WORK" pso packs --id-file "$IDS" --out "$OUT"

# Alternatively, reuse an already extracted PSO file from the SixNG checkout.
cargo run --release -p sixng-core --example psodump -- "$PSO" "$OUT_JSON"
```

The selected archive command writes `<OUT>/pso/packs/<offset>.json`. The standalone example includes root, block inventory and all decoded objects. Sources: [CLI definitions/dispatch](https://github.com/holdmysocks/SixNG/blob/80ac18931d007d20b592f4dac7f6a1745610eede/crates/sixng-cli/src/main.rs), [standalone example](https://github.com/holdmysocks/SixNG/blob/80ac18931d007d20b592f4dac7f6a1745610eede/crates/sixng-core/examples/psodump.rs).

If the cached dictionary is insufficient, `sixng --game "$GAME" --work "$WORK" names` rebuilds it from indexed `common.rpf` text/XML/binary entries and shader strings. It does **not** harvest every RBF string in data/packs. The 6stars vocabulary method can broaden the existing pool without a new archive scan:

```sh
# From the pinned 6stars checkout, using existing extracted RBF files.
python3 tools/psonames.py "$PSO" "$RBF_DIR" "$EXTRA_NAMES"
```

That script prints schema/name matches; it is not a complete entity export. Preserve all candidate spellings and sources instead of its first-match dictionary behavior.

## Hash and namespace distinctions

| Implementation | Exact behavior |
| --- | --- |
| SixNG [`meta7a::joaat`](https://github.com/holdmysocks/SixNG/blob/80ac18931d007d20b592f4dac7f6a1745610eede/crates/sixng-core/src/meta7a.rs) / [`names::joaat_exact`](https://github.com/holdmysocks/SixNG/blob/80ac18931d007d20b592f4dac7f6a1745610eede/crates/sixng-core/src/names.rs) | Wrapping unsigned JOAAT32 over UTF-8 bytes. First function lowers ASCII A–Z; exact function does not change case. Exact dictionary entries preserve uppercase spellings; the lowercase dictionary deduplicates case variants within a source. |
| RageForge [`Joaat.cs`](https://github.com/nullbrik/RageForge/blob/5f2726cc554f67464665d5a75da050a2b624bf91/src/RageForge.Core/Hashing/Joaat.cs) | Unsigned 32-bit accumulator; lowers ASCII A–Z while iterating C# UTF-16 characters. Agrees for ASCII tokens; do not assume UTF-8-equivalent behavior for non-ASCII text. |
| PercyStar [`psin::joaat`](https://github.com/rpatty-dev/PercyStar/blob/1c00206f60f1e3e5f02b7fab285ef06db3e08bc2/src/psin.rs) | JOAAT32 over UTF-8 bytes with ASCII lowercase; its built-in name map uses this form. |
| 6stars [`PSO.swift`](https://github.com/meetox80/6stars/blob/480d9a4d00ed11560f7b4d989643723a0f5c451c/Sources/RPFKit/PSO.swift), [`Hash.swift`](https://github.com/meetox80/6stars/blob/480d9a4d00ed11560f7b4d989643723a0f5c451c/Sources/RPFKit/Hash.swift), [`joaat.py`](https://github.com/meetox80/6stars/blob/480d9a4d00ed11560f7b4d989643723a0f5c451c/tools/joaat.py) | Swift `atHash` uses exact UTF-8 bytes. Swift `Hash.joaat` and Python's default lower the string before UTF-8; Python `lower=False` preserves case. Non-ASCII lowercase behavior should not be conflated with SixNG's ASCII transform. |

A **field-name hash** identifies a schema member; its stored **entity/reference value** is separate. For example, exact JOAAT32 of `WeaponSpec` is `0x1aba12c5`, whereas lowercase gives `0x45014b61`. Neither number identifies a particular weapon spec. Likewise, a `WEAPONSPEC_*` token, `WEAPONPRESET_*` token, `WEAPONRECIPE_*` token, `WEAPON_*` entry, model name, texture hash and ItemId must retain distinct roles. A matching hash calculation is a candidate relationship until corroborated in the relevant native field. Full 64-bit structure IDs must remain lossless even where a parser indexes them by their lower 32 bits.

## Concrete next steps and format checks

1. **Follow the definition containers and all typed blocks.** The investigated PSIN root `51e5454170a06c31` has a `Data` field of type `0x5c` referring to a `0x07` element descriptor. SixNG already decodes `0x5c` as count/capacity/pointer and follows polymorphic `0x07` elements. Its root-only appearance is not a complete description of the contained records. Check the auxiliary blocks and relationships, preserving unknown namespaces rather than guessing from numeric equality. [Decoder](https://github.com/holdmysocks/SixNG/blob/80ac18931d007d20b592f4dac7f6a1745610eede/crates/sixng-core/src/meta7a.rs)
2. **Broaden name evidence before adding a new parser.** Reuse literal website spec/preset/recipe tokens, existing XML identifiers and the RBF vocabulary approach. Compare exact and lowercase JOAAT32 separately. Export raw values even when their names remain unknown.
3. **Keep the known decoder differences explicit.** SixNG leaves LSNS undecoded; its `0x65` branch reads the first 64 bits, while 6stars reads 32 bits and treats it as enum-like. SixNG ignores subtype when returning `0x4f` as u64, and its generic unknown-field diagnostic reads up to 16 file bytes without an instance-boundary argument. The observed auxiliary `0x63` at offset 24 in a 32-byte instance therefore needs bounded diagnostics. These are specific research/validation targets, not reasons to withhold existing website identifiers. [SixNG PSO](https://github.com/holdmysocks/SixNG/blob/80ac18931d007d20b592f4dac7f6a1745610eede/crates/sixng-core/src/pso.rs) · [6stars dumper](https://github.com/meetox80/6stars/blob/480d9a4d00ed11560f7b4d989643723a0f5c451c/tools/psodump.py)
4. **Publish the broader crosswalk now.** Flatten the 227 preset and 176 recipe tokens into candidate rows keyed by exact `(domain, token)`, retaining all source element locations and parent-spec relationships. The existing `gtavi.catalog.list` exact `referenceId` plus `identifierDomain` filters already support these rows. Keep website claims, calculated hashes, native observations and save-array mappings distinct; save layout evidence can be added later without blocking lookup coverage.

## What GTA.ZONE does and does not disclose

The [weapons field/source tables](https://negentropy.studio/weapons/) identify `WeaponType`, preset/recipe `Spec` relationships, root suffix `0x70A06C31`, profiles `0x5AD6772F`, elements `0x85492DC3`, attachments `0xA5791C62`, and progress/text sources. These are useful definition selectors and vocabulary. The [about page](https://negentropy.studio/about/) claims Xbox Series build 1.0.2.1; this does not establish the local archive build.

The inspected public pages disclose `lib/meta v5` and `lib/hash64` as source locators, but no parser repository or executable hash64 specification was found in their links. The mentioned 64-bit icon hash domain must not be substituted for a 32-bit weapon or ItemId namespace. Website-published identifiers can still be used directly as attributed lookup candidates. Their public coverage is evidence that a broader directory is feasible; it is not proof that the reviewed open-source parsers already reproduce that entire directory or that a given save array accepts each value.
