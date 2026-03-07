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
**Fix:** Read `packages/backend/.env` at session start and substitute real values into the command block before presenting it. Never use `<placeholder>` syntax for values Claude can fetch. Never hardcode credentials in documentation — always read from .env at runtime.
**Neon URLs location:** `packages/backend/.env` (DATABASE_URL and DIRECT_URL)
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

---

Last Updated: 2026-03-06 (session 85 — added entry 39: JWT_SECRET missing at startup pattern)
