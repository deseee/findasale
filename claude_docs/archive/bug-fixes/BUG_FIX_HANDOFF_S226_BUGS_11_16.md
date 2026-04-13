# Bug Fix Handoff — BUG-11 through BUG-16 (Medium Severity QA Audit)
**Date:** 2026-03-22
**Dispatch to:** findasale-dev subagent
**Locked decisions:** Per project CLAUDE.md §7 (subagent-first code implementation)

---

## Bugs to Fix

### BUG-11: Sale detail over-fetches (8+ calls to same endpoint)
**Page:** `/sales/[id]`
**Symptom:** `GET /api/sales/[id]` called 8+ times on page load.
**Root cause:** Multiple components/hooks independently fetch same data.
**Fix:** Use react-query cache sharing (same query key) OR lift fetch to page + pass props.
**Target:** 1 fetch per page load.
**Acceptance:** Network tab shows 1 GET request only.

---

### BUG-12: Favorites N+1 (14 individual item calls)
**Page:** `/shopper/favorites`
**Symptom:** `GET /api/favorites/item/[id]` called 14 times (one per favorite).
**Root cause:** Loop fetches items individually.
**Fix approach:**
1. Check if backend batch endpoint exists: `GET /api/favorites` (returns all with items) or `GET /api/favorites/items?ids=...`
2. If not: add backend endpoint using Prisma `findMany({ include: { item: true } })`
3. Refactor frontend to use batch endpoint
**Target:** 1 fetch per page load.
**Acceptance:** Network tab shows 1 GET request; all items render from single batch.

**FLAG IF:** Backend batch endpoint doesn't exist — may require controller creation.

---

### BUG-13: Ripples 403 on shopper page load
**Page:** Sale detail (any role)
**Symptom:** `POST /api/sales/.../ripples` fires automatically, returns 403 for shoppers.
**Root cause:** No role check before firing ripples POST.
**Fix:** Add conditional: only fire if `session?.user?.role === 'ORGANIZER'` or `session?.user?.role === 'ADMIN'`.
**Target:** Ripples POST does not fire for shoppers; no 403 in console.

---

### BUG-14: Pricing page shows organizer features to shoppers
**Page:** `/pricing`
**Symptom:** Logged-in shopper sees "Your Plan" with organizer metrics (items/sale, photos, AI tags).
**Root cause:** No role differentiation on pricing page.
**Fix:** Check `session?.user?.role`. If `USER` (shopper), hide "Your Plan" or show "You have free access to browse all sales."
**Target:** Shopper sees appropriate messaging; organizer sees plan details.

---

### BUG-15: Billing pages hardcoded light theme (broken in dark mode)
**Pages:** `/organizer/premium`, `/organizer/upgrade` (and `/` homepage treasure hunt card if same pattern).
**Symptom:** Hardcoded light backgrounds (`bg-green-50`, `bg-white`) + light/dark text with no `dark:` overrides. Text invisible in dark mode.
**Root cause:** Missing Tailwind `dark:` variants.
**Fix:** Add dark mode overrides:
  - `bg-white` → `bg-white dark:bg-gray-800`
  - `bg-green-50` → `bg-green-50 dark:bg-green-900/20`
  - `text-black` or `text-gray-900` → add `dark:text-white` or `dark:text-gray-100`
  - Light borders → add dark border variants
**Target:** All text readable in dark mode; all cards visible.

---

### BUG-16: Item status dual badges (AVAILABLE + PENDING REVIEW on same item)
**Page:** `/organizer/add-items/[id]`
**Symptom:** Single item with `status: "AVAILABLE"` shows both "AVAILABLE" and "PENDING REVIEW" badges.
**Root cause:** "PENDING REVIEW" badge renders if `isAiTagged === false`, conflicting with actual status.
**Fix:** Item `status` is source of truth. `isAiTagged` must not create a conflicting status badge.
  - Option 1: Remove "PENDING REVIEW" badge entirely (if `isAiTagged` is just metadata).
  - Option 2: Show only if status is explicitly pending: `{status !== 'AVAILABLE' && !isAiTagged && <Badge>PENDING REVIEW</Badge>}`
  - Option 3: Show as non-badge indicator (label, not status badge).
  - **Recommend Option 1 or 3.**
**Target:** Item with `status: "AVAILABLE"` shows only "AVAILABLE" badge (no dual badges).

---

## Context Files (Read Before Starting)

- `packages/frontend/src/pages` — page structure, routing
- `packages/frontend/src/hooks` — react-query / useState patterns
- `packages/frontend/src/lib/api.ts` — API client config
- `packages/backend/src/controllers` — endpoint implementations
- `packages/database/prisma/schema.prisma` — data model reference
- `QA-AUDIT-SESSION-SUMMARY.md` — full audit results

---

## Pre-Flight Mandatory Checks (CLAUDE.md §8)

1. **Schema verify:** Read `schema.prisma`. Confirm all fields referenced exist.
2. **Hook shape verify:** Before destructuring hook returns, read hook file to confirm return shape.
3. **Controller type verify:** If referencing API response fields, read controller return type.
4. **Post-edit TypeScript check (mandatory):**
   ```bash
   cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
   ```
   Zero errors required before returning.

---

## Constraints

- **Diff-only output.** No full file rewrites unless needed.
- **No schema changes** unless unavoidable (flag if needed).
- **React-query cache sharing:** All hooks fetching same endpoint must use same query key.
- **Role checks:** Use `session?.user?.role` from next-auth. Authorized: `ORGANIZER`, `ADMIN`. Shopper: `USER`.
- **Dark mode:** Use Tailwind `dark:` prefix. No hardcoded light colors without dark override.
- **Status badge logic:** `status` field is source of truth. `isAiTagged` is separate metadata, must not create conflicting badges.

---

## Return Format

- List every file changed with absolute path.
- One diff per file (unified diff format).
- Flag any blockers (missing endpoints, schema changes needed, etc.).
- Confirm TypeScript checks passed.

