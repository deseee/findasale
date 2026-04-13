# Patrick's Dashboard — Week of April 13, 2026

## What Happened This Week

**S453+S454** (2026-04-13) — Hunt Pass → real recurring subscription. Stripe go-live audit.
- **Hunt Pass is now a real Stripe Subscription** ($4.99/mo auto-renewing). Old PaymentIntent flow removed entirely. Users click "Subscribe" → redirected to Stripe Checkout → webhook activates pass. Cancel at period end supported.
- **Subscription ID persistence fixed (P0):** `stripeSubscriptionId` was never being saved → billing portal and cancel always failed. Fixed in `syncTier.ts`.
- **Pricing page endpoint fixed (P0):** `pricing.tsx` was calling the broken checkout endpoint (orphaned Stripe customers). Now correctly calls `/billing/checkout`.
- **POS product catalog guard:** New env var `STRIPE_GENERIC_ITEM_PRODUCT_ID` — when set, all POS payment links reuse one generic product instead of creating new ones per item. Keeps Stripe catalog clean.
- **pricing.tsx null byte build error fixed.**
- **Migration deployed:** `huntPassStripeCustomerId` + `huntPassStripeSubscriptionId` added to User table.

**S452** (2026-04-13) — eBay + Stripe go-live prep. Bidirectional eBay sync (both directions). Policy ID fetch post-OAuth. endEbayListingIfExists wired into all 5 SOLD paths. Phase 3 polling cron (15-min). Stripe env confirmed. **Hunt Pass is a subscription — investigation required next session.**

**S451** (2026-04-13) — Dashboard layout fixed, QR inline, broken buttons fixed:
- **⚠️ Catastrophic push recovered:** Git index desync wiped 1,708 files. Recovery complete via `git add -A`. All files restored.
- **Dashboard layout now correct:** Hero → Action Buttons → QR Panel (inline toggle) → Hunt Pass strip → Tabs → Content
- **Browse Sales removed** (was 404ing). **Button routes fixed:** Collections → `/shopper/wishlist`, Purchase History → `/shopper/history`
- **My QR button** added to action row — QR expands inline below buttons, no more separate card
- **Initiate icon:** sprout → Compass
- **Purchases tab removed** (redundant). Referral banner removed (stale). Saved items banner removed.
- **Pending Patrick decision:** Followed Brands tab — brand tracking for item alerts — keep, rename, or remove?

**S450** (2026-04-13) — Rank staleness P0 fixed, dashboard character sheet attempt, organizer badge, /shopper/ranks:
- **P0 rank staleness FIXED:** `explorerRank` removed from JWT entirely. `AvatarDropdown` now calls `useXpProfile()` API hook for fresh rank on every render. Cascade fixes in `useXpSink`, `haul-posts`, `items/[id]`, `dashboard` (5 files updated).
- **Tier names LOCKED:** Initiate → Scout → Ranger → Sage → Grandmaster (0/500/2000/5000/12000 XP). "Hunter" was wrong — Ranger confirmed.
- **AvatarDropdown XP progress bar:** XP progress bar now shows below rank badge in dropdown using `rankProgress.currentXp / rankProgress.nextRankXp`.
- **Dashboard character sheet attempt:** `RankHeroSection`, `ActionBar`, `RankLevelingHint` built. Dashboard reordered. **BUT QR code landed at position 7 (near bottom) — this is wrong. QR is how shoppers pay at POS. Fix is first job next session.**
- **`/shopper/ranks` page:** All 5 ranks shown with perks + "you are here" indicator. Linked from loyalty page.
- **Organizer Special badge:** `maxOrganizerDiscount` on SaleCard + sale detail page. 4 backend feed endpoints updated.
- **Specs created:** `claude_docs/design/RANK_PERKS_DISPLAY_SPEC.md`, `claude_docs/UX/SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md`

**S449** (2026-04-13) — Full rank perks system + P0/P1/P4 fixes:
- **Rank perks system shipped:** `rankUtils.ts`, hold enforcement (rank-based duration snapshot), wishlist cap (server-side), legendary early access (0/0/2/4/6h by rank), Hall of Fame endpoint + page, RankBenefitsCard + RankUpModal, `getRankDashboardConfig()`
- **3 new migrations:** rankUpHistory, holdDurationMinutes, legendary fields — need Railway deploy
- **Rank staleness P0:** JWT rank sync + AuthContext.updateUser() — nav rank updates live on XP earn
- **Scout Reveal:** interestedUsers returned + results panel on item page
- **Organizer discount badge:** Teal pill on item detail + subtle pill on sale listing cards
- **Haul post test data seeded:** 3 posts for Alice (IDs 2-4) — Bump Post + Haul Unboxing QA-ready
- **Two push blocks** — first (10 files, S449 P0-P4), second (20 files, rank perks system)

**S448** (2026-04-13) — QA audit + Scout Reveal bug + rank naming locked:
- Scout Reveal is a hollow stub — XP spent, toast fires, nothing revealed. Backend never queries interest data. Full flesh-out queued for S449.
- Rank naming locked: **Initiate → Scout → Ranger → Sage → Grandmaster** (prior session dropped Initiate — that was the error; Ranger was always correct)
- "Save Passport" → "Save Profile" copy fix shipped
- Stripe sandbox: COMPLETED ✅
- Bump Post + Haul Unboxing: unverified (no test haul posts in DB)

**S447** (2026-04-13) — 3 dispatch batches, all shipped ✅

