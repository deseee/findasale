# Incident Response Workflow — FindA.Sale Beta

Defines how beta issues flow through the subagent fleet.

---

## Severity Definitions

| Level | Criteria | SLA |
|-------|----------|-----|
| P0 — Critical | Site down, payments broken, data loss | Fix within 2 hours |
| P1 — High | Feature broken for all users, auth failing | Fix within 24 hours |
| P2 — Medium | Feature broken for some users, workaround exists | Fix within 72 hours |
| P3 — Low | Cosmetic issues, minor UX friction | Next sprint |

---

## Incident Response Chain

```
User reports issue (email / Patrick observation)
        ↓
findasale-support (Haiku) — triages, categorizes P0–P3, documents
        ↓
P0/P1 → findasale-ops (Haiku) — checks Railway logs, Vercel, Neon health
P0/P1 → findasale-dev (Sonnet) — writes code fix
P2/P3 → findasale-dev (Sonnet) — queued for next session
        ↓
findasale-qa (Sonnet) — reviews fix before push
        ↓
Patrick pushes via .\push.ps1
        ↓
findasale-ops (Haiku) — confirms deploy successful, monitors for 1 hour
```

---

## P0 — Critical Response (site down or payments broken)

1. **Patrick** — check Railway dashboard → is backend running?
2. Spawn **findasale-ops**: "P0 incident — [description]. Check Railway logs, Vercel status, Neon connection."
3. Ops reports root cause within 15 min.
4. If code fix needed → spawn **findasale-dev** with exact context from ops report.
5. QA reviews before push (can be expedited to 5-min review for P0).
6. Patrick pushes. Ops confirms resolution.
7. **findasale-support** sends user acknowledgment email.

---

## P1 — High Response (feature broken)

1. **findasale-support** documents the issue, attempts reproduction steps.
2. Spawn **findasale-dev** with: file paths, reproduction steps, severity P1.
3. Dev writes fix in same session.
4. **findasale-qa** reviews (15-min review).
5. Patrick pushes. Resolved.

---

## P2/P3 — Standard Response

1. **findasale-support** logs issue in `claude_docs/guides/support-kb.md` if it's a new pattern.
2. Dev queue — fix in next available session.
3. For UX issues → route to **findasale-ux** first for design review.

---

## Handoff Format (use when spawning agents)

```
Context: [what the user reported + Patrick's observation]
Severity: P0 | P1 | P2 | P3
Reproduction: [steps to reproduce]
Files likely involved: [controller, route, component]
Task: [exact action — write fix, check logs, draft response]
Do NOT push — write files only
```

---

## Communication to Users

- P0: Patrick sends direct email within 30 min acknowledging issue.
- P1: Email within 2 hours.
- P2/P3: Reply only if user asked — "We're aware and have it scheduled."

---

Last Created: 2026-03-06 (Opus fleet audit)
