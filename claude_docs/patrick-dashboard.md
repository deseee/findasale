# Patrick's Dashboard — Week of June 22, 2026

---

## What Happened This Week

It was a heavy week of bug-fixing and infrastructure work. The biggest SEO news: we found two P0 bugs that were silently preventing your 5,000 sale pages from ever appearing in Google's index — and a hidden build script that was overwriting your curated guide content on every deploy. All three are now fixed, the sitemap resubmitted, and the zombie sitemap from 2023 removed from Google Search Console. Google should start crawling the corrected sitemap over the next days-to-weeks. Earlier in the week, the root cause of your outreach email problems was pinned down (15-26% bounce rate triggered a Google abuse penalty) and five fixes shipped with the sender paused while the penalty clears. The blog section, label composer improvements, and SEO landing pages for yard sales, auctions, and flea markets also all shipped and were browser-verified this week.

---

## Audit Results

SEO investigation (June 22, S1021) found and fixed three root causes preventing Google indexing:

1. **Zero sale pages in your sitemap** — a filter that checked for a `status` field that didn't exist in the API response was silently excluding all 5,000 published sales. The sitemap had 0 sale URLs. Now confirmed at 5,000.
2. **Google trust breakdown from manipulated lastmod dates** — 2,210 URL entries were reporting "right now" as their last-modified date every time Google crawled the sitemap. Google's June 2024 policy treats this as manipulated and ignores all lastmod signals sitewide, which starves crawl budget. Fixed with a stable date.
3. **Build script overwriting your guide content on every deploy** — a deprecated generator was wired into the build process and was replacing your 500 curated brand pricing guides with thin city templates on every production deploy. This would have kept triggering Google's Scaled Content Abuse filter. Build script disconnected and guarded.

- Critical/High issues: **3 fixed this session** (all three above)
- Google Search Console: zombie sitemap removed, server-sitemap.xml resubmitted, 2 URLs manually requested for indexing
- Needs your input: see Action Items below

---

## Pending Decisions

No open PENDING items in DECISIONS.md — all standing decisions confirmed current. No changes needed.

---

## Beta Tester Impact

Things that got better: your sale pages can now be discovered by Google (they weren't in the sitemap before). The guide pages (/guide/* content) are now protected from being overwritten on deploys. The platform dashboard shows real live counts for eBay/Google/Facebook coverage.

What to watch: Google indexing takes days-to-weeks after a sitemap fix. Check GSC → Indexing → Pages in about 7 days to see movement. The "Discovered - currently not indexed" count should start dropping as Google crawls the corrected sitemap.

---

## This Week's Priority

1. **Watch GSC for indexing movement.** No action needed — just check GSC Indexing → Pages in ~7 days. The sitemap is fixed, resubmitted, and Google has 2 URLs in its priority crawl queue.
2. **Let the outreach penalty clear.** Don't touch `OUTREACH_DAILY_CAP` until the daily health check shows zero send-limit failures and bounce rate under 5%.
3. **Reconnect eBay.** Token expired June 20 — reconnect in organizer settings so live sync resumes.

---

## Action Items for Patrick

- [ ] **Check GSC in ~7 days** (GSC → Indexing → Pages → "Discovered - currently not indexed" count should be falling). Nothing to do now — Google needs time to re-crawl.
- [ ] **Leave `OUTREACH_DAILY_CAP=1` in Railway** — do not raise it yet. Resume only when the daily health check shows zero "reached a limit" failures and bounce rate under 5%.
- [ ] **Reconnect eBay** in your organizer settings (Settings → Platforms → eBay). Token expired June 20.
- [ ] **AlternativeTo listing** — did you submit FindA.Sale after the June 18 automated prompt? If not, worth 5 minutes today.
- [x] **Cart payment test** — confirmed complete. Patrick made a real purchase June 19; "Test Prod 2" item went to SOLD via webhook. Cart payment-completion is verified end-to-end.
