# FindA.Sale Monthly Digest — April 2026
**Generated:** 2026-04-01 (automated — findasale-records)
**Period covered:** 2026-03-28 through 2026-04-01 (end-of-sprint flush)
**Sessions in period:** S321 through S366 (~45 sessions, high-velocity sprint)

---

## What Shipped This Month

### Frontend

**Dashboard (Complete Ground-Up Redesign)**
- Organizer dashboard rebuilt with 3-state detection: State 1 new organizer (welcome hero, 3-step path), State 2 active sale (Sale Status Widget with urgency tags, Next Action Zone, Real-Time Metrics Panel), State 3 between sales (congratulations + archive). Old nav-dump layout fully replaced.
- Shopper dashboard rebuilt: state-aware hero for new vs. returning shoppers, Rank Progress Card with per-rank formulas (Initiate→Scout→Ranger→Sage→Grandmaster), Streak widget, Hunt Pass CTA (hidden when active).
- Dashboard State 2 wired to live stats API (`/api/organizers/stats`) — items, visitors, holds, sold. Earnings/payout alert when cashFeeBalance > 0.

**Navigation**
- Full dual-role dedup fix: Shopper Dashboard no longer hidden for organizer+shopper users.
- Icons on all nav items (amber organizer / indigo shopper / purple Pro Tools / red Admin).
- Mobile hamburger now fully mirrors desktop collapsibles.
- Webhooks moved to TEAMS-gated "Developer Tools" section.
- Brand voice corrections: Payouts → Earnings, Typology Classifier → Item Tagger.
- Coming Soon badges added: Sale Hubs, Virtual Queue, Trades.

**Camera (Major Overhaul)**
- Tiered brightness system: Tier 1 (good) = silent proceed, Tier 2 (soft) = toast + continue, Tier 3 (dark) = hard block with retake prompt. Threshold lowered to `< 15` (was `< 40`) to eliminate false positives on normal indoor lighting.
- BrightnessIndicator.tsx: live video feed brightness sampling, colored indicator in viewfinder.
- Thumbnail scroll strip: LTR, auto-scroll to newest, photos start right of shutter.
- AI tagging flow fixed: quality overlays moved inside RapidCapture, poll loop added (`pollForAI`) to update carousel badge DRAFT→PENDING_REVIEW without page reload.
- Add-mode stale closure fix: `onPhotoCapture` added to deps so 2nd photo appends correctly.
- Smart crop architecture: upload original, Cloudinary delivers per context (1:1 grid, 3:4 detail, 4:3 preview). `imageUtils.ts` updated with `getLandscape4x3Url()` and `getPortrait3x4Url()`.
- Applied consistent thumbnail transforms across ItemCard, LibraryItemCard, ItemSearchResults, ItemListWithBulkSelection, RecentlyViewed, InspirationGrid, and item detail page.

**Shopper History Consolidation**
- `/shopper/history` new page combining Purchases (list), Gallery, and Receipts into tabbed view with URL query params. Replaced 3 separate nav entries with 1.
- ReceiptCard dark mode fixed. `useLootLog` double-prefix bug fixed (`/api/api/loot-log` → `/loot-log`). Field mapping fixed throughout.

**Explorer's Guild / Gamification**
- XP earn tooltips (+5 visit, +10 scan, +25 purchase) on loyalty.tsx.
- Rank threshold display with exact XP values per rank.
- Hunt Pass CTA: 3 benefits, "Upgrade Now" button, only shown when `huntPassActive !== true`.
- Rarity Boost XP Sink UI: `RarityBoostModal.tsx` (sale picker, 15 XP cost). `loyalty.tsx` Coming Soon replaced with functional card.
- Achievement badges now appear on dashboard, loyalty, and explorer-passport pages (not just `/shopper/achievements`).
- Leaderboard: top-3 userBadges included in response, stray-0 guard on totalItemsSold display.

**Hold-to-Pay**
- `HoldToPayModal.tsx` (organizer — send invoice), `ClaimCard.tsx` (shopper dashboard amber/gold), `HoldInvoiceStatusCard.tsx` (item detail). Items and shopper dashboard updated.
- `OrganizerHoldsPanel.tsx` and `LeaveSaleWarning.tsx` built and wired into organizer dashboard and sale detail page.