**S446** (2026-04-13) — XP frontend + workspace invite flow:
- Hunt Pass cancellation wired to Stripe webhook (exploit gate closed)
- XP earning rates + coupon tiers updated across 6 frontend pages
- 3 micro-sinks: Scout Reveal (5 XP), Haul Unboxing Animation (2 XP), Bump Post (10 XP)
- Organizer-funded discounts: 200/400/500 XP = $2/$4/$5 off; blocks shopper coupon stacking
- Workspace magic link invite: `/join?token=` page, Resend email, MyTeamsCard on dashboards, welcome banner
- WorkspaceMember schema properly fixed: `organizerId` nullable, `userId` added — no ghost organizer accounts for shoppers/new users
- ⚠️ Bump Post feed sorting pending (DB field set, feed sort not yet implemented)

**S445** (2026-04-13) — XP economy redesign + workspace flows:
- 5 P0 fraud gates shipped (appraisal cap, referral gate, HP claw-back, device fingerprinting, chargeback)
- Workspace invite banner, staff delete, owner permissions gate, template fixes

**S444** (2026-04-13) — STAFF→MEMBER rename + workspace permissions fix.

---

## Action Items for Patrick

**NEW — S454:**
- [ ] **Add to Railway env vars:** `STRIPE_HUNT_PASS_PRICE_ID=price_1TLtY1LIWHQCHu75W9F23hVJ` (live)
- [ ] **Add to Railway env vars:** `STRIPE_GENERIC_ITEM_PRODUCT_ID=prod_UKZ2G21VhLJ3CE` (live)
- [ ] **Archive junk Stripe sandbox products** — keep only: Hunt Pass, FindA.Sale Teams, FindA.Sale Pro, FindA.Sale — Item Sale
- [ ] **Set up live Stripe webhooks** — live account has no webhooks yet (see S455 next session)
- [ ] **Tell Claude your real organizer email** — needed for survivor accounts before database nuke

**Carry-forward:**
- [ ] **Add `STRIPE_CONNECT_WEBHOOK_SECRET`** in Railway — Stripe Dashboard → Webhooks → Connected accounts endpoint
- [ ] **Decide: Followed Brands tab** — keep as "Brand Alerts", rename, or remove?
- [ ] **Decide: Sales Near You** — fix or remove permanently?
- [ ] **Decide: Bounties rewards — dollars, XP, or both?** (S440 open, still blocking)

---

## XP System — Current State

**Coupon tiers (locked D-XP-001):**
- 100 XP → $0.75 off $10+ | 2x/mo standard, 3x/mo Hunt Pass
- 200 XP → $2.00 off $25+ | 2x/mo standard, 3x/mo Hunt Pass
- 500 XP → $5.00 off $50+ | 1x/mo all users

**Micro-sinks (new S446):**
- Scout Reveal: 5 XP → see who flagged interest first on an item
- Haul Unboxing: 2 XP → celebratory animation on haul post share
- Bump Post: 10 XP → bumps haul post to feed top for 24h (feed sort pending)

**Organizer-funded discounts (new S446):**
- Spend 200/400/500 XP in item edit → puts $2/$4/$5 off the item
- Shopper coupon doesn't stack — best single discount wins

---

## What's Next (S455)

**P0 — Roadmap audit:** Records agent audits all sessions since last roadmap update. Every shipped feature gets logged. Patrick's human QA passes get marked ✅ Shipped & Verified.

**P1 — Survivor accounts:** Dev creates `survivor-seed.ts` with Patrick's real organizer account + 1 QA shopper. These survive the database nuke when real users onboard. Patrick provides his real email at session start.

**P2 — Live Stripe webhooks:** Register both webhook endpoints in LIVE Stripe Dashboard with correct event sets. Get signing secrets → add to Railway.

**Carry-forward:**
- QA queue (S436/S430/S431/S427/S433) — still postponed
- Bump Post feed sort (Architect sign-off in place, dev pending)
- RankUpModal — not connected to AuthContext rank-change yet
- Legendary item flag — no organizer UI yet

---

## Recent Sessions

| Session | Date | Summary |
|---------|------|---------|
| S452 | 2026-04-13 | eBay bidirectional sync: policy fetch, offer withdrawal, Phase 3 cron. Stripe env audit. Hunt Pass subscription gap flagged. |
| S451 | 2026-04-13 | Dashboard layout fix: QR inline, action buttons fixed, Compass icon, layout reordered. Catastrophic git push (1,708 files deleted) — recovered. |
| S450 | 2026-04-13 | Rank staleness P0 (JWT fix), dashboard character sheet attempt, /shopper/ranks, organizer badge, XP progress bar in nav. QR code landed wrong — fix is P0 next session. |
| S449 | 2026-04-13 | Rank staleness P0, Scout Reveal P1, discount badge P4, dashboard/perks specs, haul test data. 10 files. |
| S448 | 2026-04-13 | QA audit. Scout Reveal bug ID'd. Rank naming locked. 1-line fix. |
| S447 | 2026-04-13 | 3 dispatch batches: Early Access Cache, XP expiry, bump sort, cosmetics repricing, coupon enforcement, nav renames. |
| S446 | 2026-04-13 | XP frontend, 3 micro-sinks, organizer discounts, workspace magic link invite, WorkspaceMember schema fix |
| S445 | 2026-04-13 | XP economy redesign + 5 fraud gates + workspace invite flow |

---

## Brand Audit (still open)

- SharePromoteModal generates "estate sale" copy for ALL sale types
- Homepage meta/SEO omits flea markets and consignment
- Organizer profile meta says "Estate sales by [name]" regardless of sale type

All dispatch-ready, no decisions needed.
