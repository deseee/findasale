# Patrick's Dashboard — Week of May 5, 2026 (S646 wrap)

## What Happened This Week

**S646 — CategoryTopFinds + City Own-Data + Bug Fixes + Backend Crash Restored.**

Big architectural fix this session. eBay Browse API has no geo filter — all 20 city pages were showing identical items regardless of location. Solved with an elegant split: **eBay data feeds category pages** (antiques, jewelry, vintage, etc.), **your own organizer inventory feeds city pages** (real local sales, no eBay dependency).

Four tracks shipped:

1. **CategoryTopFinds (new feature)** — New DB table + nightly cron (05:00 UTC) that pulls eBay listings by category ID for 9 FindA.Sale categories. New API endpoint. New "Trending in this Category" horizontal scroll section on `/categories/[category]` pages. Gated by `CATEGORY_SYNC_ENABLED=true` Railway env var — set this to activate.

2. **City pages now use your own data** — metroSyncCron updated to query your own active, published sale items first (state-matched, last 30 days). If ≥8 items found → eBay skipped entirely. If <8 → eBay fills the gap. Grand Rapids city page will show actual items from Grand Rapids sales, not national eBay results.

3. **Bug fixes shipped** — `/items/[id]` SSR 500 (extended the Prisma select so the item detail page no longer crashes), Hunt Pass badge (removed "Inactive" text that showed when Hunt Pass wasn't active), tier-lapse banner now reads live subscription status from DB instead of stale JWT.

4. **Backend was down — restored** — The agent that fixed the tier-lapse bug truncated the last 19 lines of `organizers.ts`. Railway compiled the broken JS and crashed in a boot loop (`SyntaxError: Unexpected end of input`). Restored the missing code; backend is back up.

Also fixed a Vercel SSR crash: `CityTopFinds` was calling `.toFixed()` on undefined `soldPrice` for some MetroTopFinds rows. Added null guards throughout.

**S645 — MetroSync Fixed + Gmail outreach.finda.sale Activated.** MetroSync was broken — all 20 metros returning zero items. Root cause: double-quoted search terms were sending literal `%22` characters to eBay's API. Fixed. 120 items synced. Gmail for `outreach.finda.sale` activated.

**S644 — SmallScreen Partnership Research + ESN Enrichment Fix.** SmallScreen (Winnipeg talent agency, secondhand/resale niche) reached out. Canada expansion plan surfaced (roadmap #366–371). ESN enrichment workflow fixed (dynamic matrix + 60min timeout).

**S643 — Help Library Plan.** 75-guide written + video library plan built. Roadmap #377 (drafts) + #378 (site surface) added.

**S641 — Cold Outreach Deep-Audit.** Verdict: BUILD don't BUY. Workspace + Postgres cron is the right path ($6/mo, no vendor lock-in). Smartlead/Instantly/Saleshandy all ruled out. Saleshandy is the fallback if we ever buy.

## Two-Sided Pipeline Status

| Track | Status | Cost |
|---|---|---|
| **Cold Outreach Email Build** (#374) | Spec queued — S647 or choose Track B | $6/mo (Workspace seat) |
| **Shopper-Side SEO** (#375) | Audit queued — parallel to cold email | $0 (existing pages) |
| **Category Pages (new)** | ✅ CategoryTopFinds live — activate with env var | $0 |
| **City Pages (own data)** | ✅ metroSyncCron own-data swap live | $0 |
| **Partnership Outreach** | 19 drafts queued in Patrick's Gmail | $0 |

## Action Items for Patrick

- [ ] **`prisma migrate deploy`** for `20260504120000_add_category_top_finds` migration (CategoryTopFinds table won't exist until you run this)
- [ ] **Set `CATEGORY_SYNC_ENABLED=true`** in Railway env vars (categorySyncCron is gated behind this — category pages won't populate without it)
- [ ] **Send 19 queued Gmail partnership outreach drafts** (NESA, NAA ×2, NASMM, ISA, Nick Loper, Codie Sanchez, etc.)
- [ ] **Provision `outreach@finda.sale` Workspace seat** ($6/mo) — needed before cold-outreach dev work
- [ ] **Set profile photo on `outreach@finda.sale`** — log into gmail.com directly → Google Account icon → upload `icon-72x72.png`

## Next Session (S647)

1. **Sale social previews** — OG meta still blank on shared sale links. Likely missing `INTERNAL_API_URL` in Vercel env vars. 5-minute fix if confirmed. Last item in the Blocked/Unverified Queue.
2. **Choose a secondary track:** Track A (Help Library drafts, #377), Track B (Cold Outreach + Shopper SEO specs), or Track C (CategoryTopFinds Chrome QA after first cron run).
