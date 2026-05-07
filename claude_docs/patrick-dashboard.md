# Patrick's Dashboard — S678 Wrap

---

## Push Block — Run This Now

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S678: MCP server Railway deploy complete + DNS CNAME + mcp.json active"
.\push.ps1
```

Note: All code changes this session (railway.toml, tsconfig.json, index.ts, mcp.json) were already pushed to GitHub via MCP during the session.

---

## Current State

| Area | Status |
|------|--------|
| Google OAuth | ⚠️ Still broken (S673/S674 architecture correct, root cause unclear) |
| Login (email/password) | ✅ Working |
| Homepage feed | ✅ Working |
| Vercel build | ✅ Green |
| Railway backend | ✅ Green |
| MCP Server | ✅ LIVE — `findasale-production.up.railway.app/health` returns 200, 7 tools |
| mcp.finda.sale DNS | ✅ CNAME added (Vercel DNS, propagating) |
| .well-known/mcp.json | ✅ status → active (Vercel deploy queued) |
| Audio notes (VoiceDescriptionInput) | ✅ Shipped S677 — Chrome QA pending |
| AI discoverability (llms.txt, robots.txt, JSON-LD) | ✅ Live S676 |
| Sale feed indexes (S675 migration) | ✅ Confirmed deployed |
| Product JSON-LD on /items/[id] | ✅ Already implemented (lines 550–609) |

---

## S679 First Action

**Chrome QA: VoiceDescriptionInput** — open edit-item in Chrome as user1@example.com (Seedy2025!), tap the mic button near the description textarea, speak an item description. Verify: transcript saves to description, inline "Voice suggestion · Accept / Keep" prompts appear for pre-filled fields. Screenshot required.

---

## Outstanding Carry-Forward

1. **MAILERLITE_ORGANIZERS_GROUP_ID** env var in Railway — pending since S668. Organizers signing up aren't enrolled in MailerLite onboarding automation without this. Get the group ID from MailerLite → Groups.
2. **Chrome QA: VoiceDescriptionInput** — see above
3. **mcp.finda.sale smoke test** — run `curl https://mcp.finda.sale/health` once DNS propagates (5–30 min). Direct URL works now: `https://findasale-production.up.railway.app/health`

---

## Outstanding Audit Items

- ❌ P0: SaleCard above-fold images using `loading="lazy"` (LCP hit)
- ❌ P1: PWA offline.html missing (sw.js pre-caches it but file doesn't exist)
- ❌ P1: City pages silently noindex when empty
- ❌ P1: Email CAN-SPAM gaps + "estate sale" banned term in 5 templates
- ❌ P1: Unsubscribe links expose email as URL parameter (PII leak)
