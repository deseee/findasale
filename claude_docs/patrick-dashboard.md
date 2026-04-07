# Patrick's Dashboard — April 7, 2026 (S410)

---

## What Happened This Session (S410)

**Social post generator expanded** — TikTok, Pinterest, and Threads are now in the platform selector. Each generates a platform-optimized caption. Photos are included in the generated post data (watermarked, platform-specific crop). A photo preview with "Copy Photo Link" button now appears in the UI. Facebook CSV export now includes an `image_url` column.

**eBay 400 error fixed** — The Seller Hub bulk upload was getting a 400 because the condition values were numeric eBay API IDs (like `1000`, `3000`) instead of the human-readable strings Seller Hub requires (`New`, `Used`, `For parts or not working`, etc.). Fixed the mapping. Column headers also cleaned up. Category ID is left blank — Seller Hub allows that and the organizer assigns categories there.

---

## Push Block (S410)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/socialPostController.ts
git add packages/frontend/components/SocialPostGenerator.tsx
git add packages/backend/src/services/exportService.ts
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S410: social platform respec (TikTok/Pinterest/Threads + photos), eBay 400 fix (condition strings + headers), roadmap v100"
.\push.ps1
```

**No new migrations this session.**

---

## S407 Migration (if not yet run)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Action Items for Patrick

- [ ] **Push S410 block above**
- [ ] **Test eBay export** — 400 should be gone now. Condition values are now human-readable strings.
- [ ] **Run S407 migration** if not done (estateId on Organizer)
- [ ] **Complete eBay keyset activation** — developer.ebay.com → Alerts & Notifications → endpoint `https://backend-production-153c9.up.railway.app/api/ebay/account-deletion` → token `findasale-ebay-verify-2026-primary` → Save
- [ ] **Create Google Places API key** — console.cloud.google.com → Maps Platform → Places API → Add to Railway as `GOOGLE_PLACES_API_KEY`
- [ ] **Set Railway env var:** `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
- [ ] **Stripe seat product** — $20/mo team member seat needs a Stripe product created

---

## What's Coming in S411

Chrome QA session — #27a (social templates), #72/#74 (confirmed implemented, just needs verification), plus smoke test of S409 changes (Chrome was down this session).

---

## What's Blocked Until Real Camera / Test Data

- ValuationWidget — TEAMS user with a draft item in review page
- Treasure Trails check-in — organizer must create a trail first
- Review card redesign — need camera-captured item in DRAFT state
- Camera thumbnail refresh — real device required
- POS QR scan — real device required

*Updated S410 — 2026-04-07*
