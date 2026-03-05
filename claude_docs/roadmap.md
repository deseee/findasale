# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-05 (v5 — sprint I–L done, workflow track restored)
**Status:** Production MVP live at finda.sale. 16 phases shipped. Entering growth phase.

---

## Five Pillars

1. **Organizer Photo/Video Workflow** (Phases 14–16)
2. **UI/UX Design Overhaul** (Phases 24–27)
3. **Social & Discovery Layer** (Phases 17, 28–30)
4. **Shopper Engagement Engine** (Phases 18–21)
5. **Creator-Led Growth + Distribution** (Phases 22–23, 31–32)

Research archives: `claude_docs/research/competitor-intel-2026-03-04.md`, `claude_docs/research/growth-channels-2026-03-04.md`

---

## Sprint Priority Order

| Sprint | Phases | Focus | Status |
|--------|--------|-------|--------|
| A | 12 | Auction completion | ✅ Done |
| B | 24+25 | Design system + bottom tab nav | ✅ Done |
| C | 14a+b+c | Rapid capture + background AI + Cloudinary | ✅ Done |
| D | 17 | Reputation + follow system | ✅ Done |
| — | Infra | Railway backend + Neon PostgreSQL migration | ✅ Done (ngrok retired) |
| E | 26 | Listing card redesign + image pipeline | ✅ Done |
| F | 31 | OAuth social login | ✅ Done |
| G | 28 | Social proof + activity feed | ✅ Done |
| H | 18 | Photo preview drops | ✅ Done |
| I | 19 | Hunt Pass + shopper points | ✅ Done |
| J | 22 | Creator tier program | ✅ Done |
| K | 27 | Onboarding + empty states + microinteractions | ✅ Done |
| L | 29 | Discovery + search | ✅ Done |
| **M** | **15** | **Review + rating system UI** | **Next** |
| N | 20 | Shopper messaging | Queued |
| O | 21 | Reservation / hold UI | Queued |
| P–S | 23,30,32,16 | Later phases | Post-beta |

**Parallel tracks:** Phase 32 can spread across sprints, partnerships/content marketing need zero code.

**Infrastructure:** Backend on Railway (`backend-production-153c9.up.railway.app`), PostgreSQL on Neon, frontend on Vercel (`finda.sale`). ngrok bridge retired.

---

## Active Sprint Specs

### Phase 24 — Design System Foundation
**Goal:** Visual identity, spacing, typography, color palette
**Effort:** 1–2 weeks

**Color Palette (Warm + Trust):**
- Background: #F9F7F4 (warm off-white)
- Primary text: #1A1A1A (near-black, 17:1 contrast)
- Accent/CTA: #D97706 (warm amber/orange)
- Secondary: #8B7355 (warm brown)
- Success/Sold: #059669 (muted green)

**Typography:**
- Headings: Montserrat (SemiBold 600 / Bold 700)
- Body: Inter (Regular 400)
- H1: 32px/28px mobile, 700 weight, 1.2 line-height
- Body: 16px minimum, 1.6–1.8 line-height
- Contrast: 7:1 WCAG AAA body, 4.5:1 AA headings

**Spacing (8px Grid):**
xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px, 2xl: 48px
Card padding: 16px mobile / 24px desktop. Gutter: 16px.

**Touch Targets:** Primary buttons 48×48px min. Spacing 8–16px. Nav tabs 56px height.

### Phase 25 — Mobile Navigation + Core Layout
**Goal:** App-like nav, 40% faster task completion
**Effort:** 1–2 weeks
**Depends on:** Phase 24

**Bottom Tab Navigation (4 tabs):**
- Browse/Explore (home + search)
- Map (location discovery)
- Saved/Favorites (heart)
- Profile/Account (organizer dashboard or shopper account)
- Secondary items in hamburger "More" menu

**Layout patterns:**
- Sticky search/filter header (48–56px, slides up on scroll down)
- FAB bottom-right 56px "+ New Sale" for organizers
- Pull-to-refresh for listing feeds
- Skeleton screens for all list/grid views

