# Self-Healing Skills

Compact pattern library. Trigger → Fix → Test.
Only entries with ≥2 occurrences OR structurally certain to recur.

---

### 1. SSR Window/Document Guard
**Trigger:** Next.js page uses `window`/`document`/`navigator`/`location` outside `useEffect`
**Fix:** Move to `useEffect` + `useState`. Dynamic import with `{ ssr: false }` for libs like Leaflet.
**Test:** Restart frontend natively (`pnpm dev` from repo root or restart the frontend process in PowerShell), then open `http://localhost:3000/<page>` in browser and confirm no 500/error.

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

### 9. pnpm Backend Startup Failure
**Trigger:** Backend process exits with `nodemon: not found` during native dev startup
**Fix:** Use `pnpm --filter backend run dev` (not `npx nodemon`). Ensure nodemon+tsx in `dependencies`.
**Test:** `pnpm --filter backend run dev` should start cleanly and watch for changes.

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

### 13. Frontend Config Changes Not Reloading
**Trigger:** Changes to next.config.js, tsconfig.json, tailwind.config.js, or postcss.config.js are not reflected in the running dev server
**Fix:** Stop the frontend process (`Ctrl+C` if running via `pnpm --filter frontend run dev`). Restart with `pnpm --filter frontend run dev`. Hard refresh in browser (Ctrl+Shift+R).
**Also applies to:** CSS, module paths, bundler settings

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

