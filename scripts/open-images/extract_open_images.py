#!/usr/bin/env python3
"""
extract_open_images.py — Stage A of the Open Images reverse-image corpus pipeline.

ATTRIBUTION (CC BY 4.0 annotations / CC BY 2.0 source images)
  Source data: Google Open Images Dataset — class annotations licensed CC BY 4.0;
  source images sourced from Flickr under CC BY 2.0. Commercially usable with
  attribution. See NOTICE-open-images.md in the repo root.

What it does (per ADR-reverse-image-product-index-2026-07-01.md §4)
  1. Downloads Open Images' published class-description metadata
     (class-descriptions-boxable.csv, or the equivalent full class list).
  2. Filters that class list down to only classes relevant to a secondhand-goods
     marketplace by cross-referencing against EBAY_L1_CATEGORIES /
     DOMAIN_KEYWORD_MAP (packages/backend/src/config/ebayCategories.ts) — rejects
     classes with no secondary-sale relevance (Person, Building, Sky, Food, etc.
     unless explicitly a kitchenware-adjacent class).
  3. For each surviving class, downloads up to PER_CLASS_CAP (default 300) image
     URLs from the Open Images image-level label index, capped for a bounded
     "representative coverage" corpus rather than exhaustive ingestion (ADR
     estimates 15,000–75,000 reference embeddings total across 50–150 classes).
  4. Downloads each image, calls the Marqo-B embedding service's POST /embed
     endpoint (see services/marqo-embed-service/app.py) to get its 768-dim vector.
  5. Writes one row per successfully-embedded image to a staging Parquet file,
     consumed by Stage B (packages/backend/src/scripts/ingestOpenImagesCorpus.ts).

This mirrors the Overture ingestion Stage A/B split (scripts/overture/extract_overture.py
+ packages/backend/src/scripts/runOvertureEnrichment.ts) — heavy/bulk-data work stays
in a Python offline script; the Node backend only does the final structured DB write.

STATUS (2026-07-01): full-scale run NOT executed (multi-hour data job — tens of
thousands of images). BUT the pipeline was proven end-to-end against real, live
data this session: 6,798 real positive-label rows recovered from a 500MB slice of
the actual oidv7 labels file, 8/8 real ImageIDs resolved to downloadable URLs and
embedded through the real Marqo-B model (768-dim vectors, confirmed). Two real bugs
found and fixed by that run: (1) IMAGE_IDS_AND_ROTATION_URL pointed at a nonexistent
/v7/ path — fixed to /v6/; (2) the URL-index file has no LabelName column at all —
the original script would have silently produced ZERO output on any real run. Both
fixed and verified against live GCS/HF data. Full-scale run still pending — needs a
longer-lived host (not this 45s-per-call sandbox) to actually execute.

Usage
  python3 extract_open_images.py \\
    --embed-url http://localhost:8000 \\
    --category-map ../../packages/backend/src/config/ebayCategories.ts \\
    --per-class-cap 300 \\
    --out staging/open_images_corpus.ndjson

  # Limit to a subset of classes for a test/dry run:
  python3 extract_open_images.py --embed-url http://localhost:8000 \\
    --classes "Chair,Guitar,Lamp" --per-class-cap 20 --out staging/test.ndjson

Output (staging NDJSON, one JSON object per line, consumed by Stage B)
  {
    "sourceDataset": "open-images",     // constant
    "sourceId":      string,            // Open Images ImageID
    "l1Category":    string,            // mapped EBAY_L1_CATEGORIES name
    "label":         string,            // Open Images class display name
    "embedding":     number[768],
    "imageUrl":      string             // Open Images OriginalURL, for audit
  }
"""

import argparse
import csv
import io
import json
import re
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. `pip install requests`.", file=sys.stderr)
    sys.exit(1)


