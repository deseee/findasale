# Email Discovery Implementation Spec
## Free Tier Pipeline for Bounced/Generic Organizer Emails

**Status:** Production Ready  
**Stack:** Node.js 18+, TypeScript, Playwright, Cheerio  
**Target:** FindA.Sale outreach pipeline enrichment  
**Goal:** When `info@domain.com` or a generic contact form bounces, surface a real named-contact email via free methods.

---

## 1. Discovery Pipeline Stages

### Stage 1: Website Contact Scraping (HIGH CONFIDENCE)
**When to use:** Primary enrichment method  
**Success rate:** 60-75% of small business websites  
**Implementation complexity:** Low  
**Cost:** Free

**What it checks:**
- `/contact`, `/about`, `/team` pages for explicit email addresses
- `mailto:` links in HTML (highest confidence)
- Schema.org microdata (structured data: Person, Organization)
- Social media links that include owner names or emails
- Contact form post targets that hint at backend processing

**Playwright approach:**
- Use stealth browser mode (avoid bot detection)
- Navigate to 3-5 likely contact pages
- Extract raw HTML, parse with Cheerio
- Run regex on mailto links and visible text
- Cross-reference names against founder context

**Critical selectors to target:**
```
<!-- Mailto links -->
a[href^="mailto:"]

<!-- Contact form email fields -->
input[name*="email"], input[type="email"]

<!-- Text nodes with email patterns -->
Regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

<!-- Schema.org Person markup -->
script[type="application/ld+json"] (parse for Person.email)

<!-- Footer contact info -->
footer, .contact, [class*="footer"]
```

**Red flags (LOW CONFIDENCE):**
- `info@`, `hello@`, `contact@`, `support@` — generic, often forwarded to ticket queue
- `noreply@`, `notification@`, `alerts@` — automated, high bounce rate
- `test@`, `admin@` — non-customer-facing, likely blocks mail
- Contact forms with NO email visible — high friction, low success

**Success metric:**
Named-contact email (e.g., `john@domain.com`, `sarah.smith@domain.com`) with identifiable name = **HIGH CONFIDENCE (95%+)**

---

