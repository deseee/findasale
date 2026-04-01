# FindA.Sale Roadmap Audit Report
**Date:** 2026-03-26
**Scope:** Cross-reference roadmap.md against S290 QA retroaudit and frontend-pages-inventory-S294
**Method:** Manual verification of Chrome columns, page existence, nav status, and S290-S293 session completions

---

## 1. Features in Roadmap Marked ✅ Chrome But S290 Audit Downgraded

These roadmap items have ✅ in the Chrome column but the S290 retroaudit reclassified them as 🟡 PARTIAL, 🔴 RUBBER-STAMPED, ⛔ BLOCKED, or 🔧 FIX NOT RE-VERIFIED. Per S290 protocol, these should revert to 📋 (pending) until re-tested by orchestrator.

| # | Feature | Current Chrome | S290 Classification | Reason | Action |
|---|---------|---|---|---|---|
| 195 | Messaging (P0-A) | ✅ | 🟡 PARTIAL | Poll lag reduced but full round-trip (organizer sends → shopper receives → replies) never documented as tested | Change Chrome → 📋 |
| 172 | Stripe Connect | ✅ | 🔴 RUBBER-STAMPED | Checkout page loads, but "Stripe checkout end-to-end (test card purchase → confirmation)" explicitly flagged "must re-test next session" — never completed | Change Chrome → 📋 |
| 166 | Admin Invites | ✅ | 🟡 PARTIAL | Page loads + invite created, but no round-trip (email → recipient accepts) documented | Change Chrome → 📋 |
| 176 | Browse Sales / Homepage | ✅ | 🟡 PARTIAL | Filter pills fix applied (S288) but dependency: if QA didn't click pills, test was incomplete. Then S288 found pill bug (routing to /api/auth/logout) | Change Chrome → 📋 then re-verify |
| 178 | Item Detail Page | ✅ | 🟡 PARTIAL | Page loads ✅ but rarity badges were null for ALL items (confirmed S289 — entire DB has rarity=null). Badge rendering never seen by QA | Change Chrome → 📋 |
| 193 | Wishlists (A3) | ✅ | 🟡 PARTIAL | Page loads ✅ but wishlist add/remove workflow never documented as tested | Change Chrome → 📋 |
| 155 | Password Reset (A5) | ✅ | 🟡 PARTIAL | Page loads ✅ but email delivery never tested (no SMTP receipt confirmed) | Change Chrome → 📋 |
| 68 | Command Center (B1) | ✅ | 🟡 PARTIAL | Page loads ✅ but individual command interactions (bulk price update, batch status) never documented as tested | Change Chrome → 📋 |
| 153 | Organizer Profile Settings Tab | ✅ | 🔧 FIX NOT RE-VERIFIED | Tab nav was broken (fix: preventDefault). Fix pushed S287. Post-fix Chrome re-test NOT documented. | Change Chrome → 📋 |
| 138 | Sale Types (4 missing) | ✅ | 🔧 FIX NOT RE-VERIFIED | Only 4 types in dropdown. Fix applied (4 types added to create-sale.tsx). Pushed S287. Post-fix Chrome NOT documented. | Change Chrome → 📋 |
| 161 | Contact Form | ✅ | 🔧 FIX NOT RE-VERIFIED | Form submitted silently (no success/error). Fix: toast feedback. Pushed S287. Post-fix Chrome NOT documented. | Change Chrome → 📋 |
| 201 | Favorites / My Saves | ✅ | 🟡 PARTIAL | Page loads with empty state ✅. But save/remove workflow never documented as tested. Empty state ≠ feature works. | Change Chrome → 📋 |
| 57 | Rarity Badges | ✅ | ⛔ BLOCKED (data) | Code correct but ALL DB items have rarity=null. Seed patch applied S289 but re-seed not yet run on Railway. Can't verify rendering. | Change Chrome → 📋 |
| 50 | Loot Log | ✅ | 🟡 PARTIAL | Page loads ✅, empty state clean. But "no actual loot data to verify tracking works." No purchase history in test user. | Change Chrome → 📋 |
| 45 | Loot Legend | ✅ | 🟡 PARTIAL | Page loads, empty state. "No legendary items in DB to verify collection display" (all rarity=null). | Change Chrome → 📋 |
| 133 | Collector's League | ✅ | 🟡 PARTIAL | Page loads "No Hunt Pass holders yet." No Hunt Pass users to verify ranking displays. | Change Chrome → 📋 |
| 48 | Treasure Trails | ✅ | 🟡 PARTIAL | Page loads, empty state "No Treasure Trails Yet." No actual trail creation/navigation tested. | Change Chrome → 📋 |
| 88 | Haul Gallery (UGC) | ✅ | 🟡 PARTIAL | Page loads, empty state. "No actual haul post submitted and verified." | Change Chrome → 📋 |
| 27 | CSV Exports | ✅ | 🔴 RUBBER-STAMPED | Round 2: 404 on `/organizer/export`. Round 3: "Download triggered (no actual file accessible in test environment, but button functioned correctly)." No file actually downloaded or verified. | Change Chrome → 📋 |
| 66 | ZIP Data Export | ✅ | 🔴 RUBBER-STAMPED | Same issue as #27 — button works but file not verified. S290 Patrick verified via CSV upload, so this one may be recoverable. Needs manual re-test. | Keep Chrome ✅ (Patrick verified) OR Change to 📋 |
| 125 | Inventory Syndication Export | ✅ | 🔴 RUBBER-STAMPED | Same as #27/#66 — button visibility ≠ file download verified | Change Chrome → 📋 |
| 60 | Premium Tier Bundle | ✅ | 🟡 PARTIAL | Marked Chrome ✅ but never explicitly tested in audit. Empty-state feature. | Change Chrome → 📋 |
| 46 | Treasure Typology Classifier | ✅ | 🟡 PARTIAL | No explicit Chrome test in audit. Unknown verification level. | Change Chrome → 📋 |
| 63 | Dark Mode + Accessibility | ✅ | 🟡 PARTIAL | No explicit Chrome test in audit docs. Unknown verification. | Change Chrome → 📋 |
| 187 | City Pages | ✅ | 🟡 PARTIAL | `/city/grand-rapids` works ✅ but `/cities` shows empty state despite 16 active sales (P1 bug found). Not fully working. | Change Chrome → 📋 |
| 52 | Estate Sale Encyclopedia | ✅ | ⛔ BLOCKED | "Route not found in nav" per audit. Never tested. | Change Chrome → 📋 |
| 18 | Post Performance Analytics | ✅ | ⛔ BLOCKED (unclear) | No explicit test in audit. Unknown status. | Change Chrome → 📋 |

