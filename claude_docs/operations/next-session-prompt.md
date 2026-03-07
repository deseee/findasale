# Next Session Resume Prompt
*Written: 2026-03-06T01:50:00Z*
*Session ended: session 84 — workflow fix + 8 audit work paths*

---

## ⚠️ FIRST ACTION — VERIFY THIS FILE IS CURRENT

Check this file's header. If it says "session 83" — the wrap failed. Spawn findasale-records + findasale-workflow + findasale-dev to recover.

If it correctly says "session 84" — proceed normally.

---

## Resume From

**Session 85 loaded. Announce: "Executing QA critical fixes."**

Spawn `findasale-dev` immediately to fix the 4 QA critical issues. These are beta blockers — no real users until they're patched.

---

## 4 Critical Fixes for findasale-dev

| ID | File | Fix |
|----|------|-----|
| C1 | `packages/backend/src/controllers/authController.ts` | Replace hardcoded `'fallback-secret'` with startup validation — throw if `JWT_SECRET` env var is missing |
| C2 | `packages/backend/src/routes/authRoutes.ts` (or equivalent) | Add `express-rate-limit` (5 attempts/15min per IP) to the `POST /auth/forgot-password` endpoint |
| C3 | `packages/backend/src/routes/uploadRoutes.ts` (or equivalent) | Add `authenticate` + `requireAdmin` middleware to `GET /api/upload/ai-feedback-stats` |
| C4 | `claude_docs/OPS.md` | Add Stripe webhook secret rotation procedure — document rotation steps and recommended cadence |

Full QA report: `claude_docs/health-reports/qa-pre-beta-audit-2026-03-06.md`

---

## What Was Completed This Session (84)

- Workflow fix: "hello/hi/hey" session start signal rule — added to `conversation-defaults` skill (installed) and `patrick-language-map.md` (pushed to GitHub)
- All 8 audit work paths complete:
  - **QA**: 4 criticals, 2 highs — `claude_docs/health-reports/qa-pre-beta-audit-2026-03-06.md`
  - **UX**: 5 blockers (post-signup guidance, Live Drop price visibility, bulk delete confirm, etc.) — `claude_docs/ux-spotchecks/ux-pre-beta-audit-2026-03-06.md`
  - **Legal**: 5 medium risks, no blockers — `claude_docs/beta-launch/legal-compliance-scan-2026-03-06.md`
  - **Support KB**: 15 beta issues + response templates — `claude_docs/beta-launch/support-kb-2026-03-06.md`
  - **CX**: 4 onboarding emails + quick-start guide — `claude_docs/beta-launch/cx-onboarding-toolkit-2026-03-06.md`
  - **Records**: RECOVERY.md Docker sections removed, pushed to GitHub — `claude_docs/archive/records-audit-2026-03-06.md`
  - **Marketing**: 2-week pre-launch calendar — `claude_docs/beta-launch/marketing-calendar-2026-03-06.md`
  - **Ops**: Infra GREEN (VAPID still yellow) — `claude_docs/beta-launch/ops-readiness-2026-03-06.md`

---

## Patrick's Required Actions Before Beta

1. **Rotate Neon credentials** — were in plaintext in committed history (scrubbed, but rotation is overdue)
2. **Confirm 5%/7% platform fee** — verbally, so it can be locked in STACK.md with a date
3. **Set up Stripe business account**
4. **Google Search Console verification**
5. **Order business cards** — files ready at `claude_docs/brand/business-card-front.png` + `business-card-back.png`
6. **Start beta organizer outreach** — emails at `claude_docs/beta-launch/organizer-outreach.md`, calendar at `marketing-calendar-2026-03-06.md`
7. **Optional**: Michigan attorney re estate sale permit (~$300–500)

---

## Environment Notes

- Local git is behind GitHub on `claude_docs/RECOVERY.md` and `claude_docs/patrick-language-map.md` (pushed via MCP). Pull before committing: run `.\push.ps1` from PowerShell (it will fetch+merge automatically).
- Several new files are untracked locally (`claude_docs/beta-launch/*-2026-03-06.md`, `claude_docs/health-reports/qa-pre-beta-audit-2026-03-06.md`, `claude_docs/ux-spotchecks/ux-pre-beta-audit-2026-03-06.md`, `claude_docs/archive/records-audit-2026-03-06.md`). Stage and commit these:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md claude_docs/session-log.md claude_docs/next-session-prompt.md
git add claude_docs/beta-launch/cx-onboarding-toolkit-2026-03-06.md
git add claude_docs/beta-launch/legal-compliance-scan-2026-03-06.md
git add claude_docs/beta-launch/legal-recommendations-for-dev.md
git add claude_docs/beta-launch/marketing-calendar-2026-03-06.md
git add claude_docs/beta-launch/ops-readiness-2026-03-06.md
git add claude_docs/beta-launch/support-kb-2026-03-06.md
git add claude_docs/beta-launch/LEGAL_EXEC_SUMMARY.md
git add claude_docs/health-reports/qa-pre-beta-audit-2026-03-06.md
git add "claude_docs/ux-spotchecks/ux-pre-beta-audit-2026-03-06.md"
git add claude_docs/archive/records-audit-2026-03-06.md
git commit -m "docs: session 84 audit reports + wrap docs"
.\push.ps1
```

- Stray file `"2\r"` in repo root — delete it: `Remove-Item '2`r'` (or `git rm "2\r"`)
- `self_healing_skills.md` still has 3 stale Docker entries (#9, #13, #18) — update next session

---

## Continuous Mode Rules

1. Load this file + STATE.md silently at session start
2. Announce session loaded + QA fixes in progress
3. Spawn findasale-dev for C1–C4
4. Commit work incrementally
5. End every session with session wrap
