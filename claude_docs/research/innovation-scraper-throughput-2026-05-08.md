# Scraper Infrastructure Innovation — 5 Problem Solve-Out

**Date:** 2026-05-08  
**Author:** Innovation Agent  
**Status:** Recommendations Ready for Architect Review  

**Context:** FindA.Sale operates 301-metro scraper infrastructure with 7,897 existing leads. Current bottleneck: GitHub Actions 60-minute timeout. Analysis follows for 5 specific problems with 3 options each and a clear recommendation per problem.

---

## Problem 1 — Throughput / Coverage

**Current state:** GitHub Actions workflows have a 60-minute timeout. Scrapers process metros sequentially. With 301 metros × 23 queries = 6,923 calls/run, the workflow dies at ~550 calls (~8% coverage per month). No cursor or queue — each run starts from metro 1.

**Options:**

### Option A: Cursor-Based Queue in Database
**Description:** Create a new `ScraperQueue` table that stores cursor position per source per workflow. Each workflow run picks up where the last left off, incrementing through metros sequentially across multiple runs.

**Pros:**
- Simple state management; queries update row on completion
- Fully serializable — no race conditions with concurrent runs
- Works across workflow failures (cursor survives crashes)
- Minimal code changes to existing scrapers

**Cons:**
- Requires manual schema migration + backfill
- Doesn't parallelize — still sequential, just resumable
- Database round-trip per batch (small overhead)
- Doesn't solve the 60-minute timeout for long metro lists

**Dev cost:** Small (S)

---

### Option B: Split Metros into Parallel Matrix Batches
**Description:** Use GitHub Actions `matrix` strategy to split 301 metros into 6 parallel jobs (e.g., metros 0-50, 50-100, 100-150, etc.). Each job gets a 10-minute window on the same 60-minute budget. Jobs run concurrently via `runs-on: ubuntu-latest` pool.

**Pros:**
- Fixes throughput immediately — 6x parallelism = full coverage per month
- No database schema changes
- Uses GitHub's free parallelism budget (5 concurrent jobs standard tier)
- Each job stays under 60 min (max ~11 min per job with margin)
- Scales easily (add more matrix shards)

**Cons:**
- API rate limit risk — 6 parallel jobs × 23 queries = 138 simultaneous calls, may hit HERE/Foursquare rate limits
- Requires rate-limiter coordination across jobs (shared Redis or backoff strategy)
- GitHub Actions matrix syntax can be finicky with branch conditionals
- Cost: minimal ($0.08 per matrix run, negligible at $21/month GitHub Actions cap)

**Dev cost:** Medium (M)

---

### Option C: Move Cron Trigger to Railway
**Description:** Disable GitHub Actions cron (or keep as backup). Instead, create a Railway background task that runs the scraper script directly via the backend Node.js environment. Railway cron supports 25-minute runs; split into 2–3 sequential Railway crons per workflow (e.g., metros 0-150 on cron A, 150-301 on cron B).

**Pros:**
- Railway is already paid; cron cost included in subscription (~$5/month tier)
- Runs in backend environment, not isolated Ubuntu container
- Supports longer execution (25 min per job, can chain 2–3 sequentially)
- Simpler workflow file (just HTTP trigger to Railway API)
- No GitHub Actions timeout applies

