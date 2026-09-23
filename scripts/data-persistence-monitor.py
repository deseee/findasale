#!/usr/bin/env python3
# data-persistence-monitor.py -- read-only daily snapshot + diff for the
# `findasale-data-persistence-monitor` Cowork scheduled task.
#
# WHY THIS EXISTS
#   2026-09-19 the monitor raised a false P0 ("managed PUBLISHED sale count 11->9") that was
#   really QA test sales on organizer cmomwf956000z11qwnjieosli (Barn Door Consignment,
#   isUnmanagedListing=false) being flipped to ENDED by a batch cron. Two problems:
#     1. the "managed" baseline counted QA/test organizers and sales;
#     2. the snapshot stored only aggregate counts, so a real drop couldn't be pinned to rows.
#   This script fixes both. The schema has no isTest/isDemo flag on Sale/Organizer/User
#   (only Purchase.isTestTransaction), so test detection is title-based + an explicit list.
#
# WHAT IT DOES
#   * Computes the legacy aggregate fields (kept for continuity with older snapshots).
#   * Computes a "managedBaseline" that excludes test data:
#       - sales whose title matches TEST_TITLE_REGEX (case-insensitive);
#       - organizers in EXCLUDED_ORGANIZER_IDS;
#       - organizers whose ENTIRE sale history (incl. soft-deleted) is test-titled.
#   * Persists the managed PUBLISHED sale id list (+ sha256) and managed item id list
#     (+ count + sha256) so the next run can diff to exact rows.
#   * On a drop, live-queries each missing sale/item and classifies it:
#       OK   ENDED at/after endDate (24h slack for the day-of auto-close cron), or row now test data
#       WARN ENDED before endDate, soft-deleted, ARCHIVED/DRAFT, reassigned to unmanaged org
#       P0   row hard-deleted (no longer exists) or unexplained
#
# SAFETY
#   * Read-only: session is set default_transaction_read_only=on. No DB writes, ever.
#   * The DATABASE_URL (packages/database/.env or env) is never printed.
#   * Snapshot file is only written with --write.
#
# USAGE
#   PYTHONPATH=.tmp-pylibs python3 scripts/data-persistence-monitor.py            # report only
#   PYTHONPATH=.tmp-pylibs python3 scripts/data-persistence-monitor.py --write    # report + save snapshot
#   exit code: 0 OK, 1 WARN, 2 P0

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
from urllib.parse import urlparse, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
DEFAULT_SNAPSHOT = os.path.join(REPO, "claude_docs", "monitoring", "data-persistence-snapshot.json")

# Postgres regex, applied with ~* (case-insensitive). Anchored at start of the trimmed title.
TEST_TITLE_REGEX = r"^(QA |QA-|Test Sale|QA Sandbox)"

# Organizers that are known QA / internal test accounts even if they ever get a
# non-test-titled sale. Add ids here rather than special-casing them in SQL.
EXCLUDED_ORGANIZER_IDS = [
    "cmomwf956000z11qwnjieosli",  # "Barn Door Consignment" -- QA sandbox payment tests (false P0 2026-09-19)
]

END_SLACK = dt.timedelta(hours=24)  # ENDED within this window before endDate = normal auto-close

ARTIFACT_SALE_ID = "cmpt2oq6q00138cehpgqx3huk"  # canonical "Artifact Downtown Paw Paw" sale


def connect():
    env_path = os.path.join(REPO, "packages", "database", ".env")
    url = os.environ.get("DATABASE_URL")
    if not url and os.path.exists(env_path):
        for line in open(env_path, encoding="utf-8"):
            if line.strip().startswith("DATABASE_URL"):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    if not url:
        sys.exit("FATAL: DATABASE_URL not found (env or packages/database/.env)")
    try:
        import psycopg2
        conn = psycopg2.connect(url)
    except ImportError:
        try:
            import pg8000.dbapi
        except ImportError:
            sys.exit("FATAL: install psycopg2-binary or pg8000 (PYTHONPATH=.tmp-pylibs)")
        p = urlparse(url)
        conn = pg8000.dbapi.connect(
            user=unquote(p.username), password=unquote(p.password),
            host=p.hostname, port=p.port or 5432,
            database=p.path.lstrip("/").split("?")[0],
            ssl_context=True, timeout=90,
        )
    cur = conn.cursor()
    cur.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
    conn.commit()
    return conn


