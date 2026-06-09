# Patrick's Dashboard — June 9, 2026 (Updated: S933)

**Generated:** Monday, June 9, 2026 (S933 — BUG/DEV: BQ cleanup + competitor email domain blocking)

---

## S933 Quick Summary

BQ 5→1. Competitor email domain blocking shipped.

**BQ cleanup:** Verified each remaining BQ item directly against the Railway DB. #335 is already running (658 outreach emails sent, cron active). The WARM leads backfill is done (0 orgs with email missing a DCE row). WARM enrichment is growing naturally (3.5%→4.7%) — not a bug, removed from BQ. GSF geocoding gap is structural/by-design with a frontend fallback to zip/city — removed. BQ is now 1 item (#332 Shopify, P0, your call when you have a test store).

**Domain blocking:** `estatesales.net` and `estatesales.org` are now blocked at the domain level across all three email rails — transactional (Resend), outreach cron, and the two seeder scripts. Any address @estatesales.net or @estatesales.org will be silently skipped before a send is attempted. Sync/in-memory — no DB call, zero performance cost. Deploy confirmed green.

---

## Project Status

| Area | Status |
|------|--------|
| BQ (Blocked Queue) | **1 item** — well below QA ceiling (8), DEV available |
| GA4 Analytics | ✅ LIVE (CSP fixed S926, conversion events added S928 — needs Chrome QA) |
| Email (transactional) | ✅ On Resend rail (payouts, auth, receipts) |
| Email (competitor blocking) | ✅ estatesales.net/org blocked across all rails |
| Outreach | ⏸ Paused (intentional, domain warming — 37 PENDING queue ready) |
| Backend / Railway | ✅ Healthy |
| Frontend / Vercel | ✅ Deployed |

---

## What You Need to Do

```powershell
git add claude_docs/STATE.md claude_docs/patrick-dashboard.md
git commit -m "S933 wrap: BQ 5→1, competitor domain blocking shipped, STATE updated"
.\push.ps1
```

---

## S934 Recommendation

BQ=1 (ceiling=8 — DEV available).

**QA pass — these features are built but unverified in Chrome:**
- **#470 GA4 Conversion Events** (built S928) — open GA4 → Realtime → Events, then trigger an action (sign up or create a sale), verify events fire
- **#463 Claim Button Click Tracking** (built S807) — visit an organizer profile, click Claim, check Vercel Analytics → Events tab
- **#164 Tiers Backend Infrastructure** — flagged UNVERIFIED since S804; log in as organizer, verify tier display

**DEV candidates:**
- **SEO3 Denver city landing page** — `/estate-sales/denver-co` targeting GSC impression cluster
- **#471 Bounce Suppression Auto-Ingestion** — build before outreach resume; mailer-daemon parser not built
- **#472 Email Send Automation** — POST /admin/send-test-email endpoint

---

## Weekly Brand Drift Alert — 2026-06-09

**Automated scan complete. No P0/P1 violations found. All core user-facing copy is compliant.**

Two P3 copy gaps and one P3 dark mode gap flagged:

1. **About page meta/OG descriptions** — too generic, don't mention any sale types (D-001 weak). Route to `findasale-marketing` for updated copy.
2. **Pricing page meta/OG descriptions** — too generic, no sale type mentions (D-001 weak). Route to `findasale-marketing`.
3. **SearchFilterPanel.tsx** lines 298, 314, 345 — "Clear Filters" button and result count text missing `dark:` variants (D-002). Route to `findasale-dev`.

Full report: `claude_docs/audits/brand-drift-2026-06-09.md`
