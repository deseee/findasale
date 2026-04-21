# Patrick's Dashboard — S530 Complete

## What Happened This Session

S530 was a pure QA session — no code changes. We ran Chrome QA across the full backlog including the Explorer's Guild / shopper XP feature backlog.

## Decision Needed From You

**Before S531 dev work begins:** Should the "Shopper Discount Codes" section on `/coupons` be **TEAMS-only** or stay on **PRO**? You said TEAMS-only last session — just needs confirmation to dispatch the fix.

## ✅ Verified Working (S530)

| Feature | Notes |
|---------|-------|
| #259 Hunt Pass page | 1.5× throughout, XP matrix table correct, "6-hour early access" copy confirmed |
| #279 Rare Finds Pass | Page loads, rarity filters work, empty state correct |
| #282 Explorer Profile Completion XP | Karen 30→80 XP after filling specialty+category+keyword — +50 confirmed |
| #270 Onboarding card | Renders for INITIATE Karen, XP values correct (+5 check-in, +10 purchase) |
| #224 Rapid-capture redirect | /organizer/rapid-capture → /organizer/sales works |
| Explorer Profile page + redirect | /shopper/explorer-profile ✅, old URL redirects ✅ |
| Shopper /coupons (3 tiers) | Standard/Premium/Deluxe tiers render correctly |
| #200 Public profile | collectorTitle fully removed from DB and UI |
| S529 Avatar dropdown rank | Compact rank display confirmed live on production |

## ❌ Bugs Found This Session

### P0 (blocker)
| Bug | Location | What's Wrong |
|-----|----------|--------------|
| **#267 RSVP Bonus XP not firing** | /sales/[id] → click Going | No Discoveries notification. XP delta after click is unexplained (+5 instead of 2). Award mechanism broken in backend. |

### P1 (must fix before beta)
| Bug | Location | What's Wrong |
|-----|----------|--------------|
| **#241 Brand Kit PDF generators** | /organizer/brand-kit | All 4 PDF download buttons hit /api/brand-kit/organizer/[type] → 404. UI is complete. Backend routes missing entirely. |
| **#7 Shopper Referral Rewards** | /shopper/referrals | Page doesn't exist — 404. No referral link anywhere on shopper dashboard. Feature was marked shipped but the page isn't there. |
| **SettlementWizard fee label** | /organizer/settlement → Receipt step | Shows "Platform Fee (200%)" — should be "2%". S528 regression. |
| **Per-sale analytics filter** | /organizer/insights | All 8 stat cards show identical data regardless of sale selection. |

### P2
| Bug | Location | What's Wrong |
|-----|----------|--------------|
| **AvatarDropdown nav link** | Avatar dropdown → My Profile | Still shows "My Profile → /organizer/profile". Should be "Explorer Profile → /shopper/explorer-profile". |

## ⚠️ Partial
- **#223 Organizer Guidance Tooltips** — pricing page tooltips ✅ all tiers. Holds page Grandmaster copy UNVERIFIED (no holds test data).
- **#272 Post-Purchase Share** — "Share Your Find!" button present on /shopper/loot-log/[id]. Can't verify native Share dialog in desktop automation.

## Still Needs Push (S529)

S529 code is committed locally — Patrick, run `.\push.ps1` to get these live:
- Storefront widget on organizer dashboard
- Mobile nav rank (was hardcoded "Scout")
- Card reader content updates (S700/S710 only)

## Next Session Dev Queue (S531)

Dispatch in parallel after you confirm the coupons TEAMS gate decision:

1. **Fix #267 RSVP Bonus XP (P0)** — investigate xpService RSVP handler
2. **Fix #241 Brand Kit PDF endpoints (P1)** — build missing backend routes
3. **Fix #7 Referral Rewards page (P1)** — /shopper/referrals page missing
4. **Fix SettlementWizard fee % (P1)** — decimal formatting bug in Receipt step
5. **Fix per-sale analytics filter (P1)** — endpoint not scoping data by saleId
6. **Fix AvatarDropdown nav link (P2)** — rename + href update
7. **Fix /coupons tier gate (P2)** — gate "Shopper Discount Codes" section to TEAMS (pending your confirmation)

After dev: Chrome QA each fix + verify S529 storefront/mobile rank after push.

## UNVERIFIED Queue (need special setup)

| Feature | What's Needed |
|---------|---------------|
| #275 Hunt Pass Cosmetics | Need Hunt Pass subscriber account |
| #278 Treasure Hunt Pro | Need Hunt Pass + active QR scan |
| #280 Condition Rating XP | Login as Bob, set conditionGrade on item |
| #235 DonationModal | Need sale with charity close configured |
| Organizer Insights error | Test as Alice (user1@example.com) |
| #281/#255/#257/#268/#261 | Multi-day streak, higher rank, trail with stops |
| #75 Tier Lapse Logic | Need lapsed PRO subscription account |
| S529 storefront/mobile/card reader | Pending push |

---

## ⚠️ Brand Drift (carry-over from S529)

~17 violations remain open. Highest priority:
- `pages/sales/[id].tsx:881` — Nextdoor share hardcodes "estate sale" (P1)
- `pages/index.tsx:266,268,274,285` — homepage meta tags omit flea markets (P1)
- 12 modal components missing dark mode (P2)

Full details: `claude_docs/audits/brand-drift-2026-04-21.md`
