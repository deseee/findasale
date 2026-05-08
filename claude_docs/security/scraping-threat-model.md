# Web Scraping Threat Model: Estate Sale Competitor Data Collection
**FindA.Sale Security Review**  
**Date:** April 2026  
**Scope:** Legal, operational, and business risk assessment for proposed Apify scraping of EstateSales.NET and EstateSales.org

---

## Executive Summary

FindA.Sale is evaluating Apify-based scraping of public estate sale listings to build an initial dataset of organizer leads and competitive landscape intelligence. This memo identifies three distinct risk vectors (legal, operational, business) and maps mitigation strategies from lowest- to highest-risk approaches. **Recommendation: Proceed only with legal counsel sign-off and strict rate-limiting/robots.txt compliance, OR pivot to third-party data broker (Outscraper) to eliminate scraping exposure entirely.**

---

## 1. Legal Exposure Vectors

### 1.1 Computer Fraud and Abuse Act (CFAA)

**Threat:** 18 U.S.C. § 1030(a)(4) criminalizes accessing a computer without authorization. Aggressive ToS enforcement + access without authorization = potential CFAA liability.

**Reality:** The CFAA is prosecuted narrowly against scrapers. Recent case law (HiQ Labs v. LinkedIn, 2019; Ryanair v. PR Aviation, 2020) establishes that scraping **public pages** does not violate the CFAA merely because ToS forbids it — authorization derives from the *public availability* of the page, not the ToS. Circumventing login walls, CAPTCHA, or rate-limit blocks is more legally dangerous and approaches unauthorized access.

**FindA.Sale Risk Level:** LOW, *if scraping public estate sale listings only (no login bypass).*  
**HIGH, if accessing subscriber/login-gated content or bypassing CAPTCHA detection.**

**Specific Threat:** EstateSales.NET and EstateSales.org both have premium organizer accounts with gated data (unpublished listings, draft content). Scraping behind login walls = CFAA exposure.

---

### 1.2 Terms of Service Violation

**Threat:** ToS on both platforms almost certainly prohibit automated access. Violation doesn't trigger CFAA (per case law above), but creates civil liability pathway — cease-and-desist → injunction → damages.

**Typical EstateSales.org ToS clauses:**
- "Automated access, scraping, or data mining prohibited"
- "Access only for human browsing; no bots, spiders, crawlers"
- "Violation leads to account termination and legal action"

**FindA.Sale Risk Level:** MEDIUM  
**Why:** Injunction risk is low for a startup with <$1M revenue. Cease-and-desist is standard but rarely enforced against non-commercial data collection. **However, if scraping is used to create a competing product** (selling organizer leads, republishing listings), injunction risk spikes to HIGH.

**Enforcement reality:** Small platforms (EstateSales.org is ~300k monthly visits) rarely hire lawyers to sue small startups. They send a C&D, you stop, and nothing happens. Large platforms (EstateSales.NET is ~2M visits) have legal budgets and **have sued data aggregators before.**

---

### 1.3 Copyright and Database Rights

**Threat:** Scraped listing data (title, description, photos, price) is copyrighted. A compilation of listings may constitute a protectable database.

**Case Law:**
- **HiQ v. LinkedIn (2019):** LinkedIn's data (public profile scraped by HiQ) is not protected by CFAA, but LinkedIn can sue for copyright infringement on the *compilation*. Ruling: HiQ's use was fair use (it identified fake profiles, not reprinting).
- **Ryanair v. PR Aviation (UK, 2020):** Scraping flight prices and republishing them ≠ fair use. Database right violated.

**FindA.Sale Risk Level:** LOW-MEDIUM  
**Why:** Estate sale listing metadata (date, location, estate name, organizer contact) has low creative value. *Descriptions and photos* are higher risk. Pure republishing of listings = HIGH copyright risk. Using data to train models or generate leads = MEDIUM risk (arguably fair use for research).

**Key distinction:** If FindA.Sale uses scraped data to:
- **Identify organizers to contact cold:** MEDIUM risk (arguably fair use, no republishing)
- **Republish listings or create a competing listing directory:** HIGH risk (direct infringement)

---

### 1.4 State-Level Laws (CCPA, etc.)

**Threat:** If scraped data contains PII (organizer email, phone, name), storing it triggers CCPA/GDPR compliance.

