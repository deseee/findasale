# Session Log — Recent Activity

## Recent Sessions

### 2026-03-10 · Session 131
**Worked on:** Fixed print inventory 500 error (embedding Float[] excluded from getItemsBySaleId). Added per-sale insights filtering (backend saleId param + frontend dropdown). Verified both live in Chrome. Scoped AI branding audit — found 6 user-facing locations naming "Google Vision", "Claude Haiku", or "Anthropic" that should say "AI" generically.
**Decisions:** Google Maps links and OAuth buttons stay as-is (those are functional references, not branding). Only marketing/disclosure copy about the AI pipeline needs genericizing.
**Next up:** AI branding audit — replace overt "Google Vision + Claude Haiku" references with "AI" in faq.tsx, privacy.tsx, guide.tsx, and backend error messages/comments. Camera tab "coming soon" regression still pending.
**Blockers:** None.

### 2026-03-10 · Session 130
**Worked on:** Audit of session 129 (ended prematurely due to context compressions). Found stale 5%/7% fee copy in 3 customer-facing pages (terms.tsx, faq.tsx, guide.tsx) that session 129 missed. Fixed all — 6 total edits across 3 files. Replaced old 48KB add-items.tsx (no saleId) with redirect to dashboard. Pushed 2 MCP batches (926a2d7 + 726146f). Verified Vercel deploy live via Chrome — FAQ and Terms confirmed correct.
**Decisions:** Old add-items.tsx replaced with redirect (not deleted) to handle stale links gracefully. Backend tierService perks text is correct on GitHub — Railway deploy lag is the only remaining gap.
**Next up:** Confirm Railway redeploy picks up tierService 10% flat perks. Camera tab "coming soon" regression on add-items/[saleId].tsx still needs investigation. BUG-3 (/organizer/items 404) still deferred.
**Blockers:** Railway backend stale — dashboard tier perks still show 5%/7% until Railway redeploys.

### 2026-03-10 · Session 129
**Worked on:** Dashboard/UX polish. Fixed chain of 3 consecutive Vercel/Railway build errors (CSVImportModal prop mismatch, quantity field not in schema, sales/[id].tsx truncated to 100 lines by MCP). Removed Analytics tab (duplicate of Insights). Cleaned up Tier Rewards card. Fixed Print Inventory endpoint. Discovered add-items page version conflict — old single-form vs new tabbed Rapid Capture version.
**Decisions:** "better rates" copy removed from tier cards for beta. Analytics tab killed — Insights page is canonical. Print Inventory always uses `/sales/mine`.
**Next up:** Audit session 129 changes live in Chrome. Investigate add-items page discrepancy — why does `/organizer/add-items` (no saleId) show old single-form? Camera tab "coming soon" needs investigation. BUG-3 (/organizer/items) still deferred.
**Blockers:** Add-items page version conflict unresolved. Camera "coming soon" bug source unknown.

### 2026-03-10 · Session 128
**Worked on:** Chrome QA audit of session 127/128 changes. Fixed FINDING-3 (stale 5%/7% fee copy in settings.tsx → 10%). Found and fixed CSV import 500 bug (`embedding: []` missing from `importItemsFromCSV` createMany call). Resolved settings.tsx build error caused by push_files hallucination.
**Decisions:** Any new `item.create/createMany()` path must supply `embedding: []` explicitly — the column default was dropped in the coupon migration and Ollama backfills async via `scheduleItemEmbedding()`. Use `create_or_update_file` (not `push_files`) when pushing files with existing content — push_files risks hallucinating content from memory.
**Next up:** Verify CSV import success after Railway redeploys commit a670457. Then: Patrick's 5 beta-blocking items (Stripe business account, Google Search Console, business cards, beta outreach). Schema drift check: `tags String[]` field may need migration.
**Blockers:** CSV import fix unverified in prod (Railway redeploy pending). Chrome disconnected before re-test.

### 2026-03-10 · Session 127
**Worked on:** Chrome QA of add-items photo upload flow. Fixed Bug 1 (no photo input on Manual Entry) and Bug 2 (camera analyze discarded API response — nothing happened after toast). Auto-create (⚡) checkbox added above Start Camera. Multiple merge conflicts resolved after dev agents did full-file rewrites across several commits.
**Decisions:** Manual Entry photo = standard upload only (no AI — AI is a paid feature). Camera = AI pre-fill form; auto-create checkbox skips review and saves immediately.
**Next up:** Continue Chrome audit — 4 queued findings: (1) camera fullscreen/flash controls on mobile, (2) batch photo workflow distinction (one item vs many items), (3) item cards in list should be clickable/inline-editable, (4) test CSV import end-to-end. Also: FINDING-3 (stale fee copy on dashboard) still open.
**Blockers:** None — all commits pushed (afc280a is HEAD on main).

### 2026-03-10 · Session 126
**Worked on:** Docs correction (STATE.md, session-log). Verified session 125 fixes live in Chrome (all 3 pass ✅). Continued Chrome audit — organizer item list + bulk actions on add-items/[saleId] page.
**Decisions:** Session 125 fixes confirmed complete. Three new findings logged (filter/sort gap, native confirm on delete, stale fee copy on dashboard).
**Next up:** Fix FINDING-3 (stale fee copy), consider FINDING-1/2 for post-beta backlog. Continue Chrome audit — CSV export/import, batch upload (AI) tab, deferred friction items #7 and #13.
**Blockers:** None.

---
