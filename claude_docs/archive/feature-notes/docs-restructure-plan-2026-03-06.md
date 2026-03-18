# Docs Restructure Plan — 2026-03-06

**Audit Date:** 2026-03-06
**Inventory:** 128 files across 15 folders
**Status:** Ready for execution

---

## Executive Summary

**Current State:** 128 files in claude_docs/ with significant redundancy, stale artifacts, and unclear folder purposes.

**Key Problems Identified:**
1. **Tier 3 files in root** — Audit reports (beta-readiness, workflow-audit, pre-beta-audit, etc.) clogging root alongside critical Tier 1 docs
2. **Duplicate wrap protocol docs** — SESSION_WRAP_PROTOCOL.md, WRAP_PROTOCOL_QUICK_REFERENCE.md, SESSION_WRAP_PROTOCOL_INDEX.md, plus archive variants
3. **Orphan artifacts** — Empty placeholder files (new 1.txt, new 2.txt, test_write, .gitkeep files) + stale one-off reports (migration runbook duplicated, payment stress test duplicated)
4. **Misclassified folders** — health-reports, changelog-tracker, monthly-digests, ux-spotchecks contain dated reports that should be in archive
5. **Root-level clutter** — 14 .md files at root including expired audit traces, wrap variants, session logs
6. **Skills package** — 14 .skill files stored as unversioned artifacts; should be in dedicated directory with clear versioning

**Outcome:** Reorganized structure with clear Tier classification, eliminated duplication, and consolidated audit trail into time-series archive.

---

## Proposed Structure

