# Cold Outreach Email Infrastructure Architecture

**Status:** ARCHITECTURE DESIGN (Phase 1 — Email-Only via Workspace + Postgres Cron)  
**Owner:** Patrick (decision) | Architect (design)  
**References:** `organizer-acquisition-strategy.md` v3, `decisions-log.md` D-S268, D-S626  
**Timeline:** 14 days from approval (8 days domain warm-up + 6 days build)  
**Cost:** $6/mo marginal (Workspace seat only; Postgres, cron, DNS already owned)

---

## 1. Component Overview

### 1.1 Service Topology

| Component | Technology | Cost | Purpose | Status |
|-----------|-----------|------|---------|--------|
| **Email Sender** | Google Workspace SMTP | $6/mo | Outbound email delivery from `outreach@finda.sale` | Phase 1 |
| **Suppression List** | PostgreSQL table + webhook handlers | $0 | Bounces, complaints, opted-out addresses | New build |
| **Tracking Infrastructure** | Postgres + pixel tracking + link rewrites | $0 | Opens, clicks, reply classification | New build |
| **Send Logic** | Node.js Postgres Cron | $0 | 4-touch sequence, rate limiting, state machine | New build |
| **Reply Handling** | Resend inbound webhooks + automation | $0 | Bounce detection, complaint parsing, auto-reply | New build |
| **Domain Authority** | `outreach.finda.sale` subdomain | $0 (owned) | Reputation isolation, warm-up | DNS setup |
| **Phase 2 Migration** | Instantly.ai | $30–77/mo | At-scale sending (≥500/day) | Future |

### 1.2 Why This Stack

**Google Workspace SMTP vs. Resend/SendGrid/Postmark:** All major transactional providers explicitly prohibit cold outreach in their AUPs. Workspace SMTP is a raw delivery channel with no restrictions — we own the reputation. Workspace account is isolated from patrick@finda.sale so cold-send reputation does not degrade primary email.

**Postgres Cron vs. Instantly.ai Phase 1:** Volume is <100/day initially. Custom cron costs $0 and gives full control over scheduling, rate limiting, and state tracking. Instantly.ai ($30–77/mo) enters when volume exceeds ~500/day and we want their compliance/deliverability features (dedicated IPs, bounce management, list hygiene).

**Resend for Transactional, Workspace for Cold:** Clear separation of concerns. Transactional (welcome, verification, invoices) stays on Resend. Cold outreach on Workspace. Two sender reputations never cross.

---

## 2. Schema Additions (Prisma Migrations)

### 2.1 EmailSuppression Table

Tracks bounces, complaints, opt-outs, and bad addresses. Single source of truth for suppression state.

```prisma
model EmailSuppression {
  id              String   @id @default(cuid())
  emailAddress    String   @unique
  
  // Suppression reasons
  bounceHard      Boolean  @default(false)  // Hard bounce (invalid email)
  bounceSoft      DateTime? // Soft bounce timestamp (retry-able, but don't send)
  complaintEmail  DateTime? // User marked as spam
  optedOut        DateTime? // User clicked unsubscribe
  
  // Metadata
  suppressionReason String? // "hard_bounce" | "soft_bounce" | "complaint" | "opted_out" | "manual"
  suppressedAt    DateTime @default(now())
  
  // Optional: track which organizer/campaign surface the suppression
  relatedOrganizerId String?
  relatedTouchNumber Int?    // Touch 1, 2, 3, or 4
  
  // Resend webhooks populate these
  resendEventId   String?
  resendTimestamp DateTime?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([emailAddress]) // One suppression record per address
  @@index([suppressedAt])
  @@index([bounceHard])
  @@index([complaintEmail])
  @@index([optedOut])
}
```

### 2.2 DirectoryClaimEmail Extensions

Extend existing DirectoryClaimEmail to track outreach metrics.

