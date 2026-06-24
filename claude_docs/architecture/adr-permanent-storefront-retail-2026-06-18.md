# ADR — Permanent Storefront Model for RETAIL Sales

- **Status:** PROPOSED (Architect design — no code/schema changes made)
- **Date:** 2026-06-18
- **Author:** Systems Architect (subagent)
- **Scope:** `packages/database` (schema), `packages/backend` (crons, services, controllers, feeds), `packages/frontend` (sale page, JSON-LD, SEO)
- **Decision owner:** Patrick
- **Related:** Feature #XXX Retail Mode, Feature #249 Concurrent Sales Gate, Feature #300 FlipReport, Feature #75 Tier Limits

---

## 1. Context & Current-State Analysis

A `RETAIL` sale is intended to be an **always-live storefront** (e.g. "Artifact Downtown Paw Paw"). But the platform models *every* `Sale` as a **dated, time-boxed event**, and there is a daily cron that converts a permanent store into a **monthly chain of distinct Sale rows**. Each cycle mints a new `Sale.id`, fragmenting the store's identity, history, links, and analytics.

### 1.1 Schema — `Sale` (`packages/database/prisma/schema.prisma:809`)

- `startDate DateTime` and `endDate DateTime` are **REQUIRED / non-nullable** (`schema.prisma:813-814`). A RETAIL sale therefore *must* carry a concrete end date.
- `saleType String @default("ESTATE")` — `RETAIL` is one of many enum-like string values (`schema.prisma:826`).
- `retailAutoRenewDays Int @default(30)` (`schema.prisma:932`) — drives the monthly re-creation cadence.
- `isInventoryContainer Boolean @default(false)` (`schema.prisma:929`) — separate hidden-DRAFT inventory holder, not the storefront.
- Storefront_v2 fields present: `isPinned` (`923`), plus hours/types fields referenced in migration `20260430000000_storefront_v2_hours_types_pinned`.
- `Item.lastSaleId String?` (`schema.prisma:1068`) — "last sale item was in (for FlipReport union query)". This is the field the auto-renew cron writes when it MOVES items between the monthly sale rows.
- Indexes assume `(status, endDate)` ordering throughout (`schema.prisma:981, 983-997`), including partial index `Sale_status_endDate_autoclose_idx (status, endDate) WHERE deletedAt IS NULL` documented at `schema.prisma:999-1000`.

### 1.2 Auto-close cron (`packages/backend/src/jobs/saleAutoCloseCron.ts`)

- Runs hourly (`0 * * * *`).
- Flips `PUBLISHED` → `ENDED` for sales where `endDate < now` **AND `sourceUrl IS NOT NULL`** (`saleAutoCloseCron.ts:22-26, 31-37`).
- **KEY FINDING:** The `sourceUrl IS NOT NULL` guard means **auto-close only touches *scraped* sales** — organizer-owned RETAIL sales (which have `sourceUrl = null`) are *already* protected from this cron. So auto-close is **NOT the cause of the fragmentation.** The problem comes entirely from `retailAutoRenewJob`, which sets the old sale to `ENDED` itself.

### 1.3 Auto-renew cron (`packages/backend/src/jobs/retailAutoRenewJob.ts`)

Runs daily (`0 1 * * *`, `retailAutoRenewJob.ts:166`). For each `saleType='RETAIL'`, `status='PUBLISHED'` sale whose `endDate` falls within ~30 days ahead and `>= now` (`retailAutoRenewJob.ts:34-41`):

1. Skips if a future RETAIL sale already exists for that organizer (`:71-90`).
2. **Creates a brand-new `Sale`** (new `id`) copying title/description/address/photos/tags/etc., `status='PUBLISHED'`, `startDate = oldEndDate + 1s`, `endDate = start + retailAutoRenewDays` (`:97-130`).
3. **`updateMany` MOVES all non-`SOLD`/`DONATED` items** to the new sale: `saleId = newSale.id`, `lastSaleId = oldSale.id`, `returnedToInventoryAt = null` (`:133-146`).
4. **Sets the old sale `status='ENDED'`** (`:149-153`).