---

## Upcoming Sprint Specs (load on demand)

### Phase 14 — Rapid Capture + Background Processing
**Goal:** Photograph items at 3x speed, AI fills metadata in background.
**Effort:** 3–4 weeks. **Deps:** Cloudinary, Qwen vision, RAM++ (all existing).

Sprint 14a (1.5wk): Full-screen camera via WebRTC, filmstrip carousel, one-handed capture, local blob preview.
Sprint 14b (1.5wk): Background pipeline — upload Cloudinary → Qwen vision → RAM++ tagger → item status polling.
Sprint 14c (1wk): Cloudinary webhook, auto-crop, thumbnail/optimized/full-res URLs.

**Success:** 20 items < 5min capture. AI accuracy > 80% title/category. Processing < 10s/photo.

### Phase 17 — Follow System + Organizer Reputation
**Goal:** Trust layer + persistent organizer-shopper relationship.
**Effort:** 2 weeks. **Deps:** Reviews model, badge system (both exist).

Follow organizer → push + email on new sale. Reputation tiers: New → Trusted → Estate Curator.
Post-sale drip: 24hr review request, 7d "share your find", 30d "list another sale".

### Phase 26 — Listing Card Redesign
1:1 square photo, 60/40 image/content split, badge overlay, 2-column mobile / 3-column desktop.
Three-tier image loading: LQIP base64 blur → skeleton → lazy high-quality WebP.

### Phase 27 — Onboarding + Empty States + Microinteractions
First-time shopper/organizer flows. Empty states for every screen. Heart animation, confetti on first publish.

### Phase 31 — OAuth Social Login
NextAuth.js v5, Google + Facebook. OAuthProvider + oauthId fields on User. Apple as fast follow.

---

## Deferred Features

| Feature | Reason | Revisit |
|---------|--------|---------|
| Socket.io live bidding | Polling sufficient for MVP | Real data shows demand |
| Multi-metro | Grand Rapids first | Post-beta validation |
| Shipping workflow | Not in-person scope | Organizer demand signal |
| Video-to-inventory | Vision models can't segment rooms | Late 2026+ |

---

## Remaining Feature Gaps

**Must-have before scale:** Reviews/ratings UI (Phase 15 — next sprint), shopper messaging (Phase 20), photo room overviews (Phase 14 onboarding).

**Nice-to-have (post-beta):** Reservation/hold UI, weekly curator email, neighborhood landing pages, favorites categories, missing listing UGC bounties, instant payouts, shipping, label printing, Zapier/CSV export.

---

## Workflow & Infrastructure Track (Parallel — No Sprint Slot)

These run alongside feature sprints. No dedicated sprint needed.

| Task | Priority | Status |
|------|----------|--------|
| Model routing (Opus/Sonnet/Haiku sub-agents) | High | ✅ Implemented — model-routing.md |
| Session safeguards (repair loop circuit breakers) | High | ✅ Implemented — session-safeguards.md, CORE.md §12 |
| Patrick language map | High | ✅ Implemented — patrick-language-map.md, CORE.md §13 |
| Weekly industry intel scheduled task | Medium | ✅ Created — Mondays 9am |
| Daily context freshness check | Medium | ✅ Created — daily 8am |
| Self-healing entries 21–24 | High | ✅ Added |
| Uptime monitoring (external + Cowork investigation) | Medium | Queued — needs StatusGator/UptimeRobot |
| Sentry MCP (production error tracking) | Medium | Queued — needs Sentry account |
| Ollama embeddings for semantic search | Low | Queued — after Phase 29 |
| Stress test suite (schema drift, dead code, stale docs) | Medium | Queued — next Sonnet session |
| Pre-commit validation skill | Medium | Queued — next Sonnet session |

---

*v5 compressed 2026-03-05. Sprints I–L marked done, Workflow track restored (concurrent session overlap fix). Research archives in claude_docs/research/. Next review: post-Sprint M.*
