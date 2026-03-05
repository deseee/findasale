# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-05 (v7 — Sprints O–R done: Phases 21, 23, 30, 32 complete)
**Status:** Production MVP live at finda.sale. 20 phases shipped. Entering growth phase.

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
| M | 15 | Review + rating system UI | ✅ Done |
| N | 20 | Shopper messaging | ✅ Done |
| O | 21 | Reservation / hold UI | ✅ Done |
| P | 23 | Affiliate + referral program | ✅ Done |
| Q | 30 | Weekly curator email | ✅ Done |
| R | 32 | Creator tools — CSV export | ✅ Done |
| **S** | **16** | **Advanced photo pipeline** | **Next** |

**Parallel tracks:** Partnerships/content marketing need zero code and can run alongside any sprint.

**Infrastructure:** Backend on Railway (`backend-production-153c9.up.railway.app`), PostgreSQL on Neon, frontend on Vercel (`finda.sale`). ngrok bridge retired.

---

## Active Sprint Specs

### Phase 16 — Advanced Photo Pipeline
**Goal:** Multi-photo support per item, photo reordering, cover photo selection, batch delete.
**Deps:** Cloudinary already integrated (Phase 14). Item model has `photoUrl` (single). Needs multi-photo.

Deliverables:
- `ItemPhoto` join model (id, itemId, url, position, isCover)
- Migration: `phase16_item_photos`
- `GET /items/:id/photos` — list photos for item
- `POST /items/:id/photos` — upload + attach photo (Cloudinary)
- `PATCH /items/:id/photos/reorder` — update positions
- `DELETE /items/:id/photos/:photoId` — remove photo
- `PATCH /items/:id/photos/:photoId/cover` — set cover photo
- Updated item detail page: multi-photo carousel replacing single photoUrl
- Updated organizer add-items: multi-upload UI with drag-to-reorder

---

## Upcoming Sprint Specs (load on demand)

### Phase 24 — Design System Foundation
**Goal:** Visual identity, spacing, typography, color palette
**Effort:** 1–2 weeks

**Color Palette (Warm + Trust):**
- Background: #F9F7F4 (warm off-white)
- Primary text: #1A1A1A (near-black, 17:1 contrast)
- Accent/CTA: #D97706 (warm amber/orange)
- Secondary: #8B7355 (warm brown)
- Success/Sold: #059669 (muted green)

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

### Phase 31 — OAuth Social Login
NextAuth.js v5, Google + Facebook. OAuthProvider + oauthId fields on User. Apple as fast follow.

---

## Deferred Features

| Feature | Reason | Revisit |
|---------|--------|------|
| Socket.io live bidding | Polling sufficient for MVP | Real data shows demand |
| Multi-metro | Grand Rapids first | Post-beta validation |
| Shipping workflow | Not in-person scope | Organizer demand signal |
| Video-to-inventory | Vision models can't segment rooms | Late 2026+ |

---

## Remaining Feature Gaps

**Must-have before scale:** Advanced photo pipeline (Phase 16 — next sprint).

**Nice-to-have (post-beta):** Neighborhood landing pages, favorites categories, missing listing UGC bounties, instant payouts, shipping, label printing, Zapier integration.

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

*v7 compressed 2026-03-05. Sprints O–R done (Phases 21, 23, 30, 32). Next: Sprint S — Phase 16 advanced photo pipeline.*