```prisma
model DirectoryClaimEmail {
  id              String   @id @default(cuid())
  organizerId     String
  organizer       Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  emailAddress    String
  sentAt          DateTime?
  status          String   @default("PENDING")
  attemptCount    Int      @default(0)
  lastAttemptAt   DateTime?
  nextAttemptAt   DateTime?
  
  // NEW: Outreach tracking fields
  // Touch sequence state
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
  
  // Reply handling state
  replyStatus     String? // null | "positive" | "negative" | "question" | "bounce"
  replyReceivedAt DateTime?
  replyClassifiedAt DateTime?
  autoResponseSentAt DateTime?
  
  // Warm-up and rate limiting
  warmupBucketKey String? // e.g. "day-1-slot-3" for scheduling
  sendQueuedAt    DateTime?
  
  // Campaign metadata
  campaignId      String? // Link to broader campaign tracking
  campaignStartedAt DateTime?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@index([organizerId])
  @@index([status, nextAttemptAt])
  @@index([emailAddress])
  @@index([touch1SentAt, touch1Opened, touch1Clicked]) // for T2 trigger queries
  @@index([touch4SentAt]) // for break-up email queries
  @@index([replyStatus])
  @@index([warmupBucketKey])
}
```

### 2.3 OutreachEmailTemplate Table (Optional — for A/B Testing Phase 2)

Not needed for Phase 1 (single fixed subject line per decision). Included for future extensibility.

```prisma
model OutreachEmailTemplate {
  id              String   @id @default(cuid())
  touchNumber     Int      // 1, 2, 3, or 4
  variant         String   // "a", "b", "c" (phase 2)
  subjectLine     String
  bodyHtml        String
  plainText       String
  ctaUrl          String?
  videoUrl        String? // Includes ?src= tracking parameter
  
  activeAt        DateTime?
  deactivatedAt   DateTime?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([touchNumber, variant])
}
```

### 2.4 OutreachMetrics Table (Optional — Analytics Only)

For tracking campaign performance without real-time computation.

```prisma
model OutreachMetrics {
  id                String   @id @default(cuid())
  campaignDate      DateTime @default(now())
  
  // Sent counts
  touchNumber       Int      // 1, 2, 3, 4
  totalSent         Int
  
  // Engagement
  opensCount        Int      @default(0)
  clicksCount       Int      @default(0)
  repliesCount      Int      @default(0)
  
  // Suppression events
  bouncesHard       Int      @default(0)
  bouncesSoft       Int      @default(0)
  complaints        Int      @default(0)
  optOuts           Int      @default(0)
  
  // Outcomes
  claimsCount       Int      @default(0)
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@unique([touchNumber, campaignDate])
}
```

---

## 3. DNS Records Required

### 3.1 Subdomain Setup

Create `outreach.finda.sale` with isolated SPF/DKIM/DMARC. This isolates cold-send reputation from patrick@finda.sale and primary finda.sale domain.

```
Subdomain: outreach.finda.sale
Registrar: [Patrick's domain registrar]
Target: Workspace SMTP or MTA relay
```

### 3.2 SPF Record

```
outreach.finda.sale TXT "v=spf1 include:_netblocks.google.com include:_netblocks2.google.com include:_netblocks3.google.com ~all"
```

**Rationale:** Google Workspace SMTP requires SPF to include Workspace netblocks. Soft-fail (~all) allows fallback. Hard-fail (-all) acceptable after 14-day warm-up.

### 3.3 DKIM Records

Google Workspace auto-generates DKIM keys. Workspace admin console displays:
- Selector: `google` (standard)
- Public key: Auto-provisioned

Add to DNS:
```
google._domainkey.outreach.finda.sale CNAME google._domainkey.[findasale-workspace-domain].gmail.com
```

Or manual TXT record if CNAME not allowed:
```
google._domainkey.outreach.finda.sale TXT "v=DKIM1; k=rsa; p=[public-key-from-workspace]"
```

### 3.4 DMARC Record

```
_dmarc.outreach.finda.sale TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@finda.sale; ruf=mailto:dmarc-forensics@finda.sale; pct=100"
```

**Rationale:**
- `p=quarantine` (not `p=reject` yet) during warm-up. Upgrade to `reject` after 7 days of clean data.
- `pct=100` applies policy to 100% of traffic.
- RUA/RUF: reports tell us about auth failures early.

### 3.5 Warm-Up Schedule for DNS

| Day | Action | Rationale |
|-----|--------|-----------|
| Day 0 | Publish SPF, DKIM, DMARC with `p=quarantine` | Passive monitoring phase |
| Day 1 | Send 20/day test emails to Patrick's inbox | Verify DKIM/SPF pass |
| Day 2–3 | Send 50/day to internal testing addresses | Confirm no spam folder landing |
| Day 4–7 | Increase to 100/day, monitor bounce/complaint rates | Real sending at steady rate |
| Day 7 | Upgrade DMARC to `p=reject` if no failures | Tighten reputation |
| Day 8+ | Begin Touch 1 production sends (20/day, scale per schedule) | Go live |

