# Cost Protection & Viral Spike Playbook

**Owner:** Patrick  
**Last updated:** 2026-04-15  
**Purpose:** Links and exact steps to cap costs and set alerts on every service that can generate a surprise bill if FindA.Sale goes viral.

---

## Service Risk Summary

| Service | Viral Risk | Free Tier / Limit | Can Hard-Cap? | Action Required |
|---------|-----------|-------------------|---------------|-----------------|
| Cloudinary | 🔴 HIGH | 25 credits/mo, 25GB bandwidth | ✅ Yes — spending limit | Set limit + email alert now |
| Google Vision API | 🔴 HIGH | 1,000 req/mo free, then $1.50/1,000 | ✅ Yes — quota + budget | Set quota limit + GCP budget alert now |
| Anthropic (Claude Haiku) | 🟡 MEDIUM | Pay-per-token, no free tier | ✅ Yes — usage limit | Set monthly $ cap now |
| Railway | 🟡 MEDIUM | Hobby $5/mo fixed, Pro pay-as-you-go | ⚠️ Partial — plan cap | Verify plan; set spend alert |
| Vercel | 🟡 MEDIUM | Hobby free, Pro $20/mo + overage | ⚠️ Partial — usage alerts | Set bandwidth alert |
| eBay Trading API | 🟡 MEDIUM | 5,000 calls/day default | ⚠️ App-level limit | Add rate limiter in code |
| Stripe | 🟢 LOW | % of revenue — scales with income | ✅ Revenue-proportional | Radar fraud rules only |
| Resend | 🟢 LOW | 3,000 emails/mo free | ✅ Yes — plan limit | Monitor usage |

---

## 1. Cloudinary

**Risk:** Every shopper loading item photos triggers image transformations. A viral day with 50,000 photo views can exhaust a month's credit in hours.