### 1.4 Verified production state (psycopg2 against Railway public proxy, 2026-06-18)

- Artifact (`organizerId=cmnxueoas...`) has **2** chained RETAIL "Artifact Downtown Paw Paw" rows: one `ENDED` (`cmom7h73l…`, May 30–Jun 29, 1 item left behind) and one `PUBLISHED` (`cmpt2oq6q…`, Jun 29–Jul 29, **103 items moved in**). New `id` each cycle.
- **This is platform-wide, not Artifact-specific.** A `GROUP BY organizerId HAVING count(*)>1` over all RETAIL sales returns **400+ organizers** with chained RETAIL rows. The worst single organizer (`cmopy9igj…`) has **43 chained RETAIL sales**; several others have 17–24. Most have 2–3.
- Implication: the migration in §4 must be a **bulk, platform-wide consolidation**, not a single Artifact fix.

### 1.5 Net effect

A permanent store's identity is scattered across N rows. Each renewal: breaks any external/QR link pointing at the old `saleId`, resets analytics/reviews/followers tied to the old sale, and leaves orphan items (the 1 SOLD/leftover item in Artifact's ENDED row). JSON-LD advertises the store as a dated `Event` that "ends" monthly.

---

## 2. Proposed Model

**Core principle:** A permanent storefront is **ONE persistent `Sale` row that never expires and is never recreated.** Time-boxed sales (ESTATE / YARD / AUCTION / FLEA_MARKET, etc.) keep working exactly as today.

### 2.1 Option comparison for "no real end date"

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Nullable `endDate`** | Make `endDate DateTime?`; RETAIL = `null` | Semantically honest ("no end"); JSON-LD/UI can branch cleanly on `null` | `endDate` is **non-nullable today and referenced in ~25 WHERE clauses + 12 indexes**. Every `endDate >= now` filter must add `OR endDate IS NULL`. Large blast radius; null-ordering edge cases in `ORDER BY endDate`. |
| **B. Far-future sentinel** (e.g. `2999-12-31`) | Keep `endDate` non-null; RETAIL = sentinel | **Zero schema migration**; every existing `endDate >= now` filter *already passes* a sentinel; indexes unchanged; sorts naturally to the end | "Magic date" smell; `trendingController` has an explicit **upper bound** (`endDate <= now+90d`, see §3) that a sentinel fails; emails/UI must special-case the sentinel so users never see "ends 12/31/2999"; the existing auto-renew already uses near-future (30-day) dates so a sentinel is a behavior change |
| **C. Explicit `isOngoing` / `isPermanent` flag** | Add `Boolean @default(false)`; set true for RETAIL. Filters become `(endDate >= now OR isOngoing)` | Most explicit and self-documenting; decouples "permanence" from the date value; future sale types (e.g. ongoing online booth) can reuse it; safe default keeps every existing time-boxed sale unchanged | Adds a column + migration; still must touch the same ~25 filter sites to add `OR isOngoing`; two sources of truth (flag + date) need an invariant |

### 2.2 Recommendation — **Hybrid: Option C flag + Option B sentinel-ish endDate**

Add a permanence flag **and** stop writing near-future end dates for RETAIL:

1. Add `Sale.isOngoing Boolean @default(false)` (Option C). Set `true` when `saleType='RETAIL'`.
2. Keep `endDate` **non-nullable** (avoid the nullable-migration blast radius of Option A) but for ongoing sales store a **far-future endDate** (e.g. `2999-12-31T23:59:59Z`) so the 12 `(status,endDate)` indexes and the ~20 `endDate >= now` filters **keep returning RETAIL with no code change at those sites.**
3. Update only the *bounded* and *display* sites that a far-future date breaks (trending upper-bound; "ends in" UI; emails; JSON-LD) to branch on `isOngoing`.
4. **Retire `retailAutoRenewJob` for RETAIL** (make it a no-op / unregister) so the permanent row is never recreated.

Why hybrid over pure C: the flag gives clean branching for display/notification logic, while the sentinel endDate means we do **not** have to retrofit `OR isOngoing` into all ~20 discovery `endDate >= now` filters or rework 12 indexes — they pass automatically. We only touch the handful of places where a far-future date is *wrong* (upper-bound filters and human-readable output), and there we branch on `isOngoing`. This minimizes blast radius while keeping the model self-documenting.

