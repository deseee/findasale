# Subagent Quick-Reference

**Status:** READ-ONLY for subagents. Only Records may edit. Subagents propose additions via self-improvement proposals in their handoff blocks.

**Last Updated:** 2026-03-22 (Session 235)

---

## findasale-dev (Backend & Frontend Code)

**What I own:** Implementation of features, bug fixes, new controllers/routes/components, refactors, config changes under `packages/`.

**The 3 most common lookups:**
1. **Schema + Types** — Where is model X defined? Does field Y exist?
   - Schema: `packages/database/prisma/schema.prisma`
   - Types exported: `packages/shared/src/types/` (cross-layer types)
   - API types: `packages/backend/src/types/` (controller responses)
2. **Controller contracts** — What shape does API endpoint X return?
   - Controllers: `packages/backend/src/controllers/` (one file per route group)
   - Routes: `packages/backend/src/routes/` (endpoint definitions)
3. **Hook shapes** — Does this hook return `{ data, isLoading }` or just values?
   - Frontend hooks: `packages/frontend/src/lib/hooks/`
   - Query hooks: check `react-query` patterns (always return `{ data, isLoading, isError }`)
   - State hooks: check `useState` patterns (return values directly)

**Mandatory pre-flight checks (CLAUDE.md §8):**
- Read `schema.prisma` to confirm every model field exists
- Read the hook file to confirm return shape
- Read controller file to confirm API response type
- Run TypeScript check: `cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules` — zero errors required

**Always read before write:** Schema changes in CLAUDE.md §6. Push rules in CLAUDE.md §5. MCP limits: ≤3 files, ≤25k tokens per push.

**Reference docs:**
- Tech stack: STACK.md
- Security rules: SECURITY.md
- Migration protocol: CLAUDE.md §6 (Prisma)
- Push rules: CLAUDE.md §5

---

## findasale-qa (QA, Testing, Audits)

**What I own:** Live app testing, bug discovery, QA audit reports, test scenario generation, cross-browser verification.

**The 3 most common lookups:**
1. **Latest QA bugs** — What bugs were found? Which are fixed?
   - Latest audit: `claude_docs/operations/qa-audit-2026-03-22.md`
   - QA verdict: STATE.md (latest session entry, "QA Verdict:" line)
   - Sentry issues: https://deseee.sentry.io (live errors)
2. **Test accounts & roles** — Which test user should I use? How do roles differ?
   - Test accounts: STATE.md (search for "Test Accounts" section)
   - Roles: STACK.md (SHOPPER, ORGANIZER, ADMIN definitions)
   - Tiers: STATE.md (pricing model section: FREE, SIMPLE, PRO, TEAMS)
3. **Live environments** — Where do I test?
   - Production: https://finda.sale
   - Staging (latest main branch): https://findasale-git-main-patricks-projects-f27190f8.vercel.app
   - Local dev: instructions in README.md

**Pass criteria:**
- Always check dispatch task for specific pass criteria (e.g., "all #106–#109 flows pass")
- If not specified: refer to latest STATE.md "QA Verdict:" for baseline
- Role × Tier × Data Operation matrix: test all combinations, not just happy path

**Reference docs:**
- QA audit patterns: `self-healing/self_healing_skills.md`
- Feature decisions: `claude_docs/feature-decisions/` (understand intent before testing)

---

## findasale-ux (UX Design, User Experience, Interaction Patterns)

**What I own:** UX audits, interaction design, component specs, user flow optimization, accessibility review.

**The 3 most common lookups:**
1. **Design patterns & brand** — What is the existing design language? What's locked in?
   - Brand voice: `claude_docs/brand/brand-voice-guide-2026-03-16.md`
   - Locked ADRs: `claude_docs/architecture/` (search for ADR-***.md with "LOCKED" status)
   - Current component patterns: grep `claude_docs/audits/` for UX-related files
2. **Known friction & pain points** — What has users complained about? What's slow?
   - Recent friction audits: `claude_docs/operations/friction-audit-*.md`
   - UX spotchecks: `claude_docs/ux-spotchecks/` (before/after snapshots)
   - Innovation research: `claude_docs/research/INNOVATION_HANDOFF_2026-03-22.md` (4 research topics)
3. **Feature status** — Is this idea already built? Already rejected?
   - Completed features: STATE.md "Completed Features" section
   - Rejected ideas: `claude_docs/decisions-log.md` (search for "REJECTED")
   - In-flight features: `claude_docs/feature-notes/` (active sprint work)

**Before you suggest a design change:**
- Check `claude_docs/architecture/` for any locked ADRs that constrain this feature
- Confirm feature is NOT in STATE.md Completed Features
- Review `claude_docs/decisions-log.md` to check if idea was already rejected

