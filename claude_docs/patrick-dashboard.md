# Patrick's Dashboard — S865b Wrap (BUG/AUDIT MODE)

---

## What Happened This Session (S865 + S865b correction)

**Root cause of the email outage — corrected after you called out the shallow attribution.** Google clamped outreach@finda.sale on Monday May 18 because `organizerWeeklyDigestJob` (Monday 9 AM cron) mass-sent **5,000+ "Performance Summary – 0 items sold" emails to scraped directory organizers** — 2.5× the 2,000/day Workspace limit in one morning. Outreach sent 29 emails that day and was not the cause. The digest's recipient query swept in any scraped organizer whose imported sales were less than 30 days old; it has no kill switch and no volume cap. Every email since May 18 — payouts, password resets, everything — has bounced back from Gmail with "you have reached a limit for sending mail."

**Fixed this session (all coded, pending your push):**
- Digest job gated OFF by default (`ORGANIZER_DIGEST_ENABLED` env var) + recipient filter now structurally excludes scraped orgs (DB-verified: matches exactly the 2 real organizer accounts; 16,788 scraped orgs were blast-eligible before).
- Volume fuses on every bulk email job — no single job can send more than 1,000/run ever again (digest 300, trend report 300, curator 1,000, shopper weekly 1,000).
- Bonus catch: `ebayController.ts` was truncated in your working tree (would have broken the next Railway build). Repaired — tail restored from GitHub, your uncommitted EPN comment edit preserved.

**Outreach status:** wasn't the cause, but it stays paused ~24h more for one reason — every send still bounces while the clamp is active, and bounced sends would mark leads as "contacted" when they never got the email. The scheduled task tomorrow at 10 AM re-tests delivery and **automatically re-enables outreach** (env var + GitHub workflow) the moment the test comes back clean.

---

## Patrick Actions Required

1. **Push the S865b batch:**
   ```
   git add packages/backend/src/jobs/organizerWeeklyDigestJob.ts
   git add packages/backend/src/services/organizerAnalyticsService.ts
   git add packages/backend/src/jobs/curatorEmailJob.ts
   git add packages/backend/src/jobs/monthlyTrendReportJob.ts
   git add packages/backend/src/services/weeklyEmailService.ts
   git add packages/backend/src/controllers/ebayController.ts
   git add claude_docs/STATE.md
   git add claude_docs/patrick-dashboard.md
   git add claude_docs/strategy/roadmap.md
   git commit -m "fix: gate organizer digest + recipient filter + volume fuses on all bulk email jobs (May 18 blast root cause) + restore ebayController tail"
   .\push.ps1
   ```
2. **Rarity Boost pricing** — XP-only at 50 XP or restore $0.15 cash rail? (P3, carried)
3. **GBP phone verification** — business.google.com → "Verify now". (carried)

Note: the weekly performance digest to your 2 real organizers is now OFF until you decide to turn it on (`ORGANIZER_DIGEST_ENABLED=true` in Railway). Given it just caused a 17-day email outage, leaving it off until the recipient filter has been live for a while is the safe call.

---

## Blocked Queue: 10 rows → next session is QA MODE

Top items: #335 (clamp re-test scheduled for tomorrow 10 AM — auto-re-enables outreach on clean test), #332 Shopify (needs dev store), Email Verification migration (your PowerShell run), eBay OAuth on user1.
