# ROADMAP – FindA.Sale Development Workflow

**Last Updated:** 2026-03-04 (post-session-37 audit)
**Status:** Production-ready MVP with push notifications, creator dashboard, and auction UI live. Phases 9, 11, and 12 (partial) completed.
**Approach:** Phases grouped by technical dependencies, parallelizability, and shipping readiness. Not strict milestones — Patrick uses this for PM communication; this structure optimizes for coding velocity.

---

## Overview

This roadmap maps feature gaps and growth opportunities with phases organized for developer workflow:
1. **Quick wins & debt resolution** – unblock testing, build momentum
2. **Creator & discovery platform** – foundational growth lever
3. **Offline & event integration** – discrete feature sets with clear scope
4. **Real-time & complex systems** – major infrastructure investments (auctions, notifications)
5. **Growth mechanics & experimentation** – lower ROI, test with real users first

---

## Infrastructure & Dev Tools (Parallel to Feature Phases)

These are **developer experience, testing, and operational items** that should be integrated throughout development. Not blocking any phase, but essential for local dev, beta prep, and database seeding.

### ngrok for Local Development
- **Purpose:** Expose local development server to internet for testing webhooks (Stripe, Twilio, etc.) and mobile PWA testing
- **Setup:** Install ngrok, create tunnel to `localhost:3000` (frontend) and `localhost:5000` (backend)
- **Use cases:**
  - Test Stripe Connect redirects from mobile
  - Test SMS/email delivery without deploying to staging
  - Share dev environment with teammates for pair programming
- **Status:** Not yet documented; add to `DEVELOPMENT.md`
- **Effort:** 1 hour (documentation + setup guide)

### OAuth Social Login (Google, GitHub, etc.)
- **Priority:** P2 (nice-to-have for beta, not critical for MVP)
- **Scope:** Add OAuth2 login via Google (primary), optionally GitHub for developers
- **Backend:** Extend `authController.ts` with OAuth endpoints; integrate with Passport.js or similar
- **Database:** Add `OAuthProvider` + `oauthId` fields to User model
- **Frontend:** Add "Sign in with Google" button to login page
- **Benefits:** Reduces password reset burden; better UX
- **Status:** Deferred; add to Phase 16 (Post-MVP Polish)
- **Effort:** 2–3 sprints (includes Google API setup, database migration, frontend integration, E2E testing)

### Prisma Studio (Local Database Browser)
- **Purpose:** Visual database editor for local development (view/edit/insert records without SQL)
- **Setup:** `npx prisma studio` command (already in package.json)
- **Use cases:**
  - Inspect data without writing SQL queries
  - Manually create test users, sales, items during development
  - Debug schema relationships
- **Status:** Already available; needs documentation in `DEVELOPMENT.md`
- **Effort:** 30 minutes (add to dev setup guide)

### ~~Test Data Seeding Script~~ ✅ Complete (verified 2026-03-02)
- **Location:** `packages/database/prisma/seed.ts`
- **Run command:** `docker exec findasale-backend-1 sh -c "cd /app && npx tsx packages/database/prisma/seed.ts"`
- **Data:** 100 users, 10 organizers, 25 sales, 300 items, 50 purchases, 60 subscribers + badges, referrals, line entries, affiliate links
- **Note:** Seed does NOT run automatically on `docker compose up` — run manually when needed
- See `claude_docs/SEED_SUMMARY.md` for full details

### GitHub MCP Connector
- **Purpose:** Let Claude read diffs, PR history, commit logs, and open issues directly — without switching to a browser or needing Patrick to copy/paste context
- **Use cases:**
  - Review what changed between sessions without a git log paste
  - Reference open issues during feature planning
  - Check CI/CD status before deploy
  - Link commits to STATE.md updates automatically
- **Install:** Settings → Connectors → search "GitHub" → Connect
- **Status:** ✅ Connected and active (verified session 18+). Claude uses `mcp__github__push_files` for all GitHub pushes.
- **Effort:** Already done.

