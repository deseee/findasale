# Next Session Resume Prompt
<<<<<<< HEAD
*Written: 2026-03-12T00:00:00Z*
*Session ended: normally*

## Resume From
Deploy the Neon migration `20260312000002_add_purchase_pos_fields`, then open `/organizer/pos` and run the POS v2 test plan below.

## What Was In Progress
Nothing — all POS v2 development is complete and pushed (`afa28c1`).

## What Was Completed This Session
- **POS v2 full implementation** (Architect → Dev → QA cycle):
  - Multi-item cart (client-side React state, no DB model change)
  - Quick-add misc buttons: 25¢, 50¢, $1, $2, $5, $10
  - Cash payment endpoint + flow (`POST /stripe/terminal/cash-payment`)
  - Collapsible numpad (price entry + cash received + change display)
  - 3 QA blockers found and fixed (misc-only cart, UUID collision, ownership bypass)
- **Migration deploy command** provided in chat (run before testing)
- Commit: `afa28c1` on `main` — 3 files changed

## Environment Notes
- VM local git is 2 commits behind `origin/main` (index.lock blocks git ops in VM — harmless, Patrick pushes from Windows).
- Vercel GitHub App disconnection noted session 149 — Patrick still needs to reconnect in Vercel dashboard → findasale → Settings → Git, or manually trigger deploy.
- `NEXT_PUBLIC_STRIPE_TERMINAL_SIMULATED=true` confirmed in local `.env` (line 34). Also needs to be set in Vercel for staging.
- `pnpm --filter frontend add @stripe/terminal-js` — confirm done (session 151 action). If not, run from Windows PowerShell before testing.

## Exact Context — POS v2 Test Plan

**Pre-flight (Patrick, PowerShell):**
```powershell
# 1. Deploy Neon migration (command from session 153 chat — includes real credentials)
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
# [See session 153 chat for the full command with inline Neon credentials]
npx prisma migrate deploy
$env:DATABASE_URL=""
$env:DIRECT_URL=""
```

**Card flow test (simulated reader):**
1. Open `/organizer/pos`
2. Select an active sale from the dropdown
3. Add 2–3 items from the item picker + 1–2 quick-add misc amounts
4. Verify cart total is correct
5. Click "Connect Reader" — simulated reader should appear
6. Click "Charge $X.XX"
7. Verify success + receipt modal, items SOLD in item list

**Cash flow test:**
1. Same setup — add items to cart
2. Click 💵 Cash toggle
3. Click "Cash Received" — numpad opens
4. Enter amount ≥ cart total (e.g. $20 on a $12 cart)
5. Verify change display: "Change: $8.00"
6. Click "Record Sale"
7. Verify success + receipt with change amount
=======
*Written: 2026-03-12*
*Session ended: normally*

## Resume From

**Decision needed: How does FindA.Sale collect the 10% platform fee on cash sales?**

Card payments are handled automatically — Stripe Connect captures the full cart total, transfers `amount - 10%` to the organizer's connected account, and FindA.Sale retains the fee. No manual work required.

Cash payments have no equivalent mechanism. The `/stripe/terminal/cash-payment` endpoint records the sale and marks items SOLD, but the 10% platform fee is never collected. FindA.Sale is currently providing cash payment recording as a free feature with no revenue attached.

## The Question

What is the intended collection mechanism for cash sales?

**Option A — Invoice post-sale:** At sale close, generate an invoice to the organizer for 10% of total cash sales. Organizer pays manually (bank transfer, card, etc.).

**Option B — Deduct from next card payout:** When an organizer receives their next Stripe Connect payout, reduce it by the accumulated cash fee balance. Requires tracking `cashFeeOwed` on the Organizer record.

**Option C — Upfront deposit / prepaid balance:** Organizers pre-fund an account balance; cash sale fees are debited in real-time. Blocks sale start until balance is sufficient.

**Option D — Cash sales are free (0% fee):** Platform fee only applies to card transactions. Cash recording is a free feature to drive adoption.

**Option E — Honor system for beta:** Don't build infrastructure now. Collect manually during beta, decide based on real organizer cash-to-card ratio data.

## What Was Completed Last Session (152)

- Duplicate itemId guard in both POS payment flows — commit `3119821`
- Error messages now show item titles, not raw DB UUIDs — commit `3957771`
- POS item search now filters by q/status/limit — sold items no longer appear — commit `e0f4287`
- Inline cash received numpad — live change/short display, independent from price numpad — commit `9b813dc`

## Files Changed (All on GitHub via MCP)

- `packages/backend/src/controllers/terminalController.ts`
- `packages/backend/src/controllers/itemController.ts`
- `packages/frontend/pages/organizer/pos.tsx`

All 4 commits already on GitHub main — no push needed unless local diverged.

## Suggested Session 153 Approach

1. **findasale-investor** — quick ROI/cost-benefit on Options A–E (revenue per option, build cost, expected cash-to-card ratio for estate sales)
2. **findasale-advisory-board** (Ship-Ready subcommittee) — decision recommendation
3. **Patrick decides** — lock the approach
4. If non-trivial (Options B or C): **findasale-architect** → schema + API design, then **findasale-dev** → implement
>>>>>>> origin/main

**Cancel test:**
1. Start a card charge flow
2. Click Cancel before completing
3. Verify cart restored and no Purchase records created

<<<<<<< HEAD
## Files Changed This Session
- `packages/frontend/pages/organizer/pos.tsx` (complete rewrite — 760 lines)
- `packages/backend/src/controllers/terminalController.ts` (complete rewrite — 575 lines)
- `packages/backend/src/routes/stripe.ts` (added cash-payment route)
- `claude_docs/STATE.md` (session 153 entry added)
- `claude_docs/session-log.md` (session 153 entry, session 142 pruned)
- `claude_docs/self-healing/self_healing_skills.md` (SH-008 renumbered, SH-009 + SH-010 added)
- `claude_docs/next-session-prompt.md` (this file)
=======
**GitHub:** All session 152 commits on main (via MCP).

**Neon:** Migration `20260312000002_add_purchase_pos_fields` **STILL PENDING** — required for POS to work in production. Deploy before real-hardware testing.

**Vercel:** Should be auto-deploying. Session 152 pos.tsx change (inline numpad) pending Vercel deploy confirmation.

**POS:** Code-complete and tested in simulated mode (session 151). Session 152 fixes are incremental improvements on top of working code.
>>>>>>> origin/main
