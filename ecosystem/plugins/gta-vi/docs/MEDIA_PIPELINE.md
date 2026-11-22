# GTA VI catalog media pipeline

## Result

Existing 2D vehicle cards and inventory-style images are present in the retained
native UI texture store. Nine selected native textures decoded to PNG
without rendering a 3D model: six vehicle cards, a grenade, a mask, and another
grenade image. Three vehicle cards have exact named associations for Thrax, Emerus
and Vitello. Their dimensions and alpha channels exactly match the corresponding
published gallery WebPs. RGB differences are small and consistent with the web
images having lossy encoding; they are **not** byte-identical image files.

The source website also lists ready-made 3D model posters. Three sampled model
pages expose real GLB 2 files, but their GLB JSON has one material and no textures
or embedded images. These samples support a geometry preview, not a fully textured
model claim.

The catalog's identifier, presentation, native-asset and save-write evidence remain
separate. A model name or a texture hash does not establish a writable save-array
identifier. No media lookup changes any editability or console-acceptance flag.

## Pinned source inventories

The section pages were read from `https://negentropy.studio`, which brands itself
GTA.ZONE and uses `https://gta.zone` in its canonical tags. The fetched origin is
preserved in the evidence. JSON URLs were discovered through `script#gz-cfg` at
`/ds/url`.

