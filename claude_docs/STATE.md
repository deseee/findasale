# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 165 COMPLETE (2026-03-15) — #36 WEEKLY TREASURE DIGEST: SHIPPED:**
- **Activated existing weeklyEmailJob cron** (Sundays 6pm) — built but never wired. Personalized picks based on purchase/favorite history. 8 items per user, category-matched from upcoming PUBLISHED sales within 14 days.
- **Email delivery:** Resend integration active. Dynamic subject ("8 Estate Sale Finds This Week (New Arrivals)"), category badges (warm yellow), larger fonts for older audience (15px body, 18px prices), relative date labels ("Tomorrow", "In 2 days"), preference management footer (Manage frequency / Update interests / Unsubscribe).
- **MailerLite integration:** New Shoppers group created (ID: 182012431062533831). New shoppers auto-enrolled on registration via `addShopperSubscriber()` in authController.ts (both email + OAuth paths). Fire-and-forget, non-blocking.
- **Files changed:** `packages/backend/src/index.ts`, `packages/backend/src/controllers/authController.ts`, `packages/backend/src/services/mailerliteService.ts`, `packages/backend/src/services/weeklyEmailService.ts`, `CLAUDE.md` (§6 no-pause checkpoint rule).
- **MCP pushes:** 2 total (18e7178 + fc2cdd2). All changes on GitHub main.
- **Last Updated:** 2026-03-15 (session 165)
- **Env vars required on Railway:** `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`, verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` exist.

---

**Session 164 COMPLETE (2026-03-14) — #24 HOLDS-ONLY ITEM VIEW: FULL BUILD + SHIP:**
- **Full Architect→Dev→QA pipeline completed** for #24 Holds-Only Item View.
- **Schema:** Added `holdDurationHours Int @default(48)` to Sale model. Migration `20260315000000_add_hold_duration_to_sale` applied to Neon (migration 78).
- **Backend:** Upgraded `reservationController.ts` — dynamic hold duration from sale config (was hardcoded 24h), sale filter + sort params on organizer holds endpoint, new `getOrganizerHoldCount` lightweight count endpoint, new `batchUpdateHolds` (release/extend/markSold) with 50-item cap + ownership validation.
- **Frontend:** Full rewrite of `holds.tsx` — sale filter dropdown, sort toggle (Expiring Soon / Recently Added), grouped-by-buyer accordion, batch action bar (Release/Extend/Mark Sold) with checkbox selection, item photos + prices + HoldTimer countdown. Dashboard badge wired via `/reservations/organizer/count`.
- **QA passed:** Batch size limit added (50 max), `as any` casts acceptable, pre-existing ownership gap in updateHold noted (not introduced by #24).
- **3 MCP pushes completed:** Push 1 (759eec1b) migration+routes+controller, Push 2 (91252745) holds.tsx+dashboard.tsx, Push 3 (44782d4c) schema.prisma.
- **Files changed:** `packages/frontend/next.config.js`, `packages/frontend/components/ItemOGMeta.tsx`, `packages/frontend/pages/_document.tsx`, `packages/frontend/pages/items/[id].tsx`
- **All changes on GitHub main** (commits 4d06379, 64058eb, 698b4ed, 4d50c15). Vercel auto-deployed.
- **Last Updated:** 2026-03-14 (session 163)

---

**Session 162 COMPLETE (2026-03-14) — COMPREHENSIVE REVIEW & PUBLISH PAGE REBUILD:**
- **Comprehensive inline edit panel implemented:** Upgraded from 3-field panel (title/price/category) to full feature parity with edit-item page. New fields: ItemPhotoManager (photo upload/reorder/delete), description, condition, quantity, PriceSuggestion AI widget, per-item Publish/Unpublish toggle, Full Edit Page link.
- **draftStatus badge added:** Each item card now displays draftStatus badge (Published/Pending/Draft) on the collapsed row for visibility into item readiness.
- **Item interface updated:** Added description, condition, quantity fields to Item type and ItemEditState.
- **Backend updated:** `packages/backend/src/controllers/itemController.ts` getDraftItemsBySaleId and getItemDraftStatus now include isAiTagged and aiConfidence in select clauses (from prior session).
- **All state handlers connected:** setSelectedItems, setExpandedItemId, handleEditChange, handleSaveItem, handleBulkPrice, handleBulkCategory, handlePublishItem all wired to JSX.
- **Merge conflict resolved:** origin/main had old 3-field panel; HEAD had comprehensive panel — kept HEAD (final version).
- **CORE.md governance fix:** Added §3 rule: re-read §4 Push Rules immediately after any compression event (closes conversation-defaults gap where push instructions were in §4 but not reloaded after compression).
- **Files changed:** `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx`, `packages/backend/src/controllers/itemController.ts`, `claude_docs/CORE.md`
- **All changes on GitHub main.** Vercel auto-deploying.
- **Last Updated:** 2026-03-14 (session 162)

---

**Session 162b (continuation) — CHROME AUDIT + P1 BUG FIXES:**
- **Chrome audit of Review & Publish page:** All 7 checks passed. Page loads without errors, 16 items shown, "Review & Publish →" link visible, "Publish All" correctly absent, "Back to Capture" link works, Visible/Hidden labels correct, Near-Miss Nudge (#61) working.
- **Bug 1 fixed (P1):** `\u00B7` separator in item cards rendered as literal text (JSX text node Unicode escape not processed). Fixed: changed to `{' · '}` in review.tsx line 415.
- **Bug 2 fixed (P1):** Manual Entry items showed "Low (50%)" confidence label instead of "Manual". Root cause: `aiConfidence Float @default(0.5)` in schema. Fixed via `isAiTagged` field — updated `confidenceLabel()` and `confidenceBorderClass()` to check `isAiTagged` first; added field to Item interface + backend select clause.
- **Bug 3 fixed (P1):** Item cards were completely non-interactive — all state/handlers (`expandedItemId`, `editStates`, `selectedItems`, `bulkPrice`, `handleSaveItem`, etc.) were defined but not wired to JSX. Fixed: checkboxes, click-to-expand edit panel (title/price/category/Save), bulk toolbar, Buyer Preview button all wired and verified live.
- **Schema tech debt noted:** `aiConfidence Float @default(0.5)` should be changed to `Float?` with a data migration post-beta to clean up existing manual items. Not urgent — `isAiTagged` check masks it in the UI.
- **Files changed:** `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx`, `packages/backend/src/controllers/itemController.ts`
- **All changes on GitHub main.** Vercel auto-deploying. All fixes verified live.
- **Last Updated:** 2026-03-14 (session 162)

**Session 161 COMPLETE (2026-03-14) — REVIEW PAGE FIXES + ADD-ITEMS UX IMPROVEMENTS:**
- **3 wiped files restored:** `ActivityFeed.tsx`, `HypeMeter.tsx`, `sales/[id].tsx` — all wiped by empty MCP push in prior session (commit `ad542263`). Restored via MCP push (commit `52041ee`).
- **Review & Publish page data source fix:** Page was fetching from `/items/drafts` (DRAFT+PENDING_REVIEW only), but all 16 items were created via Manual Entry (draftStatus='PUBLISHED'). Switched to `/items?saleId=` endpoint so all items appear regardless of creation method.
- **Review page null-safety crash fix:** After data source switch, page crashed on `.toFixed(2)` and `Math.round(null * 100)` for Manual Entry items with null price/category/aiConfidence. Added nullable types to Item interface, null guards to confidence functions, null-coalesce in edit state (`?? 0` for price, `?? ''` for category). Commits `62a0b55`, `7ce115c`.
- **Add Items page — Review & Publish link:** Added persistent "Review & Publish →" link in items table header (was previously only a conditional button for Rapidfire items).
- **Add Items page — Visible/Hidden labels:** Renamed "Active"/"Hidden" to "Visible"/"Hidden" with clearer tooltips ("Click to hide from buyers" / "Click to make visible to buyers"). Customer Champion analysis confirmed both `isActive` (visibility toggle) and `draftStatus` (content readiness) serve distinct purposes.
- **Files changed:** `packages/frontend/pages/organizer/add-items/[saleId].tsx`, `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx`
- **All changes on GitHub main.** Vercel auto-deploying.
- **Next session:** Chrome audit of Review & Publish page (see next-session-prompt.md).
- **Last Updated:** 2026-03-14 (session 161)

**Session 160 COMPLETE (2026-03-14) — FOUR FEATURES SHIPPED + RAILWAY BACKEND RESTART INVESTIGATION:**
- **#61 Near-Miss Nudges** — `NearMissNudge.tsx` component wired into organizer review page. Shows nudge when items are 60–99% complete (photo + price present). No schema change. ✅ SHIPPED
- **#34 Hype Meter** — Viewer tracking in `viewerController.ts` + `viewers.ts` (60s expiry, in-memory), `HypeMeter.tsx` wired into sale detail page (shows "👀 N people looking" when 2+ viewers). ✅ SHIPPED
- **#35 Front Door Locator** — Entrance pin picker (`EntrancePinPicker.tsx`, `EntranceMarker.tsx`, `SaleMap.tsx` wiring). Schema migration `20260314193440_add_entrance_pin` applied locally (entranceLat, entranceLng, entranceNote on Sale). Wired into shopper view + organizer edit-sale. **⚠️ Neon migration pending.**
- **#33 Share Card Factory** — OG/Twitter Card generation. `ogImage.ts` Cloudinary utility, `SaleOGMeta.tsx`, `ItemOGMeta.tsx` wired into items page. `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=db8yhzjdq` added to frontend/.env.local. **⚠️ Needs Vercel env var + potential backend URL config.**
- **⚠️ OPEN ISSUE:** Backend on Railway restarting randomly. Main page intermittently shows "Error Loading Sales". Deploy logs show no build errors. May be route conflict (viewersRouter vs saleRoutes) or cold starts. Under investigation.
- **Last Updated:** 2026-03-14 (session 160 — 4 features shipped, Railway restarts flagged)
