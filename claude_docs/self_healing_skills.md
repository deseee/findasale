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

### 21. PowerShell vs Bash Syntax Confusion
**Trigger:** Claude gives Patrick a shell command with `&&` (bash-only) or misuses backticks
**Fix:** Always specify the target terminal. PowerShell: use `;` to chain, backtick (`` ` ``) for line continuation. Docker exec / Linux: use `&&` to chain, `\` for continuation. Load dev-environment skill before giving ANY shell command.
**Test:** Review command before sending — does it match the target terminal?

### 22. Prisma Migrate in Non-Interactive Container
**Trigger:** `prisma migrate dev` fails with "environment is non-interactive"
**Fix:** Docker dev: use `prisma db push` or `docker exec -it` (must have both `-i` and `-t`). Production (Railway/Neon): use `prisma migrate deploy`. Never `migrate dev` in CI/Docker without interactive terminal.
**Test:** `docker exec -it findasale-backend-1 npx prisma migrate deploy`

### 23. Repair Loop — Same Error 3+ Times
**Trigger:** Claude has attempted the same fix pattern 3 times without success
**Fix:** Stop. Report to Patrick: "I've tried 3 approaches for [error]. Here's what failed and why." Suggest: different model, manual intervention, or deferral. See session-safeguards.md.
**Test:** Count fix attempts per error per session — if ≥3, halt.

### 24. Write-Before-Read Tool Error
**Trigger:** Edit tool fails because the file wasn't Read in the current conversation
**Fix:** Always batch-Read all target files at the start of a multi-file edit session. Plan reads before edits.
**Test:** Before any Edit call, confirm the file appears in recent Read results.

### 25. Railway PORT / EXPOSE Mismatch (502 x-railway-fallback)
**Trigger:** Railway deployment shows Active/Online, deploy logs show backend started on a port, but all HTTP requests return 502 with `x-railway-fallback: true`
**Environment:** Railway + Docker + Express
**Pattern:** Railway's public networking routes traffic to the port in `EXPOSE` (e.g. 5000). Railway also injects a dynamic `PORT` env var (e.g. 8080). If the backend listens on the injected PORT but Railway routes to the EXPOSE port, every request returns 502. The process is alive (cron jobs fire, health check passed) but HTTP never reaches it.
**Fix:** Set `PORT=<EXPOSE value>` explicitly in Railway Variables. This overrides Railway's dynamic injection and aligns the backend's listen port with Railway's routing. Example: `EXPOSE 5000` → set `PORT=5000` in Variables.
**Test:** `curl -s -o /dev/null -w "%{http_code}" https://<railway-domain>/` → should return 200, not 502.

### 26. Missing Prisma Migration (schema drift via db push)
**Trigger:** Seed or runtime error: `The column 'X' does not exist in the current database` — even though `prisma migrate deploy` reports "No pending migrations"
**Pattern:** A field was added to schema.prisma and applied to local DB via `prisma db push` without creating a migration file. The column exists locally but not in production.
**Fix:** Create migration file manually: `packages/database/prisma/migrations/YYYYMMDDNNNNNN_name/migration.sql` with the matching `ALTER TABLE` statement. Push to GitHub. Run `pnpm run db:deploy` against production.
**Test:** `pnpm run db:deploy` → should report migration applied. Then re-run seed.

### 27. Prisma Client Stale on Windows Before Seed
**Trigger:** Seed fails with TypeScript type error on a known-good field (e.g. `userId does not exist in type X`) when running on Windows
**Pattern:** The Prisma client in Windows `node_modules` was generated against an older schema. After schema changes, the client needs regenerating before TypeScript can compile the seed.
**Fix:** `pnpm run db:generate` (or `pnpm --filter database run db:generate`) before running the seed. Also use `pnpm run prisma:seed` not `npx tsx` — ts-node is the configured runner.
**Test:** Re-run `pnpm run prisma:seed` — should compile and execute without TS errors.

### 28. Zero-Friction DB Commands — Pre-Fill Neon URLs from .env
**Trigger:** Claude gives Patrick a production DB command with placeholder `<neon-pooled-url>` or similar
**Pattern:** Patrick prefers automation and copy-paste-ready commands with no manual lookup required. DB URLs are in `packages/backend/.env` and are stable — always read them and inline them before presenting any migration/seed/deploy command.
**Fix:** Read `packages/backend/.env` (or from the VM path `/sessions/.../mnt/FindaSale/packages/backend/.env`) and substitute real values into the command block before presenting it. Never use `<placeholder>` syntax for values Claude can fetch.
**Neon URLs (current):**
- `DATABASE_URL`: `postgresql://neondb_owner:npg_6CVGh8YvPSHg@ep-plain-sound-aeefcq1y-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
- `DIRECT_URL`: `postgresql://neondb_owner:npg_6CVGh8YvPSHg@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
**Test:** Patrick can copy-paste command block without editing anything.

---

Last Updated: 2026-03-05 (added entry 28 — pre-fill Neon DB URLs from .env for zero-friction commands)
