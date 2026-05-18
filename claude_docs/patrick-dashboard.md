# Patrick's Dashboard — Week of May 18, 2026

---

## What Happened This Week

**S757:** Production DB cleanup. Removed 5 test/QA sales (QA Test Auction, QA Settlement, QA Dims test, 2 stale ended Artifact copies) and 13 items. Nintendo Power mag moved into the live Artifact Downtown sale (now 100 items). Scraped directory (26,189 sales) untouched. No code changes.

**S756:** Pipeline DB verification completed (deferred from S755 by workspace outage). Outreach confirmed healthy at ~48 emails/day. Deleted 31 junk rows from the outreach queue. Identified root cause of the WARM email coverage gap and shipped a fix (daily website enrichment instead of weekly). Confirmed #336 and #339 were already built — roadmap updated.

**S755:** Mandatory QA ceiling session — fixed 6 bugs: Hunt Pass cosmetics (#275), Share & Earn card (#265), ENDED sale counts (#292), Social Posts button (#305), Store Hours persistence (#306), seed log labels. Patrick clarified #307 Retail Mode is TEAMS-only by design.

---

## Pipeline Status (Live as of S756)

- **Outreach:** 29 emails sent since May 17 deploy. ~48/day. On warmup pace. ✅
- **Queue:** 3,319 PENDING, 29 SENT. 31 junk rows cleaned out.
- **Source attribution:** 87.7% of organizers tagged with data source. ✅
- **WARM email gap:** Root cause found. Only 3.3% of WARM orgs have a website (email discovery requires a website). Fix: website enrichment cron now runs daily instead of weekly. Addressable WARM pool is 208 orgs — pipeline will naturally grow this as new state-licensed orgs come in.

---

## What's Fixed (Needs Chrome QA)

- #275 Hunt Pass ring + badge — Tailwind safelist, inline boxShadow fallback, leaderboard query fixed
- #265 Share & Earn card — 7-day dismissal expiry instead of permanent
- #292 ENDED sale counts — accurate breakdown replaces misleading "All items sold"
- #305 Social Posts — button now opens SocialPostGenerator modal
- #306 Store Hours — refetches from server after save
- #307 Retail Mode — needs TEAMS account QA (not a bug for PRO, just unverified on TEAMS)

---

## Pending Decisions

No PENDING items in DECISIONS.md this week. All standing decisions are active.

---

## Action Items for Patrick

- [ ] **Run the S755 push block** (10 code files — see below)
- [ ] **Run the S756 push block** (2 code files + 2 doc files — see below)
- [ ] **Deploy email verification migration** — `npx prisma migrate deploy` with Railway DATABASE_URL (pending since S726)
- [ ] **Delete fix-attendance.sql** from project root — has production IDs (pending since S750)
- [ ] **Log back into Chrome as yourself** (artifactmi@gmail.com) after any QA session

---

## S755 Push Block

```powershell
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/pages/shopper/dashboard.tsx
git add packages/frontend/tailwind.config.js
git add packages/frontend/components/Avatar.tsx
git add packages/backend/src/controllers/leaderboardController.ts
git add packages/frontend/pages/shopper/league.tsx
git add packages/frontend/pages/sales/[id].tsx
git add packages/frontend/pages/organizer/settings.tsx
git add packages/database/prisma/seed.ts
git commit -m "Fix 6 bugs: Hunt Pass cosmetics, Share&Earn expiry, ENDED sale counts, Social Posts modal, Store Hours persistence, seed log labels"
.\push.ps1
```

## S756 Push Block

```powershell
git add .github/workflows/pipeline-website-enrichment.yml
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "chore: website enrichment daily cron; roadmap #336/#339 confirmed shipped"
.\push.ps1
```
