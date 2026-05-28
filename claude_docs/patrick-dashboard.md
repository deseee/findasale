# Patrick's Dashboard — Week of May 27, 2026

---

## What Happened This Week

Eleven sessions this week. S793 complete: 10 features Chrome-verified, 2 verified with caveat (Web Share API — OS dialog), 4 UNVERIFIED. Blocked Queue: 5 items (below 8 ceiling — new features can resume).

**S793 (today) — QA batch: GEO features + S696 features + newly-unblocked shopper features:**
- **#223 Organizer Guidance Layer** ✅ — Efficiency Coach tips toggle and Sale Progress tracking confirmed with real hold data.
- **#230 Smart Buyer Intelligence** ✅ — Who's Coming widget showed Leo Thomas (SCOUT rank, "follows you") on organizer dashboard.
- **#387 SSR Public Pages** ✅ — /about page confirmed returning full HTML server-side.
- **#432 AggregateOffer JSON-LD** ✅ (P2 bug) — Sale page has correct JSON-LD schema. Bug: lowPrice shows "0" instead of actual minimum price. Dispatch next session.
- **#433 ai-plugin.json** ✅ — /.well-known/ai-plugin.json confirmed live and valid.
- **#434 llms.txt** ✅ — /llms.txt confirmed live with correct content.
- **#439 Per-item Product Schema** ✅ — Product JSON-LD confirmed per item on claimed sale page.
- **#440 Machine-readable sr-only block** ✅ — sr-only block confirmed in page source.
- **#441 PaymentMethod Schema** ✅ — paymentAccepted field confirmed in JSON-LD.
- **#405 Founding Organizer Badge** ✅ — 🏆 badge confirmed on organizer profile settings page.
- **#412 Cash-to-Digital Bridge** ✅ — Venmo + Zelle confirmed in POS payment options.
- **#415 Junk Drawer Donation Kit** ✅ — "Donate Items & Get Tax Receipt" option confirmed in settlement Receipt step.

**Partial ⚠️ — button confirmed, Web Share API triggers OS dialog (can't verify via automation):**
- **#272 Post-Purchase Share Your Haul** — /shopper/checkout-success page correct, "📣 Share your haul" button present and fires Web Share API.
- **#273 Rank Achievement Share** — RANK_UP notification created for Leo (501 XP). Share button confirmed at /shopper/notifications. Web Share API fires.

**4 features still UNVERIFIED (added to Blocked Queue):** #402 Cover the Fee toggle (can't find the UI), #435 Bot Tracking (need real crawler), #457 Noindex stale scraped (need test data), #458 Confidence Score (may be API-only).

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

1. **S793 push ready** — roadmap.md + STATE.md + patrick-dashboard.md updated. Push block below.

2. **P2 bug dispatch (next session):** Fix AggregateOffer lowPrice:"0" in JSON-LD builder.

3. **New features can resume** — Blocked Queue at 5, below the 8-item ceiling.

---

## Action Items for Patrick

- [x] **Submit sitemap to Bing** — DONE
- [ ] **Update global CLAUDE.md** — both DATABASE_URL lines need current Railway password. (Sitting since S780.)
- [ ] **Chrome: complete Google sign-in** — Chrome is at the Google account chooser (accounts.google.com). Select artifactmi@gmail.com to restore your session.
