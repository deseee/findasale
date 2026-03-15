# Connector Matrix – FindA.Sale Phase 3+4

**Generated:** 2026-03-15 (Session 172)
**Audience:** Agent Task Queue (Infrastructure, P2), MCP routing decisions, feature acceleration planning

---

## Overview

This document maps **active MCP connectors** against **Phase 3+4 roadmap features** to identify:
1. Which connectors accelerate which features
2. Features that would benefit from new connectors (gaps)
3. Quick wins agents can execute TODAY with existing connectors

---

## Active MCP Connectors (This Session)

| MCP | Capabilities | Active Features |
|-----|--------------|-----------------|
| **GitHub** `mcp__github__*` | File push (≤3 files, ≤25k tokens), PR management, code search, issue tracking | Core CI/CD for all code changes |
| **Vercel** `mcp__27b581af__*` | Deployments, build logs, runtime logs, project management, toolbar threads (feedback UI) | Frontend deployment automation, real-user feedback collection |
| **MailerLite** `mcp__30595190__*` | Subscriber management, automations, campaigns, segments, forms, webhooks, email builder | Email campaigns, subscriber segmentation, transactional triggers |
| **Claude in Chrome** `mcp__Claude_in_Chrome__*` | Browser automation, screenshots, form filling, page reading, navigation | Testing, UI validation, cross-browser checks, external service interaction |
| **Cowork** `mcp__cowork__*` | File access, directory requests, file presentation, scheduled tasks | File management, automation scheduling |
| **Scheduled Tasks** `mcp__scheduled-tasks__*` | Cron/one-time scheduling, task creation/update, automation triggers | Background job management, recurring automations |
| **MCP Registry** `mcp__mcp-registry__*` | Search new connectors by keyword | Discovery of new integrations |

---

## Connector → Roadmap Feature Matrix

### Table 1: Which Connectors Accelerate Which Features?

| Feature | # | Phase | MCP Accelerated? | Connector(s) | How |
|---------|---|-------|------------------|--------------|-----|
| Neighborhood Heatmap | 28 | 3 | **Partial** | Scheduled Tasks | Pre-compute density grid tiles every 6h via cron job (see Design Decisions) |
| Seller Performance Dashboard + Price Intelligence | 6 | 3 | **Partial** | GitHub (data pipeline CI/CD) | Deploy analytics backend changes; track data quality in PRs |
| Organizer Brand Kit | 31 | 3 | **No** | — | Schema shipped with #27; UI is frontend-only work |
| Shopper Wishlist Alerts + Smart Follow | 32 | 3–4 | **Yes** | MailerLite | Segment creation (wishlist category/tag/organizer prefs), automated alert campaigns, email templates |
| Digital Receipt + Returns | 62 | 4 | **Yes** | MailerLite | Transactional email receipt delivery (new trigger + template) |
| Dark Mode + Accessibility-First | 63 | 4 | **No** | — | Pure frontend CSS + component work; no external service needed |
| Organizer Mode Tiers (Simple/Pro/Enterprise) | 65 | 4 | **No** | — | Feature-flag logic is backend + frontend; billing integration would use Stripe MCP (not active) |
| Open Data Export | 66 | 4 | **Partial** | GitHub, Cowork | Track export job status in PRs, schedule background export jobs via Scheduled Tasks |
| Command Center Dashboard | 68 | 4 | **No** | — | Multi-sale metrics UI; could leverage Vercel logs for performance insights (optional) |
| Local-First Offline Mode | 69 | 4 | **No** | — | Service worker + IndexedDB is pure frontend; no service dependency |
| Live Sale Feed | 70 | 4 | **Partial** | Vercel (runtime logs) | Monitor WebSocket health + activity throughput via runtime logs |
| Organizer Reputation Score | 71 | 4 | **Partial** | Scheduled Tasks | Nightly reputation recalculation cron job; GitHub for CI/CD of scoring logic |

---

### Table 2: Phase 3+4 Features with MCP Acceleration Status

