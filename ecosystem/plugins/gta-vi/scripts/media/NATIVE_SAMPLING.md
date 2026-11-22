# Bounded native UI texture sampling

`sample_native_ui.py` uses an existing maintainer-held read-only index and
verified HTTP range transport. It creates a sparse research mirror sufficient
for selected texture decoding. It never claims that mirror is a complete
archive or that the complete archive member was hashed during this run.

The command-line options remain:

```text
--database <research-index.sqlite>
--config <private-range-transport-config.json>
--transport <existing-range-transport.py>
--decoder <verified-sixng-executable>
--output <new-output-directory>
--store data/ttdb/ui/ttdb_ui.ttpf
--hash <16-hex-character-hash>  (repeat for each selected texture)
```

Omit `--hash` to produce a metadata listing only. The output directory must not
exist. A failed or completed run is retained as evidence; use a new directory
for another invocation. The source configuration remains private and is never
copied into the receipt.

The transport must provide `configuration()` and `fetch_range(start, count)`.
The configuration identifies the expected source size and the expected 64-byte
archive-prefix SHA-256. Each range must return exactly the requested bytes.
Reads are bounded to the source and member extents and to 32 MiB per request;
selected compressed texture chunks have a 128 MiB aggregate budget. The
receipt records each requested range separately, including overlapping
metadata requests, and includes the 64-byte prefix in `downloadedBytes`.

The receipt pins the decoder and transport files by SHA-256. The historical
whole-member SHA-256 from the index is labeled `memberHashEvidence` with
`basis: "historical-index"` and `verifiedThisRun: false`. Only the recorded
downloaded ranges are independently hashed by this invocation.

## Decode completion

The sampler's default output scope is mip 0, slice 0. A successful process
exit is insufficient: SixNG can return per-texture error records while exiting
zero. The verifier requires exactly one result for every requested hash,
`partial: false`, zero undecoded bytes, the requested slice and a current PNG
under the new decode directory. Its filename must match the requested hash.
The PNG signature and IHDR dimensions must match the result, and its complete
bytes are hashed. Missing, duplicate, unexpected, symlinked or outside files
fail verification. Unreported PNGs in the output directory also fail.

Raw decoder stdout/stderr remain available for failed or partial results, but
those results are not listed as verified PNGs. A failed decode verification
sets `decodeStatus: "failed"` and returns a nonzero process status. A listing
without selected hashes reports `listed`.

Complete decoding is separate from visual verification and semantic naming.
The selected observations retain `visualVerified: false`; identifying the
image and linking it to an entity requires a separate review.

## Offline checks

Run only synthetic fixtures with:

```sh
python -m unittest discover \
  -s ecosystem/plugins/gta-vi/scripts/media \
  -p 'test_sample_native_ui.py'
```

The 17 tests exercise complete and failed decode records, partial results,
missing/duplicate/unrequested hashes, stale/outside/symlink PNGs, PNG dimensions,
fresh output creation, source/member read bounds, exact response length and
prefix-inclusive byte accounting. They make no network requests and use no
game files or player saves.
