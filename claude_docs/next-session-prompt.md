# Next Session Resume Prompt
*Written: 2026-03-16 (S178 wrap)*
*Session ended: normally*

## Resume From
Dispatch **findasale-qa** on Sprint 2 billing endpoints — this is the mandatory first action. QA has not run on billingController.ts, syncTier.ts, or the requireTier() route wiring. These touch payment flows and cannot go to production without a QA pass.

## What Was In Progress
- **upgrade.tsx push** — fix was applied (organizerProfile → organizerTier) but Patrick needs to run the push block:
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add packages/frontend/pages/organizer/upgrade.tsx
  git commit -m "fix: upgrade.tsx User type — organizerProfile does not exist, use organizerTier"
  .\push.ps1
  ```
- **Skill reinstalls** — two updated .skill files were packaged last session. Patrick needs to reinstall via Cowork before new skill behavior takes effect:
  - `conversation-defaults.skill` (Rule 28: scheduled task triage at session init)
  - `findasale-dev.skill` (Schema & Package Read Gate)

## What Was Completed This Session
- #65 Sprint 2 full billing layer (billingController, syncTier, billing routes, requireTier wired to items/export/insights)
- upgrade.tsx and subscription.tsx (new organizer pages)
- settings.tsx subscription tab
- 4 TS build errors fixed (subscriptionEndsAt, stripeCurrentPeriodEnd, sonner, hooks/useAuth)
- upgrade.tsx final fix: organizerProfile → organizerTier
- MESSAGE_BOARD.json permanently gitignored
- CORE.md §9 (skill update protocol)
- Dev SKILL.md schema/package read gate
- Brand voice guide full rewrite

## Environment Notes
- Railway + Vercel: last known state after TS fixes — upgrade.tsx organizerProfile fix is the final outstanding error. Push and verify clean build.
- Git: pending push is upgrade.tsx only. CORE.md + dev SKILL.md changes were pushed in a prior block — verify on GitHub if unclear.
- Stripe: all 5 env vars confirmed set on Railway. Test keys only — Patrick still needs Stripe business account for production.
- Session log: S171–S177 still 7 sessions behind (friction audit HIGH). After QA, consider dispatching findasale-records.

## Exact Context
- `packages/frontend/pages/organizer/upgrade.tsx` line 76: was `user?.organizerProfile` — fixed to `user?.organizerTier`
- `packages/frontend/components/AuthContext.tsx` User interface fields: `id, email, name, firstName?, businessName?, role, points, referralCode?, categoryInterests?, streakPoints?, huntPassActive?, organizerTier?, notificationPrefs?` — NO organizerProfile nested object
- Sprint 2 files: `packages/backend/src/controllers/billingController.ts`, `packages/backend/src/lib/syncTier.ts`, `packages/backend/src/routes/billing.ts`
- requireTier('PRO') applied to: `/bulk` in items.ts, export routes, `/organizer` in insights.ts
- Raw body middleware at index.ts line ~196: `app.use('/api/billing/webhook', express.raw({ type: 'application/json' }))` — must remain BEFORE json() parser
- QA scope: all 4 billing endpoints + requireTier behavior + webhook idempotency (ProcessedWebhookEvent model already in schema)