**Total downgrades needed:** 26 items from ✅ to 📋

---

## 2. Features NOT in Roadmap But Pages Exist in Frontend

These are implemented pages with no corresponding roadmap entry. Need classification: are they missing roadmap items or abandoned pages?

| Page Path | Roadmap Match? | Suggested Roadmap # | Category | Action |
|-----------|---|---|---|---|
| `/workspace` | ⚠️ Partial | #13 TEAMS Workspace | Already in roadmap as #13 | OK |
| `/workspace/[slug]` | ⚠️ Partial | #13 TEAMS Workspace | Part of #13 | OK |
| `/shopper/dashboard` | ✅ | Multiple (loyalty, trades, etc) | Dashboard hub | OK |
| `/organizer/dashboard` | ✅ | Multiple | Dashboard hub | OK |
| `/organizer/settings` | ⚠️ | #153 (organizer profile) | Settings — need to verify if separate from profile | Clarify |
| `/organizer/add-items/[saleId]/review` | ✅ | #142 (photo upload workflow) | Part of item intake | OK |
| `/organizer/checklist/[saleId]` | ✅ | #148 (sale checklist) | Already in roadmap | OK |
| `/organizer/message-templates` | ✅ | #173 (message templates) | Already in roadmap | OK |
| `/shopper/trades` | ❌ | NEW | Trade/swap feature for shoppers — **MISSING FROM ROADMAP** | Add new roadmap item |
| `/shopper/saved-searches` | ⚠️ | #194 (saved searches) | Roadmap has #194 in backlog but marked 📋 Nav. Confirm page exists. | Verify |
| `/shopper/loyalty` | ⚠️ | #29 (shopper loyalty) + #212 (leaderboard) | Multi-tab loyalty hub. Already covered. | OK |
| `/shopper/achievements` | ❌ | NEW | Achievement badges for shoppers — **MISSING FROM ROADMAP** | Add new roadmap item? |
| `/organizer/referral` | ⚠️ | #11 (organizer referral) | Roadmap #11 exists but uncertain if page built | Verify |
| `/creator/connect-stripe` | ✅ | #172 (Stripe Connect) | Already in roadmap | OK |
| `/creator/dashboard` | ⚠️ | Creator tier features? | Creator is different from organizer. May need new roadmap section | New section? |
| `/encyclopedia/[slug]` | ❌ | NEW | Estate sale encyclopedia content. Possible new feature. | Clarify with Patrick |
| `/hubs/[slug]` | ⚠️ | #40 (sale hubs) | Roadmap #40 "Sale Hubs" exists. Verify if this is it. | Verify |
| `/challenges.tsx` | ❌ | NEW | Challenge system? Not in roadmap. | Clarify |
| `/affiliate/[id]` | ⚠️ | Affiliate program? | Not explicitly in roadmap. May be undocumented feature. | Clarify |
| `/haul/coming-soon` | N/A | N/A | Placeholder. Marked as orphan in inventory. | Delete or clarify |
| `/city-heat-index.tsx` | ✅ | #49 (city heat index) | In roadmap #49. Inventory flagged as orphaned (no nav). | Verify nav status |
| `/offline.tsx` | ✅ | #69 (offline mode) | Already in roadmap | OK |
| `/organizer/offline` | ✅ | #69 (offline mode) | Already in roadmap (org variant) | OK |
| `/organizer/email-digest-preview` | N/A | Internal | Inventory flagged as internal/dev only. Not user-facing. | Leave alone |

