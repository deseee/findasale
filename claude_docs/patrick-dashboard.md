# Patrick's Dashboard — Week of May 4, 2026 (S645 wrap)

## What Happened This Week

**S645 — MetroSync Fixed + Gmail outreach.finda.sale Activated.** MetroSync was broken — all 20 metros returning zero items. Root cause: double-quoted search terms (`"estate sale"`) were sending literal `%22` characters to eBay's API, which searched for items with quotation marks in the title — none exist. Fixed by removing the quotes and the `conditions:{USED}` filter. Confirmed: 120 items synced across 20 metros. Cron back on production schedule (04:00 UTC). Structural problem remains — eBay Browse API has no location filter, so all cities show identical items. Innovation dispatch queued for S646 to find a better data source. Gmail for `outreach.finda.sale` also activated this session: MX record added, SPF updated to Google, `find@outreach.finda.sale` alias live.



**S644 — SmallScreen Partnership Research + ESN Enrichment Fix.** SmallScreen Marketing (Winnipeg talent agency, secondhand/resale niche) reached out. Surfaced full Canada expansion plan (roadmap #366–371 — scrapers already cover 17 Canadian metros, blockers are CAD billing + PIPEDA compliance + Quebec block). Drafted reply email covering creator roster questions, deal structure, CA vs. US audience, and honest platform timeline. Also flagged Canadian tax issues: GST/HST digital services registration threshold, cross-border affiliate withholding. Fixed two bugs in the ESN enrichment workflow: matrix was hardcoded to 3 batches regardless of what you entered in the GitHub UI — now dynamic. Timeout extended 30 → 60 minutes so 200-sale batches don't get killed.


**S643 — Help Library Plan + Roadmap Entries.** Built `claude_docs/strategy/guide-and-video-library-plan.md` — a 75-guide written + video library covering organizer workflows (rapidfire mode, review queue + pricing, where to post flyers, POS, settlement, eBay, holds, brand kit, promote page), shopper workflows (find-a-sale, holds, condition grades, Hunt Pass, Guild, community), and trust mechanics (organizer reputation, refer-a-friend, introduce-organizer S635). Three parallel research agents mapped 50+ organizer surfaces, 42 shopper surfaces, 11 trust/community features. Existing-coverage audit categorized drafts as **FRESH (47), THIN (18), WRAPPER (10)** — surfaces existing content (`/guide`, `/faq`, `/condition-guide`, `/shopper/guild-primer`) instead of duplicating. Total writing load ~51,500 words. **No phases** — work plan is two flat steps: draft everything first → site prep + slot in approved drafts. Roadmap rows added: **#377** Help Library Drafts (write-only), **#378** Site Surface (`/guides` route + FAQ inbound links + slot in, blocked on #377). v131 entry added.

**S641 — Cold Outreach Deep-Audit + Two-Sided Pipeline Sync.** Four parallel research dispatches (~57k words, ~80 primary sources) replaced S640's shallow single-search-per-tool premise. Verdict: **BUILD don't BUY** for cold email. All four leading vendors (Smartlead, Instantly, Saleshandy, Snov.io) are campaign-orchestrators that contradict our Postgres-as-source-of-truth design. Workspace + Postgres cron path: 8 dev days, $6/mo, zero portability risk vs. tool path 7 days, $30–94/mo, dual-write debt by month 3. **S640 nearly signed us up for Smartlead — that would have been wrong** (Smartlead Pro allows only one global webhook fatal for our per-touch state machine, plus 49 documented outages in 12 months). If we ever do buy, **Saleshandy is the right tool**, not Smartlead or Instantly. Critical correction: shopper-side SEO is the demand-side marketplace flywheel — runs parallel to the cold-email build, not behind it. Existing scaffolding (`/city/[slug]`, `/categories/`, `/neighborhoods/`, etc.) needs an audit pass. RVM permanently killed (FCC 2022 TCPA ruling). LinkedIn via Expandi (~$99/mo) and NESA/NAA/NASMM partnership outreach queued as parallel innovation pilots. Roadmap entries #374–#376 added.

**S640 — Email Audit + Brand Drift Batch.** Resend audit revealed `claimEmailService.ts` was firing 200%/day usage but all sends targeted `@system.finda.sale` placeholders — no real organizer ever received email. Now disabled. `outreach.finda.sale` subdomain DNS: SPF + DMARC live, DKIM pending Workspace keypair (S643). HERE_API_KEY confirmed. P2 brand drift: 4 files fixed.

**S639 — Google Places Cost.** $47.22 charge investigated. enrichment.ts cost fix shipped. Quota hard-capped at 15,000/day.

**S638 — Scraper Fleet.** HERE geocoding fallback shipped. Six bugs fixed. SMTP verifier hit rate 1.4% → 31%.

## Two-Sided Pipeline (Locked This Week)

| Track | Status | Owner | Cost |
|---|---|---|---|
| **Cold Outreach Email Build** (#374) | Spec dispatch S642 → Dev S643 | Architect → Dev | $6/mo (Workspace seat) |
| **Shopper-Side SEO Audit** (#375) | Audit dispatch S642 → Dev S643 | Architect + SEO Audit → Dev | $0 (existing pages) |
| **LinkedIn Pilot** (#376) | Spec S642, launch Week 4 | Sales-Ops | ~$99/mo (Expandi) |
| **Partnership Outreach** | 19 drafts queued in Patrick's Gmail | Patrick (manual send) | $0 |
| **Postcard** | Gated to Phase 2 (email reply rate <2.5% after 8 weeks) | Deferred | — |
| **RVM / Voicemail** | KILLED — TCPA $500–$1,500/violation | — | — |

## Pending Decisions

**One decision needed from Patrick:** confirm "build, don't buy" verdict for cold email. No objection = S642 launches in parallel architect + SEO + marketing + sales-ops dispatches. If you want to push back on any part of the verdict, this is the moment. The full evidence base is in `claude_docs/research/cold-outreach-2026-05/` (4 docs).

## Beta Tester Impact

The cold-outreach pipeline still isn't sending — S643 is the build session, then 14-day domain warm-up. Real organizer outreach starts ~3 weeks out. Pre-existing P1 bugs from earlier weeks (broken `/sales/[id]` for scraped listings, blank photos site-wide, dead `/cities/[slug]` from old QA) — verify status during S642 architect spec passes since those are blockers if anyone clicks a real preview link.

## Next Session Priority (S646)

1. **Innovation dispatch** — `findasale-innovation` on the MetroTopFinds data source problem. All 20 city pages currently show identical items. Innovation will research alternatives (EstateSales.NET scraping, GSALR, Craigslist, eBay category rotation) and return a ranked recommendation.
2. **Choose a secondary track** alongside the innovation dispatch: Track A (Help Library drafts), Track B (Cold Outreach + Shopper SEO specs), or Track C (P1 bug fixes).

## Action Items for Patrick

- [ ] **Push S645 wrap block** (below)
- [ ] **Set profile photo on `outreach@finda.sale`** — log into gmail.com directly with that account → Google Account icon → upload `icon-72x72.png`
- [ ] **Choose S646 secondary track** (A, B, or C — runs alongside the innovation dispatch)
- [ ] **Send 19 queued Gmail partnership outreach drafts** (NESA, NAA ×2, NASMM, ISA, Nick Loper, Codie Sanchez, etc.)
- [ ] **Provision `outreach@finda.sale` Workspace seat** ($6/mo) — needed before cold-outreach dev work
- [ ] **Confirm "build, don't buy" verdict** for cold email — needed before Track B
