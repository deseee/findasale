# Patrick's Dashboard — Week of May 27, 2026

---

## What Happened This Week

Twelve sessions this week. S794 complete: 1 bug fix, 4 features shipped (dispatched to agents), 4 S696 features Chrome QA'd (1 ✅, 2 UNVERIFIED, 1 partial). Blocked Queue: 7 (below 8 ceiling — new features can resume).

**S794 (today):**
- **#432 AggregateOffer lowPrice fix** ✅ — The "$0 minimum price" JSON-LD bug is fixed. Sale pages now correctly show the actual lowest and highest item prices in structured data (good for Google/AI indexing).
- **#400 Loot Link** SHIPPED — Per-item share button added to sale detail item cards. Tap → native share sheet or clipboard copy.
- **#401 Sale of the Day** SHIPPED — Daily featured sale on homepage. Rotates at midnight. Algorithm scores by item count + photo count + description quality.
- **#409 Pre-Sale Sneak Peek Email** SHIPPED — Auto-emails sale followers 24–48h before your sale opens. ⚠️ Requires you to run the migration (see Action Items below).
- **#395 CSV Bulk Import** SHIPPED — 2-step wizard: upload CSV → preview + map columns → bulk create items as drafts. Up to 200 items per import. "CSV Import" button on Add Items page.
- **#403 Bundle Pricing** ✅ — Confirmed on Add Items page. "🛍️ Bundle Pricing" section opens, form works.
- **#411 Dorm Dash** ⚠️ Phase 1 — DORM_DASH appears in the sale type dropdown. Dorm-specific fields (building, room map, auto-markdown acceleration) are a Phase 2 build.
- **#406 Split-the-Bill POS** UNVERIFIED — Code is in place but couldn't test because Alice's account had no active sale in POS. Will verify next session.
- **#416 Sale Floor Map** UNVERIFIED — Component is built and wired. Needs a sale with 2+ room-tagged items to render.

**Previous sessions:** S793 QA: 10 ✅ (GEO schema, Founding Badge, Cash-to-Digital, Donation Kit, etc.), 2 ⚠️ Web Share, 4 UNVERIFIED.

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

**Improved this week:** 10+ features confirmed — GEO schema (AI can now read your sale listings correctly), Cash-to-Digital Bridge (Venmo/Zelle in POS), Founding Organizer Badge, Donation Kit, SSR for public pages. Camera pipeline, intent-wins, and many more verified in prior sessions.

**P2 bug to fix next session:** #432 AggregateOffer `lowPrice:"0"` — items priced correctly but the "lowest price" field in the search engine schema shows $0. Doesn't affect shoppers but affects how Google/AI reads the listing.

**Blocked Queue at 5 items** — below ceiling of 8. New features can resume.

---

## This Week's Priority

1. **S794 push ready** — push block below. 4 new features + 1 inline fix to push.

2. **Chrome QA next session**: #400 Loot Link, #401 Sale of the Day, #409 Sneak Peek, #395 CSV Import (all pending after migration deploy). Plus unblock #406 + #416.

3. **Blocked Queue at 7** — below ceiling of 8. Feature work continues.

---

## Action Items for Patrick

- [x] **Submit sitemap to Bing** — DONE
- [ ] **Run #409 migration** — `sneakPeekSentAt` field must be deployed before Sneak Peek emails fire. Copy-paste block in STATE.md § Next Session.
- [ ] **Update global CLAUDE.md** — both DATABASE_URL lines need current Railway password. (Sitting since S780.)
- [ ] **Chrome: log back in as artifactmi@gmail.com** — Chrome is still on Alice Johnson's test account after QA. Select artifactmi@gmail.com to restore your session.