**Bug Fixes (Feature-Specific)**
- #37 Sale Alerts: notification inbox tab filter fix, in-app organizer notification on hold placed.
- #41 Flip Report: null-safety on bestCategory + division-by-zero guard. Ownership verified.
- #48 Treasure Trail: detail page 401 fix (bare axios → auth-aware `api` lib). Double `/api/` prefix fixed.
- #46 Typology Classifier: CSV import Zod empty string → undefined pre-processing. UI refresh after Classify.
- #62 Digital Receipts: queries Purchase model (PAID status) directly, not empty DigitalReceipt table.
- #80 Purchase Confirmation: `/purchases/[id].tsx` 400-line page with hero, item details, pickup info, auction buyer premium.
- #89 Print Kit: frontend endpoint corrected from `/organizer/sales/{id}/print-kit` to `/organizers/{id}/print-kit`.
- #149 Remind Me by Email: copy fixed, toggle-off "Cancel Reminder" state added.
- #184 iCal: relative path replaced with `NEXT_PUBLIC_API_URL`.
- #7 Referral: missing return statements before `res.json()` fixed (API was hanging silently, showing 0).
- #124 Rarity Boost: functional UI built for existing backend endpoint.
- Edit-sale: field-saving bugs resolved (Zod schema stripping, `notes`/`treasureHuntEnabled` added), dark mode pass, PRO gate removed from SIMPLE users on Review & Publish.
- Desktop nav search (layout, Escape/blur collapse).
- Map sale type filter pills.
- Edit-sale cover photo section (SaleCoverPhotoManager.tsx).

---

### Backend

**Hold & Notification System**
- `sendHoldStatusToShopper()` in saleAlertEmailService.ts: email + in-app notification on approve/cancel/extend/release.
- Organizer gets in-app notification when a hold is placed (was email-only).
- `itemId @unique` blocking new holds after cancellation: fixed with `deleteMany` of stale CANCELLED/EXPIRED records inside placeHold transaction.
- Batch extend: now uses rank-based `getHoldDurationMinutes()` instead of hardcoded 48h.

**Hold-to-Pay APIs**
- POST `/reservations/:id/mark-sold` (bundled Stripe Checkout link).
- GET `/reservations/my-invoices`, GET `/invoices/:invoiceId`, GET `/items/:itemId/invoice-status`.
- POST `/reservations/:id/release-invoice`.
- Stripe webhook handlers: `checkout.session.completed` → PAID + XP, `charge.failed` → retry.

**Explorer's Guild Phase 1**
- Scan cap: 100 XP/day with duplicate scan prevention.
- Visit XP: POST `/api/sales/:id/visit`, once per sale per day.
- Hunt Pass 7-day trial endpoint.
- Sage threshold: 4000 → 2500 for beta.

