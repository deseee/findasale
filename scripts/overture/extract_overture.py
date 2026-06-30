#!/usr/bin/env python3
"""
extract_overture.py — Stage A of the Overture/BrightQuery enrichment job (#556).

ATTRIBUTION (CDLA Permissive 2.0)
  Source data: Overture Maps Foundation — Places theme.
  Licensed under the Community Data License Agreement – Permissive, Version 2.0
  (CDLA-Permissive-2.0). Commercial use is permitted; the license text must ship
  with the repository. See NOTICE-overture.md in the repo root.

What it does
  Queries the Overture Places parquet on AWS Open Data (anonymous S3, us-west-2,
  NOT requester-pays) via DuckDB httpfs, applies the secondhand allowlist regex
  over lower(names.primary) PLUS a category predicate, with bounding-box pushdown
  per US state so only the queried slice transfers. Writes a candidates NDJSON
  file consumed by Stage B (packages/backend/src/scripts/runOvertureEnrichment.ts).

  DuckDB lives ONLY here (the GitHub Actions runner) — it is deliberately kept out
  of the backend runtime bundle.

Pacing
  Chunking is per US state for MEMORY BOUNDING only. There is no IP-ban risk
  (open S3, predicate pushdown), so there is no geographic throttling.

Usage
  python3 extract_overture.py --release <YYYY-MM-DD.N> --states MI,OH,IN --out candidates.ndjson
  python3 extract_overture.py --release latest --states ALL --out candidates.ndjson

Output (one JSON object per line)
  { gersId, name, websites[], emails[], phones[], city, state, category, lat, lng, confidence }
"""

import argparse
import json
import sys

try:
    import duckdb
except ImportError:
    print("ERROR: duckdb not installed. `pip install duckdb` (runner step installs it).", file=sys.stderr)
    sys.exit(1)

# Approximate continental-US state bounding boxes [min_lng, min_lat, max_lng, max_lat].
# Used for spatial predicate pushdown so DuckDB only scans each state's slice.
# Boxes are intentionally generous (slightly oversized) — the region/locality
# fields are the authoritative state filter; the bbox is purely a scan-pruning aid.
STATE_BBOX = {
    "AL": [-88.5, 30.1, -84.9, 35.1], "AZ": [-114.9, 31.3, -109.0, 37.1],
    "AR": [-94.7, 33.0, -89.6, 36.6], "CA": [-124.5, 32.5, -114.1, 42.1],
    "CO": [-109.1, 36.9, -102.0, 41.1], "CT": [-73.8, 40.9, -71.7, 42.1],
    "DE": [-75.8, 38.4, -75.0, 39.9], "FL": [-87.7, 24.4, -79.9, 31.1],
    "GA": [-85.7, 30.3, -80.8, 35.1], "ID": [-117.3, 41.9, -110.9, 49.1],
    "IL": [-91.6, 36.9, -87.0, 42.6], "IN": [-88.1, 37.7, -84.7, 41.8],
    "IA": [-96.7, 40.3, -90.1, 43.6], "KS": [-102.1, 36.9, -94.5, 40.1],
    "KY": [-89.6, 36.4, -81.9, 39.2], "LA": [-94.1, 28.8, -88.7, 33.1],
    "ME": [-71.2, 42.9, -66.9, 47.6], "MD": [-79.5, 37.8, -75.0, 39.8],
    "MA": [-73.6, 41.2, -69.8, 43.0], "MI": [-90.5, 41.6, -82.3, 48.4],
    "MN": [-97.3, 43.4, -89.4, 49.5], "MS": [-91.7, 30.1, -88.0, 35.1],
    "MO": [-95.9, 35.9, -89.0, 40.7], "MT": [-116.1, 44.3, -104.0, 49.1],
    "NE": [-104.1, 39.9, -95.2, 43.1], "NV": [-120.1, 35.0, -114.0, 42.1],
    "NH": [-72.6, 42.6, -70.6, 45.4], "NJ": [-75.6, 38.8, -73.8, 41.4],
    "NM": [-109.1, 31.2, -102.9, 37.1], "NY": [-79.8, 40.4, -71.8, 45.1],
    "NC": [-84.4, 33.7, -75.4, 36.7], "ND": [-104.1, 45.9, -96.5, 49.1],
    "OH": [-84.9, 38.3, -80.4, 42.4], "OK": [-103.1, 33.6, -94.4, 37.1],
    "OR": [-124.7, 41.9, -116.4, 46.4], "PA": [-80.6, 39.6, -74.6, 42.4],
    "RI": [-71.9, 41.0, -71.0, 42.1], "SC": [-83.4, 32.0, -78.5, 35.3],
    "SD": [-104.1, 42.4, -96.4, 46.0], "TN": [-90.4, 34.9, -81.6, 36.8],
    "TX": [-106.7, 25.7, -93.4, 36.6], "UT": [-114.1, 36.9, -109.0, 42.1],
    "VT": [-73.5, 42.7, -71.4, 45.1], "VA": [-83.7, 36.4, -75.1, 39.5],
    "WA": [-124.9, 45.5, -116.9, 49.1], "WV": [-82.7, 37.1, -77.7, 40.7],
    "WI": [-92.9, 42.4, -86.8, 47.4], "WY": [-111.1, 40.9, -104.0, 45.1],
    "DC": [-77.2, 38.7, -76.9, 39.0],
}

