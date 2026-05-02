# Patrick's Dashboard — Week of May 2, 2026 (updated S623)

## What Happened This Week (S623 addition)

**S623 — Scraper audit complete.** 6 of 7 fixes shipped in one pass: lat/lng now stored on every ingested sale, `isAuctionSale` synced, `saleSchedule` captured in metadata, sale type tags auto-generated (estate-sale / auction / garage-sale / flea-market), Google Places API expanded to fetch rating data, and tiktokUrl now flows through ESN enrichment. Fix 7 (storing Google rating on Organizer) is blocked — Organizer schema needs `googleRating Decimal?` + `googleRatingCount Int?` fields. Dispatch findasale-architect when ready.

**Previously —** A massive scraper and outreach pipeline week. The agents shipped the entire sale-scraping infrastructure (EstateSalesNet, Craigslist, Eventbrite, and newspaper RSS feeds), found and fixed a root-cause bug that had been dumping all scraped organizer listings onto a single fake account instead of creating one record per real company, and cleaned up 5,833 misattributed sale records. On top of that, the Claim-This-Listing flow went live (organizers can now claim their auto-scraped listing via a magic-link email), and the organizer contact pipeline was extended to scrape company websites for real email addresses. Several strategy sessions also ran covering viral acquisition mechanics and the PR wire launch.

## Audit Results

### ⚠️ Brand Drift Alert — 2026-05-02

Weekly brand drift scan completed. **No P0/P1 violations.** 8 P2 copy drift issues and 5 P3 cosmetic/comment issues found. Full report: `claude_docs/audits/brand-drift-2026-05-02.md`

**P2 drift (D-001 — All Sale Types):**
- OnboardingModal welcome copy omits flea markets (first thing new shoppers see)
- Twitter card meta description omits flea markets
- schema.org description omits yard sales and flea markets
- FAQ copy says "estate sale organizer" where it should say "organizer"
- EfficiencyCoachingWidget tooltip references estate sales only
- Referral share messages omit auctions and flea markets (2 files)

**P2 drift (D-006 — No AI in copy):**
- PriceResearchPanel shows 🤖 robot emoji ("🤖 Smart Estimate") in user-facing text — visually signals AI

**P2 skill drift:**
- findasale-marketing SKILL.md describes the brand voice as "a neighbor who runs estate sales" — seeds estate-sale-default in generated content

All P2 items are safe to batch into a single dev dispatch. P3 items (4 dev comments + 1 missing dark: class) can be batched separately at low cost.

**Known open bugs (not from an audit, but flagged in QA sessions):**
- Every item detail page (`/items/[id]`) returns a 500 error — pre-existing, not new, but still broken for shoppers trying to view individual items
- Sale page social previews (the image/description when you share a link) are blank in production — likely a missing environment variable in Vercel (`INTERNAL_API_URL`)
- Hunt Pass shows "Inactive" in one part of the app while showing "Active" in another
- The tier-lapse warning banner is red and dismissible instead of sticky amber

All four of the above are queued for the next dev session.

## Pending Decisions

No formal PENDING decisions in the decisions log. However, **6 strategy decisions from the viral mechanics session (D-S603-A through F) were due for your sign-off by May 3** — that's tomorrow. Check `claude_docs/strategy/s603-final-plan.md` if you haven't locked those yet.

## Beta Tester Impact

**Good news for testers this week:**
- Organizers with auto-scraped listings now see an amber "Claim This Listing" banner on their storefront — they can take ownership via email link
- Sale pages show business hours, organizer type badges, broadcast updates, featured sale pins, and auction buyer's premium details
- The deleted-sale 404 loop bug is permanently fixed (was hammering the server with requests)

**Still rough:**
- Item detail pages are broken (500 error) — shoppers can't click into individual items
- If you're testing on a lapsed tier account, the warning message looks wrong

## This Week's Priority

1. **Get the scraper pipeline fully running** — you need to manually trigger two GitHub Actions (ESN scraper first, then Enrichment Backfill with `all=true`) to rebuild the 5,833 deleted sales and populate contact emails for all organizers. This unlocks the whole outreach workflow.
2. **Fix the item detail page 500** — this is a shopper-facing P0. It's been sitting unresolved since before last week. Needs a dispatch to find the Vercel stack trace.
3. **Send the 19 outreach drafts sitting in Gmail** — Nick Loper, Codie Sanchez, the trade associations, and others. They've been ready since S596.

## Action Items for Patrick

- [ ] **Push S623 changes** — see push block below
- [ ] **GitHub Actions → Scrape EstateSalesNet → Run workflow** (rebuilds scraped sales; will now correctly store lat/lng + tags + isAuctionSale)
- [ ] **GitHub Actions → Enrichment Backfill → Run with `all=true`** (after scraper finishes — populates contact emails + tiktokUrl now flows)
- [ ] **Railway dashboard → findasale-backend → Variables → add `GOOGLE_PLACES_API_KEY`** (needed for phone/address enrichment)
- [ ] **Dispatch findasale-architect: add `googleRating Decimal?` + `googleRatingCount Int?` to Organizer model** (blocked Fix 7 from S623)
- [ ] **Review and send 19 outreach drafts in Gmail** (ready to go — just needs your From address set to patrick@finda.sale before hitting send)
- [ ] **Press release Version B** — still has `[Last Name]` placeholder in 3 places + needs your real cell number. File: `claude_docs/strategy/s603-pr-wire-blast-package.md`
- [ ] **Lock the 6 viral mechanics decisions (D-S603-A through F)** by May 3 — `claude_docs/strategy/s603-final-plan.md`

## S623 Push Block

```powershell
git add packages/backend/src/services/scraper/index.ts
git add packages/backend/src/services/scraper/sources/estatesalesnet.ts
git add packages/backend/src/services/scraper/enrichment.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/logs/scheduled-task-log.md
git commit -m "fix(scraper): S623 — store lat/lng, isAuctionSale, tags on ingest; saleSchedule in metadata; tiktokUrl + Google rating fields in enrichment"
.\push.ps1
```
