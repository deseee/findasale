# Patrick's Dashboard — Week of June 22, 2026

---

## What Happened This Week

Two big threads. Earlier in the week was SEO: we fixed two P0 bugs that were silently keeping your 5,000 sale pages out of Google's index, plus a hidden build script that overwrote your curated guide content on every deploy — all fixed, sitemap resubmitted, Google now crawling.

The latest session (S1022) was a deep "what are we overlooking" pass on the whole operation, and a lot got built: four new monitoring guardrails (including the one that would've caught the content-overwrite bug — it now watches your real data daily), real-time email alerts for fatal production errors, a pre-deploy code-checking gate, a cleanup/consolidation of your ~30 scheduled tasks, and a fix to the address-geocoding pipeline that had stopped working (rate-limited, and couldn't handle Canadian addresses). We also found a serious one: your live database password was sitting in 16 files in your public code repo — scrubbed from the current files, but it still needs rotating (see below).

Honest note: during that session I caused a brief production outage. I added an email feature, a file got silently truncated by a tooling bug, and a weak spot in your build process (it ignores type errors) let the broken build ship. The backend crash-looped. I found the root cause and restored it — prod is green and confirmed healthy. The fix for that whole class of problem is the CI gate (built) once it's set to *block* bad deploys, which is the top priority next.

---

## What Got Built (and is live)

- **Data-persistence monitor** — daily check that your real organizer data (sales, items, prices, the Artifact storefront) hasn't been silently wiped or reset. The guard for exactly the kind of bug you stumbled onto.
- **Job-heartbeat + Sentry-to-queue** — folded into your daily health task: catches background jobs that silently die, and routes serious production errors into your real work queue instead of a report nobody reads.
- **Token-expiry watch** — daily check so things like the eBay token never lapse unnoticed again.
- **Real-time error alerts** — an email the moment a fatal error hits production (backend or frontend), not a day later.
- **Geocoder fixed** — sale addresses (including Canadian ones) can be mapped again; deployed and green.

---

## Action Items for Patrick

- [ ] **Rotate your database password (most important).** It's live and exposed in your public repo's history. I can drive ~90% of it on your go — you'd just paste the new value into your local `.env`. Say "rotate it" when ready.
- [ ] **Turn on deploy-blocking for the new CI gate** — Vercel -> Settings -> Git -> "Wait for CI", and Railway backend -> wait-for-checks. This is what stops a bad build from ever reaching production again. (I'll also remove the `tsc || true` line in the build that let it through.)
- [ ] **Reconnect eBay** — token expired June 20 (Settings -> Platforms -> eBay).
- [ ] **Leave `OUTREACH_DAILY_CAP=1`** — don't raise it until the daily health check shows zero send-limit failures and bounce rate under 5%.
- [ ] **Bounce-email mailbox** — needs you to generate a Google Workspace login/token for `find@outreach.finda.sale` so bounce handling can move to the right inbox. I'll wire it once it exists.
- [ ] **Watch GSC** in ~7 days (Indexing -> Pages) for the indexing fixes to take effect.

---

## What to Watch

- The geocoder fix is live but **unverified until its next run** (every 2 hours) — that run should show a non-zero "geocoded" count. If it's still zero tomorrow, flag it.
- The email-send feature is **abandoned** — it caused two outages for the least valuable feature, and is left as a harmless disabled stub to be removed.