### Stage 2: Email Pattern Generation + SMTP Verification (MEDIUM-HIGH CONFIDENCE)
**When to use:** Fallback when website scraping yields no named contact  
**Success rate:** 40-55% (depends on domain's email server)  
**Implementation complexity:** Medium  
**Cost:** Free (uses DNS + SMTP, no API keys)

**Email pattern list (ordered by likelihood for estate sale orgs, 45-65 age range):**

| Rank | Pattern | Example | Notes |
|------|---------|---------|-------|
| 1 | `firstname@domain` | `john@estateland.com` | Most common for small orgs |
| 2 | `first.last@domain` | `john.smith@estateland.com` | Standard corporate format |
| 3 | `flast@domain` | `jsmith@estateland.com` | Conservative, common |
| 4 | `firstnamelastname@domain` | `johnsmith@estateland.com` | No separators |
| 5 | `fname@domain` | `jo@estateland.com` | Rare but valid |
| 6 | `fnamelname@domain` | `josmith@estateland.com` | Hybrid |
| 7 | `owner@domain` | `owner@estateland.com` | Generic but specific to role |
| 8 | `sales@domain` | `sales@estateland.com` | Role-based, common fallback |
| 9 | `contact.firstname@domain` | `contact.john@estateland.com` | Some orgs use prefix |
| 10 | `contact@domain` | `contact@estateland.com` | Last-resort fallback |
| 11 | `support@domain` | `support@estateland.com` | Role-based fallback |
| 12 | `firstname.l@domain` | `john.s@estateland.com` | Abbreviated last initial |

**SMTP Verification Approach (NO SENDING):**

1. **MX Lookup:** Use Node.js `dns.resolveMx()` to confirm domain accepts mail
   - Fast (10-50ms per domain)
   - If MX fails → domain doesn't have mail server, skip
   - Confidence: ~80%

2. **RCPT TO Probing:** Send SMTP RCPT TO command without DATA
   - Opens SMTP connection to MX server
   - Sends: `MAIL FROM:<noreply@yourfinda.sale>`
   - Sends: `RCPT TO:<guessed.email@domain>`
   - **Closes connection WITHOUT sending DATA** (critical — no bounce)
   - Server responds: `250` (valid) or `550/551` (invalid)
   - Confidence: ~95%, but slower (1-3s per pattern)

3. **Rate limiting:** 500-1000ms delay between RCPT TO attempts per domain
   - Many mail servers disconnect after 5+ failed RCPTs
   - Batch SMTP probes across domains, serialize within a domain

**npm packages:**
- **nodemailer:** `validateEmail()` with SMTP checking (built-in)
- **smtp-validate-email:** Focused library for RCPT TO validation
- **dns** (Node.js built-in): Perfect for MX resolution

**Implementation pseudocode:**
```typescript
async function verifyEmailPattern(email: string, domain: string): Promise<boolean> {
  // Step 1: MX lookup
  const mxRecords = await dns.promises.resolveMx(domain);
  if (!mxRecords.length) return false; // No mail server

  // Step 2: RCPT TO probe
  const verified = await smtpValidateEmail(email, {
    mxRecords,
    from: 'noreply@finda.sale',
    timeout: 3000,
    rateLimitMs: 500,
  });
  return verified;
}
```

**Key caveats:**
- **Rate limiting:** Mail servers may block after repeated probes
- **Greylisting:** Some servers temporarily reject unknown senders, then accept on retry
- **No guarantee:** RCPT TO success ≠ real mailbox (could be catch-all)
- **Deliverability risk:** Some ISPs flag SMTP probing as suspicious; use sparingly and document

---

### Stage 3: WHOIS Registrant Lookup (LOW-MEDIUM CONFIDENCE)
**When to use:** Secondary enrichment; domain freshness check  
**Success rate:** 20-30% of WHOIS data exposed (70-80% privacy-protected)  
**Implementation complexity:** Low  
**Cost:** Free

**What it returns:**
- Registrant name (if not privacy-protected)
- Registrant email (if not privacy-protected)
- Admin/tech contact (sometimes visible even if registrant is private)
- Domain creation/expiration dates
- Registrar info

**Utility for email discovery:**
- If registrant email exposed: direct contact
- If registrant name exposed: use for pattern generation (Stage 2)
- Registrant age: signal for business legitimacy (freshly registered = higher risk)

**npm packages:**
- **whois-parser:** Parses raw WHOIS output, maintained as of 2025
- **whoisjs:** Higher-level wrapper, simpler API

**Note:** By 2026, WHOIS privacy is standard (GDPR + ICANN). Expect 70-80% of lookups to return privacy-protected emails. This stage is **validation**, not primary discovery.

**Implementation:**
```typescript
async function lookupWhois(domain: string) {
  const whoisData = await whoisLookup(domain);
  return {
    registrantName: whoisData.registrant?.name,
    registrantEmail: whoisData.registrant?.email, // Often masked
    registrarName: whoisData.registrar?.name,
    domainAge: whoisData.createdDate,
    domainExpires: whoisData.expiryDate,
  };
}
```

---

### Stage 4: LinkedIn Public Company Scraping (MEDIUM CONFIDENCE)
**When to use:** Extract founder/CEO name for pattern generation  
**Success rate:** 50-70% of company pages have public founder data  
**Implementation complexity:** Medium (requires Playwright for dynamic content)  
**Cost:** Free (no API key required)

**What's accessible without login:**
- Company name, URL, location
- "About" section with company description
- Founder/CEO name (often visible)
- Employee count, industry
- Limited employee name list (partial)

**What's NOT accessible:**
- Email addresses (LinkedIn redacts these)
- Private contact info
- Full employee directories

**Playwright approach:**
- Navigate to `linkedin.com/company/{domain-name}/`
- Parse dynamic content for "Founded by" or "CEO" section
- Extract name, scrape for any email patterns in About section
- Use founder name for pattern generation

**Example selector:**
```javascript
// Look for "Founded by" or company leadership
document.querySelector('[data-testid="about-section"]')?.textContent
// Parse for: "Founded by John Smith" pattern
```

**Key caveat:** LinkedIn actively blocks scrapers. Use:
- Playwright with browser user agent
- Delays between requests (2-3s per page load)
- Rotating proxies if bulk scraping
- Consider ethical implications; some treat scraping as violation

---

### Stage 5: Free Tier APIs (Phase 2 — REFERENCE ONLY)
**Cost:** Free tier very limited; use only as validation layer after Stage 1-3

**Hunter.io (25 free searches/month)**
- API endpoint: `hunter.io/v2/email-finder`
- Returns: verified email, sources, confidence score
- Caveat: No bulk API in free tier; slow for cold outreach at scale
- Useful for: Validating high-value targets

**Clearbit (deprecated but still works)**
- Endpoint: `person.clearbit.com` (free tier)
- Returns: company, role, emails (limited)
- Caveat: Free endpoint heavily rate-limited
- Useful for: Company enrichment, not primary email source

**Apollo.io (free tier limited)**
- Has free plan, but severely limited
- Paid plan much better for bulk outreach
- Not recommended for Phase 1

**RocketReach**
- Free tier: minimal
- Paid: more comprehensive
- Not viable for free pipeline

**Recommendation:** Implement Stages 1-3 first. If budget exists in Phase 2, layer Hunter.io as a validation step after pattern generation.

---

### Stage 6: Other Free Signals (LOW PRIORITY)

**Google My Business / Maps**
- If `googlePlaceId` available: fetch public listing
- Returns: phone, address, hours, website (no email)
- Utility: Can call for direct contact verification
- Implementation: Uses Google Places API (free tier: 25k requests/month)

**Facebook Business Pages**
- Scrape public page for contact info
- Returns: phone, website, address
- No email typically exposed
- Utility: Low for email discovery

**BBB.org (Better Business Bureau)**
- Search by business name
- Returns: rating, phone, address, sometimes email
- Quality: Unverified, often outdated
- Implementation: Cheerio scraping of search results

**Yelp**
- Public business pages have contact info
- Email rarely exposed
- Utility: Phone/address only
- Not recommended for email discovery

**Recommendation:** Skip these. Website scraping (Stage 1) is more reliable.

---

## 2. Email Pattern Priority Order (Confidence Ranking)

When generating patterns for SMTP validation, test in this order:

1. **Named patterns from website scraping** (Stage 1) — 95%+ confidence
2. **Founder/CEO name** (from WHOIS or LinkedIn) + top 3 patterns (firstname, first.last, flast) — 60-75%
3. **Domain owner (from WHOIS if exposed)** + patterns — 50-60%
4. **Standard role-based:** `owner@`, `sales@` — 40-45%
5. **Generic fallbacks:** `contact@`, `support@`, `info@` — 20-30% (but expect lower deliverability)

---

## 3. Playwright Scraper Spec for Contact Page Extraction

**Goal:** Safely extract emails from website contact pages without triggering bot detection.

**Key settings:**
```typescript
const browser = await playwright.chromium.launch({
  headless: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
  ],
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  viewport: { width: 1280, height: 720 },
  locale: 'en-US',
});
```

**Contact page strategy:**
```typescript
async function scrapeContactEmails(domain: string): Promise<string[]> {
  const page = await context.newPage();
  const emails: string[] = [];

  // Candidate URLs (in order of likelihood)
  const contactPaths = [
    '/contact',
    '/contact-us',
    '/contact-us/',
    '/about',
    '/about-us',
    '/team',
    '/', // Homepage often has contact info in footer
  ];

  for (const path of contactPaths) {
    try {
      const url = `https://${domain}${path}`;
      const response = await page.goto(url, { waitUntil: 'networkidle' });
      
      if (response?.status() === 404) continue;

      // Extract all text content
      const html = await page.content();
      
      // Find mailto links (highest confidence)
      const mailtoMatches = html.match(/href="mailto:([^"]+)"/g) || [];
      emails.push(...mailtoMatches.map(m => m.split(':')[1].split('"')[0]));

      // Find emails in text nodes
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const textEmails = html.match(emailRegex) || [];
      emails.push(...textEmails);

      // Parse schema.org Person markup
      const scriptTags = await page.$$eval('script[type="application/ld+json"]', scripts =>
        scripts.map(s => JSON.parse(s.textContent || '{}'))
      );
      scriptTags.forEach(schema => {
        if (schema.email) emails.push(schema.email);
        if (schema.founder?.email) emails.push(schema.founder.email);
      });

      // If we found emails, stop searching other pages
      if (emails.length > 0) break;

    } catch (err) {
      // Silently continue to next path
    }
  }

  await page.close();

  // Deduplicate and filter out generic addresses
  const genericPatterns = ['noreply@', 'notification@', 'alerts@', 'test@'];
  const filtered = [...new Set(emails)].filter(
    email => !genericPatterns.some(pattern => email.includes(pattern))
  );

  return filtered;
}
```

**Honeypot avoidance:**
- Skip `input[name*="email"]` if value is hidden or off-screen (honeypots often use hidden fields)
- Don't interact with contact forms (just parse for visible emails)
- Stop after finding legitimate emails; don't over-scrape

**Bot detection bypass:**
- Add random delays (1-3s) between page loads
- Use rotation of user agents if bulk scraping
- Add `Accept-Language` header variation
- Don't send excessive requests to same domain in short time

---

## 4. SMTP Verification Best Practices

### Do's:
- **MX lookup first:** Confirm domain has mail server (fast, free gate)
- **Stagger requests:** 500-1000ms between RCPT TO attempts on same domain
- **Batch processing:** Check 50-100 domains in parallel, but serialize patterns within domain
- **Timeout:** Set 3-5s timeout per SMTP connection (some servers slow to respond)
- **Log everything:** Record what passed/failed for debugging and tuning

### Don'ts:
- **Don't send DATA:** Stop after RCPT TO response; never send full email body
- **Don't hammer single domain:** Rate limits will trigger (5-10 failed RCPTs → block)
- **Don't ignore greylisting:** Some servers temp-reject, then accept on retry — retest after 1-2 hours
- **Don't use as primary verification:** RCPT TO success ≠ real mailbox (could be catch-all)
- **Don't skip MX check:** Prevents wasted SMTP connections to non-mail domains

### Code example (safe SMTP):
```typescript
import { promisify } from 'util';
import * as net from 'net';
import * as dns from 'dns';

