# Patrick's Dashboard — Week of May 25, 2026

---

## What Happened This Week

Five sessions ran this week covering a mix of SEO work, bug fixes, and QA. The sitemap grew from 1,727 to 1,885 URLs and FindA.Sale now pings search engines instantly when a sale goes live (IndexNow). The map got fixed — platform sales now geocode when they publish, so pins will appear. The categories page was cleaned up (no more raw eBay taxonomy strings like "Toys & Hobbies:Action Figures:..."). Eight XP/Guild features were Chrome-verified as working, and a rank-demotion bug (users losing their Scout rank when they spent XP on coupons) was found and fixed. Two more features were confirmed working: Shopper Referral Rewards and the Low-Confidence AI refusal dialog.

---

## Audit Results (this week)

**Weekly site audit (May 23):** 0 critical, 1 high, 4 medium, 2 low. The HIGH finding (categories page) was already fixed before the audit report published. The MAP finding (M-004, no pins) was also already fixed.

Remaining open audit issues:
- **M-001 (minor):** Privacy policy page shows `—` literally instead of an em dash. Cosmetic only.
- **M-002 (medium):** Long-running auctions crowd the calendar and push shorter weekend sales off screen. UX issue, not a bug.
- **M-003 (medium):** One sale detail page shows "YARD" badge on an auction sale + breadcrumb has no sale name. Needs investigation.

**Friction audit (today, May 25):** Automated run found and self-dispatched the photo pipeline fix (see priority #1 below). Three items flagged that need your action (see Action Items below).

Already routed to agents: photo pipeline fix dispatched to findasale-dev this morning.

---

## Pending Decisions

No new decisions pending Patrick's approval. DECISIONS.md is current.

---

## Beta Tester Impact

**Improved this week:** Categories page now shows clean names. Map pins working for sales you create. Bell notification icon is now in the correct position in the header (before the QR scanner). The QR code modal now lets shoppers expand it full-screen and share it.

**Still rough:** Shopper test accounts (user12 and up) can't log in — this is blocking all shopper-side QA. Fixing it requires running one database command (see Action Items). eBay features are also unverifiable until a test account gets an eBay connection.

---

## This Week's Priority

1. **Photo pipeline fix** — the agent fleet found that 3 shipped features (#319 burst clustering, #325 best-photo-first sort, #328 photo role labeling) are completely dead because the upload code never creates Photo database records. This was auto-dispatched this morning. Once Patrick pushes the fix, those 3 features activate.

2. **Clear the QA backlog** — 20 items are blocked and unverified. The QA ceiling rule has been active for 3+ months. No new features should ship until this gets under 8. Half the blocked items will clear as soon as you run the shopper re-seed below.

3. **SEO follow-through** — submit the sitemap to Bing Webmaster Tools (just a 2-minute task on your end).

---

## Action Items for Patrick

- [ ] **Push accumulated S783–S787 files** — Multiple sessions worth of fixes are sitting undeployed. Push blocks are in STATE.md § Next Session. Start with the S787 block.
- [ ] **Re-seed production database** — run this once to unblock all shopper QA: `cd packages/database` → set `$env:DATABASE_URL` from Railway dashboard → `npx prisma db seed`. ⚠️ Back up Barn Door QA Test Sale data first.
- [ ] **Update your global CLAUDE.md** — the DB password changed on May 24. Both `DATABASE_URL` lines need updating to `luEGUhvHsopwwUtCbQQcfIDIDHuxZvdW`. (This has been sitting since S780 — it's breaking any session that tries to run DB commands from your local CLAUDE.md.)
- [ ] **Submit sitemap to Bing** — go to `https://www.bing.com/webmasters` → Add sitemap → `https://finda.sale/server-sitemap.xml`
- [ ] **Promote a test shopper to RANGER** — in Railway DB, set any user12–user23 to `guildXp ≥ 2000` and `explorerRank = RANGER` so QA can verify the XP multiplier feature (#261).
