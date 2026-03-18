# Next Session Brief — S199 (2026-03-18 → next)

## Priority 1: Records Audit (DO FIRST)
Spawn findasale-records immediately. Full project docs audit:
- Scan ALL files in claude_docs/ for stale content, rule violations, orphaned folders
- Check CLAUDE.md files at project root + package level for drift from actual behavior
- Check CORE.md rules are being followed (especially §10 push limits, §12 subagent gate)
- Flag any duplicate docs, contradictory instructions, or files that no longer serve a purpose
- Review archive/ structure after S198 re-file for correctness
- Update context.md (run `node scripts/update-context.js` if available, else manual rebuild)

## Priority 2: Feature Gaps
Two features need builds:
- **#51 Sale Ripples** [IMPLEMENTATION-GAP] — dispatch findasale-dev for full build (schema + API + UI). Zero code exists.
- **#42 Voice-to-Tag** [UI-INCOMPLETE] — dispatch findasale-dev for VoiceTagButton.tsx. Backend route exists.

## Priority 3: Passkey Re-QA
- #19 Passkey: Run full end-to-end QA (register → authenticate → JWT → redirect). Backend + frontend both fixed S196+S197.

## Priority 4: #60 Premium Tier Bundle Sprint 2
- Full billing + workspace management UX. findasale-dev dispatch.

## Context at Wrap (S198)
- **Roadmap:** v51, 13-column schema, 146 features tracked, #51 gap flagged
- **Archive:** Fully re-filed from archive-old → archive (134 files, 15 subdirs)
- **Human tests:** ALL features show 📋 — Patrick has never formally run the E2E checklist
- **Railway:** GREEN ✅ | **Vercel:** GREEN ✅ (useOrganizerTier.ts fix pushed)
- **Push needed by Patrick for S198 files (if not yet done):**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/strategy/roadmap.md claude_docs/strategy/COMPLETED_PHASES.md claude_docs/archive
git commit -m "docs: roadmap v51 13-col schema, archive re-filed, #51 gap flagged, S198 session wrap"
.\push.ps1
```

## S199 Agent Fleet Suggestion
Run these in parallel at session start:
1. findasale-records — docs audit (Priority 1)
2. findasale-dev — #51 Sale Ripples build (Priority 2)
3. findasale-dev — #42 VoiceTagButton.tsx (Priority 2)