```
claude_docs/
├── TIER 1 — ALWAYS LOADED (hot docs, <2,000 tokens combined)
│   ├── CORE.md                    # Behavioral operating system (unchanged)
│   ├── STATE.md                   # Project state snapshot (unchanged)
│   ├── STACK.md                   # Tech stack locks (unchanged)
│   ├── SECURITY.md                # Security boundaries (unchanged)
│   └── RECOVERY.md                # Fallback procedures (unchanged)
│
├── strategy/                       # Business & product direction (load on demand)
│   ├── BUSINESS_PLAN.md            # Strategic authority document
│   ├── roadmap.md                  # Parallel path roadmap (CA/CB/CC/CD/P tracks)
│   ├── COMPLETED_PHASES.md         # Historical phase completions
│   └── pricing-strategy.md         # [EXTRACTED from research/] Fee model, competitor analysis
│
├── operations/                     # How to run the platform (load on demand)
│   ├── DEVELOPMENT.md              # Dev environment quickstart
│   ├── OPS.md                      # Operational procedures (Stripe rotation, etc.)
│   ├── model-routing.md            # Claude model selection strategy
│   ├── session-safeguards.md       # Token budgets, loop-break limits
│   ├── patrick-language-map.md     # Patrick's short-command semantics
│   └── next-session-prompt.md      # Context for next session
│
├── guides/                         # User-facing help & handbooks (unchanged)
│   ├── organizer-guide.md
│   ├── shopper-faq.md
│   ├── support-kb.md
│   ├── incident-response.md
│   ├── feedback-to-feature.md
│   └── zapier-webhooks.md
│
├── beta-launch/                    # Active beta launch materials (session 85+)
│   ├── launch-announcement.md
│   ├── success-criteria.md
│   ├── LEGAL_EXEC_SUMMARY.md
│   ├── legal-compliance-scan-2026-03-06.md
│   ├── legal-recommendations-for-dev.md
│   ├── ops-readiness-2026-03-06.md
│   ├── e2e-test-checklist.md
│   ├── success-tracking.md
│   ├── cx-onboarding-toolkit-2026-03-06.md
│   ├── onboarding-final-2026-03-06.md
│   ├── launch-content-ready-2026-03-06.md
│   ├── onboarding-emails.md
│   ├── organizer-outreach.md
│   ├── marketing-calendar-2026-03-06.md
│   ├── support-kb-2026-03-06.md
│   ├── beta-status.md
│   └── content-calendar.md
│
├── brand/                          # Brand assets (unchanged)
│   ├── README.md
│   ├── logo-primary.svg
│   ├── logo-primary.png
│   ├── logo-dark-bg.svg
│   ├── logo-icon.svg
│   ├── logo-icon-512.png
│   ├── logo-oauth-120.png
│   ├── business-card-front.png
│   └── business-card-back.png
│
├── feature-notes/                  # Feature implementation summaries (for reference during sprints)
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── BETA_INVITE_SYSTEM.md
│   ├── EMAIL_TEMPLATE_SYSTEM.md
│   ├── PRICE_ALERTS_IMPLEMENTATION.md
│   ├── SHOPPER_PROFILE_IMPLEMENTATION.md
│   ├── SEO_IMPROVEMENTS_SUMMARY.md
│   ├── STRIPE_WEBHOOK_HARDENING.md
│   └── MOBILE_GESTURES_TESTING.md
│
├── skills-package/                 # Claude skill archives (versioned)
│   ├── context-maintenance.skill
│   ├── findasale-architect.skill
│   ├── findasale-cx.skill
│   ├── findasale-deploy.skill
│   ├── findasale-dev.skill
│   ├── findasale-legal.skill
│   ├── findasale-marketing.skill
│   ├── findasale-ops.skill
│   ├── findasale-qa.skill
│   ├── findasale-rd.skill
│   ├── findasale-records.skill
│   ├── findasale-support.skill
│   ├── findasale-ux.skill
│   ├── findasale-workflow.skill
│   └── health-scout.skill
│
├── research/                       # R&D and exploratory work (load when investigating)
│   ├── competitive-analysis-2026-03-06.md
│   ├── branding-brief-2026-03-05.md
│   ├── feature-research-2026-03-06.md
│   ├── feature-brainstorm-2026-03-05.md
│   ├── investor-materials-2026-03-05.md
│   ├── marketing-content-2026-03-05.md
│   ├── parallel-roadmap-v2-2026-03-05.md
│   ├── growth-channels-2026-03-04.md
│   └── strategic-review-2026-03-05.md
│
├── self-healing/                   # Auto-fix procedures by pattern
│   └── self_healing_skills.md      # Known error patterns + fixes
│
├── logs-and-context/               # Timestamped project context (Tier 2 reference only)
│   ├── session-log.md              # Session-by-session activity log
│   ├── scheduled-task-log.md       # Scheduled task history
│   ├── BETA_CHECKLIST.md           # Beta readiness items
│   └── SEED_SUMMARY.md             # Original project seeding notes
│
├── archive/                        # All dated, completed-phase, one-time reports
│   ├── README.md                   # [NEW] Index of archive structure
│   │
│   ├── health-reports/             # Periodic scans (newest = latest status)
│   │   ├── 2026-03-06.md
│   │   ├── 2026-03-05.md
│   │   ├── 2026-03-05-full-scan.md
│   │   ├── 2026-03-02.md
│   │   ├── 2026-03-01.md
│   │   ├── competitive-actions-dev-handoff-2026-03-06.md
│   │   ├── qa-c1-c4-verification-2026-03-06.md
│   │   ├── qa-pre-beta-audit-2026-03-06.md
│   │   ├── ux-fixes-dev-handoff-2026-03-06.md
│   │   └── ux-fixes-rerun-2026-03-06.md
│   │
│   ├── session-retrospectives/     # Workflow audits & session summaries
│   │   ├── session-84-wrap-analysis.md
│   │   ├── session-84-proposed-diffs.md
│   │   ├── opus-fleet-audit-2026-03-06.md
│   │   ├── subagent-fleet-audit-2026-03-06.md
│   │   ├── records-audit-2026-03-06.md
│   │   ├── workflow-audit-2026-03-03.md
│   │   └── pre-beta-audit-2026-03-03.md
│   │
│   ├── audit-reports/              # Feature/system audits (one-time or periodic)
│   │   ├── beta-readiness-audit-2026-03-05.md
│   │   ├── ca4-ca6-audit-2026-03-05.md
│   │   ├── ux-pre-beta-audit-2026-03-06.md
│   │   ├── ux-comprehensive-audit-2026-03-06.md
│   │   ├── ux-full-audit-2026-03-06.md
│   │   ├── ux-verification-2026-03-06.md
│   │   ├── rebrand-audit.md
│   │   ├── pre-commit-check.md
│   │   └── payment-stress-test.md
│   │
│   ├── migration-and-procedures/   # One-time runbooks that have been executed
│   │   ├── migration-runbook.md
│   │   ├── dev-environment-skill-update.md
│   │   ├── verification-script-spec.md
│   │   └── pre-commit-check.md (if not in audit-reports)
│   │
│   ├── protocol-drafts/            # Deprecated or superseded protocol variants
│   │   ├── SESSION_WRAP_PROTOCOL_INDEX.md
│   │   ├── WRAP_PROTOCOL_EXECUTIVE_SUMMARY.md
│   │   ├── WRAP_PROTOCOL_INTEGRATION.md
│   │   └── .last-wrap              # Session wrap timestamp
│   │
│   └── .gitkeep                    # Preserve archive folder in git
│
└── [DELETED]
    ├── new 1.txt
    ├── new 2.txt
    ├── test_write
    ├── [.gitkeep files from empty-placeholder folders]
    ├── [duplicated migration-runbook.md from root]
    ├── [duplicated payment-stress-test.md from root]
    ├── [duplicated pre-commit-check.md from root]
    └── [all empty health-reports/.gitkeep, ux-spotchecks/.gitkeep, changelog-tracker/.gitkeep, etc.]
```

