# Skill Audit — 2026-03-07

## Overview

Comprehensive audit of all 20 installed FindA.Sale skills. Assessment covered description quality, staleness, completeness, cross-agent handoffs, and context efficiency. All skills reviewed against known issues: Docker references, git push instruction errors, missing dev-environment gates, stale paths, and missing context monitoring.

---

## Skills Inventory & Status

| Skill | Status | Issues Found | Recommended Fix | Priority |
|-------|--------|-------------|-----------------|----------|
| **context-maintenance** | ✅ HEALTHY | 0 | None | — |
| **conversation-defaults** | ⚠️ REVIEW | 1 | Scheduled check due | LOW |
| **cowork-power-user** | ✅ HEALTHY | 0 | None | — |
| **dev-environment** | ✅ HEALTHY | 0 | None | — |
| **docx** | ✅ HEALTHY | 0 | None | — |
| **findasale-architect** | ✅ HEALTHY | 0 | None | — |
| **findasale-cx** | ✅ HEALTHY | 0 | None | — |
| **findasale-deploy** | ✅ HEALTHY | 0 | None | — |
| **findasale-dev** | ✅ HEALTHY | 0 | None | — |
| **findasale-legal** | ✅ HEALTHY | 0 | None | — |
| **findasale-marketing** | ✅ HEALTHY | 0 | None | — |
| **findasale-ops** | ✅ HEALTHY | 0 | None | — |
| **findasale-qa** | ✅ HEALTHY | 0 | None | — |
| **findasale-rd** | ✅ HEALTHY | 0 | None | — |
| **findasale-records** | ✅ HEALTHY | 0 | None | — |
| **findasale-support** | ✅ HEALTHY | 0 | None | — |
| **findasale-ux** | ✅ HEALTHY | 0 | None | — |
| **findasale-workflow** | ✅ HEALTHY | 0 | None | — |
| **health-scout** | ✅ HEALTHY | 0 | None | — |
| **pdf** | ✅ HEALTHY | 0 | None | — |

---

## Detailed Findings

### Green Skills (No Issues — 19 of 20)

The following skills are in excellent condition with no action needed:

- **context-maintenance**: Comprehensive, well-documented. Covers session start/end protocols, maintenance workflow, and two-tier memory system. All Docker references removed correctly. Dynamic path resolution implemented properly. Scheduled task governance well-defined.

- **cowork-power-user**: Clear mandate, proper scope boundaries. Routes improvements through findasale-records as required. Ecosystem research, skill optimization, and autonomous work discovery well-integrated. No stale patterns.

- **dev-environment**: Up-to-date with native Windows stack. All Docker references removed. Covers Prisma migrations, seeding, git push via push.ps1, env var handling. Self-correction clause for subagents present. Database setup clearly documented with local vs. Neon distinction.

- **docx**: Comprehensive Word document guide. CRITICAL rules for page size, tables, images, tracked changes clearly documented. No stale references. Example code is current.

- **findasale-architect**: Authority on schema, stack decisions, cross-layer contracts. Locked decisions properly documented. Architecture Review Process clear. Has environment command hard gate before shell commands. Handoff format well-specified.

- **findasale-cx**: Customer Success scope clear. Beta program structure, onboarding sequence, feedback triage routing to appropriate agents. Knowledge base location specified. Context monitoring section present.

- **findasale-deploy**: Pre-deploy checklist comprehensive. Health check gating, legal/compliance check, git state, secrets, migrations, Stripe verification all covered. Post-deploy smoke test section present. Correctly references push.ps1 not git push.

- **findasale-dev**: Senior Developer mandate clear. Diff-only rules, staging by explicit name, no git add -A. Correctly specifies push.ps1 use. Stack authority referenced. Cross-layer contracts defined. Context monitoring and handoff format present.

- **findasale-legal**: Legal & Compliance scope well-defined. Handles Stripe Connect, consumer protection, privacy, estate sale specifics. Pre-ship checklist present. Knows when to escalate to attorney. Risk classification clear. Tier 1 change control acknowledged.

- **findasale-marketing**: Brand voice well-established. Warm, practical, local tone. Audience profiles detailed (organizer + shopper). Content types and checklist prevent advertising unshipped features. Context monitoring present.

- **findasale-ops**: Operations scope clear — Railway, Vercel, Neon, Cloudinary. Critical production gotchas documented (PORT, DIRECT_URL, CMD exec-form). Migration runbook referenced. Deployment checklist present. Incident response protocol clear.

- **findasale-qa**: QA/QC gatekeeper role clear. Review checklist comprehensive (TypeScript, logic, security, payments, frontend, API contracts). Test writing guidance present. Verdict format uses severity levels. Context monitoring section present.

- **findasale-rd**: Research & Development scope tight and clear. Research types well-categorized (tech eval, feature feasibility, competitor intel, market research). Research standards defined (cite sources, date research). Output format specified. When to skip research guidance clear.

- **findasale-records**: Business Records Auditor with clear Tier 1/2/3 governance. Audit protocol (accuracy, drift, staleness) well-specified. Agent self-improvement loop properly documented. Scheduled task gating and change record format present. Drift prevention rules clear.

- **findasale-support**: Head of Customer Support with empathetic voice. Issue classification clear with routing to appropriate agents. Response templates provided. Knowledge base location and structure defined. Escalation protocol for chargebacks, threats, systemic bugs. Pattern detection rule present (3x = route to CX).

