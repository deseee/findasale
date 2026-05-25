# Patrick's Dashboard — Week of May 24, 2026 (Updated S787)

---

## What Needs Your Attention Now

1. **Push S787** — push block below ← do this first
2. **Seed production DB** — BLOCKER for all shopper QA (user12+ login fails with Seedy2025!)
3. **Update Global CLAUDE.md password** — both DATABASE_URL lines → `luEGUhvHsopwwUtCbQQcfIDIDHuxZvdW`
4. **Push S783 + S784 + S784b + S785 + S786** — combined push block in STATE.md § Next Session (still pending if not done)
5. **Submit sitemap to Bing** — `https://www.bing.com/webmasters` → Add sitemap → `https://finda.sale/server-sitemap.xml`

---

## S787 Push Block

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/components/Layout.tsx
git add packages/frontend/pages/shopper/dashboard.tsx
git add packages/frontend/components/CartDrawer.tsx
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(nav): bell icon before QR scanner desktop+mobile (#350); feat(shopper): QR modal expand+share in dashboard+CartDrawer (#351); chore(qa): S787 QA results — #7 ✅ #339 ✅; chore(state): S787 wrap"
.\push.ps1
```

---

## Shopper Re-Seed (BLOCKER — run before next shopper QA)

Shopper accounts (user12–user23) can't log in — production DB was never re-seeded after S576 changed the seed password. All shopper-specific tests (#266, #184, etc.) are blocked.

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[Railway DATABASE_URL — from Railway dashboard → findasale-db → Variables]"
npx prisma db seed
```

⚠️ Confirm your test data is backed up first (Barn Door QA Test Sale, QA Test Ended Sale).

---

## What Happened This Session (S787)

**QA results:**

| Feature | Result | Notes |
|---------|--------|-------|
| #7 Shopper Referral Rewards | ✅ VERIFIED | /shopper/referrals loads, referral link + copy + stats all confirmed |
| #339 Low-Conf Refuse-to-Fill | ✅ VERIFIED | "Too dark to identify" dialog — AI fields (brand/category) left blank, title still fills |
| #340 Auto-Reopen Rapidfire | UNVERIFIED | VM camera too dark to complete publish flow |
| #261 XP Rank Multiplier | UNVERIFIED | No RANGER users in production DB; /admin denied for user1 |
| #266 Explorer Profile | ⚠️ Partial | Page loads ✅; avatar dropdown blocked by shopper re-seed requirement |

**Bug fixes dispatched + TypeScript clean:**
- **#350** — Bell icon order: was position 4 (last), now before QR scanner. Fixed in `Layout.tsx`.
- **#351** — QR modal: click-to-expand + Web Share API + clipboard fallback added to `dashboard.tsx` and `CartDrawer.tsx`.

---

## Next Session Priority Order

1. **Fix upload pipeline** — dispatch findasale-dev to create Photo records on upload (unblocks #319, #325, #328 in one shot)
2. **Re-seed production DB** — Patrick action above; unlocks all shopper QA
3. **Chrome QA shopper batch** — #266 (avatar dropdown), #184, #350/#351 verification
4. **Chrome QA:** #336 intent-wins, #323 valuation, #332 Shopify, #334 markdown cycles
5. **#261 retest** — after Patrick promotes a test user to RANGER in DB

---