### GitHub ↔ Local Drift Audit (Recurring Dev Tool)
- **Problem:** Several components have been rewritten locally but the old version was never pushed to GitHub. When Vercel builds from GitHub, it hits stale TypeScript errors that don't exist locally (e.g. `InstallPrompt.tsx` called `prompt()` twice; `SaleMapInner.tsx` had `sales` as a required required prop). These are invisible during local dev.
- **Root cause:** Session-context exhaustion causes pushes to be skipped or forgotten. The VM file system resets between sessions, so local changes that weren't pushed are permanently lost — only GitHub is the source of truth.
- **Mitigation (session discipline):** At session wrap, Claude must compare the list of locally-modified files against what was pushed that session. Any file touched but not pushed must be flagged in the next-session-prompt.md handoff.
- **Mitigation (tooling):** At session start, run a quick spot-check: read the GitHub version of any recently-modified component and diff the interface/prop names against the local version before assuming they match.
- **Files known to have drifted (now fixed):** `InstallPrompt.tsx` (2026-03-04), `SaleMapInner.tsx` (2026-03-04). Check `SaleCard.tsx`, `CheckoutModal.tsx`, `Layout.tsx` in next audit — these were also rewritten in Phase 5/6 sprints.
- **Effort:** 15–30 min per audit pass; add as a step to the findasale-deploy checklist

### Route Planning & Optimized Shopper Paths
- **Note:** Route planning is **part of Phase 14 (Growth Mechanics)**
- **Details:** Weekend cluster view + route optimizer for shoppers planning multi-sale routes
- **Map libraries:** Consider Mapbox GL JS (better routing) or OSRM (open-source, self-hosted)
- **Effort:** Included in Phase 14 (1–2 sprints for route planner + weekend cluster)

---

## Current Feature Inventory

### ✅ Completed (Production, verified 2026-03-04)
- JWT auth with role-based access (USER, ORGANIZER, ADMIN)
- Sale creation, geocoding, Leaflet/OSM maps
- Organizer profiles (public + private settings) with badges
- Photo upload (Cloudinary), bulk CSV import
- Stripe Connect Express onboarding, 5%/7% platform fees
- Email digest (Resend) — wired and E2E tested
- PWA hardening, accessibility (aria-labels, skip-to-content, toasts, SR announcements)
- Search + date filters on homepage
- Contact form, FAQ, password reset, referral code
- **Creator dashboard (/creator/dashboard)** — fully implemented: referral link card, stats row, affiliate link generator/table, sales picker, how-it-works panel (Phase 9, verified 2026-03-04)
- **Affiliate conversion tracking** — click → sessionStorage → checkout attribution → Stripe webhook increments conversions (Phase 9, verified 2026-03-04)
- Item categories + condition tagging with filters
- Zip-level landing pages with email reminders (hourly job)
- **PWA push notifications** — VAPID, PushSubscription DB, service worker, auto-subscribe on login, push sent alongside email reminders (Phase 11, verified 2026-03-04)
- **Auction UI + cron** — AuctionCountdown, BidModal, auctionJob.ts cron scheduled (Phase 12 partial, verified 2026-03-04)
- All C1-C7, H1-H11, and M-series audit findings resolved

### ⏸️ Deferred (Scoped, Not Shipped)
- **Virtual line / QR code** – scaffolded + E2E tested (Phase 10); ready to activate when organizer needs it
- **Auction live bidding** – Socket.io real-time bidding deferred; polling used for MVP (decision: session 36). Organizer auction toggle + Stripe 7% webhook for auction wins still needed.
- **Multi-metro** – currently Grand Rapids only
- **Real-user beta** – onboarding flow not defined (next logical step post-Phase 12)
- **SMS line updates** – Twilio configured, untested E2E

---