**Auto-close:** no change needed — `saleAutoCloseCron` already excludes organizer-owned sales via `sourceUrl IS NOT NULL` (§1.2), and a far-future endDate would never be `< now` anyway.

**Public feed visibility:** with the sentinel endDate, RETAIL sales pass every `endDate >= now` feed filter (§3) unchanged, so they stay visible. The only feed-side fix is the trending **upper bound** and the "ending soon" sort/notification, which should exclude `isOngoing` sales.

---

## 3. Knock-On & Downstream Effects (exhaustive — priority section)

Severity legend: **BREAK** (feature is wrong/throws), **DEGRADE** (silently does nothing useful), **SAFE** (works as-is under the recommended hybrid), **DISPLAY** (cosmetic, must branch on `isOngoing`).

### 3.1 Public feed / discovery / search / map / sitemap

| Site | file:line | Filter | Under hybrid (sentinel endDate) |
|---|---|---|---|
| Personalized feed `/api/feed` | `discoveryService.ts:69` | `endDate: { gte: now }` | **SAFE** — sentinel ≥ now passes |
| Public sales list `/api/sales` | `saleController.ts:166` | `endDate: { gte: now }` | **SAFE** |
| Neighborhood SEO | `saleController.ts:1145` | `endDate: { gte: now }` | **SAFE** |
| City pages | `saleController.ts:1198, 1217` | `endDate: { gte: now }` | **SAFE** |
| Search active filter | `search.ts:71` | `endDate: { gte: now }` | **SAFE** |
| Search main | `search.ts:118` | `endDate: { gte: now }` | **SAFE** |
| Search organizer-merge | `search.ts:206` | `endDate: { gte: now }` | **SAFE** |
| Search random (raw SQL) | `search.ts:411` | `AND s."endDate" >= NOW()` | **SAFE** |
| **Trending** `/api/trending` | `trendingController.ts:51` | `endDate: { gte: now, lte: now+90d }` **AND** `startDate <= now+60d` | **BREAK** — far-future sentinel fails the `<= now+90d` upper bound, so RETAIL never trends. Existing comment at `trendingController.ts:48` already acknowledges "permanent retail businesses have endDates years in the future." Fix: add `OR isOngoing` (and decide whether ongoing stores should trend at all). |
| Heatmap | `heatmapService.ts:54` | `endDate: { gte: now }` | **SAFE** |
| City heat index | `cityHeatService.ts:43, 64` | `endDate: { gte: now }` | **SAFE** |
| "Ending soon" sort | `search.ts:111-112` | `ORDER BY sale.endDate ASC` | **DISPLAY/DEGRADE** — sentinel sorts RETAIL to the bottom (acceptable: a permanent store is never "ending soon"). No break. |
| Sitemap `/sales/sitemap` | `routes/sales.ts:337` | status=PUBLISHED, no endDate filter | **SAFE** — RETAIL included |
| City-slugs (raw SQL) | `routes/sales.ts:312` | `status IN ('PUBLISHED','ENDED')` | **SAFE** |
| By-city `/sales/by-city/:slug` | `routes/sales.ts:241` | status=PUBLISHED, no endDate | **SAFE** |
| `server-sitemap.xml.tsx` | `frontend/pages/server-sitemap.xml.tsx:52` | status=PUBLISHED only | **SAFE** |

> Net: with the sentinel, the only feed-path break is **trending's upper bound**; everything else passes. Under *pure nullable* (Option A) **all 12 SAFE rows above flip to BREAK** and each would need `OR endDate IS NULL` — this is the decisive argument for the hybrid.

### 3.2 DB indexes assuming `(status, endDate)`

`schema.prisma:981, 983-997` + partial index `Sale_status_endDate_autoclose_idx` (`:999-1000`). Under the **hybrid** these are **SAFE** — a concrete (sentinel) `endDate` keeps the b-tree usable. Under **Option A (nullable)** they **DEGRADE**: Postgres b-tree indexes store NULLs last and `endDate >= now` won't match NULL rows, forcing the discovery queries onto seqscans for ongoing sales unless partial/expression indexes are added. Another point for the hybrid.

