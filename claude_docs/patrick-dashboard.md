# Patrick's Dashboard — April 10, 2026 (S433)

## ✅ Done This Session (S433) — Full Auction Overhaul

### Phase 1 — Ships with current push (no migration needed)
- **Reserve price enforcement** — Bids below reserve now rejected with clear error message including the reserve amount
- **Reserve-met badge** — Item detail page shows amber "Reserve: $X.XX (not met)" → switches to green "✓ Reserve met" as bids climb
- **Auto-close on fetch** — Auctions past their deadline automatically set `auctionClosed: true` on next page load; no more post-deadline bids
- **Outbid notifications** — When someone outbids the current high bidder, that bidder immediately gets an in-app notification with item name, new amount, and link to re-bid
- **BidModal guard** — Submit button disables with "Auction Closed" text when auction has ended

### Phase 2 — Requires migration + separate push
- **Proxy/max bidding** — Bidders set a maximum price once; system auto-bids on their behalf up to that amount against competing maxes. eBay-style.
- **Dynamic bid increments** — Replaced flat $1 increment with eBay-style tiers ($0.05 at low prices → $100 at $5000+)
- **Bid history** — Full bid log below the bid UI; shoppers see "Bidder 1, Bidder 2" (anonymized); organizers see real names
- **Soft-close / anti-sniping** — Any bid placed in the final 5 minutes extends the auction by 5 minutes; watchers notified via socket
- **Auction status badge** — Green "Active" / pulsing orange "Ending Soon" (< 5 min) / gray "Ended"
- **Background auto-close cron** — Runs every 5 minutes on the server; closes expired auctions and notifies winners without waiting for a page load
- **ADR-013 written** — Full spec in `claude_docs/architecture/ADR-013-auction-overhaul.md`

### eBay Categories (no work needed)
Audited and found it's already done. EbayCategoryPicker is in the edit-item form. Export and push both work. No additional UI changes required.

---

## ⚠️ Action Required — Migration First, Then Push

**Step 1: Run migration (Phase 2 won't work without this)**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**Step 2: Push all files**
```powershell
git add packages/backend/src/controllers/itemController.ts
git add packages/frontend/pages/items/[id].tsx
git add packages/frontend/components/BidModal.tsx
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260410_add_max_bid_by_user/migration.sql
git add packages/shared/src/utils/bidIncrement.ts
git add packages/frontend/components/BidHistory.tsx
git add packages/backend/src/jobs/auctionAutoCloseCron.ts
git add packages/backend/src/index.ts
git add claude_docs/architecture/ADR-013-auction-overhaul.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S433: Full auction overhaul — proxy bidding, reserve enforcement, soft-close, bid history, auto-close cron"
.\push.ps1
```

---

## 🟡 Next Session — S434: Pricing page + feature gating + placeholder sweep

**⚠️ Before pushing S433:** Dispatch `findasale-architect` to audit the 3 auction cron files (`auctionCloseCron.ts`, `auctionJob.ts`, `auctionAutoCloseCron.ts`) — confirm no double-close before Railway deploy.

### Feature Gating Bugs to Fix
| Issue | Current State | Correct State |
|---|---|---|
| Command Center | Listed under PRO | TEAMS-only |
| Appraisals | PRO gate | Ala Carte (confirmed — backend comment says "PAID_ADDON maps to PRO until addon billing is wired") |
| Line Queue + Flip Report | Both PRO and Ala Carte | Patrick to decide: which tier(s)? |

### Placeholder Pages (nav links that go nowhere)
All need a decision: build now / hide from nav / show "Coming Soon" gate:
`/organizer/promote` · `/organizer/send-update` · `/organizer/photo-ops` · `/organizer/qr-codes` · `/organizer/print-kit` · `/organizer/checklist` · `/organizer/earnings` · `/organizer/line-queue` · `/organizer/calendar` · `/organizer/staff`

### Routing Bugs
- `/plan` link lands in the middle of the pricing page — anchor positioning bug
- "Add Items" routes to dashboard instead of add-items form

### Feature/UX Issues
- **Offline Mode** — Functional? No visible sync indicator. Users won't know if data needs syncing.
- **`/organizer/item-library`** — Broken (error or blank)
- **`/organizer/typology`** — Dark mode input broken; page non-functional. Worth keeping with auto-tagging?
- **Bounties** — Work as game-designed? Were they supposed to be PRO-gated?
- **Email digest page** — White background in dark mode
- **Webhooks page** — Dark mode contrast failure; needs copy explaining what webhooks are + examples (QuickBooks, Zapier)

### Patrick Decisions Needed (nav structure)
- Reputation + Reviews → combine into one page?
- Hunt Pass → move out of "Explore & Connect" to more prominent location
- "Explore & Connect" → split into 2 nav groups?

### Auction QA (after migration runs)
Run migration → then QA reserve enforcement, reserve badge, proxy bidding, soft-close, bid history, status badge

---

## Pending QA (backlog)

| Feature | What to Test |
|---|---|
| Trail activation | Map → sale popup → "View Treasure Trail →" → amber circle markers appear |
| Trail detail page | `/trail/[shareToken]` loads (not "Trail Not Found") |
| XP on purchase | Complete a purchase → XP = purchase amount in dollars |
| Email spam | Send payment link email to Yahoo → confirm inbox not spam |
| QR code on sale page | Navigate to any sale → QR renders (not broken image) |
| iOS map geolocation | Test on iOS Safari — correct error message if denied |
| Print label | Edit item → Print Label → PDF opens, 1 page, centred layout |
| Photo upload (organizer) | Sale page → Add Photos → renders in gallery, capped at 6 |
| POS invoice flow | Load hold + misc items → Send Invoice → shopper pays via link |

---

## 🔧 Maintenance — 2026-04-10

**STATE.md compacted (automated):** STATE.md hit the 256KB Read tool size limit (2,712 lines). The daily-friction-audit detected this and ran the records agent to archive sessions S404–S427 to `COMPLETED_PHASES.md`. STATE.md is now ~470 lines. No content lost — all session details are in COMPLETED_PHASES.md.

**Auction cron audit needed:** Three auction job files exist (`auctionCloseCron.ts` deprecated, `auctionJob.ts` authoritative, `auctionAutoCloseCron.ts` new from S433). Dispatch `findasale-architect` before next deploy to confirm no double-close logic running.

**Stripe Connect webhook (P2, unresolved since S421):** Items aren't being marked SOLD + Purchase records aren't created after POS card payments. Needs a one-time Stripe Dashboard config — see Standing Notes in STATE.md.
