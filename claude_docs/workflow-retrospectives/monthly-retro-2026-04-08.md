# Monthly Workflow Retrospective — April 2026
**Date:** 2026-04-08 | **Conducted by:** findasale-records (scheduled task) | **Sessions covered:** S392–S416

---

## 1. Session Summary Analysis

### Volume

April 4–8 produced ~24 sessions (S393–S416) — **4–6 sessions per day** at peak sprint. This is the densest session cadence in project history. S409–S416 all landed on April 7–8.

### Recent Session Patterns (5 most recent: S412–S416)

| Session | Date | Work Type | Files Changed | Chrome QA |
|---------|------|-----------|---------------|-----------|
| S416 | Apr 8 | Investor analysis, integration tests, Map MVP, 2 bug fixes | 16 | NOT RUN |
| S415 | Apr 8 | Full tech debt audit + Phase 1&2 quick wins | 30 | NOT RUN |
| S414 | Apr 7 | Brand-spreading decision, console.log sweep, eBay category picker | 13 | PENDING |
| S413 | Apr 7 | Orphan audit, admin nav gaps, 4 orphans removed | 23 | PENDING |
| S412 | Apr 7 | Full nav audit + link repair + shopper reputation | 6 | PENDING |

**Every recent session has unverified Chrome QA.** None of the S412–S416 changes have been browser-tested.

---

## 2. Recurring Patterns (Blockers & Bugs)

### Pattern A: Ship-but-forget-to-wire (HIGH frequency)

- **S410 → S411:** Social Post Generator modal shipped; trigger button never added. S411 was a full repair session.
- **S405:** `GET /reservations/my-holds-full` endpoint referenced in frontend, not registered in routes → 404s.
- **S393 → S394:** POS frontend delivery didn't match backend spec. Full rebuild required.
- **Root cause:** Dev dispatches contain too many features per call; wiring verification is skipped under time pressure.

### Pattern B: QA accumulation outpacing clearance (CRITICAL)

- QA backlog as of S416: **S412 (3 sessions), S413, S414, S415, S416** all marked PENDING or NOT RUN.
- QA sessions in the past month: S406b, S407, S411 — three dedicated sessions that cleared S396–S411.
- New features ship 5:1 over QA capacity. At current rate, QA debt doubles weekly.

### Pattern C: Auth guard omissions

- S410 added auth guards to 6 pages that had shipped without them: calendar, earnings, qr-codes, staff, ripples, ugc-moderation.
- S412 found more pages hidden behind false "(Soon)" labels that were actually built.
- **No dispatch prompt template includes an auth guard verification step.**

### Pattern D: Silent production regressions not caught by QA

- **Watermark broken since launch** — S410 discovered `cloudinaryWatermark.ts` had been using `Montserrat_bold_18` (not configured in Cloudinary account) since the watermark feature was first shipped. Every watermarked URL was returning 400. Existed through multiple QA sessions without being caught.
- **Root cause:** QA sessions test visible UI, not URL validity of CDN assets.

### Pattern E: Constant/type fragmentation

- `CONDITIONS` array was independently defined in 4 locations with different values before S415 centralized it to `itemConstants.ts`.
- Condition strings had two incompatible canonical sets that diverged silently.
- **Root cause:** No single-source-of-truth pattern enforced in dev dispatch prompts for shared constants.

---

## 3. Subagent Usage Analysis

### Most Active

| Agent | Role | Usage |
|-------|------|-------|
| findasale-dev | Implementation | Dominant — dispatched every session |
| findasale-qa | Browser testing | S406b, S407, S411 (3 dedicated sessions) |
| findasale-architect | Schema/API contracts | S341, S393 |
| findasale-ux | UX specs | S397, S398 |
| findasale-gamedesign | Gamification design | S403 |
| findasale-innovation | Research | S403 |
| findasale-advisory-board | Strategic decisions | S403, gamification |
| findasale-investor | Product audit | S416 |
| findasale-records | Doc audits | Wrap sessions |

### Dormant (not used in past 30 days)

| Agent | Status | Flag |
|-------|--------|------|
| findasale-sales-ops | ❌ Unused | **CRITICAL** — Investor verdict: CAC is D grade. No organizer outreach pipeline exists. |
| findasale-marketing | ❌ Unused | No content, no social presence, no beta recruitment. |
| findasale-hacker | ❌ Unused | Last security scan was S218. New auth flows (passkeys, OAuth, dual-role) since then. |
| findasale-legal | ❌ Unused | Last used for hold-to-pay review (S341). POS payment flows haven't been reviewed. |
| findasale-customer-champion | ⚠️ Dormant | No beta users yet — acceptable, but onboarding toolkit needs preparation. |
| findasale-competitor | ❌ Unused | Competitive intel last updated 2026-03-26. |

**The fleet is running as a pure dev-QA machine.** Marketing, sales, and security agents have effectively been deactivated by disuse.

---

## 4. Skill Effectiveness Assessment

