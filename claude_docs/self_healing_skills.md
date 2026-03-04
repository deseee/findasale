# Self-Healing Skills

Compact pattern library. Trigger → Fix → Test.
Only entries with ≥2 occurrences OR structurally certain to recur.

---

### 1. SSR Window/Document Guard
**Trigger:** Next.js page uses `window`/`document`/`navigator`/`location` outside `useEffect`
**Fix:** Move to `useEffect` + `useState`. Dynamic import with `{ ssr: false }` for libs like Leaflet.
**Test:** `docker compose restart frontend && curl -s http://localhost:3000/<page> | grep -i "error\|500"`

### 2. JWT Payload Staleness
**Trigger:** New field on User model or AuthContext reads undefined field
**Fix:** Add field to all `jwt.sign()` calls in authController.ts. Add to decoded type in AuthContext.tsx.
**Test:** Login → decode JWT at jwt.io → confirm field present.

### 3. Console-log Stub Left in Production
**Trigger:** New form/button built before backend endpoint exists
**Fix:** Before closing feature, grep page for `console.log`, `alert(`, `TODO`, `// placeholder`.
**Test:** `grep -r "console.log\|alert(" packages/frontend/pages/ --include="*.tsx" | grep -v "//.*console"`

### 4. Related Entity ID Missing from API
**Trigger:** Frontend needs `organizer.id` or similar but gets `undefined`
**Fix:** Add `select: { id: true, ... }` to Prisma `include` on the parent query.
**Test:** `curl -s http://localhost:3001/api/sales | jq '.[0].organizer'`

### 5. Unhandled Promise Rejection in Express
**Trigger:** Async controller without try/catch → client hangs or 500
**Fix:** Wrap in try/catch, or use `asyncHandler` wrapper that forwards to error middleware.
**Test:** `grep -rn "\.then(" packages/backend/src/controllers/ --include="*.ts" | grep -v "\.catch\|async\|await"`

### 6. Missing Auth Middleware on Mutation Route
**Trigger:** New POST/PUT/PATCH/DELETE route without `authenticate` middleware
**Fix:** Add `authenticate` (and `requireRole` for org/admin routes) to every mutation route.
**Test:** `grep -rn "router\.\(post\|put\|patch\|delete\)(" packages/backend/src/routes/ --include="*.ts" | grep -v "authenticate"`

### 7. findMany Without Pagination
**Trigger:** Prisma `findMany` with no `take` limit on external-facing route
**Fix:** Add `take: 100` (or appropriate cap) + `skip` offset to every `findMany`.
**Test:** `grep -rn "findMany(" packages/backend/src/controllers/ --include="*.ts" | grep -v "take:\|limit"`

### 8. Missing Env Var at Runtime
**Trigger:** New `process.env.X` reference not in `.env.example`
**Fix:** Add to `.env.example`. Validate required vars at startup with fail-fast.
**Test:** Compare `.env.example` keys vs `.env` keys.

### 9. Docker/pnpm Backend Startup Failure
**Trigger:** `docker compose up` → backend exits with `nodemon: not found`
**Fix:** Use `pnpm --filter backend run dev` (not `npx nodemon`). Ensure nodemon+tsx in `dependencies`.
**After change:** `docker compose down && docker compose up --build --no-cache`

### 10. Circular Dependency via index.ts Prisma Import
**Trigger:** Controller imports prisma from `'../index'` → TDZ crash
**Fix:** Import from `'../lib/prisma'` instead.
**Test:** `grep -rn "from '../index'" packages/backend/src/controllers/ --include="*.ts"`

### 11. GitHub MCP Available — Use It
**Trigger:** Session wrap or any file push needed
**Fix:** Use `mcp__github__push_files` (≤3 files/call). Never write "push from PowerShell" when MCP is active.
**Repo:** `deseee/findasale`, branch: `main`

### 12. DNS Records Must Go in Active Nameserver Provider
**Trigger:** DNS records added but show inactive / don't propagate
**Fix:** finda.sale uses Vercel nameservers. Add all DNS records in Vercel DNS panel, NOT Spaceship.
**Verify:** `curl -s "https://dns.google/resolve?name=finda.sale&type=NS"`

### 13. next.config.js Not Bind-Mounted
**Trigger:** Config changes (CSP, Workbox, image domains) not taking effect in Docker
**Fix:** `docker compose build --no-cache frontend && docker compose up -d`. Hard refresh after.
**Also applies to:** tsconfig.json, tailwind.config.js, postcss.config.js

### 14. MCP Push + Local Unstaged Files Conflict
**Trigger:** `git pull --rebase` aborts — untracked files would be overwritten
**Fix:** `git stash` → `Remove-Item` listed files → `git pull --rebase` → `git stash pop` → `git push`
**Prevention:** After MCP push of new files, note in session-log for Patrick to `git pull`.

### 15. PowerShell Treats [ ] as Wildcards
**Trigger:** `Remove-Item "pages/[id].tsx"` silently does nothing
**Fix:** Always use `-LiteralPath` for Next.js dynamic route file operations.

### 16. Stale Git Lock Files
**Trigger:** `git add`/`commit` fails with `.git/index.lock: File exists`
**Fix:** `Remove-Item .git\index.lock` (and/or `HEAD.lock`). Only when no git process is running.

### 17. Workbox SW Blocking Third-Party Scripts
**Trigger:** Stripe or other CDN fails with `no-response` from workbox SW
**Fix:** Remove domain from runtimeCaching + exclude from pages catch-all via negative lookahead regex.
**Root cause:** SW fetch context + CORS restrictions. NetworkOnly is insufficient — must fully exclude.

### 18. Docker Bind Mount Missing for New Frontend Dir
**Trigger:** `Module not found` for new dir under `packages/frontend/`
**Fix:** Add `./packages/frontend/<dir>:/app/packages/frontend/<dir>` to docker-compose.yml volumes.
**Currently mounted:** pages/, components/, styles/, lib/, public/, hooks/

### 19. Diff-Only Violation — Full Rewrite Without Permission
**Trigger:** Claude uses Write tool on existing file without announcing approach
**Fix:** Always announce "Editing [file] lines X–Y" or ask for rewrite permission. See CORE.md §4.
**Phrases that do NOT grant permission:** "major rewrite", "overhaul", "audit"

### 20. Controller Field Drift
**Trigger:** New Prisma schema field exists in frontend form but silently dropped by controller
**Fix:** Add field to `req.body` destructuring AND `prisma.create`/`update` data objects.
**Test:** `grep -n "<fieldname>" packages/backend/src/controllers/<controller>.ts`

---

Last Updated: 2026-03-05 (compressed from v1 — full code examples removed, trigger→fix→test format)