### 3.3 Cron jobs (`packages/backend/src/jobs/`)

| Job | file:line | Effect on permanent RETAIL | Verdict / action |
|---|---|---|---|
| **retailAutoRenewJob** | `retailAutoRenewJob.ts:34-153` | This *is* the fragmentation engine. With a far-future endDate the renewal query (`endDate <= now+30d`) returns 0 rows, so it self-disables. | **CHANGE** — explicitly make it a no-op for `isOngoing`/RETAIL or unregister the cron entirely. Don't rely on the date coincidence. |
| **saleAutoCloseCron** | `saleAutoCloseCron.ts:22-37` | Guarded by `sourceUrl IS NOT NULL`; organizer RETAIL has null sourceUrl; sentinel never `< now`. | **SAFE** |
| **saleEndingSoonJob** | `saleEndingSoonJob.ts:58-70` | Window `endDate ∈ [now+23h, now+25h]`; sentinel never matches → notification never fires. | **SAFE-by-accident**, but **add explicit `NOT isOngoing`** so intent is clear (a permanent store has no "ending soon"). |
| **markdownCron** | `markdownCron.ts:21-33` | Filters `status=PUBLISHED AND markdownEnabled AND startDate<=now`; **no endDate clear**. Markdown, once enabled on a RETAIL sale, never auto-clears. | **DEGRADE/DECISION** — if a permanent store enables auto-markdown, discounts persist forever. Document or gate by `isOngoing`. |
| **archivalCron** | `archivalCron.ts:18-26` | Soft-deletes sales `endDate < 2y ago`; sentinel never qualifies. | **DEGRADE** — permanent stores never archived (probably correct). Add explicit `NOT isOngoing` exclusion to avoid a future "magic-date" archival surprise. |
| **photoRetentionCron** | `photoRetentionCron.ts:101-102, 135-136` | Archives/deletes photos when `sale.endDate < 90d/1y ago`; sentinel never qualifies → photos never cleaned. | **DEGRADE / cost** — permanent storefront photos accrue storage forever. Decide a retention rule for ongoing stores (e.g. by item `updatedAt`, not sale endDate). |
| **reputationJob** | `reputationJob.ts:35-36` | Counts organizer's `status='ENDED'` sales for TRUSTED / ESTATE_CURATOR tiers. A permanent RETAIL store never reaches ENDED. | **BREAK (today's chain inflated this; permanent fixes it but changes counts)** — a RETAIL-only organizer never earns ended-sale credit. Decide: exclude RETAIL from tier math, or add a separate "active storefront" credit. NOTE: consolidating the chain (§4) will also **drop** the artificially-accumulated ENDED counts from monthly renewals. |
| **monthlyTrendReportJob** | `monthlyTrendReportJob.ts:80, 95, 203` | Counts `status IN (PUBLISHED, ENDED)`. RETAIL stays PUBLISHED. | **SAFE** (but per-organizer counts shift after consolidation — see §4 risks). |
| **presaleSneakPeekJob** | `presaleSneakPeekJob.ts:114-115` | Window on `startDate`, not endDate. | **SAFE** |
| **curatorEmailJob** | `curatorEmailJob.ts:46` | Renders `formatDate(s.endDate)` in follower digest. | **DISPLAY** — would print "ends 12/31/2999". Branch on `isOngoing` → "Always open". |
| **abandonedCheckoutJob** | `abandonedCheckoutJob.ts:68` | Loads `sale.title` only. | **SAFE** |
| **googleMerchantFeedCron** | `googleMerchantFeedCron.ts:16-24` | Nightly rebuild, no date checks. | **SAFE** |

### 3.4 Item ownership / `lastSaleId` / item migration

