# Patrick's Dashboard — S679 Wrap

---

## Push Block — Run This Now

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git add claude_docs/brand/brand-voice-system.md
git commit -m "S679: Pre-launch checklist + mcp.finda.sale domain + pre-launch audit queue"
.\push.ps1
```

---

## Current State

| Area | Status |
|------|--------|
| Google OAuth | ⚠️ Still broken (S673/S674 architecture correct, root cause unclear) |
| Login (email/password) | ✅ Working |
| Homepage feed | ✅ Working |
| Vercel build | ✅ Green |
| Railway backend | ✅ Green |
| MCP Server | ✅ LIVE — 7 tools responding |
| mcp.finda.sale | ✅ Railway domain added + TXT verify record added — propagating |
| Brand Voice System | ✅ `claude_docs/brand/brand-voice-system.md` created S679 |
| VAPID keys | ✅ Set on Railway S679 |
| Google Search Console | ✅ Verified S679 |
| Resend | ✅ Confirmed S679 |
| Stripe business account | ✅ Confirmed S679 |
| Google Voice support line | ❌ Cancelled — not doing |

---

## Patrick Manual Actions Needed

1. **`MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`** — set on Railway → backend service → Variables. Shoppers who sign up won't be enrolled in MailerLite until this is set.
2. **Google Business Profile** — create at business.google.com (use 219 E Michigan Ave, Suite F, Paw Paw, MI 49079)
3. **Business cards** — files in `claude_docs/brand/`
4. **mcp.finda.sale health check** — run `curl https://mcp.finda.sale/health` in 10–15 min to confirm propagated

---

## Next Session Priority — Pre-Launch Audits

| Priority | Audit | Dispatch |
|----------|-------|---------|
| 1 | Health Scout baseline scan (#390) | `Skill('health-scout')` |
| 2 | Accessibility audit WCAG (#391) | `Skill('design:accessibility-review')` |
| 3 | Brand Voice copy sweep (#392) | `Skill('findasale-marketing')` |
| 4 | Chrome QA backlog sprint (#393) | Micro-dispatches — one feature per call |
| 5 | Full product walkthrough (#394) | `Skill('findasale-qa')` — after QA sprint |

---

## Outstanding Audit Items (Pre-Existing)

- ❌ P0: SaleCard above-fold images using `loading="lazy"` (LCP hit)
- ❌ P1: PWA offline.html missing (sw.js pre-caches it but file doesn't exist)
- ❌ P1: City pages silently noindex when empty
- ❌ P1: Email CAN-SPAM gaps + "estate sale" banned term in 5 templates
- ❌ P1: Unsubscribe links expose email as URL parameter (PII leak)