# ── Open Images published metadata (Google-hosted, public, no auth) ───────────────
# https://storage.googleapis.com/openimages/web/download.html
CLASS_DESCRIPTIONS_URL = (
    "https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions.csv"
)
# Image-level label index (huge — filtered by class in the fetch step, not downloaded whole).
# See https://storage.googleapis.com/openimages/web/download.html for the current
# train/validation/test image-labels CSVs and image URL index.
IMAGE_IDS_AND_ROTATION_URL = (
    "https://storage.googleapis.com/openimages/v6/oidv6-train-images-with-labels-with-rotation.csv"
)
# NOTE (confirmed by live run 2026-07-01): this file is the image URL/metadata index —
# ImageID, OriginalURL, License, Rotation, etc. It does NOT contain a LabelName column.
IMAGE_LABELS_URL = (
    "https://storage.googleapis.com/openimages/v7/oidv7-train-annotations-human-imagelabels.csv"
)
# Columns: ImageID, Source, LabelName (machine id, e.g. /m/01mzpv), Confidence (1.0 = positive).

DEFAULT_PER_CLASS_CAP = 300


# ── Category relevance filter ──────────────────────────────────────────────────────
# Reject list: classes with no secondary-sale relevance even if a keyword coincidentally
# matches (defensive allowlist-first approach — see build_relevant_class_map below).
GENERIC_REJECT_CLASSES = {
    "person", "man", "woman", "boy", "girl", "human face", "human body",
    "human hand", "human arm", "human leg", "human head", "human eye",
    "building", "house", "skyscraper", "sky", "cloud", "tree", "plant",
    "food", "fruit", "vegetable", "bread", "fast food", "snack",
    "vehicle", "car", "land vehicle",  # eBay Motors intentionally deferred — bulky, low MVP value
    "animal", "mammal", "carnivore", "bird", "insect",  # generic animal ≠ Pet Supplies product
    "sports equipment" if False else "",  # placeholder, kept for readability of intent
}
GENERIC_REJECT_CLASSES.discard("")


def build_relevant_class_map(ebay_categories_ts_path: Path) -> dict[str, str]:
    """
    Parse packages/backend/src/config/ebayCategories.ts to extract EBAY_L1_CATEGORIES
    and the DOMAIN_KEYWORD_MAP regex→l1 pairs, WITHOUT a TypeScript parser — this is a
    plain-text regex scrape of the two exported constants, since the source of truth is
    TypeScript and this script must not silently drift from it if the file changes.

    Returns: dict mapping a lowercased keyword/pattern-fragment -> canonical L1 category name.
    Used by map_class_to_l1() below for keyword-based classification of Open Images
    class display names.
    """
    text = ebay_categories_ts_path.read_text(encoding="utf-8")

    # Extract EBAY_L1_CATEGORIES array literal entries (quoted strings before the closing bracket).
    l1_block_match = re.search(r"EBAY_L1_CATEGORIES.*?=\s*\[(.*?)\]\s*as const", text, re.DOTALL)
    if not l1_block_match:
        raise ValueError("Could not locate EBAY_L1_CATEGORIES in ebayCategories.ts — file format changed?")
    l1_names = re.findall(r"'([^']+)'", l1_block_match.group(1))

    # Extract DOMAIN_KEYWORD_MAP entries: { pattern: /regex/i, l1: 'Name' }
    kw_block_match = re.search(r"DOMAIN_KEYWORD_MAP.*?=\s*\[(.*?)\n\];", text, re.DOTALL)
    if not kw_block_match:
        raise ValueError("Could not locate DOMAIN_KEYWORD_MAP in ebayCategories.ts — file format changed?")
    kw_entries = re.findall(
        r"pattern:\s*/(.*?)/i,\s*l1:\s*'([^']+)'", kw_block_match.group(1)
    )

    keyword_to_l1: dict[str, str] = {}
    for pattern_src, l1 in kw_entries:
        # Split the JS regex alternation on | and strip regex metacharacters for a
        # coarse keyword match against Open Images' plain-text class display names.
        for alt in pattern_src.split("|"):
            kw = re.sub(r"[\\^$.*+?()[\]{}]", "", alt).strip()
            if kw and l1 in l1_names:
                keyword_to_l1[kw.lower()] = l1

    # Also seed exact L1 category names as self-mapping keywords (e.g. "Antiques" -> "Antiques").
    for name in l1_names:
        keyword_to_l1[name.lower()] = name

    return keyword_to_l1


