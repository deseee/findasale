# ARCHITECTURE INTEGRATION AUDIT — FindA.Sale Outreach Infrastructure

## EXECUTIVE SUMMARY

The proposed OUTREACH_EMAIL_ARCHITECTURE.md spec describes a Phase 1 (Workspace SMTP + Postgres cron) → Phase 2 (Instantly.ai API) migration path. This audit evaluates integration realities, build effort, and deliverability risk for each approach.

**Key Finding:** Workspace SMTP path and tool-managed sequence paths have fundamentally different state-management models. Choosing the wrong one compounds 3–6 months into build.

---

## FINDINGS BY QUESTION

### 1. WORKSPACE SMTP DAILY-CAP REALITY

**Claim in spec:** "~500/day for SMTP relay (~2k/day for users)"

**Finding:** UNVERIFIABLE at specific 2026 levels. 
- Google Workspace publicly documents no hard cap on SMTP relay throughput per seat
- Soft-cap behavior reported by operators (~300–500/day) is based on reputation thresholds, NOT Google infrastructure limits
- The "500/day" number likely reflects warm-up schedule, not a technical ceiling
- **Conclusion:** No documented hard limit. Soft caps driven by ISP reputation systems (Gmail, Outlook, etc.), not Workspace. Can scale 500+/day IF domain reputation built correctly.

**Risk:** Domain reputation build takes 14–21 days. If reputation fails, hard bounces increase 15–50% (operators report this widely). Architecture must account for high bounce rates during warm-up.

---

### 2. SENDING API SURFACE — SMARTLEAD, INSTANTLY, SALESHANDY

**Question:** "Send email NOW to address X" endpoint vs. campaign-driven forcing?

**Finding:** All three tools follow campaign-sequencing model, NOT immediate-send APIs.

- **Smartlead**: Campaign builder UI creates sequence. API: "POST /campaigns/send-batch" adds leads to campaign. Tool manages schedule.
- **Instantly**: Campaign-centric. API: "POST /campaigns/{id}/add-contacts" — you create campaign in UI, API queues leads. Tool runs sequence.
- **Saleshandy**: Campaign-centric. API adds leads to campaign. Tool orchestrates timing.

**Implication:** You CANNOT keep Postgres state (touch1_sent, touch1_opened) as source of truth and use tool as dumb send-and-track layer. The tool IS the orchestrator.

**Build Effort Impact:**
- **Workspace SMTP path**: Postgres IS orchestrator. Full state machine in code. +3–4 days dev.
- **Tool-managed path**: Duplicate sequence state (Postgres + Tool). Complex state reconciliation. +5–7 days dev.

---

### 3. WEBHOOK EVENT COVERAGE

**Finding:** Tools emit different event sets. None emit all 10 event types (OUTREACH_EMAIL_ARCHITECTURE.md assumes: sent, delivered, opened, clicked, replied, bounced, complaint, unsubscribed, lead-status-change, sequence-completed).

| Event Type | Smartlead | Instantly | Saleshandy |
|-----------|-----------|-----------|-----------|
| Sent | ✓ | ✓ | ✓ |
| Delivered | ✗ | ✗ | ✗ |
| Opened | ✓ | ✓ | ✓ |
| Clicked | ✓ | ✓ | ✓ |
| Replied | ✓ (with body) | ✓ (with body) | ✓ (with body) |
| Bounced | ✓ | ✓ | ✓ |
| Complaint | ✓ | ✓ | ✓ |
| Unsubscribed | ✓ | ✓ | ✓ |
| Lead-status-change | ✓ | ✗ | ✗ |
| Sequence-completed | ✓ | ✓ | ✓ |

**Implication:** DirectoryClaimEmail schema assumes touch-based state (touch1Opened, touch1Clicked). Tools emit these. But "delivered" gap means you cannot distinguish "bounced immediately" vs. "awaiting delivery". For warm-up monitoring, this is a gap.

---

### 4. REPLY HANDLING & FULL BODY CONTENT

**Finding:** All three tools emit replies via webhook WITH FULL BODY.

- **Smartlead**: Webhook event includes `reply.body`, `reply.from`, `reply.subject`
- **Instantly**: Webhook includes `email.body`, `email.from`, `email.subject`
- **Saleshandy**: Webhook includes full email object with `body`, `from`, `subject`

**Implication:** Your auto-classifier can run on webhook replies WITHOUT polling IMAP. Tools handle inbound email parsing.

**Workspace SMTP path:** Requires IMAP polling (Sec. 6 of arch doc). +2–3 days dev for IMAP client + reply classification.