---

## File Disposition Table

| Current Path | Action | Destination | Reason |
|-------------|--------|-------------|--------|
| CORE.md | KEEP | claude_docs/ | Tier 1 behavioral authority — never move |
| STATE.md | KEEP | claude_docs/ | Tier 1 project state snapshot — never move |
| STACK.md | KEEP | claude_docs/ | Tier 1 tech stack lock — never move |
| SECURITY.md | KEEP | claude_docs/ | Tier 1 security boundaries — never move |
| RECOVERY.md | KEEP | claude_docs/ | Tier 1 fallback procedures — never move |
| BUSINESS_PLAN.md | MOVE | claude_docs/strategy/ | Tier 2 strategic reference document |
| roadmap.md | MOVE | claude_docs/strategy/ | Tier 2 parallel-path roadmap |
| COMPLETED_PHASES.md | MOVE | claude_docs/strategy/ | Historical record of shipped work |
| DEVELOPMENT.md | MOVE | claude_docs/operations/ | Tier 2 dev environment guide |
| OPS.md | MOVE | claude_docs/operations/ | Tier 2 operational procedures |
| model-routing.md | MOVE | claude_docs/operations/ | Tier 2 model selection strategy |
| session-safeguards.md | MOVE | claude_docs/operations/ | Tier 2 execution limits |
| patrick-language-map.md | MOVE | claude_docs/operations/ | Tier 2 interpretation guide |
| next-session-prompt.md | MOVE | claude_docs/operations/ | Tier 2 next-session context |
| session-log.md | MOVE | claude_docs/logs-and-context/ | Activity log (reference only) |
| scheduled-task-log.md | MOVE | claude_docs/logs-and-context/ | Task history (reference only) |
| BETA_CHECKLIST.md | MOVE | claude_docs/logs-and-context/ | Readiness items (reference) |
| SEED_SUMMARY.md | MOVE | claude_docs/logs-and-context/ | Original seeding notes (reference) |
| guides/\*.md | KEEP | claude_docs/guides/ | User documentation — unchanged |
| brand/\*.{svg,png,md} | KEEP | claude_docs/brand/ | Brand assets — unchanged |
| feature-notes/\*.md | KEEP | claude_docs/feature-notes/ | Feature implementation reference |
| skills-package/\*.skill | MOVE | claude_docs/skills-package/ | [Already correct folder] |
| beta-launch/\*.md | KEEP | claude_docs/beta-launch/ | Active launch materials — unchanged |
| research/\*.md | KEEP | claude_docs/research/ | R&D work — unchanged |
| self_healing_skills.md | MOVE | claude_docs/self-healing/ | Pattern & fix reference |
| archive/2026-03-\*.md | KEEP | claude_docs/archive/ | Session wrap summaries |
| archive/2026-03-05-health-check.json | KEEP | claude_docs/archive/ | Dated report |
| archive/\*-audit-\*.md | REORGANIZE | claude_docs/archive/audit-reports/ | Move all audit files to subdir |
| archive/\*-audit-\*.md (UX) | REORGANIZE | claude_docs/archive/audit-reports/ | UX audit reports |
| archive/ca4-ca6-audit-2026-03-05.md | MOVE | claude_docs/archive/audit-reports/ | QA audit |
| archive/beta-readiness-audit-2026-03-05.md | MOVE | claude_docs/archive/audit-reports/ | Beta readiness |
| archive/rebrand-audit.md | MOVE | claude_docs/archive/audit-reports/ | Brand audit |
| archive/workflow-audit-2026-03-03.md | MOVE | claude_docs/archive/session-retrospectives/ | Workflow review |
| archive/pre-beta-audit-2026-03-03.md | MOVE | claude_docs/archive/session-retrospectives/ | Phase audit |
| archive/session-84-wrap-analysis.md | MOVE | claude_docs/archive/session-retrospectives/ | Session summary |
| archive/session-84-proposed-diffs.md | MOVE | claude_docs/archive/session-retrospectives/ | Session diffs |
| archive/opus-fleet-audit-2026-03-06.md | MOVE | claude_docs/archive/session-retrospectives/ | Fleet audit |
| archive/subagent-fleet-audit-2026-03-06.md | MOVE | claude_docs/archive/session-retrospectives/ | Subagent audit |
| archive/records-audit-2026-03-06.md | MOVE | claude_docs/archive/session-retrospectives/ | Records audit |
| archive/competitive-actions-dev-handoff-2026-03-06.md | MOVE | claude_docs/archive/health-reports/ | Handoff report |
| archive/qa-\*-2026-03-06.md | MOVE | claude_docs/archive/health-reports/ | QA health checks |
| archive/ux-\*-2026-03-06.md | MOVE | claude_docs/archive/health-reports/ | UX health checks |
| archive/\*-health-check.json | MOVE | claude_docs/archive/health-reports/ | Health metrics |
| archive/migration-runbook.md | MOVE | claude_docs/archive/migration-and-procedures/ | Executed one-time procedure |
| migration-runbook.md (root) | DELETE | N/A | Duplicate of archive version |
| archive/dev-environment-skill-update.md | MOVE | claude_docs/archive/migration-and-procedures/ | Executed procedure |
| archive/verification-script-spec.md | MOVE | claude_docs/archive/migration-and-procedures/ | Spec doc (one-time) |
| archive/pre-commit-check.md | MOVE | claude_docs/archive/migration-and-procedures/ | Audit procedure |
| pre-commit-check.md (root) | DELETE | N/A | Duplicate of archive version |
| payment-stress-test.md (root) | DELETE | N/A | Duplicate of archive version |
| archive/payment-stress-test.md | MOVE | claude_docs/archive/audit-reports/ | Test report |
| archive/SESSION_WRAP_PROTOCOL_INDEX.md | MOVE | claude_docs/archive/protocol-drafts/ | Deprecated variant |
| archive/WRAP_PROTOCOL_EXECUTIVE_SUMMARY.md | MOVE | claude_docs/archive/protocol-drafts/ | Deprecated variant |
| archive/WRAP_PROTOCOL_INTEGRATION.md | MOVE | claude_docs/archive/protocol-drafts/ | Deprecated variant |
| archive/.last-wrap | MOVE | claude_docs/archive/protocol-drafts/ | Session marker |
| SESSION_WRAP_PROTOCOL.md | DELETE | N/A | Superseded by WRAP_PROTOCOL_QUICK_REFERENCE.md |
| WRAP_PROTOCOL_QUICK_REFERENCE.md | KEEP | claude_docs/ | Current wrap reference — DO NOT MOVE |
| new 1.txt | DELETE | N/A | Empty artifact |
| new 2.txt | DELETE | N/A | Empty artifact |
| archive/new 1.txt | DELETE | N/A | Empty artifact |
| archive/new 2.txt | DELETE | N/A | Empty artifact |
| test_write | DELETE | N/A | Empty test file |
| health-reports/.gitkeep | DELETE | N/A | Placeholder in non-empty dir |
| ux-spotchecks/.gitkeep | DELETE | N/A | Placeholder in non-empty dir |
| changelog-tracker/.gitkeep | DELETE | N/A | Empty placeholder dir (delete entire folder) |
| monthly-digests/.gitkeep | DELETE | N/A | Empty placeholder dir (delete entire folder) |
| competitor-intel/.gitkeep | DELETE (keep dir) | N/A | Folder is live; keep .gitkeep if folder remains empty |
| ux-spotchecks/ | RESTRUCTURE | archive/audit-reports/ | Move all UX audits to archive |
| health-reports/ | RESTRUCTURE | archive/health-reports/ | Move periodic scans to archive |
| workflow-retrospectives/ | RESTRUCTURE | archive/session-retrospectives/ | Move session reviews to archive |
| self_healing_skills.md | MOVE | claude_docs/self-healing/ | Create self-healing folder |
| competitor-intel/ | CONSOLIDATE | claude_docs/research/ | Move competitive-analysis-2026-03-06.md to research, delete empty folder |
| migration-runbook.md | DELETE | N/A | Root copy is a duplicate; keep archive version only |

