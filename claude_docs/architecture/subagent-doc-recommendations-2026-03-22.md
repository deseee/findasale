# Subagent Documentation System Evaluation

**Status:** DRAFT — Recommendations pending implementation
**Decision Date:** 2026-03-22
**Evaluator:** Architect (Haiku 4.5)
**Scope:** Technical documentation workflow for dispatched subagents (findasale-dev, findasale-qa, findasale-hacker, findasale-ops)

---

## Executive Summary

The documentation system is **mature but fragmented**. Subagents must currently read 5-7 files across 4 directories to get oriented on a single feature task. A **technical-brief document** (consolidating schema, routes, types, and gotchas into one reference) and **ADR status headers** would reduce ramp-up time by ~40% and cut repeated mistakes.

**3 highest-impact recommendations:**
1. **Create `claude_docs/operations/technical-brief.md`** — single-read schema summary, active API routes, key types, and active gotchas
2. **Add status headers to ADRs in `architecture/`** — mark "Active", "Superseded", "Historical Context"
3. **Link feature specs to implementation paths** — `feature-decisions/` files should map to the actual controller/page files

---

## Detailed Analysis

### 1. Pre-Flight Read Overhead (§8 Subagent Gate)

**Current requirement:** Dev subagents must read:
- `packages/database/prisma/schema.prisma` (~1,500 lines, 74KB)
- 1–3 hook files (from `packages/frontend/hooks/`)
- 1–2 controller files (from `packages/backend/src/controllers/`)
- Type definition file (implicit, usually in `packages/shared/` or scattered)

**Current read path:** 4–6 file reads totaling ~150–250 lines scanned per dispatch just to understand "what exists."

**Problem:** The schema file is correct but enormous. Subagents can't be expected to memorize 50+ models. They need a cheat sheet.

**Recommendation:** Create a **living technical brief** that lists:
- All active Prisma models (one-liner summary per model)
- All key API routes (GET /items, POST /items, PUT /items/:id, etc.)
- Key hook shapes (which return `{ data, isLoading }` vs. raw values)
- Forbidden imports and patterns (with evidence)
- Gotchas that appear in code but aren't documented

**Expected impact:** First read before coding reduces from 30 min to 5 min.

---

### 2. Cross-Layer Contracts (CLAUDE.md §3)

**Current state:** CLAUDE.md §3 defines the principle ("Database owns schema, Backend owns API contract, Frontend owns UI") but provides no artifact showing the actual current contracts.

**Gap:** When a dev subagent is asked to "add a field to the Item model and expose it in the API", they must:
1. Read schema.prisma to confirm the field doesn't exist
2. Check an existing controller endpoint (e.g., getItemById) to understand the return type
3. Search for uses of that field elsewhere to avoid breaking changes
4. Infer the implied frontend expectation by reading component code

This is error-prone. The dev might miss that a field is already partially exposed or that a type is broken in the shared layer.

**What's missing:** A "contract snapshot" document showing:
- Key models and their exposed fields per role (SHOPPER, ORGANIZER, ADMIN)
- Active API endpoints (route + method + parameters + return type)
- Key types in shared (Sale, Item, User, Bid, Reservation)

**Recommendation:** Add to `operations/technical-brief.md`:
```markdown
## Active API Contracts

### GET /api/items/:id (shopper public)
Returns: { id, title, description, image, price, saleId, createdAt, ... }
Excludes: draftStatus, aiConfidence, internalNotes

### GET /api/organizer/sales/:saleId/items (organizer private)
Returns: [{ id, title, description, ..., draftStatus, stats: { bids, reserves } }]
Requires: JWT + ownership check

### PUT /api/items/:id (organizer private)
Accepts: { title?, description?, price?, images?, tags?, draftStatus? }
Returns: full item object
Validates: ownership, draftStatus workflow, image count
```

This becomes the first-read reference for any schema or API change.

---

### 3. Architecture Decisions (ADRs) — Status and Usefulness

