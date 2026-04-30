# Patrick's Dashboard — S599 ✅ COMPLETE

## Status: Watermark feature shipped end-to-end + 5 P1/P2 fixes + 4 mid-session hotfixes + Chrome QA verified.

---

## S599 Summary

**Watermark feature (TEAMS-only) — fully wired:**
- Schema: `Organizer.removeWatermarkEnabled` + migration deployed
- Helper: `canRemoveWatermark(organizer)` default-deny utility
- API: GET + PATCH `/api/organizers/settings/watermark` with TEAMS gate (403 for non-TEAMS)
- UI: toggle on `/organizer/settings` Appearance tab (TEAMS sees toggle, others see upgrade gate)
- 5 existing watermark surfaces gated (eBay/Facebook/Craigslist/EstateSales/Amazon CSV exports, social posts, share cards)
- Gaps filled: Amazon CSV, bulk Organizer ZIP photos, iCal description footer
- PDF watermarks per locked policy: Print Kit + Marketing Kit (full footer); Earnings + Settlement Receipt (light footer); Brand Kit Print intentionally unwatermarked
- OG image gating wired in `lib/ogImage.ts` + Sale/Item OG components

**Round 1 P1/P2 fixes (all pushed):**
- SettlementWizard URL + response shape (DonationModal can now fetch unsold items)
- Reservations `/shopper` URL + array response handling (My Holds page works)
- track-visit URL prefix (`POST /api/points/track-visit` returns 200 — XP awarded on sale visits)
- Tier Lapse banner amber + sticky (no dismiss button)
- Hydration #418 systematic fix across 6 components (NotificationBell, AvatarDropdown, FollowButton, FollowOrganizerButton, SaleWaitlistButton, QuickReplyPicker)
- Hunt Pass status canonical source (reads `xpProfile.huntPassActive` not stale JWT)

**Mid-session hotfixes (all pushed):**
1. `@findasale/shared` import broke Railway Docker (workspace alias doesn't resolve in production runtime — same trap as S574). Fixed by inlining `tier === 'TEAMS'` check in `watermarkPolicy.ts` + `watermarkController.ts`.
2. Vercel build failed reading `user?.subscriptionTier` (field on Organizer not User). Fixed by populating `organizerTier` state from existing `/organizers/me` fetch.
3. Vercel build failed reading `ogHead.organizer` (JSX element not data). Fixed to `ogData?.organizer` + added organizer to SSR ogHead.
4. Watermark URL singular vs plural mismatch (`/organizer/...` vs `/organizers/...`). Fixed both call sites.

**Chrome QA verified:**
- Alice (TEAMS) sees toggle, can flip on, persists to DB across reload (ss_4138714pq)
- Bob (PRO) PATCH attempt → 403 "Watermark removal requires the Teams plan."
- Tier Lapse banner amber + no dismiss button + zero red classes anywhere
- track-visit POST returns 200 with proper response body

---

## ⚡ Do This Now

Push wrap docs:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "wrap: S599 — watermark feature TEAMS gating end-to-end + 5 P1/P2 fixes + 4 hotfixes + Chrome QA"
.\push.ps1
```

---

## Issues Found in S599 — Queued for S600 Dispatch

### P1 (pre-existing, NOT introduced by S599)

| Bug | Notes |
|-----|-------|
| **Items page 500** | All `/items/{id}` URLs return 500. Verified pre-S599 deployment same 500 — not a regression. Vercel logs truncate `⨯ file:///var/task/node_mod...SyntaxError...data:image`. Worked at S572 per STATE.md. **Dispatch 1 in next session.** Open Vercel dashboard for full stack trace OR reproduce locally with `pnpm dev`. |

### P2 (introduced and partially fixed in S599)

| Bug | Notes |
|-----|-------|
| **Tier Lapse plan card NOT amber** | Banner is correct (amber sticky no-dismiss). Plan card next to it still teal/cyan when lapsed, copy reads "Scale with your team — TEAMS is $79/mo" — directly contradicts banner. Dev agent claimed fix; production shows otherwise. **Dispatch 2 in next session.** Small fix — apply amber gradient + change copy when `isLapsed=true`. |
| **Sales pages SSR OG meta missing** | `/sales/[id]` HTML has no per-sale `og:image`/`og:title`/`og:description`. SaleOGMeta renders post-mount only — FB/iMessage scrapers don't see it. Watermark gating wired into SaleOGMeta is moot until SSR renders. **Dispatch 3 in next session.** Pattern after `items/[id].tsx`: add getServerSideProps + render SaleOGMeta in pre-mount return path. |

---

## Pending Patrick Actions

| Action | Why | Blocking? |
|--------|-----|-----------|
| dev-environment skill Neon URL fix | Flagged 5x now — Neon decommissioned S264, skill still has old URL. skill-creator + present_files install button. | No |
| eBay backfill 96 stuck items | Click "Sync eBay Inventory" on /organizer/settings (eBay tab). Verify via SQL in STATE.md. | No |
| Vercel env vars (eBay token Mode 1) | EBAY_CLIENT_ID/SECRET not reaching function. Confirm values, redeploy without build cache. Mode 2 cron unaffected. | No |
| Advisory outreach | 28 Gmail drafts queued. Send 1–2/day using patrick@finda.sale Send As alias. | No |

---

## QA Queue

| Feature | Status | Notes |
|---------|--------|-------|
| S599 Hydration #418 click test | Pending Chrome QA | Code-verified, visual click test deferred |
| S599 Hunt Pass status (Karen) | Pending QA | Needs stale-JWT scenario unlikely on prod seed |
| S599 PDF watermark visual | Pending Chrome QA | Generate one of each (Print Kit, Marketing, Earnings, Settlement) as TEAMS toggled-on vs SIMPLE |
| S599 iCal footer | Pending Chrome QA | Trigger AddToCalendar, open .ics, confirm footer in DESCRIPTION |
| S599 DonationModal end-to-end | Pending Chrome QA | Needs sale with unsold items + active settlement |
| S599 Holds /shopper end-to-end | Pending Chrome QA | Needs active hold setup |
| S598 dark mode modals | Pending Chrome QA | 8 components |
| S598 mobile overflow | Pending Chrome QA | admin/items + shopper/history |
| S598 error states | Pending Chrome QA | dashboard + edit-sale |
| S598 Wishlist rename | Pending Chrome QA | visual scan across pages |
| S597 condition rating sync + FAQ merge | Pending Chrome QA | From S597 |
| Treasure hunt progress page | Pending Chrome QA | S595 carryover |
| ConfirmDialog smoke test | UNVERIFIED | Need deletable consignor/location |
| #278 Treasure Hunt Pro | Blocked | Needs Hunt Pass + live QR scan |
| #268 Trail Completion XP | Blocked | Karen's trail has 0 stops |
| #281 Streak Milestone XP | Blocked | Needs 5 real consecutive days |
| RankUpModal dark mode | Blocked | Can't trigger rank artificially |
| S529 mobile nav rank | Pending | Mobile viewport test |
| #52 Encyclopedia detail page | Pending | Railway redeploy d77cff42 |

---

## Carry-over

- **Advisory outreach:** 28 Gmail drafts queued. Send 1–2/day using patrick@finda.sale Send As alias.
- **eBay sync:** Click "Sync eBay Inventory" after deploy to re-import 96 items with null ebayListingId.
- **Sandbox stability:** S597 + parts of S599 had VM workspace unavailable. File tools + GitHub MCP + Vercel MCP + Railway MCP all worked normally. Pattern continues — flag for investigation if it persists across more sessions.
