# Patrick's Dashboard — S596 ✅ COMPLETE

## Status: Ops + outreach session. S595 code still pending push (now includes S596 wrap docs).

---

## S595 QA Results

| Feature | Result | Screenshot |
|---------|--------|------------|
| AvatarDropdown CONNECT → Explorer's Guild | ✅ PASS | ss_6465qdcim |
| /admin/items pagination (page 2) | ✅ PASS | ss_3396hados |
| /admin/bid-review (S566 fix) | ✅ PASS | ss_0420q1hkk |
| Organizer Insights for Alice (S545 fix) | ✅ PASS | ss_2893wh51g |
| Print Kit 13 items (S543 fix) | ✅ PASS | ss_4080t1wlc |
| /organizer/earnings (S550 fix) | ✅ PASS | ss_6291mzhzi |
| /organizer/calendar (S550 fix) | ✅ PASS | ss_3710aljj0 |
| Settlement Receipt PDF (S566 + S569 fix) | ✅ PASS | ss_45016j87d |
| #75 Tier Lapse Logic | ⚠️ PARTIAL — banner red + dismissible, "Your Plan: PRO" contradicts lapse | ss_0854b0log |
| ConfirmDialog smoke test | UNVERIFIED — no deletable data in test account | — |

---

## ⚡ Do This Now

**Step 1 — Push S595 + S596 wrap (combined block):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/sales/[id]/treasure-hunt-qr/progress.tsx
git add "packages/frontend/pages/sales/[id]/treasure-hunt-qr/[clueId].tsx"
git add packages/frontend/components/qr-scanner/QRScannerModal.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: treasure hunt progress page + via=qr auto-claim guard + S596 wrap [wrap S595/S596]"
.\push.ps1
```

---

## Pending Patrick Actions

| Action | Why | Blocking? |
|--------|-----|-----------|
| Push block above | S595 code + S596 wrap docs | Yes |
| After push: Chrome QA treasure hunt progress page | Verify `/treasure-hunt-qr/progress` loads (not "Clue not found") | No |
| Advisory outreach drafts | 28 Gmail drafts ready — send 1–2/day from patrick@finda.sale (click To field to reveal From dropdown) | No |
| S591 eBay sync: click "Sync eBay Inventory" | Still pending from S591 if not done | No |
| Vercel redeploy without build cache | Mode 1 eBay token returns 500 — NOT blocking cron | No |

---

## P2 Bug to Dispatch

**Tier Lapse Banner (P2):** Banner shows red + has an X dismiss button. Spec says sticky amber. Also shows "Your Plan: PRO" card alongside the lapse warning (contradictory). Needs dev fix before beta. Dispatch to findasale-dev when ready.

---

## QA Queue Remaining

| Feature | Status | Notes |
|---------|--------|-------|
| Treasure hunt progress page | Pending push + Chrome QA | Push S595 first |
| Treasure hunt via=qr guard | Pending push + Chrome QA | Push S595 first |
| ConfirmDialog smoke test | UNVERIFIED | Need deletable consignor/location in test account |
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
- **eBay sync:** Tasks #9/#10 pending if not already dispatched
- **Railway MCP:** Now working via OAuth (resolved by system reboot). Consider retiring the Railway CLI binary hack in CLAUDE.md after a few stable sessions.
