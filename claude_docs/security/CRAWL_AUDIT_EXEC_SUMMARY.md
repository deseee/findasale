# Crawl System Security Audit — Executive Summary

**Date:** 2026-05-02  
**Status:** Pre-MVP threat model complete  
**Highest Risk:** Legal liability (CAN-SPAM, GDPR, CCPA) + data poisoning  
**Action:** Legal review required before email sends; input validation non-negotiable

---

## THE NUMBERS

- **18 P0/P1 risks** (data integrity, legal, API survival)
- **24 P2 risks** (operational resilience)
- **Highest exposure:** $20M+ GDPR fines + FTC violations
- **Estimated mitigation cost:** 40–50 days engineering + 5–10 days legal
- **Highest impact risk:** Fake business directory (reputational) + legal liability (financial)

---

## CRITICAL PATH: MUST HAPPEN BEFORE MVP

### 1. Legal Compliance (Week 1–2) — BLOCKING
**Owner:** findasale-legal + Patrick

- **Risk 4.1 — CAN-SPAM:** Email system must comply or face FTC fines
  - Action: Legal review of email template + scraping source
  - Timeline: 2–3 days legal review
  - Blocker: If email doesn't include unsubscribe + compliance text, can't launch

- **Risk 4.2 — GDPR:** Can't email EU citizens without consent
  - Action: Geo-block EU addresses + DPA with email provider
  - Timeline: 1 day implementation after legal decision
  - Blocker: Sending to EU without consent = €20M exposure

- **Risk 5.1 — Google ToS:** Can't scrape data that competes with Google
  - Action: Legal opinion on whether directory is "competing use"
  - Timeline: 3–5 days
  - Blocker: If Google determines you're competing, feature is dead

### 2. Data Validation (Week 1) — BLOCKING
**Owner:** findasale-dev, findasale-architect

- **Risk 1.3 — Malformed Data (XSS, SQL Injection):** API data is untrusted input
  - Action: Implement validation schema (Zod); parameterized queries (already Prisma)
  - Timeline: 2–3 days
  - Blocker: If not validated, single bad API record = app crash or XSS

- **Risk 1.4 — Deduplication:** Without good dedup, directory has 10x duplicates
  - Action: Multi-tier dedup (exact → fuzzy → coordinate-based)
  - Timeline: 3–4 days
  - Blocker: Bad dedup = unusable directory

### 3. API Key Security (Week 1) — BLOCKING
**Owner:** findasale-ops, findasale-dev

- **Risk 2.2 — Key Leak:** API key in GitHub = $5k quota burned in hours
  - Action: Key in .env (not hardcoded), monitoring for usage spikes
  - Timeline: 0.5–1 day (should already be done)
  - Blocker: If key leaked, immediate monthly budget exhausted

### 4. Cost Transparency (Week 1) — BLOCKING
**Owner:** findasale-architect, findasale-ops

- **Risk 2.1 — Google Pricing Change:** Free tier could disappear; budget needs forecasting
  - Action: Document current pricing + cost calculator for scaling
  - Timeline: 1 day
  - Blocker: Understanding cost impact prevents surprises at scale

---

## HIGH-PRIORITY: MUST HAPPEN BEFORE SCALING

### Queue System Resilience (Weeks 2–3)
- **Risk 2.5:** Single worker = stalled crawl
  - Action: Deploy 2+ workers, heartbeat monitoring, auto-restart
  - Timeline: 2–3 days
  - Impact: Prevents data staling; enables scaling

- **Risk 3.1:** High-volume metros cause worker to run for hours
  - Action: Job timeout (5min), pagination limit (1k results max)
  - Timeline: 1.5 days
  - Impact: Prevents worker starvation

- **Risk 3.3:** Two workers processing same job = duplicate writes
  - Action: Atomic job pickup with database lock
  - Timeline: 1 day
  - Impact: Prevents data corruption

### Email Safety (Weeks 2–3)
- **Risk 4.4:** Domain reputation destroyed by honeypots
  - Action: Email verification service (ZeroBounce) + warm-up strategy
  - Timeline: 1.5 days (plus cost: ~$0.01 per email)
  - Impact: Ensures emails actually deliver

- **Risk 4.5:** Wrong person claims business (hijacking)
  - Action: Multi-address verification workflow
  - Timeline: 2 days
  - Impact: Prevents business hijacking

### Data Integrity (Weeks 2–3)
- **Risk 1.1:** Fake businesses poisoning directory
  - Action: UNVERIFIED status by default; multi-source confirmation required
  - Timeline: 2 days
  - Impact: Directory quality maintained

- **Risk 1.2:** Competitor marks businesses CLOSED maliciously
  - Action: 30-day observation window + 2 signals required before CLOSED
  - Timeline: 1.5 days
  - Impact: Prevents false closures

---

## MEDIUM-PRIORITY: NICE-TO-HAVE EARLY, REQUIRED BEFORE 10K+ BUSINESSES

- **Risk 1.5:** Bulk corruption from API outage
  - Action: Crawl idempotency + snapshot/rollback
  - Timeline: 2–3 days
  - Impact: Disaster recovery

- **Risk 3.2:** Queue table bloat (unbounded growth)
  - Action: Cleanup policy + indexing
  - Timeline: 1–2 days
  - Impact: Query performance maintained at scale

- **Risk 2.3:** Overpass IP blocked
  - Action: Rate limiting (20 queries/day), graceful degradation
  - Timeline: 1 day
  - Impact: OSM source stays available

---

## LOW-PRIORITY: CAN DEFER POST-LAUNCH

