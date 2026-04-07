# Patrick's Dashboard — April 7, 2026 (S408)

---

## What Happened This Session (S408 — Roadmap audit, FAQ cleanup, pricing rows)

Audited S392–S407 against the roadmap. 16-session lag resolved. QA NOT rubber-stamped. FAQ cleaned up. Pricing table updated.

**Roadmap updated (v97→v98):**
- POS #162: Chrome-verified S406b+S407 ✅
- Hunt Pass #133 + #213: Chrome-verified S407 ✅ — ⚠️ "2x XP" false alarm cleared
- 4 new entries: #284 Feedback Survey, #285 POS In-App Payment Request, #286 Shopper QR Code, #287 Sort Controls

**FAQ cleaned up:**
- Removed duplicate Treasure Trails question
- Removed both "Collector Passport" questions (stale — renamed Loot Legend per D-S268)
- Removed duplicate XP spending question
- Fixed Hunt Pass early access timing (6h Rare / 12h Legendary)
- Fixed hold duration in organizer FAQ (was "24h default" → now "30–90 min by rank")

**Pricing table:** Added "Sale Print Kit" and "Price Tags & Yard Signs" rows below POS (all tiers = true).

**Scroll fix check:** POS and add-items pages already had the correct ternary pattern — scroll bug was already fixed project-wide. Nothing to dispatch.

**CLAUDE.md:** Added roadmap update gate rule to §4 — only fires on (a) feature shipped or (b) Chrome QA confirms. Prevents future lag.

---

## Previous Session (S407 — QA sweep + pre-wires + bug fixes)

Chrome QA continued, two bucket-4 pre-wires shipped, and two bugs fixed.

**QA results:**
- **eBay production** ✅ — Re-confirmed. 10 real sold listings ($32.39–$96.11, median $60.99).
- **POS full walkthrough** ✅ — All 4 payment tiles (Cash/Stripe QR/Card Reader/Invoice) confirmed. Cash tile selects green on click. Reload resets cleanly.
- **S397 Sort controls** ✅ — Name sort (Z→A), Price sort ($418→$130 descending), 4 buttons present. Toolbar visible in dark mode.
- **Hunt Pass page** ✅ — $4.99/month, 1.5x XP, flash deals, XP matrix all confirmed. Upgrade button visible.
- **À la carte pricing** ✅ — SIMPLE + $29 PRO + $79 TEAMS + $9.99 À la carte section all confirmed on pricing page.

**Bugs fixed:**
- **P1 — Onboarding modal** — Added localStorage safety check so modal dismissal persists reliably across reloads.
- **P2 — Edit-item black area** — Changed RapidCapture `&&` → ternary. Forces proper DOM unmount when camera closes. Fixes the scroll rendering bug on edit-item page.

**New P2 found:** The same black area on scroll appears on POS and add-items pages too (possibly all pages). The fix was only applied to edit-item this session. A broader audit + fix is needed next session.

**Bucket 4 pre-wires shipped (dormant — no UI yet):**
- `estateId String?` added to Organizer schema — Estate Planning Toolkit ready to activate
- QuickBooks CSV export format added to backend — activate by adding "QuickBooks" to export UI

---

## Push Block (S407 + S408)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260407_add_estate_id_to_organizer/migration.sql
git add packages/backend/src/services/exportService.ts
git add packages/backend/src/controllers/csvExportController.ts
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/pages/organizer/edit-item/[id].tsx
git add packages/frontend/components/TierComparisonTable.tsx
git add packages/frontend/pages/faq.tsx
git add CLAUDE.md
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S407+S408: P1 modal fix, P2 layout fix, pre-wires, roadmap v98, FAQ cleanup, pricing rows, roadmap gate rule"
.\push.ps1
```

---

## Migration Required (S407)

Run after pushing:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Action Items for Patrick

- [ ] **Run push block above** (S407 changes)
- [ ] **Run S407 migration** (estateId on Organizer)
- [ ] **Complete eBay keyset activation** — developer.ebay.com → Alerts & Notifications → endpoint `https://backend-production-153c9.up.railway.app/api/ebay/account-deletion` → token `findasale-ebay-verify-2026-primary` → Save
- [ ] **Create Google Places API key** — console.cloud.google.com → Maps Platform → Places API → Add to Railway as `GOOGLE_PLACES_API_KEY`
- [ ] **Set Railway env var:** `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
- [ ] **Stripe seat product** — $20/mo team member seat needs a Stripe product created

---

## What's Blocked Until Real Camera / Test Data

- ValuationWidget — TEAMS user with a draft item in review page
- Treasure Trails check-in — organizer must create a trail first
- Review card redesign — need camera-captured item in DRAFT state
- Camera thumbnail refresh — real device required
- POS QR scan — real device required

---

## Brand Drift — Still Unresolved

~20 D-001 violations remain. `SharePromoteModal.tsx` + `sales/[id].tsx` hardcode "estate sale" in social share templates.

**Full findings:** `claude_docs/audits/brand-drift-2026-04-07.md`

---

## Next Session (S409)

**S409 focus: roadmap.md restructure** — Move all Chrome-verified features into the SHIPPED & VERIFIED section. Goal: clear picture of what's done vs. what still needs QA. v99 update.

1. Push S407+S408 (block above) + run S407 migration
2. Roadmap restructure: slot verified items into SHIPPED & VERIFIED, surface remaining QA queue
3. QA backlog (Patrick doing some of this himself during peak hours): pricing page print kit rows, onboarding modal persist, FAQ cleanup visible
4. After roadmap is clean: QA priority list — referrals (#7), haul posts (#88), S396 rapidfire

*Updated S408 — 2026-04-07*
