# Patrick's Dashboard — S867 Wrap

---

## S867 QA Results — 3 bugs confirmed, 1 unverified

This session continued QA on the P2 bugs added in S866.

**Confirmed (need dev fix):**
- ❌ **Sale Type filter resets on Search** — selecting "Estate Sale" then clicking Search drops the filter, shows all types. Fix: 1 line in search.tsx form submit.
- ❌ **ZIP export copy: "once per 24 hours" → should say "once per month"** — Settings → Help → Your Data. Fix: 1 line in settings.tsx (line 2005).
- ❌ **UGC "Tag Your Find" button white in dark mode** — button renders as white box (`bg-white`) against dark background. Jarring but functional. Fix: swap to accent color.

**Unverified:**
- ⚠️ **YMAL black gap** — "You might also like" section loaded empty on every tested sale. Need a live active sale with AI recommendations to see the 300px gap. Data-dependent.

---

## Patrick Actions

**Still needed from S865 (email hardening — carries forward):**
```
git add packages/backend/src/jobs/organizerWeeklyDigestJob.ts
git add packages/backend/src/services/organizerAnalyticsService.ts
git add packages/backend/src/jobs/curatorEmailJob.ts
git add packages/backend/src/jobs/monthlyTrendReportJob.ts
git add packages/backend/src/services/weeklyEmailService.ts
git add packages/backend/src/controllers/ebayController.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: email-job volume fuses + digest gate + ebayController tail restore (S865) + QA STATE update S867"
.\push.ps1
```

**P0 items (your action required):**
1. **Email Verification migration** — `cd packages/database && $env:DATABASE_URL="[Railway URL]" && npx prisma migrate deploy` (134 sessions unrun)
2. **eBay OAuth on user1** — connect at /organizer/settings/ebay (blocks all eBay QA)
3. **Shopify dev store** — create at partners.shopify.com, connect via OAuth (blocks #332)
4. **Rarity Boost confirm** — XP-only at 50 XP or restore $0.15 cash rail? (P3)

---

## Blocked Queue: 16 rows → next session is QA MODE

Top priority: dispatch findasale-dev with the 3 confirmed P2 fixes (Sale Type filter, ZIP copy, UGC button) — all small targeted changes, can batch in one dispatch.