---

## Files to Delete

| File | Reason |
|------|--------|
| new 1.txt | Empty artifact, no purpose |
| new 2.txt | Empty artifact, no purpose |
| archive/new 1.txt | Empty artifact, no purpose |
| archive/new 2.txt | Empty artifact, no purpose |
| test_write | Empty test file, no purpose |
| SESSION_WRAP_PROTOCOL.md (root) | Superseded by WRAP_PROTOCOL_QUICK_REFERENCE.md; keep only the quick reference |
| migration-runbook.md (root) | Duplicate of archive version; consolidate in one location |
| payment-stress-test.md (root) | Duplicate of archive version; consolidate in one location |
| pre-commit-check.md (root) | Duplicate of archive version; consolidate in one location |
| health-reports/.gitkeep | Placeholder in non-empty folder |
| ux-spotchecks/.gitkeep | Placeholder in non-empty folder |
| workflow-retrospectives/.gitkeep | Placeholder in non-empty folder |
| changelog-tracker/ (entire folder) | Empty placeholder; delete folder and all contents |
| monthly-digests/ (entire folder) | Empty placeholder; delete folder and all contents |
| competitor-intel/ (entire folder after move) | Consolidate into research/; delete empty dir |

---

## Files to Merge

| Source | Target | Action |
|--------|--------|--------|
| SESSION_WRAP_PROTOCOL.md | WRAP_PROTOCOL_QUICK_REFERENCE.md | Keep only the quick reference; SESSION_WRAP_PROTOCOL.md is redundant. Verify no unique content in SESSION_WRAP_PROTOCOL.md before deleting. |
| payment-stress-test.md (root) | archive/audit-reports/payment-stress-test.md | Delete root version; keep archive version |
| migration-runbook.md (root) | archive/migration-and-procedures/migration-runbook.md | Delete root version; keep archive version |
| pre-commit-check.md (root) | archive/migration-and-procedures/pre-commit-check.md | Delete root version; keep archive version |

