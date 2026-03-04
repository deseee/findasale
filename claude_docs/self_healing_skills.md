# Self-Healing Skills

Reusable corrections derived from recurring project patterns.
Only add entries here when: pattern observed ≥2 times OR structurally certain to recur.

---

## Skill 1: SSR Window/Document Guard (Next.js Pages Router)

**Name:** SSR Browser Globals Crash
**Trigger:** New Next.js page uses `window`, `document`, `navigator`, `location`, or any browser-only API at module level or outside `useEffect`
**Environment:** Next.js 14 Pages Router, Docker (any OS)

**Pattern:**
Pages Router runs components server-side during SSR. Browser globals don't exist server-side → crash with `ReferenceError: window is not defined`.

**Known instance:** `shopper/dashboard` used `window.location.origin` at render time → SSR crash (fixed Phase 5).

**Steps:**
1. Move any `window.*`, `document.*`, `navigator.*`, `location.*` access into `useEffect` or behind a `typeof window !== 'undefined'` guard.
2. Use `useState` to store the value, initialized in `useEffect`:
   ```tsx
   const [origin, setOrigin] = useState('');
   useEffect(() => { setOrigin(window.location.origin); }, []);
   ```
3. Never pass browser globals as default values to `useState`.
4. Dynamic imports with `{ ssr: false }` for any library that accesses browser globals on import (e.g. Leaflet).

**Edge Cases:**
- Leaflet: always use `dynamic(() => import('../components/SaleMap'), { ssr: false })`
- localStorage/sessionStorage: same rule — `useEffect` only
- `navigator.share`: wrap in `typeof navigator !== 'undefined' && navigator.share`

**Test Command:**
```
docker compose restart frontend && curl -s http://localhost:3000/<new-page> | grep -i "error\|500"
```

**Confidence:** High

---

## Skill 2: JWT Payload Completeness Checklist

**Name:** JWT Payload Staleness
**Trigger:** New field added to `User` model in Prisma schema OR new field referenced from `AuthContext` / `useAuth` hook
**Environment:** Backend (Express + JWT) + Frontend (AuthContext.tsx)

**Pattern:**
JWT is minted at login/register and decoded client-side by `AuthContext`. When new user fields are added (e.g. `name`, `points`, `referralCode`), they must be explicitly included in the JWT payload or they will always be `undefined` on the frontend.

**Known instance:** `user.name`, `user.points`, `user.referralCode` were undefined everywhere on the frontend because they were never added to the token payload (fixed Phase 5).

**Steps:**
When adding a new field to the `User` model:
1. Check `packages/backend/src/controllers/authController.ts` — find all `jwt.sign(...)` calls.
2. Add the new field to the payload object in every `jwt.sign(...)` call (typically login + register + any token refresh).
3. Check `packages/frontend/components/AuthContext.tsx` — find the decoded token type and `setUser(...)` call.
4. Add the field to the decoded user type and ensure it's read from the token.
5. If the field should be fetched fresh (not from token), use `GET /api/users/me` instead and merge into user state.

**Edge Cases:**
- JWT tokens are stateless — existing logged-in users will still have old tokens until re-login. For non-critical fields this is acceptable. For security-sensitive fields (role changes), force re-login.
- Token size: keep payload lean. Don't embed large objects or arrays.

**Test Command:**
After login, check the decoded token in browser devtools → Application → Local Storage → decode the JWT at jwt.io and confirm the field is present.

**Confidence:** High

---

## Skill 3: Frontend Stub Audit (Unwired Endpoints)

**Name:** Console-log Stub Left in Production
**Trigger:** New form or action button built on frontend before backend endpoint exists
**Environment:** Frontend (Next.js), Backend (Express)

**Pattern:**
UI is scaffolded with a `console.log()` or `alert()` placeholder where a real API call should go. Backend endpoint is built later but frontend is never wired up.

**Known instance:** Contact form submitted to `console.log` only — never called `POST /api/contact` (fixed Phase 5).

**Steps:**
Before marking any feature complete, grep the relevant page/component for:
```
console.log
alert(
TODO
// placeholder
// wire up
```
If found, wire to the real endpoint before closing the task.

**Edge Cases:**
- Development-only `console.log` for debugging is fine — but remove before declaring a flow complete.

