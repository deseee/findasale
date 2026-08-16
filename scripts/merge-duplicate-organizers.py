#!/usr/bin/env python3
"""
merge-duplicate-organizers.py — safely merge one duplicate Organizer row into another.

WHY THIS EXISTS
    Organizer.dedupeKey was `normalized-name : normalized-city`, so the SAME real business
    listed under two different cities by two different directories never collided. Confirmed
    live: "Bond Street Auctions" exists twice — same website, same phone, same email, neither
    claimed, zero sales — because one directory saw it in Fort Lauderdale FL and another in
    The Villages FL. The ingest-side rule is fixed separately (see
    packages/backend/src/services/scraper/index.ts, generateIdentityKey / findIdentityMatch);
    this script cleans up rows that already exist.

SAFETY MODEL — read before running
    * DRY RUN BY DEFAULT. Nothing is written without an explicit --apply flag.
    * IDEMPOTENT. Re-running after a successful merge detects the drop row is gone and exits 0.
    * SINGLE TRANSACTION. With --apply, every write commits together or none of them do.
    * FK-COMPLETE. Foreign keys to "Organizer".id are enumerated from information_schema at
      runtime, NOT hardcoded — so the script cannot silently miss a table added later. It is
      additionally pinned to a reviewed snapshot (EXPECTED_ORGANIZER_FKS); if the live schema
      no longer matches, the script REFUSES to run until a human re-reviews the new table.
      An orphaned FK is how a merge like this breaks, so this is deliberately strict.
    * NEVER MERGES A CLAIMED ORGANIZER. Refuses if either side is claimed or has sales.

USAGE
    python3 scripts/merge-duplicate-organizers.py                 # dry run, Bond Street default
    python3 scripts/merge-duplicate-organizers.py --apply         # execute
    python3 scripts/merge-duplicate-organizers.py --keep <id> --drop <id>
"""

import argparse
import os
import re
import sys
from urllib.parse import urlparse, unquote

# ---------------------------------------------------------------------------------------------
# Defaults: the confirmed Bond Street Auctions pair.
#   KEEP = older row, lead score 50 HOT, sourceCount 2 (corroborated), touch1 already sent.
#   DROP = newer row, lead score 45, single source, outreach never sent. Carries esnOrgId 159218,
#          which is a real identity signal and must be ported onto KEEP rather than lost.
# ---------------------------------------------------------------------------------------------
DEFAULT_KEEP = "cmqbidpw800qvneng9o6v1772"   # Fort Lauderdale, FL — OvertureBrightQuery
DEFAULT_DROP = "cmrwy6i64045o964q9tpxp15x"   # The Villages, FL    — EstateSalesNet

# Reviewed snapshot of every FK -> "Organizer".id (30 tables, read from the live catalog
# 2026-08-16). Format: (table, column, on_delete_rule).
EXPECTED_ORGANIZER_FKS = {
    ("ClaimRequest", "organizerId", "CASCADE"),
    ("Conversation", "organizerId", "CASCADE"),
    ("DirectoryClaimEmail", "organizerId", "CASCADE"),
    ("EbayConnection", "organizerId", "CASCADE"),
    ("EbayPolicyMapping", "organizerId", "CASCADE"),
    ("Follow", "organizerId", "CASCADE"),
    ("MarkdownCycle", "organizerId", "CASCADE"),
    ("MessageAutosendLog", "organizerId", "CASCADE"),
    ("OrganizerBroadcast", "organizerId", "CASCADE"),
    ("OrganizerClaimEmail", "organizerId", "CASCADE"),
    ("OrganizerHoldSettings", "organizerId", "CASCADE"),
    ("OrganizerHours", "organizerId", "CASCADE"),
    ("OrganizerScore", "organizerId", "CASCADE"),
    ("OrganizerWorkspace", "ownerId", "CASCADE"),
    ("OutreachAuditLog", "organizerId", "CASCADE"),
    ("POSPaymentLink", "organizerId", "CASCADE"),
    ("POSSession", "organizerId", "CASCADE"),
    ("PriceOverrideLog", "organizerId", "CASCADE"),
    ("Review", "organizerId", "SET NULL"),
    ("Sale", "organizerId", "RESTRICT"),
    ("SaleDonation", "organizerId", "RESTRICT"),
    ("SaleHub", "organizerId", "RESTRICT"),
    ("SaleTemplate", "organizerId", "CASCADE"),
    ("ShopifyListing", "organizerId", "CASCADE"),
    ("ShopperOrganizerIntroduction", "organizerId", "CASCADE"),
    ("SmartFollow", "organizerId", "CASCADE"),
    ("Testimonial", "organizerId", "SET NULL"),
    ("TreasureTrail", "organizerId", "RESTRICT"),
    ("WorkspaceChatMessage", "organizerId", "CASCADE"),
    ("WorkspaceMember", "organizerId", "CASCADE"),
}