def q(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchall()


def sha(ids):
    return hashlib.sha256("\n".join(sorted(ids)).encode()).hexdigest()


def iso(v):
    return v.isoformat() if isinstance(v, (dt.datetime, dt.date)) else v


# ---- test-data CTE shared by every baseline query --------------------------------------------
# test_org: explicit list OR every sale it has ever had is test-titled.
# managed_sale: non-test sale of a managed (isUnmanagedListing=false), non-test organizer.
BASE_CTE = """
WITH test_org AS (
    SELECT o.id FROM "Organizer" o WHERE o.id = ANY(%s)
    UNION
    SELECT s."organizerId" FROM "Sale" s
    GROUP BY s."organizerId"
    HAVING bool_and(btrim(s.title) ~* %s)
),
managed_sale AS (
    SELECT s.* FROM "Sale" s
    JOIN "Organizer" o ON o.id = s."organizerId"
    WHERE o."isUnmanagedListing" = false
      AND s."deletedAt" IS NULL
      AND NOT (btrim(s.title) ~* %s)
      AND s."organizerId" NOT IN (SELECT id FROM test_org)
)
"""


def base_params():
    return (EXCLUDED_ORGANIZER_IDS, TEST_TITLE_REGEX, TEST_TITLE_REGEX)


def collect(cur):
    snap = {"capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "schemaVersion": 2}

    # ---- legacy aggregates (unchanged semantics: all non-deleted rows, no test exclusion) ----
    snap["userCount"] = q(cur, 'SELECT count(*) FROM "User"')[0][0]
    r = q(cur, 'SELECT count(*) FILTER (WHERE "isUnmanagedListing" = false), '
               'count(*) FILTER (WHERE "isUnmanagedListing" = true), '
               'count(*) FILTER (WHERE "isUnmanagedListing" IS NULL) FROM "Organizer"')[0]
    snap["organizerManagedCount"], snap["organizerUnmanagedCount"], snap["organizerNullFlagCount"] = r
    snap["saleByStatus"] = dict(q(cur, 'SELECT status, count(*) FROM "Sale" WHERE "deletedAt" IS NULL GROUP BY status ORDER BY status'))
    snap["saleTotal"] = sum(snap["saleByStatus"].values())
    snap["itemByStatus"] = dict(q(cur, 'SELECT status, count(*) FROM "Item" WHERE "deletedAt" IS NULL GROUP BY status ORDER BY status'))
    snap["itemTotal"] = sum(snap["itemByStatus"].values())
    snap["purchaseCount"] = q(cur, 'SELECT count(*) FROM "Purchase"')[0][0]

    # ---- test-data exclusions (so the report shows exactly what was excluded) ----
    test_orgs = q(cur, BASE_CTE + """
        SELECT t.id, o."businessName", o."isUnmanagedListing",
               (SELECT count(*) FROM "Sale" s WHERE s."organizerId" = t.id)
        FROM test_org t JOIN "Organizer" o ON o.id = t.id
        WHERE o."isUnmanagedListing" = false ORDER BY t.id""", base_params())
    test_sales = q(cur, BASE_CTE + """
        SELECT s.id, s.status FROM "Sale" s JOIN "Organizer" o ON o.id = s."organizerId"
        WHERE o."isUnmanagedListing" = false AND s."deletedAt" IS NULL
          AND ((btrim(s.title) ~* %s) OR s."organizerId" IN (SELECT id FROM test_org))
        ORDER BY s.id""", base_params() + (TEST_TITLE_REGEX,))
    snap["testExclusions"] = {
        "titleRegex": TEST_TITLE_REGEX,
        "explicitOrganizerIds": EXCLUDED_ORGANIZER_IDS,
        "managedTestOrganizers": [
            {"id": a, "businessName": b, "saleCountAllTime": d} for a, b, c, d in test_orgs],
        "managedTestSaleCount": len(test_sales),
        "managedTestSaleIds": [a for a, _ in test_sales],
    }

    # ---- managed baseline (test data excluded) ----
    mb = {}
    mb["saleByStatus"] = dict(q(cur, BASE_CTE + 'SELECT status, count(*) FROM managed_sale GROUP BY status ORDER BY status', base_params()))
    mb["salesTotal"] = sum(mb["saleByStatus"].values())
    mb["salesWithDescription"] = q(cur, BASE_CTE + "SELECT count(*) FROM managed_sale WHERE coalesce(btrim(description), '') <> ''", base_params())[0][0]
    pub = [r[0] for r in q(cur, BASE_CTE + "SELECT id FROM managed_sale WHERE status = 'PUBLISHED' ORDER BY id", base_params())]
    mb["publishedSaleCount"] = len(pub)
    mb["publishedSaleIdsSha256"] = sha(pub)
    mb["publishedSaleIds"] = pub
    items = [r[0] for r in q(cur, BASE_CTE + """
        SELECT i.id FROM "Item" i JOIN managed_sale s ON s.id = i."saleId"
        WHERE i."deletedAt" IS NULL ORDER BY i.id""", base_params())]
    mb["itemCount"] = len(items)
    mb["itemsWithPrice"] = q(cur, BASE_CTE + """
        SELECT count(*) FROM "Item" i JOIN managed_sale s ON s.id = i."saleId"
        WHERE i."deletedAt" IS NULL AND i.price IS NOT NULL""", base_params())[0][0]
    mb["itemIdsSha256"] = sha(items)
    mb["itemIds"] = items
    snap["managedBaseline"] = mb

    # ---- canonical artifact sale ----
    r = q(cur, 'SELECT s.id, s.title, length(coalesce(s.description, \'\')), s.status, s."updatedAt", '
               '(SELECT count(*) FROM "Item" i WHERE i."saleId" = s.id AND i."deletedAt" IS NULL) '
               'FROM "Sale" s WHERE s.id = %s', (ARTIFACT_SALE_ID,))
    if r:
        a = r[0]
        snap["artifactSale"] = {"id": a[0], "found": True, "title": a[1], "descriptionLength": a[2],
                                "status": a[3], "itemCount": a[5], "updatedAt": iso(a[4])}
    else:
        snap["artifactSale"] = {"id": ARTIFACT_SALE_ID, "found": False}
    return snap


def classify_missing_sales(cur, ids, test_ids):
    out = []
    if not ids:
        return out
    rows = {r[0]: r for r in q(cur, """
        SELECT s.id, s.title, s.status, s."updatedAt", s."endDate", s."deletedAt",
               s."organizerId", o."isUnmanagedListing"
        FROM "Sale" s LEFT JOIN "Organizer" o ON o.id = s."organizerId"
        WHERE s.id = ANY(%s)""", (list(ids),))}
    now = dt.datetime.utcnow()
    for sid in sorted(ids):
        r = rows.get(sid)
        if r is None:
            out.append({"id": sid, "severity": "P0", "reason": "row no longer exists (hard delete)"})
            continue
        _, title, status, upd, end, deleted, org, unmanaged = r
        rec = {"id": sid, "title": title, "status": status, "updatedAt": iso(upd),
               "endDate": iso(end), "deletedAt": iso(deleted), "organizerId": org}
        end_naive = end.replace(tzinfo=None) if end is not None else None
        if sid in test_ids:
            rec.update(severity="OK", reason="now classified as test data")
        elif deleted is not None:
            rec.update(severity="WARN", reason="soft-deleted (deletedAt set)")
        elif unmanaged:
            rec.update(severity="WARN", reason="organizer is now isUnmanagedListing=true / reassigned")
        elif status == "ENDED" and end_naive is not None and (
                end_naive <= now or (upd is not None and end_naive - upd.replace(tzinfo=None) <= END_SLACK)):
            # The auto-close cron runs on the endDate's calendar day (observed 10:00 UTC for a
            # 22:00 endDate), so allow END_SLACK before endDate to count as a normal close.
            rec.update(severity="OK", reason="PUBLISHED->ENDED at/after endDate (normal auto-close)")
        elif status == "ENDED":
            rec.update(severity="WARN", reason="ENDED before endDate (manual early end or cron bug)")
        else:
            rec.update(severity="WARN", reason="status changed to %s" % status)
        out.append(rec)
    return out


def classify_missing_items(cur, ids, test_sale_ids):
    out = []
    if not ids:
        return out
    rows = {r[0]: r for r in q(cur, """
        SELECT i.id, i.title, i.status, i."updatedAt", i."deletedAt", i."saleId", s.status, s."deletedAt"
        FROM "Item" i LEFT JOIN "Sale" s ON s.id = i."saleId" WHERE i.id = ANY(%s)""", (list(ids),))}
    for iid in sorted(ids):
        r = rows.get(iid)
        if r is None:
            out.append({"id": iid, "severity": "P0", "reason": "row no longer exists (hard delete)"})
            continue
        _, title, status, upd, deleted, sale_id, sale_status, sale_deleted = r
        rec = {"id": iid, "title": title, "status": status, "updatedAt": iso(upd),
               "deletedAt": iso(deleted), "saleId": sale_id}
        if sale_id in test_sale_ids:
            rec.update(severity="OK", reason="now belongs to a test sale")
        elif deleted is not None:
            rec.update(severity="WARN", reason="soft-deleted (deletedAt set)")
        elif sale_id is None:
            rec.update(severity="WARN", reason="detached from sale (saleId NULL / inventory)")
        elif sale_deleted is not None:
            rec.update(severity="WARN", reason="parent sale soft-deleted")
        else:
            rec.update(severity="WARN", reason="parent sale moved out of managed baseline")
        out.append(rec)
    return out


def diff(cur, prev, cur_snap):
    rep = {"severity": "OK", "findings": []}
    mb = cur_snap["managedBaseline"]
    pmb = (prev or {}).get("managedBaseline")
    test_ids = set(cur_snap["testExclusions"]["managedTestSaleIds"])
    if not pmb or "publishedSaleIds" not in pmb:
        rep["note"] = ("previous snapshot has no managedBaseline id lists (schemaVersion<2); "
                       "this run establishes the row-level baseline. Legacy count deltas below are "
                       "informational only -- they include test data.")
        if prev:
            rep["legacyDelta"] = {
                "managedPublished": [prev.get("managedSaleByStatus", {}).get("PUBLISHED"),
                                     mb["saleByStatus"].get("PUBLISHED", 0)],
                "managedItems": [prev.get("managedItemsTotal"), mb["itemCount"]],
            }
        return rep

    prev_pub, now_pub = set(pmb["publishedSaleIds"]), set(mb["publishedSaleIds"])
    prev_items, now_items = set(pmb.get("itemIds") or []), set(mb["itemIds"])
    rep["publishedSales"] = {"prev": len(prev_pub), "now": len(now_pub),
                             "added": sorted(now_pub - prev_pub)}
    rep["items"] = {"prev": pmb.get("itemCount"), "now": mb["itemCount"],
                    "addedCount": len(now_items - prev_items),
                    "checksumChanged": pmb.get("itemIdsSha256") != mb["itemIdsSha256"]}
    rep["missingSales"] = classify_missing_sales(cur, prev_pub - now_pub, test_ids)
    rep["missingItems"] = classify_missing_items(cur, prev_items - now_items, test_ids) if prev_items else []
    sev = [f["severity"] for f in rep["missingSales"] + rep["missingItems"]]
    art_prev, art_now = prev.get("artifactSale") or {}, cur_snap["artifactSale"]
    if not art_now.get("found"):
        sev.append("P0"); rep["findings"].append("artifact sale %s not found" % ARTIFACT_SALE_ID)
    elif art_prev.get("itemCount") and art_now["itemCount"] < art_prev["itemCount"]:
        sev.append("WARN"); rep["findings"].append("artifact sale itemCount %s -> %s" % (art_prev["itemCount"], art_now["itemCount"]))
    if art_prev.get("descriptionLength") and art_now.get("descriptionLength", 0) < art_prev["descriptionLength"] // 2:
        sev.append("P0"); rep["findings"].append("artifact sale description shrank >50%")
    rep["severity"] = "P0" if "P0" in sev else ("WARN" if "WARN" in sev else "OK")
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", default=DEFAULT_SNAPSHOT)
    ap.add_argument("--write", action="store_true", help="save the new snapshot (overwrites --snapshot)")
    ap.add_argument("--full", action="store_true", help="print id lists in the report")
    args = ap.parse_args()

    prev = None
    if os.path.exists(args.snapshot):
        try:
            prev = json.load(open(args.snapshot, encoding="utf-8"))
        except ValueError:
            prev = None
    conn = connect()
    cur = conn.cursor()
    snap = collect(cur)
    report = diff(cur, prev, snap)
    conn.rollback()
    conn.close()

    view = json.loads(json.dumps(snap, default=str))
    if not args.full:
        view["managedBaseline"]["publishedSaleIds"] = "<%d ids>" % len(snap["managedBaseline"]["publishedSaleIds"])
        view["managedBaseline"]["itemIds"] = "<%d ids>" % len(snap["managedBaseline"]["itemIds"])
    print(json.dumps({"snapshot": view, "report": report}, indent=2, default=str))

    if args.write:
        data = json.dumps(snap, indent=2, default=str) + "\n"
        tmp = args.snapshot + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(data)
        os.replace(tmp, args.snapshot)
    sys.exit({"OK": 0, "WARN": 1, "P0": 2}[report["severity"]])


if __name__ == "__main__":
    main()