**Total new roadmap items needed:** ~4 (trades, achievements, encyclopedia, challenges)
**Total roadmap items with page location unclear:** ~8

---

## 3. Roadmap Items With No Frontend Page or Blocked Pages

These items claim to have UI built but pages are missing or 404.

| # | Feature | Roadmap Status | Frontend Status | Evidence | Action |
|---|---------|---|---|---|---|
| 188 | Neighborhood Pages | ✅ UI, ✅ Chrome | ❌ 404 | S290 audit: "/neighborhoods/grand-rapids returns 404. Feature not implemented." | Change to 📋 or remove |
| 5 | Listing Type Schema Validation | ✅ UI | ⚠️ Unclear | Roadmap says UI built. No page path found in inventory. Only backend validation mentioned. | Verify if page exists |
| 35 | Entrance Pin / Parking | ✅ UI | ⚠️ Unclear | Roadmap marked Chrome ✅ S286 but B2 QA said "Field not found in sale creation form." Page exists but field missing. | Fix data or change to ⚠️ |
| 147 | Hold Duration Config | ✅ UI | ⚠️ Unclear | Roadmap says "Per-sale configurable" and marked Chrome ✅ but no clear page path. | Verify page exists |
| 194 | Saved Searches | 📋 (pending) but Nav 📋 | ❌ (TBD) | S290 orchestrator verified feature worked (POST /saved-searches, toast). Page likely exists but nav is missing. | Move to ✅ Chrome, confirm Nav |
| 37 | Sale Reminders ("Remind Me" push button) | ✅ Chrome (iCal only) | ⚠️ PARTIAL | S289 found: iCal "Add to Calendar" ✅ but push "Remind Me" button NOT BUILT. Feature gap. | Change Chrome → 📋, mark as feature gap |
| 49 | City Heat Index | ✅ Chrome, ✅ Nav | ❌ Orphaned | Page exists (/city-heat-index.tsx) but inventory flagged as orphaned — "Route not found in nav." Discrepancy. | Verify nav status |

---

## 4. Nav Status Corrections Needed

Items where roadmap Nav column disagrees with S294 inventory finding.