Skills functioning well:
- `findasale-dev` — produces clean TypeScript, respects dispatch prompts, flags issues clearly
- `findasale-qa` — when dispatched with focused scope (one feature/one user), produces real Chrome evidence
- `findasale-gamedesign` — XP economy decisions (S403) were well-structured and held through implementation
- `findasale-investor` — S416 YELLOW verdict was clear, honest, and actionable

Skills that need tuning:

**findasale-dev dispatch prompts** — Missing standard checklist items that cause Pattern A (ship-but-forget-to-wire) and Pattern C (auth guard omissions). Recommend adding to the standard dev dispatch template in CLAUDE.md §7:
1. "For any new page: verify auth guard (`useSession()` + redirect) is present."
2. "For any new modal/drawer/overlay: confirm a trigger button exists on the parent page and is wired."
3. "For any new constant or enum: check if it already exists in `itemConstants.ts` or schema.prisma before defining a new one."

---

## 5. Doc Freshness Audit

### STACK.md ✅
Current. Accurate. Railway PostgreSQL noted (migrated from Neon S264). No changes needed.

### CLAUDE.md ✅ (mostly current)
S408 added the roadmap update gate rule. S398 added Skills vs Agent dispatch clarification. One improvement opportunity: add the QA ceiling rule (see §6 recommendations).

### DECISIONS.md / decisions-log.md ✅
Current through S413 (Apr 7). 30-day prune threshold hasn't hit yet (oldest entries March 15 = 24 days). S251 entry shows "(SUPERSEDED by S268)" — the body text is stale content that contradicts the supersession. Recommend reducing the S251 entry to just the supersession notice at next prune.

### self-healing/self_healing_skills.md ⚠️
Covers SH-001 through SH-016. Three new patterns from this month need to be added (see §6).

### claude_docs ROOT — VIOLATIONS FOUND 🚨

Per `file-creation-schema.md`, root should only contain Tier 1 and Tier 1.5 docs. Currently contains **11 violating files** from S392–S398 sessions:

| File | Violation | Correct Location |
|------|-----------|-----------------|
| `ARCHITECT_ASSESSMENT_FEEDBACK_SCHEMA.md` | One-time artifact in root | Archive |
| `ARCHITECT_PATRICK_SUMMARY.md` | One-time artifact in root | Archive |
| `FEEDBACK_DEV_QUICKSTART.md` | Feature spec in root | `feature-notes/` |
| `FEEDBACK_SURVEY_MAPPING.md` | Feature spec in root | `feature-notes/` |
| `FEEDBACK_SYSTEM_HANDOFF.md` | Feature spec in root | `feature-notes/` |
| `FEEDBACK_SYSTEM_SPEC.md` | Feature spec in root | `feature-notes/` |
| `PRICING_PAGE_UX_SPEC_S392.md` | Feature spec in root | `feature-notes/` |
| `UX_MODERNIZATION_SPEC.md` | Spec doc in root | `architecture/` or `feature-notes/` |
| `legal-hold-to-pay-risk-review.md` | Legal review in root | `operations/` |
| `human-QA-walkthrough-findings.md` | Audit report in root | `audits/` |
| `S248-walkthrough-findings.md` | Old one-time artifact | Archive |
| `patrick-walkthrough-S248.md` | Old one-time artifact | Archive |
| `next-session-brief.md` | Unknown provenance | Investigate, likely archive |

**DEPRECATED files still present** (per CLAUDE.md §12 / file-creation-schema Tier 1.5):
- `session-log.md` — content moved to STATE.md "## Recent Sessions"; file should be archived
- `next-session-prompt.md` — content moved to STATE.md "## Next Session"; file should be archived

**Unauthorized directories still present:**
- `claude_docs/improvement-memos/` — flagged as non-schema in S144, still exists
- `claude_docs/marketing/content-pipeline/` — flagged as non-schema in S144, still exists
- `claude_docs/UX/` — appeared in glob; not in locked folder map (ux-spotchecks/ is approved; UX/ is not)
- `claude_docs/UX_SPECS/` — appeared in glob; not in locked folder map

### Other docs
- `CORE.md` — Still present, still referenced in CLAUDE.md. CLAUDE.md §1 says it's the project execution contract (v5.0, S226). CORE.md was the predecessor. Recommend auditing whether CORE.md is fully superseded and archiving if so.
- `patrick-dashboard.md` ✅ — Updated current session (S416).
- `RECOVERY.md`, `SECURITY.md` — Not recently touched; may need a freshness check.

---

## 6. Self-Healing Recommendations

### SH-017: Ship feature, forget to wire trigger button

**Trigger:** Post-deploy: a modal, drawer, overlay, or panel exists but no button opens it. User cannot access the feature.

**Pattern:** Agent builds `ComponentX.tsx` and wires it to state in `parentPage.tsx`, but never adds the UI element that calls `setComponentXOpen(true)`. S410/S411 (Social Post Generator modal) confirmed instance.

**Fix:**
1. After implementing any new modal/drawer: grep the parent page for the setState call that opens it.
2. Verify a `<button onClick={() => setX(true)}>` or equivalent exists in the parent JSX.
3. If missing: add the trigger button before returning. Do not return output without it.

