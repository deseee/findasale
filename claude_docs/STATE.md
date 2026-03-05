# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

Maintain stable MVP in Grand Rapids. Prepare for scale to additional metros.

---

## Locked Decisions

- 5% platform fee (regular), 7% platform fee (auction)
- Stripe Connect Express
- Leaflet + OSM maps, backend geocoding cache
- Cloudinary image storage
- PWA enabled
- Polling for auctions (Socket.io deferred session 36)

---

## Completed Phases (summary)

Phases 1–13 + pre-beta audit + rebrand + Sprints A–M + Phase 31 all verified and shipped.
Key milestones: JWT auth, sale management, Stripe payments, push notifications,
creator affiliates, auction UI + cron + 7% item-level fee, QR marketing,
virtual line, AI item tagging, Schema.org SEO, PWA hardening,
warm design system (Phase 24), bottom tab nav (Phase 25), full palette swap (586 refs / 47 files), skeleton components,
follow system + notification delivery (Phase 17), OAuth social login via NextAuth v4 (Phase 31),
listing card redesign — LQIP blur-up + square aspect ratio + badge overlays (Phase 26),
social proof + activity feed — /api/feed + favoriteCount + /feed page (Phase 28),
photo preview lightbox — PhotoLightbox component, sale + item detail pages (Phase 18),
Hunt Pass + shopper points — PointsTransaction model + pointsService + /api/points + PointsBadge + usePoints + profile tier display (Phase 19),
Creator Tier Program — weekly reputationJob cron + TierBadge + organizer /me endpoint + tier card in dashboard (Phase 22),
Shopper onboarding + empty states + microinteractions — OnboardingModal + points toast (amber, bottom-20) + empty states across all major shopper screens (Phase 27),
Discovery + search — /api/search full-text + /api/search/categories/:cat + /search page + /categories/[category] page (Phase 29),
Review + rating system — reviewController + /api/reviews (sale+organizer) + StarRating + ReviewsSection + avgRating recalc + 5pt award (Phase 15),
Shopper messaging — Conversation + Message models + messageController + /api/messages (5 routes) + messages inbox + thread page + new conversation page + unread badge in BottomTabNav + Message organizer button on sale detail (Phase 20),
Reservation/hold UI — ItemReservation model + holds migration + reservationController + /api/reservations (5 routes) + reserve button on item detail (shoppers) + organizer holds management page + Manage Holds button on dashboard (Phase 21),
Affiliate + referral program — referralController + /api/referrals/dashboard + /refer/[code].tsx redirect page + referral-dashboard.tsx fixed (user.referralCode) + recent referrals list (Phase 23),
Weekly curator email — curatorEmailJob.ts (Monday 8AM cron) + per-organizer HTML digest to followers with notifyEmail=true + upcoming PUBLISHED sales in next 7 days (Phase 30),
Creator tools CSV export — GET /organizers/me/export/items/:saleId backend endpoint (RFC 4180 CSV) + Export CSV button on add-items page (authenticated fetch + blob URL) (Phase 32).

Full detail: `claude_docs/COMPLETED_PHASES.md`

---

## In Progress

None. Sprints O–R complete (2026-03-05). Next: Sprint S — Phase 16 (Advanced photo pipeline).

---

## Pending Manual Action

- **Phase 31 OAuth env vars** — Social login dormant until added to Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. Also configure redirect URIs in Google Console + Meta Dev Portal → `https://finda.sale/api/auth/callback/{google,facebook}`.
- **Resend domain verification** — ✅ Verified.

---

## Deferred

- Socket.io live bidding — polling sufficient for MVP (recheck post-launch)
- Virtual line SMS — scaffolded, Twilio E2E untested
- Multi-metro expansion (Grand Rapids only)
- Real-user beta onboarding
- Video-to-inventory — vision models not ready, revisit late 2026

---

## Next Strategic Move

Five-pillar growth phase. Sprint order:
1. ~~Sprint A: Phase 12 completion~~ ✅ (2026-03-05)
2. ~~Sprint B: Phase 24+25~~ ✅ — Design system + bottom tab nav (2026-03-04)
3. ~~Sprint C: Phase 14~~ ✅ — Rapid capture + background AI + Cloudinary image optimization (2026-03-04)
4. ~~Sprint D: Phase 17~~ ✅ — Follow system + notification delivery complete (2026-03-05)
5. ~~Phase 31~~ ✅ — OAuth social login (NextAuth v4) complete (2026-03-05) — env vars pending in Vercel
6. ~~Sprint E — Phase 26~~ ✅ — Listing card redesign (LQIP, square, badges, 2-col grid) (2026-03-05)
7. ~~Sprint G — Phase 28~~ ✅ — Social proof + activity feed /api/feed + /feed page (2026-03-05)
8. ~~Sprint H — Phase 18~~ ✅ — Photo lightbox (PhotoLightbox component, sale + item detail pages) (2026-03-05)
9. ~~Sprint I — Phase 19~~ ✅ — Hunt Pass + shopper points system (2026-03-05)
10. ~~Sprint J — Phase 22~~ ✅ — Creator Tier Program: reputationJob cron + TierBadge + organizer /me route + tier card in dashboard (2026-03-05)
11. ~~Sprint K — Phase 27~~ ✅ — Onboarding + Empty States + Microinteractions: OnboardingModal + points toast + shopper empty states (2026-03-05)
12. ~~Sprint L — Phase 29~~ ✅ — Discovery + Search: /api/search + /search page + /categories/[category] page (2026-03-05)
13. ~~Sprint M — Phase 15~~ ✅ — Review + rating system UI (2026-03-05)
14. ~~Sprint N — Phase 20~~ ✅ — Shopper messaging (2026-03-05)
15. ~~Sprint O — Phase 21~~ ✅ — Reservation / hold UI (2026-03-05)
16. ~~Sprint P — Phase 23~~ ✅ — Affiliate + referral program (2026-03-05)
17. ~~Sprint Q — Phase 30~~ ✅ — Weekly curator email (2026-03-05)
18. ~~Sprint R — Phase 32~~ ✅ — Creator tools CSV export (2026-03-05)
19. **Sprint S — Phase 16** — Advanced photo pipeline

Full roadmap: `claude_docs/ROADMAP.md`

---

## Known Gotchas (Production)

- **Railway PORT mismatch** — Railway's public networking routes to the port listed in `EXPOSE` in the Dockerfile (5000). Railway also injects a dynamic `PORT` env var (e.g. 8080). If these differ, the backend is unreachable (502 with `x-railway-fallback: true`). **Fix already applied:** `PORT=5000` is now set explicitly in Railway Variables so both sides agree. Do not remove this variable. If you change `EXPOSE` in the Dockerfile, update the Railway Variable to match.
- **Production seed command** — Seed clears and recreates all data. Run from `packages\database` with env vars set:
  ```powershell
  $env:DATABASE_URL="<neon-pooled-url>"   # from packages/backend/.env
  $env:DIRECT_URL="<neon-direct-url>"     # from packages/backend/.env
  pnpm run db:generate                    # regenerate Prisma client first
  pnpm run prisma:seed
  ```
  ⚠️ Seed clears all existing data. Run intentionally.

---

## Constraints

- Token efficiency required
- Modular documentation
- No context drift
- Diff-only updates
- Grand Rapids launch first

---

Last Updated: 2026-03-05 (session 57 — Sprints O–R done: Phase 21 reservation/hold UI, Phase 23 referral program, Phase 30 weekly curator email, Phase 32 CSV export)