### 18. Module Not Found in Frontend Development
**Trigger:** New directory created under `packages/frontend/` but Next.js dev server doesn't see it (Module not found error)
**Fix:** Restart the frontend dev process. Next.js watches the entire `packages/frontend/` directory by default. Ensure the directory exists on disk and the import path matches the actual file location.
**Prevention:** Always test the import path matches the actual file structure before committing.

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
**Fix:** Always specify the target terminal. PowerShell: use `;` to chain, backtick (`` ` ``) for line continuation. Docker exec / Linux: use `&&` to chain, `\` for continuation. Load dev-environment skill before giving ANY shell command. See entry 40 for detailed PowerShell/bash distinction and examples.
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
**Fix:** Read `packages/backend/.env` at session start and substitute real values into the command block before presenting it. Never use `<placeholder>` syntax for values Claude can fetch. Never hardcode credentials in documentation — always read from .env at runtime.
**Neon URLs location:** `packages/backend/.env` lines 24–25 — ⚠️ COMMENTED OUT with `#`. The active `DATABASE_URL=` (line 28) is the LOCAL url. `Select-String "^DATABASE_URL="` always returns local. Claude must read the file from the VM directly, strip the leading `# `, and inline the real Neon values — never use PowerShell extraction for this.
**Test:** Patrick can copy-paste command block without editing anything.

### 29. Local/GitHub Drift — git pull --rebase Blocked by Unstaged Changes
**Trigger:** `git pull --rebase` fails with "unstaged changes" — even after `git restore <file>` or `git stash`. Root cause: MCP pushes files directly to GitHub without touching Patrick's local repo, causing HEAD to fall behind. CRLF conversions and case-rename artifacts in git's index create unstaged changes that survive stash.
**Nuclear fix (use when stash/restore loops fail):**
```powershell
git fetch origin
git reset --hard origin/main
```
This discards all local state and matches remote exactly. Untracked files are preserved. Use when `git stash` + `git pull --rebase` loops 3+ times without resolution.
**Lighter fix (when only a single file is blocking):**
```powershell
git stash
git pull --rebase
git stash pop
git push
```
**Prevention:** After any MCP push mid-session, note in session-log so Patrick pulls before next local commit.

### 30. .gitattributes CRLF Rule Creates Perpetual Dirty File
**Trigger:** Adding `*.md text eol=lf` to `.gitattributes` causes git to see existing committed markdown files as perpetually modified, even after `git restore` or `git checkout --`. `git status` flip-flops between lowercase and uppercase filename.
**Root cause:** The committed blob in the index has CRLF. After `.gitattributes` rule is added, git smudges the checkout to LF but still compares working tree (LF) against index blob (CRLF) = always dirty. `git checkout -- file` re-applies smudge but doesn't fix the index.
**Fix:** Renormalize the index to force the new rule into the committed blob:
```powershell
git add --renormalize .
git commit -m "chore: renormalize all line endings per .gitattributes"
git push
```
If `git add --renormalize` fails because unstaged changes block it, use nuclear fix from entry #29 first.
**Test:** `git status` should show clean after commit.

### 31. Git Case-Sensitivity Duplicate Index Entries (Windows)
**Trigger:** Same file appears in `git status` as both `roadmap.md` and `ROADMAP.md` (different casing). `git checkout -- roadmap.md` doesn't clear the modification. `git add --renormalize claude_docs/roadmap.md` succeeds but shows `ROADMAP.md` as still dirty after.
**Root cause:** A file was renamed (case-only) on a case-insensitive Windows filesystem. Git's index contains two entries for what Windows sees as the same file. `core.ignoreCase=true` doesn't prevent this split — it just makes the rename silently ambiguous. Each checkout/restore only touches one index entry.
**Fix:** Nuclear reset is the only reliable fix. Don't attempt to repair via checkout/restore/renormalize — the duplicate entries will survive.
```powershell
git fetch origin
git reset --hard origin/main
```
**Prevention:** Never rename files with case-only changes on Windows. If a rename is needed, use `git mv old.md OLD.md` on Linux/Mac, not on Windows.

### 32. pnpm Frozen Lockfile Mismatch — Vercel/CI Build Fails
**Trigger:** Vercel (or any CI using `pnpm install --frozen-lockfile`) fails with `ERR_PNPM_OUTDATED_LOCKFILE`. Message: "specifiers in the lockfile don't match specs in package.json". Happens after Claude adds a new package to `package.json` without running `pnpm install` on Windows to update `pnpm-lock.yaml`.
**Root cause:** Docker rebuilds with `--no-cache` bypass the frozen lockfile check (Docker uses its own install step). Vercel uses `--frozen-lockfile` strictly and fails if lockfile doesn't match `package.json`.
**Fix:**
```powershell
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: update lockfile for <package-name>"
git push
```
**Prevention:** After Claude adds any package to `package.json`, explicitly note in session-log: "Patrick must run `pnpm install` and commit `pnpm-lock.yaml` before Vercel deploy."

### 33. MCP File Size Pre-Check Before Push
**Trigger:** About to push a file via `mcp__github__push_files` that exceeds 25,000 tokens combined content. Large controllers (itemController.ts ~835 lines, saleController.ts) commonly exceed this.
**Root cause:** CLAUDE.md §5 sets hard limit: ≤5 files AND ≤25k tokens per MCP push. Agents spawned for feature work don't always load CLAUDE.md and miss this constraint.
**Fix:** Before any MCP push, estimate token count (rough: 1 token ≈ 4 chars). If total ≥ 25k tokens or >5 files, defer to Patrick with PowerShell push instructions.
**Prevention:** At session start, any agent doing feature work must be told the MCP push limits in its prompt. Never attempt to push large files (>500 lines) via MCP — always hand off to Patrick.
**Known instance:** Session 79 — itemController.ts (~835 lines, ~30k tokens) failed MCP size check.

### 34. autocrlf + git rebase Conflict on Windows
**Trigger:** Windows repo with `core.autocrlf=true`. `git pull --rebase` fails with "unstaged changes" on `.md` or `.ts` files that were committed with LF but checked out as CRLF. `git stash`, `git restore .`, and `git reset --hard HEAD` all fail to clear them.
**Root cause:** autocrlf converts LF→CRLF in working tree on checkout. Git sees the CRLF working-tree file as modified vs the LF index entry. Rebase requires a perfectly clean tree and rejects these phantom modifications.
**Fix (immediate):** `git pull --no-rebase origin main` — merge doesn't require a clean working tree for non-conflicting files.
**Fix (alternative):** Commit the CRLF files first (`git add <files> && git commit -m "chore: normalize line endings"`), then rebase succeeds because the tree is clean.
**Fix (nuclear):** `git stash clear && git reset --hard origin/main` — loses local commits, use only as last resort.
**Prevention:** Configure `.gitattributes` with `* text=auto eol=lf` for all text files. This prevents the CRLF→LF conversion cycle entirely.
**Known instance:** Session 79 — image-tagger docs blocked 5+ rebase attempts. Resolved with commit + `git pull --no-rebase`.

### 35. Roadmap Version Regression via Subagent File Overwrite
**Trigger:** A subagent pushes files to GitHub via MCP that include a stale version of a documentation file. The MCP push overwrites the current version without checking git history.
**Root cause:** Subagents work in isolation and may read a cached/old version of a file, then include it in a batch push. The batch push overwrites the GitHub version with the stale content.
**Fix:** After any batch MCP push, verify critical doc files (ROADMAP.md, STATE.md) still contain expected content. Use `mcp__github__get_file_contents` to spot-check.
**Prevention:** Never include documentation files in feature-batch MCP pushes. Push code files only. Update docs in a separate, deliberate commit.
**Known instance:** Session 78 — commit 1061965 (CD2-P2/P3 batch) overwrote v11 roadmap with stale v3 compressed version. Not detected until session 79.

### 36. Always Use push.ps1 — Never Raw git push
**Trigger:** Session wrap or any instruction to Patrick about pushing code
**Fix:** Always tell Patrick to use `.\push.ps1` instead of `git push origin main`. The script self-heals: clears index.lock, CRLF phantom changes, fetches + merges (NOT rebase — rebase is broken with autocrlf on Windows), auto-retries on rejection.
**Prevention:** Never give Patrick a raw `git push` command. Never suggest `git pull --rebase`. The push script replaces both.
**Known instance:** Session 80 — created after 10+ failed manual push attempts caused by autocrlf + rebase conflicts.

### 37. Session Ended Without Committing Work
**Trigger:** Claude finishes meaningful work, updates documentation, but leaves git status dirty without committing changes.
**Fix:** Before ending ANY session, commit all changed files: `git add [specific files] && git commit -m "[message]"`. Verify with `git status --short` (should be empty). Run `bash scripts/session-wrap-check.sh` (or equivalent) and confirm it passes. Do not end the session if the check fails.
**Prevention:** Session wrap protocol (CORE.md §15) is mandatory. Every agent ends with the wrap checklist. Subagents report "Working tree clean" before handoff.
**Known impact:** Sessions that end dirty cause drift discovery in the next session, wasted recovery time, and GitHub/local sync mismatches.

### 38. MCP Push Mid-Session + Local Edit at Wrap = Merge Conflict
**Trigger:** One agent MCP-pushes files early in session (e.g. `records-audit-*.md`, `patrick-language-map.md`). Wrap protocol later locally edits the same files. Patrick runs `.\push.ps1` → merge conflict when `git merge origin/main` runs.
**Root cause:** `mcp__github__push_files` writes directly to GitHub without updating Patrick's local tree. When wrap commits local changes to the same files, GitHub has a newer version → `git merge origin/main` detects divergence → conflict.
**Prevention (primary):** Run `git fetch origin main` immediately before staging wrap files. This syncs local HEAD with GitHub before any local edits happen.
**Prevention (secondary):** Never MCP-push files that will be edited again at wrap time (session-log.md, context.md, patrick-language-map.md). Push those via PowerShell + `.\push.ps1` instead.
**Fix (if conflict happens):**
```powershell
git checkout --theirs [conflicted-file]
git add [conflicted-file]
git commit --no-edit
.\push.ps1
```
**Known instance:** Session 84 — Records agent MCP-pushed `patrick-language-map.md` and `claude_docs/archive/records-audit-2026-03-06.md` early. Wrap protocol locally edited `patrick-language-map.md` + `context.md` later. Patrick had to run `git checkout --theirs` on both files.

### 39. JWT_SECRET Missing at Startup
**Trigger:** Backend crashes at boot with "JWT_SECRET is not set" error, or all auth endpoints return 401 Unauthorized with valid credentials
**Root cause:** The `JWT_SECRET` environment variable is missing in Railway / local .env file. The startup guard in `packages/backend/src/index.ts` validates this and fails fast if not present.
**Fix:** Verify JWT_SECRET is set in:
- **Production (Railway):** Add `JWT_SECRET` to Railway Variables with a strong random string (min 32 chars)
- **Local dev:** Add `JWT_SECRET=<random-string>` to `packages/backend/.env`
- **Local test:** Verify with `echo $JWT_SECRET` (or `$env:JWT_SECRET` in PowerShell)
**Test:** Start backend cleanly: `pnpm --filter backend run dev` should log "Server running on..." without "JWT_SECRET" errors. Login with valid credentials should return 200 (not 401).
**Prevention:** JWT_SECRET is non-negotiable for startup — it gates all token signing/verification. Never remove the startup guard in index.ts.

### 40. Never Use && in PowerShell Commands
**Trigger:** Claude gives Patrick shell commands with `&&` (bash syntax) instead of PowerShell syntax. PowerShell parser fails with error: "The token '&&' is not a valid statement separator in this version."
**Root cause:** `&&` is Unix/bash syntax for command chaining. PowerShell uses `;` (same-line) or separate lines. When git commands or multi-step tasks are given to Patrick, Claude must always use PowerShell syntax.
**Pattern:** The problem occurred in session 85 when Claude provided:
```
git checkout -- claude_docs/CORE.md claude_docs/strategy/roadmap.md
git fetch origin && git merge origin/main --no-edit
.\push.ps1
```
The `&&` on line 2 caused parse error. Correct syntax:
```powershell
git checkout -- claude_docs/CORE.md claude_docs/strategy/roadmap.md
git fetch origin
git merge origin/main --no-edit
.\push.ps1
```
**Fix:** Before giving Patrick ANY shell command, check the environment context. If Patrick is on Windows (which he is — he uses PowerShell and `.\push.ps1`), use PowerShell syntax:
- Chain on same line with `;` (semicolon)
- Or use separate lines (safer, more readable)
- Never use `&&` (bash only)
- Never use `\` for line continuation (bash only — use backtick `` ` `` in PowerShell)
**Prevention:** Load dev-environment skill before giving shell commands. The skill includes target OS and shell syntax rules. Patrick uses PowerShell exclusively.
**Test:** Before sending command block, mentally execute it in PowerShell — does every statement parse?

