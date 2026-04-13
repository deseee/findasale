# Documentation Structure Audit — 2026-03-22

**Audience:** Patrick (non-technical PM), Claude main session (orchestrator), Subagents (specialists).

---

## 1. Findings Per Audience

### For Patrick (Non-Technical PM)

**Problem: STATE.md is agent-centric, not founder-centric.**

STATE.md is the "north star" for session state but reads like an implementation log. Entries like "P1 PASSKEY SECURITY FIX: Challenge storage moved from in-memory Map to Redis with atomic getDel" mean nothing to Patrick. He needs "Passkey login now prevents concurrent-session race attacks."

**next-session-prompt.md is usable but command-heavy.** Patrick gets PowerShell blocks and CLI instructions. It works for technical PMs but buries decisions in implementation detail. He has to parse through 30+ lines to extract "install skills + run Prisma."

**Missing: A "Patrick Dashboard" one-pager.** Patrick should be able to open ONE file and see:
- Project health status (build green/red, deployment status, live QA verdict)
- Revenue/pricing current state (attached to pricing model)
- Next 3 decisions he needs to make
- What agents are working on
- What's blocking progress (with clear "action for Patrick" items)

**Current workaround:** Patrick reads fragments across STATE.md, next-session-prompt.md, and session-log.md, then digs into decision-log.md for context. This costs him 5–10 minutes per session.

---

### For Claude Main Session (Orchestrator)

**Problem: Session init requires loading multiple files in non-intuitive order.**

