# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

---

## Recent Sessions

### 2026-03-05 (sessions 66–68 — C/P path batch + logo redesign)
**Worked on:** CB1: `cloudAIService.ts` (Google Vision REST → Claude Haiku chain, Ollama fallback), `uploadController.ts` updated. CA5 medium fixes: message pagination caps (take:200/100), `contactLimiter` (5/15min). CB3: AI suggestions review panel in add-items (Apply/Dismiss/Rescan — no silent pre-fill). CC2: marketing content doc (2 blog posts, social templates, 4 email templates). CA2: schema verified (4 additive migrations pending Railway), migration runbook created. CD1: Fraunces serif font + sage-green palette in Tailwind + `_document.tsx`. CA3: payment stress test doc, 2 Stripe bugs fixed (concurrent purchase auto-refund, $0.50 minimum guard). P6: AI-generated logo — initial SVG + PNG set, then full redesign to clean price tag icon after Patrick rejected phone/Q shape. Five final PNGs: logo-icon-512, logo-oauth-120, logo-primary, business-card-front, business-card-back.
**Decisions:** Logo concept: amber rounded-square bg, white price tag (pointing left), dark amber price lines inside. No magnifying glass. OAuth consent screen needs 120×120 square PNG — `logo-oauth-120.png` created. Business cards use Vistaprint 3.5×2" @ 300dpi (1050×600px).
**Next up:** CA4 (user flow audit — full shopper/organizer/creator journey, mobile + a11y), CA6 (feature polish — photo UX, push notifications, onboarding, empty states), CD2 Phase 2 (engagement layer). Patrick: order business cards (business-card-front/back.png in claude_docs/brand/), P2 (Stripe business account, Google Voice, Search Console), P5 OAuth credentials to Vercel.
**Blockers:** Brand PNGs generated locally but push agent hit token limit — need to verify GitHub has latest logo files. Patrick to confirm 5%/7% flat fee for beta (CC3). Railway migrations (4 pending) — should auto-run on next deploy.

### 2026-03-05 (session 65 — roadmap merge + claude_docs audit)
**Worked on:** Merged `parallel-roadmap-v2-2026-03-05.md` into official `roadmap.md` (now v10). Incorporated Long-Term Hold section from old roadmap (video-to-inventory, multi-metro). Updated STATE.md to reflect parallel path model — replaced all Sprint T–X language with 5-path structure (P/CA/CB/CC/CD). Audited claude_docs for stale sprint references; updated next-session-prompt.md and session-log.md.
**Decisions:** roadmap.md is now authoritative v10 parallel path document. `research/parallel-roadmap-v2-2026-03-05.md` remains in research/ as the source doc.
**Next up:** CA1 (ToS/Privacy — 1 session, fully autonomous). CB1 needs Patrick API keys. CD1 needs Patrick branding direction.
**Blockers:** Phase 31 OAuth env vars still needed in Vercel. 3 Neon migrations still pending (20260305000006–8). Branding direction + AI tagging API keys needed from Patrick.

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