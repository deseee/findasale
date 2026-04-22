# Patrick's Dashboard — S540 Complete

## What Happened This Session

S540: Page audit → `/coupons` becomes the unified XP-spend hub. `/coupons` was already role-aware but was organizer-only in the nav — shoppers couldn't reach their own section of the page. Meanwhile `/shopper/loyalty` duplicated the rank/XP UI from `/shopper/explorer-profile` and had stale +3/+5/+10 XP values, yet held the only Rarity Boost entry point. Fix: promoted `/coupons` to the hub for both roles, migrated Rarity Boost over, reduced `/shopper/loyalty` to a 16-line redirect stub, removed the duplicate Achievements widget from the dashboard (still lives on `/shopper/explorer-profile`), and retargeted 6 orphan `/shopper/loyalty` references. Added shopper "Rewards" nav links in 4 places.

## Done This Session

| What | Details |
|------|---------|
| /coupons Rarity Boost migration | Added `<RarityBoostModal>` named import, Sparkles icon, indigo/purple gradient card gated `{!isOrganizer && ...}`. Button disabled when `spendableXp < 15`. onSuccess invalidates xp-profile query. |
| /shopper/loyalty redirect stub | Replaced 636 lines with 16-line `useEffect(router.replace('/coupons'))` — deep links, email refs, bookmarks preserved. |
| Layout.tsx Rewards links (3) | Desktop sidebar Connect (~line 553), mobile in-sale tools (~line 1318), mobile shopper-only nav (~line 1537). Ticket icon, indigo-500. |
| AvatarDropdown.tsx Rewards link | Shopper branch `{!isOrganizer && ...}`, after Explorer's Guild (~line 1086). Ticket icon, indigo-500. |
| Dashboard Achievements dedup | Removed `<AchievementBadgesSection>` block + `useMyAchievements` import + `achievementsData` query. Still on /shopper/explorer-profile. |
| ActivitySummary.tsx | Streak Points card href: /shopper/loyalty → /coupons (XP-spend context). |
| ExplorerGuildOnboardingCard.tsx | "View Your Rank & Progress" CTA: /shopper/loyalty → /shopper/explorer-profile (rank context, not coupons). |
| ranks.tsx / loot-legend.tsx / league.tsx | Back links retargeted to /shopper/explorer-profile. |
| profile.tsx | Explorer Rank CTA retargeted to /shopper/explorer-profile. |

## DECISION POINT — Orphan Ref Retargeting

Spec said point all orphan loyalty refs to `/coupons`. 5 of 6 had rank/passport-context labels ("View Your Rank & Progress", "Back to Loyalty Passport", Explorer Rank CTA) — semantically these belong at `/shopper/explorer-profile`, not at an XP-spend hub. Retargeted those accordingly. ActivitySummary's Streak Points card (XP-earning context) went to `/coupons` as spec intended. If Patrick wants all refs uniformly pointing to /coupons regardless of label context, flag and we'll flip them.

## Still Open

| Item | Details |
|------|---------|
| phoneVerified missing from User model | REFERRAL_FIRST_PURCHASE (500 XP) phone gate not enforced. Needs phone verification feature. |

## Still Needs Chrome QA

