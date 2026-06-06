# Patrick's Dashboard — S888 Wrap

---

## S888 Summary — DEV: Facebook Marketplace IP bypass shipped via Cloudflare Worker.

**Problem fixed:** Railway runs on GCP (AS396982), and Facebook's GraphQL endpoint silently blocks GCP/AWS/Azure ASNs — returns `200 OK` with HTML content but zero listings. That's why FB Marketplace has 0 records in the DB after months of scheduled runs. Live test 2026-06-05 confirmed direct Railway calls return 0 listings; same call routed through a Cloudflare Worker (AS13335) returned a real GraphQL JSON response (rate-limited from earlier testing, but reaching the FB API).

**What got built:**
- `cloudflare/fb-marketplace-proxy/worker.js` — Cloudflare Worker. POST /fb-graphql with bearer auth forwards the form-urlencoded body to facebook.com/api/graphql/ from CF's edge IPs.
- `cloudflare/fb-marketplace-proxy/wrangler.toml` — deploy config (mirrors the existing image-proxy worker pattern).
- `packages/backend/src/services/scraper/sources/facebook-marketplace.ts` — adds `USE_FB_PROXY` env-driven branch. When `FB_MARKETPLACE_PROXY_URL` and `FB_MARKETPLACE_PROXY_TOKEN` are both set, the scraper sends requests through the Worker. Otherwise falls back to direct (preserves local-dev behavior).

**Free tier headroom:** 100k requests/day on the Cloudflare free plan. Scraper does ~129 requests per full pass (43 metros × 3 queries) — well under the cap, even at multiple runs/day.

**S888 status (Jun 5 — SHIPPED + LIVE):**
- ✅ Code pushed (commits `dd745249` + `beb520f5` + `a641dd42`).
- ✅ Cloudflare Worker deployed at `https://findasale-fb-proxy.findasale.workers.dev`. Subdomain enabled, PROXY_TOKEN secret set. Health check returns 200 OK.
- ✅ Railway env vars set (`FB_MARKETPLACE_PROXY_URL`, `FB_MARKETPLACE_PROXY_TOKEN`). Backend redeployed.
- ✅ Production logs confirm `[FacebookMarketplace] Transport: CLOUDFLARE_WORKER`. Scraper requests are reaching Facebook's GraphQL API (returning FB's `Rate limit exceeded` JSON, not the HTML/0-listings IP block).
- ⏳ Records in DB still 0 — FB rate-limited us from the day's testing. Clears in ~30-60 min. Next scheduled scrape (or a manual re-trigger after the cooldown) will start ingesting real listings.

**No action needed from you.** Pipeline is wired end-to-end. Watch `SELECT COUNT(*) FROM "Sale" WHERE "sourceName" = 'FacebookMarketplace';` over the next 1-2 hours.

---

## S887 Summary — DEV: Gmail quota guard + monitoring crons deployed. AuctionNinja → Railway.

**Root cause fixed — 8,317-email blast (Jun 5):** The daily email counter was an in-memory variable that reset to zero on every Railway restart/deploy. After any deploy, the pipeline thought it had sent 0 emails and started from scratch. Fixed: DB-backed `EmailQuotaLog` table now persists the count across restarts. Hard stop at 1,500 emails/day (leaves buffer below Google's 2,000 cap). When you hit 75% (1,125 emails), a Resend alert fires to deseee@gmail.com. Migration deployed ✅.

**Gmail monitoring — now automated:**
- **06:30 UTC daily** — Tests Gmail OAuth token. Emails you if it breaks (silent failure prevention).
- **08:00 UTC daily** — Yesterday's send count summary (only if emails were sent).
- **Every 2 hours** — Checks if pipeline is quota-blocked and alerts you if so.
- **Sundays 19:00 UTC** — Bounce rate check. Alerts if >2% bounce rate.

**AuctionNinja:** Moved from GitHub Actions (Cloudflare-blocked) to Railway backend cron. Runs Wednesdays 06:00 UTC. Won't know if it works until next Wednesday — check Railway logs.

**#335 (email suspension):** Code guard now prevents recurrence. Account is in the automatic 18-hour suspension window from the Jun 5 blast. Once it clears (~Jun 6 midnight), see the resume procedure below.

**S889 — "outreach still sending" investigated, no leak found.** The trickle of sends you were worried about stopped on its own after the Jun 5 evening backend redeploy. What happened: the kill-switch (`OUTREACH_ENABLED=false`) was set in Railway during S887, but a running server keeps its old settings until it restarts — so the last 7 emails (07:59 UTC Jun 5) went out on the old setting. The backend redeployed at 22:39 UTC Jun 5 and picked up the new value. Since then: zero sends across every 4-hour window. Two independent safeguards are now active (the disabled GitHub workflow AND the backend kill-switch), so nothing will send until you deliberately resume. No code change was needed — the system was already wired correctly.

**Safe resume procedure (when you're ready, after the Gmail account is reactivated):**
1. Reactivate `outreach@finda.sale` at admin.google.com → Directory → Users → Reactivate (Google's UI, only you can do this).
2. In Railway, set `OUTREACH_ENABLED=true` on the backend service. (The backend auto-redeploys and picks it up.)
3. Re-enable the GitHub workflow **"Pipeline — Outreach Emails"** (it was disabled Jun 5; flipping the Railway flag alone will NOT resume sending — the workflow is the trigger).
4. Safeguards that protect you during warmup: backend enforces a per-window quota (daily quota ÷ 6) and a hard daily cap of 1,500 sends (EmailQuotaLog), with a Resend alert at 75%. Keep the warmup quota low (~200/day) for the first 2+ weeks.

---

## Blocked Queue: 4 items

| Item | Priority | Status |
|------|----------|--------|
| #332 Shopify Cross-Listing | P0 | Needs your Shopify Partners dev store (73+ sessions) |
| #335 Email suspension | P1 | Code guard deployed; S889 confirmed no active leak. **YOUR ACTION (when ready to resume):** reactivate Gmail account → set `OUTREACH_ENABLED=true` in Railway → re-enable the "Pipeline — Outreach Emails" GitHub workflow. Max 200/day during warmup. |
| AuctionNinja scraper | P2 | Railway cron added S887. Verify next Wednesday 06:00 UTC in Railway logs. |
| #230 Smart Buyer Widget | P3 | Needs published sale on user1 |

---

## Your Actions

1. **Push block below**
2. **#335:** Set `OUTREACH_ENABLED=true` in Railway once 18h suspension clears (check admin.google.com — should clear ~Jun 6)
3. **GBP:** business.google.com → "Verify now" → phone code (still pending)
4. **prisma generate** locally: `cd packages/database && npx prisma generate`

---

## Push Block — S888 (one-shot deploy)

S888 code was pushed via MCP. Sync local git, push STATE.md, then run the deploy script.

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git fetch origin main
git pull origin main
# STATE.md was updated locally this session — push it now:
git add claude_docs/STATE.md
git commit -m "S888: STATE.md wrap (FB Marketplace IP bypass shipped)"
.\push.ps1

# Then deploy the Cloudflare Worker (one command, prompts for CF token):
cd cloudflare\fb-marketplace-proxy
.\deploy.ps1
# Copy the two env-var lines it prints into Railway -> backend -> Variables.
# Railway will auto-redeploy.
```

If you don't have a Cloudflare API token, create one here (Workers Scripts: Edit):
https://dash.cloudflare.com/profile/api-tokens
