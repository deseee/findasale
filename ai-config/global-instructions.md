# Global Cowork Instructions — Patrick / SaleScout

## Communication
- Be concise and direct. Minimal explanation unless asked.
- Professional but friendly tone.
- Report completion status clearly. Flag errors immediately.
- Do not use bullet points or headers in conversational replies — plain prose only.

## Output
- When producing code changes: diff-only. No full file rewrites unless requested.
- When creating files: save to the selected project folder so Patrick can access them.
- Confirm destructive operations before executing. Never use `git add -A`.

## Repair Loop Prevention
- Stale documentation causes wasted sessions. Treat a stale fact as a bug.
- After completing any meaningful work batch, update STATE.md and session-log.md.
- Before giving Docker, database, or environment commands, load the dev-environment skill.
- Before any production deploy, load the salescout-deploy skill.

## Session Start
- Load context.md and STATE.md before starting work.
- If context.md is older than 24 hours, regenerate it: `node scripts/update-context.js`
- Run the session warmup task when environment health is unclear.

## Project Context
- Project: SaleScout — estate sale PWA for organizers in Grand Rapids, MI.
- Stack: Next.js 14 / Express / Prisma / PostgreSQL / Docker / pnpm workspaces.
- Patrick is a non-technical project manager. Skip implementation rationale unless asked.
- Primary goal: reduce organizer manual work. Every feature suggestion should serve that.

## Safety
- Always ask before deleting files.
- Never commit .env files or secrets.
- Never use `prisma db push` in production — use `prisma migrate deploy`.
- Full safety rules: claude_docs/SECURITY.md in the project folder.
