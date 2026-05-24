# Patrick's Dashboard — Week of May 24, 2026 (Updated S784b)

---

## Audit Alerts (Weekly Site Audit — 2026-05-23)

✅ **HIGH — `/categories` fixed (S784).** Icons expanded to 200+ eBay leaf node names. Verbose names shortened via display overrides. Deploy to see effect.

✅ **MEDIUM — `/map` geocoding fixed (S784).** Sales now get geocoded when published. Batch backfill job extended to cover existing platform sales. Pins will appear as the backfill runs after deploy.

✅ **MEDIUM — `/privacy` already clean.** Deployed file uses real em dash characters. Audit finding was stale.

✅ **MEDIUM — `/calendar` already fixed.** Ongoing sales banner (blue pills) already deployed. Long-running sales are separated from the grid.

Full report: `claude_docs/audits/weekly-audit-2026-05-23.md` — all findings resolved.

---

## What Happened This Week

**S784b (QA batch — 9 items Chrome-verified):**
- ✅ #352 Organizer tagline, #354 Business Hours, #356 Broadcasts, #359 Pin Sale, #360 Social Links — all visible in settings.
- ✅ #60 Pricing page ($29 PRO, $79 TEAMS), #260 One-big-sale upgrade section, #263 PRO TOOLS dropdown, #271 TEAMS webhooks/API table.
- QA session prompt for Groups B/C/D is ready: `claude_docs/qa-session-prompt-groups-bcd.md` — use in a separate Cowork session (one Chrome session at a time).

**S784 (Audit Fixes):**
- Fixed `/map` zero pins: platform sales now geocoded on publish; batch backfill job extended to cover existing published sales.
- Fixed `/categories` display: 200+ eBay leaf node icons + verbose name overrides (e.g. "Comics & Graphic Novels" → "Comics").

**S783 (SEO Sprint):**
- Sitemap: 1,727 → 1,885 URLs. Added item pages, encyclopedia entries, category pages, and guide pages (500 articles).
- IndexNow: fires automatically every time an organizer publishes a sale — Bing gets pinged instantly with the sale URL + all its item URLs. Key file live at `https://finda.sale/fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt` ✅
- Schema.org audit: Product schema on items, JSON-LD on sale detail, HowTo/Article on guides — all already implemented.
- Fixed homepage "Error Loading Sales" (was hitting localhost in production)
- Fixed /creator/dashboard redirect loop
- Built admin creators/affiliate page at `/admin/creators`

**S782 (Outreach Opens UI + Queue Reset):**
- Built `/admin/outreach-opens` page — click "View opened emails →" in the Outreach Email Pipeline widget on `/admin`
- Re-queued 418 emails sent before the deliverability fix. Queue back to ~3,349 PENDING.

**S781 (DMARC Upgrade + Email Stack Audit):**
- ✅ DMARC upgraded to `p=quarantine` — emails that fail auth land in spam instead of inboxes.

**S780/S780b (Deliverability + GitGuardian + CORS + Indexes):**
- Fixed email MIME (plain-text fallback added), CORS for api.finda.sale, GitGuardian credential removed, 7 DB indexes added, Railway DB password rotated.

---

## Pending Patrick Actions

1. **Push S783 + S784 + S784b** — combined push block in STATE.md § Next Session
2. **Submit sitemap to Bing Webmaster Tools** — `https://www.bing.com/webmasters` → Add sitemap → `https://finda.sale/server-sitemap.xml`
3. **Update Global CLAUDE.md password** — Ctrl+H find-and-replace with current Railway DB password
4. **Run Groups B/C/D QA session** — open new Cowork session, paste content of `claude_docs/qa-session-prompt-groups-bcd.md` as opening prompt

---

## SEO Status

| Signal | Status |
|--------|--------|
| Sitemap | ✅ 1,885 URLs, auto-grows as items published |
| IndexNow | ✅ Live — fires on every sale publish |
| Schema.org (items) | ✅ Product schema implemented |
| Schema.org (sales) | ✅ JSON-LD implemented |
| Schema.org (guides) | ✅ HowTo/Article implemented |
| Bing sitemap submission | ⏳ Patrick action needed |
| Google Search Console | ⏳ Verify submitted |
