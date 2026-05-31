# Security Breach Notification Plan — FindA.Sale

**Version:** 1.0  
**Effective:** 2026-05-31  
**Owner:** Operations / Engineering  

---

## Detection Sources

Monitor all of the following for security incidents:

| Source | What It Detects | Where to Check |
|---|---|---|
| Sentry | App exceptions, suspicious error spikes | sentry.io → findasale project |
| GitGuardian | Secret/credential leaks in commits | GitGuardian dashboard or email alerts |
| Vercel | Deployment anomalies, security alerts | vercel.com → project → Security tab |
| Railway | Backend crash loops, unusual DB activity | Railway dashboard → service logs |
| User reports | Phishing, unauthorized account access | support@finda.sale |
| Stripe | Suspicious payout patterns, account takeover | Stripe Dashboard → Radar |

---

## Severity Classification

### P0 — Critical (Immediate Response)
- Confirmed breach with PII exposed (names, emails, addresses, payment data)
- Active system compromise (unauthorized admin access, data exfiltration in progress)
- Credentials or secrets leaked to a public repository
- **Target:** Notify affected users within 72 hours of confirmation

### P1 — High (Respond within 4 hours)
- Suspected breach under active investigation (not yet confirmed)
- Credentials exposed in a private repo or internal system (not yet public)
- Mass account login anomalies suggesting credential stuffing

### P2 — Medium (Respond within 24 hours)
- Non-PII data exposed (e.g., listing metadata scraped at scale)
- Automated scraping detected consuming significant resources
- Single account takeover, isolated to one user

### P3 — Low (Respond within 7 days)
- Minor config file exposure with no user data risk
- Deprecated API endpoint probed but not successfully exploited
- Internal doc containing non-sensitive data publicly accessible

---

## P0 Response Procedure

### Immediate (Hour 0–1)

1. **Rotate all exposed credentials immediately:**
   - Railway environment variables (DATABASE_URL, JWT_SECRET, all API keys)
   - Stripe API keys (Stripe Dashboard → Developers → API Keys → Roll key)
   - Cloudinary API secret (Cloudinary Console → Settings → Security)
   - Resend API key (Resend Dashboard → API Keys)
   - Anthropic API key (Anthropic Console → API Keys)
   - Any other keys referenced in Railway environment or .env files
   
2. **Preserve evidence before rotating/deleting anything:**
   - Export Railway logs: Railway Dashboard → service → Logs → download or screenshot
   - Export Sentry events for the relevant time window
   - Save GitGuardian alert details (which file, which commit, when first exposed)
   - Do not delete the offending commit — preserve it for scope analysis

3. **Take affected systems offline if necessary:**
   - If the backend is actively compromised, redeploy from a clean commit via Railway
   - If database credentials are exposed, force Railway to regenerate the DB password (Railway Dashboard → PostgreSQL → Settings → Rotate Password) — this will require updating all environment variables

### Scope Assessment (Hour 1–4)

4. **Identify affected users:**
   - Which user records are in the exposed dataset?
   - What data fields were exposed (email, name, phone, address, hashed password)?
   - Was payment data exposed? (If yes: full Stripe incident protocol, notify Stripe immediately)
   - When did the exposure begin? (Check git history / log timestamps)

5. **Document the incident:**
   - What was exposed
   - How it was discovered
   - Time window of exposure
   - Number of affected users
   - Steps taken to contain it

### User Notification (Within 72 Hours of Confirmation)

6. **Draft and send notification email to affected users:**

---

**Subject:** Important Security Notice from FindA.Sale

Dear [Name],

We are writing to inform you of a security incident that may have affected your FindA.Sale account.

**What happened:** [Clear, plain-language description of what occurred. Example: "On [date], we discovered that a configuration error briefly exposed account information to unauthorized access."]

**What information may have been exposed:** [List specific fields — e.g., name, email address. Be precise. Do not overstate or understate.]

**What we have done:**
- [Action 1 — e.g., Immediately closed the exposure]
- [Action 2 — e.g., Rotated all system credentials]
- [Action 3 — e.g., Engaged security review]

**What we recommend you do:**
- Change your FindA.Sale password at finda.sale/settings
- If you used the same password elsewhere, change it there too
- Monitor your email for any suspicious activity
- Contact your bank if you have any concerns about payment information

For questions or concerns, contact us at support@finda.sale.

We are sorry this occurred and are committed to protecting your information.

The FindA.Sale Team  
219 E Michigan Ave, Suite F, Paw Paw, MI 49079

---

7. **Post public notice** at finda.sale/security-notice with a plain-language summary (no technical details that would help attackers)

### Regulatory Notification

8. **If 1,000+ users are affected OR sensitive financial data (SSN, full payment card) is exposed:**
   - Notify the Michigan Attorney General: michigan.gov/ag (Data Privacy → Report a Breach)
   - Michigan law (MCL 445.72) requires notification within a reasonable time — target 30 days
   - If users in EU/EEA are affected: notify relevant Data Protection Authority within 72 hours (GDPR Art. 33)

---

## P1 Response Procedure

1. Immediately rotate any credentials suspected of exposure
2. Begin scope assessment — treat as P0 until confirmed otherwise
3. Do not notify users until breach is confirmed (false alarms erode trust)
4. Reassess severity every 4 hours until resolved

---

## P2 Response Procedure

1. Log the incident with timestamp and details
2. Implement technical mitigation (rate limiting, IP blocking, endpoint takedown)
3. No user notification required unless PII is confirmed exposed
4. Document in incident log

---

## P3 Response Procedure

1. Fix the configuration or exposure
2. Log the incident
3. No notification required

---

## Post-Incident Recovery

After any P0 or P1 incident is contained:

1. **Reset affected user sessions:** Invalidate all active JWT tokens for affected users by rotating JWT_SECRET in Railway environment (this logs out all users — use only if session compromise is suspected)

2. **Require password resets** if passwords may have been exposed:
   ```sql
   UPDATE "User" SET "forcePasswordReset" = true WHERE id IN (...affected user IDs...);
   ```
   (Requires this field to exist in schema — if it doesn't, manually email affected users to change passwords)

3. **Update finda.sale/security-notice** once the incident is resolved with a "resolved" status and date

4. **Conduct post-mortem within 7 days:**
   - Root cause
   - Detection gap (why wasn't this caught earlier?)
   - Remediation steps taken
   - Process changes to prevent recurrence

5. **Update this document** if the incident revealed a gap in this plan

---

## Incident Log Template

Maintain a simple log (spreadsheet or internal doc) — never commit to git:

| Date | Severity | Description | Users Affected | Notified | Resolved Date | Root Cause |
|---|---|---|---|---|---|---|
