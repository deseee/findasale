# Next Session Resume Prompt
*Written: 2026-03-05T (sessions 66–68 wrap)*
*Session ended: normally*

## Resume From

**First:** Verify brand PNGs reached GitHub. Run:
```
mcp__github__get_file_contents owner=deseee repo=findasale path=claude_docs/brand/logo-oauth-120.png
```
If missing — push all 5 PNGs + STATE.md + session-log.md + next-session-prompt.md before anything else.

**Then:** Continue C path — next batch is CA4 + CA6.

---

## Autonomous Batch-Work Mode — Still Active

Patrick has authorized autonomous batch execution. Pick unblocked tasks, execute, update STATE.md, push, repeat. Stop only on interruption or sync points.

---

## Path Status

### CA — Production Readiness
| Task | Status | Notes |
|------|--------|-------|
| CA1 | ✅ DONE | ToS + Privacy Policy |
| CA2 | ✅ DONE | Migration runbook. 4 migrations pending Railway deploy (auto-runs on push) |
| CA3 | ✅ DONE | Payment stress test + 2 bugs fixed |
| CA4 | **NEXT** | User flow audit — full shopper/organizer/creator journeys, mobile + a11y, edge cases |
| CA5 | ✅ DONE | Health scout: GREEN. Medium fixes shipped. |
| CA6 | **NEXT** | Feature polish — photo upload UX, push notification verify, onboarding, empty states |
| CA7 | pending | Human docs — organizer guide, shopper FAQ, Zapier docs |

### CB — AI Tagging
| Task | Status |
|------|--------|
| CB1 | ✅ DONE | cloudAIService.ts (Google Vision → Claude Haiku, Ollama fallback) |
| CB3 | ✅ DONE | AI suggestions review panel in add-items |
| CB2, CB4+ | blocked | Waiting on Patrick for further AI integrations |

### CC — Business Intel & Content
| Task | Status |
|------|--------|
| CC1 | ✅ DONE | Investor materials |
| CC2 | ✅ DONE | Marketing content doc |
| CC3 | ✅ DONE | Pricing analysis — ⚡ Patrick to confirm 5%/7% flat fee |

### CD — Innovation & Experience
| Task | Status |
|------|--------|
| CD1 | ✅ DONE | Fraunces font + sage-green palette |
| CD2 Phase 1 | ✅ DONE | Scarcity counter + social proof badges |
| CD2 Phase 2 | **NEXT** | Engagement layer — Treasure Hunt Mode, Live Drop Events, Personalized Weekly Email, Smart Inventory Upload |
| CD4 | ✅ DONE | Bi-weekly workflow review scheduled task |

---

## Recommended Next Batch

**CA4 + CA6 + CD2 Phase 2** — all unblocked, no overlap.

---

## Sync Points

| Point | What to surface |
|-------|----------------|
| CC3 | ⚡ Patrick confirms 5%/7% flat fee for beta |
| CA4 if critical UX bug found | Surface before continuing |

---

## Environment Notes

- **GitHub MCP active** — push after every batch
- **Brand PNGs** — push status UNCONFIRMED (verify first thing)
- **4 Neon migrations pending** — auto-run on Railway deploy via `prisma migrate deploy`
- **Phase 31 OAuth env vars** — still needed in Vercel (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`)
- **Google OAuth consent screen** — use `claude_docs/brand/logo-oauth-120.png` (120×120 square PNG, <1MB)
- **Business cards** — use `claude_docs/brand/business-card-front.png` + `business-card-back.png` at Vistaprint

## Patrick To-Do (P path)
- P1: Order business cards at Vistaprint using brand PNGs, set up support@finda.sale, create Google Business Profile
- P2: Stripe business account, Google Voice number, Google Search Console
- P5: Add OAuth env vars to Vercel (GOOGLE_CLIENT_ID/SECRET, FACEBOOK_CLIENT_ID/SECRET)