- Today the auto-renew cron MOVES items and writes `lastSaleId` (`retailAutoRenewJob.ts:139`). With ONE permanent sale, items **never move**, so `saleId` is stable and `lastSaleId` simply records the prior inventory pull.
- **FlipReport** (`flipReportService.ts:83-96`) unions `items WHERE saleId = X` with `items WHERE lastSaleId = X AND status='SOLD'` (returned-to-inventory). For a permanent store, the second set is normally empty and `saleItems = itemsInSale`. **SAFE** — logic still sound, just no "returned" rows.
- **itemInventoryService** (`itemInventoryService.ts:86-101` pull, `:128-149` return). `returnItemsToInventory()` is gated on `sale.status='ENDED'` (`:142`). For a permanent store that never ENDs, **bulk return-to-inventory at sale end never triggers** — items would be "trapped" in the permanent sale. **DEGRADE/DECISION** — relax the ENDED gate for `isOngoing` so organizers can manually return items while the store is live, or accept that permanent-store items only leave via SOLD/DONATED/manual delete.
- **#249 Concurrent Sales Gate** (`saleController.ts:551-570, 828-848`, `tierLimits.ts`): counts active sales via `status='PUBLISHED' AND endDate > now`. RETAIL requires TEAMS/ENTERPRISE (`saleController.ts:535-538`), and both tiers have effectively unlimited `maxConcurrentSales` (`tierLimits.ts` TEAMS/ENTERPRISE = `MAX_SAFE_INTEGER`). A permanent store counts as 1 active forever — harmless. **SAFE.** (After consolidation, organizers stop accumulating multiple "active" RETAIL rows, which is also correct.)

### 3.5 Analytics / reporting / leaderboards / followers

- **FlipReport / leaderboards:** see §3.4 — SAFE. No leaderboard found that cuts by sale endDate directly.
- **reputationJob tiers:** see §3.3 — DECISION needed.
- **monthlyTrendReportJob:** SAFE (counts PUBLISHED+ENDED).
- **Follower notifications:** `followerNotificationService.ts:29-134` fires on the PUBLISHED transition, not on end — so a permanent store notifies followers **once** at publish. **SAFE / correct.** "Ending soon" follower alert (`saleEndingSoonJob`) — see §3.3, suppressed for ongoing (correct). Consider an alternative "new inventory at <store>" signal for permanent stores (open question for Patrick).

### 3.6 Outbound product feeds (Google Merchant + Facebook/syndication)

- **Google Merchant feed** (`utils/googleMerchantFeed.ts:62, 141`; `services/googleMerchantFeedService.ts:52-65`): eligibility = parent `sale.status='PUBLISHED'` and `deletedAt=null`, **no endDate filter**. Permanent RETAIL items stay listed indefinitely. **SAFE.** (This is the *desired* behavior for a storefront.)
- **Facebook / syndication** (`routes/syndication.ts:31-37`; `services/syndicationFormatterService.ts:5-25`): the `SaleWithItems` type declares `endDate: Date` (**required**). Under the hybrid this is satisfied by the sentinel, so it won't throw — but the formatter may emit a far-future end date into the feed. **DISPLAY/CHANGE** — branch on `isOngoing` to omit/neutralize the end date in syndicated output. Under Option A (nullable) this type would need to become `endDate?: Date | null` (a **BREAK**).

### 3.7 QR / labels / wishlist / SEO-JSON-LD

- **Label composer** (`controllers/labelComposerController.ts:48, 87-96, 121-141`): everything keys off `:saleId` (`authorizeOrganizerForSale`, `items-for-labels`, `label-batch`). Today, monthly renewal changes `saleId` → **printed QR labels silently point at an ENDED sale**. A single permanent `saleId` makes QR/labels **stable forever** — this is a **major win** of the new model, not a regression. **IMPROVED.**
- **Wishlist matching:** wishlist references RETAIL in `frontend/pages/shopper/wishlist.tsx`; matching is item/tag-based, not sale-end-based — **SAFE** (and improved: items keep a stable saleId).
- **SEO / JSON-LD** (`frontend/pages/sales/[id].tsx:840-892`): the page emits `@type: 'Event'` with `startDate`/`endDate` (`:843-847`) and an `EventSeries` block (`:966-969`). For a permanent store this is the **wrong schema** — Google should see `Store` / `LocalBusiness` (with `openingHoursSpecification` from the storefront_v2 hours fields), not a dated `Event`. **CHANGE** — branch on `isOngoing`/RETAIL to render `LocalBusiness`/`Store` JSON-LD instead of `Event`. (Cosmetically also: the far-future `endDate` would otherwise be emitted into the Event markup.)

