"""Small public-media evidence helpers. No network or game access on import."""
from collections import defaultdict
from urllib.parse import urljoin, urlsplit

ORIGIN = "https://negentropy.studio"


def media_url(path, prefix="/media/"):
    if (not isinstance(path, str) or not path.startswith(prefix) or path.startswith("//") or
            ".." in path.split("/") or "\\" in path or "%" in path):
        raise ValueError("Unexpected media locator")
    parsed = urlsplit(urljoin(ORIGIN, path))
    if (parsed.scheme != "https" or parsed.netloc != "negentropy.studio" or
            parsed.query or parsed.fragment or not parsed.path.startswith(prefix) or "%" in parsed.path or
            "\\" in parsed.path or ".." in parsed.path.split("/")):
        raise ValueError("Unexpected media origin or path")
    return parsed.geturl()


def preview_ref(row, pointer):
    if len(row) < 6 or row[5] in (None, 0):
        return None
    value = row[5]
    if (not isinstance(value, list) or len(value) not in (3, 5) or
            any(type(n) is not int or n <= 0 for n in value[1:3])):
        raise ValueError("Unknown image descriptor")
    out = {"url": media_url(value[0]), "width": value[1], "height": value[2],
           "sourceLocation": pointer + "/5", "retrievalStatus": "listed-not-fetched"}
    if len(value) == 5:
        if type(value[4]) is not int or value[4] <= 0:
            raise ValueError("Invalid thumbnail width")
        out["thumbnail"] = {"url": media_url(value[3]), "width": value[4],
                            "sourceLocation": pointer + "/5/3"}
    return out


def exact_image_matches(records, entity_source="vehicles"):
    """Return unique gallery matches; identical hash with different dimensions is not a match."""
    gallery = defaultdict(list)
    for row in records:
        if row.get("status") == "ok" and row["source"] == "images":
            gallery[(row["width"], row["height"], row["pixelSha256"])].append(row)
    matches, ambiguous, unmatched = [], [], []
    for row in records:
        if row.get("status") != "ok" or row["source"] != entity_source:
            continue
        candidates = gallery[(row["width"], row["height"], row["pixelSha256"])]
        if len(candidates) == 1:
            match = candidates[0]
            matches.append((row, match, "identical-webp-bytes" if row["sha256"] == match["sha256"]
                            else "identical-decoded-rgba"))
        elif candidates:
            ambiguous.append((row, candidates))
        else:
            unmatched.append(row)
    return matches, ambiguous, unmatched


def model_matches(source_rows, model_rows):
    """Use exact model token or exact preview URL. Preserve ambiguous matches."""
    tokens, pictures = defaultdict(list), defaultdict(list)
    for i, row in enumerate(model_rows):
        tokens[row[2]].append((i, row))
        if len(row) > 5 and row[5]:
            pictures[media_url(row[5][0])].append((i, row))
    results = []
    for i, row in enumerate(source_rows):
        candidates = tokens.get(row[2], [])
        method = "exact-published-model-token"
        if not candidates and len(row) > 5 and row[5]:
            candidates = pictures.get(media_url(row[5][0]), [])
            method = "exact-preview-image-url"
        results.append({"sourceIndex": i, "sourceRow": row, "method": method if candidates else None,
                        "matches": candidates, "status": "unique" if len(candidates) == 1
                        else "ambiguous" if candidates else "unmatched"})
    return results
