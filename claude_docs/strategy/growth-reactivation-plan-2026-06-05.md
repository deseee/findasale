# FindA.Sale — Growth-Channel Reactivation Plan (2026-06-05)

All cold-outreach + content channels are currently HARD-DISABLED after two Gmail suspensions (May 18, Jun 5). Root cause both times was **volume, not content**: an automated job sent ~8,317 messages in one run with no daily cap, no ramp, no suppression list. This plan re-lights the channels safely and in order.

## Channel baseline
| Channel | State |
|---|---|
| Cold organizer email | HARD-DISABLED (`OUTREACH_ENABLED=false`, workflow disabled, 0 sends since Jun 5) |
| Gmail `outreach@finda.sale` | Suspended (over-limit) — must be reactivated before any cold send |
| Transactional email (Resend, `send.finda.sale`) | LIVE |
| DirectoryClaimEmail queue | 3,300+ PENDING / ~29–659 SENT / 480 BOUNCED / 2,206 stale >30d / no suppression logic |
| WARM email-ready leads | 462, no outreach record (best first cohort) |
| Partnership drafts | 19 written, 0 sent |
| Creator drafts | 68 written, 0 sent |
| Weekly LinkedIn/IG content | Generated through Jun 4, 0 published, accounts unconfirmed |

## 1. Safe email warm-up
Prerequisite (blocking): confirm Gmail/Workspace reactivation for `outreach@finda.sale` before a single cold send. Do not re-enable into a still-suspended mailbox — it just resets the strike clock.

Ramp (config-driven `OUTREACH_DAILY_CAP`, dialable without deploy):
| Week | Daily cap | Cohort |
|---|---|---|
| 1 | 20 | WARM 462 only |
| 2 | 40 | WARM |
| 3 | 75 | + fresh deduped PENDING (after legal sign-off) |
| 4 | 125 | |
| 5 | 200 | |
| 6 | 300 (hard cap) | steady state |

Cron safeguards to build: DB-counted rolling-24h cap (survives restarts), hourly micro-batches with jitter (not one morning burst), and a circuit breaker that auto-sets `OUTREACH_ENABLED=false` if a batch bounces >5%. Watch metric: **bounce rate (<3%)**.

## 2. Domain isolation (most important downstream risk)
Verified good news: transactional mail sends from `send.finda.sale`; cold outreach from `outreach.finda.sale` (and sometimes bare root `finda.sale`). Separate DKIM domains = a cold-reputation hit does NOT directly tank transactional deliverability.

Two gaps to close: (1) keep cold mail STRICTLY on `outreach.finda.sale`, never the bare root — the root is the coupling path back to org-level reputation. (2) Prove isolation before re-enabling: send a test payout/verification email while `outreach@` is still suspended and confirm it delivers. Lock the rule: transactional never sends from `outreach.*`, cold never sends from root/transactional identity. Watch metric: **root-domain transactional deliverability stays flat as cold ramps** (any movement = stop cold immediately).

## 3. List hygiene (before re-enabling)
Build a permanent Suppression list (bounce/unsubscribe/complaint, checked on every send forever). Drop the 480 bounced now. Age-out the 2,206 stale >30-day PENDING. Dedupe by normalized email. Send order: WARM 462 first (pre-qualified, no prior contact, low bounce), fresh PENDING second. Watch metric: **spam-complaint rate (<0.1%)**.

## 4. Compliance (CAN-SPAM + consent)
Every cold email: institutional sender ("The FindA.Sale Team"), honest subject, physical address (219 E Michigan Ave, Suite F, Paw Paw, MI 49079), working unsubscribe wired to the Suppression list. CAN-SPAM allows cold B2B without prior opt-in — but a real lawyer must review the scraped-contact posture before scaling past WARM: state laws, personal vs business addresses, data-source ToS, and GDPR/CASL for any non-US contacts. **Legal sign-off gates expansion past the 462 WARM leads.**

## 5. Content publishing
Blocking dependency: confirm/create owned LinkedIn Company Page + Instagram business account (institutional, no founder account). Then publish manually 2 posts/wk/platform from the existing backlog (manual review enforces no-"AI"/no-founder-voice). Add a scheduler only after 3–4 weeks of vetted manual posts. Watch metric: **engagement rate**.

## 6. Partnership / creator sends (near-zero risk, start now)
These are human 1:1 relationship sends, OFF the automated cron. Send the 19 partnership drafts first (≤5/day, personalized, tracked, one 7-day follow-up). Then the 68 creator drafts in waves of ~10/day with per-creator personalized openers. Watch metric: **reply rate**.

## 7. Master sequencing (next ~6 weeks)
Week 0 (now): confirm Gmail reactivation; build suppression + age-out + dedupe; prove domain isolation; confirm/create social accounts; send 19 partnership drafts by hand.
Weeks 1–2: cold email 20→40/day to WARM only; begin manual social publishing; creator wave 1.
Week 3: 75/day + fresh PENDING — **requires legal sign-off**.
Weeks 4–6: ramp to 300/day hard cap.

Stop conditions any week: batch bounce >5% (auto-pause), or any movement in root transactional deliverability (stop cold).

If you can only do four things this week: (1) confirm Gmail reactivation, (2) build suppression list + drop 480 bounced + age out 2,206 stale, (3) hand-send the 19 partnership drafts, (4) confirm whether the social accounts even exist.