# Tables where a naive repoint can violate a UNIQUE constraint that includes the organizer
# column. If BOTH sides hold a row, repointing would raise — the script reports and aborts
# rather than guessing which row to discard.
UNIQUE_CONFLICT_TABLES = {
    "EbayConnection": ("organizerId",),
    "OrganizerWorkspace": ("ownerId", "slug"),
    "WorkspaceMember": ("workspaceId", "organizerId"),
}

# Scalar fields backfilled onto KEEP from DROP *only where KEEP is null/empty*. KEEP's own
# values always win — it is the corroborated row. esnOrgId is the important one for Bond Street.
BACKFILL_IF_NULL = [
    "esnOrgId", "googlePlaceId", "foursquareVenueId", "hereBusinessId", "osmNodeId",
    "contactEmail", "emailDiscoveryMethod", "emailDiscoveryConfidence", "emailDiscoveredAt",
    "phone", "website", "listingUrl", "lat", "lng", "businessCategory",
    "isStateLicensed", "licenseState", "licenseNumber",
    "facebook", "instagram", "etsy", "twitterUrl", "tiktokUrl", "youtubeUrl",
    "pinterestUrl", "linkedInUrl", "profilePhoto", "bio", "tagline", "yearFounded",
]

DISPLAY_FIELDS = [
    "id", "businessName", "address", "serviceAreas", "phone", "website", "contactEmail",
    "esnOrgId", "dedupeKey", "sourceCount", "corroborationScore", "leadScore", "leadTier",
    "isClaimed", "isUnmanagedListing", "directoryStatus", "userId", "createdAt",
]


def connect():
    """Read DATABASE_URL from packages/database/.env. The URL is never printed."""
    here = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(here, "..", "packages", "database", ".env")
    url = os.environ.get("DATABASE_URL")
    if not url and os.path.exists(env_path):
        for line in open(env_path, encoding="utf-8"):
            if line.strip().startswith("DATABASE_URL"):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    if not url:
        sys.exit("FATAL: DATABASE_URL not found (env or packages/database/.env)")
    p = urlparse(url)
    try:
        import psycopg2
        return psycopg2.connect(url), "psycopg2"
    except ImportError:
        pass
    try:
        import pg8000.dbapi
        return pg8000.dbapi.connect(
            user=unquote(p.username), password=unquote(p.password),
            host=p.hostname, port=p.port or 5432,
            database=p.path.lstrip("/").split("?")[0],
            ssl_context=True, timeout=60,
        ), "pg8000"
    except ImportError:
        sys.exit("FATAL: install psycopg2-binary or pg8000")


def fetch(cur, sql, params=()):
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def verify_fk_snapshot(cur):
    live = {
        (r["table_name"], r["column_name"], r["delete_rule"])
        for r in fetch(cur, """
            SELECT tc.table_name, kcu.column_name, rc.delete_rule
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
            JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND ccu.table_name = 'Organizer' AND ccu.column_name = 'id'
        """)
    }
    added, removed = live - EXPECTED_ORGANIZER_FKS, EXPECTED_ORGANIZER_FKS - live
    print(f"FK integrity: {len(live)} foreign keys reference \"Organizer\".id")
    if added or removed:
        print("\n*** REFUSING TO RUN — schema drifted from the reviewed snapshot ***")
        for t in sorted(added):
            print(f"    NEW/CHANGED FK (unreviewed): {t}")
        for t in sorted(removed):
            print(f"    FK GONE since review:        {t}")
        print("    Update EXPECTED_ORGANIZER_FKS after deciding how the new table must be handled.")
        sys.exit(2)
    print("             matches the reviewed 30-table snapshot exactly — no unhandled tables.\n")
    return sorted(live)


def child_counts(cur, fks, keep, drop):
    out = []
    for table, col, rule in fks:
        rows = fetch(cur, f'SELECT '
                          f'count(*) FILTER (WHERE "{col}" = %s) AS keep_n, '
                          f'count(*) FILTER (WHERE "{col}" = %s) AS drop_n FROM "{table}"',
                     (keep, drop))[0]
        out.append((table, col, rule, rows["keep_n"], rows["drop_n"]))
    return out


def fmt(v):
    if v is None:
        return "\033[2mNULL\033[0m" if sys.stdout.isatty() else "NULL"
    s = str(v)
    return s if len(s) <= 72 else s[:69] + "..."


