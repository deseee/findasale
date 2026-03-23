# Next Session Prompt — S252

**Date:** 2026-03-23 (S251 decisions recorded)
**Status:** All 6 strategic decisions locked and documented. Ready for dev + QA dispatch.

---

## FIRST TASK — Live smoke test (carry-forward from S250)

Run Chrome MCP against finda.sale. Log in as user11@example.com and verify key data-dependent features show real data: Loot Log, Loyalty, Trails, Collector Passport, Purchases, Bids, Wishlists/Alerts, Notifications, Leaderboard. These were empty before S250 seed overhaul.

---

## S252 Priority 1 — Dev Dispatch: Wishlist Consolidation + Page Removals

**Decision:** All 6 items locked in S251 (decisions-log.md D-011 through D-016).

**Dispatch to findasale-dev:**
1. **Wishlist consolidation** (D-012, FV1/AL1/PR5) — Merge `/shopper/favorites` + `/shopper/alerts` into `/shopper/wishlist`. Single nav label. Items have per-item notification toggle. Remove redundant pages.
2. **Pricing page copy update** (D-013, P3) — Update pricing page to match support tier definitions exactly: SIMPLE (FAQ), PRO (48h email), TEAMS (24h + onboarding), ENTERPRISE (named contact, 4h). Reference D-013.
3. **Page removals** (D-014) — Remove `/organizer/premium` and `/organizer/upgrade`. All upgrade CTAs redirect to `/pricing`. All plan management CTAs redirect to `/organizer/subscription`.
4. **Settings/Profile split** (D-015) — Ensure Profile pages (organizer + shopper) are read-only identity hubs. Move write-heavy controls (email, password, notifications, privacy, payments) to Settings pages. Push notifications toggle → Settings only.
5. **Shopper settings trim** (D-016) — Shopper settings stay minimal. Do NOT add organizer-specific features (API keys, webhooks, team management). Post-beta additions: payment methods, notification preferences, privacy controls.
6. **Sale Interests audit** (D-012) — Check if "Sale Interests" section on organizer profile is live or dead code. If live: rename to "Follow Organizers" and move to shopper settings subscriptions. If dead: remove.

**Context:** decisions-log.md D-011 through D-016 have the full specs. Reference them in dispatch.

---

## S252 Priority 2 — QA Dispatch: Double Footers + Missing Routes

**Decision:** TR1/OP1/OS3 missing routes + double footers need browser QA diagnosis.

**Dispatch to findasale-qa:**
1. **Double footers** (I2, CP3, LY11, AL5, TR2, S3) — Chrome MCP full-page screenshots of Inventory, Collector Passport, Loyalty, Alerts, Trails, Sales pages. Identify which page has duplicate footer element(s). Report exact component/page + fix recommendation.
2. **TR1 — Trails "Create Trail" button** — Currently links to `/shopper/trails/create` (404). DECISION: Patrick decided this in S251 — [pending review of S251 transcript]. Implement accordingly (REMOVE / REDIRECT / BUILD).
3. **OP1 — Organizer "Start Verification" button** — Currently links to `/organizer/verification` (404). DECISION: Patrick decided this in S251 — [pending review]. Implement accordingly.
4. **OS3 — Workspace public URL** — Settings shows `finda.sale/workspace/your-slug` (broken link). DECISION: Patrick decided in S251. Implement accordingly.

---

## Patrick Action Items (carry-forwards)

- [ ] Push S251 wrap docs (decisions-log.md, STATE.md, session-log.md, next-session-prompt.md, patrick-dashboard.md)
- [ ] Install findasale-dev.skill via Cowork UI (carry-forward from S248)
- [ ] Install findasale-qa.skill via Cowork UI (carry-forward from S248)

---

## Context Loading

- Read `claude_docs/decisions-log.md` — D-011 through D-016 (locked specs for S252 dev dispatch)
- Read `claude_docs/S248-walkthrough-findings.md` — FV1, AL1, PR5 (wishlist consolidation items), P3 (pricing copy), I2, CP3, LY11, AL5, TR2, S3 (double footers), TR1, OP1, OS3 (missing routes)
- Test accounts: Shopper `user11@example.com`, PRO `user2@example.com`, ADMIN+SIMPLE `user1@example.com`, TEAMS `user3@example.com` (all `password123`)
