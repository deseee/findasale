# Patrick's Dashboard — May 7, 2026 (S667 Complete)

---

## ✅ S667 is done and live

Railway: ✅ Green
Vercel: ✅ Green (pending pnpm lockfile push if you haven't already)
Facebook OAuth: ✅ Updated
Google OAuth: ✅ Updated
CCPA migration: ✅ Deployed

**One remaining action if Vercel shows a frozen-lockfile error:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: regenerate pnpm lockfile for jest deps (S667)"
.\push.ps1
```
Skip if Vercel is already green.

---

## 🔜 Next session: S668 — Multi-Lens Product Audit

Four parallel auditors dispatched simultaneously, each with a fresh lens the codebase hasn't seen:

**Lens 1 — Sales psychology / CRO expert**
Where are shoppers and organizers dropping off? Are scarcity signals, social proof, and pricing anchors working? Is the XP system a conversion lever or invisible? Deliverable: ranked conversion gap list with specific fixes.

**Lens 2 — Game designer / player**
Is the XP curve motivating across all ranks or does it flatten mid-game? Hunt Pass: pay-to-win risk? Are crews mechanically purposeful? Deliverable: game design gaps grounded in player psychology.

**Lens 3 — Organizer choosing software**
Roleplay an organizer evaluating FindA.Sale vs EstateSales.NET, EstateSales.org, HiBid, Facebook events. What's the clearest differentiator? What's a dealbreaker? Deliverable: competitive gap list + one-paragraph "why switch" pitch.

**Lens 4 — Recent session audit (S662–S667)**
Re-audit the last 5 sessions for partially-shipped items, missed edge cases, and anything in the UNVERIFIED queue that can now be assessed.

All 4 run in parallel → triage → P0/P1 dev fixes dispatched same session.

---

## ⚠️ Stripe Tax note

`automatic_tax: {enabled: true}` is in the code but does nothing unless you activate Stripe Tax in your Stripe Dashboard. Don't activate it. If you ever need to collect tax, it's one dashboard toggle — zero code changes.

---

## 📊 Build status

| Layer | Status |
|---|---|
| Railway (backend) | ✅ Green |
| Vercel (frontend) | ✅ Green |
| Migration `20260507000001_add_ccpa_opt_out` | ✅ Deployed |
| Migration `20260506000001_add_age_verified` | ✅ Live |
| pnpm lockfile | ⚠️ Run `pnpm install` + push if Vercel shows frozen-lockfile error |

---

## 🧠 Compression-survival pointer

S667 key facts: NextAuth is at `/api/oauth/[...nextauth].ts`. Old file deleted. OAuth redirects updated (Google + Facebook). ccpaOptOut migration live. Stripe Tax code present but intentionally inactive. 15 frontend files still use localStorage JWT — non-blocking, tracked for future sweep. Next session is S668 multi-lens audit — no code dispatch until lenses report back.
