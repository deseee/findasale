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

Phases 1–13 + pre-beta audit + rebrand + Sprint A + Sprint B all verified and shipped.
Key milestones: JWT auth, sale management, Stripe payments, push notifications,
creator affiliates, auction UI + cron + 7% item-level fee, QR marketing,
virtual line, AI item tagging, Schema.org SEO, PWA hardening,
warm design system (Phase 24), bottom tab nav (Phase 25), full palette swap (586 refs / 47 files), skeleton components.

Full detail: `claude_docs/COMPLETED_PHASES.md`

---

## In Progress

**Sprint D — Phase 17: Follow System + Organizer Reputation**
- ✅ Phase 17a: Prisma schema — Follow model (userId+organizerId unique, notifyEmail/notifyPush), Organizer reputation fields (reputationTier, avgRating, totalReviews, totalSales)
- ✅ Phase 17b: Backend — follow/unfollow/followers API, organizer profile returns followerCount + isFollowing + reputationTier
- ✅ Phase 17c: Frontend — FollowButton component, ReputationTier badge component, organizer profile page updated
- ⚠️ Prisma migration needed: `prisma migrate dev` in Docker to apply Follow model + Organizer reputation fields

**Sprint C — Phase 14: Rapid Capture + Background AI** ✅ COMPLETE
- ✅ Phase 14a+14b: RapidCapture + batch upload + AI analysis
- ✅ Phase 14c: Cloudinary eager transforms (thumbnail 200×200, optimized 800w, full 1600w — all WebP), imageUtils.ts frontend helpers, SaleCard/ItemCard using optimized URLs

---

## Pending Manual Action

- **Vercel redeploy needed** — `NEXT_PUBLIC_API_URL` updated to `https://backend-production-153c9.up.railway.app` but Vercel is rate-limited; redeploy pending (ETA: a few hours). Frontend will not talk to Railway backend until this deploys.
- **Resend domain verification** — ✅ Verified.

---

## Deferred

- Socket.io live bidding — polling sufficient for MVP
- Virtual line SMS — scaffolded, Twilio E2E untested
- Multi-metro expansion (Grand Rapids only)
- Real-user beta onboarding
- Video-to-inventory — vision models not ready, revisit late 2026
- OAuth social login — promoted to Phase 31 (P1)

---

## Next Strategic Move

Five-pillar growth phase. Sprint order:
1. ~~Sprint A: Phase 12 completion~~ ✅ (2026-03-05)
2. ~~Sprint B: Phase 24+25~~ ✅ — Design system + bottom tab nav (2026-03-04)
3. ~~Sprint C: Phase 14~~ ✅ — Rapid capture + background AI + Cloudinary image optimization (2026-03-04)
4. **Sprint D: Phase 17** — Organizer reputation + follow system (IN PROGRESS — schema + API + UI done, migration pending)

Full roadmap: `claude_docs/ROADMAP.md`

---

## Constraints

- Token efficiency required
- Modular documentation
- No context drift
- Diff-only updates
- Grand Rapids launch first

---

Last Updated: 2026-03-04 (session 47 — Railway backend deployed, Neon DB migrated, ngrok bridge retired)
