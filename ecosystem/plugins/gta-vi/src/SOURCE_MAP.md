# GTA VI beta source migration

The modules here were adapted from SaveRift's beta site at commit
`5f2382b4c997442f0e4de523b63204aaf6cb56a0`. They are SaveRift-authored
code, licensed under Apache-2.0 for this public package. No player save,
credential, bridge token, or private game binary was copied.

| Beta site source | Public connector source | Notes |
| --- | --- | --- |
| `src/gta-vi-ps5-jsav.mjs` | `src/shared/gta-vi-jsav.mjs`, `src/shared/field-names.mjs`, `src/ps5/gta-vi-ps5-zip.mjs` | Split common JSAV inspection, observed field labels, and PS5 ZIP handling. |
| `src/gta-vi-ps5-stats.mjs` | `src/shared/gta-vi-stats.mjs` | Candidate health and armour edits. These fields are not a complete game catalog. |
| `src/gta-vi-ps5-repack.mjs` | `src/ps5/gta-vi-ps5-repack.mjs` | Local decoded ZIP rebuild; unchanged identity files must stay intact. |
| `src/gta-vi-xbox-jsav.mjs` | `src/xbox/gta-vi-xbox-zip.mjs` | Reads local decoded Xbox ZIPs. |
| `src/gta-vi-xbox-repack.mjs` | `src/xbox/gta-vi-xbox-repack.mjs` | Local decoded ZIP rebuild. |
| `src/gta-vi-save.mjs` | `src/xbox/gta-vi-asav.mjs` | ASAV inspection and settings labels. Browser base64 and SHA-256 backup fetch helpers were not migrated. |

The beta `GameJourney.jsx`, `GtaViPreview.jsx`, `GtaViSaveWorkbench.jsx`,
`GtaViPs5Workbench.jsx`, and `GtaViXboxDecodedWorkbench.jsx` remain site UI.
They depend on React, local bridge authorization and `fetch`, browser File/Blob
downloads, and SaveRift account backup routes. The public connector must receive
selected bytes through the documented bounded host contract instead of
performing account or console transport itself.

The Xbox and PS5 ZIP readers use `Blob` and `DecompressionStream` only when an
entry uses ZIP deflate. Those functions need a host-supported ZIP service or a
compatible bounded decoder before use inside the isolated runtime. The JSAV
reader preserves JSON integers outside JavaScript's exact integer range as
decimal strings and marks affected blocks as read-only, because an edit could
otherwise silently round them. It does not imply that edited
bytes have been accepted by either console in game.

`field-names.mjs` and the ASAV settings labels are provisional save-field
mappings, not the public source of truth for the full GTA VI game world.
Future game catalog data belongs in `data/` with evidence and platform scope.
