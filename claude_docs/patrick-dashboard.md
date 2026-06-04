# Patrick's Dashboard — S865c Wrap (BUG/AUDIT, deep pass)

---

## The email outage — final, fully-verified picture

Two separate problems. The second is the one that matters now.

**1. May 18 trigger (already fixed same-day, before this session):** the organizer weekly digest job blasted ~1,900+ "Performance Summary – 0 items sold" emails to scraped orgs starting 5:00 AM ET Monday May 18. The account hit Google's limit at 6:08 AM — first bounce was a digest addressed to scraped business "Mid South Real Estate." A May 18 commit ("digest suppression for unmanaged orgs") patched it that same day — the May 25 and June 1 digest runs sent only 2 emails each. This session added belt-and-suspenders anyway: kill switch (`ORGANIZER_DIGEST_ENABLED`, default off), hardened recipient filter, and volume fuses on every bulk email job (no job can exceed 1,000 sends/run).

**2. Why email stayed dead for 17 days (the real open problem):** Google put the account into a **sending suspension**, and the normal 24-hour auto-recovery never happened because ~30 sends/day (outreach cron every 4h + transactional triggers) kept re-tripping it every single day. Verified today: an internal self-send DELIVERS fine (no bounce); any external send is accepted then bounced with "you have reached a limit." The account isn't broken — it's suspended for external sending only.

## THE FIX — 2 minutes, admin-only (I can't enter your password)

admin.google.com → Directory → **Users** → click **outreach@finda.sale** → read the banner at top-left (it states the suspension reason — tell me what it says) → click **Reactivate** (top right) → confirm. Sending re-enables within ~15 minutes. Google allows this reset **5× per calendar year**. Source: Google Workspace Admin Help, "Restore a suspended Gmail account."

With outreach paused since this morning, the suspension may also auto-clear within 24h on its own — but Reactivate is immediate.

## Outreach status

Paused (GH workflow disabled + OUTREACH_ENABLED=false) — not because it caused this, but because sends during suspension just bounce AND mark leads as "contacted" when they never got the email. The scheduled task (tomorrow 10 AM) re-tests delivery and **auto-re-enables outreach** the moment a test send goes through clean. If you click Reactivate today, tell me and I'll re-test and re-enable immediately instead.

---

## Patrick Actions

1. **Reactivate the account** (steps above) — this is the only blocker on all email.
2. **Push the S865b/c batch:**
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
   git commit -m "fix: email-job volume fuses + digest gate + ebayController tail restore (S865)"
   .\push.ps1
   ```
   (Skip any file `git status` shows as unchanged — Vercel/Railway are green, so part of the batch may already be in.)
3. **Rarity Boost pricing** — XP-only at 50 XP or restore $0.15 cash rail? (P3, carried)
4. **GBP phone verification** — business.google.com → "Verify now". (carried)

---

## Blocked Queue: 10 rows → next session is QA MODE

Top items: #335 (Reactivate + re-test — payout email to Jane Thrift after sending restored), #332 Shopify (needs dev store), Email Verification migration, eBay OAuth on user1.
