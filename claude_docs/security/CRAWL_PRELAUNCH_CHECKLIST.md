# Crawl System — Pre-Launch Checklist

**Use this checklist 48 hours before sending the first claim email.**

---

## LEGAL & COMPLIANCE ⚖️

### Email Compliance
- [ ] **CAN-SPAM Review Completed**
  - [ ] Email subject line includes "[ADVERTISEMENT]" or identifies as commercial
  - [ ] From address is legitimate (@finda.sale, not spoofed)
  - [ ] Email body includes physical mailing address or legal entity
  - [ ] Unsubscribe link is one-click (no login required)
  - [ ] Unsubscribe is honored within 10 days (SLA set in code)
  - [ ] Reply-to address is monitored (not blackhole)
  - findasale-legal signed off: [ ]

- [ ] **GDPR Compliance Review**
  - [ ] EU addresses are geo-blocked (country_code check before send)
  - [ ] DPA is signed with email service provider (if using SendGrid, Mailgun, etc.)
  - [ ] Privacy policy mentions email data collection + deletion rights
  - [ ] "Unsubscribe" link also suppresses from future marketing
  - [ ] Deletion request workflow is implemented (45-day SLA)
  - findasale-legal signed off: [ ]

- [ ] **CCPA Compliance Review**
  - [ ] "Do Not Sell" opt-out mechanism available (link in email)
  - [ ] Deletion request form on website (public-facing)
  - [ ] Sole proprietor detection: do not email personal addresses (firstname.lastname@)
  - [ ] Deletion honored within 45 days (SLA + audit log in place)
  - findasale-legal signed off: [ ]

### API & Data
- [ ] **Google ToS Compliance**
  - [ ] Legal opinion: "Is FindA.Sale directory use compliant with Places API ToS?"
  - [ ] If yes: document basis (not competing, user-facing, etc.)
  - [ ] If no: adjust feature scope or pay for commercial license
  - [ ] Data attribution: UI mentions "powered by Google Places, HERE, ..." (if required)
  - findasale-legal signed off: [ ]

- [ ] **Scraping / Web Access Policy**
  - [ ] No scraping of Yelp, TripAdvisor, Nextdoor, or competitor websites
  - [ ] Only using official APIs: Google Places, HERE, Foursquare, OSM Overpass
  - [ ] ToS reviewed for each API (document in operations/api-contracts.md)

### Business Owner Rights
- [ ] **Claim Verification Workflow**
  - [ ] Claim email goes to multiple addresses (primary + alternate)
  - [ ] Verification requires response from ≥2 addresses (prevents hijacking)
  - [ ] Challenge mechanism: legitimate owner can dispute incorrect claim within 30 days
  - [ ] Challenge process documented (send to support with proof)

- [ ] **Correction & Defamation Defense**
  - [ ] Business owner can claim + edit own listing (self-service)
  - [ ] Edits visible within 1 hour (fast feedback)
  - [ ] Disclaimer in app: "FindA.Sale aggregates public data; data may be inaccurate"
  - [ ] Legal safe harbor: proper attribution + correction mechanism in place

---

## DATA INTEGRITY & VALIDATION ✅

### Input Validation
- [ ] **Malformed Data Handling**
  - [ ] Validation schema (Zod) applied to all API responses
  - [ ] Test cases: empty names, 0,0 coordinates, SQL injection strings, XSS payloads
  - [ ] All tests pass: API data is cleaned before DB insert
  - [ ] Parameterized queries confirmed (Prisma used throughout; no raw SQL)
  - [ ] No `dangerouslySetInnerHTML` anywhere in frontend
  - [ ] HTML entity escaping on all business fields (React default, auto-escaped)

