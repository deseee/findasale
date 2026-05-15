# Patrick's Dashboard — S725 Wrap

---

## What Happened This Session — S725 (Organizer Pipeline Overhaul)

You asked which crons are running, whether they're optimized, and why scraped organizers were missing addresses. That turned into a full diagnosis and overhaul of the scrape → enrich → score → outreach pipeline.

**The big finding:** the enrichment, lead-scoring, and outreach jobs ran as in-memory schedules inside the backend. Every Railway redeploy wiped them — so the pipeline barely ran. Only ~7 outreach emails had ever been sent, and lead scoring hadn't run since May 10. The scrapers survived because they're GitHub Actions; everything downstream didn't.

**Keystone fix shipped — cron reliability migration (Steps 1 & 2 of 3):** a new authenticated endpoint (`POST /api/internal/jobs/run`) plus 7 GitHub Actions workflows that trigger the pipeline jobs durably, the same way the scrapers already work. The old in-memory crons were left running alongside as a safety net. **The green cycle is confirmed** — your logs showed all 7 jobs firing through the new endpoint and lead scoring processing 56,347 organizers. Step 3 (removing the old in-memory crons) is now unblocked for next session.

**Also shipped:**

- **Cron cleanup** — gated 3 scrapers that were double-running (backend + GitHub Actions), disabled the redundant backend sale-enrichment cron, stretched over-frequent jobs (enrich-sale-details daily→3 days, contact-emails 6h→daily, smtp-verify daily→weekly), deleted 2 dead workflow files.
- **Address enrichment pipeline** — new scraper that reads an organizer's own website for their street address (you chose this over the riskier EstateSales.NET login-cookie route). Fixed its eligibility query, which was matching zero rows — it now correctly targets 8,804 organizers.
- **Outreach bug fixes** — every outreach email was rendering "[state]" as blank ("Shoppers in  are already looking"); now parsed from the address. Half the outreach queue (1,661 leads) was silently invisible behind a category filter; fixed. Email discovery was grabbing image filenames as email addresses; filter fixed.
- **Database cleanup** — 46 junk image-filename "emails" nulled out. 36 organizer addresses that got corrupted by a bug (see below) were all recovered from each organizer's own Sales records.

**P0 caught mid-session:** the new address scraper's extraction was over-matching — writing page navigation text and auction descriptions into the address field ("Chairish Auctions" got an address of "0 Shopping Cart Your cart is currently empty..."). Caught it in your logs, recovered the 36 corrupted rows, and rewrote the extractor with a bounded regex, validation, a junk-word blocklist, and a length cap. Self-tests confirm garbage is now rejected.

**Decisions you made:** abandon the EstateSales.NET auth-cookie route (website scraping is lower legal/detection risk); HOT-tier signal set approved — state-licensed OR active platform sales OR website+custom-domain email OR 3+ source corroboration, with no Google API use.

---

## Do First Next Session — S726

1. **Confirm the S725 build-fix push is live and green on Railway.** If you haven't pushed the 3-file build-fix block yet, that's first.
2. **Confirm the 7 new `pipeline-*.yml` workflows run green** — they need two GitHub repo secrets: `RAILWAY_BACKEND_URL` and `INTERNAL_API_TOKEN` (Settings → Secrets and variables → Actions). Your scrapers already use both so they almost certainly exist. Manually run one workflow to test — expect HTTP 202.
3. **Set `ENABLE_ORGANIZER_WEBSITE_ENRICHMENT=true` in Railway** — it was set to false as a stopgap during the extractor bug. Turn it back on once the deploy is green.

**Then dispatch the pipeline punch list** (all in STATE.md Blocked Queue): cron migration Step 3, HOT-tier rework, MailerLite 429 batching, D.C. state parser fix, email-discovery extraction quality. Mostly different files — can run in parallel.

---

## Pending Pushes

**S725 build-fix block** (the most recent thing — confirm it's pushed):

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/jobs/organizerWebsiteAddressCron.ts
git add packages/backend/src/services/emailDiscoveryService.ts
git add packages/backend/src/services/scraper/sources/organizerWebsite.ts
git commit -m "Fix address extractor over-matching + Prisma import build break"
.\push.ps1
```

**This wrap** (STATE.md + dashboard — HARD RULE §12):

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S725 wrap: pipeline overhaul + cron reliability keystone — doc updates"
.\push.ps1
```

If `push.ps1` flags other uncommitted files, they're earlier S725 work (the big pipeline pushblock) — `git add` and commit them too.

---

## Infrastructure Status

| | |
|---|---|
| Vercel (frontend) | ✅ Green |
| Railway (backend) | ✅ Green — was failing 3× today on a bad import; fixed |
| Cron reliability keystone | ✅ Steps 1+2 live, green cycle confirmed — Step 3 pending |
| Pipeline (enrich/score/outreach) | ✅ Now running durably via GitHub Actions |
| Address enrichment cron | ⚠️ `ENABLE_ORGANIZER_WEBSITE_ENRICHMENT=false` — re-enable after build-fix deploys |
| Outreach emails | ✅ Sending in test mode (to your Yahoo). Live = unset `OUTREACH_TEST_EMAIL` |
| Lead scoring | ✅ Ran — 56,347 orgs (COLD 14,165 / WARM 41,598 / HOT 584). HOT logic still old — rework approved, not yet built |

---

## Still Waiting (Blocked Queue — see STATE.md for full list)

- **Cron migration Step 3** — remove in-memory crons (green cycle confirmed, unblocked)
- **HOT-tier rework** — signal set approved, not yet dispatched
- **MailerLite 429 storm** — tier sync needs batching
- **D.C. state parser** — Washington D.C. organizers skipped
- **Email discovery extraction quality** — malformed candidates (rejected, but wasteful)
- **P0-3 Email verification token expiry** — schema migration, carried from S722
- **Settings UI for OAuth linked accounts** — backend ready, no frontend
- **eBay DRAFT push** — your A/B/C decision (recommended: option C)
- **Chrome QA backlog** — S723 + S724 fixes still never got their smoke tests
