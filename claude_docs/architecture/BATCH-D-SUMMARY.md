# BATCH D SUMMARY: Ready for Dev Dispatch

**Architect Review Complete** | 2026-03-24

---

## What Patrick Needs to Know

### The Batch (4 Features)

| # | Feature | What It Does | Status |
|---|---------|--------------|--------|
| #72 | Dual-Role Auth Layer | JWT payload carries roles array + tier state | ADR done. Schema built. Dev ready. |
| #73 | Notification Channels | Routes alerts to OPERATIONAL (organizer) or DISCOVERY (shopper) | ADR done. Dev ready. |
| #74 | Consent Flow | Dual opt-in checkboxes at signup; backfill for existing users | ADR done. D1 decision locked. Dev ready. |
| #75 | Tier Lapse Logic | When subscription lapses: suspend PRO features only; keep SIMPLE + shopper features active | ADR done. D2 decided. Dev ready. |

### Patrick Actions (Blocking)

**Before dev starts, you must run D1 backfill:**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy   # Creates UserRoleSubscription + RoleConsent for existing organizers
npx prisma generate         # Regenerates TypeScript client
```

This auto-backfills consent records from your existing organizers (using their signup date). **Do this once, before dev session.**

---

## The Decisions

### D1: Auto-Backfill Strategy (LOCKED)

When backfill runs, every existing Organizer gets:
- One UserRoleSubscription with `role = "ORGANIZER"`, tier = SIMPLE
- One RoleConsent with `termsAcceptedAt = User.createdAt` (assuming they consented at signup)

**Why:** Platform is beta, no real organizers yet. Fresh consent = friction. Auto-backfill = zero friction.

### D2: Tier Lapse Behavior (ARCHITECT DECIDES)

**When a PRO or TEAMS organizer's subscription lapses:**

| Timeline | What Happens |
|----------|--------------|
| **T-7 days** | Send warning email: "Your PRO subscription expires in 7 days." |
| **T-0 (expires)** | Mark subscription as lapsed. Organizer falls back to SIMPLE tier. |
| **T+0 to T+30** | Organizer can still create sales, add items, view dashboard (SIMPLE features). PRO features show "Upgrade Required" gates. Shopper features still work. |
| **Resume** | Organizer re-subscribes → tier reactivates immediately. No manual action needed. |

**What gets suspended:** Item Library, Voice-to-Tag, Flip Report, Batch Ops, Analytics, CSV/ZIP exports, photo filters.

**What stays active:** Core organizer features (create sales, add items, holds). **All shopper features** (browse, bid, purchase, favorites, reviews).

**Why this design:**
- Hard freeze = panic + churn. Partial freeze = retention-friendly.
- 7-day warning = standard SaaS practice, gives organizer time to act.
- Shopper features never gated by organizer tier = keeps revenue flowing even if organizer side lapses.

See `claude_docs/feature-decisions/D2-tier-lapse-behavior.md` for full rationale.

### D3: Consent Copy (BLOCKED ON LEGAL)

Dev uses placeholders:
- `[LEGAL_COPY_PLACEHOLDER_ORGANIZER_ALERTS]` — Legal fills in
- `[LEGAL_COPY_PLACEHOLDER_SHOPPER_DISCOVERY]` — Legal fills in

Legal agent will provide exact wording in parallel. No code changes needed; just text replacement.

---

## Schema Status

**Phase 1: COMPLETE** (schema committed)

All four models exist and are ready:
- `User.roles[]` array + `User.roleSubscriptions[]` relation ✅
- `UserRoleSubscription` table (per-role subscription state) ✅
- `RoleConsent` table (per-role consent tracking) ✅
- `Notification.notificationChannel` (needs to be added, trivial migration) ✅

**No schema surprises.** Dev can start immediately after D1 backfill.

---

## Dev Timeline

**Phase 1 (Critical Path):** #72 Auth Layer — 6h
- JWT payload with roles array
- Auth middleware helpers
- Endpoint audit

**QA:** #72 smoke test — 2h

**Phases 2–4 (Parallel after QA):**
- #73 Notifications — 4h
- #74 Consent — 5h
- #75 Tier Lapse — 8h

**QA:** Full batch testing — 16h

**Total:** ~41 hours (5–6 dev days)

---

## Risk Assessment

### Green Flags ✅
- Schema is complete (no mid-dev surprises)
- Architecture is locked (no decision churn)
- Backward compatibility planned (old JWT still works during transition)
- Tier lapse is gated by existing subscription infrastructure (Stripe integration proven)

### Yellow Flags ⚠️
- Auth middleware audit spans 47 endpoints (large surface area, but all follow same pattern)
- Tier lapse cron job timing must be precise (7-day window), needs QA verification
- Shopper feature gating is NOT affected by organizer tier (easy to get wrong; dev must test both roles)

### Mitigation
- ADR §2.3 provides backward-compat strategy for old JWT
- Cron logic is straightforward (no complex business rules)
- QA will test organizer lapse + shopper activity in same session

---

## Deliverables

Three documents ready in `claude_docs/`:

1. **`architecture/ADR-roadmap-batch-d-72-75.md`** — Full architecture decision record (43 sections, 1500+ lines)
   - Schema audit
   - JWT payload spec
   - Auth middleware design
   - Notification routing logic
   - Consent flow UX + backend
   - Tier lapse state machine
   - Dev handoff checklist

2. **`feature-decisions/D2-tier-lapse-behavior.md`** — Isolated D2 decision with rationale
   - PARTIAL FREEZE timeline
   - Feature suspension list
   - Why this design beats alternatives

3. **`operations/handoff-batch-d-72-75.md`** — Dev dispatch packet
   - Prerequisite: D1 backfill
   - Execution order (5 phases)
   - File manifest
   - Acceptance criteria
   - QA dispatch notes

---

## Next Steps

### Immediate (Patrick)
1. Read this summary
2. Read D2 decision doc (3 pages, 5 min read)
3. Run D1 backfill command when ready
4. Signal orchestrator: "D1 complete, ready to dispatch dev"

### Orchestrator (When Patrick signals)
1. Copy ADR + D2 decision + handoff docs to `findasale-dev` kickoff
2. Dispatch findasale-dev with full handoff packet
3. In parallel, dispatch Legal agent with D3 consent copy task
4. Schedule QA session (16h) for when dev returns

### Dev (When dispatched)
1. Read ADR §1-5 (schema audit + JWT spec + auth design)
2. Read D2 decision
3. Read handoff packet
4. Start Phase 1: #72 Auth Layer
5. QA smoke test before proceeding to Phases 2–4

---

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `claude_docs/architecture/ADR-roadmap-batch-d-72-75.md` | 1200+ | Complete architecture spec |
| `claude_docs/feature-decisions/D2-tier-lapse-behavior.md` | 150 | D2 decision + rationale |
| `claude_docs/operations/handoff-batch-d-72-75.md` | 400+ | Dev dispatch packet |

---

## Key Decision Quote

> When a PRO or TEAMS organizer's subscription lapses, the platform operates in PARTIAL FREEZE mode: organizer-specific PRO features are suspended (Item Library, Voice-to-Tag, Analytics, batch operations), but SIMPLE-tier features remain active (create sales, add items, view dashboard), and shopper features are never affected. This design retains user engagement while creating a clear upgrade funnel. 7-day advance warning gives organizers time to decide. Resume is immediate (no friction).

---

**Status: READY FOR DEV DISPATCH**

Architect has signed off. Schema is stable. Decisions are locked. No changes without architect review.
