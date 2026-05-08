# Friction Audit — 2026-04-21
**Run by:** daily-friction-audit (automated, S529)
**Scope:** Doc freshness, codebase TODOs, reference 404s, skill health

---

## Summary

One actionable doc-staleness finding. All CLAUDE.md references intact. STATE.md current. No blocking TODOs.

---

## ✅ Passing Checks

- **STATE.md:** Current — last updated S528 (2026-04-20). "Current Work", "Recent Sessions", "Next Session" sections all present and fresh.
- **CLAUDE.md reference files:** All 16 referenced docs exist. Zero 404s.
- **Roadmap:** Current — v114, last updated 2026-04-20.
- **QA Backlog:** Current — last updated S525 (2026-04-20). Large queue (12 items in Blocked/Unverified) but tracked and known.
- **decisions-log.md:** Entries current through 2026-04-11. No 30-day+ gaps.
- **STACK.md architecture:** Matches current monorepo structure (frontend/backend/database/shared).
- **DECISIONS.md (brand):** Present at `claude_docs/brand/DECISIONS.md`.

---

## ⚠️ Findings

### P2 — STACK.md Fee Structure Stale (Doc Staleness)

**File:** `claude_docs/STACK.md` — Fee Structure section  
**Issue:** STACK.md states `Rate: 10% flat — all item types`. But STATE.md confirmed in S528 that PRO=8% and TEAMS=8% (per `commissionRate` field on each organizer). The "10% flat" description no longer accurately reflects the tiered fee reality.  
**Why this matters:** S528 session notes explicitly identify Claude treating STACK.md as product authority for fee decisions as the root cause of repeated wrong fee choices across S527-S528. STACK.md being stale on this point increases the risk of a future agent reverting the fee structure or introducing 10% in new code paths.  
**Suggested fix:** Update STACK.md Fee Structure section to document:
- Default rate: 10% (SIMPLE + ALA CARTE)
- PRO/TEAMS discount rate: 8% (stored as `commissionRate` on Organizer record)
- Source of truth: `Organizer.commissionRate` field (not FeeStructure table for tiered rates)

**Dispatch:** findasale-records — doc update only, no code change

---

### P3 — TODOs in Code Without Owners (Background Debt)

**Files with contextual TODOs (not blocking):**
- `pages/api/share-card.tsx` — XP fetch endpoint placeholder
- `pages/encyclopedia/[slug].tsx` — vote recording endpoint placeholder
- `pages/shopper/dashboard.tsx` — collection API stub (`hasSavedItems = false`)
- `bountyController.ts` — distance sorting, Stripe integration, Order record creation (Phase 2 items)
- `xpService.ts` — ANNIVERSARY_30DAY trigger (separate feature)
- `fraudService.ts` — suspendedAt field (pending schema addition, #73-phase3)

These are all known deferred items, properly commented. No urgency. No blocking deploys. Noted for completeness.

---

## No Blocking Findings

No merge conflicts detected in scope. No missing critical files. No skills-directory issues visible. No TypeScript check run this audit (reserved for dev sessions — audit scope is docs and structure only).

---

## Dispatch Block

**AUTO-DISPATCH from daily-friction-audit**

Target: `findasale-records`  
Category: doc-staleness  
Severity: P2  
Context files: `claude_docs/STACK.md` (Fee Structure section), `claude_docs/STATE.md` (Platform fees locked entry)  
Task: Update STACK.md Fee Structure section to accurately reflect the tiered commission rate structure. Current text says "10% flat" which is incorrect for PRO/TEAMS organizers who have 8% commissionRate. Document: default 10% (SIMPLE/ALA CARTE), tiered 8% (PRO/TEAMS), source of truth is `Organizer.commissionRate`. Do not change any other STACK.md content.
