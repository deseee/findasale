"""
Backfill directoryMostRecentSource from sourcesJson.

For organizers where directoryMostRecentSource is NULL or 'StateLicensing',
derive the correct value from the sourcesJson array (which all scrapers populate).

sourcesJson structure: [{ "sourceName": "FloridaPhase2", "sourceId": "...", "lastSeen": "2025-..." }]

Run from PowerShell:
  pip install psycopg2-binary
  $env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
  python packages/backend/scripts/backfillDirectoryMostRecentSource.py

Dry run (no writes):
  python packages/backend/scripts/backfillDirectoryMostRecentSource.py --dry-run
"""

import psycopg2
import json
import sys
import os
from datetime import datetime

DRY_RUN = '--dry-run' in sys.argv

DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway'
)

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

print(f"[Backfill] DRY_RUN={DRY_RUN}")
print(f"[Backfill] Connected to Railway DB")

# Count candidates
cur.execute("""
    SELECT COUNT(*) FROM "Organizer"
    WHERE ("directoryMostRecentSource" IS NULL OR "directoryMostRecentSource" = 'StateLicensing')
      AND "sourcesJson" IS NOT NULL
      AND "sourcesJson" != 'null'::jsonb
      AND jsonb_array_length("sourcesJson") > 0
""")
total = cur.fetchone()[0]
print(f"[Backfill] Candidates to update: {total}")

if total == 0:
    print("[Backfill] Nothing to do.")
    conn.close()
    sys.exit(0)

# Fetch candidates
cur.execute("""
    SELECT id, "businessName", "directoryMostRecentSource", "sourcesJson"
    FROM "Organizer"
    WHERE ("directoryMostRecentSource" IS NULL OR "directoryMostRecentSource" = 'StateLicensing')
      AND "sourcesJson" IS NOT NULL
      AND "sourcesJson" != 'null'::jsonb
      AND jsonb_array_length("sourcesJson") > 0
    ORDER BY id
""")
rows = cur.fetchall()

updated = 0
skipped = 0
errors = 0

for row in rows:
    org_id, business_name, current_source, sources_json_raw = row

    try:
        sources = sources_json_raw if isinstance(sources_json_raw, list) else json.loads(sources_json_raw)

        if not sources:
            skipped += 1
            continue

        # Pick the entry with the most recent lastSeen, or first if no lastSeen
        def get_last_seen(s):
            ls = s.get('lastSeen')
            if ls:
                try:
                    return datetime.fromisoformat(ls.replace('Z', '+00:00'))
                except Exception:
                    pass
            return datetime.min

        best = max(sources, key=get_last_seen)
        source_name = best.get('sourceName')

        if not source_name:
            skipped += 1
            continue

        print(f"[Backfill] {business_name[:50]}: {current_source or 'NULL'} -> {source_name}")

        if not DRY_RUN:
            cur.execute(
                'UPDATE "Organizer" SET "directoryMostRecentSource" = %s, "updatedAt" = NOW() WHERE id = %s',
                (source_name, org_id)
            )
        updated += 1

    except Exception as e:
        print(f"[Backfill] ERROR for {org_id} ({business_name}): {e}")
        errors += 1

if not DRY_RUN:
    conn.commit()
    print(f"\n[Backfill] COMMITTED. Updated: {updated}, Skipped: {skipped}, Errors: {errors}")
else:
    print(f"\n[Backfill] DRY RUN complete. Would update: {updated}, Would skip: {skipped}, Errors: {errors}")

conn.close()