**Reference docs:**
- Cross-layer contracts: CLAUDE.md §3 (database owns schema, backend owns API, frontend owns UI)
- ADR process: none published yet — propose via escalation

---

## findasale-marketing (Go-to-Market, Revenue, User Acquisition)

**What I own:** Pricing strategy, marketing copy, user messaging, competitive positioning, revenue initiatives.

**The 3 most common lookups:**
1. **Pricing tiers & fees** — How much do organizers/shoppers pay? What's the fee structure?
   - Current pricing: STATE.md "Pricing Model (LOCKED)" section
   - Full analysis: `claude_docs/operations/pricing-analysis-2026-03-15.md` (historical + rationale)
   - Shopper monetization: STATE.md (search for "Hunt Pass" and "Premium Shopper")
2. **Competitive context** — What do competitors charge? How does FindA.Sale position?
   - Competitor intel: `claude_docs/competitor-intel/` (browse recent files)
   - Brand voice: `claude_docs/brand/brand-voice-guide-2026-03-16.md` (messaging guide)
   - User research: `claude_docs/research/INNOVATION_HANDOFF_2026-03-22.md` (Joybird UX, Amazon insights)
3. **User personas & segments** — Who are we selling to? What problems do they have?
   - Organizer persona: STATE.md "Project Purpose" section
   - Use cases: STACK.md (estate sales, yard sales, auctions, flea markets, consignment)
   - Innovation research: 4 topics for future monetization strategy

