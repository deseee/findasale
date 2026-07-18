"""
Backfill: Purge bad Organizer.website values (social / marketplace / aggregator URLs).

Cleans ~1,600 unmanaged-listing organizer rows whose `website` field was populated by
scrapers with a social/marketplace/aggregator URL instead of the org's real business site.

Behavior:
  - SCOPE: only rows where "isUnmanagedListing" = true (never claimed/managed orgs).
  - Sale.sourceUrl is a DIFFERENT table and is never touched.
  - Franchise / real-business shared domains are NOT purged (runtime dedup handles those).

Classification of each website host:
  - SOCIAL host  -> move URL into the matching Organizer social column (only if that
                    column is currently NULL), THEN null `website`.
  - AGGREGATOR/DIRECTORY host -> capture URL into `listingUrl` (only if currently NULL),
                    THEN null `website`.
  - Everything else (real business / franchise) -> LEAVE UNTOUCHED.

DRY-RUN by default. Prints counts + a 10-row sample, writes NOTHING.
Pass --commit to perform writes (per-row, inside a single transaction).
Idempotent + safe to re-run.

Run from PowerShell (dry-run, default):
  cd <project root>  (e.g. C:/Users/desee/ClaudeProjects/FindaSale)
  pip install psycopg2-binary
  # DATABASE_URL is read from packages/database/.env automatically, or override:
  # $env:DATABASE_URL="<Railway prod proxy connection string>"
  python packages/backend/scripts/backfillPurgeBadWebsites.py

To actually apply (Patrick-gated):
  python packages/backend/scripts/backfillPurgeBadWebsites.py --commit
"""

import os
import sys
from urllib.parse import urlparse

import psycopg2

COMMIT = '--commit' in sys.argv
DRY_RUN = not COMMIT


def load_database_url():
    """Prefer env var; else parse packages/database/.env. Never hardcode a credential."""
    url = os.environ.get('DATABASE_URL')
    if url:
        return url.strip()
    here = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.normpath(os.path.join(here, '..', '..', 'database', '.env'))
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('DATABASE_URL='):
                    val = line[len('DATABASE_URL='):].strip()
                    if (val.startswith('"') and val.endswith('"')) or (
                        val.startswith("'") and val.endswith("'")
                    ):
                        val = val[1:-1]
                    return val
    raise SystemExit('DATABASE_URL not set and not found in packages/database/.env. Aborting.')


# host -> Organizer social column. Suffix-matched (host == domain OR endswith .domain).
SOCIAL_MAP = {
    'facebook.com': 'facebook',
    'm.facebook.com': 'facebook',
    'fb.com': 'facebook',
    'instagram.com': 'instagram',
    'twitter.com': 'twitterUrl',
    'x.com': 'twitterUrl',
    'tiktok.com': 'tiktokUrl',
    'pinterest.com': 'pinterestUrl',
    'youtube.com': 'youtubeUrl',
    'youtu.be': 'youtubeUrl',
    'linkedin.com': 'linkedInUrl',
    'etsy.com': 'etsy',
}

# Aggregator / directory / marketplace hosts -> captured into listingUrl, then website nulled.
AGGREGATOR_HOSTS = {
    'bid13.com', 'propertyroom.com', 'publicsurplus.com',
    'estatesales.net', 'estatesales.org', 'estatesale.com', 'estatesales.com',
    'ctbids.com', 'bidrush.com', 'auctionninja.com', 'garagesalefinder.com',
    'foursquare.com', 'here.com', 'auctionzip.com', 'hibid.com',
    'invaluable.com', 'liveauctioneers.com', 'maxsold.com', 'proxibid.com',
    'bidspotter.com', 'storagetreasures.com', 'storageauctions.com',
    'lockerfox.com', 'municibid.com', 'govdeals.com', 'ebay.com',
    'yelp.com', 'google.com', 'maps.google.com', 'craigslist.org',
    'shopgoodwill.com', 'gsalr.com',
}

COLS = [
    'id', 'website', 'facebook', 'instagram', 'twitterUrl', 'tiktokUrl',
    'youtubeUrl', 'pinterestUrl', 'etsy', 'linkedInUrl', 'listingUrl',
]
IDX = {name: i for i, name in enumerate(COLS)}


def extract_host(raw):
    """Return the lowercased host with a leading www. stripped, or '' if unparseable."""
    if not raw:
        return ''
    s = raw.strip()
    if '://' not in s:
        s = 'http://' + s  # so urlparse treats bare 'facebook.com/x' as netloc
    try:
        host = urlparse(s).netloc.lower()
    except Exception:
        return ''
    host = host.split('@')[-1]      # strip any userinfo
    host = host.split(':')[0]       # strip any port
    if host.startswith('www.'):
        host = host[4:]
    return host


def matches(host, domain):
    return host == domain or host.endswith('.' + domain)


def classify(host):
    """Return ('social', column) | ('aggregator', None) | ('untouched', None)."""
    if not host:
        return ('untouched', None)
    for domain, column in SOCIAL_MAP.items():
        if matches(host, domain):
            return ('social', column)
    for domain in AGGREGATOR_HOSTS:
        if matches(host, domain):
            return ('aggregator', None)
    return ('untouched', None)


