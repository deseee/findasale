# Patrick's Dashboard — S677 Wrap

---

## Push Block — Run This Now

```powershell
git add packages/frontend/components/VoiceDescriptionInput.tsx
git add "packages/frontend/pages/organizer/edit-item/[id].tsx"
git add pnpm-lock.yaml
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S677: Audio notes UX fix + pnpm lockfile + TS fix"
.\push.ps1
```

---

## Current State

| Area | Status |
|------|--------|
| Google OAuth | ⚠️ Still broken (S673/S674 architecture correct, root cause unclear) |
| Login (email/password) | ✅ Working |
| Homepage feed | ✅ Working |
| Vercel build | ✅ Green (pnpm lockfile fix shipped this session) |
| Railway backend | ✅ Green |
| Audio notes (edit-item) | ✅ Shipped S677 — push needed |
| AI discoverability (llms.txt, robots.txt, JSON-LD) | ✅ Pushed S676 |
| MCP Server (packages/mcp-server) | ✅ Built S676 — Railway deploy still needed |
| Sale feed indexes (S675 migration) | ⚠️ Confirm `20260507000004_sale_feed_indexes` was deployed |

---

## S678 First Action

Dispatch `findasale-innovation` for a map feature ideation sprint. Seed topics:
- **Mileage tracking** — how far did a shopper drive to attend a sale?
- **Nearby destinations** — other sales or stops close to a sale the shopper is already attending
- **Surprise features** — what map-based experiences would genuinely delight shoppers or organizers?

Innovation returns Phase 1 ideas + Phase 2 feasibility. Patrick reviews before any dev dispatch.

---

## Outstanding Carry-Forward

1. **MCP server Railway deploy** — New Railway service, root dir `packages/mcp-server`, Dockerfile.production ready. Env vars: `BACKEND_URL=https://api.finda.sale`, `PORT=3003`. Point `mcp.finda.sale` DNS → Railway. Update `.well-known/mcp.json` status to `active` once live.
2. **Verify S675 migration** — `20260507000004_sale_feed_indexes` — run `prisma migrate deploy` with Railway URL if not yet deployed.
3. **Product JSON-LD on `/items/[id]`** — P0 from S669, still open
4. **MAILERLITE_ORGANIZERS_GROUP_ID** env var in Railway (pending since S668)
5. **QA: VoiceDescriptionInput** — open edit-item in Chrome, tap mic, speak item description, verify saves correctly + inline suggestions for pre-filled fields

---

## Outstanding Audit Items

- ❌ P0: Item pages missing Product JSON-LD structured data
- ❌ P0: SaleCard above-fold images using `loading="lazy"` (LCP hit)
- ❌ P1: PWA offline.html missing (sw.js pre-caches it but file doesn't exist)
- ❌ P1: City pages silently noindex when empty
- ❌ P1: Email CAN-SPAM gaps + "estate sale" banned term in 5 templates
- ❌ P1: Unsubscribe links expose email as URL parameter (PII leak)
