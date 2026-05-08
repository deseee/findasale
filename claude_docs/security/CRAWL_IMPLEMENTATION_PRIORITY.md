# Crawl System Security — Implementation Priority Matrix

**Scope:** 54 security mitigations across 21 identified risks  
**Timeline:** Phase 1 (Pre-MVP: weeks 1–2) + Phase 2 (Post-MVP: weeks 3–6) + Phase 3 (Scaling: weeks 7+)  
**Audience:** findasale-architect (roadmap planning), findasale-dev (sprint assignment)

---

## PHASE 1: PRE-MVP (WEEKS 1–2) — BLOCKING FOR LAUNCH

**Owner: findasale-legal (primary), findasale-dev (secondary), findasale-ops (tertiary)**

These mitigations must be complete before sending the first "Claim This Listing" email. No exceptions.

### Week 1

#### Monday–Tuesday (Days 1–2) — LEGAL FOUNDATIONS

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 4.1 (CAN-SPAM) | M4.1a: Legal review of email template + compliance | findasale-legal | 2d | YES | Email plan dies if this fails |
| 4.2 (GDPR) | M4.2a: Geo-blocking + consent decision | findasale-legal | 1d | YES | EU addresses must be blocked |
| 5.1 (Google ToS) | M5.1a: Legal opinion on "competing directory" | findasale-legal | 2–3d | YES | If competing, feature is dead |
| 4.3 (CCPA) | M4.3a: Deletion workflow requirements (design phase) | findasale-legal | 1d | NO | Implement in Phase 2 |

**Action:** Patrick schedules findasale-legal meeting; sends these 3 decision points:
- Email strategy: no emails (safest), organizer-sent (medium), FindA.Sale-sent (best UX, full compliance required)
- GDPR scope: EU addresses included? (requires consent flow)
- Google ToS: acceptable risk? (legal opinion determines feasibility)

**Deliverable:** Legal memo (1–2 pages per decision) + email template (if proceeding with FindA.Sale-sent)

---

#### Wednesday–Friday (Days 3–5) — DATA VALIDATION & KEY SECURITY

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 1.3 (Malformed Data) | M1.3a: Input validation schema (Zod) | findasale-dev | 1d | YES | App stability |
| 1.3 (Malformed Data) | M1.3b: Parameterized query audit | findasale-dev | 0.5d | YES | Confirm Prisma throughout |
| 1.3 (Malformed Data) | M1.3c–f: Frontend escaping + field limits | findasale-dev | 1d | YES | XSS prevention |
| 2.2 (API Key Leak) | M2.2a: Key storage audit (in .env, not hardcoded) | findasale-ops | 0.5d | YES | No hardcoding in code |
| 2.2 (API Key Leak) | M2.2b: Usage monitoring setup (spike detection) | findasale-ops | 1d | YES | Detect key compromise |

**Action:** findasale-dev + findasale-ops execute in parallel

**Deliverable:** 
- Validation schema file (with test cases)
- Query audit report (zero unsafe queries)
- Monitoring dashboard (API usage trend)
- Key rotation runbook

---

### Week 2

#### Monday–Wednesday (Days 6–10) — DEDUPLICATION & CORE LOGIC

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 1.4 (Dedup Hash Collision) | M1.4a: Tiered dedup logic (exact → fuzzy → coord) | findasale-architect | 1d | YES | Directory integrity |
| 1.4 (Dedup Hash Collision) | M1.4b: Normalization functions (name, phone, address) | findasale-dev | 0.5d | YES | Core algorithm |
| 1.4 (Dedup Hash Collision) | M1.4c: Distance-based checking (haversine) | findasale-dev | 0.5d | YES | Coord precision handling |
| 1.4 (Dedup Hash Collision) | M1.4d–e: Merge workflow + audit logging | findasale-dev | 1d | YES | Data cleanup |
| 1.1 (Fake Businesses) | M1.1a: UNVERIFIED by default, multi-source requirement | findasale-architect | 1d | YES | Directory quality gate |
| 1.1 (Fake Businesses) | M1.1b–e: Fraud detection + rate limiting | findasale-dev | 2d | NO | Implement in Phase 2 |

**Action:** findasale-architect (design) + findasale-dev (implementation) in parallel

**Deliverable:** 
- Dedup engine (test on 1,000 sample records)
- Normalization utilities
- Merge workflow (with audit log)
- Schema design doc (VERIFIED vs. UNVERIFIED status)

---