def main():
    database_url = load_database_url()
    conn = psycopg2.connect(database_url)
    cur = conn.cursor()

    mode = 'DRY-RUN (no writes)' if DRY_RUN else 'COMMIT (writing)'
    print('[PurgeBadWebsites] Mode: ' + mode)
    print('[PurgeBadWebsites] Connected to DB')

    cur.execute(
        'SELECT "id", "website", "facebook", "instagram", "twitterUrl", '
        '"tiktokUrl", "youtubeUrl", "pinterestUrl", "etsy", '
        '"linkedInUrl", "listingUrl" '
        'FROM "Organizer" '
        'WHERE "isUnmanagedListing" = true AND "website" IS NOT NULL'
    )
    rows = cur.fetchall()
    total = len(rows)

    social_move_by_col = {}     # column -> count where we actually MOVE the url in
    social_col_occupied = {}    # column -> count where target already set (just null website)
    aggregator_move = 0         # actual listingUrl captures
    aggregator_occupied = 0     # listingUrl already set (just null website)
    nulled = 0                  # rows whose website WOULD be nulled (all social+aggregator)
    untouched = 0               # real business / franchise domains

    planned = []  # (id, host, action, target_col, moved_bool)

    for r in rows:
        oid = r[IDX['id']]
        website = r[IDX['website']]
        host = extract_host(website)
        kind, column = classify(host)

        if kind == 'social':
            target_current = r[IDX[column]]
            moved = target_current is None
            if moved:
                social_move_by_col[column] = social_move_by_col.get(column, 0) + 1
            else:
                social_col_occupied[column] = social_col_occupied.get(column, 0) + 1
            nulled += 1
            planned.append((oid, host, 'social', column, moved))

        elif kind == 'aggregator':
            listing_current = r[IDX['listingUrl']]
            moved = listing_current is None
            if moved:
                aggregator_move += 1
            else:
                aggregator_occupied += 1
            nulled += 1
            planned.append((oid, host, 'aggregator', 'listingUrl', moved))

        else:
            untouched += 1
            planned.append((oid, host, 'untouched', None, False))

    social_total = sum(social_move_by_col.values()) + sum(social_col_occupied.values())

    print('')
    print('==================== PLAN SUMMARY ====================')
    print('Total eligible (isUnmanagedListing=true, website NOT NULL): ' + str(total))
    print('  Social rows (total):        ' + str(social_total))
    for col in sorted(set(list(social_move_by_col) + list(social_col_occupied))):
        moved = social_move_by_col.get(col, 0)
        occ = social_col_occupied.get(col, 0)
        print('      -> %-14s move-into-column=%5d  target-already-set=%5d' % (col, moved, occ))
    print('  Aggregator rows (total):    ' + str(aggregator_move + aggregator_occupied))
    print('      -> listingUrl capture=%5d  listingUrl-already-set=%5d' % (aggregator_move, aggregator_occupied))
    print('  Website WOULD be nulled:    ' + str(nulled) + '   (all social + aggregator rows)')
    print('  Left UNTOUCHED (real/franchise domains): ' + str(untouched))
    print('======================================================')

    print('')
    print('Sample (first 10 planned rows):')
    for oid, host, action, target, moved in planned[:10]:
        if action == 'social':
            detail = ('move into ' + target) if moved else (target + ' already set -> just null website')
        elif action == 'aggregator':
            detail = 'capture into listingUrl' if moved else 'listingUrl already set -> just null website'
        else:
            detail = 'leave untouched'
        print('  %s  host=%-32r [%s] %s' % (oid, host, action, detail))

    if DRY_RUN:
        print('')
        print('[PurgeBadWebsites] DRY-RUN complete. No rows were modified.')
        cur.close()
        conn.close()
        return

    # ---- COMMIT path (Patrick-gated) ----
    print('')
    print('[PurgeBadWebsites] COMMIT mode: applying updates in a transaction...')
    social_applied = 0
    aggregator_applied = 0
    website_nulled = 0
    try:
        for oid, host, action, target, moved in planned:
            if action == 'social':
                if moved:
                    cur.execute(
                        'UPDATE "Organizer" SET "' + target + '" = "website" '
                        'WHERE "id" = %s AND "isUnmanagedListing" = true '
                        'AND "' + target + '" IS NULL AND "website" IS NOT NULL',
                        (oid,),
                    )
                    social_applied += cur.rowcount
                cur.execute(
                    'UPDATE "Organizer" SET "website" = NULL '
                    'WHERE "id" = %s AND "isUnmanagedListing" = true',
                    (oid,),
                )
                website_nulled += cur.rowcount
            elif action == 'aggregator':
                if moved:
                    cur.execute(
                        'UPDATE "Organizer" SET "listingUrl" = "website" '
                        'WHERE "id" = %s AND "isUnmanagedListing" = true '
                        'AND "listingUrl" IS NULL AND "website" IS NOT NULL',
                        (oid,),
                    )
                    aggregator_applied += cur.rowcount
                cur.execute(
                    'UPDATE "Organizer" SET "website" = NULL '
                    'WHERE "id" = %s AND "isUnmanagedListing" = true',
                    (oid,),
                )
                website_nulled += cur.rowcount
            # untouched: no-op
        conn.commit()
        print('[PurgeBadWebsites] COMMIT succeeded.')
        print('  Social columns populated: ' + str(social_applied))
        print('  listingUrl captured:      ' + str(aggregator_applied))
        print('  Website fields nulled:    ' + str(website_nulled))
    except Exception as e:
        conn.rollback()
        print('[PurgeBadWebsites] ERROR - rolled back: ' + str(e))
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    main()
