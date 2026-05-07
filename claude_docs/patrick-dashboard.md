# Patrick's Dashboard — S674 Wrap

---

## ⚠️ Action Required — Wrap Push

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/_app.tsx
git add packages/frontend/hooks/useRankUp.ts
git add packages/frontend/pages/index.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: OAuth redirect, incognito 401 loop, empty homepage feed, onboarding modal conflict

- OAuthBridge: role-based redirect after token exchange (organizers → /organizer/dashboard)
- useRankUp: gate useXpProfile behind !!user to stop unauthenticated 401 redirect loop
- index.tsx: remove initialData from feed query (getStaticProps returns null at build time)
- dashboard.tsx: suppress OnboardingWizard when dashboardState=new (FocusTrap conflict fix)"
.\push.ps1
```

If S673 files haven't been pushed yet (api/auth/[...nextauth].ts, lib/api.ts, Dockerfile):
```powershell
git add packages/frontend/pages/api/auth/[...nextauth].ts
git add packages/frontend/lib/api.ts
git add packages/backend/Dockerfile.production
git commit -m "fix(auth): browser-side OAuth cookie exchange + Path C + S673 wrap"
.\push.ps1
```

### Also still pending
- Add `MAILERLITE_ORGANIZERS_GROUP_ID` env var in Railway (pending since S668)

---

## 📋 What happened in S674

| Bug | Root Cause | Fix |
|---|---|---|
| Google OAuth → login screen | OAuthBridge never redirected after token exchange | Added `router.replace()` with role-based destination |
| Incognito homepage → /login | `useXpProfile()` fired unauthenticated → 401 → interceptor redirect | `useXpProfile(!!user)` in `useRankUp.ts` |
| Homepage: "No sales yet" | `getStaticProps` returns null at build time → `initialData:null` skips fetch | Removed `initialData` from feed useQuery |
| Modal won't close (Skip/Verify Email frozen) | `OnboardingWizard` + `OrganizerOnboardingModal` both rendered; FocusTrap in underlying modal locked wizard buttons | Added `dashboardState !== 'new'` guard to wizard condition |

---

## 🔜 S675 priorities

1. **Verify S674 fixes in Chrome** — confirm OAuth redirect, homepage sales, incognito, modal close all work
2. **P0: Product JSON-LD on `/items/[id]`** (S669 audit item, still open)
3. **Add `MAILERLITE_ORGANIZERS_GROUP_ID`** in Railway
4. **Chrome authenticated audit** — organizer dashboard, rapid capture, pricing funnel

---

## 📊 Build status

| Layer | Status |
|---|---|
| Railway (backend) | ✅ Green |
| Vercel (frontend) | ✅ Green |
| Email/password login | ✅ VERIFIED in Chrome S670 |
| Google OAuth | ⚠️ Fix shipped S674, needs Chrome verification |
| Homepage (unauthenticated) | ⚠️ Feed fix shipped S674, needs Chrome verification |
| Incognito redirect loop | ⚠️ Fix shipped S674, needs Chrome verification |
| Organizer onboarding modal | ⚠️ Fix shipped S674, needs Chrome verification |
| LCP / PWA offline.html | ✅ Fixed + deployed |
| Email compliance | ✅ Fixed + deployed |
| MailerLite organizer enrollment | ⚠️ Needs `MAILERLITE_ORGANIZERS_GROUP_ID` in Railway |
