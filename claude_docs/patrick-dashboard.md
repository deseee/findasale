# Patrick's Dashboard — June 8, 2026 (Updated: S926 ANALYTICS)

**Generated:** Monday, June 8, 2026 (S926 — Analytics automation built and scheduled)

---

## S926 Quick Summary

Analytics are no longer just collecting data — they're now automated weekly intelligence.

**What got built:** A Python script (`claude_docs/scripts/analytics-weekly.py`) that pulls from both Google Analytics 4 and Google Search Console using the service account you set up this session. Every Monday at 9:30 AM (right after the competitor report at 8:00 AM), Cowork will automatically run this and give you:
- Week-over-week traffic change (is the site growing?)
- Top 10 pages by sessions
- Top traffic sources (organic, direct, referral)
- Top 25 search queries with click/impression/position data
- SEO quick wins — queries in positions 5–20 with >50 impressions (these are the highest-ROI fixes: a better title tag on a page already ranking #8 compounds indefinitely)
- One recommended action for the week

---

## What You Need to Do (Before the Task Runs Monday)

**Step 1 — Add service account to GA4:**
1. Go to analytics.google.com
2. Admin → Account Access Management
3. Add users → paste the `client_email` from your GOOGLE_SERVICE_ACCOUNT_JSON
4. Role: Viewer → Add

**Step 2 — Add service account to Search Console:**
1. Go to search.google.com/search-console
2. Settings → Users and permissions
3. Add user → same email → Full user

**Step 3 (optional but recommended) — Pre-approve tool permissions:**
- Cowork sidebar → Scheduled → findasale-analytics-weekly → Run Now
- This lets the task pre-approve the Railway/bash tool access so Monday's run doesn't pause for prompts.

---

## Pushblock (S924 + S925 + S926 combined docs)

Run this from your PowerShell in the project root:

```
git add claude_docs/strategy/roadmap.md claude_docs/STATE.md claude_docs/patrick-dashboard.md claude_docs/scripts/analytics-weekly.py
git commit -m "S924-S926: CSRF verified, logout verified, #463 CODE-ONLY, analytics automation built"
.\push.ps1
```

Note: `packages/backend/src/middleware/csrf.ts` is already on GitHub (commit 44dabb618). Your local `push.ps1` will auto-merge it.

---

## Blocked Queue — 5 items (✅ below QA ceiling — DEV available)

| Item | Priority | Status |
|------|----------|--------|
| #332 Shopify integration | P0 (age: 130+ sessions) | Patrick connects test store |
| #335 Outreach resume | P2 | Intentional hold — domain warming |
| #462 WARM leads enrichment | P2 | Needs dev dispatch (do during outreach resume) |
| WARM tier website enrichment | P2 | Needs supplemental data source |
| GarageSaleFinder 80.7% un-geocoded | P3 | Needs GSF-specific geocode strategy |

---

## Feature Status (Recent)

| Feature | Status | Session |
|---------|--------|---------|
| Analytics automation | ✅ Script built + task scheduled (Mondays 9:30 AM) | S926 |
| #462 CSRF fix on outreach endpoints | ✅ CSRF layer live, attribution UNVERIFIED (needs real click) | S924/S925 |
| #463 Claim-click tracking | CODE-ONLY — check Vercel Events tab | S925 |
| Logout flow | ✅ Chrome-verified — session fully clears | S925 |
| #196 Buying Pools | ✅ Chrome-verified live | S922 |
| #201 Favorites (3 bugs) | ✅ Chrome-verified live | S922 |
| SEC-001 SQL injection | ✅ Chrome-verified live | S922 |
| SEC-002 Multer MIME filter | ✅ Chrome-verified live | S922 |
| #210 Streaks | ✅ Chrome-verified | S921 |
| #198 Reviews (shopper submit) | ✅ Chrome-verified | S920 |
