# Patrick's Dashboard — S671 Wrap

---

## 🚨 DO THIS FIRST in S672

**Restart Railway backend** to clear the rate limiter (triggered by failed OAuth calls this session):
Go to **railway.app → your project → backend service → ⋮ → Restart**

Then test Google login in an incognito window. That tells us if OAuth is actually working now.

---

## ⚠️ Action Required Before S672

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git pull
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: S671 wrap — OAuth revert shipped, rate limit pending Railway restart"
.\push.ps1
```

### Also pending
- Add `MAILERLITE_ORGANIZERS_GROUP_ID` env var in Railway (pending since S668)

---

## 📋 What happened in S671

| Item | Result |
|---|---|
| Google OAuth redirect_uri_mismatch | Root cause found: NextAuth v4 hardcodes `/api/auth/` internally — fix is explicit redirect_uri override in provider config |
| Bad fix (moving handler to /api/auth/) | ❌ Caused immediate logout — catch-all blocked backend /auth/refresh + /auth/me routes |
| Revert | ✅ Shipped — /api/oauth/[...nextauth].ts restored with redirect_uri overrides, bad /api/auth/ file deleted |
| Error page fix | ✅ Shipped — `pages.error: '/login'` added so OAuth errors don't hit broken /api/auth/error URL |
| Backend rate limiter | ❌ Triggered by repeated failed /auth/oauth calls — "Too many authentication attempts" |
| OAuth verified end-to-end | ❌ NOT verified — rate limit blocked final test |

---

## 🔜 S672 — OAuth Verify + Audit Dispatch

**Step 1 — Railway restart + OAuth test** (must happen first)

**Step 2 — If OAuth broken after restart**, check Vercel function logs for `/api/oauth/callback/google` to see the actual server-side NextAuth error. The `OAuthCallback` error likely means the backend `/auth/oauth` exchange is failing.

**Step 3 — Dev dispatch** for 5 S669 audit P0/P1s (ready to run in parallel once OAuth confirmed):

| Severity | Finding | File |
|---|---|---|
| P0 | SaleCard: above-fold images lazy-loaded (kills LCP) | `components/SaleCard.tsx` |
| P0 | Item pages: zero Product JSON-LD structured data | `pages/items/[id].tsx` |
| P1 | `offline.html` missing — sw.js pre-caches it | `public/offline.html` |
| P1 | City pages silently noindex when empty | city page file |
| P1 | Email templates: "estate sale" banned ×5, unsubscribe `?email=` PII | Email templates |

---

## 📊 Build status

| Layer | Status |
|---|---|
| Railway (backend) | ⚠️ Rate limited — needs restart |
| Vercel (frontend) | ✅ Green |
| Email/password login | ✅ VERIFIED in Chrome S670 |
| Google/Facebook OAuth | ❌ UNVERIFIED — rate limit active |
| MailerLite organizer enrollment | ⚠️ Needs `MAILERLITE_ORGANIZERS_GROUP_ID` in Railway |
