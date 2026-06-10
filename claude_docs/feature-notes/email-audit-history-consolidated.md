# Email / Outreach / Deliverability — Consolidated Audit History

> **Purpose:** One durable record of EVERY email/outreach/scraper-deliverability finding ever raised across audits, session history, and strategy docs — so the same chores stop getting re-discovered every few sessions.
> **Built:** S937 (2026-06-09) — READ-ONLY mine of `claude_docs/`. Every row cites the source file/section it came from.
> **Companion doc (current architecture):** `feature-notes/email-outreach-scraper-system-map.md` (S937) — the code-verified map of the 3 rails. This file is the *historical* record; that file is the *current-state* map.
> **AUDIT HONESTY GATE:** every row cites a file. Where status was ambiguous in the sources, it is marked UNKNOWN rather than guessed.

---

## ⚠️ STILL OPEN / RECURRING (the chores Patrick keeps re-hitting)

These appear in MULTIPLE audits or were never marked resolved. Ordered by recurrence/severity.

### R-1 — Missing / incomplete suppression check on bulk send paths *(recurs across 5+ sessions: S913, S918-era ses-migration-plan, S933, S935, S937)*
"Bounced/opted-out addresses keep getting bulk mail because the sender doesn't check `EmailSuppression`." First raised as the **root cause of BOTH Gmail suspensions** (no suppression list — growth-reactivation-plan-2026-06-05.md line 4). 
- S913 Noted Finding [P2]: "Bounced addresses are not auto-suppressed. EmailSuppression has only 5 rows" (STATE.md line 99).
- ses-migration-plan.md flagged `saleEndingSoonJob` missing suppression check ("Also fix in the same session").
- S937 system map G3 found **8 of 15 bulk lifecycle Gmail services** sent with NO suppression check — FIXED S937 (saleAlert/priceDrop/wishlistMatch/saleLive/presaleSneakPeek/onboarding/smartFollow/followerNotification).
- S937 STATE.md line 115 NOTED (still open): **~9 MORE Gmail-rail senders still lack suppression** — most important `lib/notificationService.createNotification` (central fan-out), plus buyingPool/reservation/saleWaitlist/waitlist/abandonedCheckout/curator/monthlyTrendReport/emailReminder/organizers.
- **STATUS: PARTIALLY OPEN.** Loop closed for Rail B (Resend, S933) + Rail C (outreach cron) + 8 bulk services (S937). ~9 more Gmail-rail senders still uncovered as of S937 (Task #5 "Careful suppression pass — notificationService + others" still in_progress per session tasks).

### R-2 — Transactional FROM address on `send.finda.sale` is not Resend-verified → 403 / spam *(recurs S780, S918, S936, S937)*
The transactional Resend rail sends FROM `@send.finda.sale`, but Resend only has the root `finda.sale` domain verified.
- S918 built the Resend rail and set FROM to `hello@send.finda.sale`, asserting "send.finda.sale is already verified in Resend" (STATE.md line 45) — **this assertion is contradicted by later evidence.**
- S936: #472 test email arrived in **Yahoo SPAM** from `support@finda.sale` (unwarmed); fix changed FROM_DEFAULT to `noreply@finda.sale` and removed hardcoded `hello@send.finda.sale` fallback (STATE.md lines 13, 221-222).
- S937 (CONFIRMED ACTIVE, Resend Logs): "only 1×200 in 15 days, rest 403 on POST /emails. Resend has only `finda.sale` (root) verified; `send.finda.sale` is not a Resend domain → every Resend send whose `from` resolves to `@send.finda.sale` is rejected 403 (not delivered)." Affects password resets, verification, Stripe receipts/payouts, POS receipts, workspace invites, consignor/message emails. `workspaceController.ts:159` hardcodes `invites@send.finda.sale` (403s every time, no env escape). COUPLING RISK: `SES_FROM_EMAIL` is shared by BOTH the Resend rail and the Gmail rail. (STATE.md lines 120, 147 — Blocked Queue item "G1").
- **STATUS: OPEN — P1, in Blocked Queue (added S937).** Needs Patrick DNS decision: (A) verify `send.finda.sale` in Resend, or (B) decouple Resend rail to root `finda.sale`. Red-flag gate (touches auth+payment).

### R-3 — `RESEND_FROM_EMAIL` Railway env points at an unwarmed/wrong sender *(recurs S936, S937, S938-pending)*
- S936: `RESEND_FROM_EMAIL=support@finda.sale` (unwarmed) → Yahoo spam (STATE.md line 218).
- S937 G4 carry-over: still needs `RESEND_FROM_EMAIL=noreply@finda.sale` set in Railway backend service (STATE.md lines 148, 156).
- **STATUS: OPEN — P2, Patrick Railway env action.** Carried S936 → S937 unactioned.

### R-4 — outreach@finda.sale Gmail/Workspace suspension cascade (volume, no daily cap) *(recurs TWICE: May 18 + Jun 5 2026; documented S887–S919 7-session blitz)*
Two Gmail suspensions, both root-caused to **volume not content** — an automated job sent ~8,317 messages in one run with no daily cap, no ramp, no suppression list (growth-reactivation-plan-2026-06-05.md line 4; monthly-retro-2026-06-08.md SH-NEW-3 line 207).
- S912: root cause of continued sends = `outwardEmailAutomationsJob.ts` had no OUTREACH_ENABLED gate; in-memory `DAILY_EMAIL_CAP` reset on restart (same root cause as June 5 blast) — fixes shipped (STATE.md line 55).
- S937 system map: Gmail rail now has DB-backed `checkAndIncrementQuota()` (emailQuotaLog table) HARD_LIMIT 1500/day — "the fix for the Jun-5 8,317-email blast" (system-map L29).
- **STATUS: ARCHITECTURALLY RESOLVED for the SPOF** (Resend transactional rail S918 + DB-backed quota cap S937). **BUT outreach@finda.sale REACTIVATION still a pending Patrick action** — BQ #335 lineage; friction-audit-2026-06-08 line 93 "#335 outreach@finda.sale reactivation still needed (Patrick action)"; growth-reactivation-plan §1 prerequisite. Note S933 STATE.md line 114 claims "#335 RESOLVED (outreach confirmed active, 658 sent)" — **status conflict between friction-audit-2026-06-08 (still needed) and S933 (resolved); marked partially open.**

### R-5 — Outreach pool data quality (junk emails wasting sends + risking reputation) *(recurs S587-era pipeline-audit-2026-05-29, S929, S934, S935)*
- pipeline-audit-2026-05-29.md Part 5: `sam@gmail.com` queued 48× across 48 companies; URL-encoded addresses (`%20info@...`); UUID@yahoo.com; off-target businesses (tile shops, malls, mapquest.com `help@mapquest.com` 4×). Decisions D-1..D-5 raised.
- S929: `@system.finda.sale` scraper placeholder domain missing from PLACEHOLDER_DOMAINS in 3 seeder files → outreach queued to our own scraper addresses → bounce DSN flood hit ImprovMX 500/day limit. FIXED (STATE.md lines 23, 334).
- S916: corrupted DCE record sent outreach to a Sentry ingest address → bounce notifications (STATE.md line 49).
- **STATUS: PARTIALLY RESOLVED.** Placeholder-domain leak fixed S929; competitor-domain block (estatesales.net/org) shipped S933. The pipeline-audit-2026-05-29 D-1..D-5 (sam@gmail.com 48×, URL-encoded validation, off-target business-type filter, warmup-cap check) — **no clear "fixed" citation found → UNKNOWN/likely still open.**

### R-6 — 0% click-through on outreach (CTA / link problem) *(recurs S779, pipeline-audit-2026-05-29)*
- pipeline-audit-2026-05-29.md Part 7: 584 sent, 22% open, **0% click, 0 signups in 6 days.** Likely broken/weak CTA link.
- monthly-digest-2026-05.md line 35 (S779): outreach links used `backend-production-153c9.up.railway.app` instead of `api.finda.sale` — "likely cause of 0% click-through." FIXED S779/S780 (RAILWAY_BACKEND_URL set; MIME text/plain part added).
- **STATUS: link-domain root cause FIXED S779/S780.** Whether click-through actually improved post-fix is **UNKNOWN** (outreach has since been suspended/paused; no post-fix click metric found).

### R-7 — OUTREACH_ENABLED conflates cold outreach with opt-in subscriber mail *(recurs S913, friction-audit-2026-06-08)*
- S913 Noted Finding [P3]: turning off OUTREACH_ENABLED also silently stops opt-in "sale ending soon" emails shoppers requested (STATE.md line 101). Recommends a separate `BULK_EMAIL_ENABLED` flag.
- friction-audit-2026-06-08 line 162: "OUTREACH_ENABLED conflates bulk vs. opt-in | P3 | 1 session | Monitor."
- **STATUS: OPEN — P3, never actioned.** No separate flag built as of S937.

---

## Chronological Findings Table

| Session | Source file | Finding | Severity (as stated) | Status (+ evidence) |
|---------|-------------|---------|----------------------|----------------------|
| S399 | operations/friction-audit-2026-04-06.md L17; -04-07.md L16 | `FeedbackSuppression` migration `20260405_add_feedback_system` not run | (pending) | UNKNOWN — later audits don't re-flag; likely RESOLVED (no recurrence) |
| ~S420 | operations/weekly-audit-2026-04-09.md L122-126, L197 | POS page console error `Failed to fetch suppressions` (404) — notification suppression list fails silently | L-001 (low) | UNKNOWN — no later "fixed" citation found |
| S648-era | audits/friction-audit-2026-05-05.md L25-37, L64, L114 | Outreach pipeline (EmailSuppression table, outreachEmailsCron, migration 20260505) code-complete but NOT deployed; needs push + `prisma migrate deploy` | P0 | RESOLVED — pipeline later live (suppression table exists, sends happened) |
| ~S734 | audits/weekly-audit-2026-05-16.md L43-47, L163-165 | Register form silent error on existing-email collision = "acquisition blocker; every outreach email points people to register" | HIGH-1 / CRIT-1 | UNKNOWN — flagged for dispatch; no resolution citation in email-scope docs |
| ~S755 | health-reports/friction-audit-2026-05-18.md L36, L56 | M-002 RESOLVED: `triggerOutreachTestEmail.ts` deleted. S754 shipped outreach rate-limit + digest suppression fixes | RESOLVED / doc-gap | RESOLVED (M-002); roadmap-entry gap noted |
| S779/S780 | monthly-digest-2026-05.md L33-35 | Outreach links used Railway URL not `api.finda.sale` (0% CTR cause); MIME was HTML-only (spam classification); api.finda.sale missing from CORS | (fix) | RESOLVED S779/S780 — RAILWAY_BACKEND_URL set, text/plain MIME part added, CORS fixed |
| S791 | monthly-digest-2026-05.md L48, L81, L125; STATE.md #335 lineage | Consignor payout email: `sendConsignorPayout()` existed but was never called → payouts never emailed. Wired in. | P0-class | Code FIXED S791; inbox-verification (#335) became long-running BQ item |
| May 15 2026 | operations/ses-migration-plan.md L11 | `saleEndingSoonJob` hit 200% quota (200 emails) — triggered the SES migration plan | (trigger) | Quota cap later added (S937 DB-backed); SES migration NOT executed (no SES rail in code, S937) |
| May 18 2026 | growth-reactivation-plan-2026-06-05.md L4 | **Gmail suspension #1** — automated job sent ~8,317 msgs, no cap/ramp/suppression | (incident) | Reactivated; recurred Jun 5 (see below) |
| Jun 5 2026 | growth-reactivation-plan-2026-06-05.md L4; STATE.md L55 | **Gmail suspension #2** — same root cause (volume, restart-prone in-memory DAILY_EMAIL_CAP) | (incident) | RESOLVED architecturally: DB-backed quota cap (S937) + Resend rail (S918); mailbox reactivation still Patrick action (R-4) |
| 2026-05-29 | operations/pipeline-audit-2026-05-29.md Parts 4-7 | 584 sent, 22% open, **0% click, 0 signups**; pool junk: sam@gmail.com 48×, URL-encoded emails, UUID@yahoo, off-target businesses, mapquest contamination; 1 opt-out (mall). May-28 spike to 198/day may exceed warmup cap | crisis / data-quality | Link cause fixed S779; pool junk PARTIALLY fixed (S929 placeholder, S933 competitor block); D-1..D-5 specifics UNKNOWN/open |
| S641 | strategy/cold-outreach-deep-audit-S641.md §2-4 | S640 made "DKIM pending Smartlead signup" call on one web search; build-vs-buy verdict = BUILD (Workspace+Postgres), do NOT buy a vendor; `_spf.smartlead.ai` SPF entry should be removed in DNS housekeeping | synthesis | DECISION: build. SPF housekeeping (`_spf.smartlead.ai` removal) — UNKNOWN if done |
| S846 | audits/friction-audit-2026-06-02.md L28, L50, L86, L132 | #335 Consignor Payout Email — **SPF fixed S846**, needs new payout test (P0, 54 sessions) | P0 | SPF FIXED S846; inbox payout test still pending (long-running #335) |
| S887–S919 | workflow-retrospectives/monthly-retro-2026-06-08.md L15-17, L207; STATE.md L43-55 | 7-session blitz: Gmail OAuth expiry → outreach suspension → bounce backlog → OUTREACH_ENABLED flip-flop → full email architecture overhaul. Root cause: single-point dependency on one Workspace account, no fallback | P0-class | RESOLVED (architecture) — Resend transactional rail S918 |
| S912 | STATE.md L55 | `outwardEmailAutomationsJob.ts` had no OUTREACH_ENABLED gate (independent 10:00 UTC cron); in-memory DAILY_EMAIL_CAP restart-prone; `abandonedSignupEmailService` targeting scraped orgs (isUnmanagedListing) | BUG fixes | FIXED S912 (3 fixes shipped) |
| S913 | STATE.md L99-103 (S913 Noted Findings) | [P2] Bounced addresses not auto-suppressed (EmailSuppression 5 rows); [P2→RESOLVED S918] single Gmail SPOF for ALL email; [P3] OUTREACH_ENABLED conflates cold+opt-in; [P3→RESOLVED S915] /health; [P1 NEW S915] Gmail REFRESH_TOKEN `unauthorized_client` | P1/P2/P3 | Mixed: SPOF RESOLVED S918; REFRESH_TOKEN RESOLVED S915/superseded S918; suppression PARTIAL (R-1); conflate-flag OPEN (R-7) |
| S913 | STATE.md L53; growth-reactivation §1 | Only 3 of ~40 Gmail-rail senders gated by OUTREACH_ENABLED → 8 proactive bulk jobs gated behind `utils/bulkEmailGate.ts`; transactional intentionally ungated | (gate gap) | FIXED S913 (8 jobs gated); transactional left ungated by design |
| S915 | STATE.md L51, L103 | Gmail OAuth REFRESH_TOKEN `unauthorized_client` — ALL Gmail-rail sending broken; bounceSuppressService cron would fail silently | P1 | RESOLVED S915 (token recovered from Jun-6 backup); superseded by Resend rail S918 |
| S916 | STATE.md L49 | Corrupted DCE record ("Kaff's Bake Shop") stored a Sentry ingest address as contactEmail → 3 outreach emails to Sentry → bounces. Gmail auto-forwarding (1,415 msgs) saturating forwarding quota | root cause | FIXED S916 (record ARCHIVED); forwarding noise cleared |
| S917 | STATE.md L47 | 1,415 mailer-daemon bounce notifications in outreach@ inbox; OUTREACH_ENABLED=true confirmed on Railway | OPS | RESOLVED S917 (inbox cleared) |
| S918 | STATE.md L43-45 | Built Resend transactional rail — 9 callers migrated off Gmail (auth, Stripe, POS, terminal, workspace, message, consignor, tierLapse). Asserted "send.finda.sale already verified in Resend" + FROM `hello@send.finda.sale` | (fix) | Rail RESOLVED Gmail SPOF; **the send.finda.sale-verified assertion later proven WRONG (R-2)** |
| S929 | STATE.md L23, L334-335; reference_railway | `@system.finda.sale` placeholder domain missing from PLACEHOLDER_DOMAINS in 3 seeder files → outreach to own scraper addresses → bounce DSN flood → ImprovMX 500/day limit hit | bug | FIXED S929 (deployed); 0 bad rows confirmed |
| S930 | STATE.md L21 | 104 mailer-daemon bounce threads trashed from outreach inbox | OPS cleanup | RESOLVED S930 |
| S933 | STATE.md L114, L262-267 | Competitor email domain blocking: `BLOCKED_DOMAINS` = estatesales.net/.org across all 3 rails; `transactionalEmailService` had ZERO suppression logic — added full check before every Resend call; #335 marked RESOLVED (outreach active, 658 sent) | (fix) | FIXED S933; #335 status conflicts w/ friction-audit-2026-06-08 (R-4) |
| S935 | STATE.md L15; ses-migration-plan | #471 bounce suppression confirmed SHIPPED pre-S926 (bounceSuppressService.ts daily 06:00 UTC cron) | RESOLVED | RESOLVED — closed bounce→EmailSuppression loop for Rail B/C |
| S936 | STATE.md L13, L218-222 | #472 test email landed in **Yahoo SPAM** from `support@finda.sale` (unwarmed); admin.ts hardcoded `hello@send.finda.sale` fallback removed; transactionalEmailService FROM_DEFAULT → `noreply@finda.sale`. Patrick must set RESEND_FROM_EMAIL | bug + P2 env | Code FIXED S936; Railway env action OPEN (R-3) |
| S937 | feature-notes/email-outreach-scraper-system-map.md G1-G6; STATE.md L11, L120 | 3-rail map. G1 (P1, BQ): Resend rail FROM `send.finda.sale` 403/rejected (1×200 in 15 days). G3 (P1, FIXED): 8 bulk Gmail services no suppression. G4 (P2): RESEND_FROM_EMAIL unwarmed. G5 (P3): dead init*Cron headers mislead. G6 (P3): auctionJob ungated (transactional, arguably correct). NOTED: ~9 more Gmail senders lack suppression | P1/P2/P3 | G3 FIXED S937; G1 OPEN (BQ, R-2); G4 OPEN (R-3); ~9 senders OPEN (R-1) |
| (ongoing) | operations/cost-protection-playbook.md §8 L179-191 | Resend free tier 3,000/mo; viral event could exceed → upgrade to Pro 50k/$20 | LOW | Monitor — no incident |

---

## ✅ Resolved & Verified (do not re-investigate)

- **Gmail SPOF for all email** → RESOLVED S918 (Resend transactional rail, 9 callers migrated). Evidence: STATE.md L43-45, L100; monthly-retro-2026-06-08 L17.
- **Gmail REFRESH_TOKEN `unauthorized_client`** → RESOLVED S915 (token recovered from Jun-6 backup) + superseded by Resend rail S918. Evidence: STATE.md L51, L103.
- **Backend `/health` + `/api/health` down** → RESOLVED S915 (200 OK confirmed). Evidence: STATE.md L102.
- **Outreach links used Railway URL (0% CTR cause) + HTML-only MIME (spam) + api.finda.sale CORS** → RESOLVED S779/S780. Evidence: monthly-digest-2026-05.md L33-35.
- **`@system.finda.sale` placeholder outreach leak → ImprovMX 500/day flood** → RESOLVED S929 (PLACEHOLDER_DOMAINS fix, 3 seeder files). Evidence: STATE.md L23, L334-335.
- **Sentry-ingest-address corrupted DCE record sending bounces** → RESOLVED S916 (record ARCHIVED). Evidence: STATE.md L49.
- **Competitor domains (estatesales.net/.org) reachable by outreach** → RESOLVED S933 (`BLOCKED_DOMAINS` across all 3 rails). Evidence: STATE.md L262-267.
- **transactionalEmailService had zero suppression** → RESOLVED S933 (suppression check before every Resend call) + suppression present before EVERY send confirmed S937. Evidence: STATE.md L262; system-map L48-58.
- **Bounce → EmailSuppression auto-ingestion (#471)** → RESOLVED (bounceSuppressService.ts daily 06:00 UTC cron, confirmed pre-S926). Evidence: STATE.md L15; system-map "Bounce ingestion."
- **8 of 15 bulk lifecycle Gmail services missing suppression (G3)** → FIXED S937. Evidence: STATE.md L194; system-map G3.
- **outwardEmailAutomationsJob / abandonedSignupEmailService / saleEndingSoonJob ungated + restart-prone cap** → FIXED S912. Evidence: STATE.md L55.
- **June 5 8,317-email blast (no quota cap)** → RESOLVED via DB-backed `checkAndIncrementQuota` HARD_LIMIT 1500/day. Evidence: system-map L29.
- **Inbox bounce backlogs (1,415 / 104 / 77 mailer-daemon msgs)** → cleared S915/S917/S930. Evidence: STATE.md L21, L47, L51.

---

## Cross-references
- Current architecture (code-verified): `feature-notes/email-outreach-scraper-system-map.md`
- Reactivation runbook: `strategy/growth-reactivation-plan-2026-06-05.md` + `strategy/turn-it-back-on-checklist-week-of-2026-06-05.md`
- Cold-outreach build-vs-buy decision: `strategy/cold-outreach-deep-audit-S641.md`
- SES migration plan (NOT executed — no SES rail in code per S937): `operations/ses-migration-plan.md`
- Outreach warmup/bounce thresholds: `strategy/outreach-email-strategy.md` §4.3
- Live Blocked Queue: `STATE.md` ## Blocked Queue (G1/#335)
- Memory notes: `reference_email_rails_and_gates.md`, `reference_dns_infrastructure.md`, `reference_railway_env_propagation.md`, `feedback_gmail_mcp_send_gap.md`

*Built S937 (2026-06-09). READ-ONLY consolidation. No git operations performed.*

---

## S937 Status Settlements (Patrick-confirmed)

- **R-4 RESOLVED — outreach IS active.** Patrick confirmed (S937, 99% certain) that the outreach@finda.sale mailbox is reactivated and sending. The friction-audit-2026-06-08 "reactivation still needed" line is STALE; STATE.md S933 (#335 active, 658 sent) is the correct status. No mailbox action pending. The architectural protections (Resend transactional rail S918, DB-backed Gmail quota cap S937) remain in place.
- **R-2 → escalated to P0 (G1)** after the Resend Log detail (from=find@outreach.finda.sale, "Domain not verified"). Fix dispatched S937: decouple the Resend rail to the verified finda.sale root in code. Verification via email-p0-e2e-test-plan.md next session.
