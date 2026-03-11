# Session Log — Recent Activity

## Recent Sessions

### 2026-03-10 · Session 134
**Worked on:** Diagnosed and fixed `auctionJob` P2022 crash (`Item.tags` column missing from Neon). Created migration `20260310000002_add_item_tags`. Committed two other previously missing migrations (`add_token_version`, `add_processed_webhook_event`). Ran `prisma migrate deploy` — confirmed no pending. Audited all bare `include` Item endpoints — all safe. Logged `embedding[]` perf concern as post-beta deferred. Updated STATE.md + session docs.
**Decisions:** Migration approach was correct (column already on Neon per `migrate deploy` output). All `include` endpoints left as-is — no `select` patching needed.
**Next up:** Move hide/show/selected bar to top of item list. Create test CSV for import flow. Camera tab "coming soon" regression still unresolved.
**Blockers:** None.

### 2026-03-10 · Session 133
**Worked on:** Restored session 128 regressions (torch toggle, camera switch, photo upload, tab reorder, bulk delete on add-items/[saleId].tsx). Genericized AI vendor branding in faq.tsx + privacy.tsx. Diagnosed and fixed P0 crash on `GET /items/:id` — P2022 error because `Item.tags` column doesn't exist in production DB (migration never created); `getItemById` used Prisma `include` which queries all schema fields including the missing `tags` column. Switched to explicit `select` excluding `tags` and `embedding`. Verified edit-item page loads correctly in Chrome (Tiffany Glass Lamp #4 populated).
**Decisions:** Use `select` (never bare `include`) on Item queries in production until `Item.tags` migration is deployed. Pattern matches existing `getItemsBySaleId` approach.
**Next up:** (1) Create migration for `Item.tags TEXT[] DEFAULT '{}'` to fix the schema drift permanently. (2) Audit remaining `include`-based Item endpoints (`updateItem`, `deleteItem`, `analyzeItemTags`, `bulkUpdateItems`, `exportItems`, `placeBid`) — all will hit P2022 if queried. (3) Patrick's beta-blocking items (Stripe account, GSC, business cards, outreach).
**Blockers:** Patrick needs to run `git stash && git pull && git stash drop` locally — 5+ MCP commits since last sync.

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

---
