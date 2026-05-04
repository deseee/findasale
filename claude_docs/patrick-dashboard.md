# Patrick's Dashboard — Week of May 4, 2026

## What Happened This Week

S639: Investigated $47.22 Google Places API charge on your $100 Google Cloud bill. The $200/month free credit is gone — Google replaced it with subscription tiers in early 2025. Pay as you go is still the right plan at your usage level. Fixed the underlying cost driver in enrichment.ts (you pushed it yourself): removed unnecessary `rating`/`user_ratings_total` fields from Place Details requests, added a 30-day TTL cache so the same organizer doesn't get re-fetched, and added skip logic so organizers who already have both phone and website don't get re-enriched. Also set a hard daily quota cap on the Places API: 15,000 requests/day (was Unlimited), which puts a hard ceiling of ~$15/day even if something goes wrong.

S638: HERE geocoding fallback shipped. Six scraper fleet bugs fixed (HERE coordinate dedup, Foursquare 429, Railway P2002 email+placeId, ARG_MAX curl crash). All confirmed live on GitHub.

Previous: Email hit rate 1.4% → 31% (SMTP verifier), 4 outreach templates finalized and ready to wire into send pipeline.

## Audit Results (Weekly + Brand Drift — May 2)

**Weekly Site Audit found:**
- **1 Critical:** Scraped sale pages return "Sale not found" — the `/sales/[id]` URLs for every scraped listing (hundreds of sales across Nashville, Chicago, Atlanta, etc.) are currently broken. Claim email links don't work. This is likely a database migration that didn't deploy. Routed to dev.
- **3 High:** (1) Items section on sale pages appears below the map instead of above it — buyers scroll past inventory. (2) Images not loading across the platform — blank gray boxes where sale photos should appear. (3) City hub pages all 404 — the `/cities` index lists cities correctly but every single link leads to a dead page.
- **3 Medium / 3 Low:** Layout overflow on some pages, dark mode contrast failure in workspace, organizer-only copy on the shared messages page. Lower priority but all documented.

**Brand Drift Audit found 14 items (all P2/P3):**
- 8 places where "flea markets" or "auctions" are missing from copy that should be inclusive of all sale types (onboarding modal, Twitter meta, FAQ, referral share text, etc.)
- Robot emoji (🤖) in the price research panel — visually signals "AI" to users, which is banned
- 6 developer comments using "estate sale" as the default framing (cosmetic, but shapes agent output)
- All 14 are batched and ready to route to dev — no Patrick decision needed.

## Pending Decisions

No items in DECISIONS.md currently marked PENDING. All standing decisions (D-001 through D-010) are locked.

## Beta Tester Impact

**Right now, beta testers would hit:** broken sale pages for any scraped listing, missing photos across most of the site, and dead city pages. These are real blockers if you're showing the product to anyone. The outreach pipeline isn't wired yet, so no cold emails are going out yet. The referral system (shoppers earning XP for introducing organizers) is built but its database migration may not be deployed yet — depends on whether the S635 push block was completed.

## This Week's Priority

1. **Wire outreach emails into Postgres cron** — the templates are done (S636), the pipeline is ready, this is S639's primary goal.
2. **Fix the C-001 migration** — scraped sales returning "not found" blocks the entire scraper infrastructure from being publicly useful.
3. **Image loading investigation** — blank photos across the platform is a confidence killer. Worth a quick Cloudinary/next.config.js check before any beta demo.

## Action Items for Patrick

- [ ] **Add `HERE_API_KEY` GitHub Secret** — code is live in herePlaces.ts but the secret isn't in GitHub repo settings yet, so the workflow can't call it. Go to github.com/deseee/findasale → Settings → Secrets → Actions → New secret.
- [ ] **Send 19 queued Gmail outreach drafts** (Nick Loper, Codie Sanchez, NAA ×2, NASMM, ISA, NESA, etc.)
- [ ] **Push S639 wrap docs** (STATE.md + patrick-dashboard.md — pushblock below)