---

## 4. Cron Job Specification

### 4.1 Architecture: Three Cron Jobs

**Outreach Cron** runs every 4 hours. Each run handles one wave of the rate-limiting schedule. Example 4-hour run sends 5–25 emails depending on the day's quota.

| Cron | Schedule | Purpose | Queue Size |
|------|----------|---------|-----------|
| **sendOutreachEmails** | Every 4 hours (0, 4, 8, 12, 16, 20) | Core 4-touch sending logic | See 4.2 |
| **processOutreachBounces** | Every 1 hour | Poll Resend webhooks for bounces/complaints | N/A |
| **classifyOutreachReplies** | Every 2 hours | Auto-classify replies, update suppression | N/A |

### 4.2 sendOutreachEmails Cron Spec

**File path:** `packages/backend/src/jobs/sendOutreachEmailsCron.ts`

**Invocation:** HTTP POST `/internal/cron/send-outreach-emails`  
**Authentication:** Bearer token (`X-Railway-Cron` header validation)  
**Timeout:** 60 seconds  
**Retries:** 3x (Railway standard)

**Logic Flow:**

```
1. Determine current day-of-campaign and time-of-day
2. Look up daily send quota based on warm-up schedule (§4.3)
3. Query DirectoryClaimEmail for records ready to send:
   - Touch 1: created within last 0 days (all new), not yet sent, not suppressed
   - Touch 2: touch1SentAt between 4–5 days ago AND touch1Opened = false
   - Touch 3: touch1SentAt between 9–10 days ago AND touch1Opened = true AND touch1Clicked = false
   - Touch 4: touch1SentAt between 21+ days ago AND status != "CLAIMED"
   
4. Apply suppression filter (EmailSuppression.bounceHard, optedOut, complaintEmail)

5. Apply warm-up rate limit:
   - Limit batch to (daily_quota / 6) per 4-hour window
   - Example: Day 3 quota = 50/day → 8 emails per 4-hour cron run
   
6. Apply per-organizer send jitter:
   - Randomize send order within batch (no sequential name clustering in logs)
   
7. For each email:
   a. Generate personalization tokens: [Name], [Business Name], [City], [Preview URL], [Tracking Pixel URL]
   b. Render email template (HTML + plain text)
   c. Generate unique tracking pixel URL (uuid-based)
   d. Rewrite video link with ?src=outreach-[touch#] parameter
   e. Build unsubscribe link: https://finda.sale/api/outreach/unsubscribe?token=[signing token]
   f. Add physical address footer (CAN-SPAM compliance)
   g. Send via Workspace SMTP (outreach@finda.sale)
   h. Update DirectoryClaimEmail: touch[N]SentAt = now(), status = "SENT"
   i. Log to OutreachEmailEvent (audit trail)
   
8. Update OutreachMetrics snapshot for the touch/day

9. Return: { totalSent, failed, errors: [...] }
```

**Workspace SMTP Config:**

```javascript
{
  host: 'smtp.google.com',
  port: 587,
  secure: false, // TLS
  auth: {
    user: 'outreach@finda.sale', // Google Workspace email
    pass: '[App Password from Workspace Admin Console]' // NOT regular password
  }
}
```

**Rate Limiting Schedule:**

| Day | Daily Quota | Rationale |
|-----|-------------|-----------|
| Day 1–7 | 20/day | Warm-up phase, reputation building |
| Day 8–14 | 50/day | Increase as reputation solidifies |
| Day 15–21 | 100/day | Full speed for Touch 1 production |
| Week 4+ | 200/day | Sustainable steady state |

**Example Query for Touch 2 (4-touch cron run on Day 6):**

```sql
SELECT dce.*
FROM "DirectoryClaimEmail" dce
JOIN "Organizer" o ON dce."organizerId" = o.id
LEFT JOIN "EmailSuppression" es ON dce."emailAddress" = es."emailAddress"
WHERE dce."touch1SentAt" >= NOW() - INTERVAL '5 days'
  AND dce."touch1SentAt" <= NOW() - INTERVAL '4 days'
  AND dce."touch1Opened" = false
  AND dce."touch2SentAt" IS NULL
  AND es.id IS NULL  -- Not in suppression list
  AND o."suppressOutreach" = false
  AND o."directoryStatus" != 'CLOSED'
LIMIT (daily_quota / 6)
```

