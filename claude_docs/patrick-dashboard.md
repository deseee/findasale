# Patrick's Dashboard — Week of May 2, 2026 (updated S626)

## What Happened This Week

**S626 — Organizer acquisition strategy v3 + records sync.** Strategy session, no code shipped. Multi-lens research (Innovation, Marketing, Customer Champion, Advisory Board with Risk+GTM+Growth subcommittees, Tech Stack, Cadence) on the cold-outreach pipeline that turns scraped organizer records into claimed listings. Synthesized into `claude_docs/strategy/organizer-acquisition-strategy.md`. **All seven open decisions resolved** — email-only Phase 1, no founder voice / institutional sender (`outreach@finda.sale` from "The FindA.Sale Team"), fully automated reply handling per S268 Zero-Human stack, **tooling: Workspace seat $6/mo + custom Postgres cron Phase 1, migrate to Instantly.ai at 500/day** (Resend stays transactional only — confirmed banned for cold outreach in their AUP, along with SendGrid/Postmark/Mailgun/Brevo/Zoho/SES). Plus full records sync — STATE.md, qa-backlog.md, decisions-log.md all brought current.

**S625 — Multi-source directory scraper + crawl management schema.** Four new scrapers live: HERE Places (250k free/mo), Foursquare (1k/day free), OSM Overpass (free/open), plus Google Places switched to monthly — all $0/year total. Canada coverage added (15 metros); Quebec scrape-only with outreach suppressed per Bill 96 ruling. Crawl management schema deployed: `DirectoryCrawlQueue` + `DirectoryCrawlLog` + `DirectoryClaimEmail` + 22 new Organizer lifecycle fields. Sub-area strategy designed for ~20 dense metros. Legal cleared Google ToS.

**S624 — ADR-077 Google Places Business Directory Scraper.** 11 business categories ingested monthly across 100 US metros. All pushed and deployed.

**S623 — Scraper audit.** 6 of 7 pipeline fixes shipped. googleRating + googleRatingCount added to Organizer model.

**Previously —** A massive scraper and outreach pipeline week. The agents shipped the entire sale-scraping infrastructure (EstateSalesNet, Craigslist, Eventbrite, and newspaper RSS feeds), found and fixed a root-cause bug that had been dumping all scraped organizer listings onto a single fake account instead of creating one record per real company, and cleaned up 5,833 misattributed sale records. The Claim-This-Listing flow went live (organizers can now claim their auto-scraped listing via a magic-link email), and the organizer contact pipeline was extended to scrape company websites for real email addresses.

## Open Audit Findings (still pending)

### 🚨 Weekly Site Audit — 2026-05-02

**1 CRITICAL, 3 HIGH findings.** Full report: `claude_docs/audits/weekly-audit-2026-05-02.md`. All four are now in qa-backlog.md under "ACTIVE QA QUEUE → S625 Weekly Site Audit Findings."

**CRITICAL — C-001: Scraped sales all returning "Sale not found"**
All scraped listing URLs return "Sale not found." Root cause: migration `20260501020000_scraper_phase1` likely did not deploy to production — `isUnmanagedListing` column missing in live DB. Every claim email link is broken. All scraper SEO value is zeroed.
→ **Patrick action**: Run `npx prisma migrate deploy` with Railway URL. See block below.

**HIGH — H-002: Images not loading platform-wide**
Sale cover images, item thumbnails, and purchase history item photos all blank. Affects organizer sales, sale detail items, trending, purchase history. Core photo-centric workflow broken.
→ Needs dev investigation of Cloudinary config / `next.config.js` domains.

**HIGH — H-001: D-006 violated — Items section buried below Map on sale detail page**
Shoppers must scroll past entire page to see items. Quick reorder fix.

**HIGH — H-003: City hub pages all 404**
`/cities` index lists cities but every city card link 404s. Slug mismatch between API (raw city name) and static JSON. The S604–S607 city SEO infrastructure is a dead end until fixed.

**Also found**: Systemic horizontal overflow on pricing/sale detail/guide/home (P2). Workspace empty state near-invisible in dark mode (P2). Org messages copy organizer-only (P2).

### ⚠️ Brand Drift Alert — 2026-05-02