**Test Command:**
```bash
grep -r "console.log\|alert(" packages/frontend/pages/ --include="*.tsx" | grep -v "//.*console"
```

**Confidence:** Medium

---

## Skill 4: API Response Completeness (Missing Related Fields)

**Name:** Related Entity ID/Field Missing from API Response
**Trigger:** Frontend needs a field from a related Prisma model (e.g. `organizer.id`, `user.name`) but it's `undefined` despite existing in DB
**Environment:** Backend (Express + Prisma)

**Pattern:**
Prisma `findMany`/`findUnique` calls only return fields explicitly selected or included. If a related model's field isn't in the `include` or `select` block, it won't appear in the response.

**Known instance:** `organizer.id` was missing from sale list and sale detail responses — frontend couldn't link to organizer profile (fixed Phase 3).

**Steps:**
1. Identify the missing field and which Prisma query returns the parent object.
2. Add `include: { organizer: { select: { id: true, businessName: true } } }` (or equivalent) to the query.
3. Confirm the field appears in the JSON response before wiring the frontend.

**Edge Cases:**
- Avoid `include: { organizer: true }` (returns all fields including sensitive ones). Always use `select` to scope the included relation.
- If the field is deeply nested (e.g. `organizer.user.email`), chain the includes: `include: { organizer: { include: { user: { select: { email: true } } } } }`.

**Test Command:**
```bash
curl -s http://localhost:3001/api/sales | jq '.[0].organizer'
```

**Confidence:** Medium

---

## Skill 5: Unhandled Promise Rejection in Express Controllers

**Name:** Silent Async Failure
**Trigger:** Express route handler uses `async`/`await` without try/catch, or `.then()` without `.catch()`
**Environment:** Backend (Express/Node.js)

**Pattern:**
An unhandled promise rejection causes the Express server to silently fail on that request — the client hangs or gets a 500 with no useful message. In Node 18+, unhandled rejections can crash the process.

**Known instance:** Not yet observed in FindA.Sale — added proactively from pattern analysis.

**Steps:**
1. Wrap all async controller code in try/catch:
   ```ts
   export const myHandler = async (req, res) => {
     try {
       const result = await someAsyncOp();
       res.json(result);
     } catch (err) {
       console.error('[myHandler]', err);
       res.status(500).json({ error: 'Internal server error' });
     }
   };
   ```
2. Or use an async wrapper utility that forwards errors to Express error middleware:
   ```ts
   const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
   router.get('/route', asyncHandler(myHandler));
   ```
3. Never leave `.then()` chains without `.catch()`.

**Test Command:**
```bash
grep -rn "\.then(" packages/backend/src/controllers/ --include="*.ts" | grep -v "\.catch\|async\|await"
```

**Confidence:** High

---

## Skill 6: Missing Auth Middleware on Sensitive Routes

**Name:** Unprotected Mutation Route
**Trigger:** New POST/PUT/PATCH/DELETE route added to backend without an `authenticate` middleware call
**Environment:** Backend (Express + JWT)

**Pattern:**
New routes scaffolded quickly often miss the authenticate middleware. The route accepts requests from anyone — no token needed. Only caught when a security audit runs or a user reports unauthorized behavior.

**Known instance:** Not yet observed — added proactively from pattern analysis.

**Steps:**
1. Every mutation route (POST/PUT/PATCH/DELETE) must include `authenticate` as a middleware:
   ```ts
   router.post('/resource', authenticate, myController);
   ```
2. Public GET routes are acceptable without auth (sale listings, organizer profiles).
3. Organizer-only routes must also include a role check after authenticate:
   ```ts
   router.post('/sales', authenticate, requireRole('ORGANIZER'), createSale);
   ```
4. Admin routes must check for ADMIN role.

**Test Command:**
```bash
grep -rn "router\.\(post\|put\|patch\|delete\)(" packages/backend/src/routes/ --include="*.ts" | grep -v "authenticate\|verifyToken"
```

**Confidence:** High

---

## Skill 7: findMany Without Pagination (DoS Risk)

**Name:** Unbounded Database Query
**Trigger:** Prisma `findMany` call with no `take` limit in a route that serves external requests
**Environment:** Backend (Express + Prisma + PostgreSQL)

