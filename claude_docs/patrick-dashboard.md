# Patrick's Dashboard — Week of May 2, 2026 (updated S628)

## What Happened This Week

**S628 — MetroTopFinds crash fixed + 3,635 scraped sales unblocked nationally.** Two P0 fixes. (1) Railway backend was crashing on every city page request (`prisma.metroTopFinds` was `undefined`) because the `MetroTopFinds` model was lost from `schema.prisma` during S625's schema sync. Fixed by restoring the model and forcing a Railway rebuild — Prisma client now regenerates with the model. (2) Discovered that ALL 3,635 scraped sales were invisible on the homepage, Trending, search, and category pages — a filter added in S614 (`isUnmanagedListing: false OR isClaimed: true`) was silently blocking every scraped organizer from every public query. Advisory board voted 6+0 to show scraped listings publicly. Removed the filter from 14 query locations across trendingController, saleController, and itemSearchService. Added a stale-sale date guard so expired scraped sales don't show. Chrome-verified: Trending page now shows sales from Kalamazoo, Holland, Branford CT, Pasadena MD, Worcester MA, Hagerstown MD. No Patrick actions needed — all deployed.

**S627 — All 4 weekly audit P0/P1 bugs fixed and Chrome-verified.** C-001 (scraped sale pages "Sale not found") — root cause was schema drift: `verificationSource` was never pushed to GitHub, so Railway's Prisma client didn't know about it. Patrick pushed the complete schema.prisma mid-session. A second crash then surfaced: the rank gate was calling `.getTime()` on `null` `publishedAt` (scraped sales have no publishedAt). Fixed with null guards in `saleController.ts` and `rankService.ts`. H-001 (items buried below map on sale detail) — fixed, items now above map. H-002 (images blank platform-wide) — fixed, Cloudinary added to Next.js image domains. H-003 (city hub pages all 404 for scraped cities) — fixed by adding slug-parsing fallback to `pages/city/[slug].tsx`: when a slug like `nashville-tn` isn't in the 2,723-city JSON, it now constructs the city name+state from the slug instead of 404ing. Verified live at finda.sale/city/nashville-tn. No pending Patrick actions — all code is on GitHub and deployed.

**S626 — Organizer acquisition strategy v3 + records sync.** Strategy session, no code shipped. Multi-lens research (Innovation, Marketing, Customer Champion, Advisory Board with Risk+GTM+Growth subcommittees, Tech Stack, Cadence) on the cold-outreach pipeline that turns scraped organizer records into claimed listings. Synthesized into `claude_docs/strategy/organizer-acquisition-strategy.md`. **All seven open decisions resolved** — email-only Phase 1, no founder voice / institutional sender (`outreach@finda.sale` from "The FindA.Sale Team"), fully automated reply handling per S268 Zero-Human stack, **tooling: Workspace seat $6/mo + custom Postgres cron Phase 1, migrate to Instantly.ai at 500/day** (Resend stays transactional only — confirmed banned for cold outreach in their AUP, along with SendGrid/Postmark/Mailgun/Brevo/Zoho/SES). Plus full records sync — STATE.md, qa-backlog.md, decisions-log.md all brought current.

**S625 — Multi-source directory scraper + crawl management schema.** Four new scrapers live: HERE Places (250k free/mo), Foursquare (1k/day free), OSM Overpass (free/open), plus Google Places switched to monthly — all $0/year total. Canada coverage added (15 metros); Quebec scrape-only with outreach suppressed per Bill 96 ruling. Crawl management schema deployed: `DirectoryCrawlQueue` + `DirectoryCrawlLog` + `DirectoryClaimEmail` + 22 new Organizer lifecycle fields. Sub-area strategy designed for ~20 dense metros. Legal cleared Google ToS.

**S624 — ADR-077 Google Places Business Directory Scraper.** 11 business categories ingested monthly across 100 US metros. All pushed and deployed.

**S623 — Scraper audit.** 6 of 7 pipeline fixes shipped. googleRating + googleRatingCount added to Organizer model.

**Previously —** A massive scraper and outreach pipeline week. The agents shipped the entire sale-scraping infrastructure (EstateSalesNet, Craigslist, Eventbrite, and newspaper RSS feeds), found and fixed a root-cause bug that had been dumping all scraped organizer listings onto a single fake account instead of creating one record per real company, and cleaned up 5,833 misattributed sale records. The Claim-This-Listing flow went live (organizers can now claim their auto-scraped listing via a magic-link email), and the organizer contact pipeline was extended to scrape company websites for real email addresses.

## Open Audit Findings

### ✅ Weekly Site Audit — 2026-05-02 — ALL P0/P1 RESOLVED (S627)

Full report: `claude_docs/audits/weekly-audit-2026-05-02.md`. All four P0/P1 findings fixed and Chrome-verified in S627.

- ✅ **C-001**: Scraped sale pages "Sale not found" — fixed (schema drift + null publishedAt guard)
- ✅ **H-001**: Items buried below map on sale detail — fixed (reordered)
- ✅ **H-002**: Images blank platform-wide — fixed (Cloudinary domain in next.config.js)
- ✅ **H-003**: City hub pages 404 for scraped cities — fixed (slug-parsing fallback in [slug].tsx)

**Still open (P2)**: Systemic horizontal overflow on pricing/sale detail/guide/home. Workspace empty state near-invisible in dark mode. Org messages copy organizer-only. These are safe to batch into a single dev dispatch.

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

1. **Push the S628 wrap block** (below) — gets the docs current on GitHub.
2. **Run GitHub Actions → Scrape EstateSalesNet → Run workflow** — scraped sales are now publicly visible; a fresh ingest will populate Trending and city pages with current data.
3. **Send the 19 outreach drafts sitting in Gmail** — Nick Loper, Codie Sanchez, trade associations. Ready since S596, long overdue.
4. **Sign up HERE + Foursquare APIs** — `developer.here.com` + `location.foursquare.com/developer`, add both keys as GitHub Secrets.
5. **Next session:** dispatch the organizer outreach pipeline build (S626 strategy v3) — scraped sales are live, outreach is the next unlock.

## Action Items for Patrick

- [ ] **Push S628 wrap block** — see push block below
- [ ] **GitHub Actions → Scrape EstateSalesNet → Run workflow** (fresh ingest now that scraped sales are visible)
- [ ] **Sign up HERE API** at developer.here.com → add `HERE_API_KEY` GitHub Secret
- [ ] **Sign up Foursquare API** at location.foursquare.com/developer → add `FOURSQUARE_API_KEY` GitHub Secret
- [ ] **Review and send 19 outreach drafts in Gmail** (just need From set to patrick@finda.sale)

## S628 Push Block

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: S628 wrap — MetroTopFinds crash fixed, scraped sales unblocked on all public feeds"
.\push.ps1
```