### 41. ESM-Only npm Package in CJS Backend
**Trigger:** Backend crashes at startup with `Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported`. Typically happens after a major version bump of a package that dropped CommonJS support (e.g., `uuid@13+`, `node-fetch@3+`, `chalk@5+`).
**Root cause:** The backend compiles to CJS (`"module": "commonjs"` in tsconfig). When a dependency is ESM-only, Node.js can't `require()` it at runtime even though TypeScript compiled fine.
**Fix:** Replace the offending package with a Node built-in or a CJS-compatible alternative:
- `uuid` → `import { randomUUID } from 'crypto'` (Node built-in, no dependency needed)
- `node-fetch` → use native `fetch` (Node 18+) or `axios`
- Remove the package from `package.json` and `devDependencies` entirely
**Test:** `grep -r "from 'uuid'\|require.*uuid" packages/backend/src/ --include="*.ts"` → should return nothing after fix.
**Prevention:** Before upgrading any package to a major version, check if it dropped CJS support. Check the package's changelog or `package.json` `"type": "module"` field.

### 42. package.json + pnpm-lock.yaml Out of Sync in Railway Build
**Trigger:** Railway build fails with `ERR_PNPM_OUTDATED_LOCKFILE — Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with packages/backend/package.json`. The lockfile has specifiers that don't match the current package.json.
**Root cause:** package.json was changed (dependency added or removed) but `pnpm install` was not run locally, so pnpm-lock.yaml wasn't regenerated and pushed along with it. Railway uses `--frozen-lockfile` which strictly enforces that lockfile and package.json agree.
**Fix:**
1. Run `pnpm install` from the monorepo root to regenerate pnpm-lock.yaml
2. Commit BOTH package.json and pnpm-lock.yaml together: `git add packages/backend/package.json pnpm-lock.yaml`
3. Push via `.\push.ps1`
**Escape hatch (if lockfile is too stale to reconcile):** Temporarily change Dockerfile line to `--no-frozen-lockfile`, push via MCP to unblock Railway, then fix properly.
**Prevention:** The rule is absolute — **any change to package.json must be accompanied by a pnpm-lock.yaml update in the same commit.** Never push a package.json change alone.