### 4.3 processOutreachBounces Cron

**File:** `packages/backend/src/jobs/processOutreachBouncesCron.ts`  
**Schedule:** Every 1 hour  
**Logic:**
1. Query Resend webhook events (stored in database when delivered via webhook)
2. For each bounce/complaint event:
   - Create or update EmailSuppression record
   - Update DirectoryClaimEmail.replyStatus = "bounce" or "complaint"
   - Log metrics

**Webhook Prerequisite:** Resend webhook configured to POST bounce/complaint events to `/api/outreach/resend-webhook`. See §4.4.

### 4.4 classifyOutreachReplies Cron

**File:** `packages/backend/src/jobs/classifyOutreachRepliesCron.ts`  
**Schedule:** Every 2 hours  
**Logic:**
1. Query DirectoryClaimEmail records with recent replies (replyReceivedAt within last 2 hours, replyClassifiedAt IS NULL)
2. For each reply:
   - Read reply subject + body from inbound email (requires email forwarding setup, see §6)
   - Classify sentiment: positive | negative | question | other
   - Update DirectoryClaimEmail.replyStatus
   - If negative/opt-out: create EmailSuppression record
   - If question: queue auto-reply with FAQ + /video link (via sendAutoReply job)
3. Update metrics

---

## 5. Open/Click Tracking Infrastructure

### 5.1 Pixel Tracking for Opens

Each email includes:
```html
<img src="https://finda.sale/api/outreach/pixel?trackingId=uuid-here" width="1" height="1" style="display:none;" alt="" />
```

**Endpoint:** `GET /api/outreach/pixel`

```typescript
// packages/backend/src/routes/outreachRouter.ts
router.get('/pixel', async (req, res) => {
  const { trackingId } = req.query;
  const [uuidPart, emailHash] = trackingId.split(':');
  
  // Look up DirectoryClaimEmail by tracking ID
  const claimEmail = await prisma.directoryClaimEmail.findUnique({
    where: { trackingPixelId: trackingId }
  });
  
  if (claimEmail) {
    // Update touch[N]Opened = true, touch[N]OpenedAt = now()
    const touchNum = determineTouchNumber(claimEmail);
    await prisma.directoryClaimEmail.update({
      where: { id: claimEmail.id },
      data: {
        [`touch${touchNum}Opened`]: true,
        [`touch${touchNum}OpenedAt`]: new Date()
      }
    });
  }
  
  // Return 1x1 transparent GIF
  res.set('Content-Type', 'image/gif');
  res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});
```

### 5.2 Click Tracking for Links

Every link in the email is wrapped with a redirect:

Original:
```
https://finda.sale/video?src=outreach-a
```

Rewritten:
```
https://finda.sale/api/outreach/click?trackingId=uuid&original=https%3A%2F%2Ffinda.sale%2Fvideo%3Fsrc%3Doutreach-a
```

**Endpoint:** `GET /api/outreach/click`

```typescript
router.get('/click', async (req, res) => {
  const { trackingId, original } = req.query;
  
  const claimEmail = await prisma.directoryClaimEmail.findUnique({
    where: { trackingId }
  });
  
  if (claimEmail) {
    const touchNum = determineTouchNumber(claimEmail);
    await prisma.directoryClaimEmail.update({
      where: { id: claimEmail.id },
      data: {
        [`touch${touchNum}Clicked`]: true,
        [`touch${touchNum}ClickedAt`]: new Date()
      }
    });
  }
  
  // Redirect to original URL
  res.redirect(302, original);
});
```

### 5.3 Storage of Tracking IDs

Add to DirectoryClaimEmail schema:

```prisma
trackingPixelId    String?  @unique // UUID for pixel tracking
trackingToken      String?  @unique // Signing token for unsubscribe verification
```

Generate on first send:
```typescript
const trackingPixelId = `${uuid()}:${hashEmail(email)}`;
const trackingToken = sign({ organizerId, email }, process.env.OUTREACH_SECRET, { expiresIn: '90d' });
```

---

## 6. Reply Handling & Email Forwarding

### 6.1 Inbound Email Setup

Replies to `outreach@finda.sale` must be captured and classified. Two approaches:

