# Patrick's Dashboard — Week of May 21, 2026

---

## What Happened This Week

**S772 (latest — roadmap reconciliation audit, docs only):**
- Brought the roadmap back in sync with reality after ~30 sessions of QA drift. No code changed.
- ~45 finished features that were still mislabeled "Pending Chrome QA" are now marked SHIPPED & VERIFIED, with a clean summary table showing which session verified each one.
- Everything still genuinely waiting on a browser test (a handful of eBay items + #338 sold-price comps) is now grouped in one new "Pending Chrome QA Backlog" section — so what's left to test lives in one place.
- Cleaned up STATE.md: removed 38 already-closed tracking rows, kept the 7 that are still open.

**S771 (bug hunt: Sentry / Railway / crons):**
- Found Sentry being flooded by scraper noise: today's "Sentry capture" commit was firing a warning on EVERY zero-result scrape. Zero results is normal for small markets — it was burying real errors and burning quota. Fixed at source (now console.log, not Sentry).
- Closed a real latent crash (NODEJS-W, playwright-extra module-load TypeError) — confirmed already fixed in current code, resolved the stale Sentry issue.
- Filtered out Facebook in-app browser noise (NEXTJS-G "Java object is gone") via beforeSend.
- Verified: Railway backend Online, all crons reporting [CRON OK], no runtime errors. Slow-query Sentry warnings confirmed STALE (last fired May 8, transient scrape-load — no fix needed).

**S770 (MailerLite cleanup):**
- MailerLite free plan was FULL (500/500) — all new user signups were getting 413 errors (a1clcook@gmail.com was blocked). Root cause: the weekly `syncLeadTierGroups` cron was syncing ALL 56K+ scraped directory organizers to MailerLite, not just registered users. 498 of 501 subscribers were junk scraped emails.
- Purged all 498 junk subscribers. 4 legitimate subscribers remain.
- Fixed root cause: added `userId: { not: null }` filter to the cron query so only real registered users sync going forward.
- Fixed hex escape Prisma error: scraped HTML with `\x` byte sequences now sanitized before DB write (sale cmoog3n0l009tq4utw56ejcrx was failing).

**S769 (roadmap audit):**
- Roadmap corrected: #380 (FB Marketplace scraper), #418 (18-state scrapers), #331 (Voice-to-Tag Phase 2), #378 (Help Library) all marked SHIPPED. #364 (Bing) DEPRECATED. #460 (Auto-Liquidation) SUPERSEDED.

**S768 (CI fixes + Voice Location + eBay Custom Label):** Fixed 3 Sentry/CI issues. Built voice location extraction — say "living room" or "Bin B6" while recording and room field auto-fills. Added eBay Custom Label append toggles in settings. Recovered schema.prisma after truncation.

**S767:** Fixed all 3 eBay bugs (#424/#425/#426). Patrick verified #413 Safety Disclosures + #415 Donation Kit.

**S766:** Tier 2C/3A QA sweep. Fixed #363 lot number, #58 achievement hooks, #221 holds checkout.

---

## Pipeline Status

- **Outreach:** Running at warmup pace (~48/day). ✅
- **Queue:** 3,319 PENDING organizers. Pipeline healthy.
- **Source attribution:** 87.7% tagged. ✅
- **WARM enrichment:** Now running daily (was weekly). ✅

---

## Action Items for Patrick

### 1. Push S771 bug-hunt fixes:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/services/scraper/index.ts
git add packages/frontend/sentry.client.config.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: stop Sentry-capturing 0-result scrapes (noise flood); filter FB in-app browser instrumentation errors in beforeSend"
.\push.ps1
```
_Note: the prior S768/S770 code push appears already committed (today's git log covers it). After deploy, the 18 "GarageSaleFinder returned 0 results" Sentry issues will stop and can be bulk-resolved in the Sentry UI._

### 2. Run migration (verify if not already run — review-index + sku-toggle migrations from S768):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

### 3. Deploy email verification migration (when ready — pending since S726):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Next Up

1. QA after push: verify voice extraction (say "living room" in mic), verify eBay Custom Label preview in settings, re-verify #424/#425/#426
2. QA eBay Tier 2B batch (#428 review borders, #427 local pickup, #429 store template skip) — needs Patrick present + PRO + eBay connected
3. Sentry remaining: NODEJS-17 (organizers route ReferenceError), NODEJS-S (eBay account-deletion stream error), NODEJS-1Q (Review LEFT JOIN slow query)
4. Optional: check Railway logs for more 413 MailerLite errors (couldn't access from this session). a1clcook should auto-enroll on next login.
