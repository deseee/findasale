# Patrick's Dashboard — S676 Wrap

---

## Push Block — Run This Now

```powershell
git add packages/frontend/public/llms.txt
git add packages/frontend/public/robots.txt
git add packages/frontend/pages/index.tsx
git add packages/frontend/pages/pricing.tsx
git add packages/frontend/pages/about.tsx
git add packages/frontend/pages/faq.tsx
git add "packages/frontend/public/.well-known/mcp.json"
git add packages/mcp-server/src/index.ts
git add packages/mcp-server/src/handlers.ts
git add packages/mcp-server/src/types.ts
git add packages/mcp-server/src/lib/apiClient.ts
git add packages/mcp-server/src/lib/rateLimiter.ts
git add packages/mcp-server/src/tools/searchSales.ts
git add packages/mcp-server/src/tools/getSale.ts
git add packages/mcp-server/src/tools/searchItems.ts
git add packages/mcp-server/src/tools/getItem.ts
git add packages/mcp-server/src/tools/listCities.ts
git add packages/mcp-server/src/tools/listSaleTypes.ts
git add packages/mcp-server/src/tools/listCategories.ts
git add packages/mcp-server/package.json
git add packages/mcp-server/tsconfig.json
git add packages/mcp-server/.env.example
git add packages/mcp-server/Dockerfile.production
git add packages/mcp-server/README.md
git add claude_docs/strategy/mcp-server-spec.md
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S676: AI discoverability + MCP Server Phase 1 (#384-389)"
.\push.ps1
```

---

## After the Push — Railway Deploy (MCP Server)

1. Go to Railway dashboard → FindA.Sale project → **New Service** → **Deploy from GitHub repo**
2. Set root directory: `packages/mcp-server`
3. Set Dockerfile path: `Dockerfile.production`
4. Add environment variables:
   - `BACKEND_URL` = `https://api.finda.sale`
   - `PORT` = `3003`
   - `NODE_ENV` = `production`
5. Add a Railway domain or custom domain → point `mcp.finda.sale` DNS CNAME to Railway
6. Once live, Patrick tells Claude to update `.well-known/mcp.json` status from `coming-soon` → `active`

---

## Current State

| Area | Status |
|------|--------|
| Google OAuth | ⚠️ Still broken (architecture correct per S674, root cause unclear) |
| Login (email/password) | ✅ Working |
| Homepage feed | ✅ Working |
| Vercel build | ✅ Green |
| Railway backend | ✅ Green |
| AI discoverability (llms.txt, robots.txt, JSON-LD) | ✅ Shipped S676 — push needed |
| MCP Server (packages/mcp-server) | ✅ Built S676 — Railway deploy needed |
| Sale feed indexes (S675 migration) | ⚠️ Check if `20260507000004_sale_feed_indexes` was deployed |

---

## S677 Priorities

1. **Audio note UX investigation** — Buttons not intuitive on edit page (just one near tags). UX audit → placement fix.
2. **MCP server Railway deploy** — Instructions above. ~15 min of dashboard work.
3. **Verify S675 migration** — Confirm sale feed indexes migration deployed to Railway
4. **Product JSON-LD on `/items/[id]`** — P0 from S669 audit, still open
5. **MAILERLITE_ORGANIZERS_GROUP_ID** env var in Railway (pending since S668)

---

## Outstanding Audit Items

- ❌ P0: Item pages missing Product JSON-LD structured data
- ❌ P0: SaleCard above-fold images using `loading="lazy"` (LCP hit)
- ❌ P1: PWA offline.html missing (sw.js pre-caches it but file doesn't exist)
- ❌ P1: City pages silently noindex when empty
- ❌ P1: Email CAN-SPAM gaps + "estate sale" banned term in 5 templates
- ❌ P1: Unsubscribe links expose email as URL parameter (PII leak)