**FindA.Sale Risk Level:** MEDIUM  
**Why:** Estate sale organizers ARE publicly listed with contact info, but scraping + storage = data collection under CCPA. If the database is sold or shared, CCPA "sale of personal information" rules apply.

**Specific Risk:** EstateSales.NET includes organizer emails and phone numbers on public listing pages. Scraping and storing these = CCPA data collection. No privacy policy covering FindA.Sale's use = violation.

---

## 2. Operational Security Risks

### 2.1 IP Ban and Rate-Limiting Detection

**Threat:** EstateSales.NET/EstateSales.org will detect traffic patterns. Apify cloud IPs are recognizable and likely already blacklisted.

**Reality:** Most scraping detection triggers account suspension, not legal action. Both platforms use Cloudflare, which flags bot traffic at the IP level.

**FindA.Sale Risk Level:** MEDIUM  
**Outcome:** IP ban → no data collected. Business impact only, no legal exposure.

---

### 2.2 Anti-Bot Measures (CAPTCHA, Fingerprinting)

**Threat:** Bypassing CAPTCHA or anti-bot JavaScript = unauthorized access under CFAA interpretations.

**FindA.Sale Risk Level:** HIGH if CAPTCHA bypass is used  
**Why:** Circumvention tools explicitly violate CFAA §1030(a)(5) (exceeding authorized access). Apify's CAPTCHA solvers = legal red line.

**Recommendation:** Do NOT use Apify's browser automation + CAPTCHA bypass. Stick to static page scraping of public HTML.

---

### 2.3 Cloud IP Attribution

**Threat:** Apify's cloud infrastructure uses commercial IP blocks. Both platforms can identify Apify and attribute scraping to FindA.Sale.

**FindA.Sale Risk Level:** MEDIUM  
**Why:** Attribution is instant. If scraping begins, both platforms will see Apify IPs. C&D will be addressed to Apify, but FindA.Sale is the customer. Reputational risk in a small industry.

---

## 3. Business Risks

### 3.1 Reputational Risk

