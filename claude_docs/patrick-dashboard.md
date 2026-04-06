# Patrick's Dashboard — April 6, 2026

---

## What Happened This Week

Ten sessions shipped across April 4–6. The big ones: POS system full rebuild; add-items mobile overhaul; review screen redesigned to plain-English status ("Ready to Publish" / "Needs Review" / "Cannot Publish"); feedback collection system fully built (infrastructure ready, 10 trigger wires deferred); rapidfire batching fixes; tier limit enforcement; upgrade prompts.

**S400 (today):** Camera overhaul — QR codes moved to left side on Avery labels and price sheet cheat sheet. Camera and Rapidfire buttons on edit-item page and review cards now open inline (no page navigation). Photos append to the existing item. Thumbnail strip updates live. "X/5" counter starts from the item's actual existing photo count, not 0. "Analyze" renamed "Save."

**All S399 + S400 code is unpushed.** Run the push block below.

---

## Push Block (run now)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/organizer/add-items/[saleId]/review.tsx
git add packages/frontend/pages/organizer/edit-item/[id].tsx
git add packages/backend/src/utils/listingHealthScore.ts
git add packages/backend/src/routes/items.ts
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260405_add_feedback_system/migration.sql"
git add packages/backend/src/controllers/feedbackController.ts
git add packages/backend/src/routes/feedback.ts
git add packages/frontend/context/FeedbackContext.tsx
git add packages/frontend/hooks/useFeedbackSurvey.ts
git add packages/frontend/components/FeedbackSurvey.tsx
git add packages/frontend/components/FeedbackMenu.tsx
git add packages/frontend/pages/_app.tsx
git add packages/frontend/pages/organizer/settings.tsx
git add packages/frontend/pages/shopper/settings.tsx
git add packages/backend/src/controllers/printKitController.ts
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add "packages/frontend/pages/organizer/print-kit/[saleId].tsx"
git add packages/frontend/pages/faq.tsx
git add packages/frontend/components/RapidCapture.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S399+S400: review card redesign, feedback system, camera inline append, QR left-align, thumbnail strip fix"
.\push.ps1
```

## Migration (run after push)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Pending Decisions

- **Encyclopedia rename** — "Resale Encyclopedia," "Secondhand Encyclopedia," or keep "Estate Sale Encyclopedia" for SEO? Dev blocked until decided.
- **USPTO trademark** — File for FindA.Sale? ~$250–$400 per class.

---

## Action Items for Patrick

- [ ] **Run push block above** — nothing from S399+S400 is live until this runs
- [ ] **Run migration** — FeedbackSuppression table won't exist in Railway DB until you do
- [ ] **Encyclopedia rename decision**
- [ ] **Trademark call**
- [ ] **eBay Developer App** — developer.ebay.com → Client ID + Secret → Railway env vars
- [ ] **Set Railway env var:** `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
- [ ] **Stripe seat product** — $20/mo team member seat needs a Stripe product created

---

## Next Session Priorities

1. Wire 10 feedback survey triggers (OG-1 through SH-5) to specific pages — infrastructure is done, just needs the hook calls added
2. Chrome QA on S398 dashboard + S399 review card + S400 camera fixes
3. Social share template fix — hardcoded "estate sale" language on TikTok/Pinterest/Threads/Nextdoor share cards

*Updated S400 — 2026-04-06*