| Source | Records | SHA-256 |
| --- | ---: | --- |
| [Image inventory](https://negentropy.studio/assets/data/en/imagenes.7156e004db.json) | 4,908 | `bcb3a6273cc7a59d9b887787359bd270ffd51d91a96f5e9fa2e97cad51117aca` |
| [Model inventory](https://negentropy.studio/assets/data/en/modelos-3d.e8c2626663.json) | 905 | `71754a044e394bb1599be0615a23cd93e9b7a7380646d4b5d90b434c405bedac` |

Image groups include 411 vehicle images, 359 weapon/item images, 1,523 customization
images, and 2,615 other UI, map, loading-screen and logo images. These are asset
counts, not counts of independently identified inventory items. The 359 group,
for example, includes a mask in the six inspected samples.

The image inventory supplies 3,351 `ttpf` texture-hash locators and 1,557 RPF
resource-offset locators. Image fields record original dimensions, DXGI format,
archive, mip count where reported, tiling, source locator and name hash. The
displayed WebP dimensions are separately recorded because some images are resized.

| Model category | Records |
| --- | ---: |
| Vehicles | 327 |
| Weapons and equipment | 78 |
| Weapon attachments | 65 |
| Ammo | 25 |
| Animals | 249 |
| Map objects | 161 |

Model records carry the main resource name, assembled component names, unmounted
parts where reported, source archive/offset, LOD, geometry counts and published GLB
size. These are website claims until independently checked against the retained
archive.

The full normalized references are in
[research/media-discovery.json](research/media-discovery.json). This research file
is outside the runtime data modules, so its full provenance does not increase the
catalog package's UI message or module budgets.

## Associations that are actually supported

`model-preview-joins.json` preserves only exact model-token or identical preview
URL associations. It has 321 vehicle associations (305 exact published model
tokens and 16 identical preview URLs), 16 weapon associations by identical preview
URL, and 414 associations among all raw hunting-source rows. The hunting count
includes source roles beyond the 294 retained Item leaves; it must not be presented
as 414 distinct usable loot items. Shared animal art remains shared art.

The media descriptor at `/e/N/5` is either `[path,width,height]` or
`[path,width,height,smallPath,smallWidth]`. Five elements mean a smaller display
variant is supplied. They do **not** mean the image is a 3D render. The weapon
source has 103 `/media/armas/iconos/` paths, 16 global model-poster paths, and seven
prop-preview paths among its 126 image-bearing rows.

The vehicle pixel-matching pass compares named vehicle cards with the 411
hash-keyed gallery vehicle images. A match requires equal dimensions and an exact
RGBA digest, with exactly one gallery candidate. Equal file digests are recorded
as the stronger `identical-webp-bytes` case. Similar-looking images and ambiguous
matches are never promoted. This proves a relationship between two public image
records; native extraction supplies the independent archive evidence.

The completed pass successfully read all 738 selected images: 327 named cards and
411 gallery images. It found 163 unique, **byte-identical WebP** pairs, zero
ambiguous matches and 164 unmatched named cards. The unmatched cards still have
usable image locators; they simply lack this exact native-hash association. See
[research/vehicle-texture-image-matches.json](research/vehicle-texture-image-matches.json).

## Native sample

All six initial targets are in `data/ttdb/ui/ttdb_ui.ttpf`. Their source inventory
rows and raw locator fields are retained in
[research/native-texture-targets.json](research/native-texture-targets.json).

| Texture hash64 | Image source row | Dimensions | Observed content |
| --- | --- | --- | --- |
| `004ef76ff74d061f` | `/e/1794` | 512 × 256 | Red convertible vehicle card |
| `00ad573676eea1d9` | `/e/1795` | 512 × 256 | Camo golf-cart vehicle card |
| `00e4d44b9673e9bb` | `/e/1796` | 512 × 256 | Dually pickup vehicle card |
| `003e52728a6b40a5` | `/e/2205` | 512 × 256 | Grenade image |
| `006e46ec196a4acc` | `/e/2207` | 256 × 256 | Mask image |
| `01b94a1a124468f2` | `/e/2209` | 512 × 128 | Grenade image |
| `28c4c20d17bacb7f` | `/e/1866` | 512 × 256 | Thrax card; named vehicle row `/e/0` |
| `bb19b32e7e3ee2f5` | `/e/2113` | 512 × 256 | Emerus card; named vehicle row `/e/1` |
| `f58a649e2e0d28e3` | `/e/2194` | 512 × 256 | Vitello card; named vehicle row `/e/2` |

The independently decoded PNGs match the web samples' dimensions and alpha
exactly. Overall mean absolute RGB difference is 0.51–1.99 on a 0–255 scale;
PSNR is 33.96–40.34 dB. These measurements are appearance corroboration, not a
lossless-equivalence claim. The sanitized comparison is in
[research/native-web-image-comparison.json](research/native-web-image-comparison.json).

All nine native decodes report `partial:false` and `undecoded_bytes:0`; their
source chunks use codec `0x20` (zlib), so these samples do not depend on the fitted
BCPack tables described below. The independent proof checks actual output files,
dimensions, all 10,013 native texture keys and the six initial descriptor/chunk
records against the retained baseline. The total source bytes read for both
samples and two prefix checks were 1,331,418. See
[research/native-preview-verification.json](research/native-preview-verification.json).

## Reusable extraction tools

[SixNG v0.5.0](https://github.com/holdmysocks/SixNG/releases/tag/v0.5.0), source commit
`606faf782c9e2fb01c5d67dc8d6c415fe9320128`, has a portable Windows CLI. The published
10,272,167-byte ZIP has SHA-256
`573299335cf0e2c5d89d5d2449c91775454cc5a77f8889ce27fb0b4bcdb95af7`.

This release adds BCPack BC3 and BC7 decoding to BC1. The BC3/BC7 tables were fitted
from neighboring mips. BC7 can have speckled blocks near the start of a chunk;
`partial:false` in a CLI result is not proof of perfect pixel reconstruction.
SixNG's current TTPF adapter drops the decoder's `unfitted_blocks` count when it
returns `.blocks`, so visual verification remains a separate evidence field.

Useful existing commands, with a user-supplied archive folder:

```powershell
sixng.exe --game C:\Game --work C:\MediaWork ttpf data/ttdb/ui/ttdb_ui.ttpf
sixng.exe --game C:\Game --work C:\MediaWork ttpf data/ttdb/ui/ttdb_ui.ttpf --hash 004ef76ff74d061f --out C:\MediaOut
sixng.exe --game C:\Game --work C:\MediaWork extract data --rtype txd -o C:\MediaOut
```

`ttpf --all` is appropriate only for a complete local store. The named data.rpf
TXDs include HUD, phone, blip, loading-screen and vehicle-gauge resources. The
UI store carries hashes rather than recovered names. Texture shaders use the same
64-bit store keys; `model.json` records those material-slot references.

For resources without usable 2D images, SixNG exports GLB plus textures and has
an existing screenshot command and 256-pixel thumbnail cache. The GUI thumbnails
are generated by its renderer; their existence is not evidence of a pre-existing
game thumbnail. Relevant source paths are `crates/sixng-core/src/ttpf.rs`,
`texture.rs`, `gfx10.rs`, `export.rs`, and
`crates/sixng-gui/src/thumbs.rs`. The `uisheet` example emits contact sheets with a
cell-to-hash JSON mapping. SixNG's source is GPL-3.0-only; no SixNG implementation
or third-party source is copied into this package.

## Bounded range extraction

A full 845 MB UI store download is unnecessary for selected hashes. A sparse
local mirror preserves the original metadata and only the required compressed
spans. SixNG itself uses local file seeks, so the range adapter remains outside it.

1. Read the 24-byte RDS5 header, then its `n × 8` chunk table at byte 24.
2. Read the ETPF header at `align256(0x10 + 8*n)`, then all `16*nt` descriptor
   bytes and `8*nt` texture-key bytes. Keeping the complete descriptor table lets
   the CLI correct mip counts using adjacent texture locations.
3. List the metadata-only mirror with `sixng ttpf`. Use the returned corrected
   `virt` and `size` for each selected hash. Read every compressed span intersecting
   `[virt, virt + min(size,64 MiB))` from the pinned original member.
4. Write those bytes at their original file offsets. Retain a separate receipt
   for fetched ranges and reject decoding unless all required bytes are present.
5. Decode only explicitly selected hashes. Do not run `--all` against a sparse
   mirror, where unpopulated holes would look like zero-filled data.

The parser's chunk coordinates are `fileOffset=(a&0xffffff)<<8`,
`virtualOffset=0x1000+(b&0xfffff)*0x4000+(a>>30)*0x1000`,
`codec=(a>>24)&0x3f`, `padding=b>>20`; packed length comes from the next file
offset minus the current file offset and padding. Descriptor/key index equality
is the native hash relationship. No filename-to-hash algorithm is assumed.

The existing HTTP range scanner checks HTTP 206, exact `Content-Range`, response
length and stable source validators. Keep the retained RAR member identity and
header pins when translating member-relative offsets. The index's historical
span/virtual/codec representation is normalized before comparison; it must not be
mistaken for the decoder's own coordinate convention.

## Model URL resolution

Every model row has a directly listed poster URL and a detail page. Fetch the
detail page on demand and read `.v3d[data-model]`; require the exact fetched origin,
`/media/3d/` prefix and `.glb` extension. Do not fabricate a model URL by replacing
parts of the poster path. Only three observed model URLs are populated in the
research manifest; the other rows retain the deterministic resolver contract.

The Airport Bus, ADB rifle and angled-grip samples expose GLB 2 headers and JSON.
Only those header/JSON ranges were inspected, not their full geometry buffers.
The JSON has no external buffer URI, images, textures or required extensions.
This verifies the container metadata and the existence of geometry descriptions,
not a complete rendering test or current cross-origin embedding policy.

## Rebuilding research evidence

The original helper scripts live in `scripts/media`. The metadata exporters take
locally retained source JSON, require the reviewed source SHA-256 values, and
output metadata only.
Use Python 3.10 or later. The image matcher and materializer also require Pillow;
the metadata exporters use the standard library.
For the join builder, supply `3d-models.json`, `vehiculos.json`, `armas.json`,
`bebidas-y-drogas.json` and `piezas-caza.json` in one input directory.

```bash
python scripts/media/export_media_manifest.py --inputs INPUTS --out MEDIA.json
python scripts/media/build_model_preview_joins.py --inputs INPUTS --out JOINS.json
python scripts/media/match_media_pixels.py --inputs INPUTS --out RECEIPTS
python -m unittest discover -s scripts/media -p 'test_*.py' -v
```

The pixel matcher is a bounded, resumable public-media read: six workers, 400 KB
maximum per image and a 32 MiB per-run budget. It stores content digests and source
associations. It does not embed artwork in the repository. The synthetic tests
cover URL boundaries, missing images, both descriptor shapes, exact equality,
dimensions, ambiguous duplicates and model-token versus image-URL associations.

## Private image asset pack

The rich detail sidecars expose 762 image observations for 756 catalog records:
327 vehicles, 126 weapon specs and 303 items. Repeated animal art and associated
drink-model art retain their source roles. These references use 554 distinct image
URLs. Source locators are suitable inputs to host asset registration; they are not
host asset IDs and do not bypass the plugin's existing content security policy.

The reviewed private run materialized all 554 URLs successfully into 554 immutable
WebP files totaling 10,938,236 bytes, with all 762 catalog/media bindings complete.
All 327 vehicle images matched their independent prior SHA-256 receipts. The
source sidecar hashes remained unchanged, and the generated copies differed only
in media `assetId` and `availability` fields. New response bodies totaled
10,905,552 bytes; three named vehicle samples were reused locally.

`materialize_media_assets.py` reads the sidecars without changing them. It verifies
the response MIME type, decoded WebP format, exact published dimensions and any
independently recorded SHA-256. It limits concurrency to six requests, a response
to 1 MiB, and the combined response-body budget to 32 MiB. Existing local samples
and successful prior receipts can be reused. No model buffers are downloaded.

```bash
python scripts/media/materialize_media_assets.py \
  --details data/details --out PRIVATE_ASSETS \
  --expected-hashes RECEIPTS/vehicle-image-hashes.jsonl \
  --sample-receipts RECEIPTS/sample-media-receipts.json \
  --bind-details
```

The private output contains `assets/<sha256>.webp`, a manifest with immutable
`gta-vi:media:<sha256>` identities and catalog-record/media-index bindings, and
optional copies under `bound-details` with the IDs assigned. The originals in
`data/details` keep `assetId:null`. The host must register the files and use the
bound copies before these IDs resolve. No asset upload or public publication is
performed. Image binaries and materialized sidecars stay outside this repository.