## Competitive Feature Parity (Quick Reference)

| Gap | Priority | Status | Phase |
|-----|----------|--------|-------|
| Schema.org event markup | P1 | ✅ Done (session 33) | — |
| Email digest E2E test | P0 | ✅ Done | — |
| SMS notifications | P1 | Configured, untested E2E | **Phase 8** |
| Creator dashboard population | P1 | ✅ Done (Phase 9, verified 2026-03-04) | — |
| Affiliate conversion tracking | P1 | ✅ Done (Phase 9, verified 2026-03-04) | — |
| PWA push notifications | P1 | ✅ Done (Phase 11, verified 2026-03-04) | — |
| Item category filters | P1 | ✅ Done (Phase 7) | — |
| Organizer trust badges | P2 | ✅ Done (Phase 7) | — |
| QR sign generator | P1 | ✅ Done (Phase 10) | — |
| Auctions / timed lots | P1 | Partial — UI done, organizer toggle + Stripe 7% webhook pending | Phase 12 |
| Calendar integration | P3 | ✅ Done (Phase 10) | — |
| Virtual line / QR check-in | P1 (deferred) | Scaffolded + E2E tested (Phase 10) | — |

---

## Old Feature Parity Analysis (archive reference)

### A. Search & Discovery (estatesales.net, Yelp, Google Maps)

| Feature | Current | Competitor | Gap | Priority |
|---------|---------|------------|-----|----------|
| Searchable map | ✅ Yes | ✓ All | None | — |
| Keyword search | ✅ Yes (homepage) | ✓ All | None | — |
| Date filters | ✅ Yes (homepage) | ✓ All | None | — |
| **Schema.org event markup** | ✅ Done | ✓ High-value | Closed | — |
| City/neighborhood landing pages | ⚠️ Partial (/city/[city]) | ✓ All | Not optimized for local SEO | **P1** |
| **Reviews & ratings** | ❌ No | ✓ All (Yelp, Google, 1stdibs) | No social proof | **P2** |
| **Organizer trust badges** | ✅ Done | ✓ All | Closed | — |
| Category/item type filters | ✅ Done | ✓ Mercari, Chairish | Closed | — |

---

### B. Listings & Item Discovery (Mercari, Chairish, 1stdibs, Craigslist)

| Feature | Current | Competitor | Gap | Priority |
|---------|---------|------------|-----|----------|
| Photo galleries | ✅ Yes (Cloudinary) | ✓ All | Competitive | — |
| **Item category tags** | ✅ Done | ✓ All | Closed | — |
| **Item condition tagging** | ✅ Done | ✓ All | Closed | — |
| **Quick-list flow** | ❌ No | ✓ Craigslist, OfferUp | Current flow requires CSV or multi-step | **P2** |
| **Messaging/contact to organizer** | ❌ No | ✓ All | No way for shopper to ask questions | **P2** |
| Follow organizer | ⚠️ Possible (not in UI) | ✓ Mercari, Poshmark, Chairish | No persistent "my organizers" list | **P2** |

---

### C. Auctions & Timed Lots (LiveAuctioneers, HiBid, eBay)

| Feature | Current | Competitor | Gap | Priority |
|---------|---------|------------|-----|----------|
| Timed auction lots | ⚠️ Partial (UI done, payment not wired) | ✓ All | Organizer toggle + Stripe 7% webhook needed | **P1** |
| Live bidding UI | ✅ BidModal built (polling) | ✓ All | Socket.io deferred; polling used for MVP | **P2 (deferred)** |
| **Optional "Auction" toggle per item** | ❌ No | ✓ All | Can't flag high-value items for auction | **P1** |
| Reservation/hold workflow | ⚠️ Partial (Stripe reservations exist) | ✓ All | Not exposed in UI | **P2** |

**Status:** Auction UI live (Phase 12 partial). Organizer toggle + Stripe 7% webhook still needed to unlock revenue. Socket.io deferred — polling used for MVP.