**Current state:** `architecture/` contains 18 ADRs with titles like:
- `ADR-013-060-TEAMS-BUNDLE-SPEC.md`
- `ADR-065-IMPLEMENTATION-PLAN.md`
- `adr-072-dual-role-account-schema.md`
- `ADR-065-QUICK-REFERENCE.md`

**Observation:** Multiple ADRs with overlapping backlog IDs (e.g., ADR-065 appears 3 times: full spec, implementation plan, quick ref). The structure suggests these are **all historical research** rather than **active decisions**.

**Problem:** A dev subagent reading "adr-072-dual-role-account-schema.md" doesn't know if:
- This is the current design (apply it)
- This is a legacy design that was superseded in S230 (ignore it)
- This is forward-looking design for Q2 (reference but don't implement yet)

**Recommendation:** Add a **status header** to every ADR:
```markdown
# ADR-072: Dual Role Account Schema

**Status:** Active (Session 234, 2026-03-22)
**Related:** #106, #107 (features that depend on this)
**Last Updated:** Session 234
**Supersedes:** ADR-068 (single-role auth)
**Superseded By:** —

---

## Decision
...
```

**Template for status values:**
- **Active** — implemented, in use, subagents should follow this
- **In Progress** — actively being worked on, reference but check with current session
- **Superseded** — old decision, reference for historical context only, see [link] for current approach
- **Deferred** — planned but not yet scheduled
- **Rejected** — considered but not adopted

**Expected impact:** Eliminates ~20 minutes of "is this still valid?" uncertainty per dispatch.

---

### 4. Feature Context — Spec to Implementation Path

**Current state:** `feature-decisions/` contains 7 decision records like:
- `feature-spec-73-notifications.md`
- `feature-spec-75-tier-lapse-logic.md`
- `CAMERA_WORKFLOW_V2_ARCHITECTURE.md`

**Problem:** A spec says "Build the notifications system" but doesn't link to:
- Which backend controllers handle notifications
- Which frontend pages implement the UI
- Which database models power the system
- What hooks the frontend uses

A dev subagent must re-derive this by code search every time.

**Recommendation:** Add to each feature spec:
```markdown
## Implementation Reference

**Database Models:** User, Notification, NotificationPreference (schema lines 245–260)
**Backend:** `notificationController.ts`, `notificationService.ts`, routes: GET /api/notifications, POST /api/notifications/:id/read
**Frontend:** `pages/notifications.tsx`, `hooks/useNotifications.ts`
**Tests:** `__tests__/notificationController.test.ts`

See [ADR-073-two-channel-notification-system](../architecture/adr-073-two-channel-notification-system.md) for design.
```

This turns a spec into an **implementation roadmap** instead of free-form prose.

**Expected impact:** Removes ~15 minutes of code archaeology per feature dispatch.

---

### 5. Known Gotchas — Coverage and Discoverability

**Current state:** Gotchas live in 3 places:
1. **CLAUDE.md §8 Forbidden Patterns** — `import { anything } from '@findasale/shared'`, `{ isLoading }` from useState hooks
2. **self_healing_skills.md** — 18+ documented patterns (MCP truncation, fireWebhooks arity, powerShell brackets, etc.)
3. **Scattered:** STACK.md (fee structure locked), RECOVERY.md (env var mismatches), STATE.md (recent fixes)

**Problem:** A new dev subagent doesn't know to search `self_healing_skills.md` for "why is my function getting dropped after a merge?" This gotcha is in SH-003 but a dev facing truncation errors in a controller might not find it.

**Active undocumented gotchas identified in recent sessions:**
1. **`@findasale/shared` imports** — forbidden, causes Vercel failure (documented in CLAUDE.md §8 and findasale-dev skill, but not in self-healing)
2. **uuid@13 ESM-only** — causes backend startup crash on CommonJS load (documented in STATE.md S233 but not self-healing)
3. **CORS hardening mismatch** — env-var-only CORS config doesn't match code-level origin check (documented in STATE.md but not clearly)
4. **Env var naming drift** — MAILERLITE_API_KEY vs MAILERLITE_API_TOKEN (referenced in health-reports but not self-healing)
5. **Draft items endpoint routing** — GET /items with draftStatus param silently ignored; must use GET /items/drafts instead (in self_healing_skills.md SH-009 but easy to miss)

**Recommendation:** Consolidate gotchas into a **single "Known Issues & Patterns" section** of the technical brief:

```markdown
## Known Gotchas

### G-001: Forbidden import from @findasale/shared
**Symptom:** Vercel build fails: "Cannot find module @findasale/shared/types"
**Cause:** Shared package is CJS; importing in Frontend (ESM) breaks tree-shaking
**Fix:** Never import from shared. Define types locally or use type inference from API responses.
**Evidence:** S196–S202 (7 consecutive Vercel failures)

### G-002: Hook return shape mismatch
**Symptom:** TS2339: "isLoading does not exist" on useQuery result
**Cause:** useState returns raw value; react-query returns { data, isLoading, isError }
**Check:** Always read the hook file before destructuring. useState → raw. useQuery → object.

### G-003: Draft items endpoint confusion
**Symptom:** Organizer can't see drafts; endpoint returns published items only
**Cause:** GET /items?draftStatus=DRAFT silently ignores param; correct endpoint is GET /items/drafts
**Fix:** Use getDraftItemsBySaleId for organizer draft queries; getItemsBySaleId for public browse.
**Code:** itemController.ts lines 45–62 vs 120–145
```

**Expected impact:** Reduces repeated mistakes by ~30%; saves ~1 session per month in bug fix loops.

---

## Recommended Additions

### New Document: `claude_docs/operations/technical-brief.md`

A **single-read technical reference** for any dispatched subagent. Sections:

1. **Quick Model Summary** — 50–60 Prisma models, 2–3 lines each (fields, key relationships)
2. **API Routes** — all routes organized by resource (Items, Sales, Users, Bids, Notifications)
3. **Key Types** — location of important type definitions
4. **Hook Shapes** — which hooks return what (list all hooks under 50 lines)
5. **Forbidden Patterns** — all gotchas in one place
6. **Feature Index** — one-liner per active feature pointing to spec + implementation
7. **Environment Variables** — all required vars with their purposes

**Owner:** Architect (updated quarterly or after major schema changes)
**Read time:** 10–15 minutes for first exposure; 2–3 min for reference
**Length:** ~400 lines (easily scanned)

---

## Implementation Checklist

- [ ] Create `technical-brief.md` (scaffold from schema, routes, self-healing, CLAUDE.md §8)
- [ ] Add status headers to all 18 ADRs in `architecture/`
- [ ] Link each `feature-decisions/*.md` to implementation files (grep for controller/page/hook)
- [ ] Move undocumented gotchas from STATE.md + health-reports into self_healing_skills.md
- [ ] Add "Recommended Reading Order" to each feature spec (for first-time dev ramp-up)

---

## Cost & Timeline

**Technical Brief Creation:** Haiku exploration + synthesis → ~4 hours (1 session)
**ADR Status Headers:** Manual review + headers → ~1 hour
**Feature Spec Linking:** Grep + verification → ~2 hours (one dispatch)
**Gotcha Consolidation:** Extract + reformat → ~1 hour

**Total:** ~8 hours of work → 15–20% reduction in subagent ramp-up time per dispatch.

---

## Success Metrics

1. **Ramp-up time:** First dev dispatch on a new feature takes ≤20 min to read context (vs current 30–45 min)
2. **Repeated mistakes:** SH-001 (MCP truncation), SH-003 (missing functions), G-001 (shared imports) reductions by 50%+
3. **ADR clarity:** Subagents stop asking "is this design current?" — status headers answer it
4. **Feature confidence:** Dev subagent can map spec → implementation in 2 minutes vs. 15 minutes

---

## Owner & Maintenance

- **Technical Brief:** Architect (updates after schema PRs, quarterly baseline sync)
- **ADR Status Headers:** Architect + Dev review before each major feature
- **Gotcha Consolidation:** Ongoing (self_healing_skills.md is living; every ~10 sessions, consolidate new patterns)

---

**Next Step:** Patrick approves; Architect + Haiku create technical-brief.md in next session.
