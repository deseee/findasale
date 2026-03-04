# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

---

## Recent Sessions

### 2026-03-04 (session 47 — Railway + Neon Infrastructure Migration)
**Worked on:** Migrated backend from local Docker + ngrok to Railway. Fixed 6 TypeScript compilation errors exposed by `tsc --strict` (Prisma compound key naming `saleId_userId`, nullable `userId` on SaleSubscriber, `never` type from always-true `typeof` checks on Prisma Float fields, missing `prisma` import in index.ts SIGINT handler). Fixed Dockerfile binary resolution (`pnpm exec` → `pnpm run` for prisma generate/migrate). Fixed `uuid@13` ESM-only crash by replacing with Node 18 built-in `crypto.randomUUID()`. Railway container now healthy. Ran `prisma migrate deploy` against Neon — all 15 migrations already applied. Set `NEXT_PUBLIC_API_URL` in Vercel to Railway domain.
**Decisions:** `crypto.randomUUID()` preferred over pinning uuid@9 — eliminates the dependency entirely. `pnpm run` (npm scripts) preferred over `pnpm exec` in Docker for binary resolution reliability.
**Next up:** Vercel redeploy (rate-limited, pending a few hours). Verify frontend talks to Railway backend end-to-end. Then Sprint E (Phase 26 — listing card redesign).
**Blockers:** Vercel redeploy rate limit — frontend still points at old backend URL until deploy completes.

### 2026-03-05 (session 42 — Sprint A: Phase 12 Auction Completion)
**Worked on:** Completed Sprint A. Audited all Phase 12 remaining work against code reality. Discovered frontend auction toggles and schema fields were already complete from session 36. Two actual gaps fixed: (1) `stripeController.ts` was using sale-level `isAuctionSale` flag for both price derivation and 7% fee — replaced with item-level `const isAuctionItem = !!item.auctionStartPrice` so the 7% fee applies to any item with `auctionStartPrice` set regardless of sale type; (2) `itemController.ts` `createItem` and `updateItem` were silently dropping `category` and `condition` from req.body — both now extract and persist those fields. Both files pushed to GitHub (2 commits, bf3ac03).
**Decisions:** Item-level auction detection preferred over sale-level — enables mixed sales (some auction items, some fixed-price in same sale). Category/condition bug fix treated as part of Sprint A since it affected the same item creation flow.
**Next up:** Sprint B — Phase 24+25 design system foundation + bottom tab navigation. Load ROADMAP.md Phase 24/25 section before starting.
**Blockers:** None. Both fixes are backend-only, picked up by nodemon automatically — no Docker rebuild needed.

### 2026-03-04 (session 41 — 7-Test Workflow Stress Test)
**Worked on:** Ran all 7 stress tests from next-session-prompt.md to validate guardrails added in sessions 39–40. Tests covered: diff-only gate (CORE §4), session init protocol (CORE §2), MCP push batching (CORE §10), authority hierarchy conflict (CORE §7), Docker command safety (dev-environment skill), dead code detection (context.md accuracy), stale fact detection (polling vs Socket.io). All 7 passed. context.md regenerated locally — stale `contexts/` directory entry now removed.
**Decisions:** Sonnet is sufficient for Sprint A (Phase 12 auction completion — mechanical, 3-4 file edits). Opus recommended for Sprint B (Phase 24+25 design system — cross-cutting visual overhaul). Sprint A goes next via Sonnet.
**Next up:** Sprint A — Phase 12 auction completion: organizer auction toggle + Stripe 7% webhook.
**Blockers:** None. Guardrails verified. context.md fresh.

### 2026-03-04 (session 40 — Deep Workflow Audit + Tool Tree + Doc Fixes)
**Worked on:** Deep audit of MCP connectors, doc system logic, power user workflow tips, and tool bugs. Found and fixed 9 issues: CORE.md Section 2 missing MCP check steps (HIGH), CORE.md Section 7 missing Skills in authority hierarchy (MEDIUM), duplicate ToastContext files (HIGH — `contexts/` is dead code, `components/` is canonical), RECOVERY.md stale Socket.io entry replaced with polling note, SECURITY.md timestamp updated post-rebrand, STATE.md stale "In Progress" cleared + backend hosting wording clarified, self_healing_skills.md structural ordering fixed (Skills 17–19 were out of order), context.md GitHub false negative fixed (CLI vs MCP distinction), update-context.js updated with Tool & Skill Tree section. Also completed session 39 context wrap (session-log trim, next-session-prompt, .last-wrap, context.md regen). Research on MCP push_files token limits led to CORE.md Section 10 upgrade (create_or_update_file preference, MAX_MCP_OUTPUT_TOKENS). Diff-only violation root cause diagnosed; added conversation-defaults Rule 3, Self-Healing Skill 19, strengthened CORE.md Section 4.
**Decisions:** conversation-defaults Rule 3 (announce file mod approach) is the active enforcement checkpoint for diff-only rule. Skills now have explicit position in authority hierarchy (between CORE.md and Root CLAUDE.md). Dead code `contexts/ToastContext.tsx` flagged for deletion.
**Next up:** Delete `contexts/ToastContext.tsx` (dead code). Sprint A (Phase 12 auction) + Sprint B (Phase 24+25 design system). Push all doc changes to GitHub.
**Blockers:** `contexts/ToastContext.tsx` deletion needs Patrick confirmation per SECURITY.md rules.

### 2026-03-04 (session 39 — ROADMAP Deep Rewrite + Context Alignment)
**Worked on:** Full ROADMAP.md rewrite (v2) with deep research: competitor sentiment (estatesales.net 1.4★ Trustpilot, opaque fees, broken auctions; Facebook Marketplace flags "estate" as Fair Housing violation), UI/UX design system (warm palette, Montserrat/Inter typography, bottom tab nav, card redesign, onboarding flows), social layer (follow organizer, activity feeds, "Share Your Find" modal, dual-sided referral), growth channels (local partnerships, SEO arbitrage, Google Events, Google Play TWA), cross-industry mechanics (Pokemon GO, Fortnite battle pass, Supreme drops, TikTok Shop affiliates). OAuth promoted from deferred to Phase 31 (P1). Roadmap restructured into 5 pillars with phases 14–32. Context alignment audit: fixed stale facts in STACK.md, STATE.md, trimmed session-log.md.
**Decisions:** Full ROADMAP.md rewrites violated diff-only rule — will use targeted edits going forward. OAuth promoted because social login impacts organizer signup conversion directly.
**Next up:** Sprint A (Phase 12 auction completion) + Sprint B (Phase 24+25 design system) in parallel.
**Blockers:** None. Research-only session — no code changes.