**Confidence:** HIGH — pattern confirmed S410. Structurally certain to recur on any modal-first dispatch.

---

### SH-018: New organizer/shopper page missing auth guard

**Trigger:** Unauthenticated user reaches a protected page; no redirect to login.

**Pattern:** New pages are built focused on feature logic, with auth guard import/effect forgotten. S410 found 6 pages missing guards (calendar, earnings, qr-codes, staff, ripples, ugc-moderation).

**Fix:**
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

1. Any page under `pages/organizer/` or `pages/shopper/` must include this pattern.
2. Verify by grepping for `useSession` in the new file before returning.

**Confidence:** HIGH — missing auth guards are a consistent pattern across new page builds.

---

### SH-019: Cloudinary transformation URL silently returning 400

**Trigger:** Watermarked or transformed images fail to load; CDN returns 400.

**Pattern:** Cloudinary transformation strings reference resources (fonts, overlays, named transformations) that are not configured in the account. The string is syntactically valid but fails at request time. S410 found `Montserrat_bold_18` had never been uploaded to Cloudinary — every watermark URL was broken since launch.

**Fix:**
1. After building any Cloudinary transformation string, test the resulting URL directly.
2. Use only confirmed-available Cloudinary resources: `Arial_30`, `co_white`, `o_80` are confirmed safe.
3. Custom fonts/overlays: verify in Cloudinary Media Library before using in code.
4. Test command: `curl -I "<generated_cloudinary_url>"` — must return HTTP 200, not 400.

**Confidence:** HIGH — Cloudinary transformation errors are silent and runtime-only; code review cannot catch them.

---

## 7. Bottleneck Analysis

### Bottleneck 1: QA-to-dev ratio (Critical)

Dev sessions: ~20 in past month. QA sessions: 3. Ratio: 7:1.

The product is functionally strong enough to launch (S416 investor verdict: "extraordinary for a solo build"). Continued dev without QA is now a liability — every new feature shipped on top of unverified code increases regression risk.

**Recommendation:** QA ceiling rule — if >8 items are in "PENDING Chrome QA" status, the next session must be a dedicated QA session. No exceptions without Patrick sign-off.

### Bottleneck 2: Repair dispatch overhead

S411 (fix S410 trigger bug) and S394 (rebuild S393 POS mismatch) both exist as pure repair sessions. These cost 8–15k tokens each that could be avoided with a pre-return wiring checklist.

**Recommendation:** Add standard pre-return checklist to CLAUDE.md §7 dev dispatch template (listed above).

### Bottleneck 3: Sales and marketing completely absent

Investor verdict says the #1 gap is commercial validation. Patrick creating his own organizer account is the next right move. findasale-sales-ops has never been dispatched to build an outreach pipeline.

**Recommendation:** Dispatch findasale-sales-ops in next session to build the organizer acquisition pipeline and outreach list.

### Bottleneck 4: Doc hygiene debt

11+ files violated root placement rules across April. The session-wrap scan should catch this but hasn't fired. Recommend Records run a clean-sweep this session (see below).

---

## 8. Recommended Actions (Prioritized by Impact)

| Priority | Action | Who | Urgency |
|----------|--------|-----|---------|
| P0 | Dedicated QA session: clear S412–S416 Chrome backlog | findasale-qa | Next session |
| P0 | Dispatch findasale-sales-ops: build organizer outreach pipeline | findasale-sales-ops | This week |
| P1 | Add SH-017, SH-018, SH-019 to self-healing-skills.md | findasale-records | This session |
| P1 | Clean-sweep claude_docs root: move 11 violating files | findasale-records | This session |
| P1 | Archive deprecated files: session-log.md, next-session-prompt.md | findasale-records | This session |
| P1 | Add QA ceiling rule to CLAUDE.md §4 | findasale-records | This session |
| P2 | Add wiring checklist to dev dispatch template in CLAUDE.md §7 | findasale-records | Next session |
| P2 | Dispatch findasale-hacker: security audit of POS + passkey + dual-role flows | findasale-hacker | This week |
| P2 | Archive CORE.md if fully superseded by CLAUDE.md | findasale-records | Next records session |
| P3 | Remove unauthorized directories: improvement-memos/, marketing/, UX/, UX_SPECS/ | findasale-records | Next cleanup pass |

---

## 9. Positive Signals

- **Tech debt cleanup was excellent.** S415 audit scored 12 debt items and shipped Phase 1+2 same session. 30 files, zero TS errors.
- **Integration tests shipped.** S416 adds 1,722 lines of auth/payment/auction/reservation tests — the first real test coverage.
- **Investor analysis was honest.** S416 produced a clear YELLOW verdict with specific actionable path to GREEN. No sugar-coating.
- **Watermark bug found and fixed.** S410 caught a launch-day regression that had been hidden for weeks.
- **QA sessions when they happen are good.** S406b/S407 produced real Chrome evidence with specific URL/interaction/outcome chains.

---

*Retrospective generated by findasale-records scheduled task. Next retrospective: 2026-05-08.*
