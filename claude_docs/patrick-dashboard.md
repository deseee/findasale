# Patrick's Dashboard — Week of June 16, 2026

---

## What Happened This Week

The big story this week was eBay shipping accuracy — the preview tool was computing from a null location instead of the sale's ZIP code, so it showed $28 while the live listing correctly charged $32. That's now fixed: preview matches the listing. We also overhauled the confusing "minimum price" widget (it now shows a quiet amber warning only when you're pricing too low). A P1 bug was caught and fixed: new organizer accounts weren't getting their ORGANIZER role properly. QA is fully caught up — #358 Follower Count Toggle, #318 affiliate tab filter, #313 HAUL_POST_LIKES XP idempotency, and #465 GA4 Tier 2 events are all Chrome-verified. BQ is 0.

**S991 (today):** Fixed the "Could not estimate shipping right now" error in the Celestion Vintage item shipping preview. Root cause: items created through the sale flow had a null `organizerId` field, so the ownership check silently failed and returned a 404 with no log entry. Two-line fix — both preview endpoints now verify ownership through the sale instead of the item directly. Push block below.

---

## Audit Results

No formal audit reports ran this week. Dev sessions caught production bugs through direct eBay API and DB testing — all fixed before users noticed.

---

## Pending Decisions

No PENDING items in DECISIONS.md. All standing design and brand rules are active.

---

## Beta Tester Impact

**Better for eBay sellers (S991):** The shipping preview now works when entering weight/dimensions for items whose sale was created before the `organizerId` backfill. The Celestion Vintage item is unblocked.

**Better for eBay sellers (S979/S980):** The shipping preview shows the right number — what the buyer actually pays. The guardrail that warns when a price is too low fires quietly and only when it matters.

**New organizer registrations (S983/S984):** The bug where new organizers couldn't access their dashboard after signing up is fixed.

**Follower count toggle (S986/S987):** Both ON and OFF directions verified live.

**Affiliate dashboard (#318):** The referrals tab filter now correctly highlights the active tab. Chrome-verified S988.

**XP idempotency (#313):** Haul post milestone XP fires exactly once per post. Chrome-verified S989.

**GA4 Tier 2 events (#465):** All four engagement events confirmed firing in production. Chrome-verified S990.

---

## This Week's Priority

1. **Push S991 fix** (ebayController.ts + wrap docs — see push block below).
2. **Send the 4 Gmail drafts** sitting in your inbox (eBay dev ticket, 3 press pitches).

---

## Action Items for Patrick

- [ ] **Push S991 fix + wrap docs:**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add packages/backend/src/controllers/ebayController.ts
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git commit -m "S991: fix shipping preview 404 on items with null organizerId; wrap"
  .\push.ps1
  ```
- [ ] **Send the 4 Gmail drafts** sitting in your inbox: eBay developer ticket reply, Rapid Growth pitch, Second Wave pitch, Crain's GR pitch.
- [ ] **Start Garden grants** — "The 100" and 5×5 Night. Free to apply, both open now.
- [ ] **Free directory listings (~1-2 hrs, all $0):** Bing Places, Apple Business Connect, Yelp, Foursquare, findPWA, Alignable.
- [ ] **EPN affiliate nudge** — if eBay stays quiet, send a short follow-up to epn-tigs@ebay.com.

---

## ⚠️ Brand Drift Alert — 2026-06-16

**Weekly brand scan found 1 P0 and 2 P1 issues (all pre-existing, none new this week).**

| Severity | File | Issue |
|----------|------|-------|
| **P0** | `SearchFilterPanel.tsx` lines 298/314/345 | Clear Filters button + result count text have no dark mode variants — renders light-on-light in dark mode. **3 consecutive audits (~20+ sessions) without a fix.** |
| **P1** | `pages/about.tsx` lines 12/14 | Meta + OG descriptions don't mention any sale types — missed SEO positioning. |
| **P1** | `pages/pricing.tsx` lines 202/204 | Meta + OG descriptions don't mention any sale types — missed SEO positioning. |

All fixes are small (3 lines of Tailwind, 2 lines of copy). Route: `Skill('findasale-dev')` for SearchFilterPanel; `Skill('findasale-marketing')` for the two meta descriptions.

**Full report:** `claude_docs/audits/brand-drift-2026-06-16.md`
