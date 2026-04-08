# Self-Healing Skills — FindA.Sale

Recurring bugs and their confirmed fixes. Add an entry when a pattern has been seen ≥2 times or is structurally certain to recur.

---

## SH-001: MCP-pushed files never committed locally → Docker build failure

**Trigger:** Railway Docker build fails with TypeScript errors on files that look fine locally (e.g. "Unknown keyword or identifier", placeholder content on line 1).

**Environment:** Any session after MCP pushes via `mcp__github__push_files` or `create_or_update_file`.

**Pattern:** MCP pushes files directly to GitHub without touching the local working tree. Local working copies diverge from git HEAD. When Docker builds from the git repo, it uses the remote versions — which may be placeholders ("This file is too large…") or older commits.

**Steps:**
1. `git status` on the failing files — they will show as `modified` or `untracked`
2. `git diff --stat HEAD <files>` to confirm local vs committed divergence
3. Stage and commit the local versions: `git add <specific files> && git commit -m "..."`
4. Run `.\push.ps1` — handle any merge conflicts (remote placeholder stubs → keep HEAD)

**Edge Cases:** If push.ps1 warns about untracked files with `[saleId]` brackets, use `Remove-Item -LiteralPath "..."` (PowerShell treats `[` as wildcards in normal Remove-Item). Also: files MCP-pushed earlier in the same session will exist on remote as untracked local copies — delete them before merging so git doesn't abort.

**Confidence:** HIGH — seen sessions 128, 129, 137.

---

## SH-002: Merge conflict — remote has placeholder stub, local has full file

**Trigger:** After committing local controllers and pushing, git merge shows conflict on a controller file. Remote version has `"This file is too large. Pushing with mcp__github__create_or_update_file separately."` on line 1.

**Pattern:** MCP `push_files` has a token limit. When a file exceeded the limit, a prior agent left a stub placeholder on the remote. Local HEAD has the real file.

**Steps:**
1. `git checkout --ours <file>` to keep the local (full) version
2. `git add <file> && git commit` to complete the merge

**Confidence:** HIGH — seen sessions 129, 137.

---

## SH-003: Functions dropped from itemController during full-file merge

**Trigger:** Build error: `Module has no exported member 'analyzeItemTags'` (or addItemPhoto, removeItemPhoto, reorderItemPhotos).

**Pattern:** When itemController.ts is rewritten by an agent (session 136 Rapidfire work), functions from earlier sessions get dropped if the agent's context didn't include the full file. The routes file still imports them.

**Steps:**
1. `git log --oneline -10` to find last known-good commit
2. `git show <commit>:packages/backend/src/controllers/itemController.ts | grep -n "^export const"` to locate the missing functions
3. `git show <commit>:packages/backend/src/controllers/itemController.ts | sed -n '<start>,<end>p'` to extract them
4. Append the functions to the current itemController.ts before the new functions

**Confidence:** HIGH — seen sessions 128, 137.

---

## SH-004: fireWebhooks arity mismatch after agent rewrite

**Trigger:** `TS2554: Expected 3 arguments, but got 2` on a fireWebhooks call.

**Pattern:** Agent writes new fireWebhooks calls copying the 2-arg pattern from older code. webhookService.ts signature requires `(userId, event, data)`.

**Fix:** Always call `fireWebhooks(organizerUserId, 'event.name', { ...data })`. For bid events use `item.sale.organizer.userId`; for organizer-action events use `req.user.id`.

**Confidence:** MEDIUM — seen once (session 137), but structurally certain to recur on any agent rewrite touching webhooks.

---

## SH-005: PowerShell bracket glob — Remove-Item fails on [saleId] paths

**Trigger:** `Remove-Item packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` silently does nothing (PowerShell treats `[saleId]` as a character class glob).

**Fix:** `Remove-Item -LiteralPath "packages/frontend/pages/organizer/add-items/[saleId]/review.tsx"`