#### Thursday–Friday (Days 11–12) — COST TRANSPARENCY & API CONTRACTS

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 2.1 (Google Pricing Change) | M2.1a–b: Cost forecasting + API contract doc | findasale-architect | 1d | YES | Understand scaling impact |
| 2.1 (Google Pricing Change) | M2.2c–e: Rate limiting + billing cap | findasale-dev | 1d | YES | Cost containment |

**Action:** findasale-architect builds cost calculator spreadsheet; findasale-dev implements billing alerts

**Deliverable:** 
- Cost forecast spreadsheet (scaling scenarios)
- API contract doc (current status + deprecation risk)
- Billing alerts + cap configuration

---

## PHASE 2: POST-MVP (WEEKS 3–6) — HIGH-PRIORITY

**Owner: findasale-dev (primary), findasale-ops (secondary), findasale-architect (tertiary)**

These mitigations ship in Week 1–2 of launch but can be deferred until after MVP if necessary (not ideal).

### Week 3

#### Monday–Wednesday (Days 13–17) — QUEUE RESILIENCE & JOB MANAGEMENT

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 2.5 (Single Worker SPOF) | M2.5a: Worker redundancy + heartbeat | findasale-architect | 2d | HIGH | Crawl stall risk |
| 2.5 (Single Worker SPOF) | M2.5b–c: Job state machine + monitoring | findasale-dev | 1.5d | HIGH | Queue visibility |
| 2.5 (Single Worker SPOF) | M2.5d–e: CLI tools + graceful degradation | findasale-dev | 1d | HIGH | Manual recovery |
| 3.1 (Infinite Loop) | M3.1a: Job timeout (5min) + pagination limit (1k) | findasale-dev | 1d | HIGH | Prevent worker starvation |
| 3.1 (Infinite Loop) | M3.1b–e: Prioritization + slow job detection | findasale-dev | 1.5d | HIGH | LA-scale handling |

**Action:** findasale-architect designs queue state machine; findasale-dev implements

**Deliverable:** 
- 2+ workers deployed (different dynos)
- Job state machine (with timeout)
- CLI tools (retry, reset, peek)
- Monitoring dashboard (queue depth + age)

---

#### Thursday–Friday (Days 18–19) — ATOMIC JOB PICKUP & TRANSACTION SAFETY

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 3.3 (Race Condition) | M3.3a: Atomic job pickup (SELECT FOR UPDATE) | findasale-dev | 1d | HIGH | Duplicate write prevention |
| 3.3 (Race Condition) | M3.3b–e: Transaction isolation + idempotency | findasale-dev | 1.5d | HIGH | Data corruption risk |

**Action:** findasale-dev implements database locking + transaction isolation

**Deliverable:** 
- Job pickup uses SELECT FOR UPDATE
- Dedup check + insert in SERIALIZABLE transaction
- Test case: 2 concurrent workers process same job → only 1 succeeds

---

### Week 4

#### Monday–Wednesday (Days 20–24) — CRAWL INTEGRITY & RECOVERY

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 1.5 (Bulk Corruption) | M1.5a–b: Idempotency + rate limiting | findasale-dev | 1d | HIGH | Prevent cascading delete |
| 1.5 (Bulk Corruption) | M1.5c–e: Snapshot/rollback + notifications | findasale-ops | 1.5d | HIGH | Disaster recovery |
| 1.2 (False CLOSED) | M1.2a: 30-day observation + multi-signal CLOSED | findasale-dev | 1d | MEDIUM | Prevent false closures |
| 1.2 (False CLOSED) | M1.2b–d: Owner notification + appeal workflow | findasale-dev | 1.5d | MEDIUM | Fairness + transparency |

**Action:** findasale-dev (idempotency) + findasale-ops (snapshot/rollback + notifications)

**Deliverable:** 
- Crawl idempotency checks (same crawl_id run twice = same result)
- Snapshot mechanism (before major crawl)
- Rollback automation (<30min SLA)
- Owner notification emails + appeal form

---

#### Thursday–Friday (Days 25–26) — EMAIL DELIVERY SAFETY

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 4.4 (Domain Reputation) | M4.4a: Email verification (ZeroBounce) | findasale-ops | 1.5d | HIGH | Reduce spam complaints |
| 4.4 (Domain Reputation) | M4.4b–e: Warm-up + authentication + subdomain | findasale-ops | 1d | MEDIUM | Deliverability |
| 4.5 (Email Ownership) | M4.5a–c: Claim verification workflow | findasale-dev | 2d | HIGH | Prevent hijacking |

