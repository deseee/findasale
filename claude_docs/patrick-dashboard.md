# Patrick's Dashboard — S747 Wrap (Complete)

---

## What Happened This Session — S747

Haiku rate limit investigation. 971 hits in 24h traced to fire-and-forget enrichment on organizer page loads + broken in-memory cost ceiling that reset on every Railway restart.

**Root causes fixed:**
- Enrichment removed from page load path entirely → moved to GH Actions daily cron
- Redis client was a fake in-memory stub → now uses real Railway Redis (REDIS_URL already set)
- Cost ceiling now persists to Redis → no longer resets on Railway restart
- Regex pre-filter added → ~70% of descriptions never touch Haiku (keyword matching + price regex)
- Batch delay fixed 300ms → 1500ms (was 4x over Tier 1 rate limit), batch size 50 → 35

**New jobs shipping with your push:**
- `enrich-ai-metadata.yml` — runs daily at 06:00 UTC, processes 300 unenriched sales/day
- `backfill-organizer-contacts.yml` — runs daily at 07:00 UTC, fills address/phone/website/email on organizer profiles from scraped sale data (free, no AI)

**Investigations — both came back clean:**
- `saleDetailEnrichment.ts` — no Haiku calls, not a rate limit contributor
- Organizer profile page — already renders address/phone/website/email correctly; it's a data gap, not a UI bug

**Key finding Patrick called out:** ESN doesn't give street addresses at scrape time (city/state only). The contact backfill will help organizers sourced from Foursquare/HERE but not ESN-only organizers like Elektra Vintage. Address enrichment for ESN requires the organizerWebsite.ts scraper to visit organizer websites — that pipeline needs a deep audit.

---

## Pending Patrick Actions

1. **Push the code** — Run the push block below. Includes files from S747 + the previous session's Redis/rate-limit fixes.
2. **Set Railway env var** — `AI_ENRICHMENT_BATCH_SIZE = 300` in Railway backend service Variables (new variable — overrides the hardcoded 35 default).
3. **SES smoke test** — Register a new account → confirm email from noreply@send.finda.sale → remove RESEND_API_KEY from Railway + resend from package.json.
4. **Email verification migration** — Deploy migration 20260515180000 when ready.
5. **Sign back into Chrome** — Log in with Google (artifactmi@gmail.com).

---

## Next Session

**Use Claude Opus.** Deep audit of the entire scraping + enrichment workflow before any more changes. See STATE.md § Next Session for full brief.

---

## Blocked Queue (Active Items)

| Feature | Status |
|---------|--------|
| #362 Attendance Count | UNVERIFIED — need ended sale in seed data |
| #124 Rarity Boost modal | UNVERIFIED — need rare item in seed data |
| SES transactional email | Needs smoke test (Patrick action) |
| Email verification token expiry | Migration 20260515180000 pending deploy |
| ESN organizer address enrichment | organizerWebsite.ts pipeline — needs deep audit next session |

---

## Push Block

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/backend/src/lib/redis.ts
git add packages/backend/src/lib/aiCostTracker.ts
git add packages/backend/src/routes/organizers.ts
git add packages/backend/src/controllers/socialPostController.ts
git add packages/backend/src/controllers/internalListingEnrichmentController.ts
git add packages/backend/src/services/listingEnrichmentService.ts
git add packages/backend/src/controllers/internalOrganizerContactBackfillController.ts
git add packages/backend/src/routes/internal.ts
git add .github/workflows/enrich-ai-metadata.yml
git add .github/workflows/backfill-organizer-contacts.yml
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: Haiku rate limit root cause — real Redis, persistent cost ceiling, enrichment out of request path, regex pre-filter, organizer contact backfill"
.\push.ps1
```