**Confidence:** HIGH — seen session 137, PowerShell behavior is consistent.

---

## SH-006: skill-creator package_skill validation failure — non-standard frontmatter keys

**Trigger:** `❌ Validation failed: Unexpected key(s) in SKILL.md frontmatter: last_updated, version. Allowed properties are: allowed-tools, compatibility, description, license, metadata, name`

**Environment:** Any session packaging a skill with the skill-creator `package_skill` script.

**Pattern:** When drafting a SKILL.md for human review (e.g., via findasale-records), it's natural to add doc-style frontmatter like `version: 4` or `last_updated: 2026-03-11`. The packager only allows: `name`, `description`, `compatibility`, `allowed-tools`, `license`, `metadata`. Any other key fails validation.

**Known instance:** Session 139 — conversation-defaults v4 SKILL.md had `version: 4` and `last_updated: 2026-03-11 (Session 138)` in frontmatter.

**Steps:**
1. Open the SKILL.md being packaged
2. Remove any frontmatter keys that are not in the allowed set: `name`, `description`, `compatibility`, `allowed-tools`, `license`, `metadata`
3. Keep `version` and `last_updated` as prose inside the body of the skill if needed for reference
4. Re-run `python -m scripts.package_skill <path> <output-dir>` from the skill-creator directory

**Edge Cases:**
- The output directory must be writable — `/sessions/*` works, `/tmp` may have a stale read-only `.skill` file from a prior run that blocks overwrite; use a fresh subdirectory
- The `.skills/skills/` directory is read-only from the VM — always output to `/sessions/*/skill-output/` or the workspace folder

**Confidence:** HIGH — validator is deterministic; any non-standard frontmatter key will always fail.

---

## SH-007: "Operation not permitted" on rm/delete in FindaSale workspace

**Trigger:** `rm: cannot remove '/sessions/.../mnt/FindaSale/...': Operation not permitted`

**Environment:** Any session attempting to delete files in the mounted FindaSale workspace (`/sessions/*/mnt/FindaSale/`).

**Pattern:** The FindaSale workspace is a mounted directory from the user's computer. The VM does not have delete permissions by default. Bash `rm` and Python `os.remove()` will fail with "Operation not permitted" until the user grants explicit delete access via the MCP tool.

**Known instance:** Session 144 — attempting to delete junk files (MESSAGE_BOARD.json.tmp, test.tmp, zikpWboU, etc.) during file governance cleanup.

**Steps:**
1. When `rm` fails with "Operation not permitted" on any file under `/sessions/*/mnt/FindaSale/`
2. Call `mcp__cowork__allow_cowork_file_delete` with the `file_path` of the file you're trying to delete
3. User approves the permission grant in the Cowork UI
4. Retry the `rm` or delete operation — it will succeed

**Edge Cases:**
- Permission is granted per-file — if deleting multiple files, you may need to call the tool once per file or call it with a representative file to unlock the directory
- Git-tracked files that were never committed produce harmless `fatal: pathspec` errors on `git rm` — these are safe to ignore (the file was created and deleted in the same session)

**Test Command:** `rm /sessions/*/mnt/FindaSale/<any-file>` — if it fails, call `mcp__cowork__allow_cowork_file_delete` first.

**Confidence:** HIGH — workspace mount restriction is consistent; always required before any delete in FindaSale directory.

---

**## SH-008: review.tsx fetches published items instead of drafts**

**Trigger:** After clicking Done in Rapidfire, the Review & Publish page shows all existing published items as "pending" with broken AI confidence bars, while newly captured draft items are invisible.

**Environment:** `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx`

**Pattern:** `GET /items?saleId=...&draftStatus=DRAFT,PENDING_REVIEW` — the `draftStatus` query param is silently ignored by `getItemsBySaleId` which hardcodes `PUBLIC_ITEM_FILTER = { draftStatus: 'PUBLISHED' }`. Result: always returns published items regardless of params. The correct organizer-only endpoint is `GET /items/drafts?saleId=...` (`getDraftItemsBySaleId`) which actually filters for DRAFT/PENDING_REVIEW and verifies ownership.