---

### D. Event & Community Features (Nextdoor, Eventbrite, Meetup)

| Feature | Current | Competitor | Gap | Priority |
|---------|---------|------------|-----|----------|
| Nextdoor share button | ✅ Yes | ✓ Nextdoor-native | Competitive | — |
| Email reminders | ✅ Yes (verified) | ✓ All | Closed | — |
| **Calendar integration** (Google/Apple) | ✅ Done (Phase 10) | ✓ Eventbrite, Meetup | Closed | — |
| **Neighborhood/hood landing pages** | ⚠️ Partial (/city/[city]) | ✓ Nextdoor, Craigslist | Not hyperlocal (zip-level) | **P2** |
| **RSVP/watch workflow** | ✅ Email + Push + iCal done | ✓ Eventbrite, Meetup | SMS reminder E2E untested; no in-app notification center | **P2** |

---

### E. Creator & Social Features (TikTok, Instagram, YouTube, Poshmark)

| Feature | Current | Competitor | Gap | Priority |
|---------|---------|------------|-----|----------|
| Creator dashboard | ✅ Done (Phase 9) | ✓ All | Stats, referral link, affiliate table fully implemented | — |
| **Short-form content hooks** | ❌ No | ✓ All | No way for creators to link to "best finds" | **P2** |
| **Affiliate-style referral links** | ✅ Done (Phase 9) | ✓ All | Affiliate links with UTM tracking + conversion tracking via Stripe webhook | — |
| **Creator early-access previews** | ❌ No | ✓ Poshmark Closet Ambassador, TikTok | No pre-launch access for influencers | **P3** |
| **Creator revenue sharing** | ❌ No | ✓ Shopify affiliates, Poshmark, TikTok | No payout for successful referrals | **P3** |

---

### F. Payments & Logistics (Stripe, Shopify, Square)

| Feature | Current | Competitor | Gap | Priority |
|---------|---------|------------|-----|----------|
| Stripe Connect Express | ✅ Yes | ✓ All | Competitive | — |
| Reservation/hold system | ⚠️ Exists (Stripe) | ✓ All | Not exposed; no shopper hold UI | **P2** |
| **Instant payouts** | ❌ No | ✓ Square, Stripe On-Demand Payouts | Organizers wait for settlement | **P3** |
| **Shipping option** | ❌ No | ✓ Mercari, Poshmark, 1stdibs | No way to enable organizer shipping | **P3** |
| **Multi-currency support** | ❌ No | ✓ Shopify, Stripe | USD only | **P4** |

---

### G. Marketing & Offline Conversion (Yard signs, QR codes, print media)

| Feature | Current | Competitor | Gap | Priority |
|---------|---------|------------|-----|----------|
| **Printable QR sign generator** | ✅ Done (Phase 10) | ✓ Food trucks, popup retail, yard sales | Closed | — |
| **QR + UTM analytics** | ✅ Done (Phase 10) | ✓ Scan-to-watch conversion tracking | Closed | — |
| **Printable email template** | ❌ No | ✓ Eventbrite, Facebook Events | Organizers print event details | **P2** |
| Line management / SMS updates | ⏸️ Scaffolded | ✓ Waitlist Me, event apps | Deferred; Twilio configured | **P1 (deferred)** |

---

### H. Gamification & Scarcity (Pokemon GO, Supreme, Sneaker drops)

| Feature | Current | Competitor | Gap | Priority |
|---------|---------|------------|-----|----------|
| **Timed photo drops** | ❌ No | ✓ Supreme, HypeBeast, TikTok | No scarcity mechanic on new listings | **P3** |
| **"Top collector" leaderboard** | ❌ No | ✓ Streetwear communities, eBay PowerSellers | No badges or repeat-buyer recognition | **P3** |
| **Early-access tier** | ❌ No | ✓ Sneaker raffles, Supreme drops | No VIP preview for top shoppers | **P3** |
| **Referral bounties / points** | ⚠️ Partial (referral code exists) | ✓ All | No gamified point system | **P3** |
| **Weekend cluster view** | ❌ No | ✓ Yard Sale Treasure Map, Gsalr | No "weekend sales near me" aggregation | **P2** |