- Risk 2.4 (HERE/Foursquare deprecation monitoring) — quarterly review
- Risk 4.3 (CCPA deletion workflow) — implement after MVP, test with real requests
- Risk 5.3 (Business owner complaint process) — implement once complaints arrive
- Risk 4.1e (Organizer-sent email) — future enhancement for better legal position

---

## DECISION TABLE FOR PATRICK

| Decision | Option A | Option B | Option C | Recommendation |
|----------|----------|----------|----------|-----------------|
| **Email strategy** | No claim emails (safe, but low adoption) | Organizer-sent emails (best legal position, higher friction) | FindA.Sale-sent emails (best UX, requires full legal compliance) | Start with B (organizer-sent) → graduate to C (FindA.Sale-sent) after legal review |
| **Email source** | Only generic addresses (info@, contact@) | Scrape public website footers (higher coverage, CCPA risk) | Use APIs only (safest) | Use APIs first; add scraping after CCPA/GDPR review |
| **Data sources** | Google + HERE only (safe, limited coverage) | Google + HERE + Foursquare + OSM (best coverage, more complexity) | Add web scraping (legal risk, high value) | Option B; skip web scraping |
| **Directory scope** | "Verification helper" (narrow: only suggest unverified businesses) | "Public directory" (broad: show all 50k businesses to anyone) | Hybrid: suggest to organizers, directory to members-only | Start with A; graduate to B after data quality verified |
| **Fake business handling** | Remove immediately (aggressive, fast) | Quarantine + notify owner (conservative, fair) | Auto-flag UNVERIFIED + let community vote (community-driven) | Start with B; add community voting in V2 |

---

## DEPLOYMENT CHECKLIST (Before Sending First Claim Email)

- [ ] findasale-legal: CAN-SPAM email template approved
- [ ] findasale-legal: GDPR geo-blocking policy approved
- [ ] findasale-legal: CCPA right-to-deletion workflow reviewed
- [ ] findasale-legal: Google ToS opinion (is directory "competing use"?) signed
- [ ] findasale-dev: Input validation schema (Zod) implemented + tested
- [ ] findasale-dev: Dedup logic (multi-tier) implemented + tested on sample data
- [ ] findasale-dev: Unsubscribe mechanism functional + tested (can suppress email)
- [ ] findasale-dev: Claim verification workflow (multi-address) functional
- [ ] findasale-ops: API key in .env only (no hardcoding); key rotation documented
- [ ] findasale-ops: Usage monitoring alert (>2x daily spike) configured
- [ ] findasale-ops: Email domain SPF/DKIM/DMARC records configured
- [ ] findasale-ops: Email verification service (ZeroBounce) integrated + tested
- [ ] findasale-architect: Cost calculator for Google Places built + documented
- [ ] Patrick: Email strategy decision made (no emails vs. organizer-sent vs. FindA.Sale-sent)

---

## IF YOU MUST LAUNCH BEFORE LEGAL REVIEW

**Option: Start with organizer-sent emails (lower risk)**

Instead of:
```
TO: [business_owner@email.com]
FROM: FindA.Sale <noreply@finda.sale>
SUBJECT: Claim Your Listing on FindA.Sale
```

Do:
```
Organizer opens FindA.Sale dashboard
Clicks: "Invite [Business] to claim their listing"
FindA.Sale generates email template (organizer copies/pastes)
Organizer sends from their own email (not FindA.Sale)
↓
Business clicks "Claim" link → goes to FindA.Sale app
```

**Why it's safer:**
- Organizer is the sender (legal responsibility = on organizer, not you)
- No CAN-SPAM violation (organizer-to-business relationship likely exists)
- Easier to defend: "We facilitated, didn't send unsolicited email"
- Still achieves goal: business claims listing

**Timeline:** 1 day to build; allows MVP launch before legal review complete.

---

## HIGHEST-IMPACT TECHNICAL FIX

**Multi-tier deduplication (Risk 1.4)**

If you only implement ONE thing from this audit: make dedup bulletproof.

Bad dedup = 50k records become 500k (10x bloat). Directory becomes unusable.

**Implementation:** (already outlined in main audit, section 1.4)
- Exact match: normalized name + address + phone
- Fuzzy match: Levenshtein edit distance + geohash distance
- Log every dedup decision (for debugging)
- Collision detection report (weekly)
- Manual review UI for ambiguous cases

---

## TRACKING SUCCESS

Monitor these metrics weekly:

1. **Data Quality:**
   - % of directory with VERIFIED status (target: >80%)
   - Duplicate rate (target: <2%)
   - UNVERIFIED age (target: <30 days)

2. **Email Safety:**
   - Bounce rate (target: <5%)
   - Complaint rate (target: <0.1%)
   - Unsubscribe rate (target: <1%)

3. **Crawl Health:**
   - Queue age (target: oldest job <24 hrs old)
   - Worker uptime (target: 99.5%+)
   - Job timeout rate (target: <1%)

4. **Legal/Compliance:**
   - CAN-SPAM violations (target: 0)
   - GDPR deletion requests processed (target: <30 days SLA)
   - CCPA opt-outs honored (target: <30 days SLA)

---

**Next Steps:**
1. Send this audit to findasale-legal + Patrick
2. Legal completes Risk 4.1, 4.2, 5.1 reviews (decision needed on email strategy)
3. findasale-dev implements Risk 1.3, 1.4, 2.2 (blocking for MVP)
4. findasale-ops implements Risk 2.1 (cost forecasting) + 2.2 (key security)
5. Schedule follow-up audit: post-launch (week 4) to verify mitigations are working