| Feature | Where | What to Verify |
|---------|-------|----------------|
| S540 Rewards nav link (desktop) | Desktop sidebar Connect as shopper | "Rewards" link with Ticket icon indigo-500, clicks to /coupons, shopper section renders |
| S540 Rewards nav link (mobile in-sale) | Mobile hamburger, in-sale tools section | Rewards link appears, routes to /coupons |
| S540 Rewards nav link (mobile shopper nav) | Mobile hamburger, shopper section | Rewards link appears, routes to /coupons |
| S540 Rewards nav link (dropdown) | AvatarDropdown as shopper | Rewards link in shopper branch, routes to /coupons |
| S540 Rarity Boost card (shopper, ≥15 XP) | /coupons as shopper with ≥15 spendableXp | Card visible, button enabled, click → modal opens → select sale → spend → XP -15, toast, modal closes |
| S540 Rarity Boost card (shopper, <15 XP) | /coupons as shopper with <15 spendableXp | Card visible, button disabled, "You need at least 15 XP" hint shows |
| S540 Rarity Boost hidden (organizer) | /coupons as Bob/Alice | Organizer section renders normally. Rarity Boost card MUST NOT appear. |
| S540 Loyalty redirect | Navigate /shopper/loyalty directly | Instant redirect to /coupons, no flash of old content |
| S540 Dashboard achievements dedup | /shopper/dashboard Overview tab | Achievements widget GONE. /shopper/explorer-profile still has it. |
| S540 Orphan ref hops | /shopper/ranks, /loot-legend, /league, /profile | Back/CTA links route to /shopper/explorer-profile (not /loyalty, not 404) |
| S539 nav fixes | /shopper/* as George Roberts | Settings → /shopper/settings. Host a Sale → modal. Explorer Profile icon blue. |
| S539 create-sale | /organizer/create-sale | Lightweight form, redirects to edit-sale, PRO modal fires |
| Guild Primer | /shopper/guild-primer | All expanded tables, HP column, tiered trail table, dark mode |
| #267 RSVP Bonus XP | /sales/[id] → Going as Karen | 2 XP + Discoveries notification |
| #241 Brand Kit PDFs | /organizer/brand-kit as PRO | All 4 PDF links download |
| #7 Referral Rewards | /shopper/referrals as Karen | Page loads, referral link + share |
| #228 Settlement fee % | Settlement → Receipt step | 2% NOT 200% |
| Per-sale analytics | /organizer/insights → select sale | Stat cards update |
| S529 Storefront widget | /organizer/dashboard | Copy Link + View Storefront |

## Build Status

| Service | Status |
|---------|--------|
| Vercel (frontend) | Green (S539 live) |
| Railway (backend) | Green (S539 live) |
| S540 changes | Unpushed — single push block below |

## Your Push Block — S540

```powershell
git add packages/frontend/pages/coupons.tsx
git add packages/frontend/pages/shopper/loyalty.tsx
git add packages/frontend/pages/shopper/dashboard.tsx
git add packages/frontend/pages/shopper/ranks.tsx
git add packages/frontend/pages/shopper/loot-legend.tsx
git add packages/frontend/pages/shopper/league.tsx
git add packages/frontend/pages/profile.tsx
git add packages/frontend/components/Layout.tsx
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/components/ActivitySummary.tsx
git add packages/frontend/components/ExplorerGuildOnboardingCard.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S540: /coupons becomes unified XP-spend hub

- /coupons Rarity Boost card added (shopper-gated) via RarityBoostModal
- /shopper/loyalty reduced to 16-line redirect stub to /coupons
- Rewards nav link added: desktop sidebar, mobile in-sale, mobile shopper nav, AvatarDropdown shopper branch
- Dashboard Achievements widget removed (dedup — still on /shopper/explorer-profile)
- 6 orphan /shopper/loyalty refs retargeted (5 to /shopper/explorer-profile, 1 to /coupons)
- Preserves deep links, no feature removals, role-aware rendering"
.\push.ps1
```

## QA Scenarios for S541 (post-deploy)

Sequential Chrome QA — one feature per dispatch, evidence per PRE-VERIFICATION GATE. Run only after Vercel green.

**Scenario 1 — Shopper nav Rewards link visibility (all 4 locations)**
- Login as Karen (shopper).
- Desktop: look at left sidebar Connect section. Verify "Rewards" link appears with Ticket icon (indigo-500) near Explorer's Guild.
- Mobile viewport (375px): open hamburger. Verify Rewards appears in shopper section.
- In-sale mobile: navigate to any sale page on mobile. Verify Rewards appears in in-sale tools.
- AvatarDropdown: click avatar (shopper). Verify Rewards in shopper dropdown branch.
- Evidence: screenshot each of the 4 locations.

**Scenario 2 — /coupons Rarity Boost card (shopper with ≥15 XP)**
- Karen's spendableXp check — if <15, top up via psycopg2 Railway DB.
- Navigate /coupons as Karen. Scroll to shopper section.
- Verify Rarity Boost card renders with gradient indigo/purple background.
- Click "Activate Rarity Boost (15 XP)".
- Modal opens with sale picker.
- Select a sale, confirm spend.
- Verify: XP balance decrements by 15, success toast, modal closes.
- Refresh page, verify XP persists at new value.
- Evidence: before/after/reload screenshots.

**Scenario 3 — /coupons Rarity Boost card (insufficient XP)**
- Create/use test shopper with <15 XP (or drain Karen's spendable XP).
- Navigate /coupons.
- Verify button disabled (opacity-50, cursor-not-allowed).
- Verify "You need at least 15 XP" hint below button.
- Evidence: screenshot showing disabled button + hint.

**Scenario 4 — Organizer view of /coupons (Rarity Boost hidden)**
- Login as Bob or Alice (organizer).
- Navigate /coupons.
- Verify organizer section renders: Shopper Discount Codes + $1-off generator.
- Verify Rarity Boost card DOES NOT render anywhere on the page.
- Evidence: full-page screenshot.

**Scenario 5 — /shopper/loyalty redirect**
- Navigate directly to /shopper/loyalty as shopper.
- Verify instant redirect to /coupons.
- Verify NO flash of old loyalty content (stale XP values, duplicate rank UI).
- Evidence: after-redirect URL bar screenshot + /coupons page screenshot.

**Scenario 6 — Dashboard achievements dedup**
- Login as shopper with some achievements.
- Navigate /shopper/dashboard Overview tab.
- Verify Achievements widget is GONE.
- Navigate /shopper/explorer-profile.
- Verify Achievements widget IS STILL present.
- Evidence: screenshots of both pages.

**Scenario 7 — Orphan ref hops**
- Navigate /shopper/ranks → click back link → lands on /shopper/explorer-profile (not /loyalty, not 404).
- Navigate /shopper/loot-legend → click back link → lands on /shopper/explorer-profile.
- Navigate /shopper/league → click back link → lands on /shopper/explorer-profile.
- Navigate /profile → click "View Your Rank" CTA → lands on /shopper/explorer-profile.
- On /shopper/dashboard or onboarding flow, if ExplorerGuildOnboardingCard appears → click "View Your Rank & Progress" → lands on /shopper/explorer-profile.
- On ActivitySummary Streak Points card → click → lands on /coupons.
- Evidence: URL bar screenshot for each hop.
