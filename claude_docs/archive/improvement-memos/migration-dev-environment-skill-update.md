---
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
| **Local dev** | Native PostgreSQL on Windows | `packages/backend/.env` → `DATABASE_URL=postgresql://...@localhost:5432/findasale` |
| **Production** | Neon PostgreSQL (cloud) | `packages/backend/.env` → `DATABASE_URL=postgresql://neondb_owner:...@neon.tech/neondb` |

**The wrong-database trap:** Always confirm which DB a command will hit before running it.

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

---

## Seeding (Local)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
pnpm run prisma:seed
```

⚠️ Seed clears all data. Run intentionally.
If seed fails with TS type error: run `pnpm run db:generate` first (Prisma client stale).

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

1. **Wrong database?** — Confirm .env points to local vs Neon before any command.
2. **Prisma client stale?** — Run `npx prisma generate` after schema changes.
3. **Hot reload not picking up?** — Kill and restart the native dev process.
4. **pnpm-lock.yaml mismatch on Vercel?** — Run `pnpm install` and commit lockfile.
5. **push.ps1 CRLF issue?** — Commit files FIRST, then run push.ps1 separately.
6. **Production migration not applied?** — `npx prisma migrate deploy` against Neon manually.
