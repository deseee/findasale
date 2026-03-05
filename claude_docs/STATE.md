# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

Post-launch improvement. MVP stable in Grand Rapids. Sprints T–X queued.

---

## Locked Decisions

- 5% platform fee (regular), 7% platform fee (auction)
- Stripe Connect Express
- Leaflet + OSM maps, backend geocoding cache
- Cloudinary image storage
- PWA enabled
- Polling for auctions (Socket.io → Sprint V)

---

## Completed Phases (summary)

Phases 1–13 + pre-beta audit + rebrand + Sprints A–S all verified and shipped (21 phases total).
Key milestones: JWT auth, sale management, Stripe payments, push notifications,
creator affiliates, auction UI + cron + 7% item-level fee, QR marketing,
virtual line scaffold, AI item tagging, Schema.org SEO, PWA hardening,
warm design system, bottom tab nav, full palette swap, skeleton components,
follow system + notification delivery, OAuth social login (NextAuth v4),
listing card redesign (LQIP blur-up + square + badges), social proof + activity feed,
photo lightbox, Hunt Pass points, creator tier program, shopper onboarding + empty states,
discovery + full-text search, review + rating system, shopper messaging,
reservation/hold UI, affiliate + referral program, weekly curator email,
CSV export, advanced photo pipeline (add/remove/reorder + ItemPhotoManager).

Full detail: `claude_docs/COMPLETED_PHASES.md`

---

## In Progress

None. **Next: Sprint T — Production Hardening.** See `claude_docs/roadmap.md` for full spec.

---

## Pending Manual Action

- **Phase 31 OAuth env vars** — Social login dormant until added to Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. Configure redirect URIs → `https://finda.sale/api/auth/callback/{google,facebook}`.
- **Uptime monitoring** — Create UptimeRobot or StatusGator free account, add monitors for `finda.sale` and Railway backend. Share URL with Claude to wire alerts.
- **Sentry** — Create Sentry project, share DSN. Claude wires `@sentry/node` + `@sentry/nextjs`.

---

## Deferred (Long-Term)

- Multi-metro expansion — Grand Rapids first, business decision
- Video-to-inventory — vision models not ready, revisit late 2026
- Real-user beta onboarding — human task

---

## Next Strategic Move

Sprints A–S complete. Post-launch Sprint Track T–X defined in `claude_docs/roadmap.md`.

| Sprint | Focus |
|--------|-------|
| **T** | **Production Hardening — stress tests, pre-commit skill, favorites categories, virtual line SMS E2E** |
| U | Search & Discovery Upgrade — Ollama semantic embeddings, neighborhood landing pages |
| V | Live Engagement — Socket.io bidding, instant payouts, UGC bounties |
| W | Organizer Workflow — shipping, label printing |
| X | Integrations — Zapier webhook system |

---

## Known Gotchas (Production)

- **Railway PORT mismatch** — `PORT=5000` locked in Railway Variables. Must match `EXPOSE 5000` in Dockerfile. Do not remove.
- **Neon production DB** — `prisma migrate deploy` must be run manually after any new migration. 4 migrations were applied 2026-03-05. All pending migrations now resolved.
- **Production seed:**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
  $env:DATABASE_URL="postgresql://neondb_owner:npg_6CVGh8YvPSHg@ep-plain-sound-aeefcq1y-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  $env:DIRECT_URL="postgresql://neondb_owner:npg_6CVGh8YvPSHg@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  pnpm run db:generate
  npx prisma migrate deploy
  ```
  ⚠️ Seed clears all data — run intentionally.

---

## Constraints

- Token efficiency required — keep Tier 1 docs lean
- Diff-only updates
- Grand Rapids launch first

---

Last Updated: 2026-03-05 (session 58 — All Five Pillars done, post-launch Sprint Track T–X defined, Neon migrations applied, Railway redeployed clean)