**Action:** findasale-ops (email infrastructure) + findasale-dev (claim verification)

**Deliverable:** 
- ZeroBounce integration (test on 100 emails)
- SPF/DKIM/DMARC records configured
- Warm-up schedule (day 1–7)
- Claim verification (multi-address)

---

### Week 5

#### Monday–Wednesday (Days 27–31) — EMAIL COMPLIANCE & SUPPRESSION

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 4.1 (CAN-SPAM) | M4.1b–f: Template compliance + unsubscribe honor | findasale-dev | 1.5d | MEDIUM | Email legal safety |
| 4.2 (GDPR) | M4.2b–e: Consent tracking + DPA + deletion | findasale-dev | 1.5d | MEDIUM | EU compliance |
| 4.3 (CCPA) | M4.3a–d: Deletion workflow + opt-out + sole proprietor handling | findasale-dev | 1.5d | MEDIUM | CA compliance |

**Action:** findasale-dev implements email compliance workflows

**Deliverable:** 
- Unsubscribe link + suppression list
- GDPR consent tracking
- CCPA deletion form (45-day SLA)
- Opt-out mechanism

---

#### Thursday–Friday (Days 32–33) — FAKE BUSINESS DETECTION

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 1.1 (Fake Businesses) | M1.1b–e: Challenge workflow + fraud classifier | findasale-dev | 2d | MEDIUM | Directory quality (Phase 2) |

**Action:** findasale-dev implements fraud signals + auto-suspension

**Deliverable:** 
- Honeypot blocklist (phone, names)
- Rate limiting (100 new/day per metro)
- Source anomaly detection (>50% UNVERIFIED → throttle)
- Challenge workflow

---

### Week 6

#### Monday–Wednesday (Days 34–38) — API & INFRASTRUCTURE SUSTAINABILITY

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 2.3 (Overpass Blocking) | M2.3a–e: Rate limiting + IP rotation + fallback | findasale-dev | 1d | MEDIUM | OSM data sustainability |
| 2.4 (HERE/Foursquare Deprecation) | M2.4a–d: API contract monitoring + coverage analysis | findasale-architect | 1d | MEDIUM | Source sustainability |
| 3.2 (Queue Table Growth) | M3.2a–e: Cleanup policy + indexing | findasale-dev | 1.5d | MEDIUM | Performance at scale |

**Action:** findasale-dev (rate limiting) + findasale-architect (strategy) + findasale-ops (monitoring)

**Deliverable:** 
- Overpass rate limit (20 queries/day)
- HERE/Foursquare monitoring doc
- Queue cleanup (7-day retention) + indexes
- Database performance tests (10k+ queue rows)

---

#### Thursday–Friday (Days 39–40) — BUSINESS OWNER SUPPORT

| Risk | Mitigation | Owner | Time | Blocker? | Notes |
|------|-----------|-------|------|----------|-------|
| 1.2 (False CLOSED) | M1.2d: Public audit log (owner visibility) | findasale-dev | 0.5d | LOW | UX improvement |
| 4.5 (Email Ownership) | M4.5d–e: Listing hold period + contact validation | findasale-dev | 1d | MEDIUM | Fairness |
| 5.3 (Defamation Risk) | M5.3a–d: Rapid correction + defamation shield + escalation | findasale-dev | 1.5d | MEDIUM | Legal defense |

**Action:** findasale-dev implements owner UX + support processes

**Deliverable:** 
- Audit log visible to owner ("last verified: date, status: [ACTIVE/UNCERTAIN/CLOSED]")
- Listing hold period (7 days pending verification)
- Contact validation (domain match, multi-source agreement)
- Support escalation form

---

## PHASE 3: SCALING (WEEKS 7+) — LOWER PRIORITY

**Owner: findasale-ops (primary), findasale-architect (secondary)**

These mitigations are nice-to-have early but required before scaling beyond 10k businesses.

| Risk | Mitigation | Owner | Time | Priority | Notes |
|------|-----------|-------|------|----------|-------|
| 3.2 (Queue Growth) | M3.2c: Queue partitioning by metro | findasale-architect | 2–3d | MEDIUM | Required at 100k+ rows |
| 4.1 (CAN-SPAM) | M4.1e: Organizer-sent email option | findasale-dev | 2d | LOW | Better legal position, future |
| 2.4 (API Deprecation) | M2.4b: Coverage analysis (quarterly) | findasale-ops | 0.5d | LOW | Ongoing monitoring |
| 5.3 (Defamation) | M5.3c: Rapid takedown process (24hr SLA) | findasale-ops | 1d | LOW | When complaints arrive |