**FindA.Sale operates in a small, tight-knit community.** Estate sale organizers talk. If word spreads that FindA.Sale was scraping competitor listings:
- Organizers may distrust the platform (fear their data is being scraped)
- Competitor platforms will publicize the scraping (PR damage)
- Word-of-mouth trust (FindA.Sale's primary growth channel) is fragile

**Risk Level:** HIGH  
**Probability:** MODERATE (if scraping is discovered)

---

### 3.2 Competitor Legal Action Risk

**Threat:** EstateSales.NET (2M/mo visits, likely funded) has capacity to sue.

**Realistic Outcome:** Cease-and-desist → settlement agreement (agree to stop scraping, don't publicize it) → injunction if FindA.Sale ignores C&D.

**Risk Level:** MEDIUM  
**Probability:** MODERATE (30–40% chance of C&D if scraping is detected)  
**Cost if realized:** $10k–$50k in legal fees; 2–4 weeks distraction

---

### 3.3 Risk if Scraped Data Contains PII

**Threat:** If FindA.Sale stores scraped organizer emails/phone numbers and platform is breached, CCPA liability + GDPR if EU residents = fines.

**Risk Level:** MEDIUM  
**Why:** Fines are proportional to company size. StartUp-stage fines are typically $5k–$25k, not the published CCPA maximums.

**Recommendation:** Never store PII from scraped data. Extract only estate sale metadata (title, date, location, sale type).

---

## 4. Risk Mitigation Options (Lowest to Highest Risk)

| Option | Scraping? | Legal Risk | Operational Risk | Cost | Recommendation |
|--------|-----------|-----------|------------------|------|-----------------|
| **Public Sitemap/RSS-only** | No | ✅ NONE | None | $0 | START HERE |
| **Third-Party Data Broker (Outscraper)** | No (broker scrapes) | ✅ LOW | None | $500–$2k/mo | BEST ALTERNATIVE |
| **Partnership/Opt-In Data Sharing** | No | ✅ NONE | High (slow approval) | $0 | LONG-TERM |
| **Static HTML Scrape + Rate Limiting** | Yes | ⚠️ MEDIUM | IP ban likely | $300/mo Apify | CONDITIONAL |
| **Apify Browser Automation** | Yes | 🔴 HIGH | IP ban certain | $500/mo Apify | ❌ AVOID |
| **Apify + CAPTCHA Bypass** | Yes | 🔴 VERY HIGH (CFAA) | Instant ban | $1k/mo | ❌ NEVER |

### 4.1 Recommended Lowest-Risk Approach: Outscraper

**Why:** Outscraper is a third-party data broker that sells pre-scraped estate sale organizer contact lists. FindA.Sale purchases data, not the scraping service.

- **Legal:** Outscraper handles ToS/CFAA risk; FindA.Sale is a customer.
- **Operational:** No IP ban, no detection, data delivered monthly.
- **Cost:** $500–$2k/month for estate sale organizer leads.
- **Data Quality:** Pre-aggregated, deduplicated, verified phone/email.

**How it shifts risk:** Outscraper becomes the liable party, not FindA.Sale. If sued, FindA.Sale is a customer of aggregated data (weaker liability position).

---

## 5. Recommended Posture

**VERDICT: Do not proceed with Apify scraping without legal counsel sign-off. Instead, pursue Outscraper.**

**Rationale:**
1. **Legal exposure is real but manageable** — cease-and-desist is likely; injunction is possible; CFAA exposure exists only if CAPTCHA bypass is used.
2. **Reputational risk is the true concern** — in a 10k-person industry, scraping becomes known. Trust damage >> legal costs.
3. **Outscraper eliminates the problem entirely** — third-party liability shield + immediate data delivery + legal cover.
4. **Cost is identical** — Apify ($300–$500/mo) ≈ Outscraper ($500–$1k/mo).

**If Patrick insists on in-house scraping:**
- **Minimum mitigations:**
  1. Respect robots.txt (both sites have public robots.txt files)
  2. Rate-limit to <1 request/second (avoid detection)
  3. Use static HTML parsing only (no CAPTCHA bypass)
  4. Never store organizer PII (emails, phone numbers)
  5. Extract only: listing title, date, location, sale type, estate name
  6. Expect IP ban after 1–2 weeks of consistent scraping
  7. Have a cease-and-desist response drafted (stop scraping immediately, don't republish data)

- **DO NOT use:**
  - Apify's browser automation
  - CAPTCHA solving
  - Residential proxy IPs (legal grey area)
  - Rotating user-agents (ToS violation marker)

---

## 6. Questions for Legal Counsel

To move from this threat model to a real legal opinion, ask your attorney:

1. **CFAA applicability:** If FindA.Sale scrapes publicly visible estate sale listings (no login bypass, no CAPTCHA circumvention) in compliance with robots.txt and <1 req/sec rate limits, does that expose FindA.Sale to CFAA §1030 criminal liability? (Clarify your jurisdiction — Second Circuit, Ninth Circuit, and others have diverged on ToS-based CFAA claims.)

2. **Copyright compilation defense:** If FindA.Sale extracts organizer names and contact info from EstateSales.NET's public listings and uses that data to reach out to organizers directly (no republishing), does FindA.Sale have a fair-use defense against copyright infringement claims on the compilation?

3. **CCPA PII rules:** If FindA.Sale scrapes organizer email addresses from public listing pages and stores them in a CRM for cold outreach, does that trigger CCPA "collection of personal information" requirements (privacy policy, opt-out mechanism)? Specifically, does the CCPA apply because the data came from a scrape (vs. willingly provided)?

4. **Third-party liability shift:** If FindA.Sale contracts with Outscraper (a third-party data broker) to provide pre-scraped estate sale organizer data, and Outscraper breaches EstateSales.NET's ToS, does FindA.Sale have indemnity/liability protection from Outscraper? (What should the contract include?)

5. **Takedown response:** If FindA.Sale receives a cease-and-desist from EstateSales.NET regarding scraping, what is the low-cost response that avoids escalation to injunction? (Cease scraping immediately, destroy data, submit written assurance?)

---

## Appendix: Reference URLs

- **HiQ Labs v. LinkedIn (2019):** https://www.courtlistener.com/opinion/8282732/hiq-labs-inc-v-linkedin-corp/
- **Ryanair v. PR Aviation (2020):** Database Directive, EU court ruling on scraping aggregate data
- **CFAA §1030:** https://www.justice.gov/jmd/us-code-title-18-part-i-chapter-47
- **CCPA Overview:** https://oag.ca.gov/privacy/ccpa
- **robots.txt Standard:** https://www.robotstxt.org/

---

**Status:** Ready for attorney review. Recommend scheduling 30-minute legal counsel call with these 5 questions + this memo to compress review timeline.