**Option A: Google Workspace Forwarding (Recommended)**
1. Workspace admin sets auto-forward from `outreach@finda.sale` → `outreach-inbound@finda.sale` (or relay address)
2. Backend monitors inbound mailbox via IMAP or pop3 (every 2 hours, classifyOutreachReplies cron)
3. Parse sender, subject, body
4. Update DirectoryClaimEmail.replyStatus and (re)generate EmailSuppression

**Option B: Resend Inbound Webhook (Future)**
When migrating to Instantly.ai, both have native reply webhook support. Phase 1 skips this.

### 6.2 Reply Classification Rules

```
IF subject contains "unsubscribe" OR body contains "remove me" OR "please stop"
  → replyStatus = "opted_out"
  → Create EmailSuppression(emailAddress, suppressionReason="opted_out")
  → DO NOT auto-reply (honor request immediately)

ELSE IF sentiment = "positive" (regex: "interested", "love it", "tell me more", etc.)
  → replyStatus = "positive"
  → Queue auto-reply: "Thanks! [FAQ snippet + /video link]"
  → Log for manual follow-up (Patrick gets weekly digest)

ELSE IF sentiment = "negative" (regex: "not interested", "remove", "stop", "please stop")
  → replyStatus = "negative"
  → Create EmailSuppression(suppressionReason="manual_opt_out")
  → DO NOT auto-reply

ELSE IF contains question mark (body contains "?")
  → replyStatus = "question"
  → Queue auto-reply with FAQ link + /video + "We'll follow up personally"

ELSE
  → replyStatus = "other"
  → Log for manual review
```

### 6.3 Auto-Reply Templates

```
Subject: Re: [original subject]

Hi [Name],

Thanks for getting back to us. Here's a quick FAQ on common questions:

Q: Do I have to use it? You've already built my storefront, so it's ready whenever you want.

Q: What does it cost? Free forever. Your first sale on FindA.Sale runs on our PRO toolkit at no extra cost.

Q: Can I export my listings? Yes — all your data is yours. Export to eBay, Amazon, Poshmark, or keep it here.

Q: What's the catch? 10% platform fee on sales (same as eBay and Etsy). No monthly subscription required unless you want extra features.

Learn more: https://finda.sale/video?src=outreach-reply

We'll follow up personally if you have more questions.

— The FindA.Sale Team
```

---

## 7. Suppression & Compliance

### 7.1 CAN-SPAM Requirements

