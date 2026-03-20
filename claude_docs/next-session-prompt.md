# Next Session Resume Prompt — S215
*Written: 2026-03-20*
*Session ended: normally*

---

## Resume From

Session wrap for S214. Deploy subagents in parallel on ALL items below — do not wait for Patrick to say "continue" between agent returns (conversation-defaults Rule 30).

---

## Deploy These Subagents in Parallel at Session Start

### 1. findasale-dev — Subscription tier bug fix
`/organizer/subscription` shows "Upgrade to PRO" CTA for PRO-tier users instead of the support message. Root cause: `useOrganizerTier()` may return 'SIMPLE' incorrectly when user is logged in as PRO. Investigate `hooks/useOrganizerTier.ts` (or equivalent), trace the JWT payload → tier mapping, and fix. Test accounts: user2@example.com (PRO), user3@example.com (TEAMS).

### 2. findasale-dev — P2 backlog
Three items in one dispatch:
- **Error shape inconsistency**: some backend controllers return `{ message }`, others return `{ error }`. Audit all controllers and standardize to `{ message }` (or whichever is more prevalent). Frontend error handling depends on this.
- **Holds pagination**: organizer holds list (`/organizer/holds`) loads all holds with no pagination. Add standard cursor/page-based pagination.
- **Hub N+1 query**: hub membership display performs N+1 query pattern. Fix with a proper join/include.

### 3. findasale-dev — Design polish sprint (frontend-only, no schema)
Build these three features in one dispatch — all frontend-only, zero schema changes:
- **#76 Skeleton Loaders — Item Grids**: replace spinners with ghost card layouts across all item/sale grids. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md`
- **#77 Sale Published Celebration Screen**: full-screen moment when organizer publishes a sale — triggers on `Sale.status → PUBLISHED`. Confetti + "You're live" + sale name. Replaces generic toast. Spec: same file.
- **#81 Empty State Audit + Copy Pass**: inventory all empty states across organizer and shopper flows. Write human-voice copy + CTA for each. UX/copy only. Spec: same file.

### 4. findasale-architect — Dual-Role Account Schema ADR (#72)
Feature #72 (Dual-Role Account Schema) is the architectural gate for #73 (Two-Channel Notifications), #74 (Role-Aware Registration Consent), and #75 (Tier Lapse State Logic). Produce an ADR in `claude_docs/architecture/` covering: `roles[]` array design, `subscriptions[]` table, migration path from current single `role` enum, and recommended implementation order for #73–#75. Design decision only — no dev yet.

### 5. findasale-dev — Platform Safety P0 sprint (pre-beta required)
Build these backend-only safety features:
- **#93 Bidder Account Age Gate (7-day)**: block bids from accounts < 7 days old. Middleware on bid endpoint. Ref: anti-abuse spec in `claude_docs/architecture/`.
- **#95 Bidding Velocity Limits**: rate-limit 10+ bids in < 1 minute per account. Redis-based (REDIS_URL already live on Railway).
- **#96 Buyer Premium Disclosure**: checkout UI shows buyer premium as a separate line item with checkbox confirmation required before payment completes.

---

## Chrome Verification Needed (7 pages — targeted, not full audit)

Secondary routes never verified in S211 comprehensive audit, plus the new LiveFeedTicker placement:
- `/categories` — category browsing page
- `/categories/[category]` — individual category
- `/tags/[slug]` — tag page
- `/condition-guide` — condition reference
- `/organizers/[id]` — public organizer profile
- `/items/[id]` — item detail page
- `/sales/[id]` — sale detail page (verify LiveFeedTicker renders and gracefully hides when not connected)

Use Chrome MCP with user2 (PRO organizer) and user11 (shopper).

---

## Deferred Pre-Wires (dispatch to Architect or dev — low effort, high future value)

- Add `consignorId` + `consignmentSplitPct` fields to `Item` schema now. Enables consignment feature via config-flag activation with zero migration cost at trigger.
- Add affiliate payout calculation table + `affiliateReferralCode` to schema now. Affiliate backend is 60% built — pre-wire the payout table so activation is a config flag.

---

## SEO Sprint Candidate

**#92 City Weekend Landing Pages**: ISR pages at `/grand-rapids-estate-sales` etc. Zero new schema — queries existing `Sale` + `Item` + `Organizer` data. Schema.org markup. High organic traffic ROI before beta. Dispatch findasale-dev when capacity allows.

---

## Roadmap Status After S214

- #70 Live Sale Feed: FULLY COMPLETE ✅ — LiveFeedTicker placed on sale detail page
- #19 Passkey: DEPLOYED ✅ — live on Railway + Vercel, no action needed
- S212/S213 bug fixes: Chrome-verified ✅ (13/15 PASS; 2 were wrong test URLs)
- P2 backlog: error shape, holds pagination, hub N+1 — queued S215
- Platform safety #93–#121: queued for pre-beta sprint
- #51 Sale Ripples: Neon migration still pending (Patrick action)

---

## Push Pending (Patrick must run before S215)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/sales/[id].tsx
git commit -m "feat: place LiveFeedTicker on sale detail page — completes feature #70"
.\push.ps1
```

---

## Environment Notes
- Railway and Vercel GREEN as of S214
- Redis live on Railway (REDIS_URL set), NEXT_PUBLIC_SOCKET_URL set on Vercel
- `.\push.ps1` for all git pushes (never `git push` directly)
- #51 Ripples: Neon migration + `prisma generate` outstanding (see schema change protocol)
- Key pattern: `prisma.sale.groupBy` with `_count` is broken in this Prisma version — always use `$queryRaw` for grouped aggregates. COUNT(*) returns `bigint` — convert with `Number(item.count)`.
