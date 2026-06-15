# Patrick's Dashboard — Week of June 15, 2026

---

## What Happened This Week

The big story this week was eBay shipping accuracy — the preview tool was computing from a null location instead of the sale's ZIP code, so it showed $28 while the live listing correctly charged $32. That's now fixed: preview matches the listing. We also overhauled the confusing "minimum price" widget (it now shows a quiet amber warning only when you're pricing too low, instead of the embarrassing $6.22 suggestion). A P1 bug was caught and fixed: new organizer accounts weren't getting their ORGANIZER role properly, which would have blocked dashboard access after sign-up. That's cleared.

In S986 we ran QA on two features. #358 Follower Count Toggle is half-verified — the OFF direction (hiding your count) is confirmed working end-to-end with DB evidence. The ON direction needs one more Chrome verification next session. The affiliate dashboard (#318) renders correctly but has a P2 bug: the referrals tab filter doesn't visually activate on click. That's queued for a dev fix.

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

**Coming soon:** Organizers will be able to hide their follower count from their storefront — useful when you're just getting started.

---

## This Week's Priority

1. **⚠️ AlternativeTo deadline June 18** — THREE DAYS. Log into alternativeto.net as "FindASale" → Add Software. This is the highest-urgency action right now.
2. **#358 ON direction verify** — Quick Chrome QA next session: log in as user5, visit Bob Smith's storefront, confirm "1 follower" shows next to Follow button.
3. **#318 P2 fix** — Dispatch to dev: referrals tab filter active state broken.

---

## Action Items for Patrick

- [ ] **⚠️ URGENT — AlternativeTo deadline June 18.** Log into alternativeto.net as "FindASale" → Add Software. Three days left.
- [ ] **Send the 4 Gmail drafts** sitting in your inbox: eBay developer ticket reply, Rapid Growth pitch, Second Wave pitch, Crain's GR pitch (confirm byline if you want your name on it).
- [ ] **Start Garden grants** — "The 100" and 5×5 Night. Free to apply, both open now.
- [ ] **Free directory listings (~1-2 hrs, all $0):** Bing Places, Apple Business Connect, Yelp, Foursquare, findPWA, Alignable.
- [ ] **Push the S986 wrap docs** (wrap commit only, no code changes):
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git add claude_docs/strategy/roadmap.md
  git commit -m "S986: QA wrap — #358 OFF verified (PCV), #318 P2 tab filter bug, AlternativeTo deadline"
  .\push.ps1
  ```