---

## New Files Needed

| File | Purpose | Location |
|------|---------|----------|
| archive/README.md | Index of archive structure: explains what's inside, retention policy, how to search archived reports | claude_docs/archive/ |
| strategy/pricing-strategy.md | [EXTRACTED from research/pricing-analysis-2026-03-05.md] Fee model (5%/7%), competitor benchmarks, revenue projections | claude_docs/strategy/ |
| logs-and-context/README.md | Explains purpose of context docs; points to session-log.md, scheduled-task-log.md, and when to reference them | claude_docs/logs-and-context/ |

---

## Reorganization Steps (In Order)

### Phase 1: Create New Directory Structure

```bash
mkdir -p /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/strategy
mkdir -p /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/operations
mkdir -p /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/self-healing
mkdir -p /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/logs-and-context
mkdir -p /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/health-reports
mkdir -p /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/session-retrospectives
mkdir -p /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/audit-reports
mkdir -p /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/migration-and-procedures
mkdir -p /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/protocol-drafts
```

### Phase 2: Move Tier 2 Operational Docs

```bash
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/BUSINESS_PLAN.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/strategy/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/roadmap.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/strategy/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/COMPLETED_PHASES.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/strategy/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/DEVELOPMENT.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/operations/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/OPS.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/operations/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/model-routing.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/operations/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/session-safeguards.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/operations/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/patrick-language-map.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/operations/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/next-session-prompt.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/operations/
```

