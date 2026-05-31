# Patrick's Dashboard — Week of May 31, 2026

---

## What Happened This Session (S815 — Ops/Tooling)

**Two things done:**

**1. Bug fixes pushed** — geocoding now correctly matches Facebook Events source names (was causing 100% geocoding failures for those sales in Sentry), and the Cloudinary cloud name on the create-sale page is now pulled from your environment variable instead of being hardcoded.

**2. Cowork global instructions bug permanently fixed** — your global instructions were silently getting overwritten by stale Cowork sessions (documented bug in GitHub #40175). The file is now set read-only at the OS level. To update global instructions going forward:
1. Edit `C:\Users\desee\AppData\Roaming\Claude\CLAUDE_MASTER.md`
2. Run: `.\scripts\sync-global-instructions.ps1 -Update -Master "C:\Users\desee\AppData\Roaming\Claude\CLAUDE_MASTER.md"`
3. Restart open Cowork sessions

---

## Your Actions (carried from S814)

1. **Verify Google Business Profile** — business.google.com → "Verify now" → phone verification. 2 minutes.
2. **Business insurance** — nextinsurance.com or your business bank. ~$500-1,500/yr.
3. **#239 consignor payouts** — blocked on attorney + CPA answers before live money flows.
4. **#463 Google Merchant** — check if Google approved ~52 products (3-day review).

---

## What Happened Last Session (S814 — Table Stakes Audit)

**The short version: we audited everything a real business needs and either built it or set it up. GA4 is now live, the legal docs are solid, and FindA.Sale has a Google Business Profile.**

### What shipped

- **robots.txt** — search engines and scrapers now know which routes are private. First time FindA.Sale has had one.
- **DMCA page at /dmca** — legally required if users can upload content. Takedown procedure, counter-notice, repeat infringer policy, all done.
- **Google Analytics (GA4)** — property created, measurement ID added to Vercel, redeployed. Data starts flowing within 24-48 hours. You'll see traffic at analytics.google.com.
- **Terms of Service — 7 new sections:** refund/dispute policy (48-hour window, 7-day investigation), sales tax disclaimer (you're not collecting on their behalf), organizer fulfillment timing (24hr ack, 30-day pickup), Stripe KYC requirement, 1099-K disclosure, chargeback fee policy, DMCA reference.
- **Privacy Policy — 4 new sections:** GDPR legal basis (for EU users), data deletion timeline (30 days), breach notification promise (72 hours), transparency about auto-suggested content.
- **3 internal SOPs:** step-by-step guides for handling account deletion requests, Stripe chargebacks, and security breaches. All in claude_docs/operations/.
- **Google Business Profile** — FindA.Sale is now in Google's system as an E-commerce service in Paw Paw, MI with the finda.sale URL. Needs one more step from you (see below).

---

## Your Actions (2 required, 1 optional check)

1. **Verify Google Business Profile** — go to business.google.com, click "Verify now," enter your phone number for a verification code. Takes 2 minutes. Profile won't be visible to Google Search/Maps until this is done.

2. **Get business insurance** — this is the one gap that needs a human. Visit nextinsurance.com or call your business bank. You need cyber liability + general liability. Roughly $500-1,500/year. Every business processing payments needs this — FindA.Sale currently has zero coverage.

3. **Check GA4 in 24-48 hours** (optional) — visit analytics.google.com → FindA.Sale → Realtime report. You should see traffic.

---

## What's Still Pending (carried from S813)

- **#239 consignor payouts** — still blocked on attorney + CPA answers before live money can flow.
- **#463 Google Merchant** — check if Google approved your ~52 products (3-day review window started when you registered the feed in S808).
- **Map pins smoke test** — log into finda.sale and confirm pins show up near Paw Paw/GR (the fix shipped in S813).

---

## What Happened Last Session (S813 — eBay QA + Map Pins Fix)

**The short version: finished the eBay QA batch and fixed the root cause of the empty map.**

- **#424 Description Template ✅** — confirmed by you directly.
- **#425 Push from Review Queue ✅** — Steam Controller pushed to eBay from the review queue. "Live on eBay" badge confirmed.
- **#426 Best Offers UI ✅** — toggle renders in edit-item, auto-accept/decline fields expand correctly.
- **Map pins bug fixed** — logged-in users were getting a global unbounded query (no regional filter), pulling scraped sales from TN/NC/TX. Fixed to always apply the Grand Rapids regional bounding box for both auth states.
