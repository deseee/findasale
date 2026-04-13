# Weekly Full-Site Audit — 2026-03-22

**Audit Type:** Automated weekly comprehensive site audit (scheduled task: `weekly-full-site-audit`)
**Audited by:** Claude (automated, sessions S242-S243)
**Date:** 2026-03-22
**Environment:** Production — finda.sale
**Auth state:** Unauthenticated (public + redirect testing only; organizer flows blocked by rate limiter)
**DECISIONS.md version:** S239–S242 (D-001 through D-009)

---

## Routes Tested

131 total routes enumerated from `packages/frontend/pages/`. Directly tested via Chrome MCP:

**Public pages (live navigation):**
`/` · `/about` · `/pricing` · `/login` · `/register` · `/forgot-password` · `/map` · `/hubs` · `/categories` · `/faq` · `/plan` · `/trending` · `/leaderboard` · `/notifications` · `/messages` · `/settings` (logged out) · `/sales/[id]` · `/items/[id]`

**Auth-guarded pages (redirect verification):**
`/organizer/dashboard` · `/organizer/premium` · `/organizer/workspace` · `/shopper/dashboard` · `/shopper/dashboard#favorites` · `/admin` · `/admin/users`

**Not tested (require authenticated session):**
Organizer workspace internals, create-sale flow, shopper dashboard content, messages thread, admin panel, team management, payment flows.

---

## ⛔ CRITICAL (blocks beta testing)

### C-001 — Item detail pages return "Item not found" for all live items

**Route:** `/items/[id]`
**Claimed fix:** S241 commit d1da44c (`getItemById` check: `draftStatus !== 'PUBLISHED'` → `draftStatus === 'DRAFT'`)
**Status this audit:** ❌ REGRESSION — fix is NOT live in production

**Reproduction:**
1. Navigate to any sale detail page (e.g., `/sales/cmmxf0wnn004evxstomk39x34`)
2. Sale detail page loads correctly and shows 14 AVAILABLE items
3. Click any item (href links to `/items/cmmxf105a00ewvxst1zbntup7`, etc.)
4. Item detail page shows: "🔍 Item not found. This item may have sold or the link may have changed."