- **findasale-ux**: UX & Product Designer scope clear. User profiles (organizer, shopper, admin) detailed. UX principles for FindA.Sale well-articulated. Flow spec and audit protocol formats present. Mobile considerations emphasized. Feature start rule requires UX before Dev.

- **findasale-workflow**: Workflow Efficiency Agent mandate clear. "Know Patrick" section documents established patterns (Just Build bias, non-technical PM, session start expectations). Common anti-patterns and fixes catalog helpful. Cowork environment and dev environment constraints documented. Audit protocol and improvement protocol clear.

- **health-scout**: Proactive health scanning well-designed. Seven scan sequences (secrets, auth, code quality, SSR, Prisma, UI/A11y, environment). Report format structured with severity levels. Finding routing summary ensures findings reach right agents. Token efficiency guidance present.

- **pdf**: PDF processing skill comprehensive. Libraries documented (pypdf, pdfplumber, reportlab). Command-line tools listed. Common tasks covered (OCR, watermarks, images, password protection). Quick reference table helpful.

---

### Yellow Findings (Requires Review — 1 of 20)

#### conversation-defaults

**Status**: ⚠️ Minor issue — routine maintenance, not blocking

**Finding**: Scheduled monthly fix-check reminder is due.

**Details**:
- File created 2026-02-28 with AskUserQuestion tool workaround
- Tool reported as broken; monthly check dates: 2026-03-28, 2026-04-28, 2026-05-28
- Today is 2026-03-07, so next scheduled check is 2026-03-28 (3 weeks away)
- No action needed now; this is working as designed

**Action**: No fix needed. Routine check will occur on 2026-03-28 per Rule 2 schedule.

---

## Assessment Summary

### Strengths

1. **No Docker References**: All skills correctly reference native Windows dev environment. Docker retirement fully propagated across the fleet.

2. **git push Instruction Accuracy**: Every skill that involves git operations correctly specifies `./push.ps1` from PowerShell, not raw `git push`.

3. **Dev-Environment Gating**: Critical skills (findasale-dev, findasale-architect, findasale-ops, findasale-deploy) all include the "Self-Correction Clause" requiring dev-environment skill to be loaded before shell commands. Conversation-defaults enforces this at conversation layer.

4. **Cross-Agent Coordination**: Handoffs between agents are clear. Routing tables in findasale-records, findasale-qa, findasale-cx, findasale-workflow all direct issues to appropriate agents.

5. **Context Monitoring**: All heavy-reading skills (context-maintenance, findasale-rd, findasale-qa, findasale-records, findasale-workflow, health-scout) include context monitoring sections.

6. **Authority Clarity**: Tier 1/2/3 governance in findasale-records is well-understood. Behavior-shaping files (CLAUDE.md, CORE.md, SECURITY.md) protected. Operational files (STATE.md, STACK.md) announced before editing.

7. **Completeness**: No gaps in skill coverage. Agent fleet covers code (dev), testing (qa), architecture (architect), ops (ops), research (rd), UX (ux), marketing (marketing), customer success (cx), legal (legal), support (support), records (records), workflow (workflow), and health (health-scout).

---

## Improvement Opportunities (Optional, Not Blocking)

### Tier 3 Reference — Nice to Have

These are optional enhancements that would be helpful but are not urgent or necessary:

1. **findasale-deploy**: Could add a "Post-Deploy Rollback" section referencing RECOVERY.md with quick rollback procedures. Not blocking — current checklist is solid.

2. **findasale-workflow**: Could cross-reference with findasale-records on "Know Patrick" patterns so both stay in sync. Currently documented in only one place. Low risk if out of sync.

3. **health-scout**: Could add a "Confidence Levels" section for each scan type (e.g., "Secrets scan: 100% confidence, Auth scan: 95% confidence, Code quality: 85% confidence"). Would help with false positive judgement.

4. **cowork-power-user**: The "Connector & Plugin Scouting" section is robust, but could add "seasonal search refresh" guidance (e.g., "search for new Cowork features monthly").

---

## Validation Checklist

- [x] All 20 skills read in full
- [x] No Docker references found
- [x] All git push instructions use push.ps1 correctly
- [x] Dev-environment gates present in appropriate skills
- [x] File paths use dynamic resolution (ls -d /sessions/*/mnt/...) not hardcoded
- [x] Stale patterns checked against 2026-03-06 Docker migration date
- [x] Cross-agent handoffs verified (routing tables present)
- [x] Context monitoring sections present in heavy-reading skills
- [x] Tier 1/2/3 governance understood and applied correctly
- [x] No Tier 3 artifacts mixed with active behavior rules
- [x] Environment variable security patterns consistent

---

## Recommendations for Patrick

### Immediate (This Session)

None. All skills are operationally sound.

### Before Next Session (Within 1 Week)

**Optional**: Review findasale-records Tier 1/2/3 governance one time to ensure Patrick is comfortable with the gating model. This defines what changes require Patrick approval vs. what agents can decide autonomously. The model is sound, but Patrick should explicitly sign off on it.

### Routine (Monthly)

- **2026-03-28**: Check whether AskUserQuestion tool bug in conversation-defaults has been resolved. If yes, disable the workaround.
- **Monthly cadence**: Run this skill audit quarterly (next: 2026-06-07) to catch drift early.

---

## Conclusion

All 20 skills are well-written, current, and aligned with the FindA.Sale technical environment and governance model. No critical issues found. One routine maintenance task scheduled for late March (AskUserQuestion tool fix-check). The skill fleet is ready for production use and provides comprehensive coverage across all major agent roles.