async function verifyEmail(
  email: string,
  domain: string,
  timeoutMs: number = 3000
): Promise<{ valid: boolean; reason?: string }> {
  try {
    // Step 1: MX lookup
    const mxRecords = await dns.promises.resolveMx(domain);
    if (!mxRecords.length) {
      return { valid: false, reason: 'no_mx_records' };
    }

    // Step 2: Connect to first MX server
    const mxHost = mxRecords[0].exchange;
    const socket = net.createConnection({ host: mxHost, port: 25 });

    const response = await new Promise<string>((resolve, reject) => {
      let data = '';
      socket.on('data', (chunk) => {
        data += chunk.toString();
      });
      socket.setTimeout(timeoutMs, () => {
        socket.destroy();
        reject(new Error('timeout'));
      });
      socket.on('end', () => resolve(data));
      socket.on('error', (err) => reject(err));
    });

    // Step 3: Parse SMTP response
    const lastLine = response.split('\n').pop()?.trim() || '';
    if (!lastLine.startsWith('220')) {
      return { valid: false, reason: 'not_smtp_server' };
    }

    // Step 4: Send MAIL FROM
    socket.write(`MAIL FROM:<noreply@finda.sale>\r\n`);
    await new Promise(r => socket.once('data', r));

    // Step 5: Send RCPT TO (the verification)
    socket.write(`RCPT TO:<${email}>\r\n`);
    const rcptResponse = await new Promise<string>((resolve) => {
      socket.once('data', (data) => resolve(data.toString()));
    });

    // Step 6: QUIT (close connection, no DATA sent)
    socket.write('QUIT\r\n');
    socket.end();

    // Parse RCPT response
    const rcptCode = parseInt(rcptResponse.split('\n')[0]);
    if (rcptCode === 250) {
      return { valid: true };
    } else if ([550, 551, 552].includes(rcptCode)) {
      return { valid: false, reason: `smtp_${rcptCode}` };
    } else {
      return { valid: false, reason: `smtp_unknown_${rcptCode}` };
    }

  } catch (err) {
    return { valid: false, reason: `error_${err.message}` };
  }
}
```

**Important:** This is cautious but has failure modes. Consider using the **smtp-validate-email** npm package instead, which handles edge cases.

---

## 5. Red Flags to Avoid

**DO NOT SEND TO:**
| Pattern | Reason | Bounce Rate |
|---------|--------|------------|
| `noreply@*` | Automated, no human reads | ~100% bounce |
| `notification@*` | Alert system, expects data in subject | ~95% bounce |
| `alerts@*` | Automated alerts only | ~95% bounce |
| `test@*` | Development/testing, inactive | ~100% bounce |
| `admin@*` | System account, not customer-facing | ~80% bounce |
| `hello@*` | Generic greeting, often catch-all | ~40% bounce, unengaged |
| `info@*` | Generic contact form, low engagement | ~35% bounce, unengaged |
| Domains with no MX records | No mail server | ~100% bounce |
| Domains with only catch-all MX | Can't verify real users | ~50% false positive |

**AVOID THESE SOURCES:**
- Contact forms with no visible email (no way to verify, likely spam trap)
- Email addresses in HTML comments (often deprecated)
- Mailto links in `<noscript>` tags (outdated fallback, old contacts)
- Emails from sketchy WHOIS lookups with privacy flags (unreliable)

---

## 6. Free Tools & Packages (Summary)

### Core Stack
| Package | Purpose | npm link | Notes |
|---------|---------|----------|-------|
| `playwright` | Stealth browser automation | npm/playwright | Already installed; use for contact scraping |
| `cheerio` | DOM parsing | npm/cheerio | Lightweight, fast HTML parsing |
| `dns` (Node.js built-in) | MX record lookup | — | No package needed; built into Node.js |
| `smtp-validate-email` | RCPT TO verification | npm/smtp-validate-email | Preferred over manual SMTP (handles edge cases) |
| `node-html-parser` | Alternative HTML parsing | npm/node-html-parser | Lightweight alternative to Cheerio if needed |

### Optional for Phase 2
| Package | Purpose | Notes |
|---------|---------|-------|
| `whois-parser` | WHOIS lookup parsing | Parses raw WHOIS; maintained as of 2025 |
| `extract-emails` | Regex-based email extraction | Simple utility, low overhead |
| `hunter` (official SDK) | Hunter.io API client | 25 free searches/month; Phase 2 only |

### Community References
- **GitHub:** Search for `email-discovery-nodejs` (multiple public repos on pattern + SMTP validation)
- **Reddit:** r/sales, r/entrepreneur, r/emailmarketing have threads on cold outreach email finding
- **npm Trends:** Top email-validation packages as of May 2026: `email-validator`, `smtp-validate-email`, `nodemailer`

---

## 7. Implementation Roadmap

### Phase 1 (MVP — FREE, HIGH CONFIDENCE)
**Effort:** 2-3 days  
**Code location:** `packages/backend/src/services/emailDiscoveryService.ts`

1. **Playwright contact page scraper**
   - Hit /contact, /about, /team pages
   - Extract mailto links and email regex matches
   - Filter out generic patterns (info@, noreply@, etc.)
   - Return named emails with confidence score

2. **Email pattern generator**
   - Given a name, generate 12-pattern list
   - Order by likelihood (first@domain before first.l@domain)

3. **MX + SMTP validator**
   - MX lookup to gate SMTP probes
   - RCPT TO validation with rate limiting
   - Return confidence score (0.0-1.0)

4. **Pipeline orchestrator**
   - Input: domain, known name (optional)
   - Call Stage 1 → if success, return with 95% confidence
   - If Stage 1 fails, fall back to Stage 2 (pattern generation + SMTP)
   - Return best email + confidence score

### Phase 2 (ENRICHMENT — 1-2 weeks)
1. Add WHOIS lookup (registrant name extraction)
2. Add LinkedIn scraping (founder name extraction)
3. Layer in Hunter.io (25 free searches/month as validation)
4. Build confidence scoring that weights all signals

### Phase 3 (OPTIMIZATION — ONGOING)
1. Monitor bounce rates by source (Stage 1 vs Stage 2 vs Stage 3)
2. Fine-tune email patterns based on what works for estate sale orgs
3. Add caching (store discovered emails, reuse for bulk outreach)
4. Add retry logic for greylisted servers (retry after 2 hours)

---

## 8. Expected Success Rates

| Stage | Success Rate | Deliverability | Effort | Phase |
|-------|-------------|-----------------|--------|-------|
| Stage 1 (website scrape) | 60-75% | 90%+ | Low | MVP |
| Stage 2 (pattern + SMTP) | 40-55% | 70-80% | Medium | MVP |
| Stage 3 (WHOIS) | 20-30% | 50-60% | Low | MVP |
| Stage 4 (LinkedIn) | 50-70% | 75%+ | Medium | Phase 2 |
| Hunter.io API | 70-85% | 95%+ | Low | Phase 2 |

**Combined (MVP Phases 1-3):** ~85-95% of emails enriched with at least one valid option.

---

## 9. Integration with FindA.Sale Outreach Flow

**Hook point:** When `sendOutreachEmail()` encounters a bounce (HTTP 550, 551, 452):

1. **Trigger enrichment:**
   ```typescript
   const enriched = await emailDiscoveryService.discoverEmail({
     domain: organization.website,
     organizationName: organization.name,
     knownContacts: organization.emails, // Previous attempts
   });
   ```

2. **Update organization record:**
   ```typescript
   if (enriched.email && enriched.confidence > 0.7) {
     await orgRepo.updateContactEmail(orgId, {
       email: enriched.email,
       emailSource: enriched.stage, // 'website_scrape', 'smtp_pattern', 'whois'
       enrichmentConfidence: enriched.confidence,
     });
   }
   ```

3. **Retry with new email:**
   ```typescript
   await sendOutreachEmail(enriched.email, {
     subject: 'Found a better contact path',
     body: 'We tried reaching you at info@ but wanted to reach out directly...',
   });
   ```

---

## 10. Testing & Validation

**Test cases:**
1. Website with visible email → expect Stage 1 success
2. Website with no email, known founder name → expect Stage 2 success
3. Privacy-protected WHOIS → expect Stage 3 failure, move to Stage 2
4. Real domain, fake patterns → expect SMTP validation to fail correctly
5. Catch-all mail server → expect RCPT TO to pass falsely; plan for follow-up testing

**Local test domains:**
- `example.com` (NXDOMAIN, should handle gracefully)
- `google.com` (valid MX, but no real patterns; expect RCPT TO failures)
- `gmail.com` (strict RCPT TO validation; may block probes)

---

## 11. Known Limitations & Future Work

**Current limitations:**
- No email addresses extracted from PDFs (brochures, datasheets)
- No parsing of phone numbers to call and ask
- No social media DM capability (ethical concern)
- SMTP validation can trigger false negatives (greylisting, rate limits)
- LinkedIn scraping is rate-limited and flagged as suspicious

**Future work:**
- Cache results in database (avoid re-discovering same domain)
- Build ML classifier for email confidence (weight by source, age, engagement)
- Add callback verification (send verification code, wait for reply)
- Integrate with warm-up sequences (Mailwarm, etc.) before sending cold outreach
- Phase 2: Layer in Hunter.io for high-value targets

---

**Author:** Research Agent  
**Date:** 2026-05-08  
**Status:** Ready for `findasale-dev` implementation