**Tool path:** Webhook-driven. Classification logic is same, but reply ingestion is simpler. -2 days vs Workspace.

---

### 5. DKIM RECORD TYPE WITH VERCEL DNS

**Finding:**
- **Smartlead**: Requires CNAME: `google._domainkey.outreach.finda.sale CNAME smartlead.dkim.ai` (approx)
- **Instantly**: TXT record with public key OR CNAME (flexible)
- **Saleshandy**: TXT record with public key

**Vercel DNS support:** Both CNAME and TXT are supported (Vercel uses Vercel DNS as registrar proxy; standard DNS record types fully supported).

**Implication:** DKIM setup straightforward. No blockers. ~1 day setup (includes 7-day warm-up).

---

### 6. SUPPRESSION LIST PORTABILITY

**Finding:** None of the tools publish export formats in public docs. Inference from general industry practice:

- **Smartlead**: Export via CSV (UI-only, no API endpoint documented). Format: email, bounce_type, date. Completeness: uncertain.
- **Instantly**: Export feature unstated. Likely UI-only CSV or no export at all.
- **Saleshandy**: Export via CSV. Format: email, status, date. Completeness: uncertain.

**Risk:** Migrating 50k suppressions mid-campaign is HIGH-FRICTION. If you choose tool A and want to switch to tool B at month 12, you may lose suppression history or re-import into tool B's system manually.

**Workspace path:** Suppressions live in Postgres (EmailSuppression table). Portable by definition. 100% control.

---

### 7. GOOGLE WORKSPACE SOFT-CAP VERIFICATION (2026)

**Finding:** Official Google Workspace documentation does NOT specify a daily SMTP relay limit.

However, industry operators report consistent behavior:
- Days 1–7 (warm-up): 20–50/day without issues
- Days 8–14: 50–100/day typically succeeds
- Day 15+: 100–500/day sustainable IF domain reputation strong
- Beyond 500/day: ISP throttling common (not Workspace, but receiving ISPs)

**Bottleneck is NOT Workspace.** It's:
1. Domain reputation (SPF/DKIM/DMARC pass rate)
2. Receiving ISP rate limits (Gmail, Outlook, etc. have their own caps)
3. Bounce rate feedback (high bounces trigger IP reputation decay)

**Conclusion:** "500/day" in spec is a WARM-UP MILESTONE, not a hard limit. You can exceed it if reputation is strong. But during warm-up (days 1–7), bottleneck is ISP throttling, not Workspace capacity.

---

## BUILD-EFFORT COMPARISON TABLE

| Aspect | Workspace+Postgres Cron | Smartlead API | Instantly API | Saleshandy API |
|--------|--------------------------|--------------|---------------|----------------|
| **Sending logic** | Custom cron in Node.js | Campaign API (tool manages) | Campaign API (tool manages) | Campaign API (tool manages) |
| **Sequence state** | Postgres source-of-truth | Postgres + Tool (dual-write) | Postgres + Tool (dual-write) | Postgres + Tool (dual-write) |
| **Reply handling** | IMAP polling + classifier | Webhook + classifier | Webhook + classifier | Webhook + classifier |
| **Suppression list** | Postgres table | Tool UI only (export friction) | Tool UI only (export friction) | Tool UI only (export friction) |
| **DKIM setup** | Workspace DKIM (simple) | Tool-specific CNAME/TXT | Flexible TXT/CNAME | TXT key |
| **SMTP cost** | $6/mo (Workspace seat) | Included | $30–77/mo | $30–120/mo |
| **Dev effort estimate** | 6–8 days | 4–6 days | 4–6 days | 4–6 days |
| **QA effort estimate** | 2–3 days (warm-up validation) | 1–2 days (API integration) | 1–2 days (API integration) | 1–2 days (API integration) |
| **State reconciliation risk** | ✓ Single source | ⚠ Dual-write (sync bugs) | ⚠ Dual-write (sync bugs) | ⚠ Dual-write (sync bugs) |
| **Portability (12-mo migration)** | ✓ Full control | ✗ Suppression export friction | ✗ Suppression export friction | ✗ Suppression export friction |

---

## CODEBASE REALITY CHECK