---

## PARALLEL WORK STREAMS

**To accelerate Phase 1–2, dispatch in parallel (by week):**

### Week 1 Parallel
- findasale-legal: Email + GDPR + Google ToS decisions (Days 1–5)
- findasale-dev: Input validation + API key audit (Days 1–5)
- findasale-ops: Monitoring setup + cost forecast (Days 1–5)

### Week 2 Parallel
- findasale-architect: Dedup design + UNVERIFIED logic (Days 6–10)
- findasale-dev: Dedup implementation + normalization (Days 6–10)
- findasale-ops: Email infrastructure setup (Days 6–10)

### Week 3–4 Parallel
- findasale-architect: Queue state machine design (Days 13–17)
- findasale-dev: Worker redundancy + job timeout (Days 13–17)
- findasale-ops: Email verification + warm-up (Days 20–24)

---

## RISK ACCEPTANCE TABLE

**If timeline is compressed, what can be deferred?**

| Mitigation | Phase | Deferrable? | Risk Level if Deferred | Alternative |
|-----------|-------|-----------|----------------------|-------------|
| M1.3 (Input Validation) | 1 | NO | APP CRASH | None; blocking |
| M1.4 (Dedup) | 1 | NO | DIRECTORY BLOAT | Must launch with exact-match minimum |
| M2.2 (Key Security) | 1 | NO | QUOTA BURN | None; blocking |
| M4.1 (CAN-SPAM) | 1 | MAYBE | $43k/violation | Defer email sends; launch in organizer-sent mode |
| M2.5 (Worker Redundancy) | 2 | MAYBE | DATA STALE | Deploy 1 worker; manual restart if fails |
| M3.3 (Race Condition Prevention) | 2 | NO | DATA CORRUPTION | Blocking; must have |
| M4.4 (Email Delivery) | 2 | MAYBE | HIGH BOUNCE RATE | Test domain reputation; verify manually |
| M4.5 (Claim Verification) | 2 | MAYBE | LISTING HIJACKING | 2-address verification minimum; defer SMS fallback |

---

## SUCCESS METRICS (End of Phase 2)

**By end of Week 6 post-MVP, all Phase 2 work should be complete. Verify:**

| Metric | Target | Owner | Check |
|--------|--------|-------|-------|
| Input validation tests | 100% pass | findasale-dev | [ ] |
| Dedup collision rate | <2% | findasale-dev | [ ] |
| API key in .env only | YES | findasale-ops | [ ] |
| Email bounce rate | <5% | findasale-ops | [ ] |
| Email complaint rate | <0.1% | findasale-ops | [ ] |
| Queue age (oldest job) | <24 hours | findasale-ops | [ ] |
| Worker uptime | >99% | findasale-ops | [ ] |
| VERIFIED directory % | >80% | findasale-dev | [ ] |
| Unsubscribe honored | YES (within 10d) | findasale-dev | [ ] |
| Deletion workflow tested | YES | findasale-dev | [ ] |

---

## HANDOFF TO FINDASALE-DEV

**When ready to dispatch to findasale-dev subagent, provide this structure:**

```
DISPATCH: Crawl System Security Implementation (Phase 1 or 2)

FEATURES:
1. M1.3: Input Validation Schema
   - Files: packages/database/prisma/schema.prisma, packages/backend/src/validators/
   - Acceptance: All API responses validated before DB insert; 100% test coverage
   
2. M1.4: Deduplication Engine
   - Files: packages/backend/src/services/dedup.ts
   - Acceptance: Exact, fuzzy, coordinate-based; dedup report; <2% collision rate
   
3. M2.2: API Key Monitoring
   - Files: packages/backend/src/config/monitoring.ts, .env.example
   - Acceptance: Usage spike alert configured; key in .env only
   
[... etc for each mitigation ...]

BLOCKING DEPENDENCIES:
- Legal sign-off on email compliance (M4.1a, M4.2a, M5.1a)
- Schema decision on VERIFIED vs. UNVERIFIED (from findasale-architect)

VERIFICATION:
- TypeScript: zero errors (tsc --noEmit)
- Tests: 100% pass (npm test)
- Monitoring: dashboard shows metrics in real-time
```

---

**This roadmap is your truth. Update as work progresses. Any blockers? Escalate to Patrick immediately.**