**Pattern:**
A `findMany` without `take:` will return every row in the table. As data grows, this causes slow responses, high memory usage, and eventual timeouts. An attacker can trigger it repeatedly to degrade service.

**Known instance:** Not yet observed — added proactively from pattern analysis.

**Steps:**
1. All `findMany` calls in routes that serve external requests must have a `take` limit:
   ```ts
   const items = await prisma.item.findMany({
     where: { saleId },
     take: 100,       // hard cap
     skip: offset,    // pagination support
     orderBy: { createdAt: 'desc' },
   });
   ```
2. Expose `?page=` and `?limit=` query params; cap limit at a reasonable max (e.g. 100).
3. Internal admin queries (analytics, exports) may omit `take` — document the intent.

**Test Command:**
```bash
grep -rn "findMany(" packages/backend/src/controllers/ --include="*.ts" | grep -v "take:\|limit"
```

**Confidence:** Medium

---

## Skill 8: Env Var Missing at Runtime

**Name:** Missing Environment Variable
**Trigger:** New service, third-party integration, or feature added that reads from `process.env` — but the var isn't in `.env.example` or `.env`
**Environment:** Backend (Express/Node.js), Docker Compose

**Pattern:**
Code reads `process.env.MY_NEW_VAR` which is `undefined` at runtime. The error surfaces as a confusing downstream failure — e.g. a Stripe call with `undefined` key, or a Resend email with no `FROM` address.

**Known instance:** Not yet observed in FindA.Sale — added proactively.

**Steps:**
1. Every new `process.env.*` reference must be added to `packages/backend/.env.example` with a descriptive placeholder.
2. Validate required env vars at server startup — fail fast with a clear error:
   ```ts
   const required = ['DATABASE_URL', 'JWT_SECRET', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY'];
   const missing = required.filter(k => !process.env[k]);
   if (missing.length) {
     console.error('Missing required env vars:', missing.join(', '));
     process.exit(1);
   }
   ```
3. After adding the check, run `docker compose restart backend` and confirm startup succeeds.

**Test Command:**
```bash
diff \
  <(grep -oP "^[A-Z_]+(?==)" packages/backend/.env.example | sort) \
  <(grep -oP "^[A-Z_]+(?==)" packages/backend/.env | sort)
```

**Confidence:** High

---

## Skill 9: Docker/pnpm Monorepo Backend Startup Failure

**Name:** Nodemon Not Found in Docker
**Trigger:** `docker compose up` starts but backend container immediately exits or restarts with error `sh: nodemon: not found` or `npx: command not found`
**Environment:** Docker Compose + pnpm workspaces monorepo

**Pattern:**
pnpm does NOT hoist binaries to the workspace root `node_modules/.bin`. If `docker-compose.yml` overrides the Dockerfile CMD with a raw `sh -c "npx nodemon ..."` call from `/app` (the workspace root), npx can't find nodemon — it's only in the package-scoped `node_modules/.bin`, not the root. This looks like a PATH issue but is actually a pnpm workspace scoping issue.

**Known instance:** Phase 9.5 — `docker-compose.yml` was calling `npx nodemon packages/backend/src/index.ts` from `/app`; backend crash-looped on every `docker compose up` (fixed 2026-03-02).

**Steps:**
1. In `docker-compose.yml`, change the backend service command from:
   ```
   sh -c "... && npx nodemon ..."
   ```
   to:
   ```
   sh -c "... && pnpm --filter backend run dev"
   ```
   `pnpm --filter backend run dev` resolves nodemon correctly via workspace scope.

2. Ensure `nodemon` and `tsx` are in `dependencies` (not `devDependencies`) in `packages/backend/package.json` — they must be present in the Docker image at runtime.

3. After any change to `docker-compose.yml` or `package.json`:
   ```powershell
   docker compose down
   docker compose up --build --no-cache
   ```
   `--no-cache` is required — Docker's layer cache will silently skip `pnpm install` otherwise.

**Edge Cases:**
- A plain `docker compose restart backend` does NOT pick up `docker-compose.yml` changes or new dependencies. Always use down + up.
- If the backend `Dockerfile` has `WORKDIR /app/packages/backend`, the compose command override runs from `/app` (workspace root), not the package dir. pnpm `--filter` handles this correctly.

