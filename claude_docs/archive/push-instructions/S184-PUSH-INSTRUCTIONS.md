# S184 Push Instructions

Context docs updated: STATE.md (#68 complete status), session-log.md (added S182 entry, fixed S183), next-session-prompt.md (rewritten for S184).

## Git Push Block

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md claude_docs/logs/session-log.md claude_docs/next-session-prompt.md
git commit -m "chore(s184): fix context docs — #68 complete status, add S182 session-log entry, rewrite next-session-prompt for S184"
.\push.ps1
```

Copy and paste all 4 lines into PowerShell. Push.ps1 will handle index.lock cleanup, CRLF phantom clearing, fetch + merge, and auto-retry.

## Roadmap update (add to same commit or separate)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/strategy/roadmap.md
git commit -m "chore(s183): roadmap v43 — #63 shipped (S182), #65 fully complete (S183), #68 Sprint 1+2 built QA-pending (S183)"
.\push.ps1
```