**Known instance:** Identified session 147, fixed session 149 (commit b578cca). Bug had been in STATE.md as "P0 QA bug (open)" for one full session without being patched.

**Steps:**
1. Check `review.tsx` — is the query calling `/items?saleId=...` or `/items/drafts?saleId=...`?
2. If `/items?...`: change to `api.get(\`/items/drafts?saleId=${saleId}\`)`
3. The `/items/drafts` route requires organizer auth — make sure the `api` instance sends the auth header (it does by default via the axios interceptor)

**Edge Cases:**
- Do NOT add draftStatus as a query param to `GET /items` — the backend does not read it. The only way to get draft items is via `/items/drafts`
- `getDraftItemsBySaleId` paginates (default 20/page) — if an organizer has >20 draft items, the review page will silently truncate. Not an issue for MVP.

**Test Command:** After Rapidfire session, navigate to /organizer/add-items/[saleId]/review — verify only new DRAFT items appear, not the published catalog.

**Confidence:** HIGH — backend architecture is definitive; `PUBLIC_ITEM_FILTER` is immutable in `getItemsBySaleId`.

---

## SH-009: Edit tool rejects write — "file has been modified since last read"

**Trigger:** Claude uses the Edit tool on a file that was modified (by GitHub MCP push, another agent write, or a prior Edit call in the same session) after the last Read. Edit fails with "file has been modified since last read."

**Environment:** Any file in the FindaSale workspace, particularly `.tsx` / `.ts` files that multiple agents or tool calls may touch in the same session.

**Pattern:** The Edit tool tracks a content hash from the last Read. If anything writes to the file between the Read and the Edit — even another Edit call earlier in the session — the hash mismatches and the edit is rejected.

**Known instances:** 
- Session 153: Applying the `saleId` fix to `pos.tsx` after Dev's full rewrite. Edit rejected because QA had already edited the file since the last read.

**Steps:**
1. Use `Grep` (not `Read`) to locate the target line(s) — this refreshes the match without a full re-read.
2. If the change is small (1–3 lines), use `Read` with `offset` and `limit` targeted to just the changed section.
3. Re-apply the Edit with the refreshed content as `old_string`.
4. If the file is still rejecting (e.g., multiple agents have touched it), do a full `Read` of the file first, then apply the Edit.

**Edge Cases:**
- GitHub MCP `push_files` or `create_or_update_file` also modifies the file on the VM — any Edit after an MCP push requires a fresh Read first.
- Do NOT use `replace_all: true` as a workaround unless the pattern is truly unique — it can silently replace unintended occurrences.

**Test Command:** `Read` the file after any MCP push; confirm line numbers match before editing.

**Confidence:** HIGH — Edit tool behavior is deterministic; content hash mismatch is always the cause.

---

## SH-010: Stripe Terminal cash sale — @unique constraint violation on stripePaymentIntentId

**Trigger:** Multiple concurrent cash sales fail with Prisma P2002 (unique constraint violation) on `Purchase.stripePaymentIntentId`.

**Environment:** `packages/backend/src/controllers/terminalController.ts` — `cashPayment` handler.

**Pattern:** `Purchase.stripePaymentIntentId` has `@unique` in the Prisma schema. Cash sales don't have a real PI, so a placeholder ID must be generated. Using `Date.now() + Math.random()` is not collision-safe — two requests in the same millisecond can produce the same string. Must use `randomUUID()` from Node.js built-in `crypto`.

**Known instance:** Session 153 — QA flagged as BLOCKER. Fixed by switching to `cash_${randomUUID()}`.

**Steps:**
1. Add `import { randomUUID } from 'crypto'` at top of the controller file (Node.js built-in, no install needed).
2. Use `const cashPiId = \`cash_\${randomUUID()}\`` for each cash transaction.
3. Do NOT use `Date.now()`, `Math.random()`, or any time-based ID for DB unique constraints.

