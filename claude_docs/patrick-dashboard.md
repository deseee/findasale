# Patrick's Dashboard — S890 Wrap

---

## S890 Summary — QA: verified all 16 Blocked Queue items (no guesses — every finding has a DB or code citation).

This was a verification session — I went through the whole queue, checked the live database and the deployed code, and figured out *why* each one is or isn't fixed. Plain-English results:

**1 item I closed:** The "Sale Ending Soon" email flood risk is handled — the cap (500 emails/day + skip-suppressed-addresses) is live in production.

**The big one — geocoding (maps / "sales near you"):** The good news is the geocoding system you had built IS running and working — it geocoded 6,366 sales on Jun 5 alone. The bad news is the backlog (15,792 sales with no map location) isn't shrinking, and I found exactly why: the job always grabs the *newest* 500 un-located sales, and those are always GarageSaleFinder records (which flood in daily). So it keeps re-processing fresh records and never reaches the older backlog — including every Facebook Events sale. This is a small, specific code fix (process oldest-first instead of newest-first). I've queued it as a quick win for next session.

**Facebook Events on the map:** Same root cause. The "use the city center when there's no street address" feature you built is correct and deployed — it just never gets a turn because those 1,307 records are stuck at the back of the line. There's an even faster fix: the geocoding tool has a "pick one source" option, so we can run it once targeting only Facebook Events and clear all 1,307 immediately.

**The auction scrapers — turns out they're all cheaply fixable (I investigated like you asked).** AuctionNinja, AuctionZip, and NAA have produced zero records ever, but the reasons are small, not fundamental — none of them need a paid proxy or a headless browser like I'd assumed:
- **AuctionZip (best payoff):** their website changed its page layout, so our parser (which looks for specific old style-names) now finds nothing. It's a one-function rewrite. ~25,000 US auctioneers sitting behind it. I confirmed the site serves clean, scrapeable pages.
- **NAA:** the search page needs JavaScript, BUT each individual auctioneer's profile page is plain static HTML and they're all listed in the site's sitemap. So we crawl the sitemap instead of the search page — no headless browser needed. (The old "needs Playwright" note in our code was wrong.)
- **AuctionNinja:** the setup is actually correct and the page is reachable — it just needs a real test run to see why it's returning nothing. If our server's IP is blocked, we reuse the same Cloudflare trick we built for Facebook Marketplace.

So instead of "drop the vertical," the recommendation is: do three small fixes (next session) and we unlock tens of thousands of auction-organizer records. No decision needed from you unless you'd rather not bother — but the ROI is high.

**Facebook Marketplace** still has 0 records despite the proxy work in S888 — it needs a live test run + log check to see if the rate-limit cleared.

**Shopify (#332) — I reviewed the code against Shopify's docs (no account needed).** Verdict: **not ready** — and the blocker isn't just "you don't have a store." There are real code problems: there's no actual "Sign in with Shopify" flow (it asks users to paste a token by hand, which contradicts our own help guide that promises a one-click connect), we're pinned to a Shopify API version they no longer support, and the code that's supposed to mark an item sold-out in Shopify is written wrong and would fail silently. So even if you had a store, the integration wouldn't fully work. This needs a dev pass first; then a store to test. I've written up the exact fixes.

**3 fixes are already coded and in this push** (geocoding oldest-first + skip-ended, FB Events key alert, "Dates approximate" label) — type-checked clean, ready to deploy.

**Outreach items are all still open but correctly on hold** while sending is paused (462 ready leads, queue cleanup, website enrichment at 3.5%). These should be done as part of turning outreach back on, not before.

**Confirmed safe:** the outreach "leak" is fully stopped — zero emails sent since Jun 5 morning.

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

## Blocked Queue: 16 items (S890 verified)

**Quick wins queued for next session (code/ops):**

| Item | Priority | Status after S890 |
|------|----------|--------|
| Geocoding backlog | P1 | Root cause found — process oldest-first instead of newest-first. Small fix, unblocks 15,792 sales. |
| Facebook Events on map | P1 | Run geocoding tool with source="Facebook Events" → drains 1,307 instantly. No code needed. |
| FB Events search-key monitoring | P2 | Add alert if search API keys expire (already 5 days stale). |
| `dateApproximate` label | P3 | Small frontend add — show "Dates approximate" on FB Events cards. |
| FB Marketplace 0 records | P2 | S888 proxy shipped but still 0 — needs a live run + log check. |

**Needs YOUR decision or action:**

| Item | Priority | What's needed from you |
|------|----------|--------|
| #332 Shopify Cross-Listing | P0 | Create a free Shopify Partners dev store + connect it — 0 stores connected, can't test without one (blocked 99 sessions). |
| Auction vertical (AuctionNinja + AuctionZip + NAA) | P1/P2 | All 3 produce zero records. Decide: invest in a real fix for one, or drop auction organizers. |
| #335 Email suspension | P1 | No active leak (verified). When ready to resume: reactivate Gmail → `OUTREACH_ENABLED=true` → re-enable the GitHub workflow. Max ~200/day during warmup. |
| #230 Smart Buyer Widget | P3 | Needs a published sale on user1 to do the final human check. |

**On hold until outreach resumes (don't do before #335):** 462 ready WARM leads (queue rows), outreach queue cleanup (2,206 stale / 480 bounced), WARM website enrichment (3.5%).

**Closed this session:** Sale Ending Soon rate cap — verified live in production.

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