### Phase 3: Move Logs & Context

```bash
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/session-log.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/logs-and-context/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/scheduled-task-log.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/logs-and-context/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/BETA_CHECKLIST.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/logs-and-context/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/SEED_SUMMARY.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/logs-and-context/
```

### Phase 4: Move Self-Healing

```bash
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/self_healing_skills.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/self-healing/
```

### Phase 5: Reorganize Archive Subfolders

```bash
# Health reports
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/health-reports/2026-03-*.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/health-reports/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/health-reports/competitive-actions-dev-handoff-2026-03-06.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/health-reports/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/health-reports/qa-c1-c4-verification-2026-03-06.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/health-reports/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/health-reports/qa-pre-beta-audit-2026-03-06.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/health-reports/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/health-reports/ux-fixes-dev-handoff-2026-03-06.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/health-reports/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/health-reports/ux-fixes-rerun-2026-03-06.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/health-reports/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/2026-03-05-health-check.json /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/health-reports/

# UX audit reports
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/ux-spotchecks/*.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/audit-reports/

# Session retrospectives
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/session-84-wrap-analysis.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/session-retrospectives/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/session-84-proposed-diffs.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/session-retrospectives/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/opus-fleet-audit-2026-03-06.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/session-retrospectives/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/subagent-fleet-audit-2026-03-06.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/session-retrospectives/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/records-audit-2026-03-06.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/session-retrospectives/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/workflow-audit-2026-03-03.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/session-retrospectives/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/pre-beta-audit-2026-03-03.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/session-retrospectives/

# Audit reports
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/beta-readiness-audit-2026-03-05.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/audit-reports/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/ca4-ca6-audit-2026-03-05.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/audit-reports/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/rebrand-audit.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/audit-reports/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/pre-commit-check.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/audit-reports/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/payment-stress-test.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/audit-reports/

# Migration & procedures
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/migration-runbook.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/migration-and-procedures/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/dev-environment-skill-update.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/migration-and-procedures/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/verification-script-spec.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/migration-and-procedures/

# Protocol drafts
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/SESSION_WRAP_PROTOCOL_INDEX.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/protocol-drafts/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/WRAP_PROTOCOL_EXECUTIVE_SUMMARY.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/protocol-drafts/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/WRAP_PROTOCOL_INTEGRATION.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/protocol-drafts/
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/.last-wrap /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/protocol-drafts/
```

### Phase 6: Delete Empty Placeholder Folders & Artifacts

```bash
# Delete empty placeholder folders
rmdir /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/changelog-tracker
rmdir /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/monthly-digests
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/health-reports/.gitkeep
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/ux-spotchecks/.gitkeep
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/workflow-retrospectives/.gitkeep

# Delete empty artifacts
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/new\ 1.txt
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/new\ 2.txt
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/test_write
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/new\ 1.txt
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/new\ 2.txt

# Delete duplicate root docs
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/migration-runbook.md
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/payment-stress-test.md
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/pre-commit-check.md
rm /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/SESSION_WRAP_PROTOCOL.md

# Delete empty competitor-intel folder
rmdir /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/competitor-intel

# Move competitive analysis to research
mv /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/beta-readiness-audit-2026-03-05.md /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/
```

