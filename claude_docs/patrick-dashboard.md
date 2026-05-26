# Patrick's Dashboard — Week of May 25, 2026

---

## What Happened This Week

Seven sessions ran this week. The sitemap grew to 1,885 URLs, IndexNow fires on every sale publish, and the map got fixed. Eight XP/Guild features were Chrome-verified. Camera/photo pipeline fixes were shipped and verified.

S788: 9 GitHub Actions workflows failed (Railway DB password rotation — GitHub Secrets stale). Fixed immediately. 8 scraper files cleaned up.

S789 (today): Camera batch QA complete. #319/#325/#328 (photo pipeline) confirmed working — uploaded PNG via rapidfire, Photo record in DB verified. #340 (auto-reopen camera) verified. #339 (low-confidence refuse-to-fill) code gate confirmed. #336 (intent-wins) partially verified — need one more live AI test. Blocked Queue down from 15 to 12.

---

## Audit Results (this week)

Remaining open audit issues:
- **M-001 (minor):** Privacy policy shows `—` literally. Cosmetic only.
- **M-002 (medium):** Long-running auctions crowd the calendar. UX issue, not a bug.
- **M-003 (medium):** One sale shows "YARD" badge on an auction + breadcrumb missing sale name.

---

## Pending Decisions

No new decisions pending. DECISIONS.md is current.

---

## Beta Tester Impact

**Improved this week:** Categories page cleaner. Map pins working. Bell icon in correct header position. QR modal now expands full-screen and can be shared. GitHub Actions scrapers will now run green instead of sending failure emails each Monday.

**Still rough:** Shopper test accounts (user12+) can't log in — blocking all shopper-side QA. Requires one database command (see Action Items). eBay features unverifiable until a test account gets an eBay connection.

---

## This Week's Priority

1. **Seed the test database** — unlocks all shopper QA (#266, #184, #261). Half the blocked queue clears instantly.

2. **#336 live AI re-run** — upload a fresh item, immediately set the price, wait for AI to process. Verify AI does NOT overwrite organizer-set price. One Chrome test to close this out.

3. **Clear the QA backlog** — 12 items blocked/unverified. QA ceiling rule has been mandatory for 3 months. No new features until below 8.

---

## Action Items for Patrick

- [ ] **Push S789 wrap docs** (STATE.md + patrick-dashboard.md) — push block below
- [ ] **Sign back in to Chrome** — Chrome is at finda.sale/login after QA session. Sign in with Google (artifactmi@gmail.com).
- [ ] **Re-seed production database** — run `npx prisma db seed` against Railway DB to unblock shopper accounts. Back up Barn Door QA Test Sale first.
- [ ] **Clean up QA test sale** — `cmplw1p3g000c4kxzdyg8k5ah` (QA_S789) in Railway DB if still present.
- [ ] **Promote a test shopper to RANGER** — set guildXp >= 2000 + explorerRank = RANGER for any user12-user23 in Railway DB. Needed for #261 QA.
- [ ] **Submit sitemap to Bing** — https://www.bing.com/webmasters → Add sitemap → `https://finda.sale/server-sitemap.xml`
- [ ] **Update global CLAUDE.md** — both DATABASE_URL lines need current Railway password. (Sitting since S780.)