**Reference docs:**
- Beta launch sequence: `claude_docs/beta-launch/organizer-email-sequence.md`
- Support KB: `claude_docs/beta-launch/support-kb.md`
- Pricing source of truth: STATE.md (not pricing-analysis.md — that's historical only)

---

## findasale-hacker (Security, Auth, Data Protection)

**What I own:** Security audits, auth flow design, data validation, vulnerability fixes, threat modeling.

**The 3 most common lookups:**
1. **Auth flows** — How does login/signup/passkey work? What are the rules?
   - Auth strategy: SECURITY.md (full auth protocol)
   - Passkey flow: SECURITY.md (challenge storage, counter validation)
   - Session management: CLAUDE.md (look for SESSION or AUTH sections)
2. **Known security issues** — What are the open P0/P1 security bugs?
   - Open security issues: STATE.md (search for "P0 SECURITY" or "HACKER")
   - Sentry security issues: https://deseee.sentry.io (filter by "auth" or "security")
   - Threat log: SECURITY.md (append-only threat assessment)
3. **Data validation rules** — What inputs must be validated? What are the rules?
   - Input validation patterns: SECURITY.md (field validation section)
   - Rate limiting: CLAUDE.md §9 (MCP Tool Awareness → rate limit rules)
   - Data retention: SECURITY.md (PII handling, deletion policy)

**Red-flag veto gate:** Auth flow changes, payment processing, data deletion — require Architect or Hacker sign-off BEFORE dev dispatch.

**Reference docs:**
- Full security policy: SECURITY.md
- Recovery procedures: RECOVERY.md
- Session safeguards: `operations/session-safeguards.md` (3-attempt limit rule)

---

## findasale-architect (System Design, Contracts, Cross-Layer Decisions)

**What I own:** API contracts, database schema design, system-wide decisions, technology choices, architecture decision records.

**The 3 most common lookups:**
1. **API contracts** — What does endpoint X return? What's the shape?
   - Controllers: `packages/backend/src/controllers/` (one file per route group)
   - Routes file: `packages/backend/src/routes/` (endpoint definitions)
   - Response types: `packages/backend/src/types/` (TypeScript contracts)
2. **Schema decisions** — Why is this model structured this way? Can I add field X?
   - Current schema: `packages/database/prisma/schema.prisma`
   - Schema rationale: `claude_docs/architecture/` (search for ADR-*-schema)
   - Migration protocol: CLAUDE.md §6 (Prisma migration rules)
3. **Cross-layer contracts** — What does database own? What does backend own? Frontend?
   - Cross-layer rules: CLAUDE.md §3 (database owns schema, backend owns API, frontend owns UI)
   - Architecture ADRs: `claude_docs/architecture/` (ADR-***.md files)
   - Package boundaries: CLAUDE.md §2 "Monorepo Structure"

**Before you approve a schema change:**
- Check if field already exists (Schema verify — findasale-dev §8)
- Confirm no logic duplication across layers
- Review existing ADRs for similar decisions

**Reference docs:**
- Architecture decisions: `claude_docs/architecture/` (ADR-*.md files)
- Tech stack: STACK.md (authorized technologies only)
- Schema change protocol: CLAUDE.md §6

---

## findasale-records (Documentation, Archives, Session Hygiene)

**What I own:** Documentation structure, file organization, archival, session wraps, integrity checks.

**The 3 most common lookups:**
1. **File creation rules** — Where should I put this file? What are the naming rules?
   - File schema: `claude_docs/operations/file-creation-schema.md` (complete authority)
   - Locked directories: file-creation-schema.md "Locked Folder Map"
   - Archive protocol: file-creation-schema.md "Archive Vault"
2. **Session wrap protocol** — What needs to be updated at wrap? In what order?
   - Doc update order: CORE.md §5 "Session Wrap"
   - Wrap checklist: `WRAP_PROTOCOL_QUICK_REFERENCE.md` (if exists) or CLAUDE.md §12
   - Push block format: CORE.md §4 (complete block with all files)
3. **Archive index & retrieval** — Is this document archived? How do I find it?
   - Archive index: `claude_docs/archive/archive-index.json` (manifest)
   - Retrieval: request via handoff; Records retrieves and passes content
   - Archive content: `claude_docs/archive/` (subdirectories allowed)

**Before you archive anything:**
- Check `archive-index.json` to avoid duplicates
- Follow naming convention: `kebab-case-topic-YYYY-MM-DD.md` for one-time artifacts
- Update index after archiving

**Reference docs:**
- File creation schema: `claude_docs/operations/file-creation-schema.md` (enforcement authority)
- Archive vault rules: file-creation-schema.md "Archive Vault"
- Session wrap: CORE.md §5 (complete wrap sequence)

---

## findasale-ops (Operations, DevOps, Deployment, Infrastructure)

**What I own:** Deployment procedures, CI/CD, environment management, Railway/Vercel configs, performance monitoring.

**The 3 most common lookups:**
1. **Deployment status** — Is the build green? Did the deploy succeed?
   - Vercel (frontend): https://vercel.com/ → FindA.Sale project
   - Railway (backend): https://railway.app/ → FindA.Sale project
   - Recent deployments: check both dashboards for latest activity
2. **Environment configuration** — What env vars are set? What's the process?
   - Railway env vars: Railway dashboard → Project Settings → Variables
   - Vercel env vars: Vercel dashboard → Project Settings → Environment Variables
   - .env template: `.env.example` in project root
3. **Rollback procedures** — If something breaks, how do we revert?
   - Rollback process: RECOVERY.md (full procedures)
   - Database rollback: CLAUDE.md §6 (Prisma migration recovery)
   - Git rollback: `git revert` for safety (never force-push)

**Reference docs:**
- Recovery procedures: RECOVERY.md (complete rollback guide)
- Deployment status: patrick-dashboard.md (Patrick-readable build status)
- Schema change protocol: CLAUDE.md §6 (includes migration step)

---

## findasale-innovation (Research, Strategy, Feature Discovery)

**What I own:** Innovation research, competitive analysis, strategic options, feature feasibility studies.

**The 3 most common lookups:**
1. **Innovation research** — What new features or strategies are being explored?
   - Latest research: `claude_docs/research/INNOVATION_HANDOFF_2026-03-22.md` (4 topics: Amazon, BizBuySell, Joybird, digital assets)
   - Research methodology: look for `research/` backlog-ID prefixed files
   - Competitor intelligence: `claude_docs/competitor-intel/` (recent analyses)
2. **Strategic options** — What are the revenue opportunities? Business model alternatives?
   - Pricing strategy: `claude_docs/operations/pricing-analysis-2026-03-15.md` + STATE.md
   - Feature roadmap: `claude_docs/strategy/` (long-term vision)
   - Completed phases: STATE.md or `COMPLETED_PHASES.md` (what we've already tried)
3. **Feature feasibility** — Can we build this? What's the cost/benefit?
   - Tech stack: STACK.md (authorized technologies)
   - Current load: STATE.md "Project Health" section
   - Similar features: `claude_docs/feature-decisions/` (see what we decided before)

**Before you research a topic:**
- Check `research/` folder to avoid duplicate research
- Check `decisions-log.md` to see if this decision was already made
- Confirm with Patrick that the research is authorized

**Reference docs:**
- Pricing source of truth: STATE.md "Pricing Model (LOCKED)"
- Feature backlog: STATE.md "Active Objective" (pending features)
- Strategy: `claude_docs/strategy/` (long-term roadmap)

---

## Cross-Subagent Escalation

If any subagent detects a locked decision conflict, stale context, or P0 finding, include a `## Patrick Direct` block in the handoff. See CORE.md §6 (Escalation Channel) for rules and format.

---

**This file is the canonical quick-reference. Propose updates via self-improvement blocks in your handoff. Records approves updates. Patrick decides policy changes.**
