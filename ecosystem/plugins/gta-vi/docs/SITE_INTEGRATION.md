# Beta site integration boundary

This package consolidates GTA VI's shared save inspection and the public game
catalog. The current customer-facing beta still contains its own React screens
and platform transport. This source migration does not silently switch the live
site to the plugin runtime.

| Layer | Current beta owner | Public package destination |
| --- | --- | --- |
| GTA VI game identity and library preview | `src/gta-vi-preview.mjs`, `src/GtaViPreview.jsx` | Host game selection; package manifest declares both targets |
| Decoded JSAV inspection and field labels | `src/gta-vi-ps5-jsav.mjs`, `src/gta-vi-ps5-stats.mjs` | Shared parser and game catalog save mappings |
| Xbox decoded archive checks and local draft ZIP | `src/gta-vi-xbox-jsav.mjs`, `src/gta-vi-xbox-repack.mjs` | Xbox adapter; host retains download and cloud authorization |
| PS5 decoded archive checks and local draft ZIP | `src/gta-vi-ps5-jsav.mjs`, `src/gta-vi-ps5-repack.mjs` | PS5 adapter; host and bridge retain Device Transfer and GarlicSaves workflow |
| Account, bridge and approval UI | SaveRift site and local bridge | Trusted host, outside the public game package |

The public runtime initially inspects one selected **decoded** JSAV artifact. A
successful parse, ZIP rebuild or local reopen does not prove that an edited
save loads in the game. Xbox cloud submission and PS5 console restore remain
separate platform validations; the package must not advertise either operation
until the trusted host and an in-game acceptance test support it.

Before cutting the site over, bind its selected game and platform to the
manifest's logical target, pass only the chosen decoded artifact into the
isolated runtime, render catalog labels from one reviewed revision, and keep
bridge credentials, player saves and transport outside the package. Test both
platforms with synthetic files and an explicit wrong-platform rejection.