**Test Command:**
```powershell
docker compose logs backend | Select-String "nodemon|Error|started"
```

**Confidence:** High (observed instance, fixed)

---

## Skill 10: Circular Dependency via index.ts Prisma Import

**Name:** TDZ Crash — Controller Imports prisma from index.ts
**Trigger:** Backend crashes on startup or first request with `ReferenceError: Cannot access '<functionName>' before initialization`
**Environment:** Backend (Express + Prisma), any new controller file

**Pattern:**
`index.ts` is the Express entry point — it loads all routes, which import all controllers. If a controller does `import { prisma } from '../index'`, a circular dependency forms: `index.ts` → routes → controller → `index.ts`. This puts named exports from the controller in the Temporal Dead Zone (TDZ) when the routes file first tries to import them, causing an unrecoverable initialization crash.

**Known instance:** `notificationController.ts` line 2 used `import { prisma } from '../index'` — crash: `Cannot access 'subscribeToSale' before initialization` (fixed 2026-03-02).

**Steps:**
1. Replace `import { prisma } from '../index'` at the top of any controller with a local PrismaClient:
   ```ts
   import { PrismaClient } from '@prisma/client';
   const prisma = new PrismaClient();
   ```
2. This is the pattern already used in `stripeController.ts` — follow it consistently.
3. After the fix, restart the backend container and confirm no startup errors:
   ```powershell
   docker compose restart backend
   docker compose logs backend | Select-String "Error|started"
   ```

**Edge Cases:**
- Multiple PrismaClient instances are fine in development — Prisma handles connection pooling.
- The pattern applies to any module that `index.ts` transitively loads. When in doubt, use a local `new PrismaClient()` rather than importing from `index.ts`.
- Symptom can also manifest as a hang (no response) if the error is swallowed by a route-level try/catch.

**Test Command:**
```bash
grep -rn "from '../index'" packages/backend/src/controllers/ --include="*.ts"
```
Any hit is a potential circular dependency — audit each one.

**Confidence:** High (observed instance, fixed; structurally certain to recur as new controllers are added)

---

## Skill 11: Use GitHub MCP for Pushes — Never Default to Manual PowerShell Instructions

**Name:** GitHub MCP Available — Use It
**Trigger:** Any time Claude needs to push, commit, or sync files to GitHub — especially at session wrap
**Environment:** Cowork + GitHub MCP (mcp__github__* tools)

**Pattern:**
Claude defaults to writing "push from PowerShell before next session" in session wrap notes, not realising the GitHub MCP is active and can push files directly to GitHub without any local git auth. The VM cannot run `git push` (HTTPS requires Windows credentials), but `mcp__github__push_files` bypasses this entirely and works every time.

**Known instance:** Session 25 — Claude gave Patrick a full manual push script (2026-03-03). Session 28 wrap — Claude wrote "push from PowerShell" in notes despite GitHub MCP being active (2026-03-03).

**Steps:**
1. At session start AND session wrap: check whether `mcp__github__*` tools are listed in the active session tools. They are injected at session start and visible in the system context.
2. If GitHub MCP is active → use `mcp__github__push_files` to push all changed files directly. Determine owner/repo from `git remote get-url origin` or from context.md (deseee/findasale, branch: main).
3. If GitHub MCP is NOT active → attempt `git push` via Bash. If that fails with auth error → THEN tell Patrick to push from PowerShell.
4. Never write "push from PowerShell" in session wrap notes when MCP is available.
5. At session wrap, always push: session-log.md, STATE.md, context.md, next-session-prompt.md, .last-wrap, and any source files changed during the session.

**Edge Cases:**
- `mcp__github__push_files` pushes file contents directly to GitHub — it does not use local git state. If files were modified in the VM but not yet staged/committed locally, MCP can still push them.
- MCP tools require knowing the current file SHA for updates to existing files — use `mcp__github__get_file_contents` to get the SHA before updating if needed.
- Always commit with a meaningful message describing what changed, not just "session wrap".

**Test:**
Check active tools at session start. If `mcp__github__push_files` appears in the tool list, GitHub MCP is live.

**Confidence:** High (observed twice, structurally certain to recur every session wrap)

