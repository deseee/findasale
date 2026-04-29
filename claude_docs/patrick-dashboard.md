# Patrick's Dashboard — S593 ✅ COMPLETE

## Status: Voiced video ad (12-line ElevenLabs VO + background music) + Vercel Analytics added to PWA. Push block below.

---

## S597 Summary

Condition rating system was inconsistent across 5 surfaces. Fixed both the labels AND the FAQ entry count.

**Locked decisions:**
1. "Like New" canonical for grade S — drop "Mint" everywhere
2. As-Is is a flag orthogonal to grade (not a 6th tier)

**5 files synced:** `lib/itemConstants.ts`, `pages/organizer/edit-item/[id].tsx`, `pages/organizer/add-items/[saleId]/review.tsx`, `components/ConditionBadge.tsx`, `pages/faq.tsx`.

**FAQ condition section collapsed 9→3 entries** (per your callout): intro + 5 grade Qs + As-Is merged into a single "What is a Condition Rating?" with bulleted grade list (S/A/B/C/D + pricing % + examples) and As-Is paragraph. "Who decides" and "Can I dispute" kept separate.

**FAQ Explorer's Guild section audited + rewritten** (your second callout — fabricated XP amounts/discounts). Confirmed 6 of 8 Qs had values that didn't match `guild-primer.tsx`: "$1 = 1 XP" (real: flat 10 XP/purchase), "5/10/15% Hunt Pass rank discounts" (don't exist), "75 XP → $5 off" (real: 500 XP), "GM keeps Hunt Pass forever after dropping" (real: lapses on drop, restores on re-qualify), "Scout/Initiate don't drop at reset" (real: everyone drops one tier), per-stop trail XP "5/3/2" (don't exist), "Account → Loyalty" route (stale). **Fix:** all 8 guild Qs rewritten to link to `/shopper/guild-primer` (canonical) and `/coupons` (XP Store live prices) instead of duplicating numeric values inline. Annual reset and Treasure Trail rank gates rewritten to match primer exactly.

---

## ⚡ Do This Now

**Step 1 — TS sanity check (sandbox was unavailable so I couldn't run it):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\frontend
npx tsc --noEmit --skipLibCheck 2>&1 | Select-String "error TS"
cd ..\..
```

**Step 2 — Combined push (S595 + S597 + wrap):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/sales/[id]/treasure-hunt-qr/progress.tsx
git add "packages/frontend/pages/sales/[id]/treasure-hunt-qr/[clueId].tsx"
git add packages/frontend/components/qr-scanner/QRScannerModal.tsx
git add packages/frontend/lib/itemConstants.ts
git add "packages/frontend/pages/organizer/edit-item/[id].tsx"
git add "packages/frontend/pages/organizer/add-items/[saleId]/review.tsx"
git add packages/frontend/components/ConditionBadge.tsx
git add packages/frontend/pages/faq.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: treasure hunt progress + via=qr guard (S595) + condition rating sync + FAQ merge (S597) [wrap S597]"
.\push.ps1
```

**Step 3 — After push, Chrome QA:**
- `/faq` condition section — ONE merged Q (not 9). Bulleted S/A/B/C/D list with pricing %. As-Is paragraph at bottom.
- `/faq` Explorer's Guild section — 8 Qs now link to `/shopper/guild-primer` and `/coupons` (no inline XP/% values). Verify links work.
- `/organizer/edit-item/[any-item]` helper text shows "S=Like New" (capital N).
- Organizer review-and-publish helper text matches.
- Item detail page: condition badge tooltip shows grade letter (e.g. "Like New (S). No signs of wear…").
- (S595 carryover) `/sales/[saleId]/treasure-hunt-qr/progress` loads, `[clueId]` without `?via=qr` stays in preview mode, QRScannerModal appends `?via=qr`.

---

## Pending Patrick Actions

| Action | Why | Blocking? |
|--------|-----|-----------|
| Push block above | Combined S595 + S597 code + wrap docs | Yes |
| Condition-rating live smoke test | Verify S597 copy synced + FAQ merged | Yes (FIRST action S598) |
| Treasure hunt Chrome QA | S595 carryover | No |
| Advisory outreach drafts | 28 Gmail drafts ready — send 1–2/day | No |
| Vercel redeploy without build cache | Mode 1 eBay token returns 500 (not blocking cron) | No |
| Spot-check FAQ pricing % | S 80–100 / A 60–80 / B 40–60 / C 25–40 / D 10–25 — verify before beta | No |

---

## P2 Bug to Dispatch

**Tier Lapse Banner (P2):** Banner shows red + has X dismiss button. Spec says sticky amber. Also shows "Your Plan: PRO" card alongside the lapse warning (contradictory). Needs dev fix before beta.

---

## QA Queue Remaining

| Feature | Status | Notes |
|---------|--------|-------|
| S597 condition rating sync + FAQ merge | Pending push + Chrome QA | First thing in S598 |
| Treasure hunt progress page | Pending push + Chrome QA | S595 carryover |
| Treasure hunt via=qr guard | Pending push + Chrome QA | S595 carryover |
| ConfirmDialog smoke test | UNVERIFIED | Need deletable consignor/location |
| #278 Treasure Hunt Pro | Blocked | Needs Hunt Pass + live QR scan |
| #268 Trail Completion XP | Blocked | Karen's trail has 0 stops |
| #281 Streak Milestone XP | Blocked | Needs 5 real consecutive days |
| #251 priceBeforeMarkdown | Blocked | Needs item with markdownApplied=true |
| RankUpModal dark mode | Blocked | Can't trigger rank artificially |
| S529 mobile nav rank | Pending | Mobile viewport test |
| S550 Affiliate signup (?aff=) | Pending | Chrome signup flow test |
| #52 Encyclopedia detail page | Pending | Railway redeploy d77cff42 |

---

## Carry-over

- **Advisory outreach:** 28 Gmail drafts queued. Send 1–2/day using patrick@finda.sale Send As alias.
- **eBay sync:** Tasks #9/#10 pending if not dispatched.
- **Railway MCP:** Recovered again this session via reboot (recurrence pattern). Two more stable sessions = safe to retire CLI binary fallback.
- **Sandbox stability:** Linux VM workspace was completely unavailable for entirety of S597 (every bash call returned "Workspace unavailable"). File tools, GitHub MCP, and Railway MCP all worked. If pattern recurs, may warrant root-cause investigation.
