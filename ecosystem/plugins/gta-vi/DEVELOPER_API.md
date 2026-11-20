# GTA VI connector API (experimental)

Package: `saverift.gta-vi`. Runtime profile: `isolated-js-v1`. The host selects
one `memory`, `jsav` or `main` artifact containing decoded JSAV `memory.dat`,
and may select one `chives` artifact. Hints must identify
`grand-theft-auto-vi` (or `gta-vi` / `saverift.gta-vi`) and platform `xbox` or
`ps5`. The runtime hashes selected artifacts and fails closed on a mismatch.

`detect` returns `supported`, `not_a_match` or `recognized_unsupported`.
`open` returns a digest-bound handle and a summary. `describe` advertises
`gtavi.inspect` version `0.1.0`, with no write operations. `query` supports:

| Method | Result |
| --- | --- |
| `gtavi.inspect` | Format, platform, source digest, block counts, labeled field count, exact-integer flag and any observed completion/time metadata. `fieldCount` is retained as an alias of `labeledFieldCount`; it does not count every distinct hash key. |
| `gtavi.fields.list` | Bounded field page; `params.offset` starts at 0 and `params.limit` is clamped to 1-50. |
| `gtavi.catalog.categories` | Public catalog category names and entry counts. |
| `gtavi.catalog.list` | One category from `characters`, `vehicles`, `weapons`, `clothing`, `items`, `currencies`, `locations`, `activities`, `systems`; bounded to 25 entries per page. |

`plan` and `validate` reject with `GTAVI_READ_ONLY`. A catalog entry, parser
match or decoded artifact does not authorize a save change. The host owns
account and title binding, immutable package locks, permissions, player review
and any later export or restore action.
