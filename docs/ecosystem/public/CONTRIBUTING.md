# Contributing

Contribute original or appropriately licensed code. Preserve authorship,
copyright, SPDX and NOTICE entries, record source revisions for adaptations,
and list data/artwork permission separately. Sign off each contribution using
the Developer Certificate of Origin 1.1 (`git commit -s`); sign-off affirms the
right to contribute under the stated license, not exclusive ownership. The
DCO text is at <https://developercertificate.org/>. No copyright assignment is
requested by this preview.

Keep changes reviewable: explain the format/behavior, tests, unknown fields,
declared API/version compatibility, affected domains and candidate validation.
Include synthetic input and one intentionally failing case. Game acceptance
claims require actual scoped evidence, with lawful private inputs retained
privately. Do not submit player saves or credentials as fixtures.

## Game catalog contributions

The public game catalog describes the game itself: characters, items, vehicles,
weapons, clothing, locations, activities, stats, currencies and related systems.
Save-field mappings are a separate crosswalk into that catalog. A game entity
does not become an editable save field merely because its name or identifier
appears in a file.

Submit each catalog claim with its source, exact revision or game build when
known, platform applicability, extraction method, and confidence level. Keep
native identifiers as strings and use stable namespaced catalog IDs; display
names are labels, not identifiers. Mark unknown values as unknown rather than
guessing. Cite public evidence where possible and explain any independently
verified observation without including private player data. Include the
validation result for a new save mapping, especially whether it survived a
game load after a round trip.

Do not commit game archives, extracted assets, player saves, account data,
tokens, or artwork without redistribution rights. Store catalog records and
source references as reviewable text. A code license does not grant rights to
game data or images.

Do not broaden licenses, bypass DLC entitlements, invent unsupported game
semantics, mark self-authored packages verified or add a direct cloud writer.
Service/registry eligibility is separate from standard open-source licensing.

For GTA VI, submit catalog and connector changes to the public
`SaveRift/SaveRift-Ecosystem` repository and use its issue tracker for public
discussion. The review team and private security contact are still pending;
do not post credentials, player saves, or nonpublic vulnerability details in
an issue. Other projects may have different submission destinations.

Be respectful and specific. Do not harass contributors, publish another
person's information or retaliate over good-faith reports. Maintainers may
remove abusive content while preserving technical review/dispute evidence.
