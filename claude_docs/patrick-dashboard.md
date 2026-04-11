# Patrick's Dashboard — April 11, 2026 (S440)

## S440 Summary

10-issue fix session from Patrick's live site review. 7 parallel dev agents. Nav restructured, bounties UX upgraded, subscription pitches rebuilt, achievements/reputation/dashboard/receipts all fixed.

---

## What S440 Fixed

### Nav Restructure (Layout.tsx + AvatarDropdown.tsx)
- Command Center, Calendar, Staff Accounts icons → grey
- "Collector Passport" → "Explorer Passport" in both navs + page header
- League moved under Hunt Pass section
- Hunt Pass pulled out as standalone link, old group renamed "Hunt Exclusives", placed below My Collection and above Explore

### Bounties UX (bounties.tsx + bountyController.ts + schema)
- XP input field with 50 minimum enforced
- Reference URL input for photos/links
- Bounty cards now expandable on click (shows description, reference, "Submit a Match" button)
- New BountySubmission model + migration for match submissions
- referenceUrl added to MissingListingBounty

### Subscription Upgrade Pitches (subscription.tsx)
- FREE tier: dark mode contrast fixed
- FREE → PRO: new feature comparison grid (3 sales, 500 items, 2k auto tags, 8% fees, Flip Report, 24/7 support)
- FREE → Ala Carte: $9.99/sale option card (500 items, 10 photos, 500 tags, Flip Report, Virtual Queue)
- PRO → TEAMS: upgrade pitch (unlimited sales, 5 members, Command Center, webhooks/API, flea markets)

### Achievements (AchievementBadge.tsx + achievementService.ts + schema)
- Dark mode styling fixed on all badge cards
- Bug fix: unlockedAt was auto-set to now() on creation — changed to nullable so achievements only unlock when earned

### Reputation (reputation.tsx)
- Root cause: was calling `/api/users/me/purchases` instead of `/api/users/purchases`. One-line fix.

### Dashboard Dates (dashboard.tsx)
- Primary sales cards now show city + date range (matching Other Sales card format)

### Receipt Review CTA (ReceiptCard.tsx + receiptController.ts)
- Orange success card with "Review this organizer" CTA added to receipt view
- Backend now includes organizer data in receipt response

---

## Open Decision

Bounties — should shoppers be able to offer real dollars as bounty rewards, or XP only? Stripe/legal implications need research before committing.

---

## Migrations Required (3 new)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Push Block

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/components/Layout.tsx
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/pages/shopper/explorer-passport.tsx
git add packages/frontend/pages/shopper/bounties.tsx
git add packages/frontend/pages/organizer/subscription.tsx
git add packages/frontend/components/AchievementBadge.tsx
git add packages/frontend/pages/shopper/reputation.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/components/ReceiptCard.tsx
git add packages/backend/src/controllers/bountyController.ts
git add packages/backend/src/controllers/receiptController.ts
git add packages/backend/src/services/achievementService.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260411_add_reference_url_bounty/migration.sql
git add packages/database/prisma/migrations/20260411_bounty_submissions/migration.sql
git add packages/database/prisma/migrations/20260411_make_unlockedAt_nullable/migration.sql
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S440: 10-issue fix batch — nav restructure, bounties UX, subscription pitches, achievements, reputation, dashboard dates, receipt review CTA"
.\push.ps1
```

After push, run the migration block above.