| Feature | # | MCP Accelerated? | Connector(s) | Priority | Implementation Notes |
|---------|---|-----------------|--------------|----------|----------------------|
| Seller Performance Dashboard | 6 | **Partial** | GitHub | P1 | Analytics backend (CRUD, aggregations) ships via GitHub; Stripe MCP would unlock real payment data; currently using simulated analytics |
| Neighborhood Heatmap | 28 | **Partial** | Scheduled Tasks | P1 | 6h grid pre-compute via cron (see roadmap Design Decisions); no external API needed once sale data is local |
| Organizer Brand Kit | 31 | **No** | — | P2 | Schema done (S166 migration); UI is pure React/Tailwind — no connector benefit |
| Shopper Wishlist Alerts | 32 | **Yes** | MailerLite | P1 | Segment builder → alert emails on new items. High-value retention feature. Ready to build. |
| Digital Receipt + Returns | 62 | **Yes** | MailerLite | P2 | Transactional email (similar to Weekly Digest #36). New email template + trigger. MailerLite webhook on purchase event. |
| Dark Mode | 63 | **No** | — | P2 | Pure frontend; optional Vercel performance monitoring for Lighthouse score tracking |
| Organizer Mode Tiers | 65 | **No** | — | P1 | Backend feature flags + billing gates. Stripe MCP would enable subscription management (not active). |
| Open Data Export | 66 | **Partial** | Scheduled Tasks, GitHub | P2 | Background job (ZIP generation) scheduled via cron; GitHub tracks deploy status |
| Command Center | 68 | **Partial** | Vercel | P1 | Multi-sale dashboard. Vercel logs show performance + errors per sale ID. Dashboard is frontend-only. |
| Offline Mode | 69 | **No** | — | P2 | Service worker + IndexedDB; zero server dependency; pure frontend stack |
| Live Sale Feed | 70 | **Partial** | Vercel | P1 | Real-time WebSocket feed. Vercel runtime logs track activity + latency. No additional connector needed. |
| Organizer Reputation Score | 71 | **Partial** | Scheduled Tasks, GitHub | P1 | Nightly recalc cron job; scoring logic CI/CD via GitHub; no external service |

---

## Connector Gaps: Missing Integrations for Phase 3+4

| Feature | # | Benefit | Candidate Connector | Why It Helps | Build Cost | Urgency |
|---------|---|---------|---------------------|--------------|------------|---------|
| Seller Performance Dashboard | 6 | Real payment analytics | **Stripe MCP** | Replace simulated analytics with actual transaction data (revenue, fees, customer LTV). Enable seller benchmarks. | 0.5 sprint (already have Stripe account) | **HIGH** — competitive feature; EstateFlow has this |
| Organizer Mode Tiers | 65 | Subscription billing | **Stripe MCP** | Manage tier subscriptions, billing cycles, feature gating integration. Currently plan is backend-only. | 1 sprint | MEDIUM — enable after core features stabilize |
| Open Data Export | 66 | S3 storage for ZIPs | **AWS S3 MCP** (if available) | Store export ZIPs, generate pre-signed URLs, cleanup old exports. Currently using local file system (Railway limitation). | 0.5 sprint | LOW — works without cloud storage; nice-to-have |
| Organizer Reputation Score | 71 | Reputation data monitoring | **Analytics service MCP** (Sentry/PostHog) | Track scoring inputs (photo quality, response time, dispute rate). Monitor reputation health across organizer base. | 0.5 sprint | MEDIUM — add after scoring logic ships |
| Live Sale Feed | 70 | Real-time activity analytics | **PostHog / Segment MCP** | Track feed engagement, dwell time, click rates. A/B test feed format and item ranking. | 0.5 sprint | LOW — analytics layer on top of feature |
| Shopper Wishlist Alerts | 32 | Ad-hoc SMS fallback | **Twilio MCP** | SMS alerts for high-intent shoppers (+ email). Useful for shoppers with notification fatigue. Phase 2 enhancement. | 0.5 sprint | LOW — email-first is sufficient for MVP |
| Organizer Brand Kit | 31 | Asset hosting + CDN | **Cloudinary MCP** (already have Cloudinary; check if MCP available) | Host brand assets (logo, colors, templates) with auto-resizing. Currently assets are app-hosted. | Trivial if MCP exists | LOW |

---

## Quick Wins: 3 Actionable Tasks for TODAY

All feasible with existing connectors. Estimated effort: 0.25–0.5 sprint each.

### Win 1: Launch Shopper Wishlist Alerts MVP with MailerLite

**Feature:** #32 Shopper Wishlist Alerts + Smart Follow (Phase 3)

**What:** Shoppers set category/tag/organizer prefs → weekly email when new items post.

**Why NOW:** MailerLite MCP is active (verified in session). #32 is P1 in roadmap. High retention ROI. Feeds into Collector Passport (#45) later.

**Execution Steps:**
1. **Backend:** Add `wishlistPreferences` table → CRUD endpoints (`POST /api/shoppers/wishlist-prefs`, `GET /api/shoppers/wishlist-prefs`, `DELETE /api/shoppers/wishlist-prefs/:id`). Prefs: `{ shopperId, categoryIds[], tagSlugs[], organizerIds[], frequency: weekly|daily|never }`.
2. **MailerLite:** Create new segment "Wishlist Followers" (auto-populated via webhook on pref save). Set up automation: when item posts matching pref criteria → trigger email from template "New Match for Your Wishlist."
3. **Frontend:** Add wishlist UI to shopper profile settings — checkboxes for categories/tags + organizer picker, frequency toggle.
4. **Webhook:** Wire `POST /api/items` to check if new item matches any active wishlist pref → MailerLite segment trigger.

**Dispatcher:** findasale-dev (full feature — 3–5 files)

**MCP Usage:** MailerLite segment builder + email template creation (manual in dashboard, or via MCP `create_segment` + `create_automation`).

**Timeline:** 1 sprint

---

### Win 2: Nightly Organizer Reputation Score Recalc via Scheduled Task

**Feature:** #71 Organizer Reputation Score (Phase 4, P1)

**What:** Compute 1–5 star reputation from response time, sale frequency, photo quality, shopper ratings, dispute rate. Display on profile + every listing.

**Why NOW:** Reputation is **trust infrastructure** before national scale. Scheduled Tasks MCP is active. No external service needed.

**Execution Steps:**
1. **Schema:** Add `reputation` table → `{ organizerId, score: float 1–5, photoQuality: float, responseTime: float, saleFrequency: float, ratingAverage: float, disputeRate: float, updatedAt }`. Indexes on `organizerId` + `updatedAt`.
2. **Scoring Logic:** TypeScript function in `packages/backend/src/services/reputationService.ts` that:
   - Pulls last 10 sales for each organizer (saleFrequency).
   - Scans items in those sales → AI score photo quality (use existing vision pipeline from #27 Condition Grading).
   - Avg response time from support tickets / reservation updates.
   - Avg shopper rating from reviews (add 5-star review field to Sale if not exists).
   - Dispute count ÷ sale count.
   - Blend scores: `(photoQuality × 0.25) + (responseTime × 0.25) + (saleFrequency × 0.15) + (ratingAverage × 0.20) + ((1 - disputeRate) × 0.15)`.
3. **Cron Job:** Schedule `packages/backend/src/jobs/reputationRecalcJob.ts` to run nightly at 2 AM (low-traffic window). Iterates all organizers, updates reputation table, logs errors.
4. **Frontend:** Display "⭐ 4.6 / 5 Reputation" on organizer profile + item listings. Badge for "New Organizer" (< 3 sales or < 2 weeks).
5. **Scheduled Task:** Create via MCP: `create_scheduled_task({ taskId: "nightly-reputation-recalc", cronExpression: "0 2 * * *", prompt: "Run reputation recalc job" })`.

**Dispatcher:** findasale-dev (backend) + findasale-qa (testing). Scheduled Tasks setup in main session.

**MCP Usage:** Scheduled Tasks cron trigger + backend deploy via GitHub.

**Timeline:** 1 sprint

---

### Win 3: Heatmap Pre-Compute Grid Tiles via Scheduled Task

**Feature:** #28 Neighborhood Heatmap (Phase 3, P1)

**What:** Sale density overlay on map — color-coded zones (red = 5+ active sales, yellow = 2–4, green = 1). Shoppers see hotspots to plan routes.

**Why NOW:** Heatmap is next on main queue after batch ops. Design locked (roadmap). Grid pre-compute is perfect for scheduled task (no real-time sync needed — 6h refresh is fine).

**Execution Steps:**
1. **Schema:** Add `heatmapTile` table → `{ tileId: geohash(precision=5), lat, lng, activeSaleCount, lastUpdatedAt, expiresAt: now+7days }`. Pre-compute grid (1–3 mile tiles covering service area).
2. **Heatmap Compute Job:** `packages/backend/src/jobs/heatmapComputeJob.ts` that:
   - Queries PUBLISHED sales within 7-day window.
   - Groups by geohash tile.
   - Counts active sales per tile, assigns color (red/yellow/green).
   - Upserts `heatmapTile` table.
   - Logs tile count, errors.
3. **Heatmap API:** New endpoint `GET /api/heatmap/tiles?zoom=12&bounds={minLat,maxLat,minLng,maxLng}` returns tiles matching viewport. Frontend caches 1 hour.
4. **Frontend:** Leaflet map layer (already exists from session 114 OSRM work). Add overlay: `L.rectangle()` for each tile, color-coded. Mouseover shows "5 estate sales in this area."
5. **Scheduled Task:** Nightly at 1 AM: `create_scheduled_task({ taskId: "heatmap-compute", cronExpression: "0 1 * * *", prompt: "Run heatmap tile compute" })`.
6. **Cleanup:** Cron also deletes tiles where `expiresAt < now` (7-day rolling window, roadmap spec).

**Dispatcher:** findasale-dev (backend) + findasale-ux (frontend Leaflet layer). Scheduled Tasks in main.

**MCP Usage:** Scheduled Tasks + GitHub CI/CD for job code.

**Timeline:** 0.5 sprint (backend) + 0.25 sprint (frontend) = 0.75 sprint

---

## Summary

### Key Findings

1. **MailerLite is the most impactful active connector:** Powers 3 Phase 3+4 features (Wishlist Alerts, Digital Receipt, Weekly Digest). Should be prioritized for feature work.

2. **Scheduled Tasks MCP unlocks async features:** Heatmap pre-compute, Reputation recalc, Data export jobs all benefit from nightly crons. Low complexity, high ROI.

3. **Stripe MCP is the #1 gap:** Blocks realistic implementation of #6 Seller Performance Dashboard (needs real payment data, not simulated) and #65 Organizer Mode Tiers (needs subscription billing). High strategic value — recommend adding this session if possible.

4. **Vercel logs are underutilized:** Existing MCP can monitor runtime health for WebSocket-heavy features (#70 Live Sale Feed) and real-time performance. No additional connector needed, just smarter logging queries.

5. **Most Phase 4 features are frontend-dominant:** #63 Dark Mode, #69 Offline Mode, #68 Command Center are pure React/Tailwind. No connector acceleration possible. Ship via normal dev cycle.

### Roadmap Implications

- **Immediate (Next 2 weeks):** Dispatch Win 1 (Wishlist Alerts) to findasale-dev. High ROI, MailerLite ready.
- **Concurrent:** Start Win 2 (Reputation Score) design; Win 3 (Heatmap) is blocking #28 (currently P4 on queue).
- **Strategic:** Evaluate Stripe MCP addition for #6 Seller Performance Dashboard. Competitive pressure (EstateFlow has this). Defer without it.

---

## Appendix: MCP Registry Candidates for Future Consideration

| Connector | Use Case | Phase | Confidence |
|-----------|----------|-------|------------|
| **Stripe** | Payment data, subscriptions, billing | Phase 3–4 | **CRITICAL** — blocking #6, #65 |
| **Sentry** | Error tracking, performance monitoring | Infra | HIGH — post-beta observability |
| **PostHog / Segment** | User analytics, feature tracking | Phase 4–5 | MEDIUM — optional analytics layer |
| **Twilio** | SMS alerts, phone notifications | Phase 4 | MEDIUM — enhances #32 Wishlist, #70 Live Feed |
| **AWS S3** | Cloud storage for exports | Phase 4 | MEDIUM — improves #66 Open Data Export |
| **Cloudinary** | Image/asset hosting | Infra | LOW — already using Cloudinary; check if MCP available |
| **PostgreSQL** | Direct DB queries (advanced) | Infra | LOW — not recommended; use backend API instead |

---

**Last Updated:** 2026-03-15 (Session 172)
**Next Review:** After Win 1 (Wishlist Alerts) ships — assess MailerLite scalability + identify next batch.