def city_of(address):
    """First comma-separated component of the address — the city we must not lose."""
    return (address or "").split(",")[0].strip()


def split_areas(raw):
    """Parse a serviceAreas value into a list. Real rows use BOTH separators — the Bond Street
    ESN row stores 'Miami / Fort Lauderdale / West Palm Beach' while the column comment says
    CSV — so split on comma, slash, semicolon and pipe alike."""
    return [a.strip() for a in re.split(r"[,/;|]", raw or "") if a.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", default=DEFAULT_KEEP)
    ap.add_argument("--drop", default=DEFAULT_DROP)
    ap.add_argument("--apply", action="store_true",
                    help="Actually write. Omit for a dry run (the default).")
    ap.add_argument("--keep-duplicate-outreach-active", action="store_true",
                    help="Do NOT archive the repointed DirectoryClaimEmail row.")
    args = ap.parse_args()
    keep_id, drop_id = args.keep, args.drop
    if keep_id == drop_id:
        sys.exit("FATAL: --keep and --drop are the same id")

    conn, driver = connect()
    cur = conn.cursor()
    if not args.apply:
        cur.execute("SET default_transaction_read_only = on")

    mode = "APPLY (writes committed)" if args.apply else "DRY RUN (no writes)"
    print("=" * 94)
    print(f"  MERGE DUPLICATE ORGANIZERS — {mode}   [driver: {driver}]")
    print("=" * 94 + "\n")

    fks = verify_fk_snapshot(cur)

    orgs = {r["id"]: r for r in fetch(
        cur, 'SELECT * FROM "Organizer" WHERE id = ANY(%s)', ([keep_id, drop_id],))}

    # ---- idempotency ------------------------------------------------------------------------
    if drop_id not in orgs:
        if keep_id in orgs:
            print(f"ALREADY MERGED — drop row {drop_id} does not exist; keep row {keep_id} is present.")
            print("Nothing to do. Exiting 0.")
            return 0
        sys.exit(f"FATAL: neither {keep_id} nor {drop_id} exists")
    if keep_id not in orgs:
        sys.exit(f"FATAL: keep row {keep_id} does not exist — refusing to delete {drop_id}")

    keep, drop = orgs[keep_id], orgs[drop_id]

    # ---- refuse on any high-harm condition ---------------------------------------------------
    problems = []
    for label, o in (("KEEP", keep), ("DROP", drop)):
        if o.get("isClaimed"):
            problems.append(f"{label} organizer {o['id']} is CLAIMED — never merge a real customer")
        if not o.get("isUnmanagedListing"):
            problems.append(f"{label} organizer {o['id']} is NOT an unmanaged listing")
    sale_rows = fetch(cur, 'SELECT "organizerId", count(*) AS n FROM "Sale" '
                           'WHERE "organizerId" = ANY(%s) GROUP BY 1', ([keep_id, drop_id],))
    for r in sale_rows:
        problems.append(f"organizer {r['organizerId']} has {r['n']} Sale row(s) — out of scope for this script")
    if problems:
        print("*** REFUSING TO MERGE ***")
        for p in problems:
            print("    " + p)
        sys.exit(3)

    # ---- BEFORE -------------------------------------------------------------------------------
    print("-" * 94)
    print("BEFORE")
    print("-" * 94)
    print(f"  {'field':26s} {'KEEP  ' + keep_id:40s} {'DROP  ' + drop_id}")
    for f in DISPLAY_FIELDS:
        if f in keep:
            mark = " " if keep.get(f) == drop.get(f) else "~"
            print(f" {mark}{f:26s} {fmt(keep.get(f)):40s} {fmt(drop.get(f))}")

    print("\n  Child rows (all 30 FK tables; only non-empty shown):")
    counts = child_counts(cur, fks, keep_id, drop_id)
    for table, col, rule, kn, dn in counts:
        if kn or dn:
            print(f"    {table:32s}.{col:14s} ON DELETE {rule:9s} KEEP={kn}  DROP={dn}")
    if not any(kn or dn for _, _, _, kn, dn in counts):
        print("    (none)")
    empty = [t for t, _, _, kn, dn in counts if not kn and not dn]
    print(f"    ...and {len(empty)} tables with zero rows on both sides (verified, not assumed).")

    # ---- PLAN ----------------------------------------------------------------------------------
    print("\n" + "-" * 94)
    print("PLAN")
    print("-" * 94)
    writes = []   # (description, sql, params)

    # 1. unique-constraint safety
    blocked = []
    for table, cols in UNIQUE_CONFLICT_TABLES.items():
        row = next((c for c in counts if c[0] == table), None)
        if row and row[3] and row[4]:
            blocked.append(f"{table}: both sides hold a row and {cols} is UNIQUE — manual decision required")
    if blocked:
        print("*** REFUSING TO MERGE — unique-constraint conflict ***")
        for b in blocked:
            print("    " + b)
        sys.exit(4)
    print("  1. Unique-constraint check ....... OK (no table has rows on both sides)")

    # 2. scalar backfill
    updates = {}
    for f in BACKFILL_IF_NULL:
        if f in keep and (keep.get(f) is None or keep.get(f) == "") and drop.get(f) not in (None, ""):
            updates[f] = drop.get(f)
    print(f"  2. Backfill KEEP from DROP where KEEP is null ({len(updates)} field(s)):")
    for f, v in updates.items() or {}.items():
        print(f"       {f:24s} NULL -> {fmt(v)}")
    if not updates:
        print("       (nothing to backfill)")

    # 3. serviceAreas — UNION of both rows' coverage plus DROP's own city.
    #    Two distinct things would otherwise be lost when DROP is deleted: (a) DROP's city,
    #    which is the only place The Villages is recorded, and (b) DROP's serviceAreas string,
    #    which on the live Bond Street row already lists three more metros. Backfill-if-null
    #    would silently drop (b) whenever KEEP also had a value, so this is a real union.
    drop_city = city_of(drop.get("address"))
    keep_city = city_of(keep.get("address"))
    areas, seen = [], set()
    for candidate in split_areas(keep.get("serviceAreas")) \
            + split_areas(drop.get("serviceAreas")) + [drop_city]:
        low = candidate.lower()
        if candidate and low not in seen and low != keep_city.lower():
            seen.add(low)
            areas.append(candidate)
    merged_areas = ", ".join(areas) or None
    if merged_areas != keep.get("serviceAreas"):
        updates["serviceAreas"] = merged_areas
    print(f"  3. Merge service areas (union — nothing dropped):")
    print(f"       KEEP.address city    = {keep_city!r}   (stays the primary address)")
    print(f"       DROP.address city    = {drop_city!r}   (would be lost -> preserved below)")
    print(f"       KEEP.serviceAreas    = {fmt(keep.get('serviceAreas'))}")
    print(f"       DROP.serviceAreas    = {fmt(drop.get('serviceAreas'))}")
    print(f"       -> merged            = {fmt(merged_areas)}"
          + ("" if "serviceAreas" in updates else "   (no change — already covered)"))

    # 4. corroboration: DROP contributed an independent source, so KEEP gains one
    new_source_count = (keep.get("sourceCount") or 1) + 1
    updates["sourceCount"] = new_source_count
    updates["corroborationScore"] = {1: 0.5, 2: 0.7, 3: 0.85}.get(new_source_count, 0.95)
    print(f"  4. Corroboration: sourceCount {keep.get('sourceCount')} -> {new_source_count}, "
          f"corroborationScore {keep.get('corroborationScore')} -> {updates['corroborationScore']}")

    # 5. dedupeKey -> identity format so the new ingest rule matches this row directly
    dom = None
    site = keep.get("website") or drop.get("website")
    if site:
        m = re.match(r"^\s*(?:https?://)?(?:www\.)?([^/\s?#:]+)", site, re.I)
        if m and "." in m.group(1):
            dom = ".".join(m.group(1).lower().split(".")[-2:])
    name_slug = re.sub(r"\s+", "-", re.sub(r"[^a-z0-9\s]", "",
                       (keep["businessName"] or "").lower().replace("&", " and ")).strip())
    new_key = f"{name_slug}:d:{dom}" if dom else keep.get("dedupeKey")
    if new_key != keep.get("dedupeKey"):
        updates["dedupeKey"] = new_key
    print(f"  5. dedupeKey {fmt(keep.get('dedupeKey'))} -> {fmt(new_key)}   (identity format)")

    if updates:
        cols_sql = ", ".join(f'"{k}" = %s' for k in updates)
        writes.append((f'UPDATE Organizer {keep_id} ({len(updates)} fields)',
                       f'UPDATE "Organizer" SET {cols_sql}, "updatedAt" = now() WHERE id = %s',
                       list(updates.values()) + [keep_id]))

    # 6. repoint every child row
    print("  6. Repoint child rows DROP -> KEEP:")
    repointed_any = False
    for table, col, rule, kn, dn in counts:
        if dn:
            repointed_any = True
            print(f"       {table:32s}.{col:14s} {dn} row(s)  (ON DELETE {rule})")
            writes.append((f"repoint {dn} row(s) in {table}",
                           f'UPDATE "{table}" SET "{col}" = %s WHERE "{col}" = %s',
                           [keep_id, drop_id]))
    if not repointed_any:
        print("       (no child rows to repoint)")

    # 7. archive the duplicate outreach row
    dce = fetch(cur, 'SELECT id, "emailAddress", status, "touch1SentAt" '
                     'FROM "DirectoryClaimEmail" WHERE "organizerId" = ANY(%s) ORDER BY "createdAt"',
                ([keep_id, drop_id],))
    print("  7. Outreach rows after repoint:")
    for d in dce:
        print(f"       {d['id']}  {d['emailAddress']}  status={d['status']}  touch1SentAt={fmt(d['touch1SentAt'])}")
    drop_dce = [d for d in dce if d["id"] not in
                {x["id"] for x in fetch(cur, 'SELECT id FROM "DirectoryClaimEmail" WHERE "organizerId" = %s', (keep_id,))}]
    if len(dce) > 1 and not args.keep_duplicate_outreach_active:
        for d in drop_dce:
            print(f"       -> ARCHIVE {d['id']} (KEEP already holds a row for the same address;")
            print(f"          the sent-touch history lives on the KEEP row. Cross-run dedup in")
            print(f"          outreachEmailsCron already keys on emailAddress, so this is")
            print(f"          belt-and-braces, not the only guard. --keep-duplicate-outreach-active opts out.)")
            writes.append((f"archive duplicate DirectoryClaimEmail {d['id']}",
                           'UPDATE "DirectoryClaimEmail" SET status = %s, "updatedAt" = now() WHERE id = %s',
                           ["ARCHIVED", d["id"]]))
    elif len(dce) <= 1:
        print("       (single row — nothing to archive)")

    # 8. delete the drop organizer, then its now-orphaned system User
    print(f"  8. DELETE Organizer {drop_id}")
    writes.append((f"delete Organizer {drop_id}", 'DELETE FROM "Organizer" WHERE id = %s', [drop_id]))

    drop_user = drop.get("userId")
    user_row = fetch(cur, 'SELECT id, email, role FROM "User" WHERE id = %s', (drop_user,))
    print(f"  9. Orphaned system User {drop_user}")
    if user_row:
        u = user_row[0]
        print(f"       {u['email']}  role={u['role']}")
        user_fks = fetch(cur, """
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND ccu.table_name = 'User' AND ccu.column_name = 'id'
        """)
        residual = []
        for r in user_fks:
            if r["table_name"] == "Organizer":
                continue
            n = fetch(cur, f'SELECT count(*) AS n FROM "{r["table_name"]}" WHERE "{r["column_name"]}" = %s',
                      (drop_user,))[0]["n"]
            if n:
                residual.append(f"{r['table_name']}.{r['column_name']}={n}")
        if residual:
            print(f"       LEAVING IN PLACE — still referenced by: {', '.join(residual)}")
        else:
            print(f"       no remaining references across {len(user_fks)} User FK(s) -> DELETE")
            writes.append((f"delete orphaned User {drop_user}",
                           'DELETE FROM "User" WHERE id = %s', [drop_user]))
    else:
        print("       (user row not found — nothing to delete)")

    # ---- AFTER (projected) --------------------------------------------------------------------
    print("\n" + "-" * 94)
    print("AFTER (projected)")
    print("-" * 94)
    print(f"  {'field':26s} {'BEFORE':40s} AFTER")
    for f in DISPLAY_FIELDS:
        if f in keep:
            before, after = keep.get(f), updates.get(f, keep.get(f))
            flag = "*" if f in updates else " "
            print(f" {flag}{f:26s} {fmt(before):40s} {fmt(after)}")
    print(f"\n  Organizer rows: 2 -> 1        (deleting {drop_id})")
    print(f"  User rows:      2 -> {1 if any('delete orphaned User' in w[0] for w in writes) else 2}")

    # ---- EXECUTE ------------------------------------------------------------------------------
    print("\n" + "=" * 94)
    print(f"  {len(writes)} statement(s) planned")
    for i, (desc, _, _) in enumerate(writes, 1):
        print(f"    {i:2d}. {desc}")
    print("=" * 94)

    if not args.apply:
        print("\nDRY RUN — nothing was written. Re-run with --apply to execute.")
        conn.rollback()
        conn.close()
        return 0

    print("\nAPPLYING in a single transaction...")
    try:
        for desc, sql, params in writes:
            cur.execute(sql, params)
            print(f"  ok  {desc}  (rowcount={cur.rowcount})")
        conn.commit()
        print("\nCOMMITTED.")
    except Exception as e:
        conn.rollback()
        print(f"\nROLLED BACK — no changes written. Error: {e}")
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
