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

Phases 1–13 + pre-beta audit + rebrand + Sprints A–H + Phase 31 all verified and shipped.
Key milestones: JWT auth, sale management, Stripe payments, push notifications,
creator affiliates, auction UI + cron + 7% item-level fee, QR marketing,
virtual line, AI item tagging, Schema.org SEO, PWA hardening,
warm design system (Phase 24), bottom tab nav (Phase 25), full palette swap (586 refs / 47 files), skeleton components,
follow system + notification delivery (Phase 17), OAuth social login via NextAuth v4 (Phase 31),
listing card redesign — LQIP blur-up + square aspect ratio + badge overlays (Phase 26),
social proof + activity feed — /api/feed + favoriteCount + /feed page (Phase 28),
photo preview lightbox — PhotoLightbox component, sale + item detail pages (Phase 18).

Full detail: `claude_docs/COMPLETED_PHASES.md`

---

## In Progress

None. Sprint H complete. Next: Sprint I — Phase 19 (Hunt Pass + points).

---

## Pending Manual Action

- **Vercel redeploy needed** — `NEXT_PUBLIC_API_URL` updated to Railway URL but Vercel is rate-limited; redeploy still pending.
- **Phase 31 env vars** — OAuth social login is deployed but dormant until these are added to Vercel: `NEXTAUTH_SECRET` (generate: `openssl rand -hex 32`), `NEXTAUTH_URL` (Vercel frontend URL), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. Also configure OAuth redirect URIs in Google Console + Meta Dev Portal pointing to `https://your-app.vercel.app/api/auth/callback/{google,facebook}`.
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
9. **Sprint I — Phase 19** — Hunt Pass + shopper points system

Full roadmap: `claude_docs/ROADMAP.md`

---

## Constraints

- Token efficiency required
- Modular documentation
- No context drift
- Diff-only updates
- Grand Rapids launch first

---

Last Updated: 2026-03-05 (session 51 — Phase 18 photo lightbox complete; Phases 26, 28, 18 all pushed this session)