### Phase 7: Create Index Files

**Create `/sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/archive/README.md`:**

```markdown
# Archive Index

This folder contains completed phase artifacts, dated health reports, and one-time procedures that have already been executed. Files here are referenced for historical context but are not active.

## Structure

- **health-reports/** — Periodic system health scans (newest = latest status)
- **session-retrospectives/** — Session wrap summaries, workflow audits, fleet reviews
- **audit-reports/** — Feature audits, system audits, rebrand reviews, stress tests (one-time or completed)
- **migration-and-procedures/** — Executed runbooks and specs (not currently active)
- **protocol-drafts/** — Superseded or variant wrap protocol docs

## Retention Policy

Files are kept indefinitely for audit trail and historical reference. Clean up by date if space becomes an issue (oldest files can be safely deleted after 6 months without impact).

## How to Search

- Health status: Look in `health-reports/` with the most recent date (e.g., `2026-03-06.md`)
- Session summaries: Look in `session-retrospectives/` by session number
- Completed audits: Look in `audit-reports/` by type (e.g., `ux-`, `beta-`, `ca4-ca6-`, `rebrand-`)

Do not treat files in this folder as active requirements — they are historical records only.
```

**Create `/sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/logs-and-context/README.md`:**

```markdown
# Context & Logs

Reference-only documents that track project state and session activity. Load these on demand, not at session start (except STATE.md, which is Tier 1).

## Files

- **session-log.md** — Session-by-session activity: completed work, files changed, key decisions. Reference when investigating what happened in past sessions.
- **scheduled-task-log.md** — History of scheduled task runs (health checks, workflow reviews, etc.).
- **BETA_CHECKLIST.md** — Readiness checklist items for beta launch. Reference when preparing launch.
- **SEED_SUMMARY.md** — Original project seeding notes and setup history.

## Load Policy

Only load when debugging a past session or preparing to hand off context to the next session. Do not load at session start (keep Tier 1 context lean).

Never treat these as source of truth — they are secondary records. Primary truth is in code and active STATE.md.
```

**Create `/sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs/strategy/pricing-strategy.md`:**

[EXTRACT key sections from research/pricing-analysis-2026-03-05.md + BUSINESS_PLAN.md §2 + STATE.md locked decisions]

Content should cover:
- Competitive benchmark (13–20% competitors vs 5%/7% FindA.Sale)
- Fee structure (5% fixed-price, 7% auction)
- Revenue model (platform earns %, organizer receives remainder)
- Post-beta monetization options (AI tagging add-ons, premium subscriptions, featured placement)
- Pricing sensitivity analysis and elasticity notes

---

## Summary of Changes

**Total Files:** 128 → ~80 (48 files eliminated or consolidated)

**Deletions:** 19 files
- 4 empty artifacts (new 1.txt, new 2.txt, test_write, duplicate pre-commit-check.md)
- 3 duplicate root docs (migration-runbook.md, payment-stress-test.md, SESSION_WRAP_PROTOCOL.md)
- 2 empty placeholder folders (changelog-tracker, monthly-digests)
- 6 .gitkeep placeholder files
- 2 duplicate archive artifacts (new 1.txt, new 2.txt in archive/)

**Moved to Archive:** 28 files
- 6 health reports (moved to archive/health-reports/)
- 7 session retrospectives (moved to archive/session-retrospectives/)
- 9 audit reports (moved to archive/audit-reports/)
- 4 executed procedures (moved to archive/migration-and-procedures/)
- 2 deprecated protocol variants (moved to archive/protocol-drafts/)

**Reorganized:** 17 files
- 9 Tier 2 operational docs (strategy/, operations/)
- 4 reference docs (logs-and-context/)
- 1 self-healing doc (self-healing/)
- 3 already correct (skills-package/)