| # | Feature | Roadmap Nav | S294 Inventory | Discrepancy | Action |
|---|---------|---|---|---|---|
| 49 | City Heat Index | ✅ | Orphaned (no nav) | Roadmap says ✅ Nav. Inventory says orphaned — "Route not found in nav." | Change Nav → 📋 |
| 131 | Share & Promote Templates | 📋 | Should be ✅ | S289 confirmed feature works + modal renders. Nav should be ✅. | Change Nav → ✅ |
| 84 | Approach Notes | 📋 (in notes "organizer edit-sale") | ✅ (section visible) | Feature exists, in use, but roadmap Nav marked 📋. Should be ✅. | Change Nav → ✅ |
| 194 | Saved Searches | 📋 | Likely ✅ | S290 verified feature works + page saves searches. Nav should reflect actual state. | Verify Nav, likely ✅ |
| 173 | Message Templates | 📋 (pending) | ✅ in nav | Page `/organizer/message-templates` exists. Inventory lists it. Roadmap Nav is stale. | Change Nav → ✅ |
| 134 | Plan a Sale Card | ✅ | ✅ visible | S286 B3 found "Coming Soon" card missing. S290 says card should be visible. Verify current state. | Verify if card visible |
| 59 | Streak Rewards | ✅ Nav | ⚠️ Partial nav | S289 found: widget on `/shopper/dashboard` but NOT on `/shopper/loyalty`. Nav is incomplete (loyalty tab missing widget). | Change Nav → ⚠️ |
| 88 | Haul Gallery | ✅ Nav | ✅ in nav | Roadmap says Nav ✅. Inventory confirms `/shopper/hauls` in nav. BUT S286 marked empty state only. | Keep Nav ✅, but Chrome stays 📋 |
| 200 | Shopper Public Profiles | ⚠️ (not tested) | 📋 (unclear) | URL structure "/shoppers/[slug]" or similar not found. Never tested. | Change to 📋 or build |

---

## 5. Items Completed in S290-S293 Not Yet Updated in Roadmap

Based on STATE.md session summaries, these features were fixed, verified, or shipped but roadmap hasn't been updated.

| # | Feature | S290-S293 Status | Current Roadmap | Action |
|---|---------|---|---|---|
| 195 | Messaging | S290: "Messaging compose FIXED — CSS pointer-events blocked interaction" | Chrome ✅ (stale) | Change Chrome → 📋, then re-verify S294 |
| 176 | Filter Pills (P0) | S290: Filter pill fix confirmed + S288 fix verified | Chrome ✅ | Correct per S288 fix. Keep ✅. |
| 37 | Sale Reminders | S289: "iCal ✅ but push 'Remind Me' button NOT BUILT — feature gap" | Chrome ✅ (misleading) | Change Chrome → ⚠️ (partial), note feature gap |
| 59 | Streak Rewards | S289: "Widget on /shopper/dashboard ✅ but NOT on /shopper/loyalty — P2 gap" | Nav ✅ (incomplete) | Change to ⚠️ (partial), note placement gap |
| 84 | Approach Notes | S289: "Section visible on LIVE sale edit, 'Notify Shoppers' button present ✅" | Nav 📋 (stale) | Change Chrome → ✅, Nav → ✅ |
| 131 | Share Templates | S289: "Full modal with 8 tabs, real data, copy works ✅" | Nav 📋 (stale) | Change Chrome → ✅, Nav → ✅ |
| 197 | Bounties | S289: "Loads, Create Bounty works ✅" | Chrome 📋 | Change Chrome → ✅ |
| 6 | Virtual Queue | S289: "Loads ✅" | Chrome 📋 | Change Chrome → 📋 (loads only, full flow untested) |
| 57 | Rarity Badges | S289: "Code correct, Railway DB has rarity=null; seed patch applied" | Chrome ✅ (false) | Change Chrome → 📋; note data dependency |
| 65 | Tier Gating (Brand Kit) | S289: "SIMPLE user sees upgrade wall ✅" | Chrome ✅ | Keep ✅ (confirmed) |
| 172 | Stripe Connect | S292: "Stripe P0: checkout works — payment intent creates, Stripe Elements renders, RESERVED error handled" | Chrome ✅ (partial) | Change Chrome → ✅ (E2E verified S292) |
| 13 | TEAMS Workspace | S292: "(1) Invite Member button fixed + rendered (2) Public URL `/workspace/[slug]` fixed (3) All 3 fixes pushed" | Chrome 📋 | Verify if S293 Chrome test completed. If yes, change to ✅. If no, stay 📋. |
| 27/66/125 | Exports (CSV/JSON/ZIP) | S290: "Exports confirmed via Patrick CSV upload" | Chrome ✅ (for CSV only) | Clarify: CSV ✅ verified by Patrick. JSON/ZIP status? |

