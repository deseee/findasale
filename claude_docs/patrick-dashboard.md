# Patrick's Dashboard — S732 Wrap

---

## What Happened This Session — S732

Email infrastructure triage + SES migration planning. No product features — pure ops.

**Resend quota incident diagnosed** — `saleEndingSoonJob` fired and sent 200 emails (200% of the 100/day free tier limit). Root cause: the job correctly finds all PUBLISHED sales ending in 23–25h with `endingSoonNotified: false`, then sends to every `SaleSubscriber.email` with zero suppression check. The `endingSoonNotified` flag prevents re-sends on the same sales, but new sales entering the window will keep triggering it. Secondary finding: 37 backend files all use Resend directly — no central abstraction.

**Decision: migrate to AWS SES** — $0.10/1,000 emails (~$5 for 50k/month vs. Resend's $20). `send.finda.sale` subdomain already has SES DNS records from a prior setup. Migration plan written to `claude_docs/operations/ses-migration-plan.md`. Strategy: create a central `lib/emailService.ts` wrapper so all 37 files change one import line only.

**Roadmap + STATE updated** — `#SES-MIGRATION` added to roadmap Infrastructure section. Blocked Queue entry added to STATE.md with Patrick's AWS action items. Next Session section added to STATE.md.

---

## Pending Patrick Actions

**URGENT — do today (starts the 24–48h AWS approval clock):**

1. Log into AWS console → Simple Email Service → region us-east-1
2. Confirm `send.finda.sale` shows as "Verified" under Identities
3. Click "Request production access" → fill out form (transactional, finda.sale, under 5k/month)
4. Create SMTP credentials → download CSV
5. Add to Railway backend env vars:
   ```
   SMTP_HOST=email-smtp.us-east-1.amazonaws.com
   SMTP_PORT=587
   SMTP_USERNAME=[from CSV]
   SMTP_PASSWORD=[from CSV]
   SES_FROM_EMAIL=noreply@send.finda.sale
   ```

**Push S732 — docs only:**
```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git add claude_docs/operations/ses-migration-plan.md
git commit -m "docs(S732): SES migration plan + roadmap + STATE update"
.\push.ps1
```

**Still pending from prior sessions — push S730:**
```powershell
git add packages/frontend/pages/organizer/create-sale.tsx
git add packages/frontend/pages/organizer/edit-sale/[id].tsx
git add packages/frontend/pages/organizer/settings.tsx
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/controllers/reservationController.ts
git add packages/backend/src/routes/organizers.ts
git add packages/database/prisma/migrations/20260515200000_add_return_window_to_organizer/migration.sql
git commit -m "S730: Photo toast, hold duration via getRankBenefits, remove Grief Firewall, return window to account settings"
.\push.ps1
```

**Still pending from prior sessions — push S731:**
```powershell
git add .github/workflows/scrape-estatesalesnet.yml
git add packages/backend/src/scripts/run-estatesalesnet.ts
git commit -m "fix(scraper): chunk ESN scraper into 4 parallel matrix jobs to fix 60m timeout"
.\push.ps1
```

```powershell
git add packages/backend/src/services/scraper/sources/rhodeIslandLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/oregonLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/nebraskaLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/montanaLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/marylandLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/delawareLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/connecticutLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/kansasLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/minnesotaLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/wyomingLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/oklahomaLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/missouriLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/arizonaLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/georgiaLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/newHampshireLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/texasLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/massachusettsLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/newYorkLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/wisconsinLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/southCarolinaLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/maineLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/newJerseyLicensingScraper.ts
git add packages/backend/src/services/scraper/sources/californiaLicensingScraper.ts
git commit -m "fix(scrapers): fix or gracefully handle 23 failing state auctioneer scrapers"
.\push.ps1
```

**Deploy all pending migrations (S726 + S728 + S730):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Infrastructure Status

| | |
|---|---|
| Vercel (frontend) | ✅ Live |
| Railway (backend) | ✅ Live |
| Pipeline (enrich/score/outreach) | ✅ GitHub Actions — green cycle confirmed S726 |
| Outreach emails | ✅ Gmail API live (4h cron) |
| CI health monitoring | ✅ Daily 8am (Sentry needs token to activate) |
| Transactional email | ⚠️ Resend free tier — quota hit. SES migration queued |
| Email verification migration | ⚠️ Created S726, NOT deployed |
| eBay store URL migration | ⚠️ Created S728, NOT deployed |
| Return window migration | ⚠️ Created S730, NOT deployed |

---

## Blocked Queue (active)

| Feature | What's Needed |
|---------|---------------|
| #SES-MIGRATION | Patrick: complete AWS console steps + add Railway env vars → dispatch dev |
| #326 eBay Comp Tiles | Chrome QA — confirm tile grid renders on edit-item page |
| #280 Condition Rating XP | Chrome QA — set conditionGrade, verify XP +5 in ledger |
| eBay full push flow | Chrome QA — edit-item → save → push to eBay LIVE |
| #422 OAuth Option B | Chrome QA — register, sign out, Google sign-in → amber banner |
| #322 Encyclopedia category picker | Chrome QA — free-text → dropdown populates |
| 3 pending migrations | Patrick: run `npx prisma migrate deploy` (S726 + S728 + S730) |
| GA/NH scrapers | Needs headless browser + residential proxy |
| NE/MO scrapers | Needs JS rendering (Puppeteer) |