**Step 1 — Set a spending cap:**
1. Go to [Cloudinary Billing Settings](https://console.cloudinary.com/settings/billing)
2. Under **Credit overage protection**, set a **monthly credit cap** (start with 50 credits = ~$50 equivalent)
3. Enable **"Pause account when limit reached"** — this stops transformations rather than charging you

**Step 2 — Set email alerts:**
1. Go to [Cloudinary Notifications](https://console.cloudinary.com/settings/notifications)
2. Enable alerts at **50%, 75%, 90%** of monthly credit usage
3. Make sure alerts go to your primary email

**Step 3 — Verify optimization is on (check with Claude):**
All Cloudinary URLs should include `f_auto,q_auto` parameters — this reduces credit consumption by 40–60% via format/quality auto-selection. Ask Claude to grep the codebase for Cloudinary URL patterns if unsure.

**Dashboard URL:** https://console.cloudinary.com/console  
**Billing URL:** https://console.cloudinary.com/settings/billing

---

## 2. Google Vision API

**Risk:** Each AI camera capture calls Vision API. At viral scale (1,000 organizers × 50 photos/day), that's 50,000 calls/day = $75/day = $2,250/month at standard pricing.

**Step 1 — Set a quota limit (hard cap on calls/day):**
1. Go to [Vision API Quotas in GCP Console](https://console.cloud.google.com/apis/api/vision.googleapis.com/quotas)
2. Find **"Requests per day"** quota
3. Click the pencil icon → set a **daily cap** (suggest: 2,000/day during beta, increase as revenue justifies)
4. When the cap is hit, the API returns a 429 error — the app should fall back to manual tagging gracefully

**Step 2 — Set a GCP billing budget alert:**
1. Go to [GCP Billing Budgets](https://console.cloud.google.com/billing/budgets)
2. Select your billing account → **Create Budget**
3. Scope to the Vision API only (or all APIs)
4. Set threshold alerts at **$10, $25, $50** — GCP emails you at each threshold
5. At $50, optionally enable **"Disable billing"** (this kills the API — only use as last resort)

**Recommended budget alert:** $25/month triggers an email, $100/month triggers a Pub/Sub notification (can be wired to a Slack webhook)

**GCP Console:** https://console.cloud.google.com  
**Vision API dashboard:** https://console.cloud.google.com/apis/api/vision.googleapis.com  
**Billing budgets:** https://console.cloud.google.com/billing/budgets

---

## 3. Anthropic (Claude Haiku)

**Risk:** Each AI camera capture also calls Claude Haiku for item tagging. Haiku is cheap (~$0.25/M input tokens, $1.25/M output tokens) but volume adds up.

**Step 1 — Set a monthly usage limit:**
1. Go to [Anthropic Console → Limits](https://console.anthropic.com/settings/limits)
2. Under **Monthly spend limit**, set a hard cap (suggest: $50/month during beta)
3. When the limit is hit, the API returns a 529 error — your app falls back to manual tagging

**Step 2 — Monitor usage:**
1. Go to [Anthropic Console → Usage](https://console.anthropic.com/usage)
2. Check weekly — the console shows token burn by model and day

**Anthropic Console:** https://console.anthropic.com  
**Usage page:** https://console.anthropic.com/usage  
**Limits page:** https://console.anthropic.com/settings/limits

---

## 4. Railway (Backend)

**Risk:** Railway Pro plan charges by CPU/RAM/network usage. A traffic spike that keeps the Express server at 100% CPU for 24h can add $50–200 to your bill.

**Step 1 — Check your current plan:**
1. Go to [Railway Account Billing](https://railway.com/account/billing)
2. If you're on **Hobby ($5/month fixed)** — you're capped, no surprise bills, but the service will be throttled/stopped at the limit
3. If you're on **Pro** — you pay usage; set a spend limit

**Step 2 — Set a spending limit (Pro plan):**
1. Go to [Railway Account Settings](https://railway.com/account)  
2. Under **Billing**, find **Spending Limit** and set a monthly cap (suggest: $50–100)
3. Railway will email you as you approach the limit

**Step 3 — Enable usage alerts:**
1. In your project settings: [Railway Project Settings](https://railway.com/project) → select your project → **Settings**
2. Enable email notifications for CPU/memory spikes

**Railway dashboard:** https://railway.com/dashboard  
**Billing:** https://railway.com/account/billing

---

## 5. Vercel (Frontend)

**Risk:** Vercel Pro is $20/month + pay-as-you-go for bandwidth overage. A viral event serving thousands of Next.js pages can push bandwidth into overage territory. Serverless function invocations also have limits.

**Step 1 — Check your plan and usage:**
1. Go to [Vercel Dashboard → Usage](https://vercel.com/dashboard)
2. Check current bandwidth and function invocation counts vs. plan limits

**Step 2 — Set usage alerts:**
1. Go to [Vercel Team Settings → Billing](https://vercel.com/[your-team]/settings/billing)
2. Enable **usage alerts** — Vercel sends emails when you hit 75% and 90% of plan limits

**Step 3 — Enable Vercel Firewall (if on Pro):**
1. In your project settings → **Security** → enable **DDoS protection** and **Rate limiting**
2. This prevents bot traffic from burning your bandwidth allocation

**Vercel dashboard:** https://vercel.com/dashboard  
**Billing:** https://vercel.com/account/billing

---

## 6. eBay Trading API

**Risk:** eBay caps API calls at **5,000/day** for standard apps (25,000/day for certified apps). If organizers push many items simultaneously or a bug causes retry loops, you can exhaust the daily limit and all eBay pushes fail for the rest of the day.

**Step 1 — Check your current call quota:**
1. Go to [eBay Developer Rate Limits](https://developer.ebay.com/my/rateLimits) (must be logged into your eBay Developer account)
2. See your current daily limit and today's call count

**Step 2 — Apply for higher limits (free):**
1. Go to [eBay Developer Program](https://developer.ebay.com/support/certification)
2. Submit for **Certified Application** status — increases daily limit to 25,000 calls
3. This is a paper form process, takes 1–2 weeks

**Step 3 — Code-level rate limiting (ask Claude to implement):**
The backend should add a simple daily counter in Redis/DB: increment on every eBay API call, reject with a helpful error when count exceeds 4,500/day. This prevents a bug or bulk import from exhausting the limit.

**eBay rate limits page:** https://developer.ebay.com/my/rateLimits  
**eBay Developer console:** https://developer.ebay.com/my/keys

---

## 7. Stripe

**Risk:** Stripe charges are proportional to revenue (2.9% + $0.30/transaction) — so more revenue = more Stripe fees, but it's never a surprise because you earned it. The real risk is **fraud chargebacks** if the platform goes viral and attracts bad actors.

**Step 1 — Enable Stripe Radar rules:**
1. Go to [Stripe Radar Rules](https://dashboard.stripe.com/radar/rules)
2. Enable the default rule set
3. Add a rule: **Block if risk score > 75** (prevents high-risk cards from completing)
4. Consider: **Block if country not in [US, CA]** for beta period

**Step 2 — Set notification alerts:**
1. Go to [Stripe Notification Settings](https://dashboard.stripe.com/settings/notifications)
2. Enable: dispute created, refund failed, payment failure spike

**Step 3 — Set payout schedule to minimize exposure:**
1. Go to [Stripe Payouts Settings](https://dashboard.stripe.com/settings/payouts)
2. During beta, set a **7-day rolling payout** rather than daily — gives time to catch fraud before funds leave

**Stripe Dashboard:** https://dashboard.stripe.com  
**Radar rules:** https://dashboard.stripe.com/radar/rules  
**Notification settings:** https://dashboard.stripe.com/settings/notifications

---

## 8. Resend (Email)

**Risk:** Low risk. Resend free tier is 3,000 emails/month; Pro is 50,000/month for $20. A viral event could push notification emails over the free limit.

**Step 1 — Monitor usage:**
1. Go to [Resend Dashboard](https://resend.com/overview)
2. Check **Emails Sent** counter vs. plan limit

**Step 2 — Set up billing alerts:**
1. Go to [Resend Billing](https://resend.com/settings/billing)
2. Pro plan auto-charges at $0.40/1,000 emails beyond the plan limit — set a budget alert

**Resend dashboard:** https://resend.com/overview

---

## Quick-Action Checklist (Do These Now)

- [ ] **Cloudinary** — Set spending cap + 75% email alert
- [ ] **Anthropic** — Set $50/month spend limit
- [ ] **Google Vision** — Set 2,000/day quota + $25 budget alert in GCP
- [ ] **Railway** — Confirm plan type; set spend limit if on Pro
- [ ] **Vercel** — Enable usage alerts in team billing settings
- [ ] **eBay** — Check today's call count; apply for Certified App status
- [ ] **Stripe** — Enable Radar rules; set dispute/fraud notifications

---

## Viral Spike Response Plan

If FindA.Sale goes viral and costs spike unexpectedly:

1. **First 5 minutes:** Check Cloudinary and Google Vision dashboards — these are the fastest-burning services
2. **Reduce Vision API calls:** In Railway env vars, set `DISABLE_VISION_API=true` — have Claude add a feature flag for this that falls back to manual tagging
3. **Reduce Cloudinary load:** Change Cloudinary URL params from on-demand transforms to pre-generated URLs
4. **Scale Railway if CPU-bound:** Railway auto-scales on Pro; on Hobby, consider a temporary plan upgrade
5. **Monitor eBay calls:** Check [rate limits page](https://developer.ebay.com/my/rateLimits) — if approaching 4,500, pause bulk eBay operations

---

*Maintained by: main session. Review and update limits quarterly or after any significant traffic event.*
