# Friction Audit — 2026-05-18

**Automated run: daily-friction-audit (3:38 AM)**
**Auditor:** findasale-friction-audit skill

---

## Summary

Overall health is **Yellow-Green**. S755 is active today — Patrick has already pushed 5 commits including 6 bug fixes (Hunt Pass cosmetics, Share&Earn expiry, ENDED sale counts, Social Posts modal, Store Hours persistence, plus a new geocoding backfill feature). The S752/S753 bug backlog is being cleared. No new critical blockers detected. Three carry-over items from the 2026-05-17 health report remain unresolved and are dispatched below.

---

## Active Session Note

Patrick committed to `main` today at 11:33 and 12:23 UTC (S755 in progress). STATE.md reflects S754 — it will be stale until S755 wraps. This is expected and not a friction flag.

---

## P1 — Carry-over from 2026-05-17 Health Report (H-001)

### RESOLVED — category-sync/trigger already has requireSecret

**Verified in code:** `router.post('/category-sync/trigger', requireSecret, ...)` at line 855. The 2026-05-17 health report finding was stale. No action needed.

**New geocoding routes (added S755 today) — VERIFIED PROTECTED:** `GET /geocode-ungeocoded-sales/batch` and `POST /geocode-ungeocoded-sales/bulk` have no `requireSecret` middleware on the route declaration, but `internalGeocodingController.ts` handles auth inline via `x-scraper-key: INTERNAL_SCRAPER_KEY` — the same pattern used by `/scraper/ingest`. The GitHub Actions workflow correctly sends this header. These routes are protected. No action needed.

---

## P2 — Carry-over Items

### H-002 — RESOLVED — voice price guard already applied

**Verified in code:** `add-items/[saleId].tsx:1402` already reads `price: estimatedPrice && !prev.price ? estimatedPrice.toString() : prev.price`. The `&& !prev.price` guard is present. Stale finding. No action needed.

### M-002 — RESOLVED — triggerOutreachTestEmail.ts deleted

**Verified:** File does not exist in the codebase. The hardcoded credential finding is moot. No action needed.

### fix-attendance.sql still in project root

**File:** `C:\Users\desee\ClaudeProjects\FindaSale\fix-attendance.sql`

Confirmed present (Glob verified). Contains production sale IDs. Flagged for deletion in S750 — 3 sessions ago. Patrick action required (CLAUDE.md: "Always ask before deleting files").

---

## P3 — Informational

### Email verification token migration still pending (20260515180000)

Outstanding Patrick manual action since S726. Migration adds `emailVerificationTokenExpiry DateTime?` to User. Command block is in STATE.md "Next Session" section. Not a blocker but has been pending ~3 days.

### Roadmap rows for S754 + S755 pipeline/bug fixes not yet recorded

Roadmap header still shows "Last Updated: 2026-05-16 (S740)." S754 shipped 8 pipeline fixes (outreach rate limit, digest suppression, storefront ENDED sales, directoryMostRecentSource, Foursquare category filter). S755 is fixing 6 bugs. These should get roadmap entries at session wrap.

---

## No New Findings

- No new credential leaks in code (yesterday's clean checks still hold)
- No new TypeScript errors from today's commits (geocoding commit has clean message)
- No merge conflicts or stale branches detected
- QA ceiling check: 7 active items in Blocked Queue pre-S755. S755 is fixing 5 of them. Will drop to ~2 after wrap. Ceiling (≥8) is not breached.

---

## Dispatch Outcome

**No code changes were made.** All three carry-over findings from the 2026-05-17 health report were verified as already resolved in the current codebase. The dev dispatch confirmed:

- H-001 (category-sync auth): already has `requireSecret` — stale finding
- H-002 (voice price override): `&& !prev.price` guard already present — stale finding
- M-002 (hardcoded credential): source file deleted — moot
- New geocoding routes: protected via controller-level `x-scraper-key` inline auth — correct pattern, no change needed

**Patrick reminders (no dev action needed):**
- Delete `fix-attendance.sql` from project root when convenient (contains production sale IDs)
- Deploy email verification migration `20260515180000` — command is in STATE.md Next Session section