### 43. Schema Field Added Without Migration (Schema Drift → P2022)
**Trigger:** Backend logs `PrismaClientKnownRequestError: The column 'Model.field' does not exist in the current database. code: 'P2022'`. Usually appears in repeated polling errors (e.g., `getUnreadCount`, cron jobs).
**Root cause:** A field was added to `schema.prisma` but `prisma migrate dev --name add_field` was never run. The Prisma client was generated from the updated schema and tries to query the column, but Neon doesn't have it because no migration was ever applied.
**Fix:**
1. Create migration manually: `mkdir packages/database/prisma/migrations/YYYYMMDDNNNNNN_add_field && echo 'ALTER TABLE "Model" ADD COLUMN IF NOT EXISTS "field" TEXT;' > .../migration.sql`
2. Apply to Neon: `DATABASE_URL=... DIRECT_URL=... prisma migrate deploy` (can run from VM using credentials in `packages/backend/.env`)
3. Push migration file to GitHub via MCP
**Prevention:** After any schema.prisma change, immediately run `prisma migrate dev`. Never add fields to schema without a corresponding migration. The deploy checklist should include `prisma migrate status` to catch drift.

### 44. Railway Not Triggering New Build After Consecutive Pushes
**Trigger:** After pushing to main, Railway does not start a new deployment. Push.ps1 shows commits landing on GitHub but Railway stays on the old failed build. Empty commits (`git commit --allow-empty`) also don't help.
**Root cause:** Railway's GitHub webhook may be rate-limiting or throttling after rapid successive commits. Also: Railway's "Redeploy" button reruns the *same* existing deployment — it does NOT pull new code from GitHub.
**Fix:** Push a **real file change** via MCP to force a new webhook event. Changing a line in `Dockerfile.production` (e.g., adding a comment) reliably triggers a fresh Railway build. Use `mcp__github__create_or_update_file` directly.
**Prevention:** For Railway webhook unstick, always use a meaningful file change (not empty commit). Dockerfile is the lowest-risk target. After Railway is green, revert the comment if desired.

