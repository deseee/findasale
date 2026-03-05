# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

---

## Recent Sessions

### 2026-03-05 (session 64 — strategic review + parallel roadmap)
**Worked on:** Comprehensive strategic review of FindA.Sale post-Sprint X. Market research ($2.7B–$4B US estate sale market, $186B secondhand market). Competitor ToS research across 7 platforms. Branding brief (warm amber palette, serif+sans typography, affordable path). Cross-industry feature brainstorm (25+ features ranked). Built 5-path parallel roadmap v2: P (Patrick human tasks), CA (production readiness), CB (AI tagging), CC (business intel), CD (innovation & experience). All research saved to `claude_docs/research/`.
**Decisions:** Parallel path model adopted as new roadmap structure. Sync points at 8 defined moments over 8 weeks. AI tagging production: Google Vision + Claude Haiku ($10–50/mo). 3-tier pricing proposed (3%/5%/4%). P1 partially done (LLC/EIN/bank done; email/cards/GBP open). P3 already done (original project research).
**Next up:** Sonnet merges parallel-roadmap-v2 + long-term hold into official `roadmap.md`, audits all claude_docs for alignment. Then CA1 (ToS) and CB1 (AI tagging spec).
**Blockers:** Branding direction needs Patrick decision. AI tagging API keys need Patrick. Phase 31 OAuth env vars still needed.

### 2026-03-05 (session 63 — migrations, lockfile, pre-push hook, TS fixes)
**Worked on:** Wired `BountyModal` into `sales/[id].tsx` and Print Labels button into `organizer/dashboard.tsx`. Fixed backend crash (`socket.io` missing from Docker image — rebuilt). Fixed `ERR_PNPM_OUTDATED_LOCKFILE` on Vercel by syncing `pnpm-lock.yaml`. Fixed TypeScript errors in `bounties.tsx` and `payouts.tsx` (TanStack Query v5 removed `onSuccess` from `useQuery` — replaced with `useEffect`). Fixed pre-push hook picking up global Prisma 7.4.2 instead of local v5 (hook now `cd packages/database` first). Created + applied Follow table migration (`20260305000009_add_follow_table`) to both Neon and local Docker. Reconciled local Docker migration history (26 migrations all marked applied via bulk `resolve --applied` loop).
**Decisions:** Pre-push hook must always invoke prisma from within `packages/database` to avoid global CLI version conflicts. TanStack Query v5 pattern: `useEffect` watching `data` replaces `onSuccess` in `useQuery`.
**Next up:** Define Sprint Y or begin beta onboarding. Codebase is fully clean — all migrations applied, lockfile synced, no TS errors.
**Blockers:** Phase 31 OAuth env vars still needed in Vercel (`GOOGLE_CLIENT_ID` etc). Sentry test route not yet verified end-to-end.

### 2026-03-05 (session 62+ — Sprints V2–X1 complete, full post-launch track done)
**Worked on:** V2 (instant payouts): `payoutController.ts` (balance, payout schedule, on-demand payout), `routes/stripe.ts` (4 new routes), `pages/organizer/payouts.tsx`. V3 (UGC bounties): `MissingListingBounty` schema + migration, `bountyController.ts`, `routes/bounties.ts`, `pages/organizer/bounties.tsx`, `components/BountyModal.tsx`. W1 (shipping): `shippingAvailable`/`shippingPrice` on Item + migration, item CRUD updated, payment intent accepts `shippingRequested`. W2 (label PDF): `labelController.ts` with pdfkit, single-item and all-items endpoints. X1 (Zapier webhooks): `Webhook` model + migration, `webhookService.ts` (HMAC-SHA256 signed), `webhookController.ts`, `routes/webhooks.ts`, `pages/organizer/webhooks.tsx`. Hooks fired on `bid.placed` and `purchase.completed`. All pushed to GitHub.
**Decisions:** Webhook secrets shown once on creation. Instant payout eligibility errors handled gracefully. Shipping cost added to Stripe charge total, stored in payment intent metadata. Label PDF uses pdfkit 4×3" pages (already installed).
**Next up:** Run `prisma migrate deploy` for 3 pending migrations (20260305000006–8) on Neon. Then define Sprint Y or begin real-user beta onboarding.
**Blockers:** 3 Neon migrations pending before deploy. Phase 31 OAuth env vars still needed in Vercel.

### 2026-03-05 (session 61 — Sentry live, git crisis resolved, doc audit)
**Worked on:** Completed Sentry deployment: committed updated `pnpm-lock.yaml` (Vercel was failing with frozen lockfile error), fixed Vercel deploy. Resolved multi-session git crisis: `.gitattributes` CRLF rule caused perpetual dirty `roadmap.md`/`ROADMAP.md` (case-sensitivity duplicate index entries on Windows) — resolved via `git reset --hard origin/main`. Restored local `roadmap.md` to v9 (was at v3 — severely stale). Updated STATE.md Sentry entry to "fully deployed". Added self-healing entries 30 (`.gitattributes` CRLF perpetual dirty), 31 (case-sensitivity duplicate index), 32 (pnpm frozen lockfile mismatch). Updated entry 29 with nuclear reset fix.
**Decisions:** `git reset --hard origin/main` is the canonical nuclear fix for any git state that survives stash/restore loops 3+ times. Never attempt case-only renames on Windows. Always commit `pnpm-lock.yaml` after Claude adds packages.
**Next up:** Sprint T — Production Hardening. Session-start self-healing diagnostic first.
**Blockers:** Phase 31 OAuth env vars still needed in Vercel. Sentry test endpoint should be added and removed to verify end-to-end capture.

### 2026-03-05 (session 59 — claude_docs audit + anti-bloat system)
**Worked on:** Full claude_docs audit. Cleaned STACK.md (Cloudinary locked, Vercel/Railway/Neon infra confirmed), DEVELOPMENT.md (removed stale Gradio section), OPS.md (rewrote to 4-line pointer). Archived 3 one-time audit files to `claude_docs/archive/`. Added CORE.md §14 (Tier 1/2/3 doc classification + anti-bloat rules) and §2 step 6 (GitHub sync check). Updated context-maintenance skill with Step 0 (Archive Check). Added self_healing entry #29 (git local/GitHub drift — MCP push + CRLF = perpetual dirty ROADMAP.md). Diagnosed `reservationExpiryJob` TypeError (Prisma client stale, needs Docker rebuild). Diagnosed `next-auth/react` missing (needs `pnpm install` + frontend `--no-cache` rebuild).
**Decisions:** Tier 1/2/3 doc classification locked in CORE.md §14. Archive trigger now enforced at every session wrap via context-maintenance Step 0. Git drift is structurally certain to recur — self-healing entry #29 is the canonical fix.
**Next up:** Patrick must run git fix commands, then Docker rebuilds (backend for Prisma, frontend for next-auth), then Sprint T begins.
**Blockers:** Local git CRLF drift (ROADMAP.md perpetually dirty) — run `git stash; git pull --rebase; git stash pop; git push`. `reservationExpiryJob` TypeError — run `docker-compose up --build -d backend`. `next-auth` missing — run `pnpm install` then `docker compose build --no-cache frontend && docker compose up -d`.