**Revenue/Metrics API (#225)**
- GET `/api/organizers/stats`: revenue (lifetime, current, this-month), item counts, active hold count.

**XP Profile (#227)**
- GET `/api/xp/profile` service response shape corrected. GRANDMASTER threshold fixed (10000 → 5000).

**Auction Win Phase 1 (#174)**
- `auctionJob.ts`: reserve price check — if reserve not met, item moves to AUCTION_ENDED and organizer is notified.

**Other Bug Fixes**
- TS1127 null byte fix: `followerNotificationService.ts` + `notificationInboxController.ts` had null bytes appended from prior MCP pushes. Global null byte sweep run across all .ts/.tsx files.
- Password reset email fix (authController.ts).
- `estimatedValue` → `price` TS fix in userController.ts. `name` → `businessName` in routes/users.ts.
- Homepage FTS wired to `/api/search?q=...` endpoint (was client-side only).

---

### Database

- **HoldInvoice model + InvoiceStatus enum**: migration `20260330_add_hold_invoice` deployed to Railway.
- **Explorer's Guild schema**: SaleCheckin + OrganizerHoldSettings models.
- **Shopper Profile fields** (#200): `profileSlug @unique`, `purchasesVisible`, `collectorTitle` — migration `20260330_add_shopper_profile_fields` deployed.
- **Sale.notes field**: migration `20260328_add_sale_notes` deployed.
- **Pre-wire fields** (#226): `persistentInventory`, `masterItemLibraryId`, `consignor` relation on Item — migration `20260330_add_item_prewire_fields` deployed.
- **Sourcebook + Prelaunch** (#Guild items 6 & 7): `SourcebookEntry` model, `Sale.prelaunchAt DateTime?` — migration `20260330_add_sourcebook_and_prelaunch` deployed.
- **ExplorerProfile decision resolved** (#84): all gamification fields already on User model — no schema change needed.

---

### UX / Design

- `findasale-ux` skill fully rewritten with JTBD (Job-to-be-Done) framework. 4 mandatory gates added: JTBD gate, Code-First gate, Action-First Section rule, No-Redundancy check.
- Dashboard design brief (5-part spec) written and implemented.
- Photo capture protocol (9-shot sequence, 3-tier lighting, AI feedback copy, 12 item-type guides).
- Organizer guidance spec (tooltip library for 20+ features, 3-screen onboarding modal, error message rewrites, Explorer's Guild rank badges on holds).
- Smart crop architecture locked: upload original, Cloudinary delivers per context.
- `TooltipHelper.tsx` (new): floating tooltip, dark mode, accessible.
- `OrganizerOnboardingModal.tsx` (new): 3-screen, localStorage-gated.

---

## ⚠️ Stale Items Found

### Pending Patrick Pushes (Action Required)

The following items have been built and verified but are sitting in local working tree and have NOT been pushed to GitHub. These are not new discoveries — they've been in STATE.md as pending Patrick actions for 1–2 days. Flagging here for visibility.

1. **Feature #121 wiring** (OrganizerHoldsPanel.tsx + LeaveSaleWarning.tsx into dashboard + sale detail page) — push block provided in S364 Current Work section.
2. **#37 notifications.tsx** tab styling fix — pending since S359.
3. **#80 userController.ts** — edited locally, needs push per S357 carry-over note.

### Blocked/Unverified Queue (Aging Items)

The following items in the `## Blocked/Unverified Queue` are estimated 3–4 weeks old (added around S312–S326, which based on session velocity are ~25–30 days back):

| Feature | Age Est. | Status |
|---|---|---|
| #143 PreviewModal onError (Cloudinary 503 fallback) | ~4 weeks | ACCEPTABLE UNVERIFIED — intentional, can't trigger 503 in prod |
| #143 AI confidence display — camera mode | ~4 weeks | Needs real device camera test. Cannot verify in Chrome MCP |
| Single-item publish fix (S326) | ~3 weeks | Needs camera-captured draft item to verify |

**Recommendation:** The PreviewModal onError item can be promoted to ACCEPTED UNVERIFIED and moved out of the queue — it's a defensive fix, not a broken flow. The AI confidence and single-item publish items should stay queued until a real-device test session is scheduled.

### Next Session Section

The `## Next Session` header still says "S365" but we are on S366. Content is still actionable but should be relabeled at next wrap.

### DECISIONS.md

No decisions are anywhere near 3 months old. Oldest entry is 2026-03-24 — 8 days ago. No action needed.

---

## Draft Changelog (Ready for Release Notes)

```
## FindA.Sale — March/April 2026 Sprint Changelog

### New Features
- Hold-to-Pay: organizers can now send Stripe invoice links to shoppers for held items
- Treasure Trails: share curated sale routes with a public link
- Shopper Public Profiles: custom slug, collector title, public finds grid
- Rarity Boost XP Sink: spend 15 XP to boost a sale's rarity score
- Auction reserve price enforcement: items move to AUCTION_ENDED when reserve is unmet
- Photo Capture Protocol: 3-tier brightness guidance, 9-shot sequence, AI confidence copy
- Explorer's Guild: scan cap, visit XP, Hunt Pass trial, Sage threshold lowered for beta
- Revenue & Metrics API: organizer stats (revenue, items, visitors, holds) live on dashboard

### Improvements
- Dashboard completely redesigned for both organizers and shoppers — state-aware layouts
- Camera UI overhauled: thumbnail strip, brightness indicator, AI badge polling, smart crop
- Navigation rebuilt: dual-role support, icons, mobile/desktop parity, TEAMS developer tools
- Shopper history consolidated: purchases, receipts, and gallery in one page
- Explorer's Guild loyalty page: XP earn guide, rank thresholds, Hunt Pass benefits
- Achievement badges now visible on dashboard, loyalty, and explorer passport

### Bug Fixes
- Sale Alerts: tab filter fixed, in-app notification on publish now fires
- Flip Report: null-safety + division-by-zero guard, ownership enforcement
- Digital Receipts: now queries real purchase records (PAID status)
- Purchase Confirmation page: full page with item details, pickup info, status
- Print Kit: endpoint path corrected
- iCal export: route ordering fixed, now generates correctly
- Referral dashboard: API response was hanging — fixed
- Shopper history: field mapping, dark mode, double-prefix API path
- Leaderboard: badge data included, stray-0 guard on sold count
- Hold placement: no longer blocked by stale cancelled/expired hold records
- Batch hold extend: now uses rank-based duration instead of hardcoded 48h
- Null bytes stripped globally from all TypeScript files (was causing TS1127 Railway build errors)
- Edit-sale: field saving fixed, PRO gate removed for SIMPLE users on item publish
```

---

## Next Month Focus (from STATE.md "## Next Session")

Based on the active S366 thread and pending QA backlog:

1. Camera mobile verification: BrightnessIndicator visible, face detection overlay, Tier 2/3 flows on real mobile viewport
2. QA backlog: #37 Sale Alerts (full flow), #199 User Profile dark mode, #58 Achievements, #29 Loyalty Passport, #131 Share Templates, #213 Hunt Pass CTA
3. #80 and #37 pending pushes need to deploy and be browser-verified
4. Social fields on public organizer profile — not verified rendering at `/organizers/[id]`
5. #177 Buy Now modal UX gap — needs spec before dev

---

## Late-April Sprint (S537–S543) — Archived from STATE.md 2026-04-23

**S537 (2026-04-21, COMPLETE):** Infrastructure + housekeeping session. Beta badge added to Layout.tsx header (desktop + mobile). GitGuardian credential exposure remediated: Railway DB password rotated, hardcoded credential removed from committed CLAUDE.md, stored in private global mnt/.claude/CLAUDE.md (not in git) and packages/database/.env (gitignored). SEO: www → non-www permanent redirect added to next.config.js, global canonical URL tag added to _app.tsx. CLAUDE.md §7 parallel dispatch HARD RULE added. Railway CLI v4.40.2 installed with project token, binary stored at mnt/.claude/bin/railway (persistent), token at mnt/.claude/railway.env. Use CLI for all Railway ops — bypass OAuth entirely.

**S538 (2026-04-21, COMPLETE):** Shopper video pages — full rebuild from scratch with correct rank icons 🧭🔍🎯✨👑 and correct XP values from production tables. guild-xp-ad.html (1,423 lines), shopper-video-ad.html patched, hunt-pass-video-ad.html (1,268 lines) + wrapper, haul-post-video-ad.html (1,329 lines) + wrapper, treasure-trails-video-ad.html (1,030 lines) + wrapper. Root cause of prior failure: agents read rank icons from game design SKILL.md instead of guild-primer.tsx directly.

**S539 (2026-04-21, COMPLETE):** Nav parity + XP achievement bug + create-sale overhaul. AvatarDropdown.tsx + Layout.tsx mobile nav fixed to role-conditional settings routing. Critical XP bug: achievementService.ts `!== null` → `!= null` (strict vs loose) was marking all new users "already unlocked" and skipping all XP awards. XP rank now uses lifetimeXpEarned. create-sale stripped to lightweight first step. Business name copy updated.

**S540 (2026-04-22, COMPLETE):** `/coupons` becomes unified XP-spend hub. `/shopper/loyalty` reduced 636 → 16 lines (redirect stub). Shopper "Rewards" nav link added at 4 locations. Rarity Boost migrated to /coupons shopper section. Dashboard duplicate AchievementBadgesSection removed. 6 orphan /shopper/loyalty refs retargeted. 11 files modified.

**S541 (2026-04-22, COMPLETE):** QA-only session. 6 Chrome-verified ✅ (Rarity Boost, organizer coupons view, loyalty redirect, referrals page, appraisals submit, early-access-cache). P0 found: print kit 500 (Decimal serialization). P1 found: Brand Kit PDFs broken. Both fixed in S542/S543.

**S542 (2026-04-22, COMPLETE):** Cart merge + nav restructure + polling/spam fixes. CartDrawer was completely orphaned (never rendered). Merged into unified CartDrawer wired to CartContext. Price inconsistency fixed (hold prices dollars vs cents). Hold expiry toast loop fixed. 429s on /reservations/my-holds-full fixed (double invalidateQueries+refetch removed). Nav: clock→cart icon, Explore▾ dropdown, Pricing moved, ThemeToggle → AvatarDropdown, search absolute-positioned. BottomTabNav: Calendar→Trending, Wishlist→Explore. 8 files.

**S543 (2026-04-22, COMPLETE):** Fixes + smoke test + Hunt Pass audit. S542 Chrome-verified: cart drawer ✅, Explore▾ ✅, ThemeToggle ✅. Print kit P0 fixed (getDrafts Decimal serialization in itemController.ts). P2 batch: ActionBar Trails href, HP badge, RankHeroSection Scout boundary. guild-primer rank journey rewritten to match RankHeroSection.tsx (was showing unbuilt perks). 6 files.

---

*Automated digest. Generated by findasale-records scheduled task — 1st of each month at 9:00am.*
