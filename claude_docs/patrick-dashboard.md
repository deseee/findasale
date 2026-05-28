# Patrick's Dashboard — Week of May 28, 2026

---

## What Happened This Week

S799 complete: #416 Sale Floor Map ✅ Chrome-re-verified. Blocked Queue: 4 (below ceiling — feature work continues).

**S799 — #416 Floor Map re-verified:**
- Seeded test sale "Floor Map Test Sale" via psycopg2 (4 items: 2× Living Room, 2× Kitchen). Fixed PUBLIC_ITEM_FILTER blocker (isActive + draftStatus must be PUBLISHED). Chrome-verified: "FLOOR GUIDE — What's where" section renders with room tabs. Room filter chip works. #416 ✅.

**S798 (previous) — 5 features shipped + fully deployed:**
- **#442 Monthly Trend Report page** — `/reports/[year]-[month]` built with SSR + Article JSON-LD. Stat cards: total sales, organizers, top cities, categories, crawlers. Pending Chrome QA.
- **#396 DIY Sale Starter Kit** — `/organizer/starter-kit` with inline 4-section checklist + PDF download. Pending Chrome QA.
- **#397 Crew Invasion** — 4+ crew members holding simultaneously triggers 10% discount (45min), 75 XP each. Organizer opt-in toggle in edit-sale. Migration applied ✅. Pending Chrome QA.
- **#398 Organizer Referral Loop** — Confirmed already built and live. No new files needed.
- **#411 Dorm Dash Phase 2** — Dorm Building + Move-Out Date on Sale. Auto-markdown 2x within 48h of move-out. Migration applied ✅. Pending Chrome QA.
- **NV scraper** — opendata.lasvegasnevada.gov still dead. Recommended: City of Las Vegas License Search via Playwright.
- **Schema repairs** — Edit tool truncated schema.prisma after parallel agent edits (twice). Fixed: CrawlerVisit restored, ShopperWaitlistEntry↔User relation added (P1012), CONCURRENTLY removed from performance index migration (P3018). All clean.

**S797 — Chrome QA Batches A/B/C (8 ✅, 2 ⚠️, 1 ❌→fixed S798, 1 UNVERIFIED).**

**Previous sessions:** S796: 11 ✅ + build fix. S795: #400 ✅ #406 ✅ + 6 shipped. S794: 4 shipped + #432 fix.

---

## Audit Results

Remaining open audit issues:
- **M-001 (minor):** Privacy policy shows `—` literally. Cosmetic only.
- **M-002 (medium):** Long-running auctions crowd the calendar. UX issue, not a bug.
- **M-003 (medium):** One sale shows "YARD" badge on an auction + breadcrumb missing sale name.

---

## Pending Decisions

No new decisions pending. DECISIONS.md is current.

---

## Beta Tester Impact

**Improved this week (S797):** 8 more features Chrome-verified. Crawler Visit Notification, Unmet Demand Signals, Peer Referral Bounty, MCP Tool Wrappers, Early Access Cache, Explorer Profile link, Bell nav order, ENDED scraped sale page — all confirmed working.

**S798 shipped 5 features, all migrations live.** Next session: Chrome QA for all 5.

**Blocked Queue at 4 items** — below ceiling of 8. Feature work continues.

---

## This Week's Priority

1. **Next session**: Chrome QA — #442 reports page, #396 starter kit, #397 Crew Invasion, #398 org referral, #411 Dorm Dash P2. Wait for Railway rebuild to complete first.
2. **Blocked Queue at 4** — below ceiling of 8. Feature work continues after QA.
3. **Pending Chrome QA backlog**: #285 POS real-time (needs 2 concurrent users), #399 Local Legends (needs 3+ same-ZIP check-ins), #408 Scan & Split (needs 2 concurrent scanners), #409 Sneak Peek Email (needs platform sale 24-48h out + subscriber + items).

---

## Action Items for Patrick

- [x] **Submit sitemap to Bing** — DONE
- [x] **Run #409 migration** — DONE
- [x] **Run S798 migrations** — DONE. All 3 applied: performance indexes, dorm dash fields, crew invasion table.
- [ ] **Update global CLAUDE.md** — both DATABASE_URL lines need current Railway password. (Sitting since S780.)
- [ ] **Chrome: log back in as artifactmi@gmail.com** — Chrome is at finda.sale/login (signed out from test account). Click "Sign in with Google" → select "Artifact / artifactmi@gmail.com" to restore your session.