Every email MUST include:
1. **Sender:** "FindA.Sale" or "The FindA.Sale Team" (from outreach@finda.sale)
2. **Physical Address:** Include mailing address in footer (Patrick's office address or registered business address)
3. **Unsubscribe Link:** `https://finda.sale/api/outreach/unsubscribe?token=[signing token]`

### 7.2 Unsubscribe Handler

**Endpoint:** `GET /api/outreach/unsubscribe`

```typescript
router.get('/unsubscribe', async (req, res) => {
  const { token } = req.query;
  
  try {
    const decoded = verify(token, process.env.OUTREACH_SECRET);
    const { organizerId, email } = decoded;
    
    // Create suppression record
    await prisma.emailSuppression.upsert({
      where: { emailAddress: email },
      create: {
        emailAddress: email,
        optedOut: new Date(),
        suppressionReason: 'opted_out'
      },
      update: {
        optedOut: new Date(),
        suppressionReason: 'opted_out'
      }
    });
    
    // Update DirectoryClaimEmail
    await prisma.directoryClaimEmail.updateMany({
      where: { emailAddress: email },
      data: { status: 'OPTED_OUT' }
    });
    
    res.json({ success: true, message: 'Unsubscribed. No more emails.' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid or expired token' });
  }
});
```

### 7.3 Bounce/Complaint Webhook (Resend)

**Endpoint:** `POST /api/outreach/resend-webhook`

Resend sends webhook events when an email bounces or is marked as spam.

```typescript
router.post('/resend-webhook', async (req, res) => {
  const { type, email, bounce_type } = req.body;
  
  if (type === 'email.bounced') {
    const suppressionReason = bounce_type === 'hard' ? 'hard_bounce' : 'soft_bounce';
    const update = {
      suppressionReason,
      [bounce_type === 'hard' ? 'bounceHard' : 'bounceSoft']: new Date(),
      resendTimestamp: new Date()
    };
    
    await prisma.emailSuppression.upsert({
      where: { emailAddress: email },
      create: { emailAddress: email, ...update },
      update
    });
  }
  
  if (type === 'email.complaint') {
    await prisma.emailSuppression.upsert({
      where: { emailAddress: email },
      create: {
        emailAddress: email,
        complaintEmail: new Date(),
        suppressionReason: 'complaint'
      },
      update: {
        complaintEmail: new Date(),
        suppressionReason: 'complaint'
      }
    });
  }
  
  res.status(200).json({ ok: true });
});
```

**Webhook Configuration in Resend Dashboard:**
- URL: `https://api.railway.app/v1/...` or Railway deployment domain
- Events: `email.bounced`, `email.complaint`
- Signing secret: Store in `RESEND_WEBHOOK_SECRET`

---

## 8. Query Filters (EU + QC Exclusion)

### 8.1 SQL Filter for Outreach Eligibility

All outreach queries must exclude:
- **Quebec records:** `organizer.address LIKE '%QC%' OR organizer.address LIKE '%Quebec%'`
- **EU records:** Detect via country codes or IP geo if available (not yet implemented in schema; future gate)

```sql
WHERE o."suppressOutreach" = false
  AND o."directoryStatus" != 'CLOSED'
  AND NOT (o.address ILIKE '%QC%' OR o.address ILIKE '%Quebec%')
```

**Rationale (Decision Locked D-S626):** Quebec Bill 96 (SLPEC §32–35) requires explicit consent for non-French business communication. EU records deferred to Phase 2 pending GDPR consent-first onboarding.

---

## 9. Infrastructure & Deployment

### 9.1 Environment Variables

```
OUTREACH_WORKSPACE_EMAIL=outreach@finda.sale
OUTREACH_WORKSPACE_APP_PASSWORD=[From Workspace Admin Console]
OUTREACH_SMTP_HOST=smtp.google.com
OUTREACH_SMTP_PORT=587
OUTREACH_SECRET=[Random 32-byte key for signing tokens]
RESEND_WEBHOOK_SECRET=[From Resend webhook settings]
DATABASE_URL=[Railway PostgreSQL, already configured]
```

### 9.2 Cron Job Registration (Railway)

Add to `vercel.json` or Railway cron config:

```json
{
  "crons": [
    {
      "path": "/internal/cron/send-outreach-emails",
      "schedule": "0 0,4,8,12,16,20 * * *",
      "auth": "Bearer [CRON_TOKEN]"
    },
    {
      "path": "/internal/cron/process-outreach-bounces",
      "schedule": "0 * * * *",
      "auth": "Bearer [CRON_TOKEN]"
    },
    {
      "path": "/internal/cron/classify-outreach-replies",
      "schedule": "0 */2 * * *",
      "auth": "Bearer [CRON_TOKEN]"
    }
  ]
}
```

### 9.3 Error Handling & Alerting

Cron failures surface as:
1. **Log to Slack:** Failed batch > 10% → Slack alert to #ops
2. **Log to Patrick:** Weekly digest email (Monday 9am) with summary:
   - Emails sent (by touch)
   - Opens, clicks, replies, claims
   - Suppression events (bounces, complaints, opt-outs)
   - Conversion rate (claims / sent)

---

## 10. Phase 1 → Phase 2 Migration Path

### 10.1 Instantly.ai Integration (At 500+/day)

When daily volume exceeds ~500 emails:

1. **Bulk export:** Run `exportOutreachListToInstantly.ts` job
   - Query DirectoryClaimEmail, format for Instantly.ai
   - Include suppression list (EmailSuppression table)
   - Upload to Instantly.ai contacts

2. **Campaign setup in Instantly.ai:**
   - Create 4-touch sequence using Instantly.ai's campaign builder
   - Import templates from Phase 1 (subject lines, body, video URLs)
   - Enable Instantly.ai's reply detection and bounce handling
   - Set sending schedule (20/day Day 1–7, ramp per Phase 1 plan)

3. **Webhook migration:**
   - Switch bounce/complaint webhook from Resend → Instantly.ai
   - Instantly.ai POST to `/api/outreach/instantly-webhook`
   - Update EmailSuppression handler

4. **Decommission Phase 1 cron:**
   - Disable Railway cron jobs
   - Archive Workspace SMTP config
   - (Keep Workspace seat for future use or downgrade)

5. **Cost change:**
   - Remove: $6/mo Workspace seat
   - Add: $30–77/mo Instantly.ai (depends on volume)
   - Net: +$24–71/mo, but at 500+/day volume

---

## 11. Open Questions for Patrick

1. **Email Warm-Up Timeline:** Can we wait 14 days (8 days DNS warm-up + 6 days build)? Or compress to 10 days by parallelizing build?

2. **Workspace App Password:** Have you already created the App Password for outreach@finda.sale in Workspace admin? If not, we need access to do so (requires Workspace admin panel).

3. **Physical Address:** Which address should appear in the CAN-SPAM footer? (Registered business address, FindA.Sale office, or Patrick's personal address?)

4. **Reply Handling Complexity:** Want us to build full inbound IMAP parsing + classification (§6)? Or defer to Phase 2 and just log raw replies for manual review in Phase 1?

5. **Metrics Dashboard:** Need a live metrics page (`/internal/outreach-metrics`) showing today's sends, opens, clicks, replies, claims by touch? Or is weekly digest email sufficient?

6. **Scheduling Flexibility:** Should the daily quota be hard-coded in cron logic, or should it live in a table so Patrick can adjust without code changes? (Example: OutreachScheduleConfig table with day → quota mappings)

7. **Preview URL Generation:** The "preview storefront" link — is this already live at `/organizers/[foursquareVenueId]` or does it need to be built as part of this infrastructure?

---

## 12. Summary: Build Checklist

**Schemas (Migrations):**
- [ ] EmailSuppression table (migration 20260505000000)
- [ ] DirectoryClaimEmail extensions (migration 20260505000001)
- [ ] OutreachEmailTemplate table (optional, phase 2)
- [ ] OutreachMetrics table (optional, analytics only)

**DNS (Patrick manual action):**
- [ ] Add outreach.finda.sale A record
- [ ] Add SPF record (include Google Workspace)
- [ ] Add DKIM record (or CNAME to Workspace)
- [ ] Add DMARC record (p=quarantine, upgrade to reject after Day 7)
- [ ] Wait 7 days for DNS propagation + reputation warm-up

**Backend Code (findasale-dev dispatch):**
- [ ] sendOutreachEmailsCron.ts (core logic, Workspace SMTP client)
- [ ] processOutreachBouncesCron.ts (bounce/complaint handler)
- [ ] classifyOutreachRepliesCron.ts (reply classification + auto-reply)
- [ ] outreachRouter.ts (pixel tracking, click tracking, unsubscribe endpoints)
- [ ] outreachService.ts (template rendering, personalization, send logic)
- [ ] emailSuppressionService.ts (suppression list queries, updates)
- [ ] Resend webhook handler integration

**Configuration (Patrick action):**
- [ ] Create Workspace App Password, store in environment
- [ ] Add cron routes to Railway/Vercel config
- [ ] Add Resend webhook URL to Resend dashboard

**Testing (findasale-qa dispatch):**
- [ ] Cron jobs fire on schedule (verify Rails logs)
- [ ] Emails land in Patrick's inbox, appear in Gmail (not spam)
- [ ] Pixel tracking registers opens
- [ ] Click tracking redirects correctly
- [ ] Unsubscribe token validates and suppresses
- [ ] Suppression list prevents re-sends
- [ ] Rate limiting enforces daily quota (verify cron batch size)
- [ ] Warm-up schedule progression (Day 1: 20, Day 8: 50, Day 15: 100, Day 22: 200)

**Documentation (patrick-dashboard.md update):**
- [ ] Outreach campaign launch date
- [ ] Daily send targets by week
- [ ] Metrics tracking method (weekly digest email)
- [ ] Suppression and compliance baseline

---

## 13. References & Locked Decisions

- **D-S626 (2026-05-02):** Organizer Acquisition Pipeline LOCKED (7 sub-decisions, Phase 1 email-only)
- **D-S268 (2026-03-24):** Zero-Human Automated Support Stack — reply handling fully automated
- **organizer-acquisition-strategy.md v3:** Full strategy including templates, cadence, voice rules
- **decisions-log.md:** Comprehensive decision trail

---

**Status:** Ready for developer dispatch to `findasale-dev`.  
**Estimated dev effort:** 3–4 days (core cron + routers + tests).  
**Estimated QA effort:** 1–2 days (warm-up validation, cron scheduling, metrics spot-check).