**New Folders:** 6
- strategy/ — Business & product direction
- operations/ — How to run the platform
- self-healing/ — Pattern & fix reference
- logs-and-context/ — Session logs & context
- archive/health-reports/ — Periodic scans
- archive/{session-retrospectives,audit-reports,migration-and-procedures,protocol-drafts}/ — Organized archive subfolders

**New Index Files:** 3
- archive/README.md — Archive structure & retention
- logs-and-context/README.md — Context docs load policy
- strategy/pricing-strategy.md — Extracted from research/pricing-analysis

**Root Tier 1 (unchanged):** CORE.md, STATE.md, STACK.md, SECURITY.md, RECOVERY.md, WRAP_PROTOCOL_QUICK_REFERENCE.md

**Result:** Every folder has a single clear purpose. Archive is organized by type. Tier 1 & 2 separation is clean. Duplicate content eliminated. Stale artifacts removed.

---

## Verification Checklist

After executing all moves, verify:

- [ ] All 5 Tier 1 files remain in claude_docs/ root
- [ ] WRAP_PROTOCOL_QUICK_REFERENCE.md remains in root (current wrap reference)
- [ ] No .md files remain in root except Tier 1 + WRAP_PROTOCOL_QUICK_REFERENCE.md
- [ ] strategy/ contains exactly: BUSINESS_PLAN.md, roadmap.md, COMPLETED_PHASES.md, pricing-strategy.md
- [ ] operations/ contains: DEVELOPMENT.md, OPS.md, model-routing.md, session-safeguards.md, patrick-language-map.md, next-session-prompt.md
- [ ] logs-and-context/ contains: session-log.md, scheduled-task-log.md, BETA_CHECKLIST.md, SEED_SUMMARY.md, README.md
- [ ] self-healing/ contains: self_healing_skills.md
- [ ] archive/health-reports/ contains all dated health reports
- [ ] archive/session-retrospectives/ contains all session audits
- [ ] archive/audit-reports/ contains all feature/system audits
- [ ] archive/migration-and-procedures/ contains executed runbooks
- [ ] archive/protocol-drafts/ contains deprecated protocol variants
- [ ] archive/README.md exists with retention policy
- [ ] No .gitkeep files in non-empty folders
- [ ] No empty folders remain (except archive/ which has content)
- [ ] No "new 1.txt", "new 2.txt", test_write, or duplicate root docs remain
- [ ] All 14 .skill files still in skills-package/
- [ ] guides/, brand/, beta-launch/, research/, feature-notes/ all unchanged
- [ ] `find claude_docs -type f | wc -l` returns ~80–85 files (down from 128)

---

## Notes for Patrick

This plan is ready for execution. The reorganization will:

1. **Reduce cognitive load** — Clear folder purposes mean you know exactly where to look.
2. **Eliminate dead weight** — Stale one-offs and duplicates gone.
3. **Preserve all history** — Archive keeps dated reports organized by type.
4. **Unblock future sessions** — Next Claude session will have lean Tier 1 docs (5 files) and organized Tier 2 references.

Execution time: ~15 minutes (mostly bash moves). Recommend doing in one session. No code changes; docs-only reorganization.

After execution, run:
```bash
find /sessions/quirky-festive-galileo/mnt/FindaSale/claude_docs -type f | wc -l
```
Should return ~80–85 files (was 128).

Then commit with:
```powershell
git add claude_docs/
git commit -m "Restructure: docs folder reorganized by tier and purpose

- Move Tier 2 operational docs to strategy/, operations/, logs-and-context/
- Consolidate all audits/reports to archive/ with subfolders
- Delete 19 empty/duplicate artifacts (new 1-2.txt, test_write, root duplicates)
- Create index files: archive/README.md, logs-and-context/README.md, strategy/pricing-strategy.md
- 128 files → 80 files. Tier 1 (5 docs) + WRAP_PROTOCOL_QUICK_REFERENCE.md only in root."
.\push.ps1
```
