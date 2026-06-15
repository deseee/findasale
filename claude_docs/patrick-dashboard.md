# Patrick's Dashboard — Week of June 15, 2026

---

## What Happened This Week

The big story this week was eBay shipping accuracy — the preview tool was computing from a null location instead of the sale's ZIP code, so it showed $28 while the live listing correctly charged $32. That's now fixed: preview matches the listing. We also overhauled the confusing "minimum price" widget (it now shows a quiet amber warning only when you're pricing too low, instead of the embarrassing $6.22 suggestion). A P1 bug was caught and fixed: new organizer accounts weren't getting their ORGANIZER role properly, which would have blocked dashboard access after sign-up. That's cleared.

In S986–S989 we finished QA on #358 Follower Count Toggle (both directions Chrome-verified), #318 affiliate tab filter (Chrome-verified ✅ S988), and #313 HAUL_POST_LIKES XP idempotency (Chrome-verified ✅ S989 — XP fires once when post hits 2+ likes, idempotency guard blocks re-awards on subsequent likes). BQ is now 0.

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

**Affiliate dashboard (#318):** The referrals tab filter now correctly highlights the active tab when clicked. Chrome-verified S988.

**XP idempotency (#313):** Haul post milestone XP (5 XP when post hits 2+ likes) now fires exactly once per post. The idempotency guard was broken before S970 — it would re-award XP on every subsequent like. Chrome-verified S989.

---

## This Week's Priority

1. **⚠️ AlternativeTo deadline June 18** — TWO DAYS. Log into alternativeto.net as "FindASale" → Add Software.
2. **Push S989 wrap docs** (see push block below).

---

## Action Items for Patrick

- [ ] **⚠️ URGENT — AlternativeTo deadline June 18.** Log into alternativeto.net as "FindASale" → Add Software. Two days left.
- [ ] **Push S989 wrap docs:**
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add claude_docs/strategy/roadmap.md
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git commit -m "S989: #313 Chrome verified; #318 records pass; wrap"
  .\push.ps1
  ```
- [ ] **Send the 4 Gmail drafts** sitting in your inbox: eBay developer ticket reply, Rapid Growth pitch, Second Wave pitch, Crain's GR pitch (confirm byline if you want your name on it).
- [ ] **Start Garden grants** — "The 100" and 5×5 Night. Free to apply, both open now.
- [ ] **Free directory listings (~1-2 hrs, all $0):** Bing Places, Apple Business Connect, Yelp, Foursquare, findPWA, Alignable.
