---
version: 1
last_updated: 2026-03-09 (Session 108)
name: dev-environment
description: >
  Patrick's FindA.Sale development environment reference. Critical for avoiding
  the wrong-database trap, stale Prisma client, wrong terminal syntax, and
  native vs production environment confusion. Load this skill before writing any
  shell commands, file paths, or debugging advice. Trigger whenever the session
  involves: database operations, seeding, migrations, Prisma, hot reload, env
  vars, AI models, or any "why isn't this showing up" / "command not working"
  question. Also trigger when Patrick mentions terminals, rebuilding, restarting,
  nodemon, or anything that sounds like an environment or ops problem.
  Do not load for purely doc-writing or planning sessions.
---

# Patrick's Dev Environment

Read this before issuing any shell commands or database operations.
Getting these details wrong wastes entire sessions.

⚠️ Docker is RETIRED. Do not give Docker commands. The stack is native Windows.

## Self-Correction Clause

If you are a subagent (findasale-architect, findasale-dev, findasale-ops, or any other)
and you find yourself about to output a shell command, PowerShell command, Prisma command,
migration instruction, or environment variable guidance — stop and verify this skill has
been loaded in the current session. If it has not, load it immediately (invoke
`Skill('dev-environment')`) before issuing the command. This applies even mid-sprint,
in follow-up corrections, and in handoff responses. No exceptions.

---

## Host Machine

- **OS:** Windows 10
- **Terminal:** PowerShell (all commands)
- **Package manager:** pnpm (workspaces monorepo)
- **Project root:** `C:\Users\desee\ClaudeProjects\FindaSale`
- **Shell syntax:** Use `;` to chain commands, NOT `&&`. Backtick `` ` `` for line continuation.

---

## Running the App (Native)

No Docker. Services run natively on Windows.

```powershell
# Backend (Express, port 3001)
pnpm --filter backend run dev

# Frontend (Next.js, port 3000)
pnpm --filter frontend run dev
```

Hot reload is handled by nodemon (backend) and Next.js (frontend). No container restart needed for source file changes.

---

## Database Setup

Two databases in use:

| Context | Database | URL source |
|---------|----------|------------|
| **Local dev** | Native PostgreSQL on Windows | `packages/backend/.env` → active `DATABASE_URL=postgresql://...@localhost:5432/findasale` |
| **Production** | Neon PostgreSQL (cloud) | `packages/backend/.env` → **commented out** `# DATABASE_URL=postgresql://neondb_owner:...@neon.tech/neondb` |

**The wrong-database trap:** Always confirm which DB a command will hit before running it.

⚠️ **Neon URLs are commented out in `.env`.** The active `DATABASE_URL=` line is local. Neon URLs are on lines starting with `# DATABASE_URL=` and `# DIRECT_URL=`. Claude must read the file from the VM and inline the real values — never use `Select-String "^DATABASE_URL="` as it returns the local URL.

⚠️ **Never hardcode Neon credentials in docs.** Read them from `packages/backend/.env` at runtime.

---

## Prisma Commands (Native Windows)

Run all Prisma commands from `packages/database/`:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database

npx prisma generate       # Regenerate client after schema change
npx prisma migrate dev --name <name>    # Create + apply migration (local dev)
npx prisma migrate deploy               # Apply migrations (production/Neon)
npx prisma studio                       # Open Prisma Studio (local DB)
```

**Never run `prisma migrate reset` against production.** Local dev only.

### migrate dev pre-flight (local)

Before running `prisma migrate dev`:

1. **Check for session env var override**: Run `$env:DATABASE_URL` in PowerShell.
   If it returns anything other than empty or localhost, it will override `.env` and
   hit the wrong database. Prisma does NOT warn about this — it silently ignores `.env`.
   Fix: `$env:DATABASE_URL="postgresql://findasale:findasale@localhost:5432/findasale"`

2. **CREATEDB privilege (one-time setup)**: The `findasale` user must have CREATEDB
   for `prisma migrate dev` to create its shadow database. Run once after any Postgres reinstall:
   ```powershell
   psql -U postgres -c "ALTER USER findasale CREATEDB;"
   ```
   Error if missing: `P3014 permission denied to create database`

### migrate deploy pre-flight (Neon)

Before running `prisma migrate deploy` against Neon:

1. Claude reads `packages/backend/.env` from the VM — finds the `# DATABASE_URL=` commented Neon line
2. Claude inlines the actual URL directly into the command — no PowerShell extraction
3. Verify the expected migration folder exists in `prisma/migrations/` before running

---

## Seeding (Local)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
pnpm run prisma:seed
```

⚠️ Seed clears all data. Run intentionally.
If seed fails with TS type error: run `pnpm run db:generate` first (Prisma client stale).
If seed fails with null constraint on `embedding`: the Item create is missing `embedding: []` — add it.

---

## Adding a New Package

```powershell
pnpm --filter backend add <package>
pnpm --filter frontend add <package>

# Commit pnpm-lock.yaml before Vercel deploy
git add pnpm-lock.yaml
git commit -m "chore: update lockfile for <package>"
.\push.ps1
```

---

## Prisma Migrations — When to Use Which

| Command | When | Risk |
|---------|------|------|
| `prisma migrate dev` | Local dev schema changes | Safe — creates migration file |
| `prisma migrate deploy` | Production (Neon) | Safe — never drops data |
| `prisma generate` | After any schema change | No DB changes, updates TS client |
| `prisma db push` | Prototyping only | ⚠️ Can drop columns. Never in production. |

---

## AI Models (Cloud Pipeline)

Docker-based image-tagger is **retired**. Cloud AI pipeline is live:

| Step | Service | Purpose |
|------|---------|---------|
| Photo analysis | Google Cloud Vision | Labels, objects, colors |
| Structured tagging | Claude Haiku | Title, description, category, condition |
| Fallback | Ollama (local, optional) | Local dev only |

---

## Git Push Workflow

**Never use raw `git push`.** Always use `.\push.ps1`:

```powershell
git add packages/backend/src/controllers/someFile.ts
git commit -m "fix: description"
.\push.ps1
```

**CRLF rule:** Run `git add + git commit` BEFORE `.\push.ps1` — never chain them.

---

## Common Pitfalls

1. **Wrong database?** — Confirm `.env` points to local vs Neon before any command.
2. **Prisma client stale?** — Run `npx prisma generate` after schema changes.
3. **Hot reload not picking up?** — Kill and restart the native dev process.
4. **pnpm-lock.yaml mismatch on Vercel?** — Run `pnpm install` and commit lockfile.
5. **push.ps1 CRLF issue?** — Commit files FIRST, then run push.ps1 separately.
6. **Production migration not applied?** — `npx prisma migrate deploy` against Neon manually.
7. **`$env:DATABASE_URL` override?** — Session-level env var silently overrides `.env`. Check with `$env:DATABASE_URL` before any Prisma command. See self-healing entry #47.
8. **P3014 shadow database denied?** — `findasale` user needs CREATEDB: `psql -U postgres -c "ALTER USER findasale CREATEDB;"` — one-time fix. See self-healing entry #46.