### 3.8 UI — organizer create/edit, public page, countdowns

- **create-sale** (`frontend/pages/organizer/create-sale.tsx`): already **hides the Dates panel for RETAIL** (`{!isRetail && (...)}`, `:857`) and shows "Retail — always live" in the summary (`:1667-1671`). The frontend *already* treats RETAIL as dateless; the backend then auto-fills a near-future endDate (`saleController.ts:543-548`). **The UI intent for "permanent" already exists** — the data model just doesn't honor it. Minimal frontend change.
- **edit-sale** (`frontend/pages/organizer/edit-sale/[id].tsx`): verify the same `!isRetail` date-hiding applies (referenced RETAIL; not line-verified here — **flag for dev to confirm**).
- **Public sale page** (`frontend/pages/sales/[id].tsx:780` `saleEndDate = parseISO(sale.endDate)`): any "ends in / countdown" rendering must branch on `isOngoing` → show "Open now / hours" instead of a countdown to 2999. **CHANGE.**
- **SaleCard / SaleOfTheDayCard / SaleOGMeta / SaleTypeBadge** all reference RETAIL — audit each for endDate/"ends" display under `isOngoing` (**flag for dev**).

---

## 4. Data Migration Plan (platform-wide consolidation)

**Goal:** collapse each organizer's chain of RETAIL `Sale` rows into ONE canonical permanent row, preserving items, orders, QR links, reviews, and history. This is **platform-wide** (§1.4: 400+ organizers, up to 43 rows each), not Artifact-only.

### 4.1 Choosing the canonical row
For each `organizerId` with multiple RETAIL sales (optionally scoped by matching title/address to be safe), pick the canonical row = the **currently PUBLISHED** one (the live row shoppers/QR codes resolve to). If multiple PUBLISHED exist (the worst organizers do), pick the **oldest PUBLISHED `startDate`** as canonical to maximize the chance existing external links/QR still resolve, OR the one with the most items — **decision for Patrick** (link-stability vs. item-mass).

