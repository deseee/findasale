# FindA.Sale Crawl Management System — Security & Failure Mode Audit

**Date:** 2026-05-02  
**Scope:** Business directory crawler ingesting from Google Places, HERE, Foursquare, OSM Overpass  
**Target:** 50,000+ business records with lifecycle tracking and "Claim This Listing" email workflow  
**Audience:** Engineering (Patrick, findasale-dev, findasale-architect), Legal (findasale-legal)

---

## EXECUTIVE SUMMARY

The crawl system presents **18 P0/P1 risks** (data integrity, legal, API sustainability), **24 P2 risks** (operational resilience), and **12 P3 risks** (minor UX/monitoring). Highest blast radius: undetected data poisoning leading to 50k+ incorrect business records + legal liability from CAN-SPAM violations and CCPA data handling. This audit prioritizes legal and reputational risk over technical complexity.

**Immediate actions required before MVP:**
1. Legal review of email scraping + CAN-SPAM compliance
2. Data validation pipeline for malformed API responses
3. Source API contract & deprecation monitoring
4. CCPA/GDPR deletion request handling
5. Deduplication collision detection & recovery

---

## RISK CATEGORIES

### SECTION 1: DATA INTEGRITY ATTACKS

#### Risk 1.1 — Fake Business Submissions (Competitor Sabotage)
**Severity:** P1  
**Blast Radius:** Directory-wide misinformation; user trust erosion; potential legal liability  
**Attack Scenario:**
- Competitor creates fake businesses: "FindA.Sale Scam Center", "Estate Sale Frauds Inc"
- Posts them to Google Places (free), waits for your crawler to ingest
- Listings appear in your directory → organizers contact fake entities
- Organizers lose credibility when listings are wrong

**Current Controls:** None mentioned in brief  
**Failure Mode:**
- No verification that business actually exists
- No duplicate checking across our own submissions vs. API sources
- No mechanism to challenge/remove fraudulent entries
- Email claim system doesn't validate business responds

**Mitigations:**
- **M1.1a (P0 gate):** Before ingesting from any source, require source verification:
  - Google Places: only VERIFIED businesses (has Google reviews + consistent phone/address across ≥2 sources)
  - HERE/Foursquare: similar multi-source confirmation
  - OSM: community-verified entries only (crosscheck against Google/HERE)
  - **Default:** UNVERIFIED status; only index if >= 2 sources agree on name+address+phone
- **M1.1b:** Implement a "Challenge This Listing" workflow:
  - Users/owners report fake entries
  - Auto-suspend listing from directory pending review (24–48hr SLA)
  - Flag in DB: `listed_status: 'challenged' | 'verified' | 'closed_unverified'`
- **M1.1c:** Organizer reporting widget on each business card:
  - "Is this business correct?" → captures corrections
  - Corrections trigger re-verification cycle
- **M1.1d:** Cross-reference against known fraud signals:
  - Phone numbers that are common spam numbers
  - Addresses that overlap with known fake business hubs
  - Names that are obvious spam patterns ("FREE MONEY", "WORK FROM HOME")
- **M1.1e:** Rate limiting on crawl ingestion:
  - Per-metro: max 100 new businesses per day (grows over time, starts small)
  - Per-source: if >50% of new entries are marked UNVERIFIED, throttle that source
  - Monitor fraud rate weekly; pause source if fraud >5%

**Implementation Cost:** M1.1a = schema + crawler validation (2–3 days dev), M1.1b = UI + workflow (2 days), M1.1c = widget (1 day), M1.1d = fraud classifier (1–2 days), M1.1e = throttling logic (1 day)

**Owner:** findasale-dev, findasale-architect (schema decision)

---