# Secondhand allowlist regex applied to lower(names.primary). Mirrors the
# Layer-1 allowlist in packages/backend/src/utils/outreachFilter.ts — Stage B
# re-applies the full filter, so this is a coarse scan-pruning prefilter only.
NAME_ALLOW_REGEX = (
    r"(estate sale|estate liquidat|tag sale|auction|antique|vintage|consign|resale|"
    r"second.?hand|thrift|pawn|flea market|swap meet|liquidation|salvage|"
    r"used (furniture|book|record|electronics|goods)|coin (dealer|shop)|"
    r"collectib|rummage|surplus|overstock)"
)

# Overture category prefilter (categories.primary). Broad — Stage B does the
# authoritative category map. Kept permissive so name-only matches still pass.
CATEGORY_ALLOW = (
    "antique_store", "antiques", "thrift_store", "second_hand_store",
    "consignment_shop", "consignment_store", "pawn_shop", "flea_market",
    "auction_house", "used_book_store", "record_store", "used_goods_store",
    "estate_sale_company", "vintage_store", "vintage_clothing_store",
    "used_furniture_store", "coin_dealer", "resale_shop",
)


def build_query(release: str, bbox, name_regex: str) -> str:
    min_lng, min_lat, max_lng, max_lat = bbox
    s3_glob = (
        f"s3://overturemaps-us-west-2/release/{release}/"
        f"theme=places/type=place/*"
    )
    cat_list = ",".join(f"'{c}'" for c in CATEGORY_ALLOW)
    # Predicate pushdown: bbox (scan pruning) + name regex OR category match.
    return f"""
        SELECT
            id AS gersId,
            names.primary AS name,
            websites,
            emails,
            phones,
            TRY(addresses[1].locality) AS city,
            TRY(addresses[1].region)  AS state,
            categories.primary AS category,
            bbox.xmin AS lng,
            bbox.ymin AS lat,
            confidence AS confidence
        FROM read_parquet('{s3_glob}', filename=false, hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {min_lng} AND {max_lng}
          AND bbox.ymin BETWEEN {min_lat} AND {max_lat}
          AND names.primary IS NOT NULL
          AND (
                regexp_matches(lower(names.primary), '{name_regex}')
                OR categories.primary IN ({cat_list})
          )
    """


def to_list(v):
    """Coerce DuckDB list/None values to a plain Python list of non-empty strings."""
    if v is None:
        return []
    if isinstance(v, (list, tuple)):
        out = []
        for x in v:
            if x is None:
                continue
            # Overture websites/emails/phones are lists of structs OR scalars across
            # releases; pull the string form defensively.
            if isinstance(x, dict):
                val = x.get("value") or x.get("primary") or next(iter(x.values()), None)
            else:
                val = x
            if val:
                out.append(str(val))
        return out
    return [str(v)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", required=True,
                    help="Overture release id, e.g. 2026-06-25.0 (use the value from the workflow).")
    ap.add_argument("--states", default="ALL",
                    help="Comma-separated 2-letter states, or ALL.")
    ap.add_argument("--out", required=True, help="Output NDJSON path.")
    args = ap.parse_args()

    if args.states.strip().upper() == "ALL":
        states = list(STATE_BBOX.keys())
    else:
        states = [s.strip().upper() for s in args.states.split(",") if s.strip()]

    unknown = [s for s in states if s not in STATE_BBOX]
    if unknown:
        print(f"ERROR: unknown state codes: {unknown}", file=sys.stderr)
        sys.exit(1)

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("SET s3_region='us-west-2';")
    con.execute("SET s3_use_ssl=true;")
    # Anonymous access to AWS Open Data — no credentials, not requester-pays.
    con.execute("SET s3_access_key_id='';")
    con.execute("SET s3_secret_access_key='';")

    total = 0
    with open(args.out, "w", encoding="utf-8") as fh:
        for st in states:
            bbox = STATE_BBOX[st]
            q = build_query(args.release, bbox, NAME_ALLOW_REGEX)
            print(f"[overture-extract] querying state={st} ...", file=sys.stderr)
            try:
                rows = con.execute(q).fetchall()
                cols = [d[0] for d in con.description]
            except Exception as e:
                print(f"[overture-extract] state={st} FAILED: {e}", file=sys.stderr)
                continue

            kept = 0
            for r in rows:
                rec = dict(zip(cols, r))
                region = (rec.get("state") or "").strip().upper()
                # Authoritative state filter on the record's own region field.
                if region and region != st:
                    continue
                obj = {
                    "gersId": rec.get("gersId"),
                    "name": rec.get("name"),
                    "websites": to_list(rec.get("websites")),
                    "emails": to_list(rec.get("emails")),
                    "phones": to_list(rec.get("phones")),
                    "city": rec.get("city"),
                    "state": region or st,
                    "category": rec.get("category"),
                    "lat": rec.get("lat"),
                    "lng": rec.get("lng"),
                    "confidence": rec.get("confidence"),
                }
                if not obj["gersId"] or not obj["name"]:
                    continue
                fh.write(json.dumps(obj, ensure_ascii=False) + "\n")
                kept += 1
            total += kept
            print(f"[overture-extract] state={st}: {kept} candidates", file=sys.stderr)

    print(f"[overture-extract] DONE — {total} candidates written to {args.out}", file=sys.stderr)
    print(f"OVERTURE_EXTRACT_SUMMARY states={len(states)} candidates={total}")


if __name__ == "__main__":
    main()
