# ADR — Scraper/Email-Discovery Slow-Query Cluster — 2026-06-18

## Decision
The 2026-06-18 Sentry 7-day slow-query cluster is **NOT a missing-index problem**.
Every index the offending queries need already exists in the Railway production DB
(verified via `pg_indexes`). The cluster is caused by **write amplification + table/index
bloat + stale planner stats** on two over-indexed, over-wide tables. **No new indexes
will be added** — doing so would worsen the dominant problem (write cost).

## Evidence (production DB, verified 2026-06-18)
| Table | Rows | Total | Heap | Indexes | #idx | #cols | HOT-upd % | Dead % |
|-------|------|-------|------|---------|------|-------|-----------|--------|
| Sale | 67,128 | 173 MB | 78 MB | **88 MB** | 26 | 69 | **8.4%** | 15.4% |
| Organizer | 81,783 | 163 MB | 94 MB | 69 MB | 31 | **146** | 68.3% | 17.8% |

- Sale's index footprint (88 MB) **exceeds its heap** (78 MB). Only 8.4% of Sale UPDATEs
  are HOT (heap-only) — meaning ~91% of every scraper `lastScrapedAt` write rewrites all
  **26 indexes**. `Sale_lastScrapedAt_idx` exists, so touching `lastScrapedAt` always
  breaks the HOT path.
- Confirmed pre-existing indexes covering the "slow" SELECTs:
  - `Sale_scrapedMetadata_gin_idx` — GIN `jsonb_path_ops WHERE scrapedMetadata IS NOT NULL`
  - `Sale_sourceName_sourceUrl_idx` — `(sourceName, sourceUrl)` partial
  - `Sale_status_endDate_autoclose_idx` — `(status, endDate) WHERE deletedAt IS NULL`
  - `Organizer_email_discovery_partial_idx` — `(id) WHERE contactEmail IS NULL AND website IS NOT NULL`
- All offenders are `Users: 0`, level=warning (>1000ms Prisma slow-query log threshold).
  No failures. Volume ramped ~5× on 2026-06-16 with the outreach scale-up.

## Per-offender disposition
1. **UPDATE Sale SET lastScrapedAt WHERE id** (most frequent, ≤1882ms) — **write amplification.**
   PK lookup is instant; cost is 26-index maintenance per row + `RETURNING` full 69-col row.
   Fix: CODE (batch `updateMany`, drop RETURNING) + DB ops (fillfactor/autovacuum). NOT an index.
2. **SELECT Sale WHERE scrapedMetadata #> path = val AND sourceName** (≤1365ms) — GIN index
   exists but `#> path = value` equality does **not** use a `jsonb_path_ops` GIN index;
   only `@>` containment does. Fix: CODE — rewrite dedup to `scrapedMetadata @> '{...}'::jsonb`.
   (Phase-2 option: promote the dedup key to a typed indexed column.)
3. **SELECT Organizer WHERE contactEmail IS NULL AND website IS NOT NULL AND isUnmanagedListing**
   (≤1664ms) — `Organizer_email_discovery_partial_idx` already covers the NULL predicates.
   Fix: `ANALYZE` first; if still slow, extend the partial predicate to include
   `AND "isUnmanagedListing" = true` (raw-SQL drop+recreate).
4. **UPDATE Organizer SET contactEmail… WHERE id** (~1089ms) — write amplification (3 contactEmail
   indexes). Organizer HOT rate is 68% so lower urgency. Fix: CODE batch the discovery writes.
5/6. **Sale expiry sweep — SELECT/UPDATE status WHERE status+endDate<…+deletedAt IS NULL+sourceUrl IS NOT NULL**
   (≤3342ms) — `Sale_status_endDate_autoclose_idx` covers the candidate scan; the cost is the
   bulk UPDATE write (26-index maintenance × N rows) + stale stats. Fix: `ANALYZE` + batch/limit
   the UPDATE. NOT a new index.
7. **SELECT COUNT(*) … WHERE 1=1 OFFSET** (~1250ms) — unfiltered full-table count; no index can
   help. Fix: CODE — `pg_class.reltuples` estimate or cached total or keyset pagination.
8. **SELECT Organizer WHERE id IN ($1..$20)** (~1426ms) — PK IN-list; slowness is wide-row heap
   fetch (146 cols) + bloat. Fix: CODE — `select: { id, businessName }` only; DB `VACUUM`.

## Rationale
Adding indexes is the reflexive fix and is wrong here: the tables are already at 26/31 indexes,
index size rivals/exceeds heap, and the hot path is writes. The highest-leverage, lowest-risk
move is refreshing stats + reclaiming bloat (`VACUUM ANALYZE`), which alone likely clears the
SELECT-side "slow" reads (stale-plan artifacts post-ramp), followed by batching the scraper
write path.

## Consequences
- Sale and Organizer index budgets are now **closed** — new `@@index` additions require explicit
  Architect sign-off and a write-cost justification.
- `Organizer` at 146 columns is a god-table; a future ADR should evaluate extracting cold column
  groups (directory/scraper, eBay, branding) into satellite tables. Out of scope for this fix.

## Constraints Added
- No new index on Sale or Organizer without Architect sign-off (write-cost gate).
- High-churn columns (`lastScrapedAt`) must not gain additional indexes.