**Edge Cases:**
- `randomUUID()` is available in Node.js ≥ 14.17 — safe for this stack.
- One UUID per transaction, not per cart item — all Purchase records for a single cash transaction share the same `cash_${uuid}` PI ID.

**Test Command:** In terminal: `node -e "const {randomUUID}=require('crypto'); console.log(randomUUID())"` — should output a valid UUID.

**Confidence:** HIGH — UUID v4 provides 2^122 entropy; collision is cryptographically impossible in practice.

---

## SH-009: Double `/api` prefix in new frontend pages

**Trigger:** New organizer page fetches data and gets 404 in staging. Network tab shows URL like `…/api/api/organizers/something`.

**Environment:** Any new page in `packages/frontend/pages/` that uses the `api` lib from `lib/api.ts`.

**Pattern:** `lib/api.ts` sets `baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'` — the base already ends in `/api`. When a new page constructs a URL as `/api/organizers/…`, the result is `/api/api/organizers/…` → 404. Correct path is `/organizers/…` (no leading `/api/`).

**Known instance:** Session 173 — `/organizer/performance` page built URL as `` `/api/organizers/performance?saleId=${id}` `` → 404 in production. Fixed by removing the leading `/api/`.

**Steps:**
1. Check the failing fetch URL in Network tab — double `/api/api/` confirms this pattern.
2. Find the URL construction in the page (search for `` `/api/ ``).
3. Remove the `/api` prefix: `` `/api/organizers/x` `` → `` `/organizers/x` ``.
4. Compare against any working page (e.g. `api.get('/sales/mine')`) to confirm pattern.

**Edge Cases:**
- Only affects pages using `lib/api.ts`. Pages using raw `fetch()` or `axios.create()` with their own baseURL are not affected.
- Next.js API routes at `/pages/api/…` are a separate system and ARE accessed at `/api/…` — don't apply this fix to Next.js API route calls.

**Test Command:** Browser Network tab → filter by the backend domain → confirm no double `/api/api/` in any request URL.

**Confidence:** HIGH — structurally certain to recur whenever a new page is written without checking existing usage patterns.

---

## SH-011: uuid@13+ ESM Crash in Node Backend

**Trigger:** Backend crashes with `SyntaxError: Cannot use import statement outside a module` when UUID is generated. Sentry reports: `NODEJS-1 (FATAL, 160 events)`.

**Environment:** Any backend code using `import { v4 as uuidv4 } from 'uuid'` with uuid v13+.

**Pattern:** uuid v13 dropped CommonJS support; backend is CommonJS. The package exports only ES modules, causing the import to fail at runtime.

**Known instances:** Session 233 identified this as root cause of 160 Sentry events; fixed by downgrading to uuid@^9.x.x.

**Steps:**
1. Check `packages/backend/package.json` → verify `uuid` version is `^9.0.0` or newer in the v9 range (NOT v13+)
2. If uuid@13+ is installed: run `pnpm remove uuid && pnpm add uuid@^9.0.0`
3. Clear node_modules and lockfile: `rm -rf node_modules pnpm-lock.yaml && pnpm install`
4. Restart backend

**Edge Cases:**
- This only affects Node.js/backend code; frontend can use uuid@13+ without issues
- Check if any transitive dependencies require uuid@13+ — if so, request a version bump of that dependency

**Test Command:** `node -e "const {v4}=require('uuid'); console.log(v4())"` — should output a UUID without SyntaxError.

**Confidence:** HIGH — version lock is permanent; no recurrence expected.

---

## SH-012: CORS Hardcoded Origins — Must Include Both finda.sale Variants

**Trigger:** Request from `www.finda.sale` returns CORS 403 error even though `finda.sale` works. Network tab shows `Access-Control-Allow-Origin` header missing.

**Environment:** `packages/backend/src/index.ts` → cors middleware setup.

**Pattern:** CORS allowed origins are hardcoded for security: only `finda.sale` and `www.finda.sale` are in the whitelist. If the request comes from a variant not in the list, CORS blocks it. Wildcard `*` is forbidden for security.

**Known instances:** Session 233 confirmed this prevents local dev CORS errors with production database; prevents unauthorized cross-origin access.

**Steps:**
1. Check `packages/backend/src/index.ts` → search `cors({ origin:`.
2. Verify list includes BOTH `finda.sale` AND `www.finda.sale`.
3. If localhost or staging variants need to be allowed, add them explicitly (e.g., `http://localhost:3000`), but never use wildcard.

**Edge Cases:**
- `http://localhost:*` is NOT a valid CORS origin — must be exact domain + port
- Subdomain variants (e.g., `api.finda.sale`) must be added separately if they exist
- For testing against prod database, either test via the prod domain or mock CORS locally

**Test Command:** Browser DevTools Network tab → check request headers for `Access-Control-Allow-Origin` response header. If missing or mismatched, CORS is blocking.

**Confidence:** HIGH — CORS policy is explicitly enforced for security; no relaxation expected.

---

## SH-013: Prisma findUnique Fails on Non-Unique Fields

**Trigger:** Prisma error: `Argument must be \`@id\` or \`@unique\`…` when using `findUnique()` with a field like `stripeCustomerId`.

**Environment:** Any backend code querying the database with Prisma.

**Pattern:** `findUnique()` requires the WHERE field to have @id or @unique constraint in the schema. Using it on a regular field (even if it's indexed) fails. Must use `findFirst()` instead.

**Known instances:** Not yet seen in FindA.Sale codebase, but structurally certain to recur with any new non-unique lookups (stripe fields, email-like fields, etc.).

**Steps:**
1. Check schema for the field: is it marked `@unique`?
2. If NOT @unique: change `findUnique()` to `findFirst()`
3. If it SHOULD be unique: add `@unique` to the schema and run `prisma migrate dev`

Example:
```typescript
// WRONG:
const user = await prisma.user.findUnique({ where: { stripeCustomerId: X } });

// CORRECT:
const user = await prisma.user.findFirst({ where: { stripeCustomerId: X } });
```

**Edge Cases:**
- `findFirst()` returns the first match (not deterministic without sorting) — if uniqueness is intended, add `@unique` to schema instead
- `findUnique()` is faster (uses index directly); only use `findFirst()` when the field is genuinely non-unique

**Test Command:** Run the query; if Prisma throws "Argument must be @id or @unique", switch to `findFirst()`.

**Confidence:** MEDIUM — Prisma pattern, not FindA.Sale-specific but commonly mistaken by new developers.

---

## SH-014: Shared Imports Cause Vercel Build Failure

**Trigger:** Vercel build fails: `Module not found: Can't resolve '@findasale/shared'…` after importing from shared in frontend code.

**Environment:** `packages/frontend/` code importing from `@findasale/shared` via pnpm workspace alias.

**Pattern:** Vercel uses strict Node.js module resolution and doesn't resolve pnpm workspace symlinks in production builds. Frontend may only import types from backend API responses or context providers, not from the shared package.

**Known instances:** Session 234 confirmed this breaks Vercel; prevented via linter rules.

**Steps:**
1. Check if frontend code has any `import { X } from '@findasale/shared'` lines
2. Remove all shared imports from frontend
3. For types that were imported: either infer them from backend API response interfaces, or re-define them locally in frontend
4. For utilities or constants: implement them in frontend or backend, not shared

**Edge Cases:**
- Backend may import from shared without issues
- Types re-exported from shared in backend (e.g., `OrganizerReputationDTO`) can be inferred in frontend from API responses
- Do NOT use shared as a utility library; it's a types-only cross-boundary repository

**Test Command:** Frontend build: `pnpm build` — should succeed without "Can't resolve '@findasale/shared'" errors.

**Confidence:** HIGH — Vercel's module resolution is deterministic; shared imports will always fail in production.

---

## SH-015: Passkey Challenge Race Condition — Use Redis Atomic getDel

**Trigger:** Concurrent login attempts with the same passkey credential create duplicate challenges. User's second login attempt in quick succession finds TWO valid challenges (last one wins, or both are consumed).

**Environment:** `packages/backend/src/controllers/authController.ts` → passkey challenge flow.

**Pattern:** S234 fixed this: challenge storage moved from in-memory Map to Redis with atomic `getDel`. Without atomicity, a race condition occurs between checking if a challenge exists and consuming it.

**Known instances:** Session 200 flagged as P0 unverified race condition; S234 confirmed fix: Redis `getDel` is atomic (get + delete in single operation).

**Steps:**
1. Check `authController.ts` → `generateChallenge()` and `verifyChallenge()` functions
2. Verify challenges are stored in Redis (not in-memory Map)
3. Verify `verifyChallenge()` uses `await redis.getDel(challengeKey)` (atomic)
4. Verify challenge flow is tagged (auth vs registration) to prevent cross-flow reuse

**Edge Cases:**
- Redis must be running and connected; if Redis is down, fallback to in-memory (with race condition risk)
- Challenge TTL should be short (5-10 minutes) to prevent reuse window

**Test Command:** Simulate concurrent login: open two tabs, start passkey auth simultaneously, verify only one succeeds.

**Confidence:** HIGH — S234 confirmed atomic `getDel` eliminates the race; Redis backend is required.

---

## SH-016: Stripe Payment Intent Unique Constraint — Use randomUUID for Cash Sales

**Trigger:** Multiple concurrent cash sales fail with Prisma P2002: `Unique constraint failed on stripePaymentIntentId`.

**Environment:** Any cash payment flow in backend (e.g., `terminalController.ts`).

**Pattern:** `Purchase.stripePaymentIntentId` has @unique constraint. Cash sales don't have a real Stripe PI, so a placeholder must be generated. Using `Date.now() + Math.random()` is collision-unsafe — two requests in the same millisecond produce identical IDs. Must use `randomUUID()` from Node's `crypto` module.

**Known instances:** Session 153 — QA flagged as BLOCKER; fixed by switching to `cash_${randomUUID()}`.

**Steps:**
1. Find any cash payment handler (search `cash_` in backend)
2. Verify it uses `const piId = \`cash_\${randomUUID()}\`` (NOT `Date.now()` or `Math.random()`)
3. Import randomUUID: `import { randomUUID } from 'crypto'` (Node.js built-in, no install needed)
4. One UUID per transaction, not per cart item

**Edge Cases:**
- `randomUUID()` is available in Node.js ≥14.17 — safe for this stack
- All Purchase records for a single cash transaction share the same `cash_${uuid}` PI ID

**Test Command:** `node -e "const {randomUUID}=require('crypto'); console.log(randomUUID())"` — should output a valid UUID.

**Confidence:** HIGH — UUID v4 provides 2^122 entropy; collision is cryptographically impossible.

---

## SH-017: Ship feature, forget to wire trigger button

**Trigger:** Post-deploy: a modal, drawer, overlay, or panel exists but there is no UI element that opens it. The feature is unreachable by the user.

**Environment:** Any frontend component that relies on a parent page calling `setX(true)` or a similar trigger.

**Pattern:** Agent builds `ComponentX.tsx` and wires it conditionally in `parentPage.tsx`, but never adds the `<button onClick={() => setComponentXOpen(true)}>` (or equivalent) to the parent JSX. Feature ships silently broken.

**Known instance:** Session 410/411 — Social Post Generator modal (`SocialPostGenerator.tsx`) was built and conditionally rendered in `dashboard.tsx`, but the "📱 Social Posts" trigger button was never added to the PUBLISHED sale card action row. S411 was an entire repair session for this one omission.

**Steps:**
1. After implementing any new modal/drawer/overlay, grep the parent page for the setState call: `grep "setComponentXOpen\|setShowX\|openX" <parent-page>.tsx`
2. Verify a `<button>` or clickable element that calls that setter exists in the rendered JSX.
3. If missing: add the trigger UI before returning output. Do not return without it.
4. Include in acceptance criteria for every modal dispatch: "Trigger button exists and is reachable from the expected user flow."

**Confidence:** HIGH — confirmed S410. Structurally certain to recur whenever modal-first dispatch prompts don't include a "verify trigger exists" step.

---

## SH-018: New organizer/shopper page missing auth guard

**Trigger:** Unauthenticated user reaches an organizer or shopper page without being redirected to login.

**Environment:** Any page under `packages/frontend/pages/organizer/` or `packages/frontend/pages/shopper/`.

**Pattern:** New pages are built with feature logic but the auth guard pattern is omitted. S410 found 6 such pages (calendar, earnings, qr-codes, staff, ripples, ugc-moderation) that had shipped without guards.

**Steps:**
1. After building any new organizer/shopper page, verify the following pattern is present at the top of the component:
```typescript
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

const { data: session, status } = useSession()
const router = useRouter()

useEffect(() => {
  if (status === 'unauthenticated') {
    router.push('/auth/signin')
  }
}, [status, router])

if (status === 'loading' || !session) return null
```
2. Verify by grepping the new file: `grep "useSession" <new-page>.tsx` — must return a match.
3. If missing: add the guard before returning.

**Edge Cases:**
- Public-facing organizer pages (e.g., `/organizer/[slug]` public profile) are intentionally unguarded — don't add auth guard to pages that should be publicly accessible.
- Admin pages use a different auth check (role-based) — verify with `requireAdmin` pattern from existing admin pages.

**Confidence:** HIGH — missing auth guards are a consistent pattern across new page builds (S410 found 6 in one pass).

---

## SH-019: Cloudinary transformation URL silently returning 400

**Trigger:** Watermarked or transformed images fail to load. CDN returns HTTP 400. Images appear broken or missing in UI.

**Environment:** Any backend code in `packages/backend/src/utils/cloudinaryWatermark.ts` or any file generating Cloudinary transformation URLs.

**Pattern:** Cloudinary transformation strings reference resources (fonts, named overlays, presets) that are not configured in the Cloudinary account. The string is syntactically valid TypeScript but fails at URL request time with no runtime error thrown. S410 found that `Montserrat_bold_18` had never been uploaded to Cloudinary — every watermarked URL had been returning 400 since the watermark feature was first launched.

**Known instance:** S410 — `cloudinaryWatermark.ts` used `l_text:Montserrat_bold_18:finda.sale`. Montserrat was not in the account. Fixed to `l_text:Arial_30,co_white,o_80:finda.sale`.

**Confirmed safe Cloudinary resources:**
- `Arial_30` (system font, always available)
- `co_white`, `o_80` (color/opacity params, no asset required)

**Steps:**
1. After writing any Cloudinary transformation string, construct the full resulting URL.
2. Test the URL directly: `curl -I "<generated_cloudinary_url>"` — must return HTTP 200.
3. If 400: check the `l_text:FontName_Size` portion — verify the font exists in Cloudinary account under Settings → Upload Presets or Media Library → Fonts.
4. If the font isn't configured: use `Arial_30` as the safe fallback.
5. Never use named transformations (e.g., `t_watermark`) without first verifying they exist in the account.

**Test Command:**
```bash
# Replace with actual Cloudinary cloud name and sample public_id
curl -I "https://res.cloudinary.com/<cloud>/image/upload/l_text:Arial_30,co_white,o_80:test/<sample-public-id>.jpg"
# Expect: HTTP/2 200
```

**Confidence:** HIGH — Cloudinary transformation errors are silent at write-time; only URL testing catches them. Pattern is certain to recur whenever new text overlays or custom fonts are added.
