# Patrick's Dashboard — S844 Wrap

---

## What Happened This Session (S844)

DEV + QA session. One production bug fixed, one feature fully verified end-to-end.

**S831 Fix shipped:** `promote/[saleId].tsx` — `apiBase` changed from `process.env.NEXT_PUBLIC_API_URL` (direct Railway URL, cross-domain, SameSite=Lax was silently blocking the JWT cookie) to `'/api'` (same-origin Next.js proxy). This is why all promote-page exports were failing. One line fix.

**#461 FB Marketplace Export + Sold Nudge — ✅ FULLY VERIFIED**
- Navigated to promote page as Alice Johnson, clicked "Download Spreadsheet" → **200**, file downloaded, `fbExportedAt` stamped on 3 items in DB
- Went to edit-item, changed Silver Bracelet → SOLD, saved → redirected to dashboard
- Opened notification inbox → **"Mark sold on Facebook Marketplace"** appeared immediately, unread

**#27b iCal watermark ✅** applied to roadmap (evidence from S843).

---

## ⚠️ New P2 Bug — Share Card Preview 401

The "Share Card" section on the promote page shows a 401 on load — the share card image preview fails before any user interaction. Doesn't block exports (those are fixed), but the visual preview panel is broken for all organizers. Queued for `findasale-dev` next session.

---

## QA Account Reference (to prevent future confusion)

| Account | Name | Role | Owns |
|---------|------|------|------|
| user1@example.com | Alice Johnson | ADMIN + ORGANIZER | QA Test Flip Report Sale (0d9563f9-...) |
| user2@example.com | Bob Smith | ORGANIZER (PRO) | No sales |
| Seedy2025! | all seed accounts | — | — |

---

## Current State

**Blocked Queue: 4 items** (well below ≥8 ceiling — dev sessions available)

| Item | Status |
|------|--------|
| RSVP XP Monthly Cap (#267) | P0 — needs 5 RSVPs in one month to test cap |
| #332 Shopify Cross-Listing | P0 — needs Shopify Partners dev store |
| #293 eBay Post-Sale Panel | P0 — needs ended sale in DB |
| #335 Consignor Payout Email | P0 — run test payout to deseee@yahoo.com |
| Share-card preview 401 | P2 — new this session, promote page |

---

## Patrick Actions Required

1. **Push the fix** — see push block below
2. **Delete test invite SVPKNKV3:** finda.sale/admin/invites → Delete SVPKNKV3
3. **GBP phone verification:** business.google.com → "Verify now" → phone code
4. **#239 legal gate:** Attorney + CPA before live consignor payouts

---

## Next Session Options

1. **DEV: Share-card 401** — quick investigation, likely same /api proxy pattern as export fix
2. **QA backlog:** #32 Wishlist Alerts, #68 Command Center, #91 Auto-Markdown, #125 CSV Export
3. **P0 quick-wins:** #335 payout email (test against deseee@yahoo.com) · #293 end a sale in DB then QA eBay panel
