# Next Session Prompt — S240

**Date:** 2026-03-22 (S239 wrap complete)
**Status:** Workflow automation layer built. Bug fixes on local disk. Scheduled tasks active.

---

## Patrick Actions Before S240

1. **Push sale detail fix** (already on local disk):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git stash
git pull
git stash pop
git add packages/frontend/pages/sales/[id].tsx
git commit -m "fix: sale detail layout - remove duplicate photos, move About into left column, reorder Items before UGC/Map"
.\push.ps1
```
Note: `git pull` will conflict with other local changes. Use `git stash` / `git stash pop` to safely merge.

2. **Install 3 new/updated skills** from `claude_docs/skills-package/`:
   - `findasale-polish-SKILL.md` → new skill (Polish Agent)
   - `dev-skill-patch-S239.md` → append to existing `findasale-dev/SKILL.md`
   - `qa-skill-patch-S239.md` → append to existing `findasale-qa/SKILL.md`

3. **Run `weekly-full-site-audit` manually once** from Scheduled Tasks in sidebar to pre-approve Chrome MCP tools (otherwise automated Sunday runs will pause on permission prompts)

4. **Resolve local git conflict** — 9 files with local changes that conflict with remote (Layout.tsx, NotificationBell.tsx, hub pages, item detail, workspace, profile, shopper dashboard, disputes). These are likely stale local edits from previous sessions. Review and either commit or discard.

---

## S240 Priority

**1. Verify S239 fixes live:**
- NotificationBell: dark mode bell should be visible
- Sale detail: items section should be above UGC/Map, no duplicate photos section

**2. Teams tier decision (D-007):**
- Hard cap at 10 or 15 members?
- Enterprise tier above Teams?
- Need your call before we implement the cap in code

**3. Carry-forward pending decisions:**
- Resend quota: Brevo (free, 300/day) or Postmark ($15/mo)?
- Innovation: Reputation + Condition Tags as P0 pre-beta?
- Innovation: sale-type-aware discovery as Q3?

**4. First scheduled audit results:**
- Monday digest will arrive 8am Monday
- Brand drift detector runs 10am Monday
- Full site audit runs Sunday 10pm (tonight!)
- Review findings in `claude_docs/audits/` and `patrick-dashboard.md`

---

## Context Loading

- Test accounts: Shopper `user11@example.com`, PRO Organizer `user2@example.com`, SIMPLE+ADMIN `user1@example.com`, TEAMS `user3@example.com` (all `password123`)
- New: Read `claude_docs/brand/DECISIONS.md` at session start (mandatory per new workflow)