---

## Skill 12: DNS Records Must Go in Active Nameserver Provider

**Name:** DNS Records Added to Wrong Provider (Inactive)
**Trigger:** Patrick adds DNS records at a registrar but they show as "inactive" or don't propagate
**Environment:** Spaceship (registrar) + Vercel (DNS/nameserver provider)

**Pattern:**
finda.sale uses Vercel nameservers. Any DNS records (Resend DKIM/SPF/MX/DMARC, A records, etc.) must be added in **Vercel's DNS panel** (team settings → Domains → finda.sale → DNS Records), NOT in Spaceship. Records added in Spaceship are dormant when Vercel nameservers are active.

**Known instance:** Session 25 — Patrick added all 4 Resend records in Spaceship. They showed "inactive" and didn't resolve because Vercel nameservers were active. Records had to be re-added in Vercel DNS panel (2026-03-03).

**Steps:**
1. Before adding any DNS record, confirm which provider holds the active nameservers: `curl -s "https://dns.google/resolve?name=finda.sale&type=NS"` — look for `vercel-dns.com` entries.
2. If Vercel nameservers: add records at `vercel.com/[team]/settings/domains` → click domain → DNS Records.
3. If Spaceship nameservers: add records in Spaceship Advanced DNS panel.
4. Never add records in both — the inactive provider's records are silently ignored.

**Verification:**
```bash
curl -s "https://dns.google/resolve?name=resend._domainkey.finda.sale&type=TXT"
# Status: 0 = resolving. Status: 2 = not found/refused.
```

**Confidence:** High (observed, structurally certain to recur for any new DNS record)

---

## Skill 13: next.config.js Not Bind-Mounted — Requires Frontend Rebuild

**Name:** Config File Change Not Reflected in Docker Frontend
**Trigger:** Changes to `next.config.js` (CSP headers, Workbox rules, image domains, redirects) are not taking effect on `localhost:3000` even after the file is saved
**Environment:** Docker Compose, Next.js frontend container

**Pattern:**
The Docker frontend container bind-mounts `pages/`, `components/`, `styles/`, `lib/`, and `public/` — but NOT `next.config.js` (package root). Changes to `next.config.js` are baked into the image at build time. Hot reload will never pick them up; only a full `docker compose build --no-cache frontend` will.

**Known instance:** Session 27 — CSP `img-src` updated to add `fastly.picsum.photos`. finda.sale (Vercel, rebuilt from GitHub) showed images immediately. localhost:3000 (Docker, old image) showed no images — old CSP still active in the running container (2026-03-03).

**Steps:**
1. After any `next.config.js` change, rebuild the frontend image:
   ```powershell
   docker compose build --no-cache frontend
   docker compose up -d
   ```
2. `--no-cache` is required — Docker layer cache will silently reuse the old build.
3. Hard-refresh `localhost:3000` after the container restarts.

**Edge Cases:**
- Same applies to any file at the package root that is not in the bind-mounted subdirectories: `next.config.js`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`.
- Changes to `packages/frontend/pages/`, `components/`, `styles/`, `lib/`, `public/` are bind-mounted and hot-reload without rebuild.

**Test Command:**
```bash
# Confirm CSP header reflects new values
curl -sI http://localhost:3000 | grep -i "content-security-policy"
```

**Confidence:** High (observed instance; structurally certain to recur on any next.config.js change)

---

## Skill 14: MCP Push + Local Unstaged Files = git pull --rebase Failure

**Name:** Untracked File Conflict After MCP Push
**Trigger:** `git pull --rebase` aborts with "untracked working tree files would be overwritten by checkout"
**Environment:** Windows (PowerShell) + GitHub MCP active during session

**Pattern:**
Claude pushes new files to GitHub via `mcp__github__push_files` or `mcp__github__create_or_update_file` during a session. Those files also exist locally (created by Claude in the VM and synced to Patrick's working copy via bind mount) but were never staged by git. When Patrick tries to `git push`, git rejects it (remote ahead). `git pull --rebase` then aborts because it can't overwrite those locally untracked files during the checkout phase of the rebase.

**Known instances:** 2026-03-04 (Phase 9/11/12 session) — observed twice in the same session.

**Exact error:**
```
error: The following untracked working tree files would be overwritten by checkout:
        packages/backend/src/controllers/pushController.ts
        ...
