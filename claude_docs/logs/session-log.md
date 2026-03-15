# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

**Entry template (all fields required):**
- **Worked on:** (what was done)
- **Decisions:** (choices made)
- **Token efficiency:** (tasks completed ÷ estimated effort — e.g., "10 doc edits, no subagents, low token burn" or "3 features, 2 subagent calls, medium burn" — qualitative until measurement tooling exists)
- **Token burn:** (~Xk tokens used, Y checkpoints logged — see CORE.md §3 for format)
- **Next up:** (what comes next)
- **Blockers:** (what's stuck)

---

## Recent Sessions

## Session 165 — 2026-03-15 — #36 Weekly Treasure Digest Shipped

**Worked on:** Activated existing but unwired weekly email system (weeklyEmailJob cron, Sundays 6pm). Integrated Resend for personalized shopper digest delivery. Added MailerLite Shoppers group auto-enrollment on user registration (both email + OAuth signup paths). Email UX: dynamic subject lines, category badges, relative date formatting for older audience (15px body, 18px prices). MailerLite group sync is fire-and-forget non-blocking to avoid registration delays.

**Decisions:** Personalization based on purchase + favorite history (8 items per user, category-matched from upcoming PUBLISHED sales within 14 days). Email preference management footer (Manage frequency / Update interests / Unsubscribe) gives shoppers control. MailerLite Shoppers group (ID: 182012431062533831) acts as broadcast list for future campaigns.

**Token efficiency:** Inline feature activation + email template improvements. No subagent dispatches for code work. findasale-records for documentation wrap only. Low-medium burn.

**Token burn:** ~45k tokens (est.), 0 checkpoints.

**Next up:** #27 Listing Factory begins next session. Conversation-defaults skill updated with Rule 23 (No-Pause Checkpoint override) and installed by Patrick — packaged as .skill file, now available to fleet.

**Blockers:** None. Patrick needs to set `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` + verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` exist on Railway.

**Files changed:** `packages/backend/src/index.ts`, `packages/backend/src/controllers/authController.ts`, `packages/backend/src/services/mailerliteService.ts`, `packages/backend/src/services/weeklyEmailService.ts` | Compressions: 0 | Subagents: 0 | Push method: MCP (2 commits: 18e7178 + fc2cdd2) | Skill updates: conversation-defaults (Rule 23 added, packaged .skill)

---

## Session 162 — 2026-03-14 — Comprehensive Review & Publish Page Rebuild + Chrome Audit + P1 Bug Fixes

**Worked on:** (1) Comprehensive inline edit panel rebuild — replaced static 3-field panel (title/price/category) with full feature parity to edit-item page. New fields: ItemPhotoManager (photo upload/reorder/delete), description, condition, quantity, PriceSuggestion AI widget, per-item Publish/Unpublish toggle, Full Edit Page link. (2) draftStatus badge added to each item card collapsed row (Published/Pending/Draft). (3) Item interface and ItemEditState updated to include description, condition, quantity. (4) handleSaveItem and handlePublishItem wired to persist all new fields. (5) Chrome audit of Review & Publish page — all 7 checks passed. (6) Two P1 bugs diagnosed and fixed live: Bug 1 — unicode separator `\u00B7` rendering as literal text (JSX text node issue) fixed with `{' · '}`. Bug 2 — Manual Entry items showing "Low (50%)" instead of "Manual" (root cause: schema `aiConfidence Float @default(0.5)`); fixed using `isAiTagged` field check in confidenceLabel/confidenceBorderClass. (7) CORE.md governance fix — added §3 rule: re-read §4 Push Rules immediately after compression (closes conversation-defaults gap). (8) Merge conflict in review.tsx resolved (kept HEAD/comprehensive version).

**Decisions:** Full panel parity makes Review & Publish page self-sufficient for all item edits (no Full Edit Page click necessary for most changes). draftStatus badge provides immediate visibility into item readiness. Schema cleanup (change `aiConfidence` to nullable `Float?`) deferred post-beta. Manual items don't show confidence percentages — only AI-tagged items do.

**Token efficiency:** Comprehensive rebuild inline, one merge conflict resolution. No subagent dispatches. Low-medium burn.

**Token burn:** ~65k tokens (est.), 0 checkpoints.

**Next up:** Fix Railway backend restarts (session 160 carry-forward). Validate 4 features (#61, #34, #35, #33) end-to-end on production. Resume roadmap P1: #24 Holds.

**Blockers:** Railway unstable (blocks feature validation). P2 thumbnail issue (Cloudinary URLs break on page reload).

**Files changed:** packages/frontend/pages/organizer/add-items/[saleId]/review.tsx, packages/backend/src/controllers/itemController.ts, claude_docs/CORE.md | Compressions: 1 | Subagents: 0 | Push method: manual (merge conflict)

---

## Session 162b — 2026-03-14 — Chrome Audit + P1 Bug Fixes

**Worked on:** Chrome audit of Review & Publish page (7 checks). All checks passed: link visible, page loads without errors, 16 items shown, Publish All correctly absent, Back to Capture link works, Visible/Hidden labels correct, Near-Miss Nudge (#61) working. Two P1 bugs diagnosed and fixed live. Bug 1: unicode separator `\u00B7` rendering as literal text (JSX text node issue) — fixed with `{' · '}` character in review.tsx line 415. Bug 2: Manual Entry items showing "Low (50%)" instead of "Manual" — root cause discovered: Prisma schema has `aiConfidence Float @default(0.5)`, every manual item gets 0.5. Fixed using existing `isAiTagged` boolean field — updated `confidenceLabel()` and `confidenceBorderClass()` to check `isAiTagged` first, only show percentage for AI-tagged items. Added `isAiTagged: boolean` to Item interface and backend select clauses. Bug 3 open (P2): thumbnail images break on page reload — Cloudinary URLs load on first visit but fail on subsequent navigation, root cause unknown.

**Decisions:** Use `isAiTagged` field to distinguish manual vs AI items on frontend. Schema cleanup (change `aiConfidence` to nullable `Float?`) deferred post-beta. Manual items don't need percentage confidence displayed — only AI-tagged items show the confidence percentage.

**Token efficiency:** Inline fixes, no subagent dispatches. Two focused edits (frontend + backend), verified live in Chrome. Low burn.

**Token burn:** ~50k tokens (est.), 0 checkpoints.

**Next up:** Fix Railway backend restarts (session 160 carry-forward). Then validate 4 features (#61, #34, #35, #33) end-to-end on production. Resume roadmap P1: #24 Holds.

**Blockers:** Railway unstable (blocks session 160 feature validation). P2 thumbnail issue needs investigation.

---

## Session 158 — 2026-03-13 — Repo Root Cleanup + Token Statusline Research

**Worked on:** (1) Token statusline investigation — confirmed Cowork desktop UI does not pass `context_window` JSON to statusline scripts; bar stays at `Tokens: waiting...` indefinitely. Statusline script stored in `scripts/statusline-token-usage.sh`, CLAUDE.md §4 updated with session-init reinstall block to handle VM ephemerality. Token estimates calibrated from 19 sessions: avg ~13.6k/agent (prior 5k default was 2.6× too low), updated in conversation-defaults Rule 17, packaged as installable .skill. (2) Records audit of repo root — 5 unauthorized orphaned files identified and removed: `AGENT_QUICK_REFERENCE.md`, `CAMERA_WORKFLOW_V2_IMPLEMENTATION_STATUS.md`, `STRIPE_WEBHOOK_HARDENING.md`, `fleet-redesign-proposal-v1.md`, `docs/CD2_PHASE2_TREASURE_HUNT.md`. All archived with index entries. `docs/` directory and `skill-updates/` directory removed.
**Decisions:** Token statusline is a dead end for Cowork (no JSON feed). Per-agent token estimates locked: simple 5–8k, mid-weight 10–15k, heavy 15–25k, unknown 13k average. Repo root should contain only project infrastructure files (CLAUDE.md, README.md, package.json, push.ps1, railway.toml, pnpm files, scripts/, claude_docs/, packages/).
**Token efficiency:** Two subagent dispatches (findasale-records). Inline research for statusline. Low-medium burn.
**Token burn:** ~40k tokens (est.), 0 checkpoints.
**Next up:** Resume feature work — next priority per roadmap is #24 (Holds, 1 sprint). See roadmap.md for Phase 4 queue.
**Blockers:** Vercel GitHub App integration still needs reconnect (flagged session 149). Migration `20260311000003_add_camera_workflow_v2_fields` deploy status still unclear.

---

## Session 152 — 2026-03-12 — POS v2 Post-Go-Live Fixes

**Worked on:** Four targeted fixes to the Stripe Terminal POS after go-live testing revealed issues: (1) **Duplicate itemId guard** — both `createTerminalPaymentIntent` and `cashPayment` now reject duplicate itemIds (each physical item can only be charged once per transaction). (2) **Error messages humanized** — `terminalController.ts` was surfacing raw DB UUIDs in error strings. Fixed to use `item.title` in both payment flows; required adding `title: true` to the cashPayment `dbItems` select since it previously only fetched `id` and `status`. (3) **POS item search fixed** — `getItemsBySaleId` was ignoring all query params except `saleId`. The frontend was already sending the correct `?q=...&status=AVAILABLE&limit=10` — the backend simply discarded them. Fixed with Prisma `contains` + `insensitive` for title/SKU search, status filter, limit cap, and added `sku: true` to select. (4) **Inline cash numpad** — replaced the cash received button (which opened the shared global numpad at top of page) with an always-visible inline 3×4 numpad inside the cash payment card. Independent `cashNumpadValue` state syncs to `cashReceived` via useEffect. Real-time change/short display. Global numpad simplified to price-only.
**Decisions:** Cash numpad is fully independent from the price numpad — separate state, no mode switching needed. Search bug was entirely backend-side; no frontend changes required. Error humanization required touching both card and cash flows separately since each had its own dbItems select shape.
**Token efficiency:** All inline work — no subagent dispatches for code. Session wrap via findasale-records. Low burn.
**Token burn:** ~35k tokens (est.), 0 checkpoints.
**Next up:** Cash collection mechanism decision — how does FindA.Sale collect 10% platform fee on cash sales? Card sales auto-collected via Stripe Connect; cash sales have no fee collection path today. Needs findasale-investor + advisory board analysis before implementing.
**Blockers:** Business decision on cash fee collection outstanding. Neon migration `20260312000002_add_purchase_pos_fields` still pending deploy.