### 45. Read Credentials from .env Before Asking Patrick
**Trigger:** During deploy/migration task, Claude asks Patrick for DATABASE_URL, JWT_SECRET, or other env vars instead of reading them from the VM.
**Root cause:** Claude has access to `packages/backend/.env` from the VM and it contains all production credentials. Asking Patrick to "set" or "provide" credentials wastes a turn and breaks flow when Claude could read them directly.
**Fix:** At task start, read `packages/backend/.env` into context. Before any command requiring credentials, substitute actual values from the file into the command block. Never use `<placeholder>` syntax for values that exist in .env.
**Example:** For `prisma migrate deploy`, read the file and inline the real Neon URL directly — no placeholders.
**⚠️ Neon URL caveat:** Neon URLs are on commented lines (`# DATABASE_URL=`, `# DIRECT_URL=`). Read the file from the VM and strip the `# ` prefix. Do NOT use `Get-Content | Select-String "^DATABASE_URL="` — it returns the local url, not Neon.
**Prevention:** When giving Patrick any database or deploy command, it must be copy-paste-ready with no manual credential lookup required. If you're about to write `[set YOUR_DATABASE_URL here]`, read .env first instead.

---

### 46. Prisma migrate dev — P3014 Shadow Database CREATEDB Permission Denied
**Trigger:** `P3014 permission denied to create database` during `prisma migrate dev` on native Windows Postgres
**Root cause:** `findasale` user lacks CREATEDB privilege. `prisma migrate dev` requires creating a shadow database and will fail without it.
**One-time fix:**
```powershell
psql -U postgres -c "ALTER USER findasale CREATEDB;"
```
Permanent — survives Postgres restarts. Only needs to be re-run after a full Postgres reinstall.

### 47. Session-Level $env:DATABASE_URL Silently Overrides .env (Prisma on Windows)
**Trigger:** "URL must start with postgresql://" Prisma validation error even though `.env` is correct, OR `prisma migrate dev` connects to the wrong database
**Root cause:** `$env:DATABASE_URL` set in the current PowerShell session takes precedence over `.env`. Prisma does NOT warn — it silently ignores `.env` when a shell env var exists.
**Diagnosis:** Run `$env:DATABASE_URL` in PowerShell. If it returns anything unexpected, that's the culprit.
**Fix:** Explicitly set the correct value before the Prisma command:
```powershell
$env:DATABASE_URL="postgresql://findasale:findasale@localhost:5432/findasale"
$env:DIRECT_URL="postgresql://findasale:findasale@localhost:5432/findasale"
npx prisma migrate dev --name <name>
```

### 48. git status Before Every git add List — Never Compile from Memory
**Trigger:** `push.ps1` reports "Uncommitted changes detected" after a commit that seemed complete
**Root cause:** Claude compiled the `git add` list from memory, not `git status`. Files modified during the sprint outside Claude's direct edits get missed. Also: VM-level `rm` does not stage a deletion in git — tracked file deletions require `git rm`.
**Fix:** Before giving Patrick any `git add` list, Claude runs `git status` from the VM and uses that output as the authoritative list.
**Deletion rule:** Always `git rm <file>` for tracked file removals, never `rm <file>`.
**Commit grouping:** Feature/code files in one commit, doc/wrap files in a separate commit.

