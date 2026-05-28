# Patrick's Dashboard — Week of May 28, 2026

---

## What Happened This Week

S798 complete: 5 features shipped in one parallel batch. Blocked Queue: 5 (below ceiling — feature work continues).

**S798 (latest) — 5 features shipped:**
- **#442 Monthly Trend Report page** — `/reports/[year]-[month]` page built with SSR + Article JSON-LD. Was 404; now live (pending deploy). Stat cards: total sales, organizers, top cities, categories, crawlers.
- **#396 DIY Sale Starter Kit** — `/organizer/starter-kit` with inline checklist + PDF download. Pre-Sale, Pricing Tips, Day-Of, Post-Sale sections.
- **#397 Crew Invasion** — 4+ crew members holding simultaneously triggers 10% discount code (45min), 75 XP each. Organizer opt-in toggle in edit-sale. **⚠️ Migration needed.**
- **#398 Organizer Referral Loop** — Confirmed already built: /organizer/referrals, 500 XP reward on first referred org's first sale. Nothing new needed.
- **#411 Dorm Dash Phase 2** — Dorm Building + Move-Out Date fields on Sale. Shows in create/edit-sale when type = DORM_DASH. Auto-markdown runs 2x within 48h of move-out. **⚠️ Migration needed.**
- **NV scraper** — opendata.lasvegasnevada.gov still dead. Recommended: build City of Las Vegas License Search Playwright scraper.

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

**S798 shipped 5 features.** Two migrations needed (see push block below).

**Blocked Queue at 5 items** — below ceiling of 8. Feature work continues next session.

---

## This Week's Priority

1. **Next session**: Dispatch #442 missing reports page to findasale-dev. New features — #396 DIY Starter Kit, #397 Crew Invasion (after gamedesign sign-off), #411 Dorm Dash Phase 2.
2. **Blocked Queue at 5** — below ceiling of 8. Feature work continues.
3. **Pending Chrome QA backlog**: #285 POS real-time (needs 2 concurrent users), #399 Local Legends (needs 3+ same-ZIP check-ins), #408 Scan & Split (needs 2 concurrent scanners), #409 Sneak Peek Email (needs platform sale 24-48h out + subscriber + items).

---

## Action Items for Patrick

- [x] **Submit sitemap to Bing** — DONE
- [x] **Run #409 migration** — DONE. `sneakPeekSentAt` column confirmed in Railway DB. Cron fired today at 09:00 UTC — 5 eligible sales found, all skipped (scraped, no subscribers). Feature is live and will send when a real platform sale has followers.
- [ ] **Update global CLAUDE.md** — both DATABASE_URL lines need current Railway password. (Sitting since S780.)
- [ ] **Chrome: log back in as artifactmi@gmail.com** — Chrome is at finda.sale/login (signed out from test account). Click "Sign in with Google" → select "Artifact / artifactmi@gmail.com" to restore your session.
- [ ] **Dispatch #442 reports page next session** — /reports/[year]-[month] page was never built; email job runs but has no landing page destination.
