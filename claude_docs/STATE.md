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

Phases 1-13 + pre-beta audit + rebrand + Sprint A + Sprint B all verified and shipped.
Key milestones: JWT auth, sale management, Stripe payments, push notifications,
creator affiliates, auction UI + cron + 7% item-level fee, QR marketing,
virtual line, AI item tagging, Schema.org SEO, PWA hardening,
warm design system (Phase 24), bottom tab nav (Phase 25), full palette swap (586 refs / 47 files), skeleton components.

Full detail: `claude_docs/COMPLETED_PHASES.md`

---

## In Progress

**Sprint D - Phase 17: Follow System + Organizer Reputation**
- Phase 17a: Prisma schema - Follow model, Organizer reputation fields
- Phase 17b: Backend - follow/unfollow/followers API, organizer profile returns followerCount + isFollowing + reputationTier
- Phase 17c: Frontend - FollowButton, ReputationTier badge, organizer profile updated
- INCOMPLETE: Notification delivery entirely missing - when organizer publishes a sale, followers receive NO email or push notification. notifyEmail/notifyPush preference fields are stored but never checked. Follow system is not user-facing functional until this is built.

**Phase 31 - OAuth / NextAuth Social Login (schema phase)**
- schema.prisma: password String?, oauthProvider String?, oauthId String?, unique oauthProvider+oauthId
- Migration 20260304000003_phase31_oauth_fields applied to Neon
- Next: NextAuth.js v5 install + Google/Facebook provider config + backend auth flow

**Sprint C - Phase 14: Rapid Capture + Background AI** COMPLETE
- Phase 14a+14b: RapidCapture + batch upload + AI analysis
- Phase 14c: Cloudinary eager transforms (thumbnail 200x200, optimized 800w, full 1600w - all WebP), imageUtils.ts frontend helpers, SaleCard/ItemCard using optimized URLs

---

## Pending Manual Action

- **Vercel redeploy needed** - NEXT_PUBLIC_API_URL updated to https://backend-production-153c9.up.railway.app but Vercel is rate-limited; redeploy pending. Frontend will not talk to Railway backend until this deploys.
- **Resend domain verification** - Verified.

---

## Deferred

- Socket.io live bidding - polling sufficient for MVP
- Virtual line SMS - scaffolded, Twilio E2E untested
- Multi-metro expansion (Grand Rapids only)
- Real-user beta onboarding
- Video-to-inventory - vision models not ready, revisit late 2026
- OAuth social login - promoted to Phase 31 (P1)

---

## Next Strategic Move

Five-pillar growth phase. Sprint order:
1. Sprint A: Phase 12 completion - Done (2026-03-05)
2. Sprint B: Phase 24+25 - Done - Design system + bottom tab nav (2026-03-04)
3. Sprint C: Phase 14 - Done - Rapid capture + background AI + Cloudinary (2026-03-04)
4. **Sprint D: Phase 17** - Organizer reputation + follow system (IN PROGRESS - schema + API + UI done, notification delivery missing)
5. **Phase 31** - OAuth schema applied to Neon; NextAuth implementation queued

Full roadmap: `claude_docs/ROADMAP.md`

---

## Constraints

- Token efficiency required
- Modular documentation
- No context drift
- Diff-only updates
- Grand Rapids launch first

---

Last Updated: 2026-03-04 (session 48 - security fix auth.ts, Phase 17 gap discovered, Phase 31 schema live on Neon, Docker DIRECT_URL fix)