**Cons:**
- Moves infrastructure coupling to Railway (higher vendor lock-in)
- Railway cron granularity is 1-minute minimum (can't schedule intra-hour chains easily)
- Requires new Railway task configuration + monitoring
- State management still serial (needs cursor DB table same as Option A)
- Cost: bundled in Railway subscription (no visible increase, but increases compute usage)

**Dev cost:** Medium-Large (M–L)

---

**Recommendation:** **Option B — Parallel Matrix Batches**

GitHub Actions matrix parallelism is the fastest, lowest-friction path. FindA.Sale already runs on GitHub; a 6-batch matrix is battle-tested GitHub syntax. The rate-limit concern is real but manageable: HERE and Foursquare both use sliding-window rate limits, not per-second caps. Stagger matrix jobs with 5-second backoff (`sleep 5` before each source loop) to serialize API calls across batches. This keeps throughput at 301 metros/month (100% coverage) without database schema changes or Railway infrastructure expansion.

**Feasibility:** BUILD NOW

**Next step:** Architect spec for matrix strategy, rate-limiter coordination, backoff logic.

---

## Problem 2 — Source Tracking Gap

**Current state:** 7,897 existing scraped orgs have `directoryMostRecentSource = NULL` and `sourcesJson = NULL`. The admin scrape pool dashboard can't show run history or source attribution. New scrapers populate these fields, but history is lost.

**Options:**

### Option A: Backfill Job — Infer Source from Patterns
**Description:** Write a one-time backfill job that examines existing orgs' fields (phone format, URL patterns, address structure, website TLD patterns, esnOrgId presence) and infers which scraper source most likely created each record. Update `directoryMostRecentSource` and `sourcesJson` with inferred source + confidence score.

**Pros:**
- Single execution, complete one-time fix
- No ongoing code changes needed
- Produces usable (if approximate) source history
- Can be discarded after run (no permanent infra)

**Cons:**
- Inference is lossy — many orgs may be ambiguous (e.g., phone + address could be HERE or Foursquare)
- Confidence scores will be low (~40-60%) for many records
- If inference is wrong, dashboard shows false history
- Requires pattern library development (phone regex, TLD patterns, etc.)
- Cannot detect which specific run created the record — only the source type

**Dev cost:** Medium (M)

---

### Option B: Forward-Fix Only — Populate from Now On
**Description:** Update all active scrapers to populate `directoryMostRecentSource` and `sourcesJson` on next run. Leave 7,897 existing records as NULL. New records will have full source history going forward. Existing records show as "Unknown Source" in admin dashboard.

**Pros:**
- Zero backfill cost; no complex inference needed
- Starts accumulating clean data immediately
- Forward data is 100% accurate (direct from scraper)
- Simple code change (add 2 fields to scraper output)
- No schema migration risk

**Cons:**
- Existing 7,897 records remain unmapped — dashboard is 62% dark (only new ~3,000/month visible)
- Takes 18+ months to accumulate full source history (backlog never fully visible)
- Can't audit past run history or source effectiveness
- Admin has no way to know which 7,897 records are old/dark

**Dev cost:** Small (S)

---

### Option C: Hybrid — Forward-Fix + High-Confidence Backfill
**Description:** Implement forward-fix (Option B) immediately. In parallel, run a conservative backfill that only updates records with >90% confidence inference (e.g., `esnOrgId` present → definitely ESN; consistent phone format + website + 3+ corroboration sources → high confidence HERE/Foursquare). Mark low-confidence records as "inferred: false" in sourcesJson. Leave truly ambiguous records as NULL.

**Pros:**
- Immediate forward-fix (clean new data from today onward)
- Backfill covers ~30-40% of existing records with high confidence (ESN-sourced orgs + multi-corroborated records)
- Dashboard shows source for ~60% of all records (existing high-conf + all new)
- Still captures inference, but labels confidence explicitly
- Can re-run backfill later with improved patterns (not a one-time commitment)

**Cons:**
- Requires both forward-fix AND inference code (moderate engineering complexity)
- Confidence thresholds are subjective — must define clearly upfront
- Backfill still needs ~1 week dev time
- Maintenance burden: confidence scoring logic must stay in sync with scraper changes

**Dev cost:** Medium (M)

---

**Recommendation:** **Option C — Hybrid (Forward-Fix + High-Confidence Backfill)**

Forward-fix alone leaves 7,897 records dark forever. Full backfill risks polluting history with false inferences. The hybrid approach is pragmatic: start populating source tracking today (Option B) and selectively recover history for records where source is nearly certain (ESN orgs + multi-sourced corroborations). This gets admin dashboard to 60%+ coverage within a month and establishes the infrastructure for future backfill improvements.

**Feasibility:** BUILD NOW (forward-fix) + DEFER (backfill to Week 2)

**Next step:** Dev updates all scrapers to populate directoryMostRecentSource and sourcesJson. Architect spec for confidence-threshold backfill logic.

---

## Problem 3 — HOT Lead Score = 0

**Current state:** All 7,897 scraped orgs score COLD or WARM. HOT requires `isStateLicensed` (25 pts) or 10+ Google reviews (stripped — Google ToS). With Places gone, scoring engine may never produce HOT leads. HOT threshold is 70 pts; current max without licensing/reviews is ~55 pts (contact 25 + corroboration 20 + physical presence 15).

**Options:**

### Option A: Recalibrate HOT Threshold
**Description:** Lower HOT threshold from 70 → 55 pts. Adjust tier thresholds: COLD 0–24, WARM 25–49, HOT 50–74, ENTERPRISE 75–100. This makes HOT attainable without licensing or 10+ reviews.

**Pros:**
- One-line config change; no backfill needed
- Immediate effect — 40–50% of WARM tier will shift to HOT
- Simpler scoring weights (no need for alternative signals)
- Outreach can prioritize HOT tier immediately

**Cons:**
- HOT loses meaning — becomes "basically any org with phone + basic corroboration"
- Outreach strategy assumes HOT = high-value targets; dilution of confidence
- No additional qualification signal — might waste outreach resources
- Doesn't leverage new licensing data (Indiana scraper live, 17 more coming)
- Marketing assumption (HOT = vetted business) becomes false

**Dev cost:** Negligible (S)

---

### Option B: Add Alternative Signals to Reach HOT
**Description:** Keep 70-pt threshold. Add new signals that don't require licensing or reviews:
- ESN member = +15 pts (proxy for active estate sale organizer; ESN vets members)
- Website + phone + 2+ social media profiles = +10 pts (physical presence proxy)
- Sale count from ESN data = +5-15 pts (tiered: 1-5 sales=+5, 6-20=+10, 20+=+15)
- Consistent name across 3+ data sources = +5 pts (corroboration bonus)

This allows 70-pt HOT threshold with enriched scoring.

**Pros:**
- Preserves HOT meaning — still requires evidence of operation
- Unlocks 20–30% of orgs to HOT tier via ESN membership + sale count
- ESN membership is objective, highly reliable signal
- Doesn't depend on deprecated APIs (no Google reviews)
- Outreach can rely on HOT = vetted or active operator

**Cons:**
- Requires ESN membership field in Organizer model (schema change + migration)
- Sale count inference from ESN historical data (lossy; ESN may not expose)
- Adds 4 new scoring dimensions (complexity increases from 5 → 9)
- More corroboration work needed (ESN lookups + sale history parsing)
- Still won't generate ENTERPRISE tier (no automatic licensing path)

**Dev cost:** Large (L)

---

### Option C: Use State Licensing Scraper Matches
**Description:** Indiana licensing scraper is live; 17 more states (TX, NC, etc.) coming. Use direct `isStateLicensed` matches from state scraper data to populate the `isStateLicensed` field (25 pts) + `licenseNumber`. This alone will generate HOT tiers (70-pt requirement met with 25 licensing + 45 pts from other signals).

**Pros:**
- Direct use of scraper output (no inference needed)
- Licensing is objective, highly credible signal
- Indiana scraper provides immediate path to 100-200 licensed orgs
- When 18-state batch completes, 1,000+ orgs will be licensed
- HOT tier becomes real and deserved

**Cons:**
- Requires licensing scrapers to finish (dependent on S691 completion + 17 more states)
- Indiana batch may only capture 2–5% of 7,897 (estate sale auctioneers are smaller subset)
- Full 18-state batch still covers only ~70% of US population
- Will take 4–6 weeks to build full 18-state batch
- Some states' licensing data is behind paywalls or PDFs (Phase 2 needed)

**Dev cost:** Depends on scraper state — inherited from S691 work (estimated L for full batch)

---

**Recommendation:** **Option C (primary) + Option B (secondary enhancement)**

Option C is the immediate path: wire the Indiana licensing scraper output to `isStateLicensed` and let the 200–500 licensed organizers naturally reach HOT tier. This is live in 2–3 weeks. Option B (ESN membership + sale count signals) becomes the Phase 2 enhancement — adds ~20% more HOT orgs once ESN data integration is mature. Don't lower the threshold (Option A) — it dilutes the signal and wastes outreach on marginal leads.

**Feasibility:** BUILD NOW (Option C — wire Indiana output) + DEFER (Option B — ESN enrichment to June roadmap)

**Next step:** Dev integrates Indiana scraper output into Organizer.isStateLicensed field. Architect specs for ESN membership + sale count signal design.

---

## Problem 4 — Email Discovery Pipeline

**Current state:** `email-discovery-spec.md` exists but: (a) has Hunter.io/Clearbit/Apollo references that must be removed (paid APIs, not approved), (b) `emailDiscoveryService.ts` is not built yet. Free-only methods available: website contact page scraping (Playwright/cheerio), email pattern permutation (first.last@domain, info@domain, etc.), SMTP RCPT-TO probing.

**Options:**

### Option A: Standalone Service — On-Demand Discovery
**Description:** Build `emailDiscoveryService.ts` as an independent service. Called explicitly per organizer (no automatic triggers). Service runs 6-stage pipeline synchronously: website scraping → pattern generation → SMTP verification → return email + confidence. Used by admin dashboard ("Discover Email" button) and batch admin operations.

**Pros:**
- Decoupled from enrichment pipeline (no blocking dependencies)
- On-demand control — only discover when needed (saves compute)
- Can be called with user confirmation (no surprise updates)
- Clear error handling (Playwright timeouts don't block critical path)
- Simple integration: call when admin clicks button, return result

**Cons:**
- Slower per-organizer (synchronous Playwright run = 2-5s per org)
- Batch operations (discover emails for 1,000 orgs) become slow (>1 hour)
- Doesn't integrate with outreach pipeline automatically
- Requires admin UI button (discovery is manual, not automatic)
- High compute cost for bulk operations (Playwright instances per request)

**Dev cost:** Medium (M)

---

### Option B: Enrichment Pipeline Step — Automatic on Corroboration
**Description:** Integrate emailDiscoveryService as a stage in the existing `enrichment.ts` pipeline. After corroboration scoring runs, if an organizer has corroborationScore >0.7 (meaning it's likely real) but no contactEmail, trigger discovery automatically. Store result in contactEmail field.

**Pros:**
- Fully automatic — no manual admin action needed
- Integrates with existing enrichment flow (no new orchestration)
- Runs async (fire-and-forget within enrichment.ts)
- Scales easily — discovery runs for all new orgs that need it
- Reduces manual discovery burden on team

**Cons:**
- Discovery runs for ALL orgs with score >0.7 (high compute cost: ~7,897 orgs × 2-5s = ~6 hours cumulative)
- Email discovery success rates are lower than reviews (40-55% vs. 95%+ for licensing)
- If website scraping fails (site down, robot detection), enrichment logs error but continues (silent failure risk)
- Hard to debug failures in async pipeline (no user feedback)

**Dev cost:** Medium-Large (M–L)

---

### Option C: Event-Triggered Discovery — On Tier Escalation
**Description:** Emit a `LeadTierEscalated` event when an organizer's leadScore crosses threshold (COLD→WARM, WARM→HOT). Discovery service listens for event and runs asynchronously only for tier escalations. This focuses discovery effort on high-priority leads.

**Pros:**
- Selective execution — only discover for leads that matter (tier escalation means higher confidence)
- Reduced compute cost (~10% of orgs = ~800 discoveries/month vs. 7,897)
- Organizers getting HOT tier are likely to respond (high ROI on discovery effort)
- Can batch discoveries (run 50/hour vs. on-demand)
- Clear trigger: tier change = discovery-worthy

**Cons:**
- Requires event bus infrastructure (Kafka/Bull/Redis) or polling
- Discovery still happens async; delays tier escalation by minutes/hours
- If discovery finds email, lead score may need recalculation (feedback loop)
- Only solves for future tier changes; existing WARM/HOT orgs not covered
- Requires schema field for discoveredEmail (vs. reusing contactEmail)

**Dev cost:** Large (L)

---

**Recommendation:** **Option B — Enrichment Pipeline Step**

The email-discovery-spec.md is already integrated into enrichment philosophy (post-corroboration, before outreach). Build emailDiscoveryService as a fire-and-forget async step in `enrichment.ts`, triggered when corroborationScore >0.7 and no contactEmail exists. This captures emails for ~2,000–3,000 orgs organically. The compute cost (2-5s per discovery × ~2,500 orgs = ~3 hours) is acceptable in a weekly enrichment cron. Success rate (40-55%) is lower than licensing, but discovery emails are a valuable fallback when phone/website contact fails.

Option C (event-triggered) is premature optimization — don't defer until discovery value is proven. Option A (on-demand) is admin-heavy.

**Feasibility:** BUILD NOW

**Next step:** Dev builds emailDiscoveryService.ts (stages 1-3: website scraping, pattern generation, SMTP verification). Strip Hunter.io/Clearbit/Apollo from spec immediately. Architect specs for async integration into enrichment.ts.

---

## Problem 5 — MailerLite Sequence Wiring

**Current state:** `outreach-email-strategy.md` has COLD/WARM/HOT sequences designed (4-touch, 8-week warming ramp). `outreachEmailsCron.ts` exists but is NOT wired to MailerLite sequences. Currently sends raw emails directly via Workspace SMTP.

**Generate 3 trigger logic options, recommend one:**

### Option A: Time-Based Sequential Progression
**Description:** Cron runs weekly. Each time an organizer is selected for outreach, record `firstContactAt` timestamp. Then, based on elapsed time since `firstContactAt`, advance organizer through sequence steps:
- Step 1 (Week 0): Send Cold/Warm/Hot variant via Workspace SMTP
- Step 2 (Week 2): MailerLite template #1 (follow-up 1)
- Step 3 (Week 4): MailerLite template #2 (follow-up 2)
- Step 4 (Week 6): MailerLite template #3 (follow-up 3, final touch)
- After Week 8: Mark as `outreachComplete` — stop sending

**Pros:**
- Simple logic — one source of truth is elapsed time
- No complexity with tier transitions
- Easy to audit: look at `firstContactAt` + current date = know where in sequence
- Cron can handle all orchestration (no external MailerLite triggers)

**Cons:**
- If an organizer is COLD initially, then scores WARM in Week 3, they still get COLD sequence (no mid-flight retargeting)
- No recovery if email bounces — still waits for Week 2 follow-up
- Can't pause/restart — elapsed time is the only signal
- MailerLite integrates loosely (cron pushes emails, not MailerLite automations)

**Dev cost:** Small (S)

---

### Option B: Score-Threshold-Based Tier Progression
**Description:** When leadScore changes tier (COLD→WARM, WARM→HOT), immediately move organizer to a new MailerLite group/sequence. Each tier has its own 4-email sequence. Cron adds organizer to appropriate MailerLite group on tier change.

Tier mapping:
- COLD → MailerLite group "Cold Outreach", sequence: generic discovery (4 emails)
- WARM → MailerLite group "Warm Outreach", sequence: credibility + feature pitch (4 emails)
- HOT → MailerLite group "Hot Outreach", sequence: VIP treatment + personalization (4 emails)

**Pros:**
- Automatically retargets as leads improve (score WARM → sends better sequence)
- Sequences are professional MailerLite automations (higher deliverability)
- Can A/B test sequences per tier (MailerLite native)
- Clear tier intent — HOT gets VIP treatment automatically
- MailerLite triggers do the scheduling (no cron complexity)

**Cons:**
- If organizer oscillates between COLD/WARM (score fluctuation), may receive multiple sequence starts (confusing)
- Moving between groups mid-sequence breaks continuity (starts new sequence from step 1)
- Requires manual MailerLite group/sequence setup per tier (not code-driven)
- If leadScore changes in Week 4 of Cold sequence, organizer jumps to Warm sequence (incomplete Cold sequence)
- Can't handle "already contacted, now rescored" scenario (duplication risk)

**Dev cost:** Medium (M)

---

### Option C: Event-Based Comprehensive Triggers
**Description:** Emit specific events for each outreach milestone. MailerLite automation rules listen for events and advance sequences:
- `outreach.initiated` (organizer enters outreach pool) → add to "Outreach Active" group
- `organizer.claimed_listing` (organizer signs up and lists item) → remove from Cold/Warm, add to "Engaged" group, send onboarding sequence
- `organizer.email_bounced` (Workspace SMTP bounce) → add to "Undeliverable" group, pause sequences
- `lead_score.escalated` (COLD→WARM, WARM→HOT) → move to new tier group + continue from Step 2 of new sequence (not restarting)
- `outreach.completed` (8 weeks elapsed, no response) → mark as "No Response" group, stop sending

**Pros:**
- Granular control — each event triggers appropriate action
- Handles edge cases (bounces, oscillations, sign-ups, score changes)
- MailerLite automations are purpose-built (high deliverability, audit trail)
- Respects organizer actions (signing up → move to engaged track)
- Can track multiple campaigns per organizer (not siloed by first tier)

**Cons:**
- Complex event infrastructure (event bus, MailerLite API webhooks, state management)
- Requires multiple automations in MailerLite (one per event type — 5+ rules)
- Event ordering risk (if email bounces AND score escalates, which takes precedence?)
- Harder to debug (distributed state across cron + MailerLite + events)
- High maintenance burden (each rule must be manually configured + tested)

**Dev cost:** Extra-Large (XL)

---

**Recommendation:** **Option B — Score-Threshold-Based Tier Progression**

Option A (time-based) is too rigid for dynamic lead scoring; Option C (event-based) is over-engineered for current needs. Option B strikes the right balance: as leadScore improves, organizers automatically move to better-crafted sequences that reflect their status. Set up 3 MailerLite sequences (Cold, Warm, Hot) with 4 emails each. Cron's only job: on every leadScore recalculation, check tier change and move organizer to new group if score crosses threshold. MailerLite handles scheduling and sends.

**MailerLite Group/Segment Architecture:**

| Group Name | Membership | Sequence | Duration | Entry Trigger |
|------------|-----------|----------|----------|---------------|
| **Cold Outreach** | COLD tier (0–39 pts) | 4-email generic discovery | 8 weeks | leadScore < 40 |
| **Warm Outreach** | WARM tier (40–54 pts) | 4-email credibility pitch | 8 weeks | leadScore 40–54 |
| **Hot Outreach** | HOT tier (55–100 pts) | 4-email VIP + personalization | 8 weeks | leadScore ≥ 55 |
| **Engaged** | Has signed up | Onboarding + feature education | 4 weeks | organizer.signedUp event |
| **Bounced** | Email undeliverable | Suppress (no sends) | — | SMTP 550/551 or bounce recorded |
| **No Response** | 8 weeks, no reply | Suppress + archive | — | outreach.completed without engagement |

- Use **groups** for tier-based sequences (easier to manage, MailerLite native)
- Use **segments** for advanced filtering if needed later (e.g., "Warm + has website but no phone" → custom sequence)
- Automation rules in MailerLite: move between groups on API trigger from cron

**Feasibility:** BUILD NOW (groups + sequences in MailerLite) + Dev wires (M cost)

**Next step:** MailerLite setup (create 3 sequences + 5 groups, set auto-advance rules). Dev integrates `outreachEmailsCron.ts` to emit group-move API calls to MailerLite when leadScore tier changes.

---

## Architect Handoff

**Recommended throughput solution:** **Option B (Parallel Matrix Batches)**
- Split 301 metros into 6 GitHub Actions matrix shards
- Each shard runs 50–51 metros in <10 minutes
- 60-minute timeout per job accommodates all shards
- Rate-limiter coordination: 5-second stagger between shards

**Recommended source tracking:** **Option C (Hybrid: Forward-Fix + High-Confidence Backfill)**
- **Immediate (Week 1):** All scrapers populate `directoryMostRecentSource` and `sourcesJson` going forward
- **Phase 2 (Week 2–3):** Backfill high-confidence records (ESN orgs + 3+ corroboration sources)
- **Result:** Forward data 100% accurate; 30–40% of existing records mapped; remaining 60% marked as NULL (not inferred)

**Recommended lead score fix:** **Option C (Use State Licensing) + Option B (ESO Membership as Phase 2)**
- **Immediate:** Wire Indiana licensing scraper output to `isStateLicensed` field; 200–500 orgs reach HOT tier
- **Phase 2 (June):** Add ESN membership + sale count signals (Option B) to surface ~20% more HOT leads
- **Do NOT:** Recalibrate threshold (Option A) — preserves HOT credibility

**Recommended email discovery architecture:** **Option B (Enrichment Pipeline Step)**
- Integrate `emailDiscoveryService.ts` into `enrichment.ts` as async post-corroboration stage
- Trigger: corroborationScore >0.7 AND no contactEmail
- Success rate: 40–55%; covers ~2,500–3,000 orgs organically
- Strip Hunter.io/Clearbit/Apollo from spec immediately

**Recommended MailerLite trigger logic:** **Option B (Score-Threshold-Based Tier Progression)**
- 3 MailerLite groups (Cold, Warm, Hot) with 4-email sequences each
- Cron moves organizers between groups when leadScore tier changes
- MailerLite automations handle scheduling and sends
- Additional groups: Engaged (post-signup), Bounced (suppress), No Response (archive)

---

## Deliverables Needed from Architect

### (a) Technical Spec for Parallel Matrix Strategy
- Metro shard boundaries (6 shards, ~50 metros each)
- Rate-limiter coordination logic (5-second stagger, backoff exponentials)
- GitHub Actions matrix YAML structure
- Monitoring/alerting for job failures per shard

### (b) Source Tracking Backfill Architecture
- High-confidence pattern library (ESN membership, 3+ sources, corroboration >0.8)
- Backfill query/batch logic (cursor-paginated, 200-record batches)
- sourcesJson schema (source type + confidence + timestamp)
- Admin dashboard display logic (show confidence, handle NULL)

### (c) HOT Score Recalibration + Licensing Integration
- `isStateLicensed` field wiring from Indiana scraper (and template for future states)
- Revised scoring weights (if Option B ESN signals added)
- Backfill job for Indiana-licensed orgs (mark isStateLicensed=true for matched records)
- Projection: how many HOT orgs per state (18-state batch end state)

### (d) emailDiscoveryService.ts Architecture
- Playwright stealth browser init (anti-bot config)
- Contact page strategy (URLs to crawl: /contact, /about, /team, /staff)
- Email pattern permutation ordered list (estate sale organizer bias)
- SMTP RCPT-TO verification flow (DNS MX → MAIL FROM → RCPT TO, no DATA)
- Async integration into enrichment.ts (trigger conditions, error handling)

### (e) MailerLite Group/Segment Architecture
- 3 tier sequences with 4 emails each (Cold/Warm/Hot templates)
- Automation rules: move between groups on API trigger
- Additional groups: Engaged, Bounced, No Response (with suspend/suppress logic)
- API integration spec: cron → MailerLite group move endpoint

---

## Constraint

**No new paid services.** All solutions operate within:
- GitHub Actions free tier (5 concurrent jobs, standard Ubuntu runner)
- HERE 250K free calls/month (well under capacity at 6,923/month)
- Foursquare Sandbox plan 9,450 free calls remaining (safe until July 2026)
- Railway included compute (cron scheduling not needed; GitHub Actions sufficient)
- MailerLite free tier supports up to 10,000 subscribers (7,897 within limit)

---

**Status:** Ready for Architect Review  
**Timeline:** Matrix (2 weeks) → Source tracking (3 weeks) → Licensing (2 weeks) → Email discovery (4 weeks) → MailerLite (2 weeks)  
**Sequencing:** Parallel — Arc starts Matrix spec while Dev completes source tracking forward-fix. No critical path dependencies until email discovery (needs enrichment.ts stable).

