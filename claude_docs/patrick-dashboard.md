# Patrick's Dashboard — Week of June 15, 2026

---

## What Happened This Week

The big story this week was eBay shipping accuracy — the preview tool was computing from a null location instead of the sale's ZIP code, so it showed $28 while the live listing correctly charged $32. That's now fixed: preview matches the listing. We also overhauled the confusing "minimum price" widget (it now shows a quiet amber warning only when you're pricing too low, instead of the embarrassing $6.22 suggestion). A P1 bug was caught and fixed: new organizer accounts weren't getting their ORGANIZER role properly, which would have blocked dashboard access after sign-up. That's cleared. On the growth side, we added the EstateSale.com scraper, built Lighthouse performance CI, submitted to Software Finder, and drafted press pitches for Rapid Growth, Second Wave, and Crain's GR.

---

## Audit Results

No formal audit reports ran this week (no files in the audits folder). The agent fleet ran its own internal quality checks during dev sessions and caught three production bugs through direct eBay API testing — all fixed before users noticed.

---

## Pending Decisions

No PENDING items in DECISIONS.md. All standing design and brand rules are active.

---

## Beta Tester Impact

**Better for eBay sellers:** The shipping preview now shows the right number — what the buyer actually pays. The guardrail that warns when a price is too low is quiet on normal items and only fires when it matters. eBay listings now push cleanly for items that were previously getting blocked.

**New organizer registrations:** The bug where new organizers couldn't access their dashboard after signing up is fixed. Any organizer who had trouble registering this past week should try again — it will work now.

**Homepage:** Loads with less layout shift on mobile. It's subtle but measurable.

---

## This Week's Priority

1. **#358 Follower Count Toggle** — fastest ship, no dependencies, organizers can see who's following their sale profile. BQ is at 1 (well below the 8-item ceiling), so dev is fully unblocked.
2. **AlternativeTo deadline June 18** — you need to log in and submit manually. This is the highest-urgency growth action right now.
3. **Records pass** — apply the GA4 analytics PCV rows from S984 to the roadmap (3 of 4 events browser-verified).

---

## Action Items for Patrick

- [ ] **⚠️ URGENT — AlternativeTo deadline June 18.** Log into alternativeto.net as "FindASale" → Add Software. Two days left.
- [ ] **Send the 4 Gmail drafts** sitting in your inbox: eBay developer ticket reply, Rapid Growth pitch, Second Wave pitch, Crain's GR pitch (confirm byline if you want your name on it).
- [ ] **Start Garden grants** — "The 100" and 5×5 Night. Free to apply, both open now.
- [ ] **Free directory listings (~1-2 hrs, all $0):** Bing Places, Apple Business Connect, Yelp, Foursquare, findPWA, Alignable.
- [ ] **Push the S984 wrap docs** (wrap commit only, no code changes):
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add claude_docs/STATE.md
  git add claude_docs/patrick-dashboard.md
  git commit -m "S984: QA wrap — P1 roles bug cleared, GA4 Tier 2 3/4 verified"
  .\push.ps1
  ```