---

### I. Growth Hacks & Marketplace Mechanics

| Feature | Current | Competitor | Gap | Priority |
|---------|---------|------------|-----|----------|
| CSV import (organizers) | ✅ Yes | ✓ Craigslist, aggregators | Competitive | — |
| **"Missing listing" UGC bounties** | ❌ No | ✓ OpenStreetMap, hyperlocal mappers | Could crowdsource coverage | **P3** |
| **Organizer verification badges** | ✅ Done | ✓ Airbnb, eBay, Mercari | Closed | — |
| **Email digest to shoppers** | ✅ Done | ✓ All | Closed | — |
| **Weekly curator email** | ❌ No | ✓ Hipcamp, PopUp Republic | Could send curated "top picks" | **P3** |

---

## AI Tagger Model Upgrade Research (2026-03-02)

**Status:** Research complete. Recommendation: upgrade from WD-ViT to RAM++ post-accuracy audit.

### Background

Phase 8.5 deployed an estate sale tagger using `wd-vit-tagger` (an anime/illustration model). That model is operational but the accuracy audit on real estate sale photos is still pending. This research evaluates whether RAM++ is a better foundation.

### RAM++ vs Current WD-ViT Model

| Dimension | WD-ViT (current) | RAM++ (candidate) |
|---|---|---|
| **Training domain** | Anime/illustration | 14M real-world image-text pairs |
| **Tag vocabulary** | ~14K anime tags | 6,400+ semantic tags (furniture, materials, styles, etc.) |
| **Open-set recognition** | ❌ | ✅ (can tag things not in training vocab via LLM descriptions) |
| **Estate sale fit** | Poor (wrong domain) | Excellent |
| **License** | MIT | MIT |
| **ONNX export** | Not documented | Not documented (PyTorch `.pth`) |
| **CPU inference** | ~1-2s | ~1-2s |
| **Install** | pip | pip + git |
| **HuggingFace hosted** | ✅ | ✅ (free tier API available) |
| **Model size** | ~600MB | ~500MB |

### Recommendation

Replace WD-ViT with **RAM++** after the accuracy audit confirms WD-ViT is underperforming on real estate photos (expected). RAM++ was purpose-built for diverse real-world object recognition — furniture, materials, styles, conditions — which is exactly the estate sale vocabulary.

**Secondary model:** Add **CLIP** embeddings per item for semantic similarity search ("find more items like this"). RAM++ handles tagging; CLIP handles discovery. They complement each other cleanly.

### Deployment Path

- **Phase 1 (MVP):** Use Hugging Face Inference API for RAM++ — zero infra, free tier, ~$0.002-0.01/image beyond that
- **Phase 2 (scale):** Self-host RAM++ on a $40/month VPS running a background queue worker
- **Phase 3 (growth):** Add CLIP embeddings column to Item table for semantic search feature

### Integration Plan

1. Accuracy audit WD-ViT on 50+ real estate photos (already planned in TAGGER_ACCURACY.md)
2. If accuracy < 80%, swap `tagger.py` to call RAM++ HuggingFace endpoint (or local model)
3. Update `TAGGER_CATEGORY_MAP` — RAM++ tags map cleanly to existing Item.category values
4. Add `tags: String[]` column to Item (already on Sale) for freeform AI-suggested tags
5. CLIP integration is Phase 3 — wait for real user data to validate demand

### Key Sources
- GitHub: https://github.com/xinyu1205/recognize-anything
- HuggingFace API: https://huggingface.co/xinyu1205/recognize-anything-plus-model
- Live demo: https://huggingface.co/spaces/xinyu1205/recognize-anything
- Paper (CVPR 2024): arXiv 2306.03514