### 49. Migration Pre-Flight Checklist
**Trigger:** Any `prisma migrate dev` or `prisma migrate deploy` command about to be issued
**Pre-flight for `migrate dev` (local):**
1. Run `$env:DATABASE_URL` in PowerShell — if set to anything other than localhost, clear or override it (see entry #47)
2. Confirm `findasale` user has CREATEDB — one-time fix in entry #46
3. Confirm the new model/field exists in schema.prisma before running

**Pre-flight for `migrate deploy` (Neon):**
1. Claude reads `packages/backend/.env` from VM — finds the commented `# DATABASE_URL=` Neon line
2. Claude inlines the actual URL directly into the command — no PowerShell extraction (see entry #28)
3. Verify expected migration folder exists in `prisma/migrations/` before running

### 50. Merge Conflict Auto-Resolution — Never Hand Off to Patrick
**Trigger:** Conflict markers (`<<<<<<< HEAD` / `=======` / `>>>>>>>`) appear in any file during wrap, push, or mid-session merge
**Root cause:** MCP pushed file X mid-session, then local wrap edits the same file. Or two agents touched the same doc. Patrick is non-technical — he cannot and should not resolve git conflicts manually.
**Correct behavior:**
1. Read the conflicted file with Read tool
2. Identify conflict markers and understand both sides
3. Decide which version is correct (usually: remote/origin version for docs, or merge both if compatible)
4. Use Edit tool to remove markers and keep correct content
5. Push fixed file via GitHub MCP (`mcp__github__push_files`) with message "chore: resolve merge conflict in [file]"
**Never say:** "Manually resolve the conflict" or "Remove the markers and re-run push.ps1"
**Always do:** Read → Edit → Push. All three steps happen in the VM with no Patrick involvement.
**Why this exists:** Session 89 — Claude told Patrick to manually fix conflict markers in session-log.md. Patrick: "I shouldn't have to manually fix your mistakes." This is the highest-priority self-healing pattern because it directly violates the non-technical PM principle.

### 51. Non-ASCII Characters in PowerShell Scripts Cause Parse Failure
**Trigger:** PowerShell script fails with "The string is missing the terminator" or "Missing closing '}'" at a line far from the actual problem
**Root cause:** Non-ASCII characters (em dash U+2014, curly quotes, etc.) in `.ps1` string literals. PowerShell reads the UTF-8 file using Windows-1252 encoding in some environments. The UTF-8 byte sequence for em dash is E2 80 94 — byte 0x94 in Windows-1252 is the RIGHT DOUBLE QUOTATION MARK, which terminates the string early. All subsequent code is parsed as inside a string, so braces and quotes are miscounted.
**Fix:** Replace the non-ASCII character with an ASCII equivalent:
- Em dash `-` → hyphen `-`
- Curly quotes `"` `"` → straight quotes `"`
- Any Unicode in string literals → ASCII only
Push the fixed file via GitHub MCP, then tell Patrick: `git fetch origin ; git merge origin/main --no-edit`
**Prevention:** Never use non-ASCII characters inside PowerShell string literals. Comments are safer but still risky. ASCII-only is the rule for all `.ps1` files.
**Known instance:** Session 90 - em dash in push.ps1 line 116 caused parser crash, breaking the whole script.

### 52. Wrap-Only Doc Files MCP-Pushed Mid-Session - Guaranteed Merge Conflict at Wrap
**Trigger:** git merge origin/main at wrap detects conflicts in STATE.md, session-log.md, .last-wrap, or next-session-prompt.md. push.ps1 blocks because staged files have conflict markers.
**Root cause:** An agent MCP-pushed a wrap-only doc mid-session. The wrap protocol (or a later local edit) also modifies the same file. When Patrick runs .\push.ps1, the merge pulls the MCP version from GitHub and finds divergence.
**Fix (push.ps1):** Now automatic. push.ps1 detects conflicts in claude_docs/ and context.md, resolves with --theirs, commits, and continues. No Patrick involvement needed.
**Fix (agent behavior):** Never MCP-push these four files mid-session: STATE.md, session-log.md, .last-wrap, next-session-prompt.md. All changes to these files must go via Patrick's .\push.ps1 at session end.
**Prevention:** Before any MCP push, verify the target file is not in the wrap-only list. CORE.md section 10 Standing File Rules enforces this.
**Known instance:** Session 90 - all four wrap-only doc files MCP-pushed mid-session, then conflicted at wrap commit. Required manual resolution across 4 files before push could succeed.

Last Updated: 2026-03-07 (session 90 - added entry #52: wrap-only doc files causing merge conflicts; resolved entry #51 conflict markers)
