# Patrick's Dashboard — Week of June 15, 2026

---

## What Happened This Week

The big story this week was eBay shipping accuracy — the preview tool was computing from a null location instead of the sale's ZIP code, so it showed $28 while the live listing correctly charged $32. That's now fixed: preview matches the listing. We also overhauled the confusing "minimum price" widget (it now shows a quiet amber warning only when you're pricing too low, instead of the embarrassing $6.22 suggestion). A P1 bug was caught and fixed: new organizer accounts weren't getting their ORGANIZER role properly, which would have blocked dashboard access after sign-up. That's cleared.

In S986–S987 we finished QA on #358 Follower Count Toggle — both directions now verified end-to-end. The affiliate dashboard (#318) had a P2 bug where the referrals tab filter didn't visually update on click — that's been fixed (CODE-ONLY, needs your push). Two smaller fixes also shipped: the settings helper text for the follower count toggle was wrong (it said "The Follow button always remains visible" but that's not true for visitors), and the affiliate tab active-state logic was fragile. Both corrected.

---

## Audit Results

No formal audit reports ran this week. Dev sessions caught three production bugs through direct eBay API testing — all fixed before users noticed.

---

## Pending Decisions

No PENDING items in DECISIONS.md. All standing design and brand rules are active.

---

## Beta Tester Impact

**Better for eBay sellers:** The shipping preview now shows the right number — what the buyer actually pays. The guardrail that warns when a price is too low fires quietly and only when it matters. eBay listings now push cleanly for items that were previously blocked.

**New organizer registrations:** The bug where new organizers couldn't access their dashboard after signing up is fixed.

**Follower count toggle:** Organizers can now reliably show or hide their follower count on their storefront. Both ON and OFF directions verified live.

**Affiliate dashboard:** The referrals tab filter now correctly highlights the active tab when clicked.

---

## This Week's Priority

1. **⚠️ AlternativeTo deadline June 18** — TWO DAYS. Log into alternativeto.net as "FindASale" → Add Software.
2. **Push the S987 code** (see push block below) — #318 and #358 fixes need to reach Vercel before Chrome QA can verify them.

---

## Action Items for Patrick

- [ ] **⚠️ URGENT — AlternativeTo deadline June 18.** Log into alternativeto.net as "FindASale" → Add Software. Two days left.
- [ ] **Push the S987 code changes + wrap docs:**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add packages/frontend/pages/organizer/affiliate.tsx
  git add packages/frontend/pages/organizer/settings.tsx
  git add claude_docs/strategy/roadmap.md
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git commit -m "S987: fix #318 affiliate tab active state; fix #358 settings copy; records pass + wrap"
  .\push.ps1
  ```
- [ ] **Send the 4 Gmail drafts** sitting in your inbox: eBay developer ticket reply, Rapid Growth pitch, Second Wave pitch, Crain's GR pitch (confirm byline if you want your name on it).
- [ ] **Start Garden grants** — "The 100" and 5×5 Night. Free to apply, both open now.
- [ ] **Free directory listings (~1-2 hrs, all $0):** Bing Places, Apple Business Connect, Yelp, Foursquare, findPWA, Alignable.
