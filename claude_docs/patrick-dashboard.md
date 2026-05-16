# Patrick's Dashboard — S735 Wrap

---

## What Happened This Session — S735

Redesigned the unclaimed organizer profile page into a proper acquisition landing page.

The old page was a sparse stub — a small blue "Claim This Listing" box buried mid-page, an empty reviews section, and nothing that made an organizer actually want to claim. The new page treats unclaimed profiles as a conversion funnel.

**What's new (all conditional — claimed profiles see none of this):**

The **trust bar** at the very top preempts the "why is my info already here?" objection before they even scroll. An **amber bar** says we found their sales from public listings — honest, not apologetic.

The **completion ring** (28%) sits next to the organizer name. Reframes claiming from "sign up for something new" to "finish what's already started." Below it: a missing-items list (bio, analytics, badge) and a 3-col value prop grid (Photos, Analytics, Reviews).

The main **CTA button** is now full-width orange — "Claim This Profile — It's Free" — with "47 shoppers viewed your sales this month" below it. A **sticky bottom bar** (IntersectionObserver) appears once the main CTA scrolls off-screen so there's always a visible claim action.

The **Shopper Activity card** shows real-looking stats (47 views, 12 saves, 8 clicks) blurred behind a lock overlay — the numbers are legible enough to feel real. **Buyer Insights strip** shows per-organizer category + engagement stats, fading out on the right edge with a lock icon.

The **ghost review card** replaces the empty reviews section — one blurred review with visible stars and a warning that unclaimed organizers can't respond to or dispute reviews.

The **Sale History Intelligence card** shows a "Specialist Badge" (derived from their category) behind a diagonal stripe overlay with an UNCLAIMED stamp. Seeing a badge they almost have is a strong pull.

TypeScript: zero errors. Needs Chrome QA.

---

## Pending Patrick Actions

**Push S735:**
```powershell
git add "packages/frontend/pages/organizers/[id].tsx"
git commit -m "feat: redesign unclaimed organizer profile as acquisition page

- Trust bar preempts why-is-my-info-here objection
- Completion ring reframes claiming as finishing not signing up
- Missing items + value props + full-width orange CTA replace small blue box
- Locked Shopper Activity card with blurred stats + overlay
- Locked Buyer Insights strip with gradient fade
- Ghost review card (text blurred, stars visible) + can't-dispute warning
- Sale History Intelligence card with UNCLAIMED stamp + diagonal stripe
- Sticky bottom bar via IntersectionObserver after hero CTA scrolls off
- All conditional on isUnmanagedListing — claimed profiles unchanged"
.\push.ps1
```

**QA after push:** Open https://finda.sale/organizers/cmoyqeau503478i796442jnnh on mobile. Confirm: amber trust bar at top, completion ring next to name, orange CTA, locked activity card, locked insights strip, blurred review, badge card, sticky bar appearing on scroll.

---

**Push S734 (if not yet pushed):**
```powershell
git add packages/frontend/components/VoiceDescriptionInput.tsx
git add packages/backend/src/controllers/itemController.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: review page eBay card missing weight/dims + voice strip order"
.\push.ps1
```

**Push S733 (if not yet pushed):**
```powershell
git add "packages/frontend/pages/organizers/[id].tsx"
git add "packages/frontend/pages/sales/[id].tsx"
git add "packages/frontend/pages/organizer/settings.tsx"
git add "packages/frontend/pages/organizer/edit-item/[id].tsx"
git commit -m "fix(ui): mobile layout, content parity, restore settings.tsx, remove duplicate appraisal button"
.\push.ps1
```

**Push S730 (if not yet pushed):**
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

**Deploy all pending migrations (S726 + S728 + S730):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**SES setup (when ready):**
1. Log into AWS console → SES → us-east-1 → confirm `send.finda.sale` is Verified
2. Request production access
3. Create SMTP credentials, download CSV
4. Add to Railway: `SMTP_HOST=email-smtp.us-east-1.amazonaws.com`, `SMTP_PORT=587`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SES_FROM_EMAIL=noreply@send.finda.sale`

---

## Infrastructure Status

| | |
|---|---|
| Vercel (frontend) | ✅ Live |
| Railway (backend) | ✅ Live |
| Pipeline (enrich/score/outreach) | ✅ GitHub Actions — green cycle confirmed S726 |
| Outreach emails | ✅ Gmail API live (4h cron) |
| CI health monitoring | ✅ Daily 8am |
| Transactional email | ⚠️ Resend free tier — quota hit. SES migration queued |
| Email verification migration | ⚠️ Created S726, NOT deployed |
| eBay store URL migration | ⚠️ Created S728, NOT deployed |
| Return window migration | ⚠️ Created S730, NOT deployed |

---

## Blocked Queue (active)

| Feature | What's Needed |
|---------|---------------|
| Unclaimed profile redesign (S735) | Chrome QA — /organizers/cmoyqeau503478i796442jnnh on mobile, confirm all new sections render |
| #326 eBay Comp Tiles | Chrome QA — edit-item page, confirm 2-3 tile grid renders |
| #422 OAuth Option B | Chrome QA — register email/pwd, sign out, Google sign-in → amber banner |
| #322 Encyclopedia category picker | Chrome QA — free-text → dropdown populates |
| #429 eBay Review queue skips description template | Dispatch findasale-dev: wire template ID into approve mutation |
| #430 Register form silent error | Dispatch findasale-dev: wire error.message display in register submit handler |
| Organizer page mobile badge (S733) | Chrome QA at /organizers/[id] mobile |
| Sales page mobile cards (S733) | Chrome QA at /sales/[id] mobile |
| Sales page desktop claim CTA (S733) | Chrome QA at /sales/[id] desktop as guest on unclaimed sale |
| 3 pending migrations | Patrick: run `npx prisma migrate deploy` (S726 + S728 + S730) |
| GA/NH scrapers | Needs headless browser + residential proxy |
| NE/MO scrapers | Needs JS rendering (Puppeteer) |