**Confirmed with two real item CUIDs from the same sale:**
- `cmmxf105a00ewvxst1zbntup7` (Crystal Vase Collection #1 — AVAILABLE, $166.41) → Item not found
- `cmmxf10ad00fcvxstbdsbahb6` (Oil Painting #9 — SOLD) → Item not found

Both items are linked directly from the sale detail page items grid. The sale page shows them with correct titles, categories, prices, and statuses. The item detail pages 404 for both.

**Impact:** The primary shopper flow (browse sale → click item → view details) is broken for 100% of items. Every beta tester who clicks an item hits a dead end. The "Find More Treasures" CTA is present (D-009 partial compliance) but the underlying access failure makes this a blocker.

**Likely cause:** The S241 fix was applied to local code but Railway has not picked up the change, OR the fix is incomplete and there is a secondary condition (e.g., item must have `saleId` matching a PUBLISHED sale, or item needs a separate publish flag). Investigate `itemController.ts` `getItemById` and compare Railway build timestamp against commit d1da44c.

**Fix before:** Any beta tester session.

---

## HIGH (degrades core experience)

### H-001 — LiveFeed "Reconnecting..." still showing on sale detail pages

**Route:** `/sales/[id]`
**Claimed fix:** S240 M-004 commit (LiveFeed silent reconnect)
**Status this audit:** ❌ REGRESSION — "Reconnecting..." text still visible

**Evidence:** On sale `cmmxf0wnn004evxstomk39x34`, the Live Activity sidebar shows:
> 🟡 Quincy Adams just saved Crystal Vase Collection #1 · 15m ago
> 🔴 Drew Jackson just bought Oil Painting #9 · 3d ago
> **Reconnecting...**

The word "Reconnecting..." appears below the activity feed in the sidebar. Beta testers will read this as a broken connection, reducing trust in the platform.

**D-009:** No explanation of what "reconnecting" means or what the user should do.

**Fix:** Remove the "Reconnecting..." text entirely from the UI or replace with a neutral status indicator that doesn't imply failure.

---

### H-002 — Reviews section has `bg-white` in dark mode (D-002 violation)

**Route:** `/sales/[id]` — Reviews section
**DECISIONS.md:** D-002 (Full Dark Mode Support — no exceptions)

The Reviews section at the bottom of sale detail pages uses `bg-white` without a `dark:` variant. In dark mode (system dark mode active during this audit), the Reviews section renders with a bright white background while all surrounding content is dark. This is visually jarring and a D-002 violation.

**Affected element:** The card/container wrapping the "Reviews" heading and "No reviews yet." text on sale detail pages.

---

## MEDIUM (polish issue)

### M-001 — /organizer/premium and /organizer/workspace lose redirect parameter

**Routes:** `/organizer/premium`, `/organizer/workspace`
**Expected:** Redirect to `/login?redirect=/organizer/premium` (consistent with other protected routes)
**Actual:** Redirect to `/login` — no `?redirect=` parameter

An organizer who clicks "Manage Plan" or accesses their workspace while logged out will land on the generic post-login page after signing in, rather than returning to where they came from.

**Comparison:**
- `/settings` → `/login?redirect=/settings` ✅
- `/organizer/dashboard` → `/login?redirect=/organizer/dashboard` ✅
- `/shopper/dashboard` → `/login?redirect=/shopper/dashboard` ✅
- `/organizer/premium` → `/login` ❌ (loses destination)
- `/organizer/workspace` → `/login` ❌ (loses destination)

---

### M-002 — D-001 drift: Footer tagline omits flea markets and yard sales

**Route:** All pages (footer is sitewide)
**DECISIONS.md:** D-001 (All Sale Types Scope)

The footer currently reads: "Helping you find the best local sales events, estate sales, garage sales, and auctions near you."

Missing from the D-001 full scope: flea markets, yard sales, tag sales, rummage sales, consignment events. The footer appears on every page and is a high-impact brand surface.

**Context:** The S242 brand sweep fixed /hubs, /categories, /calendar, /cities, /neighborhoods. The footer was not included in that pass.

---

### M-003 — /messages thread shows full site footer inside chat view

**Route:** `/messages/[id]` (message thread page)
**Issue:** The full site footer (links, copyright notice, help section) appears inside the message thread view, pushing the chat input up and making the conversation area very cramped. Chat interfaces conventionally have no sitewide footer — the entire viewport should be used for the conversation.

**Impact:** Looks unpolished. Chat input is not at the bottom of the viewport. Beta testers comparing to SMS/WhatsApp will find it awkward.

---

### M-004 — About page mission statement lacks full sale type variety (D-001)

**Route:** `/about`
**DECISIONS.md:** D-001

The About page mission statement is generic ("helping people discover great secondhand finds") and does not name the full range of sale types as the brand voice guide requires. Estate sales, garage sales, auctions, and flea markets should all appear naturally in organizer-facing and mission context copy.

---

## LOW (nitpick)

### L-001 — Login page accessible while authenticated

**Route:** `/login`
When a logged-in user navigates to `/login`, the page renders the login form rather than redirecting to the dashboard. Minor UX — a logged-in user clicking "Login" in the nav should go somewhere meaningful rather than see a form they don't need.

---

### L-002 — Reviews empty state has no CTA (D-003 gap)

**Route:** `/sales/[id]` — Reviews section
**Current:** "No reviews yet." — plain text, no action
**DECISIONS.md:** D-003 (Empty states must have CTAs)

A shopper visiting a sale with no reviews has no prompt to leave one (if applicable) or continue browsing. Consider "Browse more sales →" or a note explaining how reviews are submitted.

---

### L-003 — Mobile viewport testing inconclusive

Browser automation `resize_window` does not correctly simulate mobile CSS viewport (`window.innerWidth` remains at desktop value). Real-device testing on iPhone SE (375px) is required for D-004 compliance verification. This limitation was also present in S238 audit.

---

## DECISIONS.md Compliance Summary

| Decision | Status | Notes |
|----------|--------|-------|
| D-001 All Sale Types | ⚠️ PARTIAL | Footer still estate-centric; About page generic. Most pages fixed in S238–S242. |
| D-002 Full Dark Mode | ⚠️ PARTIAL | Reviews section `bg-white` violation on sale detail pages |
| D-003 Empty State CTAs | ⚠️ PARTIAL | Reviews empty state has no CTA; all other empty states ✅ |
| D-004 Mobile-First | ❓ UNVERIFIED | Browser automation cannot simulate mobile — real device needed |
| D-005 Multi-Endpoint | ❓ UNTESTED | No auth available for bidirectional flow testing |
| D-006 Sale Detail Order | ✅ HOLDING | Header→Organizer→Photo/Sidebar→Items→Map→Reviews confirmed |
| D-007 Teams Cap | ✅ HOLDING | "Up to 12 team members" on pricing ✅, Enterprise CTA ✅ |
| D-008 Loading States | ✅ HOLDING | No blank screens observed |
| D-009 Error Recovery | ⚠️ PARTIAL | C-001 (item 404) has "Find More Treasures" CTA but root issue is broken access |

---

## Confirmed Fixed (Prior Audit Issues)

| Issue | Fix Session | Verification |
|-------|------------|--------------|
| /settings infinite spinner (H-002 prior) | S240 | ✅ Redirects to `/login?redirect=/settings` |
| /notifications DOM duplication (H-003 prior) | S241 | ✅ Clean page for logged-out users |
| Sitewide nested `<main>` (H-004 prior) | S240 | ✅ Layout.tsx `<main>` → `<div>` confirmed |
| /hubs empty state missing CTA | S240 | ✅ "Browse All Sales →" button present |
| Admin redirect to homepage | S240 | ✅ Now `/login?redirect=/admin` |
| Sale detail "All items sold" label | S242 | ✅ Now "Show: All" filter |
| /shopper/dashboard missing redirect | S241 | ✅ Now `/login?redirect=/shopper/dashboard` |
| Pricing page D-007 cap + Enterprise CTA | S241 | ✅ "Up to 12 team members" + Enterprise section |
| Map "Plan Your Route" button | S242 | ✅ Prominent button in header |
| /cities and /neighborhoods title tags | S242 | ✅ Brand sweep complete |

---

## Finding Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 2 |
| Medium | 4 |
| Low | 3 |
| **Total** | **10** |

---

## Top 3 Recommendations

1. **Investigate C-001 (item detail pages)** — Verify Railway build includes commit d1da44c. Check `itemController.ts getItemById` in production. This is the single highest-impact fix: it restores the primary shopper use case.

2. **Remove LiveFeed "Reconnecting..." text (H-001)** — One-line CSS or conditional render fix. High trust impact for beta testers.

3. **Fix Reviews section dark mode (H-002) + redirect preservation for organizer routes (M-001)** — Both are small targeted edits. The redirect issue affects organizer onboarding continuity.

---

## Auth-Gated Pages Not Audited

Routes requiring login that were not reachable this automated run (organizer flows were blocked by rate limiter triggered during earlier testing):
- Organizer: dashboard, workspace, create-sale, edit-sale, manage-items, photo-ops, analytics, settings tabs
- Shopper: dashboard content, favorites, purchases, loot-log
- Team management flows (D-005 multi-endpoint)
- Messages thread — bidirectional (D-005)
- Admin panel internals
- Payment/subscription flows
- Organizer storefront pages

**Recommended next step:** Manual walkthrough with user2@example.com (PRO organizer) and user11@example.com (shopper) once C-001 is resolved.