---

## 6. Stale "Coming Soon" and Deferred Items

Roadmap items still marked as planned/backlog but Patrick has explicitly deferred or noted as future.

| # | Feature | Current Status | Deferred Evidence | Action |
|---|---------|---|---|---|
| 37 | Sale Reminders — "Remind Me" Push | Chrome ✅, but feature gap | S289 orchestrator: "push 'Remind Me' button not built — feature gap" | Note as deferred; change Chrome to ⚠️ |
| 188 | Neighborhood Pages | Chrome ✅, UI ✅ | S290 audit: "/neighborhoods returns 404. Feature not implemented." Road contradiction. | Roadmap says Chrome ✅ but page 404. Change to 📋 or decide: build or remove. |
| 134 | Plan a Sale Card | Chrome ✅, shown as "Coming Soon" | S286 B3: card was missing. S290 says should be visible. Current state unclear. | Verify if card is actually visible in S293+ |
| 194 | Saved Searches | 📋 pending | S290 verified working: POST /saved-searches + toast. Only missing from nav. | Move to ✅ Chrome (verified) + add to pending Nav work |
| 52 | Estate Sale Encyclopedia | Chrome ✅, Nav ⚠️ | S290 audit: "Nav link not located." Page exists but unreachable? Or feature incomplete? | Clarify: Is page functional or stub? |
| 49 | City Heat Index | Chrome ✅, Nav ✅ | S290 audit: "Route not found in nav." Discrepancy between roadmap claim and reality. | Verify actual nav state (either fix nav link OR change status) |
| 39 | Photo Op Stations | 📋 Chrome | No evidence of implementation in audit. Presumed not built. | Confirm if built or truly pending. |
| 40 | Sale Hubs | 📋 Chrome | Hubs pages exist (/hubs/[slug]). But navigation unclear. | Verify if feature complete or stub. |

---

## Summary Table: Roadmap Corrections Needed

| Category | Count | Items |
|----------|-------|-------|
| Chrome ✅ → 📋 (downgrade due to S290 audit) | 26 | #195, #172, #166, #176, #178, #193, #155, #68, #153, #138, #161, #201, #57, #50, #45, #133, #48, #88, #27, #66, #125, #60, #46, #63, #187, #52, #18 |
| Nav corrections | 9 | #49, #131, #84, #194, #173, #134, #59, #88, #200 |
| Chrome corrections (S290-293 verified fixes) | 14 | #195, #37, #59, #84, #131, #197, #6, #57, #65, #172, #13, #27/66/125 |
| Missing roadmap items (pages exist) | ~4 | Trades, Achievements, Encyclopedia, Challenges |
| Feature gap notes | 3 | #37 (Remind Me), #188 (neighborhoods), #194 (saved searches) |
| Pages with no roadmap (need clarification) | 8 | Settings split, Creator tier, Affiliate, etc. |

---

## Recommended Next Session Actions

1. **Orchestrator Chrome re-test** all 26 downgraded items against S290 protocol (specific data visible, interactive actions performed)
2. **Verify page existence** for items marked as "Roadmap says UI built but page not found"
3. **Seed rarity data** into Railway and re-test #57 (badges), #45 (legend), #50 (loot log), #133 (league)
4. **Run full-product walkthrough** as each user role (SHOPPER, ORGANIZER, ADMIN) to find gaps subagents missed
5. **Consolidate nav** — fix #49 (City Heat Index orphaned), add #194 (saved searches), fix #59 (Streak on loyalty)
6. **Clarify deferred features** — Patrick decision needed on #37 (Remind Me button), #188 (neighborhoods), #39/#40 (photo ops/hubs)
7. **Add missing roadmap items** for trades, achievements, encyclopedia if they're shipping features
8. **Update STATE.md** with honest Chrome verification status after re-testing

---

*Audit completed by orchestrator. Evidence: S290 retroaudit, frontend-pages-inventory-S294, STATE.md S290-S293 summaries.*
