# Patrick's Dashboard — S673 Wrap

---

## ⚠️ Action Required — Wrap Push

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/api/auth/[...nextauth].ts
git add packages/frontend/pages/_app.tsx
git add packages/frontend/lib/api.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(auth): browser-side OAuth cookie exchange + homepage 401 redirect fix + S673 wrap"
.\push.ps1
```

If Dockerfile cache-bust not yet pushed separately:
```powershell
git add packages/backend/Dockerfile.production
git commit -m "chore: cache-bust Railway rebuild S673"
.\push.ps1
```

### Also pending
- Add `MAILERLITE_ORGANIZERS_GROUP_ID` env var in Railway (pending since S668)

---

## 📋 What happened in S673

| Item | Result |
|---|---|
| Path C: NextAuth → standard `/api/auth/[...nextauth].ts` | ✅ Shipped |
| `beforeFiles` rewrites protecting 14 backend routes | ✅ Shipped (MCP pushed) |
| OAuthBridge: browser-side cookie exchange | ✅ Shipped |
| Homepage redirect bug (all 401s → /login) | ✅ Fixed |
| Dockerfile cache-bust (Railway rebuild) | ✅ Pushed |
| Old `/api/oauth/[...nextauth].ts` | ✅ Deleted |
| Google OAuth verified working | ❌ Still broken at wrap |

---

## 🔬 OAuth Status

**Last known working: before S655.**

Root cause of current failure: unknown. S673 fixed the architecture (browser-side cookie exchange, beforeFiles routing), but OAuth is still not completing. Next session will use Vercel + Railway MCP logs to trace exactly where the flow breaks.

**What to check in S674:**
1. Vercel runtime logs — does `/api/auth/callback/google` land? Does OAuthBridge POST to `/api/auth/oauth`?
2. Railway logs — does `POST /auth/oauth` arrive? What does it return?
3. Git history S655→S667 — find the commit that broke it

---

## 🔜 S674 priorities

1. **OAuth investigation** — Vercel + Railway MCP log trace
2. **P0: Product JSON-LD** on `/items/[id]` (still missing from S669 audit)
3. **Add `MAILERLITE_ORGANIZERS_GROUP_ID`** in Railway
4. **Chrome authenticated audit** — organizer dashboard, rapid capture, pricing funnel

---

## 📊 Build status

| Layer | Status |
|---|---|
| Railway (backend) | ✅ Rebuilding with cache-bust |
| Vercel (frontend) | ✅ Green |
| Email/password login | ✅ VERIFIED in Chrome S670 |
| Google/Facebook OAuth | ❌ UNVERIFIED — still broken |
| Homepage unauthenticated | ✅ Fixed (no longer redirects to login) |
| LCP / PWA offline.html | ✅ Fixed + deployed |
| Email compliance (unsubscribe PII) | ✅ Fixed + deployed |
| MailerLite organizer enrollment | ⚠️ Needs `MAILERLITE_ORGANIZERS_GROUP_ID` in Railway |