---

## CRITICAL DEBT: AI Image Tagger (Research & Testing Required)

**Status:** ⚠️ Partially Built, Untested, Blocking Organizer Workflow

The AI Image Tagger is a core organizer feature that was started but remains **completely untested**. It automatically recognizes and tags item photos for SEO and searchability. **Must be researched, tested, and hardened before scaling to multi-metro.**

### Current Implementation

**What Exists:**
- `packages/backend/services/image-tagger/app.py` — FastAPI service with Gradio UI
- `tagger.py` — EstateSaleTagger class using wd-vit model + estate sale specific categories
- Docker Compose integration: `image-tagger` service running on port 5000
- Backend integration: `itemController.ts` calls `/api/tag` on photo upload (5s timeout)
- FastAPI endpoints: `/api/tag` (single image), `/api/batch` (bulk processing)
- API key authentication + health check endpoint
- Estate sale category taxonomy: furniture, styles, materials, jewelry, decor, textiles, paintings, sculptures, etc.
- Requirements.txt specifies: torch, torchvision, transformers, fastapi, gradio, pillow, piexif

**What's Missing (Critical Gaps):**
- ❌ **Zero unit tests** — EstateSaleTagger class untested
- ❌ **Zero integration tests** — FastAPI endpoints untested
- ❌ **Zero E2E tests** — Full upload→tag→save flow untested
- ❌ **Performance unknown** — Does inference stay under 5s? GPU/CPU tradeoff?
- ❌ **Model reliability unknown** — Accuracy? False positive rate? Confidence calibration?
- ❌ **Fallback behavior undefined** — What if tagger service crashes? Photo still uploads?
- ❌ **Frontend integration untested** — Do suggested tags appear in organizer UI?
- ❌ **Error handling incomplete** — Service down, OOM, timeout scenarios not documented
- ❌ **No load testing** — How many concurrent requests can it handle?
- ❌ **Cost/resource analysis missing** — GPU requirements? Scaling strategy?

### Success Criteria (Blockers for Beta)
- Unit test coverage ≥ 90% on `tagger.py`
- All integration tests pass
- Inference time < 2s (single) or < 5s (batch)
- Accuracy > 80% on test set of 50 photos
- Service unavailability doesn't break photo upload
- Organizers can see and edit suggested tags

---

## Phase-by-Phase Implementation Plan

### ✅ Phase 9 – Creator Growth Platform (verified 2026-03-04)
**Goal:** Activate micro-creators for viral loop, build creator dashboard

- ✅ /creator/dashboard fully implemented: referral link hero, stats row, affiliate link generator, affiliate links table, sales picker, how-it-works steps
- ✅ Affiliate shortlinks per sale with UTM tracking + click tracking
- ✅ Conversion tracking: click → sessionStorage → checkout → Stripe webhook increments `conversions` on AffiliateLink
- ✅ Creator stats: total referrals, conversions, conversion rate displayed on dashboard
- ✅ DB migration 20260304000001 applied in production Docker

---

### ✅ Phase 11 – PWA Push Notifications (verified 2026-03-04)
**Goal:** Enable re-engagement via browser push on PWA

- ✅ PushSubscription schema + migration (20260304000002 applied)
- ✅ pushController + routes/push.ts: subscribe/unsubscribe (authenticated)
- ✅ usePushSubscription hook: auto-subscribes logged-in users on first visit
- ✅ sw-push.js service worker: push event handler + notificationclick
- ✅ PushSubscriber component wired in _app.tsx
- ✅ Push sent alongside email reminders in emailReminderService.ts
- ✅ VAPID keys generated + live in Vercel env vars + docker-compose.yml
- ✅ Permission prompt verified working on finda.sale (one-prompt-per-browser design)

---