- [ ] **Field Length & Type Limits**
  - [ ] `name: VARCHAR(100)` (database schema enforced)
  - [ ] `phone: VARCHAR(20)` (database schema enforced)
  - [ ] `address: VARCHAR(500)` (database schema enforced)
  - [ ] Crawler validates before insert (fail-fast, don't rely on DB only)
  - [ ] Coordinates: lat [-90, 90], lng [-180, 180], exclude 0,0 (unless explicit Null Island)

### Deduplication
- [ ] **Multi-Tier Dedup Implemented**
  - [ ] Exact match: normalized name + address + phone hash
  - [ ] Fuzzy match: Levenshtein ≤2 edit distance on name
  - [ ] Coordinate-based: haversine distance ≤20m
  - [ ] Dedup log: `{ incoming_id, matched_id, confidence, reason }` captured
  - [ ] Test case: same business from Google + HERE returns 1 record (not 2)

- [ ] **Collision Detection**
  - [ ] Weekly dedup report generated (shows fuzzy + coordinate matches)
  - [ ] Fuzzy/coordinate matches flagged for manual review
  - [ ] Merge workflow: `is_duplicate_of` flag + history preserved
  - [ ] No data loss on merge (secondary record kept in archive)

- [ ] **Normalization Functions**
  - [ ] `normalizeName()`: lowercase, whitespace collapse, punctuation removal, suffix normalization
  - [ ] `normalizePhone()`: extract digits, country-specific handling (US = last 10 digits)
  - [ ] `normalizeAddress()`: same as name normalization
  - [ ] Test cases: "Joe's Antiques", "JOE'S ANTIQUES", "joes antiques" all deduplicate

### Data Quality
- [ ] **VERIFIED vs. UNVERIFIED Status**
  - [ ] Default status: UNVERIFIED
  - [ ] VERIFIED only if:
    - [ ] ≥2 sources agree on name + address + phone, OR
    - [ ] Business claims + verifies ownership, OR
    - [ ] Google Places + HERE both confirm (multi-source agreement)
  - [ ] UI clearly shows verification status (badge or label)
  - [ ] UNVERIFIED businesses searchable but marked (don't hide them)

- [ ] **Fraud Detection**
  - [ ] Blocklist: phone numbers (spam trap list), obvious spam names ("FREE MONEY", "WORK FROM HOME")
  - [ ] Coordinate validation: exclude Null Island (0,0) except when intentional
  - [ ] Rate limiting: max 100 new businesses per day per metro (prevents bulk injection)
  - [ ] Source anomaly: if >50% of new entries UNVERIFIED, throttle source

---

## API SECURITY & INFRASTRUCTURE 🔐

### API Key Management
- [ ] **Key Storage & Rotation**
  - [ ] API keys NOT in code (.env only)
  - [ ] `.env.example` shows variable names, not actual keys
  - [ ] Production: keys in Railway Secrets (not `.env` on server)
  - [ ] Key rotation scheduled (quarterly)
  - [ ] Current Google Places key not exposed in git history (git filter-branch if needed)

- [ ] **Monitoring & Alerts**
  - [ ] Daily usage spike alert: if >2x 7-day average, notify ops
  - [ ] Hourly spike alert: if >1,000 calls in 1 hour, investigate
  - [ ] Error rate alert: if >50% 4xx responses, investigate
  - [ ] Dashboard: "API Usage by Hour" + "Error Rate Trend"
  - [ ] All alerts sent to Slack / email (findasale-ops monitored)

- [ ] **Incident Response**
  - [ ] Key compromise SOP: revoke key immediately, generate new, redeploy (<5 min)
  - [ ] Post-compromise: audit logs to determine damage scope
  - [ ] Billing cap: max $200/month on Google Places (prevents runaway cost)
  - [ ] If capped: graceful degradation (serve cached results, alert ops)

### Queue System Resilience
- [ ] **Worker Redundancy**
  - [ ] ≥2 crawler workers deployed (different Railway dynos / containers)
  - [ ] Heartbeat mechanism: workers log `{ worker_id, timestamp, queue_depth }` every 30s
  - [ ] Heartbeat failure detection: if >5min stale, mark worker DEAD
  - [ ] Dead worker recovery: orchestrator reassigns jobs to healthy worker

- [ ] **Job State Machine & Timeout**
  - [ ] Job states: pending | processing | completed | failed | abandoned
  - [ ] Job timeout: 5 minutes (kills hanging jobs, reverts to PENDING)
  - [ ] Retry logic: max 3 retries; after 3: mark ABANDONED
  - [ ] ABANDONED job alert: ops notified for manual intervention

- [ ] **Queue Monitoring**
  - [ ] Dashboard: queue depth (target: <50)
  - [ ] Alert: queue_depth > 50 (backlog building)
  - [ ] Alert: queue_depth > 200 (severe)
  - [ ] Alert: any job >1 hour old (stuck job detected)
  - [ ] Weekly report: completion rate, age of oldest job, retry rate

- [ ] **Job Pickup Atomicity**
  - [ ] `SELECT FOR UPDATE` lock used (prevents duplicate pickup)
  - [ ] Pick + mark PROCESSING in single transaction
  - [ ] Test case: 2 workers simultaneously picking jobs → only 1 succeeds

- [ ] **Pagination & Timeout**
  - [ ] Max results per crawl job: 1,000
  - [ ] Max pages: 10 (avoids LA-scale blowup)
  - [ ] Job timeout: 5 minutes (revert to PENDING if exceeded)
  - [ ] Partial completion: save partial results, queue next batch
  - [ ] Test case: Google Places LA crawl (10k+ results) times out at 5min, queues remaining

- [ ] **Crawl Idempotency**
  - [ ] Each crawl run has unique `crawl_id: UUID`
  - [ ] Crawl status: pending | completed | failed | rolled_back
  - [ ] Can rollback: `UPDATE business SET status = snapshot.status WHERE crawl_id_applied = X`
  - [ ] Snapshot before major crawl (weekly full sync): save old statuses
  - [ ] Rollback SLA: <30min from detection

- [ ] **Queue Cleanup & Scaling**
  - [ ] Completed jobs >7 days old archived to `crawl_queue_archive`
  - [ ] Main table indexes: (status), (source), (metro), (next_retry)
  - [ ] Query planner uses indexes (verify with EXPLAIN)
  - [ ] Alert: queue_depth > 20k (approaching saturation)

---

## EMAIL SYSTEM 📧

### Email List Hygiene
- [ ] **Email Verification**
  - [ ] Integration with ZeroBounce (or similar) verified
  - [ ] Test: verify 100 sample emails (should catch invalid addresses)
  - [ ] Only send to verified addresses
  - [ ] Cost budgeted: ~$0.01 per email verification

- [ ] **Domain Authentication**
  - [ ] SPF record configured: `v=spf1 include:sendgrid.net ~all` (or provider)
  - [ ] DKIM enabled: domain key signing
  - [ ] DMARC policy set: `p=quarantine` (at minimum)
  - [ ] Test: SPF check passes, DKIM signature valid
  - [ ] (Use online tools: mxtoolbox.com, dmarcian.com)

- [ ] **Email Warm-Up**
  - [ ] Don't send 1,000 emails on day 1
  - [ ] Ramp-up schedule: day 1–7 = 10/day, week 2 = 50/day, week 3+ = 200+/day
  - [ ] Prevents ISP reputation damage (bot-like burst detection)
  - [ ] Monitor bounce + complaint rate during ramp

- [ ] **Bounce & Complaint Monitoring**
  - [ ] Hard bounce (invalid address) → remove from list permanently
  - [ ] Soft bounce (mailbox full) → retry ≤3x, then pause
  - [ ] Complaint (marked spam) → add to suppression list immediately
  - [ ] Alert: complaint rate >0.5% (pause sends, investigate)
  - [ ] Dashboard: bounce rate, complaint rate, suppression list size

### Email Content & Deliverability
- [ ] **Template Compliance**
  - [ ] Subject: "Claim Your FindA.Sale Listing – [Business Name]" (no misleading)
  - [ ] From: noreply@finda.sale (consistent, branded)
  - [ ] Unsubscribe link: one-click, no login
  - [ ] Physical address: included in footer
  - [ ] Link tracking: disabled (or flagged for compliance review)

- [ ] **Email Suppression List**
  - [ ] Unsubscribe honored within 10 days
  - [ ] Suppression list persistent (checked before every send)
  - [ ] Query: `WHERE business_email_suppressed = false` before sending
  - [ ] Test: unsubscribe link works, email suppressed on next crawl

- [ ] **Alternative Delivery Channel**
  - [ ] If email fails: offer SMS fallback (phone from directory)
  - [ ] Or: account login (if organizer already signed up)
  - [ ] Reduces single-point-of-failure (email only)

- [ ] **Domain Reputation**
  - [ ] Use subdomain if possible: claims@finda.sale (not main @finda.sale)
  - [ ] Isolates risk: if subdomain blacklisted, main domain unaffected
  - [ ] Allows recovery without disrupting organizer email

---

## COST & OPERATIONS 💰

### Cost Forecasting
- [ ] **API Cost Tracking**
  - [ ] Current plan: Google Places free tier (5k calls/month included)
  - [ ] Current usage: estimated based on crawl plan
  - [ ] Scaling impact calculated: cost at 10 metros, 50 metros, 100 metros
  - [ ] Spreadsheet: metros vs. monthly cost (prepared for Patrick decision)
  - [ ] Cost cap: max $200/month initially (discussed with Patrick)

- [ ] **Fallback Planning**
  - [ ] If Google pricing changes: migration plan to HERE (documented)
  - [ ] Coverage overlap tested: Google + HERE on 100 sample queries → ≥90% match
  - [ ] Cost comparison: HERE pricing at scale

### Operations & Runbooks
- [ ] **Monitoring Dashboard**
  - [ ] Queue depth (real-time)
  - [ ] API usage (hourly)
  - [ ] Email stats (daily: sent, bounced, complained)
  - [ ] Worker health (heartbeat status)
  - [ ] Data quality (% VERIFIED, duplicate rate)

- [ ] **Alert Thresholds**
  - [ ] Queue depth: warn >50, critical >200
  - [ ] API usage: warn >2x daily average, critical >1k/hour
  - [ ] Email complaint: warn >0.5%, critical >1%
  - [ ] Worker heartbeat: alert >5min stale
  - [ ] All alerts to Slack channel: #crawl-alerts

- [ ] **Incident Response Runbook**
  - [ ] API key leaked: immediate revoke, new key, redeploy (5 min)
  - [ ] Queue stalled: check worker health, restart if dead, check job timeout
  - [ ] High bounce rate: pause sends, check email list quality
  - [ ] Duplicate businesses: run dedup report, merge conflicts
  - [ ] Runbook stored in: claude_docs/operations/crawl-runbook.md

- [ ] **On-Call Rotation**
  - [ ] Define who monitors (findasale-ops)
  - [ ] Escalation path: ops → findasale-dev → findasale-architect
  - [ ] Response SLA: <30min for P0, <2hr for P1

---

## FINAL SIGN-OFF

**All sections must be COMPLETE before launch. If any box is unchecked, escalate to Patrick.**

| Section | Owner | Status | Sign-Off |
|---------|-------|--------|----------|
| Legal & Compliance | findasale-legal | [ ] READY | Initials: _____ |
| Data Integrity | findasale-dev, architect | [ ] READY | Initials: _____ |
| API Security | findasale-ops, dev | [ ] READY | Initials: _____ |
| Email System | findasale-ops, dev | [ ] READY | Initials: _____ |
| Cost & Operations | findasale-architect, ops | [ ] READY | Initials: _____ |
| **Overall Go/No-Go** | Patrick | [ ] GO | Signature: _____ |

**Launch Date:** _______________  
**First Email Send:** _______________  
**Monitoring Started:** _______________

---

**If you need help with any section, escalate immediately. Do not proceed past 80% checklist completion.**