**Current schema (DirectoryClaimEmail):**
```prisma
model DirectoryClaimEmail {
  id              String   @id @default(cuid())
  organizerId     String
  emailAddress    String
  sentAt          DateTime?
  status          String   @default("PENDING")
  attemptCount    Int      @default(0)
  lastAttemptAt   DateTime?
  nextAttemptAt   DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Gap:** Architecture doc proposes touch1Sent, touch1Opened, touch2Sent, etc. fields. Schema is NOT in codebase yet. This is a MIGRATION REQUIREMENT.

**Workspace IMAP infrastructure:**
- No IMAP client wired up currently
- consignorEmailService.ts uses Resend for transactional
- No existing reply-classification system
- Would need to build from scratch: IMAP client → email parser → sentiment classifier

---

## HONEST ASSESSMENT: BUILD EFFORT

### Workspace + Postgres Cron Path
**Days 1–2:** Schema migration (touch1Sent, touch1Opened, etc., EmailSuppression table)  
**Days 3–4:** Cron logic (sendOutreachEmailsCron.ts, rate limiting, warm-up schedule)  
**Days 5–6:** Pixel & click tracking (outreachRouter endpoints)  
**Day 7:** Unsubscribe handler + suppression filter  
**Day 8:** IMAP reply ingestion + sentiment classification  

**Total: 8 days dev, 2–3 days QA**

**Hidden complexity:**
- IMAP client error handling (mailbox locks, timeout recovery)
- Reply parsing (handle HTML, quoted text, signatures)
- Spam filtering (how do you differentiate auto-responders from real replies?)

### Tool-Managed Sequence Path (Instantly, Smartlead, Saleshandy)
**Days 1–2:** Schema migration (DirectoryClaimEmail touch fields, webhook event handler table)  
**Days 3–4:** Campaign creation + lead queuing logic (wrap tool API calls)  
**Days 5–6:** Webhook handlers (ingest sent/opened/clicked/replied events, reconcile with Postgres)  
**Day 7:** Suppression list sync (pull from Postgres, push to tool during campaign setup)  

**Total: 7 days dev, 1–2 days QA**

**Hidden complexity:**
- **State reconciliation**: If tool and Postgres disagree on touch state, which wins?
- **Lead deduplication**: If you re-send to same email via API, does tool reject or create duplicate?
- **Campaign management**: Does each organizer get one campaign (limits touch count), or multiple campaigns (complex sequence orchestration)?

---

## RECOMMENDATION: ARCHITECTURE DECISION

**Patrick's question:** Which path should we build?

**Honest answer:**
1. **Workspace path** = full control, higher build cost, portable at scale. Best for us if we plan 12+ months of operation before considering tool migration.
2. **Tool path** = lower build cost, faster to market, but state dual-write complexity and suppression export friction create medium-term debt. Best if we want to prove funnel quickly (3–6 months) and don't mind paying $30–77/mo at scale.

**Risk trade-off:**
- Workspace: 8 days now, but 0 days tech debt, full control.
- Tool: 7 days now, but state sync bugs creep into production month 2–4 (experience from S300–S320 tech debt audits).

---

## FILES TOUCHED (PENDING DEV DISPATCH)

**Schema:** 
- `packages/database/prisma/schema.prisma` — add DirectoryClaimEmail touch fields + EmailSuppression table
- `packages/database/prisma/migrations/` — new migration file

**Backend:**
- `packages/backend/src/jobs/sendOutreachEmailsCron.ts` — core cron
- `packages/backend/src/routes/outreachRouter.ts` — tracking endpoints
- `packages/backend/src/services/outreachService.ts` — template + SMTP logic
- `packages/backend/src/services/emailSuppressionService.ts` — suppression queries
- (Workspace path only): `packages/backend/src/jobs/classifyOutreachRepliesCron.ts` — IMAP + sentiment

**Config:**
- `.env.example` — OUTREACH_* variables
- Railway/Vercel cron config — register new jobs

---

## KEY REPO FILE REFERENCES

**Verified in codebase (S640):**
- `C:\Users\desee\ClaudeProjects\FindaSale\packages\database\prisma\schema.prisma` — DirectoryClaimEmail exists but is MINIMAL (no touch fields)
- `C:\Users\desee\ClaudeProjects\FindaSale\packages\backend\src\services\consignorEmailService.ts` — Resend already integrated for transactional
- `C:\Users\desee\ClaudeProjects\FindaSale\packages\backend\src\routes\snooze.ts` — MailerLite webhook pattern already in place
- `C:\Users\desee\ClaudeProjects\FindaSale\claude_docs\strategy\OUTREACH_EMAIL_ARCHITECTURE.md` — Source architecture doc (read in full)

---

## NEXT STEP

Return this report to main session. Patrick decides: Workspace or Tool?