Current sequence per CORE.md §2:
1. Load CORE.md (5 rules, consolidated — good)
2. Load context.md (does not exist — old reference?)
3. Load STATE.md (full file, 136 lines, contains history Patrick doesn't need)
4. Skim session-log.md (good)
5. GitHub sync check (good)

**Issues:**
- "Load context.md" fails silently — CORE.md references a file that doesn't exist. (CORE.md is stale.)
- STATE.md is dense. Main session reads 136 lines to extract: "S235 complete, S234 actions pending." A 10-line summary + link to full history would cut init time.
- No quick-reference for where architecture/API/types live. Subagents ask main session constantly: "Where's the schema?" "What's the API contract?" Main session has to search or rely on subagent knowledge.

**Current overhead:** ~8k tokens per session init (STATE.md read + surrounding context).

---

### For Subagents (Specialists)

**Problem: No single "subagent quick-reference" for domain-specific paths.**

Each subagent role needs different entry points:
- **findasale-dev** needs: schema.prisma path, API contract structure, current bugs, code standards
- **findasale-qa** needs: latest QA audit, test accounts, pass/fail criteria, browser setup
- **findasale-ux** needs: design system files, brand guide, UX patterns, current pain points
- **findasale-marketing** needs: pricing model, brand voice, competitive intel, user personas
- **findasale-hacker** needs: security audit, auth flows, infrastructure, threat model

**Current state:** Each subagent's prompt includes context by hand. There is no canonical "here's everything a dev subagent needs to know" file. Subagents search or re-read CLAUDE.md repeatedly.

**Overhead per dispatch:** 2–4k tokens explaining paths and context that could be in a file.

---

## 2. Gaps (What's Missing)

### Gap 1: Patrick Dashboard

**Why needed:** Patrick is non-technical. He should not read CLAUDE.md or agent logs. He needs a single place to understand project status + what he needs to do.

**Suggested content (one-pager):**
```
# FindA.Sale Status — [Date]

## Build Status
- Vercel: [GREEN | RED] — [last build timestamp]
- Railway: [GREEN | RED] — [last build timestamp]
- Sentry errors: [X open issues] — [link]

## Live QA Verdict
- Current: CONDITIONAL GO (all 24 bugs fixed, Passkey P1 shipped)
- Last tested: S234 (2026-03-22)
- Blockers for GO: None live-tested yet from S234 fixes

## Next 3 Patrick Decisions
1. Install 7 updated skills + push docs (S235 work)
2. Run Prisma migrate deploy + set Railway env vars (S234 carryover)
3. Approve Print Kit feature (innovation research finding)

## What Teams Are Working On
- Main Claude: [current task or "awaiting action"]
- findasale-dev: [current dispatch or "idle"]
- findasale-qa: [current dispatch or "idle"]
- ...other agents

## Blocked By / Waiting On
- Prisma migration (S234 — Patrick action)
- Live testing of follow system + edit dates

## One-Sentence Updates
- Organizer Reputation Score: Already built, verified working
- Print Kit (POD): New idea from innovation research, not built yet
- Skills: 7 packages updated (marketing fee model now 10% flat)
- Project hygiene: 19 temp files deleted, docs reorganized
```

**Effort:** Small (template + one update per session)
**Impact:** High — eliminates Patrick's 5–10 min session startup parsing

---

### Gap 2: Subagent Quick-Reference

**Why needed:** Each subagent role has repeating lookups. A single file per role (or one file with all roles) cuts dispatch context by 2–4k tokens per job.

**Suggested structure:**
```
# Subagent Quick-Reference

## findasale-dev

**Schema & Types:**
- Schema: `packages/database/prisma/schema.prisma`
- Types exported: `packages/shared/src/types/` (check this folder)
- API types: `packages/backend/src/types/` (responses, requests)
- Controller contracts: `packages/backend/src/controllers/` (one per route group)

**Infrastructure:**
- Stack: STACK.md (tech overview)
- Security: SECURITY.md (auth flow, validation rules)
- Env vars: Railway dashboard + .env.example

**Current State:**
- QA bugs: claude_docs/operations/qa-audit-2026-03-22.md
- Schema changes: CLAUDE.md §6 (migration protocol)
- Known issues: STATE.md (latest session entry)

**Before You Commit:**
- Run: packages/frontend && npx tsc --noEmit --skipLibCheck (zero errors required)
- Schema-first pre-flight gate: CLAUDE.md §8 (mandatory steps)
- Push rules: CLAUDE.md §5 (MCP limits: ≤3 files, ≤25k tokens)

## findasale-qa

**Entry Points:**
- Latest audit: claude_docs/operations/qa-audit-2026-03-22.md
- Test accounts: STATE.md (DB test accounts section)
- Role-based flows: STACK.md (role enum: SHOPPER, ORGANIZER, ADMIN)
- Tier-based flows: pricing-and-tiers-overview in STATE.md

**Live Testing:**
- Staging: https://findasale-git-main-patricks-projects-f27190f8.vercel.app
- Production: https://finda.sale
- Sentry: https://deseee.sentry.io

**Pass Criteria:**
- Determine from dispatch task (e.g., "all #106–#109 flows pass")
- If none given: use STATE.md QA Verdict as baseline

## findasale-ux

**Design System & Brand:**
- Brand voice: claude_docs/brand/brand-voice-guide-2026-03-16.md
- Current design patterns: (no unified design-system.md yet — check architecture/ for latest specs)
- Dark mode rules: CLAUDE.md §3 (cross-layer contracts)

**Pain Points & Research:**
- Recent UX audits: claude_docs/audits/ (grep for "ux-" prefix)
- Friction reports: claude_docs/operations/friction-audit-*.md
- Innovation research: claude_docs/research/INNOVATION_HANDOFF_2026-03-22.md

**Before You Suggest:**
- Check architecture/ folder for locked ADRs (e.g., ADR-068-COMMAND-CENTER-DASHBOARD.md)
- Confirm feature is not already in STATE.md (Completed Features section)
- Review past rejected ideas in decisions-log.md

## findasale-marketing

**Pricing & Tiers:**
- Full model: pricing-and-tiers-overview (in STATE.md) + pricing-analysis-2026-03-15.md
- Shopper monetization: Hunt Pass (PAUSED), Premium Shopper (DEFERRED 2027 Q2)
- Post-beta: Featured Placement, AI Tagging Premium, Affiliate program

**User Personas & Competitive Context:**
- Competitor intel: claude_docs/competitor-intel/
- Brand voice: claude_docs/brand/brand-voice-guide-2026-03-16.md
- User journey: innovation research handoff (4 topics for future revenue)

**Go-to-Market:**
- Beta recruitment: next-session-prompt.md (conditional)
- Organizer onboarding: claude_docs/beta-launch/organizer-email-sequence.md
- Support KB: claude_docs/beta-launch/support-kb.md
```

**Effort:** Medium (write once, update quarterly)
**Impact:** High — cuts 2–4k tokens per subagent dispatch; improves dispatch quality

---

### Gap 3: Cross-Agent Contracts File

**Why needed:** Subagents frequently ask: "What shape does the API return?" "Does the schema have field X?" "What types does the hook export?" These answers are scattered across files.

**Suggested file: `claude_docs/operations/cross-agent-contracts.md`**

Content:
```
# Cross-Agent Contracts — Schema, API, Hooks

(This file is NEVER committed to git. It is a Claude reference only. Use it to find canonical sources.)

## Database Schema (Source of Truth)
- File: packages/database/prisma/schema.prisma
- When you need: "Does Sale have field X?" → read schema first
- TypeScript types: packages/shared/src/types/ (re-exported from Prisma client)

## API Response Contracts (Backend owns these)
- Location: packages/backend/src/controllers/
- Naming: [resourceName]Controller.ts, exports response types + handler signatures
- e.g., saleController.ts exports `SaleResponse`, `SaleDetailResponse`, `CreateSaleRequest`
- Frontend must NOT reformat API responses — use them as-is

## Frontend Hooks (Frontend owns these)
- Location: packages/frontend/src/hooks/
- Pattern: useFetch[Resource].ts (e.g., useFetchSales.ts)
- Return shape: Check hook file BEFORE destructuring in component
- Common mistake: Assuming hook returns { isLoading, data } when it returns [data, isLoading]

## Shared Types (Enforced boundary)
- Location: packages/shared/src/types/
- What goes here: Only enums + constants used by 2+ packages (Role, Tier, UserStatus, etc.)
- What doesn't: Domain models (schema types go in Prisma), API contracts (go in backend controllers)

## Authentication Flow (Backend owns, frontend implements)
- Entry: packages/backend/src/middleware/auth.ts (JWT decode, role check)
- Frontend session: packages/frontend/src/lib/useSession.ts
- Passkey flow: packages/backend/src/controllers/passkeyController.ts (P1 security fixes in S234)

## Middleware Stack (Backend orchestration)
- Order matters: auth → requireOrganizer/requireAdmin → rateLimit → timeout → handler
- Never add auth checks AFTER this stack — use requireOrganizer / requireAdmin middleware
- Rate limit: packages/backend/src/middleware/rateLimiters.ts (Redis + in-memory fallback)
- Timeout: packages/backend/src/middleware/requestTimeout.ts (30s, 503 response)
```

**Effort:** Medium (write once, update when schema/API contracts change)
**Impact:** Medium — cuts 1–2k tokens per architecture question

---

### Gap 4: Session Init Sequence Documentation

**Why needed:** CORE.md §2 references "context.md" which doesn't exist. Main session (and new team members) get confused.

**Suggested update to CORE.md §2:**
```
## 2. Session Init

Every session, before any work:

1. Check active MCP tools (GitHub, Stripe, etc.)
2. Load STATE.md (latest 1–2 session entries + pending Patrick actions)
3. Load next-session-prompt.md (what comes next)
4. Skim session-log.md (validate state matches recent entries)
5. Check GitHub sync: compare local STATE.md `Last Updated` vs remote.
   If different → tell Patrick to run `.\push.ps1` first. Block until synced.
6. Announce estimated context budget: "~Xk tokens available this session."

Skip re-loading on subsequent turns if context was already loaded this session.
First message of any session always triggers init (conversation-defaults Rule 3).

**POST-COMPRESSION RE-INIT:**
After autocompaction, immediately re-run steps 2–6 (full re-init). Autocompaction is a session boundary.
```

**Effort:** Tiny (edit existing)
**Impact:** Low but important for clarity + new team member onboarding

---

## 3. Redundancies (Overlaps & Drift Risk)

### Redundancy 1: Pricing Model Documented in Two Places

- **Location A:** STATE.md (lines 110–117): "Pricing Model (LOCKED)" with all tiers + overages
- **Location B:** claude_docs/operations/pricing-analysis-2026-03-15.md (19k tokens): Deep dive + strategic rationale

**Risk:** If pricing changes, one location might not be updated.

**Resolution:** STATE.md is source of truth (synced at every session). pricing-analysis is context for new decisions. Add comment to pricing-analysis: "Source of truth: STATE.md lines 110–117."

---

### Redundancy 2: Session State in Three Places

- **Location A:** STATE.md (latest session entry, 10–20 lines)
- **Location B:** session-log.md (summary + full entry)
- **Location C:** next-session-prompt.md (what comes next, often overlaps with STATE.md)

**Risk:** If a session is pushed but next-session-prompt is not updated, S235 actions may be forgotten.

**Root cause:** No formal handoff protocol between push and next-session-prompt update.

**Resolution:** Add to WRAP_PROTOCOL_QUICK_REFERENCE.md:
- After every session push: Update next-session-prompt.md FIRST (list pending Patrick actions)
- Then update STATE.md + session-log.md
- Never push STATE.md without corresponding next-session-prompt.md entry

---

### Redundancy 3: Execution Rules Documented in Three Files

- **CORE.md §3:** Execution flow (Survey → Plan → Execute → Verify)
- **CLAUDE.md §4:** Execution rules (nearly identical)
- **CLAUDE.md §5:** Push rules (mostly different, but overlaps with CORE.md §4)

**Risk:** If behavior changes in one file, others fall out of sync. (This has happened — CORE.md references "context.md" which doesn't exist.)

**Resolution:** CLAUDE.md should defer to CORE.md: "See CORE.md §3 for execution flow. CLAUDE.md §4–5 below define project-specific contract terms."

---

### Redundancy 4: Push Rules in CORE.md §4 vs CLAUDE.md §5

- CORE.md §4: Generic MCP limits (3 files, token count)
- CLAUDE.md §5: Project-specific (subagent ban, PowerShell escaping, merge conflict re-staging)

**Issue:** A new agent reads CLAUDE.md §5 and misses CORE.md §4 limits. Or vice versa.

**Resolution:** Consolidate into a single "authority chain":
- CORE.md §4: Universal rules (never change project to project)
- CLAUDE.md §5: Project-specific augmentations (subagent ban, PowerShell, escaping)
- Create a "master checklist" in WRAP_PROTOCOL_QUICK_REFERENCE.md that pulls from both

---

## 4. Recommended Changes — Ranked by Impact

### Change 1: Create Patrick Dashboard (HIGH IMPACT / SMALL EFFORT)

**What:** One-page status file updated at session wrap.

**File:** `claude_docs/patrick-dashboard.md`

**Content:** (as shown in Gap 1 above)

**Update frequency:** Every session wrap (Records agent)

**Impact:** Patrick no longer parses 3 files to find "what's the project health?" Saves him 5–10 min/session.

**Effort:** Small (template + update logic in wrap protocol)

**Implementation:** S236 (Records agent writes template + adds to wrap protocol)

---

### Change 2: Create Subagent Quick-Reference (HIGH IMPACT / MEDIUM EFFORT)

**What:** One file per agent role with paths + entry points + pre-flight checks.

**File:** `claude_docs/operations/subagent-quick-ref-[ROLE].md` (or one file with sections per role)

**Content:** (as shown in Gap 2 above)

**Update frequency:** Quarterly or when role context changes

**Impact:** Cuts 2–4k tokens per subagent dispatch. Improves dispatch quality. Reduces repeated questions.

**Effort:** Medium (write content for 5–6 roles, then maintain)

**Implementation:** S236 (Records writes one template; subagents refine their own sections over time)

---

### Change 3: Fix CORE.md §2 (Context.md Reference) (LOW IMPACT / TINY EFFORT)

**What:** Remove reference to non-existent "context.md". Update session init sequence.

**File:** `claude_docs/CORE.md` (lines 26–34)

**Changes:**
- Remove "Load context.md" (doesn't exist)
- Reorder: STATE.md → next-session-prompt.md → session-log.md
- Add: "Skip re-loading on subsequent turns..."

**Impact:** Fixes false instruction. Prevents confusion on session init.

**Effort:** Tiny (5-min edit)

**Implementation:** S235 or S236 (Records)

---

### Change 4: Consolidate Push Rules (MEDIUM IMPACT / MEDIUM EFFORT)

**What:** Stop duplicating push rules across CORE.md §4 and CLAUDE.md §5. Create single authority.

**Plan:**
- CORE.md §4: Keep universal rules only (3 files, token limits, read before write)
- CLAUDE.md §5: Keep project-specific rules (subagent ban, PowerShell escaping, merge conflict re-staging)
- Create `WRAP_PROTOCOL_QUICK_REFERENCE.md` master checklist that pulls from both

**Impact:** Reduces maintenance burden. Prevents drift.

**Effort:** Medium (consolidation + testing)

**Implementation:** S236 (Records consolidates; no breaking changes)

---

### Change 5: Create Cross-Agent Contracts File (MEDIUM IMPACT / MEDIUM EFFORT)

**What:** Single reference for schema, API contracts, hooks, shared types, auth flow.

**File:** `claude_docs/operations/contracts-schema-api-types.md` (or part of quick-ref)

**Content:** (as shown in Gap 3 above)

**Update frequency:** Every time schema or API contracts change

**Impact:** Cuts 1–2k tokens per architecture question. Reduces subagent uncertainty.

**Effort:** Medium (write content, then maintain on schema changes)

**Implementation:** S236 (Records writes; dev subagent maintains schema section)

---

### Change 6: Add Handoff Protocol Update to Wrap Checklist (LOW IMPACT / TINY EFFORT)

**What:** Formalize the order of doc updates at session wrap to prevent redundancy drift.

**File:** `WRAP_PROTOCOL_QUICK_REFERENCE.md` (or add section to CLAUDE.md §12)

**Changes:**
```
**Doc Update Order (at session wrap):**
1. Update STATE.md (latest session entry) — this is source of truth
2. Update next-session-prompt.md (pending Patrick actions, what comes next)
3. Update session-log.md (prepend new entry, keep 5 most recent)
4. Update patrick-dashboard.md (if created in Change 1)
5. Push docs via Patrick (.\push.ps1)

Never update one without the others. Never push STATE without next-session-prompt.
```

**Impact:** Prevents redundancy drift. Formalizes current practice.

**Effort:** Tiny (5-min edit to existing file)

**Implementation:** S235 or S236 (Records)

---

## 5. Which Changes Records Can Implement Now vs Which Need Patrick Approval

### Implement Immediately (S235 / S236)

1. **Fix CORE.md §2** (remove context.md reference) — No approval needed
2. **Add Handoff Protocol Update** to wrap checklist — No approval needed
3. **Create Patrick Dashboard template** — No approval needed (template-only, Records updates it at wrap)
4. **Create Subagent Quick-Reference skeleton** — No approval needed (Records creates template; subagents refine)

### Need Patrick Review First

1. **Consolidate Push Rules (CORE.md + CLAUDE.md)** — This affects enforced behavior. Show Patrick the consolidation plan before executing.
2. **New files in operations/** — Confirm these don't violate file-creation-schema.md

### Recommend to Patrick (Decision)

1. **Whether to create Patrick Dashboard** — Does he want a status file he reviews weekly? Or is current next-session-prompt.md enough?
2. **Update frequency for quick-references** — How often should these be refreshed?

---

## 6. Summary & Recommendations

**Current state:** Documentation is comprehensive but scattered. Patrick parses multiple files to understand project health. Subagents re-read context repeatedly. Main session init references non-existent files.

**Ideal state:**
- Patrick opens ONE file (Patrick Dashboard) and gets oriented in 2 minutes
- Subagents open their role's quick-reference and get context in 5 minutes
- Main session init loads 4 files in fixed order with no broken references
- All redundancies have clear "source of truth" designation

**Quick wins (S235–236):**
- Fix CORE.md §2 (5 min)
- Create Patrick Dashboard template (20 min)
- Create Subagent Quick-Reference sections (60 min, can spread over sessions)
- Add handoff protocol to wrap checklist (5 min)

**Medium-term (future sessions):**
- Consolidate push rules (coordinate with Patrick)
- Create cross-agent contracts file (maintain on schema changes)
- Archive old research/audit files (operations/archive rotation)

**Impact if implemented:** Saves Patrick 5–10 min/session. Saves subagents 2–4k tokens/dispatch. Eliminates redundancy drift. Improves new team member onboarding.

**Authority:** Records Agent (S235) can implement quick wins. Patrick approval needed for rule consolidations. No code changes needed; documentation-only.