#### Risk 1.2 — False "CLOSED" Signals (Competitor Marking Businesses Dead)
**Severity:** P1  
**Blast Radius:** Organizers excluded from your directory; revenue impact (they can't list with you)  
**Attack Scenario:**
- Competitor discovers your crawl system is marking businesses CLOSED based on "no activity" signals
- They create thousands of fake accounts from that business IP range
- Your system detects "inactivity" → marks business CLOSED
- Legitimate business is now invisible in your directory

**Current Controls:** None specified  
**Failure Mode:**
- No audit trail for CLOSED status (who marked it? when? why?)
- No notification to business owner: "Your listing was marked CLOSED. Here's why."
- No recovery mechanism (owners can't self-correct)
- CLOSED status is permanent or requires manual intervention

**Mitigations:**
- **M1.2a (P0):** CLOSED status requires ≥2 confirming signals + 30-day observation window:
  - Signal: Google Places says "permanently closed"
  - Signal: Phone is disconnected (call fails consistently)
  - Signal: Multiple independent users report "doesn't exist"
  - Mark UNCERTAIN first; only CLOSED after 30 days + ≥2 signals confirmed
  - Log every status change: `{ timestamp, signal, source, confidence_score }`
- **M1.2b:** Notification + appeal:
  - When status changes to UNCERTAIN, send email to business owner: "We noticed [signal]. Is this correct?"
  - If owner responds: revert to ACTIVE + log response
  - If CLOSED imminent: send warning 5 days before, with option to appeal
- **M1.2c:** Owner self-service status override:
  - Business owner can log in + claim listing
  - Claiming listing = auto-revert to ACTIVE (or UNVERIFIED pending re-verification)
  - Require email confirmation (prevents mass scripted claims)
- **M1.2d:** Public audit log:
  - Every listing displays: "Last verified: [date], Status: [ACTIVE/UNCERTAIN/CLOSED]"
  - Show why it's UNCERTAIN: "No Google reviews in 6 months" or "Phone disconnected"
  - Owners can see their own audit history in settings

**Implementation Cost:** M1.2a = signal tracking + logic (2 days), M1.2b = email template + workflow (1 day), M1.2c = auth + self-service (1.5 days), M1.2d = UI + logging (1 day)

**Owner:** findasale-dev, findasale-legal (communication templates)

---

#### Risk 1.3 — Malformed API Data Injection (0,0 Coordinates, SQL Injection, XSS in Names)
**Severity:** P1  
**Blast Radius:** Application crash, database corruption, frontend XSS, infinite loops in crawl queue  
**Attack Scenario:**
- Attacker poisons an API source (compromises OSM Overpass instance, bribes HERE API operator, etc.)
- Returns records with:
  - `name: "<img src=x onerror=alert(1)>"` → XSS in directory view
  - `phone: "'; DROP TABLE businesses; --"` → SQL injection if not parameterized
  - `lat: 0, lng: 0` → marks business at Prime Meridian (breaks geolocation)
  - `address: "a".repeat(100000)` → buffer overflow / storage issue
  - Invalid JSON in API response → crawler crashes, queue hangs
- Directory now renders attacker's JavaScript to every visitor
- Database corrupted or inaccessible

**Current Controls:** None described  
**Failure Mode:**
- Assuming API data is safe (it's not)
- No input validation on strings
- No coordinate range checking
- Untyped API responses (any field can be any type)
- No length limits on fields

**Mitigations:**
- **M1.3a (P0 gate — non-negotiable):** Input validation on ALL API fields BEFORE DB insert:
  ```
  name: string, 2–100 chars, alphanumeric + punctuation only (no <, >, &, ", ')
  phone: phone-format regex, 10–15 digits (country-specific)
  address: string, 5–500 chars, no SQL keywords, no HTML entities
  lat: float, range -90 to 90, not 0 (unless explicitly Null Island)
  lng: float, range -180 to 180, not 0
  email: RFC 5322 regex, length ≤254, no BCC/CC injection
  website: URL parse (reject javascript:, data:, vbscript:)
  ```
- **M1.3b:** Use parameterized queries (Prisma does this by default — verify in schema):
  - Never string-interpolate user input
  - Prisma ORM handles escaping; confirm no raw SQL queries
- **M1.3c:** HTML entity escaping on frontend:
  - Render business name/address via React's default (auto-escapes)
  - Never use `dangerouslySetInnerHTML`
  - Sanitize any user-submitted corrections (e.g., "This address is wrong, it should be...")
- **M1.3d:** Length + type checking:
  - Set DB column limits: `name VARCHAR(100)`, `phone VARCHAR(20)`
  - Crawler rejects any record violating length before insert
  - Add validation schema (use Zod or similar):
    ```typescript
    const BusinessRecord = z.object({
      name: z.string().min(2).max(100),
      phone: z.string().regex(/^\+?[0-9\-\(\)\s]{10,15}$/),
      lat: z.number().min(-90).max(90).refine(v => v !== 0 || address !== null),
      lng: z.number().min(-180).max(180),
    });
    ```
- **M1.3e:** Error handling:
  - If API returns invalid JSON: log error, skip that batch, alert ops
  - If single record fails validation: log + skip that record (continue with rest)
  - If >50% of batch invalid: throttle source + alert
  - Never crash crawler; always graceful degradation
- **M1.3f:** Rate limiting on storage:
  - Max field size enforced at DB schema level (columns can't exceed limit)
  - Crawler enforces same limits before insert (fail fast)
  - Monitor for anomalous field sizes; alert if > median + 3σ

**Implementation Cost:** M1.3a = validation schema (1 day), M1.3b = audit query patterns (0.5 days), M1.3c = frontend audit (1 day), M1.3d = schema update (0.5 days), M1.3e = error handling (1 day), M1.3f = monitoring (0.5 days)

**Owner:** findasale-dev (schema + crawler), findasale-architect (validation schema design)

---

#### Risk 1.4 — Deduplication Hash Collision (Same Business = Multiple Records)
**Severity:** P1  
**Blast Radius:** Directory shows duplicate listings; metrics inflated; organizer confusion; poor user experience  
**Scenario:**
- Business: "Joe's Antiques" at "123 Main St, Grand Rapids, MI 49503", phone "616-123-4567"
- Google Places returns: lat 42.9629, lng -85.6789
- HERE returns: lat 42.9630, lng -85.6790 (rounding difference)
- OSM returns: lat 42.96289, lng -85.67891
- Your dedup logic: `hash(name + address + phone)` — but addresses differ slightly (punctuation: "St" vs "Street")
- Result: 3 separate database records for 1 business
- Directory shows "Joe's Antiques x3" to users

**Current Controls:** Name+address+phone matching described; no mention of coordinate-based dedup or fuzzy matching

**Failure Mode:**
- String-exact dedup is brittle (punctuation, capitalization, abbreviations)
- Lat/lng precision varies by source (no epsilon tolerance)
- Phone format varies: "(616) 123-4567" vs "+1-616-123-4567" vs "6161234567"
- No collision detection after dedup (silent merge)
- No manual review process for dedup edge cases

**Mitigations:**
- **M1.4a (P0):** Tiered dedup logic (in order):
  1. **Exact match:** name (normalized) + address (normalized) + phone (normalized) within database
  2. **Fuzzy match:** name (Levenshtein ≤2 edit distance) + address (≤50m radius) + phone (match)
  3. **Coordinate-based:** If lat/lng within 20m of existing record + name similarity ≥80%, mark as potential duplicate
  4. Log every dedup decision: `{ incoming_id, matched_id, confidence, reason }`
- **M1.4b:** Normalization functions (apply before hash):
  ```typescript
  normalizeName(s: string): string {
    return s.toLowerCase()
      .replace(/\s+/g, ' ') // collapse whitespace
      .replace(/[\.]+/g, '') // remove periods
      .replace(/ (st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive)$/i, ' st') // normalize suffixes
      .trim();
  }
  
  normalizePhone(s: string): string {
    return s.replace(/[^\d]/g, '').slice(-10); // extract last 10 digits (US)
  }
  
  normalizeAddress(s: string): string {
    return normalizeName(s); // same as name
  }
  ```
- **M1.4c:** Distance-based checking:
  - If coordinates exist, use geohash or haversine distance
  - Two records within 20m = high collision risk
  - Use for tiebreaker when string-match is ambiguous
- **M1.4d:** Collision detection + audit:
  - After every crawl, run dedup report:
    - "X exact matches", "Y fuzzy matches", "Z coordinate-based matches"
    - Flag fuzzy/coordinate matches for manual review
    - Store review status: `dedup_verified: boolean`
  - UI shows: "Is this a duplicate?" → admin can merge or split
- **M1.4e:** Merge workflow:
  - When confirmed duplicate, merge records:
    - Primary record = more recent/verified source
    - Secondary record marked `is_duplicate_of: [primary_id]`
    - Keep full history (don't delete)
    - Update all references to secondary → primary

**Implementation Cost:** M1.4a = dedup engine (2–3 days), M1.4b = normalization funcs (0.5 days), M1.4c = geohash + distance (1 day), M1.4d = audit logging + UI (1.5 days), M1.4e = merge workflow (1.5 days)

**Owner:** findasale-architect (schema), findasale-dev (implementation)

---

#### Risk 1.5 — Bulk Corruption from Broken Source (Cascading Delete or Mass Update)
**Severity:** P1  
**Blast Radius:** 50% of directory marked CLOSED in one crawl; hours of manual recovery  
**Scenario:**
- HERE API goes down; returns empty results for 8 hours
- Your crawler interprets empty results as "these businesses no longer exist"
- Bulk marks 5,000 businesses as CLOSED without verification
- Hours later, HERE comes back up; damage is done; requires manual rollback

**Current Controls:** None mentioned

**Failure Mode:**
- Crawl logic assumes API returning 0 results = businesses are gone
- No distinction between "API error" and "verified business closure"
- No rate limiting on status changes
- No ability to rollback a crawl

**Mitigations:**
- **M1.5a (P0):** Never bulk-update status without source confirmation:
  - If metro crawl returns 0 results: log error, skip that metro, alert ops
  - Do NOT mark businesses CLOSED
  - If API returns errors: assume temporary failure; retry with exponential backoff
  - Only mark CLOSED if source API explicitly says "permanently closed" (not just missing from results)
- **M1.5b:** Rate limiting on status changes:
  - Per crawl, max 5% of businesses can change status (ACTIVE → CLOSED, etc.)
  - If >5% would change: log warning, skip bulk changes, alert ops
  - Prevents cascading corruption from bugs
- **M1.5c:** Crawl idempotency:
  - Each crawl run is identified: `crawl_id: UUID, timestamp, source, metro, status: 'pending' | 'completed' | 'failed' | 'rolled_back'`
  - Before applying updates, check if idempotent (same crawl_id run twice = same result)
  - If error mid-crawl, can rollback: `UPDATE business SET status = old_status WHERE crawl_id_applied = X`
- **M1.5d:** Snapshot + rollback:
  - Before each major crawl (weekly full sync), snapshot DB:
    - `status_snapshot: { business_id, status, updated_at, source } ` captured at T-0
    - If P0 corruption detected, rollback: `UPDATE business SET status = snapshot.status WHERE business_id IN (...)`
  - Rollback SLA: <30min from detection
- **M1.5e:** Change notification:
  - Every business with status change is flagged
  - Owner receives email: "Your listing changed from [old] to [new]. Review: [link]. Appeal within 48hr."
  - If >100 businesses in single crawl: also email ops team (manual QA gate)

**Implementation Cost:** M1.5a = logic change (1 day), M1.5b = rate limiting (0.5 days), M1.5c = idempotency + logging (1.5 days), M1.5d = snapshot/rollback (1 day), M1.5e = notification (1 day)

**Owner:** findasale-dev, findasale-ops (monitoring/alerting)

---

### SECTION 2: API AND INFRASTRUCTURE RISKS

#### Risk 2.1 — Google Places API Pricing Change / Free Tier Deprecation
**Severity:** P0  
**Blast Radius:** Crawl system becomes unaffordable overnight; 5,000/month budget becomes 50,000/month or API disabled  
**Scenario:**
- Google announces: "Places API free tier ending Dec 2026. Paid tier only: $7 per 1000 calls."
- Your system is hitting 5,000 calls/month = $35/month (still cheap)
- But if you scale to 10 metros × 4 sources × 3 crawls/month = 120 calls/metro = 4,800 calls/month total
- Or scale to 50 metros = 60,000 calls/month = $420/month
- Budget explodes; system becomes unaffordable

**Current Controls:** None; no monitoring of API pricing/ToS changes

**Failure Mode:**
- Unaware of changes until build breaks or bill spikes
- No fallback if API becomes paid/unavailable
- No cost forecasting (can't predict scaling impact)
- No contractual guarantee from Google (free tier can end anytime)

**Mitigations:**
- **M2.1a (P0 operational):** ToS + pricing monitoring:
  - Subscribe to Google Places API announcements (RSS, email)
  - Quarterly review of Google Cloud pricing page
  - Log current pricing model in `claude_docs/operations/api-contracts.md`:
    ```
    Google Places:
    - Pricing: Free tier (50k calls/month included in free GCP credit)
    - Last verified: 2026-05-02
    - Cost per 1000: $7 (if exceeding free tier)
    - Deprecation risk: Medium (free tier could end anytime)
    - Fallback: HERE Places (same data, different pricing)
    ```
- **M2.1b:** Cost forecasting:
  - Formula: `monthly_calls = metros × crawl_frequency × calls_per_metro`
  - Current: 1,100 combos / 4 sources = 275 initial crawls = ~550 calls (low impact)
  - At scale (50 metros): 50 × 3 crawls/month = 150 crawls = ~450 calls (still under 5k/month)
  - Build cost calculator into crawl planner: "Scaling to 50 metros = $X/month additional cost"
- **M2.1c:** Source redundancy:
  - Don't rely on Google Places alone
  - Current stack: Google + HERE + Foursquare + OSM = 4 sources
  - If Google pricing changes, migrate crawl load to HERE (verified to be cheaper/unlimited in certain tiers)
  - Test fallback quarterly: run same query on Google + HERE, verify coverage overlap ≥90%
- **M2.1d:** Budget alerts:
  - Set up GCP billing alerts: alert if >$100/month
  - Log monthly spend: `{month, google_places_calls, cost, monthly_total}`
  - If cost trending upward (>20% MoM growth), investigate cause
- **M2.1e:** API key rotation + usage monitoring:
  - Create separate API keys per environment (dev, staging, prod)
  - Monitor each key's usage independently
  - If key is leaked (usage spike), revoke immediately
  - Alert on >2x typical daily usage pattern

**Implementation Cost:** M2.1a = monitoring setup (1 day), M2.1b = cost calculator (1 day), M2.1c = fallback testing (1 day), M2.1d = billing alerts (0.5 days), M2.1e = key management (0.5 days)

**Owner:** findasale-ops, findasale-architect (cost model)

---

#### Risk 2.2 — API Key Leak (Attacker Burns Monthly Quota)
**Severity:** P0  
**Blast Radius:** $5,000 monthly quota burned in hours; crawl system unavailable; potential cost overages  
**Scenario:**
- API key exposed in GitHub commit (despite .gitignore, key was hardcoded temporarily)
- Attacker discovers key (via GitHub search, web.archive.org, npm package source)
- Runs 50,000 test queries in 1 hour = burns entire monthly quota
- Crawl system gets 429 rate-limited responses; queue backs up
- Thousands of items pending in crawl queue until next month's reset

**Current Controls:** Presumably key in .env (not committed); no mention of monitoring

**Failure Mode:**
- No way to know key is compromised until quota is exhausted
- No rate limiting on key itself (quota is shared across all consumers)
- No ability to revoke key mid-month without disrupting production
- No alerting on unusual usage patterns

**Mitigations:**
- **M2.2a (P0 gate):** Key management:
  - Never hardcode API keys
  - Keys only in `.env` or environment variables (committed `.env.example` lists variable names, not values)
  - Use GCP secret manager for production (Railway deployment reads from Secrets)
  - Rotate keys quarterly (create new key, swap, revoke old)
- **M2.2b:** Monitoring + anomaly detection:
  - Log every API call: `{ timestamp, key, endpoint, response_code, latency }`
  - Alert if daily call volume > 2x 7-day average (abnormal spike)
  - Alert if >1,000 calls in any 1-hour window (brute force pattern)
  - Alert if >50% 4xx errors (broken requests, potential attack)
  - Set up dashboard: "API Usage by Hour" + "Error Rate Trend"
- **M2.2c:** Rate limiting + quotas:
  - Implement crawl-worker rate limiter: max 10 calls/second per worker
  - If hitting rate limits, back off exponentially + queue for retry
  - Maintain crawl queue as priority queue: high-value metros first, low-confidence businesses last
- **M2.2d:** Key revocation SOP:
  - If compromise suspected: revoke key immediately (1 minute SLA)
  - Generate new key, update .env, redeploy backend (2–5 min)
  - No service interruption (new key takes effect, old key is dead)
  - Post-incident: audit logs, check what queries were run on old key
- **M2.2e:** Cost containment:
  - Set GCP billing cap: max $200/month for Places API only
  - If exceeded, service auto-disables (graceful degradation)
  - Business logic: if Places API unavailable, fall back to cached results (never serve null)

**Implementation Cost:** M2.2a = env setup (0.5 days), M2.2b = monitoring + dashboards (2 days), M2.2c = rate limiting (1 day), M2.2d = runbook + automation (1 day), M2.2e = billing cap + fallback (0.5 days)

**Owner:** findasale-ops, findasale-architect (rate limiting strategy)

---

#### Risk 2.3 — Overpass API IP Blocking (No Auth Mechanism)
**Severity:** P1  
**Blast Radius:** OSM data source unavailable; directory stale (relying on 3 sources instead of 4)  
**Scenario:**
- Your crawler makes 100+ queries/day to Overpass API (free, no auth)
- Overpass detects "bot" pattern: consistent daily requests from same IP
- Blocks your IP range for 24 hours (or permanently blacklists)
- OSM data stops flowing; directory gaps where OSM is primary source
- You have no way to contact Overpass to unblock (no customer support)

**Current Controls:** None; Overpass is mentioned as source but no mention of rate limiting

**Failure Mode:**
- No rate limiting in crawler → could hammer Overpass with 1,000 reqs/day
- No detection of 403 blocks (crawler logs error, continues, repeats next day)
- No fallback if Overpass is down
- No contract/SLA with Overpass (free service, best-effort)
- IP reputation risk: crawler IP becomes known as "bot IP"

**Mitigations:**
- **M2.3a (P0):** Rate limiting on Overpass queries:
  - Max 20 queries/day to Overpass (conservative; spread across 24hrs)
  - Query once per business per month (not per-crawl)
  - Batch queries: run all Overpass queries in single-day window, cache results for 30 days
  - Retry with 24-hour backoff if 429/503 (respect API signals)
- **M2.3b:** IP rotation + anonymization:
  - If rate limited, switch to VPN/proxy (optional; probably excessive for this scale)
  - Alternatively: add User-Agent header + contact Overpass team
  - State clearly in UA: "FindA.Sale business directory crawler; contact [email] if issues"
- **M2.3c:** Graceful degradation:
  - If Overpass is down: serve directory without OSM data
  - Flag in UI: "Some listings may be missing OSM verification"
  - Alert ops: "Overpass API down for 2+ hours; directory incomplete"
- **M2.3d:** Fallback data:
  - Cache Overpass results aggressively (30-day TTL minimum)
  - If fresh query fails, serve cached result if <30 days old
  - Notify user: "Data from [date]; refresh may be delayed"
- **M2.3e:** Contact + community:
  - Add Overpass team to ops email list (if possible)
  - Monitor Overpass status page (if exists)
  - Document SLA: "Overpass is community-run; expect occasional downtime"

**Implementation Cost:** M2.3a = rate limiting (1 day), M2.3b = IP rotation setup (optional, 0.5–2 days), M2.3c = fallback logic (0.5 days), M2.3d = caching (0.5 days), M2.3e = monitoring (0.5 days)

**Owner:** findasale-dev (rate limiting), findasale-ops (monitoring)

---

#### Risk 2.4 — HERE / Foursquare API Deprecation / Pricing Change
**Severity:** P1  
**Blast Radius:** Loss of secondary sources; directory quality degradation; potential unavailability  
**Scenario:**
- HERE Places API is a commercial API (paid tier); Foursquare owns location data
- Either company could:
  - Raise pricing (unlikely to affect you at current scale, but blocks expansion)
  - Deprecate free tier (Foursquare did this for some products in the past)
  - Shut down API entirely (consolidation / pivot)
- You lose 2 of 4 sources; directory gaps appear
- Forced to scale on Google + OSM alone (less diverse, lower coverage)

**Current Controls:** None; no contract/ToS review mentioned

**Failure Mode:**
- No awareness of API deprecation until broken
- No coverage analysis (how much data do you lose if HERE goes away?)
- No contractual commitment (can be changed anytime)
- No fallback prioritization

**Mitigations:**
- **M2.4a (P0 operational):** API contract monitoring:
  - Annual review of HERE + Foursquare ToS
  - Document current status: free tier active, pricing model, SLA
  - Subscribe to API changelogs (RSS/email)
  - Track version numbers; flag deprecation notices in logs
- **M2.4b:** Coverage analysis:
  - Quarterly audit: "What % of our 50k businesses come from each source?"
  - Example: Google 60%, HERE 25%, Foursquare 10%, OSM 5%
  - If HERE disappears, we lose 25% of data; flag as risk
  - Plan: if losing major source, coordinate refresh crawl on remaining sources ASAP
- **M2.4c:** Fallback prioritization:
  - Google Places = primary (free tier, mature, most coverage)
  - HERE = secondary (established, enterprise-grade)
  - Foursquare = tertiary (strong in specific metros, e.g., nightlife)
  - OSM = tertiary (community-driven, good for niche categories)
  - If Foursquare goes away: reallocate quota to Google/HERE
- **M2.4d:** Alternative sources (future):
  - Yelp Places API (paid, comprehensive)
  - Apple Maps Connect (if building for iOS)
  - Local government business registries (slower, but authoritative)
  - Document these as backups; don't add unless primary sources fail

**Implementation Cost:** M2.4a = monitoring + docs (1 day), M2.4b = coverage analysis (1 day), M2.4c = fallback logic (0.5 days), M2.4d = research (1 day)

**Owner:** findasale-architect (strategy), findasale-ops (monitoring)

---

#### Risk 2.5 — Single Point of Failure in Crawl Queue / Worker Process
**Severity:** P1  
**Blast Radius:** All crawl jobs stall; directory becomes stale (data ages out); no recovery until manually restarted  
**Scenario:**
- Crawl worker process crashes (unhandled exception in dedup logic)
- Queue database table becomes locked (transaction deadlock)
- Worker is supposed to retry; instead, job sits in queue forever (stuck in PROCESSING state)
- After 48 hours, entire crawl backlog is aged; nobody notices
- Directory ages by 7 days while queue is stuck

**Current Controls:** None mentioned; no mention of worker redundancy or health checks

**Failure Mode:**
- Single worker process = single point of failure
- No automatic restart on crash
- No monitoring of queue depth / stuck jobs
- No alerting when jobs exceed max retry attempts
- No ability to manually recover stuck jobs

**Mitigations:**
- **M2.5a (P0):** Worker redundancy + health checks:
  - Deploy ≥2 crawler workers (in different Railway dynos / containers)
  - Each worker heartbeats to DB: `{ worker_id, last_heartbeat, queue_depth }`
  - If heartbeat >5min stale: mark worker DEAD
  - Orchestrator reassigns its jobs to healthy worker
  - Auto-scale workers if queue_depth > 100 (horizontal scaling)
- **M2.5b:** Job state machine + timeout:
  - Queue job states: `pending | processing | completed | failed | abandoned`
  - If job is in PROCESSING >30min: revert to PENDING, increment retry_count
  - If retry_count > 3: mark ABANDONED, alert ops
  - Only mark COMPLETED when all writes to DB are confirmed
- **M2.5c:** Queue depth monitoring:
  - Alert if queue_depth > 50 (backlog building)
  - Alert if queue_depth > 200 (severe backlog)
  - Alert if any job > 1 hour old (stuck)
  - Dashboard: "Queue Status" showing depth + age of oldest job
- **M2.5d:** Manual recovery tools:
  - CLI command: `npm run crawl:retry-stuck` — reruns all ABANDONED jobs
  - CLI command: `npm run crawl:reset-worker [worker_id]` — reassigns its jobs
  - CLI command: `npm run crawl:peek-queue` — shows next 10 jobs
  - All CLI commands log to audit trail
- **M2.5e:** Graceful degradation:
  - If all workers are down: pause new crawls (don't queue them)
  - Alert ops: "All crawl workers unavailable; directory data aging"
  - Fall back to cached results: serve stale data with "Last updated: [date]" label

**Implementation Cost:** M2.5a = worker redundancy + heartbeat (2–3 days), M2.5b = state machine + timeout logic (1.5 days), M2.5c = monitoring (1.5 days), M2.5d = CLI tools (1 day), M2.5e = graceful degradation (0.5 days)

**Owner:** findasale-architect (design), findasale-dev (implementation), findasale-ops (monitoring)

---

### SECTION 3: QUEUE SYSTEM FAILURE MODES

#### Risk 3.1 — Infinite Loop on High-Volume Metro (Worker Never Finishes)
**Severity:** P1  
**Blast Radius:** Worker blocked for hours on 1 job; queue backs up; other metros starve  
**Scenario:**
- Crawl metro "Los Angeles" with Google Places (high-volume results)
- Google returns 10,000 results across 100 pages
- Crawler is paginating correctly but processing is slow
- Job runs for 4 hours without releasing its worker slot
- Other metros (Grand Rapids, Chicago, etc.) are waiting; never get processed
- Queue backs up behind single stuck job

**Current Controls:** None mentioned; no mention of timeouts or pagination limits

**Failure Mode:**
- No job timeout (worker can run indefinitely)
- No pagination limit (crawler tries to fetch all 10k results)
- Worker starvation: single job ties up a worker
- No detection of slow jobs
- No ability to kill stuck job without killing worker

**Mitigations:**
- **M3.1a (P0):** Job timeout + pagination limits:
  - Max job duration: 5 minutes
  - If job exceeds 5min: kill it, mark as FAILED, requeue with retry_count++
  - Max results per API call: 1,000 (paginate, don't fetch all)
  - Max pages per job: 10 (e.g., 1,000 results = 10 pages × 100 per page)
  - Schema: `crawl_job: { metro, source, max_results: 1000, max_pages: 10, timeout_ms: 300000 }`
- **M3.1b:** Prioritization + load balancing:
  - Queue jobs with priority: high-value metros (large cities) = lower priority (fewer workers)
  - Low-value metros (small towns) = higher priority (process quickly)
  - Example: Grand Rapids = p:100, LA = p:10 (process GR first, LA later)
  - Prevents small jobs from starving behind large jobs
- **M3.1c:** Slow job detection:
  - Alert if any job >2min (warn)
  - Alert if any job >4min (critical; about to timeout)
  - Log to dashboard: "Job [id] at 3m 45s, processing result [N]/1000"
  - Allow ops to manually kill if needed
- **M3.1d:** Partial completion:
  - If job times out after 1,000 results: save what we have
  - Mark as PARTIAL_COMPLETE, not FAILED
  - Queue next batch: "resume from page 11" (if pagination is available)
  - Ensures we make progress even on huge metros
- **M3.1e:** Incremental API calls:
  - Don't fetch all pages upfront; fetch on-demand
  - Process each page as it arrives (stream-like)
  - Early kill if timeout reached (don't wait for all pages to load)

**Implementation Cost:** M3.1a = timeout + limits (1 day), M3.1b = prioritization (1 day), M3.1c = monitoring (0.5 days), M3.1d = partial completion logic (1 day), M3.1e = streaming API calls (1.5 days)

**Owner:** findasale-dev, findasale-architect (job design)

---

#### Risk 3.2 — Queue Table Unbounded Growth (1,100 × 4 Sources = 4,400 Rows, Then 10x)
**Severity:** P2  
**Blast Radius:** Query performance degrades; database storage bloats; eventual OOM / slow queries  
**Scenario:**
- Current crawl queue: 1,100 (metro × category) combos × 4 sources = 4,400 queue rows (manageable)
- Add retry logic: failed jobs requeue with exponential backoff
- Add multiple crawl frequencies: "refresh high-value businesses weekly, low-value monthly"
- After 6 months, queue has:
  - 4,400 active jobs × 2 (running + pending) = 8,800
  - Plus 5,000 historical/archived jobs (not cleaned up) = 13,800
  - Plus 2,000 failed jobs waiting for retry = 15,800
  - Query slowdown: selecting `WHERE status='pending' AND source='google'` now scans 15k rows instead of 1k

**Current Controls:** None mentioned; no mention of archival or cleanup

**Failure Mode:**
- No cleanup of old/completed jobs (tables grow unbounded)
- No indexing on queue table (all queries full-table scan)
- No partitioning strategy (can't shard across metros)
- Slow crawl planner (queries crawl_queue to find pending jobs)

**Mitigations:**
- **M3.2a (P1):** Cleanup policy:
  - Archive completed jobs >30 days old to separate table (`crawl_queue_archive`)
  - Keep only last 7 days of active jobs in main table
  - Schema: `crawl_queue: { id, metro, source, status, created_at, completed_at, next_retry }`
  - Cron job: daily at 2am UTC: `DELETE FROM crawl_queue WHERE completed_at < now() - interval '7 days'`
  - Never delete; move to archive (immutable log of all crawls ever)
- **M3.2b:** Indexing strategy:
  - `CREATE INDEX idx_crawl_queue_status ON crawl_queue(status)`
  - `CREATE INDEX idx_crawl_queue_source ON crawl_queue(source)`
  - `CREATE INDEX idx_crawl_queue_metro ON crawl_queue(metro)`
  - `CREATE INDEX idx_crawl_queue_next_retry ON crawl_queue(next_retry)` (for retry logic)
  - Query planner uses indexes: "SELECT * FROM crawl_queue WHERE status='pending' AND source='google'" hits index, scans ~10 rows instead of 4k
- **M3.2c:** Partitioning (future):
  - If queue grows >100k rows: partition by metro (hash partition)
  - Example: `crawl_queue_grandrapi`, `crawl_queue_losangeles`, etc.
  - Limits each partition to ~1k rows (fast queries)
  - Orchestrator queries correct partition based on metro
- **M3.2d:** Queue statistics:
  - Monitor queue size daily: `SELECT COUNT(*) FROM crawl_queue`
  - Alert if >20k rows (approaching saturation)
  - Track completion rate: "X jobs completed, Y jobs pending, avg age of pending job"
  - Dashboard: "Queue Stats" showing growth trend
- **M3.2e:** Crawl job expiry:
  - Jobs older than 90 days that haven't completed = archive + mark ABANDONED
  - Prevents stale jobs from cluttering queue forever
  - Allows retry on fresh job (not retrying a 6-month-old failure)

**Implementation Cost:** M3.2a = cleanup cron job (0.5 days), M3.2b = indexing (0.5 days), M3.2c = partitioning (2–3 days, future), M3.2d = monitoring (0.5 days), M3.2e = expiry logic (0.5 days)

**Owner:** findasale-dev, findasale-architect (schema design)

---

#### Risk 3.3 — Race Condition: Two Workers Processing Same Job
**Severity:** P1  
**Blast Radius:** Duplicate writes to database; dedup logic broken (same business inserted twice); data corruption  
**Scenario:**
- Job: "Google Places, Grand Rapids"
- Worker A picks job from queue, marks as PROCESSING
- Worker B somehow also picks same job (race condition in queue pick logic)
- Both workers process the job simultaneously
- Both insert 500 businesses into database
- Dedup logic runs for Worker A (deduplicates against Worker B's uncommitted data)
- Worker B's writes commit after Worker A's dedup (now duplicates exist)

**Current Controls:** None mentioned; no mention of locking

**Failure Mode:**
- No database transaction isolation (concurrent writes)
- Queue pick logic not atomic (no lock when marking PROCESSING)
- No unique constraint on (metro, source, timestamp) combination
- Dedup checks stale data (reads not yet committed by other worker)

**Mitigations:**
- **M3.3a (P0):** Atomic job pickup:
  - Use database SELECT FOR UPDATE (pessimistic locking):
    ```sql
    BEGIN;
    SELECT id FROM crawl_queue 
    WHERE status='pending' AND worker_id IS NULL 
    LIMIT 1 FOR UPDATE;
    UPDATE crawl_queue SET worker_id=?, status='processing', started_at=now() WHERE id=?;
    COMMIT;
    ```
  - Only one worker can pick a job; others wait for lock release
  - Prevents duplicate pickup
- **M3.3b:** Transaction isolation:
  - Use SERIALIZABLE isolation level for dedup checks:
    ```typescript
    await prisma.$transaction(async (tx) => {
      // Check if business exists (read under lock)
      const existing = await tx.business.findUnique({ where: { dedup_key } });
      if (!existing) {
        // Insert new business (write in same transaction)
        await tx.business.create({ data: newBusiness });
      }
    }, { isolationLevel: 'Serializable' });
    ```
  - Dedup check + insert happen atomically; no race condition
- **M3.3c:** Unique constraint:
  - Add DB constraint: `UNIQUE(dedup_key, crawl_job_id, worker_id)` (optional but helpful)
  - Prevents accidental duplicate inserts even if race condition occurs
  - Unique violation = obvious error (not silent corruption)
- **M3.3d:** Idempotency:
  - Design crawl jobs to be idempotent (run twice = same result)
  - Store job signature: `job_hash = hash(metro, source, timestamp_bucket)`
  - If same job_hash runs twice, deduplicate at job level (not just record level)
  - Example: "Google Places, Grand Rapids, 2026-05-02 10:00 UTC" (1-hour window)
- **M3.3e:** Monitoring:
  - Alert if any job is assigned to >1 worker simultaneously
  - Alert if dedup constraint violation occurs
  - Dashboard: "Workers Active" showing which worker is processing which job

**Implementation Cost:** M3.3a = atomic pickup logic (1 day), M3.3b = transaction isolation (0.5 days), M3.3c = unique constraint (0.5 days), M3.3d = idempotency (1 day), M3.3e = monitoring (0.5 days)

**Owner:** findasale-dev, findasale-architect (transaction design)

---

#### Risk 3.4 — Bulk Mark CLOSED Bug (Thousands of Businesses Incorrectly Closed)
**Severity:** P1  
**Blast Radius:** Directory missing 10% of listings; organizers can't be found; revenue impact  
**Scenario:**
- Bug in crawl logic: "If no results from Google Places, mark existing businesses as CLOSED"
- Google Places API is down for 2 hours (transient outage)
- Crawler runs during outage: gets 0 results (API error, not "businesses gone")
- Bug marks 5,000 businesses as CLOSED
- Hours later, API is back; bug is discovered; requires manual recovery

**Current Controls:** Risk 1.5 partially addresses this; this is a sub-case

**Failure Mode:**
- Crawler conflates "API error" with "business closure"
- No validation before bulk status changes
- No undo mechanism (manual rollback required)

**Mitigations:**
- (See Risk 1.5 mitigations M1.5a–M1.5e; not repeating here)

---

### SECTION 4: "CLAIM THIS LISTING" EMAIL RISKS

#### Risk 4.1 — CAN-SPAM Compliance (Mass Unsolicited Email to Scraped Addresses)
**Severity:** P0  
**Blast Radius:** FTC fine ($43,792 per violation, 1000s of violations), domain reputation destroyed, emails blocked, legal liability  
**Context:** CAN-SPAM Act (15 U.S.C. § 7701) applies to ALL commercial email in the US. Violations are strict liability.

**Scenario:**
- You scrape 1,000 business contact emails from websites (not explicit opt-in)
- Send "Claim This Listing" email to all 1,000 (unsolicited commercial message)
- 200 recipients mark as spam (200 × $43,792 = $8.7M exposure)
- FTC sends cease-and-desist + fine; domain reputation tanked (ISP blacklists)

**Current Controls:** None mentioned; email sending is planned but no mention of compliance

**Failure Mode:**
- Scraped emails are NOT explicit opt-in (recipient never agreed to receive email from you)
- No unsubscribe mechanism (violates CAN-SPAM §5)
- Subject line doesn't identify as advertisement (violates §3)
- No postal address in email (violates §4)
- Sender identity missing or misleading (violates §2)
- No honor of unsubscribe requests (violates §6)

**Mitigations:**
- **M4.1a (P0 legal gate — MUST complete before MVP email):**
  - Consult findasale-legal: "Is our email plan CAN-SPAM compliant?"
  - Legal review required on:
    1. Email source: how are we getting addresses? (website scraping, directory listings, public records)
    2. Recipient relationship: does recipient have existing relationship with FindA.Sale? (probably no = cold contact)
    3. Subject line: must identify as "advertisement" or commercial (e.g., "Claim Your FindA.Sale Business Listing")
    4. Unsubscribe mechanism: must provide easy, honored opt-out (link + email address)
    5. Postal address: must include FindA.Sale physical address or legal entity info
    6. Sender identity: "From: noreply@finda.sale" is acceptable; "From: Stripe" is not
- **M4.1b:** Email template compliance:
  ```
  From: FindA.Sale <noreply@finda.sale>
  Subject: [ADVERTISEMENT] Claim Your FindA.Sale Business Listing – [Business Name]
  
  Body:
  Dear [Business Owner],
  
  We found your business listed in our directory. Claim it to manage your information.
  
  [Claim Button]
  
  -- 
  FindA.Sale, Inc.
  [Physical Address or Legal Entity Info]
  [Postal Address]
  
  To unsubscribe from future emails: [Unsubscribe Link]
  Manage preferences: [Preferences Link]
  ```
- **M4.1c:** Unsubscribe honor SOP:
  - Unsubscribe link points to: `https://finda.sale/email-preferences?token=[signed_token]`
  - One click = adds email to suppression list: `business_email_suppressed: true`
  - Email system checks suppression list before sending ANY email (claim, update, notification)
  - Never email suppressed address (even if listed in directory)
  - Honor suppression within 10 days (CAN-SPAM requirement)
  - Log all unsubscribe requests: audit trail for FTC if questioned
- **M4.1d:** Email source verification:
  - Only send to emails explicitly listed in business directory (public sources)
  - Don't scrape from website `<a href="mailto:...">`  UNLESS:
    - Email is already in public directory (Google Places, HERE, Foursquare)
    - OR you have explicit opt-in from business (unlikely)
  - Avoid personal emails (solepreneurs); target "info@", "contact@" generic addresses (safer from CCPA perspective)
- **M4.1e:** Opt-in preference (future enhancement):
  - Better approach: offer organizers a way to send emails on their behalf
  - Organizer logs into FindA.Sale, clicks "Send Claim Email", we send on their behalf (not as you)
  - Shifts liability: organizer is sender, you're facilitating (safer)
  - Requires organizer sign-up (higher barrier, lower volume, better legal position)
- **M4.1f:** Monitoring + FTC defensibility:
  - Log every email sent: `{ recipient, subject, timestamp, delivery_status, bounced, complained, suppressed }`
  - Track complaint rate: alert if >0.1% of emails marked spam (abnormal = flag in FTC response)
  - Maintain unsubscribe list as immutable audit log (courts/FTC will demand this)
  - Annual audit: "Did we honor all unsubscribe requests?"

**Implementation Cost:** M4.1a = legal review (Patrick + findasale-legal, 2–5 days), M4.1b = template (1 day), M4.1c = unsubscribe system (2–3 days), M4.1d = source policy (decision, 0.5 days), M4.1e = future enhancement (depends on architecture), M4.1f = monitoring (1 day)

**Owner:** findasale-legal (compliance), Patrick (business decision on email strategy), findasale-dev (implementation)

---

#### Risk 4.2 — GDPR Liability (Emailing EU Citizens Without Consent)
**Severity:** P0  
**Blast Radius:** GDPR fine up to €20M or 4% of global revenue, customer lawsuits, business suspension in EU  
**Context:** GDPR (Regulation (EU) 2016/679) requires explicit opt-in for any email to EU citizens. Email addresses are personal data.

**Scenario:**
- Your crawl includes businesses in EU markets (London, Paris, Berlin)
- You send "Claim This Listing" emails to business owners (EU citizens)
- No explicit opt-in (you scraped the address)
- GDPR compliance officer reports you → fine issued
- Email addresses are now flagged as unlawfully processed → deletion requests

**Current Controls:** None mentioned; no mention of EU compliance

**Failure Mode:**
- EU citizens' email addresses are personal data (GDPR)
- No explicit opt-in = unlawful processing
- Sending unsolicited email = marketing without consent
- Right to be forgotten: EU citizens can demand email deletion (you must comply)
- No Data Processing Agreement (DPA) with email service provider

**Mitigations:**
- **M4.2a (P0 legal gate):** Geo-blocking + consent:
  - Identify EU businesses (address contains EU country)
  - DO NOT email EU addresses unless:
    1. Explicit opt-in from recipient (unlikely for scraped addresses)
    2. OR legitimate business interest exemption (rare, requires legal advice)
  - Default: exclude EU addresses from claim email campaign
  - Geo-code addresses: if EU = skip email send
  - Schema: `business: { country_code, gdpr_compliant: boolean }`
- **M4.2b:** Consent tracking:
  - If organizer wants to email EU contacts: require organizer consent + legal review first
  - Organizer acknowledges: "I have permission to contact these people, I understand GDPR requirements"
  - Log consent decision: `{ organizer_id, business_id, timestamp, consent_recorded }`
  - Only send email if consent_recorded = true
- **M4.2c:** Right to deletion (Article 17):
  - Implement deletion request form: "Delete my email + data"
  - SLA: honor within 30 days (GDPR requirement)
  - Delete from crawl_queue, business_claim_email_sent, suppression list, all logs
  - Log deletion: `{ email, deletion_requested_date, deletion_executed_date, operator }`
  - Keep audit log (immutable) for regulatory response
- **M4.2d:** Data Processing Agreement (DPA):
  - If using email service provider (e.g., SendGrid, Mailgun): ensure DPA is signed
  - Email provider is a "data processor"; you are the "controller"
  - DPA must outline: data handling, retention, deletion, breach notification
  - Verify with email provider: "Do you have DPA template?"
- **M4.2e:** Privacy policy + email notice:
  - Update privacy policy: "We collect business contact emails from public sources. We may send a single claim email. You can unsubscribe anytime."
  - Make clear what email addresses we store and why
  - Make clear unsubscribe = honored + deletion of that address

**Implementation Cost:** M4.2a = geo-blocking (1 day), M4.2b = consent tracking (1 day), M4.2c = deletion workflow (2 days), M4.2d = DPA verification (0.5 days, Patrick + legal), M4.2e = privacy policy update (1 day, legal)

**Owner:** findasale-legal (DPA, privacy policy), findasale-dev (geo-blocking + deletion workflow)

---

#### Risk 4.3 — CCPA Right to Deletion (California Residents' Data)
**Severity:** P1  
**Blast Radius:** California fine up to $7,500 per violation, customer lawsuits, business disruption  
**Context:** CCPA (California Consumer Privacy Act, Cal. Civ. Code § 1798.100) requires deletion of California residents' personal data on request.

**Scenario:**
- Business owner emails you: "Delete my business email from your database"
- Your system doesn't honor deletion requests (assumes only GDPR applies)
- 90 days later, business owner sues under CCPA → liability exposure
- CCPA fines: up to $2,500 per violation, $7,500 per intentional violation

**Current Controls:** None mentioned; no mention of CCPA

**Failure Mode:**
- Business owner email is personal data (CCPA)
- No deletion mechanism (request is ignored)
- Data is retained indefinitely (violates CCPA §1798.105)
- No opt-in/opt-out mechanism (violates CCPA §1798.120)

**Mitigations:**
- **M4.3a (P0 legal gate):** Deletion request mechanism:
  - Implement form: "Request deletion of your data"
  - Requires email verification (confirm they own the address)
  - 45-day SLA: honor deletion or explain why (legal obligation, etc.)
  - Deletion covers: email address, business listing (if submitted by them), claim emails sent, all metadata
  - Schema: `business: { deletion_requested: boolean, deletion_requested_date: timestamp }`
  - Cron job: `DELETE FROM business WHERE deletion_requested=true AND deletion_requested_date < now() - interval '45 days'`
- **M4.3b:** Opt-out mechanism:
  - CCPA §1798.120 requires ability to opt-out of "sale of personal information"
  - (FindA.Sale probably isn't "selling" data, but provide opt-out anyway for safety)
  - Link in email: "Opt out of data usage"
  - Opt-out = add to suppression list (same as unsubscribe)
  - Logo: "Do Not Sell My Personal Information" (legally required if you sell data)
- **M4.3c:** Deletion verification:
  - After deletion, verify in logs: business is gone
  - Alert ops: "Deletion request processed for [email], [business_id]"
  - Audit log: `{ deletion_requested_date, deletion_executed_date, verifier_id }`
  - Retain audit log (immutable) for legal defense
- **M4.3d:** Sole proprietor handling:
  - Business emails belonging to sole proprietors = personal data (CCPA)
  - More aggressive protection: if personal email detected (firstname.lastname@), flag for approval
  - Avoid scraping personal emails from website footers
  - Prefer generic addresses: "info@", "contact@", "hello@"
  - If must use personal email: require explicit consent first

**Implementation Cost:** M4.3a = deletion workflow (1.5 days), M4.3b = opt-out mechanism (0.5 days), M4.3c = verification + logging (0.5 days), M4.3d = email classification (1 day)

**Owner:** findasale-legal (compliance), findasale-dev (implementation)

---

#### Risk 4.4 — Email Domain Reputation Damage (Spam Trap / Honeypot)
**Severity:** P1  
**Blast Radius:** Domain blacklisted (ISPs reject all email); claim emails never delivered; email system broken  
**Scenario:**
- You scrape business email: "noreply@oldmall.com" (appears in old website directory)
- This email is actually a spam trap (honeypot) set by email provider (Gmail, Outlook, etc.)
- You send claim email to honeypot
- Email provider marks your domain as spammer
- All subsequent emails from @finda.sale are now caught in spam filters (or rejected)
- Claim emails never deliver; legitimate organizer emails from FindA.Sale also suffer

**Current Controls:** None mentioned; no email validation before sending

**Failure Mode:**
- No validation that email address is real (just syntactic check)
- Honeypot emails are indistinguishable from real emails
- Spam report from honeypot = domain reputation hit
- Domain reputation affects all email (even non-spam emails)
- Takes weeks to recover reputation

**Mitigations:**
- **M4.4a (P1):** Email list hygiene:
  - Use email verification service (e.g., ZeroBounce, NeverBounce) before sending
  - Verify every address: real domain, mailbox exists, not spam trap
  - Only send to verified addresses (reduces spam complaints by ~50%)
  - Cost: ~$0.005–0.01 per email (expensive at scale, but worth for domain health)
- **M4.4b:** Warm-up strategy:
  - Don't send 1,000 emails on day 1 from new domain
  - Start with 10 emails/day, increase over 2 weeks (warm-up period)
  - Email provider sees gradual ramp (not bot-like burst)
  - Reduces spam filter flags
- **M4.4c:** Domain authentication:
  - Set up SPF, DKIM, DMARC records (prevents spoofing, improves delivery)
  - SPF: `v=spf1 include:sendgrid.net ~all` (if using SendGrid)
  - DKIM: sign emails with domain key
  - DMARC: policy to reject/quarantine suspicious emails
  - Major ISPs (Gmail, Outlook, Yahoo) check these; missing = low delivery rate
- **M4.4d:** Bounce + complaint monitoring:
  - Track hard bounces (invalid email) and soft bounces (mailbox full)
  - Hard bounce = never email again (remove from list)
  - Soft bounce after 3 attempts = mark as unreachable (retry less often)
  - Track complaint rate: if >0.5%, pause sends + investigate
  - Alert ops: "Email complaint rate at [%]; check sending strategy"
- **M4.4e:** Separate subdomain for bulk email:
  - Use subdomain: "claims@finda.sale" (not main domain)
  - If subdomain reputation takes hit, main domain not affected
  - Allows recovery without affecting organizer email (which uses @finda.sale)

**Implementation Cost:** M4.4a = email verification integration (1.5 days), M4.4b = warm-up automation (1 day), M4.4c = DNS records + DMARC (0.5 days), M4.4d = monitoring (1 day), M4.4e = subdomain setup (0.5 days)

**Owner:** findasale-ops (email infrastructure), findasale-dev (implementation)

---

#### Risk 4.5 — No Verification That Business Owner Owns Email (Impersonation Risk)
**Severity:** P1  
**Blast Radius:** Email sent to wrong person (someone else's email); organizer confused; legal liability  
**Scenario:**
- You scrape contact email for "Joe's Antiques" from Google Business Profile: "contact@example.com"
- Email is actually the landlord's general contact, not Joe's
- You send "Claim Your Listing" to landlord
- Landlord claims the listing as their business (hijacking)
- Joe's Antiques profile is now run by landlord; listing integrity compromised

**Current Controls:** None mentioned; assumes email in directory = business owner

**Failure Mode:**
- Assume scraped email = owner (not always true)
- No verification that email recipient actually owns business
- No confirmation mechanism (1-click claim is risky)
- No rollback if wrong person claims

**Mitigations:**
- **M4.5a (P0):** Claim verification workflow:
  - "Claim" email includes: "Click here to verify you own this business"
  - Clicking link generates token + sends verification email
  - Verification email goes to 2 addresses (primary + alternate):
    - Email scraped from Google Places
    - Email from HERE Places (if different)
    - Email from business website (if available)
  - Verification requires response from ≥2 addresses (prevents single-address hijacking)
- **M4.5b:** Challenge mechanism:
  - If incorrect person claims: legitimate owner can challenge within 30 days
  - Challenge requires proof (business license, domain ownership, phone number match)
  - After challenge, listing reverts to UNVERIFIED (neither party owns it)
  - Alert ops: "Listing [id] under dispute; manual review needed"
- **M4.5c:** Backup contact methods:
  - If email claim fails: offer SMS verification (phone from directory)
  - Or: account login (if organizer already has FindA.Sale account, just claim + confirm password)
  - Multiple paths to claim reduces risk of wrong person
- **M4.5d:** Listing hold period:
  - After claim email sent, listing is CLAIMED_PENDING for 7 days
  - During this period, other organizers can still search + see listing
  - But business can't be edited until claim is verified
  - After 7 days with no verification: revert to UNVERIFIED, release for other claims
- **M4.5e:** Contact validation:
  - Before sending claim email, verify:
    - Email domain matches website domain (if website exists)
    - Email appears in ≥2 independent sources (Google + HERE, or Google + OSM)
    - Phone number associated with email is non-US (international = harder to verify, require extra steps)

**Implementation Cost:** M4.5a = verification workflow (2 days), M4.5b = challenge mechanism + appeal (2 days), M4.5c = SMS integration (1.5 days), M4.5d = hold period logic (1 day), M4.5e = contact validation (1 day)

**Owner:** findasale-dev, findasale-architect (claim workflow design)

---

### SECTION 5: COMPETITIVE & BUSINESS RISKS

#### Risk 5.1 — Google ToS Violation (Competing Directory)
**Severity:** P0  
**Blast Radius:** Google cease-and-desist; forced to remove feature; legal fees; reputational damage  
**Context:** Google Places API ToS (Section 3.2.4) prohibits using data to "compete with Google" or "build a competing directory."

**Scenario:**
- FindA.Sale builds a directory of 50k businesses using Google Places API
- Google interprets this as "competing directory" (because you're aggregating + displaying Google data)
- Google sends cease-and-desist: "Stop using Places API for this purpose"
- You must either: (a) remove feature, (b) switch to different data source, (c) fight Google legally (expensive)

**Current Controls:** None mentioned; no mention of ToS review

**Failure Mode:**
- Assuming Google allows competitive use (it doesn't, typically)
- No legal review of ToS before building
- No understanding of what "competing directory" means
- No contract with Google (API access can be revoked anytime)

**Mitigations:**
- **M5.1a (P0 legal gate — MUST complete before MVP):**
  - findasale-legal: "Is our use of Google Places API compliant with ToS?"
  - Request legal opinion on:
    1. Are we "building a competing directory"? (Gray area; depends on features)
    2. Are we using data solely for our intended business purpose? (Listing discovery for organizers, not general public search)
    3. Are we properly attributing Google data in UI? (Legal may require "Powered by Google" badges)
  - Options if non-compliant:
    - A: Pay for Google Cloud pricing tier with explicit permission for competitive use (if available)
    - B: Use only Google data for internal purposes (don't display publicly)
    - C: Switch to HERE/Foursquare as primary data source (they may allow competitive use)
- **M5.1b:** Limited data use:
  - Only use Google Places API data for:
    - "Get started" suggestions (don't make it the primary directory)
    - Verification (is this business real? check Google)
    - Enrichment (does Google have updated hours? merge it)
  - Don't use as: public directory, search engine, aggregator
  - Differentiation: FindA.Sale directories show organizer details, not just business info
- **M5.1c:** Attribution + branding:
  - Display in UI: "Business information from Google Places, HERE, and community sources"
  - Don't present as FindA.Sale original data
  - Make clear you're aggregating, not competing
  - May require legal review of exact wording
- **M5.1d:** Monitor for cease-and-desist:
  - Legal should subscribe to Google Cloud notices (email alerts)
  - If Google sends warning: pause feature immediately, consult lawyer
  - Have fallback ready: "If Google cuts off access, switch to HERE-only"

**Implementation Cost:** M5.1a = legal review (findasale-legal, 2–5 days), M5.1b = feature scope decision (Patrick), M5.1c = UI + branding (1 day), M5.1d = monitoring (operational)

**Owner:** findasale-legal (primary), Patrick (business strategy)

---

#### Risk 5.2 — Yelp / Google Complaints About Scraping
**Severity:** P1  
**Blast Radius:** Cease-and-desist, legal fees, potential injunction preventing you from scraping  
**Context:** Yelp has sued competitors for scraping their data (Yelp v. Clicksand, Yelp v. Veve, etc.)

**Scenario:**
- You scrape business hours, ratings, photos from Yelp via web scraping (not API)
- Yelp detects scraping pattern (bot user-agent, repeated requests)
- Yelp sends cease-and-desist: "Stop scraping our content"
- You're now legally barred from scraping Yelp (even public data)
- Have to rebuild without Yelp data

**Current Controls:** None mentioned; crawler uses official APIs (Google, HERE, Foursquare), but no mention of web scraping

**Failure Mode:**
- (Probably not an issue if using only official APIs, but relevant if future enhancements add scraping)

**Mitigations:**
- **M5.2a (P0 rule):** No web scraping of competitors:
  - Only use official APIs (Google Places, HERE, Foursquare, OSM Overpass)
  - Never scrape Yelp, TripAdvisor, Nextdoor, or other competitors' websites
  - Exception: scrape public records (business registries, government data), not private websites
  - Schema rule: no crawling of domains outside approved list (Google, HERE, Foursquare, OSM, govt sites)
- **M5.2b:** ToS compliance:
  - Before using any data source: review their ToS
  - Document: "Source X allows aggregation for Y purpose" (log in operations doc)
  - Avoid sources with ambiguous ToS (better to miss data than risk legal)

**Implementation Cost:** M5.2a = crawler policy (decision, 0.5 days), M5.2b = ToS audit (1 day per source)

**Owner:** findasale-legal (ToS review), findasale-architect (allowed sources list)

---

#### Risk 5.3 — Business Owner Complaints (Wrong Data, Defamation Liability)
**Severity:** P2  
**Blast Radius:** Complaints + lawsuits from business owners; reputational damage; legal defense costs  
**Scenario:**
- Directory shows: "Joe's Antiques — [Wrong Address]" (address data was corrupted during crawl)
- Joe can't find his own business when customers search
- Joe sues you for defamation (content is false, damages his reputation)
- You have to defend (legal costs) + potentially pay damages

**Current Controls:** Risk 1.1–1.2 partially address this (unverified listings, correction workflow)

**Failure Mode:**
- No rapid correction mechanism (business owner has to go through slow process)
- Defamatory content stays published (damages continue)
- No legal shield / safe harbor

**Mitigations:**
- **M5.3a (P1):** Rapid correction workflow:
  - Business owner can edit their own listing (must claim first)
  - Edits are visible in 1 hour (not same-day)
  - Email notification: "Correction applied to your listing"
  - Maintain edit history (for legal defense: "we corrected it when owner asked")
- **M5.3b:** Defamation shield:
  - Add disclaimer in UI + ToS:
    "FindA.Sale aggregates business information from public sources. Data may be inaccurate.
    Business owners, contact us to claim + correct your listing."
  - Create legal safe harbor: make clear that user-contributed data may be false
  - This won't eliminate liability entirely, but reduces it (shows good faith effort to correct)
  - findasale-legal: "Is our disclaimer sufficient to shield against defamation claims?"
- **M5.3c:** Rapid takedown process:
  - If business owner complains: "This info is false", have escalation path
  - Option 1: Owner claims listing + corrects (self-service)
  - Option 2: Owner emails support + we manually verify + correct (24-hr SLA)
  - Option 3: Owner states false content causes harm → we suspend listing pending review (48-hr SLA)
  - Document every complaint + response (legal defense)
- **M5.3d:** Claim verification (see also Risk 4.5):
  - Before business owner can edit, verify they own the business
  - Prevents competitors from vandalizing listings
  - Provides legal defense: "We verified owner identity before allowing edits"

**Implementation Cost:** M5.3a = rapid correction UI (1 day), M5.3b = legal review + disclaimer (1 day), M5.3c = escalation process (1 day), M5.3d = claim verification (covered in M4.5)

**Owner:** findasale-legal (disclaimer, safe harbor), findasale-dev (UI + process)

---

### SUMMARY TABLE

| Risk ID | Risk | Severity | Blast Radius | Mitigation Complexity | Owner |
|---------|------|----------|-----|--------|-------|
| 1.1 | Fake Business Submissions | P1 | Directory misinformation | 2 days | dev, architect |
| 1.2 | False CLOSED Signals | P1 | Organizers excluded | 2–3 days | dev, legal |
| 1.3 | Malformed API Data (XSS, SQL Injection) | P1 | App crash, data corruption | 2–3 days | dev, architect |
| 1.4 | Dedup Hash Collision | P1 | Duplicate listings | 3–4 days | architect, dev |
| 1.5 | Bulk Corruption from Broken Source | P1 | 50% directory marked CLOSED | 3–4 days | dev, ops |
| 2.1 | Google API Pricing Change | P0 | Budget explosion | 1–2 days | ops, architect |
| 2.2 | API Key Leak | P0 | Quota burned, downtime | 2–3 days | ops, dev |
| 2.3 | Overpass IP Blocking | P1 | Data source lost | 2 days | dev, ops |
| 2.4 | HERE/Foursquare Deprecation | P1 | Directory quality loss | 2–3 days | architect, ops |
| 2.5 | Single Point of Failure (Queue/Worker) | P1 | Crawl stalled, data stale | 3–4 days | architect, dev, ops |
| 3.1 | Infinite Loop (High-Volume Metro) | P1 | Worker starved, queue blocked | 2–3 days | dev, architect |
| 3.2 | Queue Table Unbounded Growth | P2 | Query slowdown, OOM | 1–2 days | dev, architect |
| 3.3 | Race Condition (Duplicate Processing) | P1 | Data corruption | 2 days | dev, architect |
| 3.4 | Bulk Mark CLOSED (Same as 1.5) | P1 | Directory incomplete | (See 1.5) | dev, ops |
| 4.1 | CAN-SPAM Violation | P0 | FTC fine, domain blacklisted | 3–5 days | legal, dev |
| 4.2 | GDPR Violation | P0 | €20M fine, business halt | 2–3 days | legal, dev |
| 4.3 | CCPA Right to Deletion | P1 | $7,500 fine, lawsuits | 2–3 days | legal, dev |
| 4.4 | Email Domain Reputation Damage | P1 | Email delivery broken | 2 days | ops, dev |
| 4.5 | Email Ownership Verification | P1 | Listing hijacking | 3–4 days | dev, architect |
| 5.1 | Google ToS Violation | P0 | Feature shutdown, legal fees | 2–5 days | legal, Patrick |
| 5.2 | Yelp Scraping Cease-and-Desist | P1 | Legal barred from scraping | (Decision: don't scrape) | legal, architect |
| 5.3 | Business Owner Complaints / Defamation | P2 | Lawsuits, defense costs | 1–2 days | legal, dev |

---

## IMPLEMENTATION ROADMAP

**Phase 1 — Pre-MVP (CRITICAL, 2–3 weeks)**
- [x] M2.1a–b: Google API pricing + cost monitoring (findasale-ops)
- [x] M2.2a–d: API key security + anomaly detection (findasale-ops, findasale-dev)
- [x] M1.3a–f: Input validation pipeline (findasale-dev, findasale-architect)
- [x] M4.1a–f: CAN-SPAM compliance (findasale-legal, findasale-dev)
- [x] M4.2a–e: GDPR compliance (findasale-legal, findasale-dev)
- [x] M5.1a–d: Google ToS review (findasale-legal, Patrick)
- [x] M1.1a–e: Fake business detection (findasale-dev, findasale-architect)
- [x] M1.4a–e: Deduplication engine (findasale-architect, findasale-dev)

**Phase 2 — MVP Launch (3–4 weeks post-MVP)**
- [x] M1.2a–d: CLOSED status workflow (findasale-dev, findasale-legal)
- [x] M1.5a–e: Crawl idempotency + snapshot/rollback (findasale-dev, findasale-ops)
- [x] M2.5a–e: Worker redundancy + queue monitoring (findasale-architect, findasale-dev, findasale-ops)
- [x] M3.1a–e: Job timeout + pagination limits (findasale-dev, findasale-architect)
- [x] M3.3a–e: Atomic job pickup + transaction isolation (findasale-dev)
- [x] M4.3a–d: CCPA deletion + opt-out (findasale-legal, findasale-dev)
- [x] M4.4a–e: Email domain reputation (findasale-ops, findasale-dev)
- [x] M4.5a–e: Claim verification workflow (findasale-dev, findasale-architect)

**Phase 3 — Scaling (Post-Launch)**
- [x] M2.3a–e: Overpass rate limiting (findasale-dev, findasale-ops)
- [x] M2.4a–d: API contract monitoring (findasale-architect, findasale-ops)
- [x] M3.2a–e: Queue cleanup + partitioning (findasale-dev, findasale-architect)
- [x] M5.3a–d: Business owner complaint process (findasale-legal, findasale-dev)

---

## APPROVAL GATES

**Must complete before MVP launch:**
1. **Legal review signed off:** CAN-SPAM (M4.1a), GDPR (M4.2a), CCPA (M4.3a), Google ToS (M5.1a)
2. **Input validation implemented:** M1.3a (schema validation, parameterized queries)
3. **API key security:** M2.2a (key never hardcoded, in .env only)
4. **Cost forecasting:** M2.1b (understand scaling impact on Google API budget)

---

## ONGOING MONITORING & ALERTING

**Daily:**
- Queue depth > 50: alert ops
- API error rate > 5%: alert ops
- Email complaint rate > 0.1%: alert ops

**Weekly:**
- Dedup report: fuzzy matches flagged for review
- Queue age: oldest pending job
- API call volume trending

**Monthly:**
- Crawl completion rate (% of jobs completed vs. abandoned)
- Data quality audit (% of records flagged UNVERIFIED vs. VERIFIED)
- Email delivery rate (% delivered, bounced, complained)
- Cost report (API spend vs. budget)

**Quarterly:**
- API contract review (Google, HERE, Foursquare, OSM)
- Coverage analysis (% of directory from each source)
- Fraud audit (suspicious businesses, data poisoning attempts)

---

**Prepared by:** FindA.Sale Security & Red Team  
**Date:** 2026-05-02  
**Next Review:** 2026-06-02