### Phase 12 – Auction Launch (partial — 2 sprints remaining)
**Goal:** Unlock 7% fee tier, launch live bidding for high-value items

**✅ Done (session 36, verified 2026-03-04):**
- AuctionCountdown.tsx: live per-second countdown, red under 1hr, auto-invalidates on expiry
- BidModal.tsx: bid modal with validation, login prompt if unauthenticated
- auctionJob.ts cron: `*/5 * * * *` job now actually scheduled (was never running before)
- Auction badge + live countdown wired into sales/[id].tsx

**🔲 Remaining (estimated 1–2 sprints):**
- Organizer flow: toggle item as auction, set reserve price (UI + backend endpoint)
- Stripe webhook for auction wins: capture payment at 7% fee when auction ends with bid ≥ reserve
- Winner notification: push + email to winning bidder
- E2E tests: full auction lifecycle (open → bid → close → payment → notify)

**Note:** Socket.io real-time bidding explicitly deferred (session 36 decision). Polling is sufficient for MVP — revisit with real auction data.

---

### Phase 14 – Growth Mechanics & Experimentation (Ongoing)
**Goal:** Test retention + acquisition multipliers with real users

- Weekend cluster view + route planner
- Timed photo drops
- Referral bounties (credit-based)
- Top collector leaderboard
- UGC missing listing bounties

---

### Phase 15 – SaaS Add-ons & Premium Features (Q3 2026+)
**Goal:** Increase organizer LTV, enable retention + upsell

- Label printing (PDF from item listing)
- Email campaign templates + bulk send
- Scheduled exports (CSV to email)
- Zapier integration
- SMS line management

---

## Dependency Map

### Current State (post-session-37)
- Phase 9 ✅ complete — creator pilot can start now
- Phase 11 ✅ complete — push re-engagement live
- Phase 12 🔲 partial — auction UI live but revenue path (7% webhook) not wired

### Recommended Sprint Order

**Sprint 1 — Phase 12 completion (highest priority):**
- Organizer auction toggle + reserve price UI
- Stripe webhook for auction wins (7% fee)
- Winner notification (push + email)
- This is the primary revenue differentiator; everything else waits on it

**Sprint 2 — Real-user beta onboarding:**
- All bugs closed, push notifications live, creator dashboard working
- Onboard first real organizers in Grand Rapids
- Define beta feedback loop (where do issues get reported?)

**Sprint 3+ — Phase 14 Growth Mechanics (parallel once beta is live):**
- Weekend cluster view + route planner
- Timed photo drops (scarcity mechanic)
- Top collector leaderboard

### Parallel Tracks
- **Phase 14 can start anytime** (independent experiments, no dependencies)
- **Phase 15 (SaaS add-ons) should wait for Phase 12** (want stable revenue model before upsell features)
- **Socket.io live bidding** — keep deferred; revisit once real auction data shows polling is insufficient

---

## How to Use This Roadmap

**For Patrick (PM):**
- Use phases as communication tool for stakeholders, investors
- Each phase has effort estimate (sprints), goal, and success metrics
- Phases may slip or reorder based on beta feedback
- Post-beta, use real user data to deprioritize low-signal features

**For Claude (Developer):**
- Follow phases in order; parallel tracks noted
- Each phase is time-boxed; use health-scout before shipping each
- Update STATE.md after each phase completion
- Run GitHub ↔ local drift check before touching any component not modified this session

---

## Last Updated
2026-03-04 (session 37 audit) — Phases 9 (Creator Growth Platform), 11 (PWA Push), and 12 (partial — auction UI + cron) verified complete. Roadmap reconciled against STATE.md. GitHub MCP marked active. Dependency map updated with revised sprint order: Phase 12 completion → real-user beta → Phase 14 growth mechanics. Socket.io live bidding remains deferred.

**Next Review:** Post-beta launch — validate Phase 14 priorities with real user data before committing resources.
