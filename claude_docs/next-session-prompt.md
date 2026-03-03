# Next Session Resume Prompt
*Written: 2026-03-03*
*Session ended: normally*

## Resume From

Complete audit and bug hunt before continuing the roadmap. All current work is committed and stable. finda.sale is live. localhost is working after frontend rebuild. Seed is fresh with fixes applied.

## What Was Completed This Session

- **update-context.js stale Docker fix** — removed preservation logic; unavailable message is now always fresh instead of caching old container names
- **Seed bug #1 fixed** — organizer users 0–9 now seeded with `role: 'ORGANIZER'` (was `'USER'`)
- **Seed bug #2 fixed** — `stripeConnectId` always `null` in seed; fake `acct_test_*` IDs removed
- **Reseeded** — clean data, confirmed in Docker output
- **`findasale-workflow-retrospective`** scheduled task created — runs 8th of each month at 9am
- **Workflow audit report** written to `claude_docs/workflow-audit-2026-03-03.md`

---

## NEXT SESSION OBJECTIVE: Full Pre-Beta Audit

Patrick wants a complete audit and bug hunt before advancing the roadmap. Run all phases below in order. Use the health-scout skill for the automated pass, then go manual for the flows.

---

### Phase 0 — Session Startup: Tool & Plugin Inventory

Before any work begins, Claude must announce which tools and connectors are active. Check and report on all of the following at session start:

**GitHub MCP (`mcp__github__*`):** If active, use for all file pushes. Never write "push from PowerShell" in wrap notes when this is available.

**Web search:** Is `WebSearch` available? Note it for competitor/changelog research tasks.

**Claude in Chrome (`mcp__Claude_in_Chrome__*`):** If active, browser automation is available — useful for manual flow audits, testing live finda.sale pages, or checking Stripe/Resend dashboards.

**Docker status:** Is Docker reachable from the VM? Run `docker ps` via Bash. If not (common — VM can't reach Docker Desktop on Windows host), note it clearly and do not attempt Docker commands from the VM.

**Scheduled tasks:** Are any findasale-* tasks currently running or queued? Check before starting work.

Announce all of the above in a single opening message so Patrick knows what's available without having to ask. This replaces the silent startup pattern that caused the GitHub MCP miss.

---

### Phase 1 — Automated Scan (run first)

Load and execute the **health-scout skill**. This covers: security headers, unprotected routes, hardcoded secrets, missing alt text, unbounded Prisma queries, console.log statements in production, accessibility basics.

Save the report to `claude_docs/health-reports/2026-03-03-pre-beta.md` (or today's date).

---

### Phase 2 — Backend API Audit

Grep and read the following. Flag anything that needs fixing:

1. **Unprotected mutation routes** — `grep -rn "router\.\(post\|put\|patch\|delete\)(" packages/backend/src/routes/ --include="*.ts" | grep -v "authenticate\|verifyToken"`
   Every mutation must have `authenticate`. Organizer routes must also have role check.

2. **Unbounded Prisma queries** — `grep -rn "findMany(" packages/backend/src/controllers/ --include="*.ts" | grep -v "take:\|limit"`
   Every public-facing `findMany` needs a `take` cap.

3. **Async without try/catch** — scan controllers for async handlers missing error handling. (Self-healing Skill 5)

4. **Circular dependency risk** — `grep -rn "from '../index'" packages/backend/src/controllers/ --include="*.ts"`
   Any hit = circular dep waiting to happen. (Self-healing Skill 10)

5. **Env var completeness** — diff `.env.example` vs `.env` in both `packages/backend/` and `packages/frontend/`. Flag any keys in example but missing from actual.

6. **JWT payload** — verify `authController.ts` jwt.sign() includes: id, email, role, name, points, referralCode, organizerId (if organizer). (Self-healing Skill 2)

---

### Phase 3 — Frontend Flow Audit

Manually trace each critical user flow in the code (pages + API calls). Flag broken wiring, missing error states, missing loading states, or console.log stubs:

**Shopper flows:**
- [ ] Register → login → shopper dashboard loads with name/points
- [ ] Browse homepage → filter by date/keyword → sale detail page
- [ ] Sale detail → subscribe to sale → receive confirmation
- [ ] Sale detail → buy item → checkout modal → Stripe payment
- [ ] Shopper dashboard → purchases tab → referral link copy
- [ ] Forgot password → reset password → login with new password

**Organizer flows:**
- [ ] Register as organizer → dashboard loads own sales only
- [ ] Create sale → publish → appears on homepage
- [ ] Add items (manual) → item appears on sale detail
- [ ] Add items (CSV import) → items created
- [ ] Add items (AI photo scan) → form pre-fills
- [ ] Edit item → changes saved
- [ ] Stripe Connect onboarding → Setup Payments → returns to dashboard
- [ ] Download Marketing Kit PDF → QR code present
- [ ] Manage Queue page → call next, broadcast SMS
- [ ] Organizer settings → update business name/phone/address
- [ ] Change password

**Public pages:**
- [ ] /organizers/[id] → public profile loads with badges, sales
- [ ] /sales/zip/[zip] → zip landing page loads
- [ ] /city/[city] → city landing page loads
- [ ] /faq, /terms, /privacy, /about, /contact → all load without errors
- [ ] 404 and 500 pages render correctly
- [ ] offline.tsx renders when offline

---

### Phase 4 — PWA & SEO Audit

1. **Service worker** — check `next.config.js` Workbox rules are current. Verify no stale fallback .js files in `public/` that don't match current build hashes.

2. **Manifest** — verify `public/manifest.json` has all icon sizes, correct start_url, correct theme_color.

3. **SEO** — check `_document.tsx` OG tags, twitter cards. Check `server-sitemap.xml.tsx` includes all live routes. Check `next-sitemap.config.js` robots.txt disallows are correct.

4. **Schema.org** — verify sale detail page JSON-LD is valid (eventStatus, AggregateOffer, BreadcrumbList). Verify city and zip pages have ItemList JSON-LD.

---

### Phase 5 — Database & Schema Audit

1. Read `packages/database/prisma/schema.prisma` in full. Check for: missing indexes on frequently-queried fields (saleId, userId, status, zip), any nullable fields that should be required, any fields added in STATE.md phases but missing from schema.

2. Check migrations directory — are all 14 migrations in sequence with no gaps or failed states?

3. Verify seed produces clean relational data: `docker exec findasale-backend-1 sh -c "cd /app/packages/database && npx prisma studio"` — or just query a few key endpoints to spot-check.

---

### Phase 6 — Documentation Accuracy Check

1. **STATE.md "Pending Manual Action"** — is each item still accurate? The localhost rebuild is now done. Resend domain verification — still pending?

2. **self_healing_skills.md** — any pattern from the last few sessions not yet captured?

3. **DEVELOPMENT.md** — does it reflect the current Docker startup sequence, seed command, and Prisma Studio instructions?

4. **context.md** — after running this session's work, do a `node scripts/update-context.js` from Windows PowerShell to regenerate with fresh git + file tree state.

---

### Deliverable

At end of audit session, produce:
`claude_docs/audit-report-YYYY-MM-DD.md`

Sections: Critical (fix before beta), Medium (fix within 2 weeks), Low (nice to have), Clean (confirmed working). Include a "safe to launch?" verdict at the top.

Then run **session-wrap** to sync STATE.md and session-log.md.
