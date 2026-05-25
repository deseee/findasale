# Patrick's Dashboard — Week of May 25, 2026

---

## What Happened This Week

Six sessions ran this week. The sitemap grew to 1,885 URLs, FindA.Sale now pings search engines on every sale publish (IndexNow), and the map got fixed for platform sales. Eight XP/Guild features were Chrome-verified. Two more camera/AI features confirmed working (#7 referral, #339 low-confidence refusal). A rank-demotion bug (users losing Scout rank when spending XP) was fixed.

Today (S788): 9 GitHub Actions workflows failed at their Monday scheduled run. Root cause was the Railway DB password rotation from last week — GitHub Secrets weren't updated. Fixed immediately. Also cleaned up 8 scraper files that had pre-existing data source failures (dead domains, changed APIs) so they no longer fail loudly each week.

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

1. **Seed the test database** — unlocks all shopper QA (half the blocked queue clears instantly).

2. **Photo pipeline fix** — 3 shipped features (#319 burst clustering, #325 best-photo-first, #328 photo role labeling) are completely dead because the upload code never creates Photo database records. Need to dispatch findasale-dev to fix this.

3. **Clear the QA backlog** — 15+ items blocked/unverified. QA ceiling rule has been mandatory for 3 months. No new features until below 8.

---

## Action Items for Patrick

- [ ] **Push S788 wrap docs** (STATE.md + patrick-dashboard.md) — push block in STATE.md Next Session
- [ ] **Re-seed production database** — run `npx prisma db seed` against Railway DB to unblock shopper accounts. Back up Barn Door QA Test Sale data first. Push block in STATE.md.
- [ ] **Promote a test shopper to RANGER** — set guildXp >= 2000 + explorerRank = RANGER for any user12-user23 in Railway DB. Needed for #261 QA.
- [ ] **Submit sitemap to Bing** — https://www.bing.com/webmasters → Add sitemap → `https://finda.sale/server-sitemap.xml`
- [ ] **Update global CLAUDE.md** — both DATABASE_URL lines need current Railway password. (Sitting since S780.)