Please move or remove them before you switch branches.
Aborting
error: could not detach HEAD
```

**Recovery Steps (give Patrick exactly these commands):**
```powershell
# 1. If not already stashed:
git stash

# 2. Remove all files listed in the error (remote already has the canonical versions)
Remove-Item "path/to/file1", "path/to/file2"  # use exact paths from error output

# 3. Pull and rebase cleanly
git pull --rebase

# 4. Restore stash (modified tracked files)
git stash pop

# 5. Push
git push
```

**Prevention:**
- At session end, when using GitHub MCP to push new files, also immediately `git add <those files>` and commit locally so they become tracked. This keeps local and remote state in sync.
- Add a note in session-log.md: "MCP pushed new files [list] — Patrick must `git pull` before next local commit."

**Edge Cases:**
- If `git stash pop` causes conflicts (stash modifies a file that the remote also modified), resolve manually: `git diff` → edit → `git add` → `git rebase --continue`.
- `pnpm-lock.yaml` (274KB) cannot be pushed via GitHub MCP — exceeds parameter size limit (~10KB). Patrick must push it manually via PowerShell.

**Confidence:** High (observed twice same session, structurally certain to recur whenever MCP pushes new files)

---

## Skill 15: PowerShell Treats [ ] in File Paths as Wildcards

**Name:** Remove-Item / Test-Path Fails on Bracket Filenames
**Trigger:** `Remove-Item "path/[id].tsx"` silently does nothing or deletes the wrong file; `Test-Path` returns false for a file that exists
**Environment:** Windows PowerShell + Next.js dynamic routes (e.g. `pages/sales/[id].tsx`)

**Pattern:**
PowerShell's wildcard engine treats `[` and `]` as character-class delimiters. `Remove-Item "pages/affiliate/[id].tsx"` is interpreted as "files matching `pages/affiliate/` + any single char from the set `{i,d}` + `.tsx`" — which matches nothing (or the wrong file). The command exits 0 with no error, giving the illusion the file was deleted.

**Known instance:** 2026-03-04 — `Remove-Item "packages/frontend/pages/affiliate/[id].tsx"` appeared to succeed but file remained; git pull --rebase still failed on that file.

**Fix — always use `-LiteralPath` for Next.js dynamic route files:**
```powershell
Remove-Item -LiteralPath "packages/frontend/pages/affiliate/[id].tsx"
Remove-Item -LiteralPath "packages/frontend/pages/sales/[id].tsx"
# Same for Test-Path, Get-Item, Copy-Item, Move-Item
Test-Path -LiteralPath "packages/frontend/pages/sales/[id].tsx"
```

**Prevention:** Any PowerShell file operation on a path containing `[` or `]` MUST use `-LiteralPath`. Standard double-quoted paths are NOT safe.

**Confidence:** High (observed, structurally certain to recur on all Next.js dynamic route file operations)

---

## Skill 16: Stale Git Lock Files (.git/index.lock, .git/HEAD.lock)

**Name:** Git Lock File Prevents Operations
**Trigger:** `git add` or `git commit` fails with `fatal: Unable to create '.git/index.lock': File exists` or similar for `HEAD.lock`
**Environment:** Windows PowerShell + git

**Pattern:**
A previous git process (e.g. a VS Code git extension, a crashed commit, or a GitHub Desktop background sync) left behind a lock file. Git refuses to proceed until it's removed.

**Known instance:** 2026-03-04 — `git add pnpm-lock.yaml` failed with index.lock; `git commit` then failed with HEAD.lock.

**Fix:**
```powershell
Remove-Item C:\Users\desee\ClaudeProjects\FindaSale\.git\index.lock
Remove-Item C:\Users\desee\ClaudeProjects\FindaSale\.git\HEAD.lock
# Then retry the git command normally
```

Only remove lock files when you're certain no git process is actively running (no git GUI, no ongoing rebase/merge in another terminal).

**Confidence:** High (common git pattern, certain to recur)

---

Last Updated: 2026-03-04
Source: Patterns derived from STATE.md (Phases 2–5), RECOVERY.md documented fixes, and health-scout proactive analysis (2026-03-01).