**No P0/P1 violations.** 8 P2 + 5 P3 issues. Full report: `claude_docs/audits/brand-drift-2026-05-02.md`.

P2 D-001 (All Sale Types): OnboardingModal welcome copy, Twitter card, schema.org, FAQ, EfficiencyCoachingWidget tooltip, referral share messages all omit one or more sale types.
P2 D-006 (No AI in copy): PriceResearchPanel shows 🤖 robot emoji.
P2 skill drift: findasale-marketing SKILL.md describes brand voice as "neighbor who runs estate sales" — seeds estate-sale-default. Will be addressed in next records pass.

All P2 items are safe to batch into a single dev dispatch.

### Known open bugs (not from an audit)

- Every item detail page (`/items/[id]`) returns a 500 error — pre-existing, in qa-backlog
- Sale page social previews are blank — likely missing `INTERNAL_API_URL` env var in Vercel
- Hunt Pass shows "Inactive" in one part of the app while showing "Active" in another
- Tier-lapse warning banner is red and dismissible instead of sticky amber

All four are in qa-backlog under "Pre-existing Open Bugs."

## QA Backlog Status

`claude_docs/operations/qa-backlog.md` was brought current in S626. **Header now reads "S626 records sync — 2026-05-02."** The new "ACTIVE QA QUEUE" section at the top covers S625 audit findings, pre-existing open bugs, the full S601 storefront v2 batch (#354–#363), and 8 missing carryover items (treasure hunt progress, ConfirmDialog smoke, hydration #418 remaining instances, DonationModal SettlementWizard, Holds /shopper, PDF watermark visual, iCal footer, Craigslist selector validation). **The file is now complete and current.** It has not yet had its older verified items archived to a separate "Shipped + Verified" section — that's a future records pass.

## This Week's Priority

1. **Run the C-001 migration fix.** This is blocking the entire scraped-listing experience. One PowerShell command:
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
   $env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
   npx prisma migrate deploy
   npx prisma generate
   ```
2. **Get the scraper pipeline fully running** — manually trigger ESN scraper + Enrichment Backfill (`all=true`).
3. **Send the 19 outreach drafts sitting in Gmail** — Nick Loper, Codie Sanchez, the trade associations, and others. Ready since S596.
4. **Decide on S627 first task** — the strategy doc is locked, you can dispatch the outreach pipeline build (option 2) or the crawl queue manager (option 1) or focus on the audit P0/P1 fixes. Recommended order is in STATE.md "## Next Session."

## Action Items for Patrick

- [ ] **Push S626 wrap block** — see push block below
- [ ] **Run C-001 migration deploy** (block above) — fixes scraped sales 404, restores claim flow
- [ ] **Sign up HERE API** at developer.here.com → add `HERE_API_KEY` GitHub Secret
- [ ] **Sign up Foursquare API** at location.foursquare.com/developer → add `FOURSQUARE_API_KEY` GitHub Secret
- [ ] **GitHub Actions → Scrape EstateSalesNet → Run workflow** (rebuilds scraped sales)
- [ ] **GitHub Actions → Enrichment Backfill → Run with `all=true`** (after scraper finishes)
- [ ] **Press release Version B** — fill `[Last Name]` ×3 + real cell number. File: `claude_docs/strategy/s603-pr-wire-blast-package.md`. Filing window: May 5, 9:00 AM EST.
- [ ] **Review and send 19 outreach drafts in Gmail** (just need From set to patrick@finda.sale)
- [ ] **Decide S627 first task** — outreach pipeline build vs. crawl queue manager vs. audit P0/P1 fixes (see STATE.md "## Next Session")

## S626 Push Block

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/strategy/organizer-acquisition-strategy.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/decisions-log.md
git add claude_docs/operations/qa-backlog.md
git commit -m "S626 — organizer acquisition strategy v3 (email-only Phase 1, Workspace+custom Postgres cron, no founder voice) + records sync (qa-backlog brought current, decisions-log entry)"
.\push.ps1
```

The new memory file `feedback_no_founder_voice.md` and updated `MEMORY.md` live outside the project repo (in your Cowork memory directory) and are not part of this push.