### 4.2 Steps (run in a transaction per organizer; dry-run first)
1. **Identify chains:** `SELECT organizerId, array_agg(id ORDER BY startDate) FROM "Sale" WHERE saleType='RETAIL' GROUP BY organizerId HAVING count(*)>1`.
2. **Re-point items:** move all items from non-canonical rows to the canonical `saleId` (`UPDATE "Item" SET "saleId"=<canonical> WHERE "saleId" IN (<others>)`). Preserve `lastSaleId` as-is (history). This also recovers orphaned leftover items (e.g. Artifact's stray ENDED-row item).
3. **Re-point child records** that FK to `saleId`: `Purchase`, `Review`, `Favorite`, `SaleSubscriber`, `Conversation`, label batches/tags, `POSSession`, `SaleTransaction`, `SaleSettlement`, etc. — enumerate every model with a `saleId`/`sale` relation in schema.prisma before running (there are many; see relations at `schema.prisma:843-974`). **Risk:** unique constraints (e.g. one Review per buyer per sale) may collide on merge — handle conflicts explicitly.
4. **Set canonical permanent:** on the canonical row set `isOngoing=true`, `endDate=<sentinel 2999-12-31>`, `status='PUBLISHED'`.
5. **Soft-delete the non-canonical rows:** `status='ENDED'`, `deletedAt=now()` (do NOT hard-delete — preserves audit trail and any FK we missed). They drop out of feeds.
6. **Verify:** item counts conserved (sum before == on canonical after), no orphan items (`saleId` pointing at a soft-deleted row), QR/label batches resolve.

### 4.3 Risks
- **Reputation/analytics counts shift:** organizers lose the inflated ENDED-sale credit from monthly renewals (`reputationJob`, `monthlyTrendReport`). Communicate or recompute. This is a *correctness improvement* but a visible number change.
- **External links to non-canonical `saleId`** will 404 after soft-delete unless you add a redirect map (old saleId → canonical). **Recommend** a lightweight redirect (e.g. middleware or a `Sale.redirectsToId` lookup) for the soft-deleted rows. Decision for Patrick.
- **Unique-constraint collisions** during child re-pointing (step 3) — must be handled per-model, not blindly.
- **In-flight orders/holds** on a non-canonical row at migration time — migrate carefully or pause the renewal cron before migrating.

---

## 5. Phased Implementation Plan (each phase independently shippable)

**Phase 0 — Stop the bleeding (no schema change):** Make `retailAutoRenewJob` a no-op (early-return) or unregister `scheduleRetailAutoRenewCron`. Halts further fragmentation immediately. Ship alone. (Existing rows untouched.)

**Phase 1 — Schema:** Add `Sale.isOngoing Boolean @default(false)`. Migration via `prisma migrate deploy` against Railway (§6 protocol in CLAUDE.md). No data change yet. (Decision: also keep `endDate` non-nullable per the hybrid.)

**Phase 2 — Write path:** In `saleController` create/update, for `saleType='RETAIL'` set `isOngoing=true` and `endDate=<sentinel>` instead of the current `+retailAutoRenewDays` auto-fill (`saleController.ts:543-548`). New RETAIL sales are born permanent.

**Phase 3 — Display & bounded-filter fixes (branch on `isOngoing`):** trending upper bound (`trendingController.ts:51`); public-page countdown + JSON-LD `Event`→`LocalBusiness` (`sales/[id].tsx`); follower/curator email date (`curatorEmailJob.ts:46`); syndication formatter (`syndicationFormatterService.ts`); SaleCard/OGMeta "ends" displays; relax `returnItemsToInventory` ENDED gate for ongoing (`itemInventoryService.ts:142`). Add explicit `NOT isOngoing` guards to `saleEndingSoonJob`, `archivalCron`, `photoRetentionCron`, `markdownCron`, `reputationJob`.

**Phase 4 — Data migration (§4):** dry-run, then platform-wide consolidation transaction. Add old→canonical redirect if approved. Run after Phases 0–3 are live so consolidated rows land in correct shape.

**Phase 5 — Cleanup:** consider deprecating `retailAutoRenewDays` (leave column, stop using). Remove dead renewal code after a soak period.

---

## 6. Risks / Open Questions for Patrick

1. **Canonical-row choice** (§4.1): for organizers with multiple PUBLISHED RETAIL rows, prefer oldest-startDate (link stability) or most-items? Several organizers have 17–43 rows.
2. **Old-link redirects** (§4.3): build a `saleId`→canonical redirect so existing shared links / printed QR codes don't 404? Recommended yes.
3. **Reputation tiers** (`reputationJob`): exclude RETAIL from ended-sale tier math, or invent an "active storefront" credit? Consolidation will also reduce currently-inflated counts.
4. **Permanent-store photo retention** (`photoRetentionCron`): what's the storage rule for a store that never ends? (e.g. retain while item AVAILABLE; clean on SOLD+N days.)
5. **Follower engagement for permanent stores:** replace "ending soon" with a "new inventory" signal? Out of scope for the model but flagged.
6. **JSON-LD schema** (`sales/[id].tsx`): confirm we want `LocalBusiness`/`Store` with `openingHoursSpecification` (uses storefront_v2 hours fields) for RETAIL — good for local SEO but a new template.
7. **Sentinel vs nullable final call:** ADR recommends hybrid (flag + sentinel) to minimize blast radius (12 indexes + ~20 filters stay untouched). Confirm acceptance of the "2999" sentinel convention, or accept the larger nullable-migration if you prefer no magic date.

---

## 7. Decision

Recommended: **Phase 0 immediately** (no-op the auto-renew cron to stop fragmentation), then implement the **hybrid model (Option C flag + far-future sentinel endDate)** across Phases 1–5, with the platform-wide consolidation migration in Phase 4. Pending Patrick sign-off on the open questions in §6 (especially canonical-row choice, redirects, and reputation-tier treatment).