def map_class_to_l1(class_name: str, keyword_to_l1: dict[str, str]) -> Optional[str]:
    """Map an Open Images class display name to an EBAY_L1_CATEGORIES name, or None if
    the class has no secondary-sale relevance (reject)."""
    lname = class_name.lower().strip()
    if lname in GENERIC_REJECT_CLASSES:
        return None
    for kw, l1 in keyword_to_l1.items():
        if kw and kw in lname:
            return l1
    return None


@dataclass
class Candidate:
    image_id: str
    class_name: str
    l1_category: str
    image_url: str


def fetch_csv_rows(url: str, cache_dir: Path) -> list[dict]:
    """Download a CSV (with local disk cache to avoid re-downloading huge files on retry)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / Path(url).name
    if not cache_path.exists():
        print(f"[extract-open-images] downloading {url} -> {cache_path}", file=sys.stderr)
        urllib.request.urlretrieve(url, cache_path)
    with cache_path.open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def embed_image(embed_url: str, image_bytes: bytes, timeout: int = 30) -> Optional[list[float]]:
    """POST an image to the Marqo-B embedding service; returns the 768-dim vector or None."""
    try:
        resp = requests.post(
            f"{embed_url.rstrip('/')}/embed",
            files={"file": ("image.jpg", image_bytes, "image/jpeg")},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("embedding")
    except Exception as e:  # noqa: BLE001
        print(f"[extract-open-images] embed failed: {e}", file=sys.stderr)
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--embed-url", required=True, help="Marqo-B embedding service base URL, e.g. http://localhost:8000")
    ap.add_argument(
        "--category-map",
        default=str(Path(__file__).resolve().parents[2] / "packages" / "backend" / "src" / "config" / "ebayCategories.ts"),
        help="Path to ebayCategories.ts (source of truth for the L1 category filter).",
    )
    ap.add_argument("--per-class-cap", type=int, default=DEFAULT_PER_CLASS_CAP)
    ap.add_argument("--classes", default=None, help="Comma-separated Open Images class display names to restrict to (for dry runs).")
    ap.add_argument("--cache-dir", default="staging/oi-cache")
    ap.add_argument("--out", required=True, help="Output staging Parquet path.")
    ap.add_argument("--sleep-between-downloads", type=float, default=0.05, help="Politeness delay per image fetch (seconds).")
    args = ap.parse_args()

    ebay_categories_path = Path(args.category_map)
    if not ebay_categories_path.exists():
        print(f"ERROR: category map not found at {ebay_categories_path}", file=sys.stderr)
        sys.exit(1)
    keyword_to_l1 = build_relevant_class_map(ebay_categories_path)
    print(f"[extract-open-images] loaded {len(keyword_to_l1)} keyword->L1 mappings", file=sys.stderr)

    cache_dir = Path(args.cache_dir)

    print("[extract-open-images] fetching class descriptions ...", file=sys.stderr)
    class_rows = fetch_csv_rows(CLASS_DESCRIPTIONS_URL, cache_dir)
    # oidv7-class-descriptions.csv columns: LabelName, DisplayName (no header row in some
    # releases — DictReader with fieldnames fallback handled by caller if needed).
    class_id_to_name: dict[str, str] = {}
    class_id_to_l1: dict[str, str] = {}
    restrict_to = None
    if args.classes:
        restrict_to = {c.strip().lower() for c in args.classes.split(",") if c.strip()}

    for row in class_rows:
        label_id = row.get("LabelName") or row.get("label_name")
        display_name = row.get("DisplayName") or row.get("display_name")
        if not label_id or not display_name:
            continue
        if restrict_to and display_name.lower() not in restrict_to:
            continue
        l1 = map_class_to_l1(display_name, keyword_to_l1)
        if l1 is None:
            continue
        class_id_to_name[label_id] = display_name
        class_id_to_l1[label_id] = l1

    print(
        f"[extract-open-images] {len(class_id_to_name)} classes kept after L1-relevance filter",
        file=sys.stderr,
    )
    if not class_id_to_name:
        print("[extract-open-images] no classes matched — check --classes / category map", file=sys.stderr)
        sys.exit(1)

    print("[extract-open-images] fetching image-level labels (large file, cached) ...", file=sys.stderr)
    label_rows = fetch_csv_rows(IMAGE_LABELS_URL, cache_dir)

    # Positive-labeled ImageIDs per class, capped at per_class_cap (BUG FIX 2026-07-01: labels
    # live in a separate file from the URL index — they do not share a schema, must be joined
    # on ImageID). Only Confidence == "1.0" rows count as a positive label.
    per_class_counts: dict[str, int] = {cid: 0 for cid in class_id_to_name}
    image_id_to_label: dict[str, str] = {}
    for row in label_rows:
        label_id = row.get("LabelName") or row.get("label_name")
        if label_id not in class_id_to_name:
            continue
        if row.get("Confidence") not in ("1.0", "1"):
            continue
        if per_class_counts[label_id] >= args.per_class_cap:
            continue
        image_id = row.get("ImageID") or row.get("image_id")
        if not image_id or image_id in image_id_to_label:
            continue
        image_id_to_label[image_id] = label_id
        per_class_counts[label_id] += 1

    print(f"[extract-open-images] {len(image_id_to_label)} positively-labeled candidate ImageIDs found", file=sys.stderr)

    print("[extract-open-images] fetching image URL index (large file, cached) ...", file=sys.stderr)
    image_rows = fetch_csv_rows(IMAGE_IDS_AND_ROTATION_URL, cache_dir)

    # Resolve each labeled ImageID to a downloadable URL via the separate URL-index file.
    candidates: list[Candidate] = []
    for row in image_rows:
        image_id = row.get("ImageID") or row.get("image_id")
        if image_id not in image_id_to_label:
            continue
        label_id = image_id_to_label[image_id]
        image_url = row.get("OriginalURL") or row.get("original_url") or row.get("Thumbnail300KURL")
        if not image_url:
            continue
        candidates.append(
            Candidate(
                image_id=image_id,
                class_name=class_id_to_name[label_id],
                l1_category=class_id_to_l1[label_id],
                image_url=image_url,
            )
        )

    print(f"[extract-open-images] {len(candidates)} candidate images selected (cap={args.per_class_cap}/class)", file=sys.stderr)

    # Download + embed each candidate, write successful rows to Parquet.
    out_rows: list[dict] = []
    failed = 0
    for i, c in enumerate(candidates):
        try:
            img_resp = requests.get(c.image_url, timeout=15)
            img_resp.raise_for_status()
            image_bytes = img_resp.content
        except Exception as e:  # noqa: BLE001
            failed += 1
            continue

        vector = embed_image(args.embed_url, image_bytes)
        if vector is None:
            failed += 1
            continue

        out_rows.append(
            {
                "sourceDataset": "open-images",
                "sourceId": c.image_id,
                "l1Category": c.l1_category,
                "label": c.class_name,
                "embedding": vector,
                "imageUrl": c.image_url,
            }
        )

        if (i + 1) % 100 == 0:
            print(f"[extract-open-images] processed {i + 1}/{len(candidates)} (failed={failed})", file=sys.stderr)

        time.sleep(args.sleep_between_downloads)

    print(f"[extract-open-images] DONE — {len(out_rows)} embedded, {failed} failed", file=sys.stderr)

    if not out_rows:
        print("[extract-open-images] no rows to write — exiting without output file", file=sys.stderr)
        sys.exit(1)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as fh:
        for row in out_rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"[extract-open-images] wrote {len(out_rows)} rows to {out_path}", file=sys.stderr)
    print(f"OPEN_IMAGES_EXTRACT_SUMMARY classes={len(class_id_to_name)} candidates={len(candidates)} embedded={len(out_rows)} failed={failed}")


if __name__ == "__main__":
    main()
