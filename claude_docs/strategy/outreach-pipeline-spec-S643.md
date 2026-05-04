# Outreach Pipeline Developer Spec — S643

**Status:** READY FOR DEV DISPATCH  
**Owner:** Architect (this spec) | findasale-dev (implementation)  
**Authority:** D-S626 (build, don't buy) + S641 deep audit final verdict  
**Build timeline:** 8 dev days + 2 QA days + 6–14 days DNS warm-up = ~14 days to first send  
**Cost:** $6/mo (Workspace seat) + existing infrastructure (Postgres, cron, DNS)

---

## 1. Architecture Decision Summary

**VERDICT: BUILD.** Confirmed locked decision D-S626. Workspace SMTP + Postgres-cron path is architecturally superior to cold-email vendor tools (Smartlead, Instantly, Saleshandy, Snov.io).

**Why:** All four vendors are *campaign-orchestrators* that require sequence state live in their UI, not dumb send-and-track APIs. Accepting a vendor forces dual-write architecture (Postgres state ⟷ Tool state), which creates reconciliation debt by month 3 — this pattern caused S300–S320 entries. Building in-house keeps `DirectoryClaimEmail` as single source of truth for touch sequencing, with zero state-sync overhead.

**Cost/timeline trade-off:** Workspace path = 8 dev days (vs 7 for vendor) + 2 QA days + 6–14 days DNS warm-up. Tool path = 7 dev + 1–2 QA + 0 warm-up, BUT adds $24–88/mo ongoing + suppression list lock-in + one-webhook-per-plan limits on Smartlead Pro (fatal for our state machine). The 1-day "time win" evaporates once you build reconciliation logic. Choose Build.

**Reply handling path:** S641 audit explicitly documented two routes: (A) Google Workspace auto-forward to inbound mailbox + IMAP polling every 2 hours (reply detection within 120 min), or (B) Resend inbound webhook (Phase 2 when we upgrade senders). Phase 1 uses **Option A — IMAP polling via Node.js `imap` library (npm: `imap` or `mail-parser`)**, because we own the inbound channel completely. This costs ~2–3 dev days (replies in database by Day 6, not faster with webhook). Non-negotiable: IMAP parsing must complete within the 2-hour cron window.

**Workspace 500/day claim:** S641 verified that "500/day soft cap" is an ISP reputation milestone (warming domains cross-reputation thresholds at different volumes), not a Google technical limit. Operators report scaling well past it on properly warmed `outreach.finda.sale` subdomains. We can grow 20 → 100 → 500 → 1000+/day without re-platforming, contrary to v3 strategy assumption. Phase 2 trigger should be revised: not "≥500/day → switch vendor," but "if reply rate is healthy AND we want native multi-inbox rotation across 5+ Workspace seats → evaluate Saleshandy." This may never happen.

---

## 2. Postgres Schema Additions

**All additions are to existing tables or new tables below. No deletions.**

### 2.1 EmailSuppression Table (NEW)

Single source of truth for bounce/complaint/opt-out state. Suppression table queries are JOIN'd from every touch-send query.

```prisma
model EmailSuppression {
  id              String   @id @default(cuid())
  emailAddress    String   @unique
  
  // Suppression reasons — at least one must be populated
  bounceHard      DateTime?  // Hard bounce timestamp
  bounceSoft      DateTime?  // Soft bounce timestamp (retry-able; still suppress sends)
  complaintEmail  DateTime?  // User marked as spam
  optedOut        DateTime?  // User clicked unsubscribe or replied "stop"
  
  suppressionReason String? // "hard_bounce" | "soft_bounce" | "complaint" | "opted_out" | "manual"
  suppressedAt    DateTime @default(now())
  
  // Optional tracking for which campaign/touch triggered suppression
  relatedOrganizerId String?
  relatedTouchNumber Int?
  
  // Resend webhook integration (Phase 1 doesn't use this; for Phase 2)
  resendEventId   String?
  resendTimestamp DateTime?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([emailAddress])
  @@index([suppressedAt])
  @@index([bounceHard])
  @@index([optedOut])
}
```

### 2.2 DirectoryClaimEmail Extensions (MODIFY)

Add outreach tracking fields to existing table. Do NOT remove existing fields.

```prisma
// Existing fields remain. Add these:

model DirectoryClaimEmail {
  // ... existing fields ...
  
  // 4-touch sequence tracking (NEW)
  touch1SentAt    DateTime?
  touch1Opened    Boolean  @default(false)
  touch1OpenedAt  DateTime?
  touch1Clicked   Boolean  @default(false)
  touch1ClickedAt DateTime?
  
  touch2SentAt    DateTime?
  touch2Opened    Boolean  @default(false)
  touch2OpenedAt  DateTime?
  touch2Clicked   Boolean  @default(false)
  touch2ClickedAt DateTime?
  
  touch3SentAt    DateTime?
  touch3Opened    Boolean  @default(false)
  touch3OpenedAt  DateTime?
  touch3Clicked   Boolean  @default(false)
  touch3ClickedAt DateTime?
  
  touch4SentAt    DateTime?
  touch4Opened    Boolean  @default(false)
  touch4OpenedAt  DateTime?
  touch4Clicked   Boolean  @default(false)
  touch4ClickedAt DateTime?
  
  // Reply handling state (NEW)
  replyStatus     String? // null | "positive" | "negative" | "question" | "other" | "bounce"
  replyReceivedAt DateTime?
  replyClassifiedAt DateTime?
  autoResponseSentAt DateTime?
  
  // Warm-up scheduling (NEW)
  warmupBucketKey String? // e.g. "day-1-slot-3" for scheduling
  sendQueuedAt    DateTime?
  
  // Tracking IDs (NEW)
  trackingPixelId String?  @unique // UUID for pixel tracking
  trackingToken   String?  @unique // Signing token for unsubscribe verification
  
  // Campaign metadata (NEW)
  campaignId      String?
  campaignStartedAt DateTime?
  
  // Indexes (NEW)
  @@index([touch1SentAt, touch1Opened, touch1Clicked])
  @@index([touch2SentAt])
  @@index([touch3SentAt])
  @@index([touch4SentAt])
  @@index([replyStatus])
  @@index([trackingPixelId])
}
```

### 2.3 OutreachMetrics Table (OPTIONAL — Analytics Only)

For dashboard snapshots. Not required for Day 1, but include if doing intra-day metrics dashboard.

```prisma
model OutreachMetrics {
  id              String   @id @default(cuid())
  campaignDate    DateTime @default(now())
  
  touchNumber     Int      // 1, 2, 3, or 4
  totalSent       Int
  opensCount      Int      @default(0)
  clicksCount     Int      @default(0)
  repliesCount    Int      @default(0)
  bouncesHard     Int      @default(0)
  bouncesSoft     Int      @default(0)
  complaints      Int      @default(0)
  optOuts         Int      @default(0)
  claimsCount     Int      @default(0)
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([touchNumber, campaignDate])
}
```

---

## 3. Backend Files to Create/Modify (Exact Paths)

All files live under `packages/backend/`. Root is `packages/backend/src/`.

### 3.1 Cron Jobs (Core Sending Logic)

| File | Lines | Purpose |
|------|-------|---------|
| `jobs/sendOutreachEmailsCron.ts` | ~400 | Main 4-hour cron: queries send-ready records, renders templates, sends via Workspace SMTP, updates touch tracking |
| `jobs/processOutreachBouncesCron.ts` | ~150 | Hourly cron: processes bounce/complaint events, updates EmailSuppression table |
| `jobs/classifyOutreachRepliesCron.ts` | ~250 | 2-hour cron: polls inbound IMAP, classifies replies, updates replyStatus, queues auto-replies |

### 3.2 Services (Business Logic)

| File | Lines | Purpose |
|------|-------|---------|
| `services/outreachService.ts` | ~300 | Template rendering, personalization, email composition, Workspace SMTP client configuration |
| `services/emailSuppressionService.ts` | ~150 | Queries for suppression list, upserts bounce/complaint/opt-out records, sync from inbound |
| `services/replyClassifierService.ts` | ~200 | Sentiment regex rules, auto-reply queueing, suppress-list updates |
| `services/imapService.ts` | ~250 | IMAP connection, inbound polling, reply body extraction, forwarded-email parsing |

### 3.3 API Routers (Tracking & Compliance)

| File | Lines | Purpose |
|------|-------|---------|
| `routes/outreachRouter.ts` | ~200 | GET `/pixel` (open tracking), GET `/click` (click tracking), GET `/unsubscribe`, POST `/webhook-bounce` (Resend Phase 2) |

### 3.4 Types & Constants

| File | Lines | Purpose |
|------|-------|---------|
| `types/outreach.ts` | ~80 | TypeScript interfaces: `OutreachContact`, `OutreachTouch`, `ReplyClassification`, etc. |
| `constants/outreachConfig.ts` | ~60 | Rate-limiting schedule (20, 50, 100, 200/day by week), DKIM fingerprint, sender metadata |

### 3.5 Database Migrations

| File | Triggers | Purpose |
|------|----------|---------|
| `database/prisma/migrations/[timestamp]_add_email_suppression.sql` | Initial DB setup | EmailSuppression table schema |
| `database/prisma/migrations/[timestamp]_extend_directory_claim_email.sql` | Initial DB setup | DirectoryClaimEmail touch fields, tracking IDs, reply tracking |

---

## 4. Dev-Day Breakdown (~8 days)

**Parallel work where possible (Days 4–5). Sequential gates marked.**

| Day | Task | Owner | Blocker | Deliverable |
|-----|------|-------|---------|------------|
| **Day 1** | Migrations + seed data | findasale-dev | None | EmailSuppression table + DirectoryClaimEmail extensions live in local Postgres; seed 100 test organizers |
| **Day 2** | SMTP client + template rendering | findasale-dev | Day 1 | `outreachService.ts`: Workspace SMTP config, personalization tokens, HTML + plain-text render, tracking pixel + click-link rewrite |
| **Day 3** | sendOutreachEmailsCron core logic | findasale-dev | Day 2 | `sendOutreachEmailsCron.ts`: query logic for all 4 touches, suppression JOIN, warm-up rate limiting, send + update batch |
| **Day 4** | Tracking endpoints (pixel + click + unsubscribe) | findasale-dev | Day 2 | `outreachRouter.ts`: three GET endpoints, token validation, DB updates for opens/clicks/opt-outs; return 1×1 GIF + redirects |
| **Day 5** | IMAP + reply classifier | findasale-dev | Day 1 | `imapService.ts` + `replyClassifierService.ts`: connect to inbound mailbox, extract reply body, classify sentiment, queue auto-replies |
| **Day 6** | processOutreachBouncesCron + classifyOutreachRepliesCron | findasale-dev | Days 4–5 | Two cron jobs, bounce→suppression flow, reply→state-machine flow; auto-reply email sending |
| **Day 7** | EmailSuppressionService + integration tests | findasale-dev | Days 1–6 | Suppression query logic (JOIN to all send queries), test suppression filters on all 4 touches, verify no double-sends |
| **Day 8** | Type definitions, constants, Railway env var setup, TypeScript validation | findasale-dev | All | `types/outreach.ts`, `constants/outreachConfig.ts`, Railway secrets created, `npx tsc --noEmit` passes zero errors |

---

## 5. Environment Variables Required

**All stored in Railway production secret store.** Local `.env` for dev testing; `.env.production` for Railway.

```bash
# Workspace SMTP (outreach@finda.sale)
OUTREACH_WORKSPACE_EMAIL=outreach@finda.sale
OUTREACH_WORKSPACE_SMTP_HOST=smtp.google.com
OUTREACH_WORKSPACE_SMTP_PORT=587
OUTREACH_WORKSPACE_APP_PASSWORD=[From Workspace Admin Console — NOT regular password]

# IMAP (reply polling)
OUTREACH_IMAP_HOST=imap.gmail.com
OUTREACH_IMAP_PORT=993
OUTREACH_IMAP_USER=outreach@finda.sale
OUTREACH_IMAP_PASSWORD=[Same as App Password above]

# Rate limiting & feature flag
OUTREACH_DAILY_LIMIT=20                    # Start at 20, increase per warm-up schedule
OUTREACH_ENABLED=true                      # Feature flag for send cron
OUTREACH_WARM_UP_MODE=true                 # Ramp 20→50→100→200 by week; set false for full volume

# Token signing
OUTREACH_SECRET=[Random 32-byte hex key — for unsubscribe token signing]

# Optional: Resend webhook (Phase 2 only)
RESEND_WEBHOOK_SECRET=[From Resend dashboard — Phase 2 only]

# Cron authentication
CRON_TOKEN=[Random token for Railway cron auth header]

# Database (already configured)
DATABASE_URL=[Railway PostgreSQL — already set]
```

---

## 6. Railway Environment Variables + DNS Housekeeping Checklist

### 6.1 Railway Secrets (Via Railway Dashboard)

In project **keen-wisdom** (production) environment:

1. Create secret: `OUTREACH_WORKSPACE_EMAIL` = `outreach@finda.sale`
2. Create secret: `OUTREACH_WORKSPACE_APP_PASSWORD` = [value from Workspace admin, sent via secure channel from Patrick]
3. Create secret: `OUTREACH_IMAP_PASSWORD` = [same as App Password]
4. Create secret: `OUTREACH_SECRET` = [32-byte random hex, e.g., `openssl rand -hex 32`]
5. Create secret: `CRON_TOKEN` = [32-byte random hex for cron auth]
6. Create secret: `OUTREACH_DAILY_LIMIT` = `20` (for Day 1; update per warm-up schedule)
7. Create secret: `OUTREACH_ENABLED` = `true`
8. Create secret: `OUTREACH_WARM_UP_MODE` = `true` (ramps sends per schedule; set false after Day 22)

**Verification:** Railway dashboard → Project → Secrets tab → confirm all 8 secrets present before deploy.

### 6.2 DNS Housekeeping (Patrick Manual Actions)

**Prerequisite:** Workspace admin panel access (Patrick has this via Google Workspace subscription).

#### Step A: Verify current DNS state
- [ ] Query `dig outreach.finda.sale TXT` — current SPF record: `v=spf1 include:_spf.smartlead.ai ~all` (STALE from S640)
- [ ] Query `dig google._domainkey.outreach.finda.sale` — DKIM record status: pending or live?
- [ ] Query `dig _dmarc.outreach.finda.sale` — DMARC record: current policy

#### Step B: Update SPF record (remove Smartlead, add Google Workspace)
Current (stale):
```
v=spf1 include:_spf.smartlead.ai ~all
```

New (for Workspace):
```
v=spf1 include:_netblocks.google.com include:_netblocks2.google.com include:_netblocks3.google.com ~all
```

**Tools:** Via Vercel DNS dashboard (Patrick manages `finda.sale` DNS there) or registrar (Spaceship). Update record via UI; TTL = 300 or default.

#### Step C: Generate & add DKIM record
1. Google Workspace admin console → Security → **Authenticate email**
2. For domain `outreach.finda.sale`: Generate DKIM key (Google auto-provisions this)
3. Copy public key (or CNAME target, if available)
4. Add to DNS:
   ```
   google._domainkey.outreach.finda.sale CNAME google._domainkey.[findasale-workspace-domain].gmail.com
   ```
   OR (if CNAME not allowed by registrar):
   ```
   google._domainkey.outreach.finda.sale TXT "v=DKIM1; k=rsa; p=[public-key-from-workspace]"
   ```
5. Verify in Workspace admin console once DNS propagates (~10 min)

#### Step D: Set DMARC policy
1. Current (or new):
   ```
   _dmarc.outreach.finda.sale TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@finda.sale; ruf=mailto:dmarc-forensics@finda.sale; pct=100"
   ```
   - `p=quarantine` for Days 1–7 (reputation warm-up phase)
   - Upgrade to `p=reject` on **Day 7 if no DMARC failures** reported
2. Reports go to `dmarc-reports@finda.sale` (exists, alias to patrick@finda.sale)

#### Step E: Workspace App Password generation (Patrick manual)
1. Workspace admin console → Users & accounts → Patrick's account
2. Security → 2-Step Verification → **App passwords**
3. Select **Mail** + **Windows Computer** (arbitrary, not restrictive)
4. Generate → Google displays 16-char code (e.g., `wxyz abcd 1234 5678`)
5. **Send code to Claude via secure channel** (paste into Railway secret or email with PGP)
6. Do NOT commit to git, do NOT post in Slack

#### Step F: Warm-up schedule — DNS verification window
- **Day 0:** SPF, DKIM, DMARC records published, DMARC policy = `p=quarantine`
- **Day 1:** First test batch sent (20 emails to Patrick's inbox) — verify non-spam folder delivery
- **Day 4:** Increase to 100/day test batch
- **Day 7:** If zero DMARC failures → upgrade DMARC policy to `p=reject`
- **Day 8:** Begin Touch 1 production sends (20/day, scale per warm-up schedule)

---

## 7. Acceptance Criteria for S643 Dev Completion

**All must be YES before marking Done.**

- [ ] **Schema migrations deployed** to Railway production Postgres; `DirectoryClaimEmail` and `EmailSuppression` queries work; no TypeScript errors on schema access
- [ ] **Cron jobs registered** in Railway; `sendOutreachEmailsCron` fires every 4 hours, `processOutreachBouncesCron` every 1 hour, `classifyOutreachRepliesCron` every 2 hours — verify via Railway logs
- [ ] **SMTP sending works** — batch of 20 test emails sends from `outreach@finda.sale` to Patrick's inbox; emails appear in inbox (not spam folder); `touch1SentAt` timestamps populate for all 20
- [ ] **Tracking pixel fires** — email includes tracking pixel, clicking email in Gmail triggers pixel request, `touch1Opened` updates in database within 10 min
- [ ] **Click tracking redirects** — link in email is rewritten as click-tracking URL, recipient clicks link, DB records `touch1Clicked = true`, recipient lands on original destination (video URL, etc.)
- [ ] **Unsubscribe link works** — recipient clicks unsubscribe link, token validates, `EmailSuppression` record created with `optedOut` = now, `DirectoryClaimEmail.status` = `OPTED_OUT`
- [ ] **Suppression list prevents re-sends** — manually add email to `EmailSuppression` with `bounceHard = true`, next cron run skips that email, no send attempted
- [ ] **IMAP polling detects replies** — send test email, reply to it from alternate inbox, wait 2 hours, `classifyOutreachRepliesCron` fetches reply, updates `replyStatus`, stores reply body
- [ ] **Reply classifier categorizes sentiment** — test replies with positive ("interested", "tell me more"), negative ("no thanks", "remove"), and question-mark subjects; verify `replyStatus` field updates correctly
- [ ] **Warm-up rate limiting enforced** — `OUTREACH_DAILY_LIMIT=20` and `OUTREACH_WARM_UP_MODE=true`; run 4 consecutive cron jobs (~16 hours), verify total sends ≤ 20 (not 80), sends distributed across 4-hour windows
- [ ] **Bounce/complaint suppression works** — simulate Resend bounce webhook (POST /api/outreach/resend-webhook with bounce event), verify `EmailSuppression` record created; next send cron skips that email
- [ ] **TypeScript zero errors** — `cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS"` returns empty (no errors)
- [ ] **Railway env vars loaded** — cron logs show SMTP connection successful (not "OUTREACH_WORKSPACE_APP_PASSWORD undefined")
- [ ] **Admin can view pipeline status** — endpoint `/internal/outreach-status` returns JSON with today's sends, opens, clicks, replies, claims by touch (or at minimum, logs show successful queries)
- [ ] **Zero emails to opted-out contacts** — add contact to suppression list with `optedOut = now()`, run send cron, verify no send attempted (cron logs + DirectoryClaimEmail untouched)

---

## 8. File Verification Checklist (Pre-Push)

Before findasale-dev returns, verify:

```bash
# Type check
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS"
# Should return empty

# Grep for magic strings — ensure all templates reference [Business Name] not [FirstName]
grep -r "FirstName" packages/backend/src/
# Should return empty

# Grep for "AI" in copy — should say Smart, not AI
grep -ri "AI Pricing\|AI Tags\|artificial intelligence" packages/backend/src/services/outreachService.ts
# Should return empty

# Verify Workspace email literal
grep -r "outreach@finda.sale" packages/backend/src/ | head -5
# Should show ~5 hits (SMTP from, IMAP user, etc.)

# Verify cron paths are registered
grep -r "/internal/cron/send-outreach\|/internal/cron/process-outreach\|/internal/cron/classify-outreach" packages/backend/src/routes/ | wc -l
# Should be ≥ 3
```

---

## 9. Testing Scenario Template (For QA Dispatch)

**Each scenario is one Chrome interaction. Batch by feature, not by scenario count.**

### Scenario: T1 Sending (Day 1 Batch)
- **Setup:** 20 DirectoryClaimEmail records created, no touch1SentAt yet, no suppression
- **Action:** Trigger `sendOutreachEmailsCron` cron job via Patrick's internal dashboard (or simulate POST request)
- **Expected:** All 20 emails send from `outreach@finda.sale` within 60 sec; DB records `touch1SentAt = now()` for each; Rails logs show "Sent 20/20 successfully"
- **Evidence:** Screenshot of Rails logs showing send confirmations; SELECT from DB showing touch1SentAt populated

### Scenario: Tracking Pixel Fires
- **Setup:** T1 email sent to Patrick's test inbox
- **Action:** Open email in Gmail; verify pixel request in browser Network tab (DevTools)
- **Expected:** GET request to `/api/outreach/pixel?trackingId=...` returns 200, DB shows `touch1Opened = true, touch1OpenedAt = [timestamp]`
- **Evidence:** DevTools Network tab screenshot showing pixel GET; DB query SELECT showing touched fields

### Scenario: Unsubscribe Works
- **Setup:** T1 email sent to Patrick's test inbox
- **Action:** Click unsubscribe link in email
- **Expected:** Browser redirects to success page ("Unsubscribed. No more emails."); `EmailSuppression` record created with `emailAddress = [test], optedOut = now()`
- **Evidence:** Screenshot of success page; DB query showing EmailSuppression record

### Scenario: Reply Detected & Classified
- **Setup:** T1 email sent to Patrick's test inbox; Patrick replies "We're interested"
- **Action:** Wait up to 2 hours; trigger `classifyOutreachRepliesCron` cron job
- **Expected:** IMAP polling fetches reply; sentiment classifier detects "interested" → positive; DB shows `replyStatus = "positive", replyReceivedAt = [timestamp]`
- **Evidence:** Rails logs showing IMAP connect + reply fetch; DB query showing replyStatus field

---

## 10. Rollback Plan

If any cron job fails after Day 8 production go-live:

1. **Immediate:** Set `OUTREACH_ENABLED = false` in Railway → stops new sends within next cron window
2. **Within 1 hour:** Patrick reviews Rails logs for error (SMTP auth failure, IMAP timeout, DB constraint, etc.)
3. **Fix:** findasale-dev pushes hotfix to `main`; Railway auto-redeploys
4. **Verification:** findasale-qa spots-checks one full cron run (check logs + DB updates)
5. **Resume:** Set `OUTREACH_ENABLED = true`

---

## 11. Phase 2 Migration (Reference Only — Not In Scope)

When daily volume reaches 500+/day AND inbox placement stays >70% after warm-up:

1. **Decide vendor:** Saleshandy ($69/mo) is the likely choice (Instantly.ai has 2025–2026 Trustpilot spam-folder reports; Smartlead's one-webhook-per-Pro-plan is fatal)
2. **Build:** Export `DirectoryClaimEmail` + `EmailSuppression` to vendor format
3. **Migrate:** Move cron logic into vendor's campaign builder; keep Postgres as webhook receiver
4. **Cost change:** -$6 Workspace seat + $69 Saleshandy = net +$63/mo

---

## 12. References & Locked Decisions

- **D-S626 (2026-05-02):** Organizer Acquisition Pipeline LOCKED (BUILD path confirmed)
- **S641 (2026-05-03):** Cold Outreach Deep Audit — final verdict, architecture decision, vendor ranking
- `OUTREACH_EMAIL_ARCHITECTURE.md` — original design (this spec is the tightened implementation of that doc)
- `outreach-email-templates-v4.md` — 4 email templates locked for wiring
- `decisions-log.md` — decision trail (D-S626, D-006 "no AI in copy", etc.)

---

**Status:** Ready to dispatch to `findasale-dev`.  
**Owner:** Patrick (decision authority) | Architect (this spec) | findasale-dev (build) | findasale-qa (verify)  
**Execution model:** Sequential dispatch Days 1–8; parallel testing in QA phase; DNS warm-up runs alongside build.
