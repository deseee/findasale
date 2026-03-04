# Session Log - FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries - git history and STATE.md are the durable record.

---

## Recent Sessions

### 2026-03-04 (session 48 - Security fix, Phase 17 audit, Phase 31 schema)
**Worked on:** Fixed HIGH-severity health item: sanitized console.error calls in auth.ts that could leak reset tokens via Prisma error objects. Audited Phase 17 follow system - discovered notification delivery entirely missing (follow/unfollow endpoints exist, DB schema exists, but sale publish flow never queries Follow table or sends email/push to followers). Phase 31 OAuth schema prep: added oauthProvider, oauthId, made password optional in schema.prisma; created and applied migration 20260304000003_phase31_oauth_fields to Neon. Fixed Docker crash loop caused by DIRECT_URL missing from docker-compose.yml backend environment.
**Decisions:** Phase 17 re-flagged as incomplete - "code complete" was inaccurate; notification delivery is the blocking gap. Phase 31 schema-first approach: DB layer done before NextAuth install to avoid migration conflicts later.
**Next up:** Build Phase 17 notification delivery (query Follow table on sale publish, send email via Resend + push via VAPID to followers). Then Phase 31 NextAuth.js v5 install.
**Blockers:** Vercel redeploy still pending (rate limit from prior session).

### 2026-03-04 (session 47 - Railway + Neon Infrastructure Migration)
**Worked on:** Migrated backend from local Docker + ngrok to Railway. Fixed 6 TypeScript compilation errors. Fixed Dockerfile binary resolution. Fixed uuid@13 ESM-only crash by replacing with Node 18 built-in crypto.randomUUID(). Railway container now healthy. Ran prisma migrate deploy against Neon - all 15 migrations applied. Set NEXT_PUBLIC_API_URL in Vercel to Railway domain.
**Decisions:** crypto.randomUUID() preferred over pinning uuid@9. pnpm run preferred over pnpm exec in Docker for binary resolution reliability.
**Next up:** Vercel redeploy (rate-limited). Verify frontend talks to Railway backend. Then Sprint E (Phase 26 - listing card redesign).
**Blockers:** Vercel redeploy rate limit.

### 2026-03-05 (session 42 - Sprint A: Phase 12 Auction Completion)
**Worked on:** Completed Sprint A. Two actual gaps fixed: (1) stripeController.ts using sale-level flag replaced with item-level auction detection; (2) itemController.ts silently dropping category and condition - both now persist.
**Decisions:** Item-level auction detection preferred over sale-level. Category/condition bug fix part of Sprint A.
**Next up:** Sprint B - Phase 24+25 design system + bottom tab navigation.
**Blockers:** None.

### 2026-03-04 (session 41 - 7-Test Workflow Stress Test)
**Worked on:** Ran all 7 stress tests to validate guardrails. All 7 passed. context.md regenerated.
**Decisions:** Sonnet sufficient for Sprint A. Opus recommended for Sprint B.
**Next up:** Sprint A - Phase 12 auction completion.
**Blockers:** None.

### 2026-03-04 (session 40 - Deep Workflow Audit + Tool Tree + Doc Fixes)
**Worked on:** Deep audit of MCP connectors and doc system. Found and fixed 9 issues including CORE.md gaps, duplicate ToastContext, stale RECOVERY.md, diff-only violation root cause.
**Decisions:** conversation-defaults Rule 3 is the active enforcement checkpoint for diff-only rule. Skills added to authority hierarchy.
**Next up:** Delete contexts/ToastContext.tsx. Sprint A + Sprint B.
**Blockers:** ToastContext.tsx deletion needs Patrick confirmation.
