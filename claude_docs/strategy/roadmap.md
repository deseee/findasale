# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-09 (v20 — Session 104 fleet self-audit; 15 new feature pipeline items from pitchman sweep added)
**Status:** Production MVP live at finda.sale. Beta: GO. Full build history: `claude_docs/strategy/COMPLETED_PHASES.md`.

---

## Patrick's Checklist

### Business Formation + Legal
- [ ] Set up support@finda.sale email forwarding
- [ ] Order business cards (~$25) — files in `claude_docs/brand/`
- [ ] Create Google Business Profile for FindA.Sale
- [ ] Open Stripe business account
- [ ] Google Search Console verification
- [ ] Set up Google Voice for support line

### Credentials + Services
- [ ] Rotate Neon database credentials (exposed in git history — precaution)
- [ ] OAuth credentials (Google, Facebook) → Vercel env vars: GOOGLE_CLIENT_ID/SECRET, FACEBOOK_CLIENT_ID/SECRET
- [ ] VAPID keys confirmed in production
- [ ] ⚡ **Sync: Confirm 5%/7% platform fee (pricing analysis complete — Patrick decision pending)**

### Beta Recruitment
- [ ] Identify 5 target beta organizers (`claude_docs/beta-launch/organizer-outreach.md` ready)
- [ ] Schedule 1-on-1 onboarding sessions
- [ ] Hand-hold first 3 sales
- [ ] Collect structured feedback
- [ ] ⚡ **Sync: feedback → Claude for iteration**

---

## Running Automations

8 scheduled tasks active: competitor monitoring, context refresh, context freshness check, UX spots, health scout (weekly), monthly digest, workflow retrospective, weekly Power User sweep. Managed by Cowork Power User agent.

## Connectors

- [x] **Stripe** — query payment data, manage customers, troubleshoot payment issues directly
- [x] **MailerLite** — draft, schedule, and send email campaigns directly from Claude

*CRM deferred — Close requires paid trial. Use spreadsheet/markdown for organizer tracking until beta scale warrants it.*

---

## Feature Pipeline

### Next Up
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 4 | Search by Item Type | 2 sprints | Index items, search UI, result optimization. |

*Recently shipped: AI Sale Description Writer (session 87), Branded Social Templates (session 87), Shopper Loyalty Program (session 88), Code deGR-ification (session 89). See COMPLETED_PHASES.md.*

### Phase 3 — Weeks 8–16
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 5 | Stripe Terminal POS | 2 sprints | In-person checkout. No monthly fees. Works with existing Stripe Connect. |
| 6 | Seller Performance Dashboard | 2 sprints | Analytics, benchmarks, pricing recommendations. |
| 7 | Shopper Referral Rewards | 1–2 sprints | Referral tracking, rewards distribution, email notifications. |
| 8 | Batch Operations Toolkit | 1 sprint | Bulk pricing, status updates, photo uploads. |
| 9 | Payout Transparency Dashboard | 1 sprint | Item-level fee breakdown (item sold → fee → net payout). Builds organizer trust. High ROI. (Pitchman #3) |
| 10 | Serendipity Search | 1 sprint | "Surprise me" — random items with filters (location, price). Drives repeat opens + discovery dopamine loop. (Pitchman #5) |
| 11 | Organizer Referral Reciprocal | 1 sprint | Refer-an-organizer = 3-month fee discount for both parties. Viral growth lever. Extends existing referral program. (Pitchman sweep) |
| 12 | SEO Description Optimization | 0.5 sprints | Update Claude Haiku prompt to bias AI descriptions toward high-intent search terms. Marketing identifies terms. (Pitchman sweep) |

### Phase 4 — Post-16 Weeks
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 13 | Premium Organizer Tier | 2 sprints | Feature gating + billing integration. |
| 14 | Real-Time Status Updates | 1 sprint | Organizer mobile widget, SMS/email alerts. |
| 15 | Shopper Referral Rewards expansion | 1 sprint | Viral growth loop. |
| 16 | Verified Organizer Badge | 1–2 sprints | Professional differentiation, trust signal. |
| 17 | Bid Bot Detector | 1 sprint | Flag suspicious bidding patterns (rapid same-user bids). Human review, not auto-ban. Protects auction integrity. (Pitchman sweep) |
| 18 | Post Performance Analytics | 1 sprint | UTM tracking on social template downloads → "your Instagram post got 200 clicks" in organizer dashboard. (Pitchman sweep) |
| 19 | Passkey / WebAuthn Support | 1–2 sprints | Phishing-resistant auth alongside OAuth. Phase in early before scale. (Pitchman sweep) |
| 20 | Proactive Degradation Mode | 1 sprint | Latency > 2s → auto-drop analytics collection, reduce image quality, preserve core buy/sell flow. (Pitchman sweep) |
| 21 | User Impact Scoring in Sentry | 0.5 sprints | Correlate errors with affected user IDs + transaction value. Prioritize by user damage, not raw error count. (Pitchman sweep) |
| 22 | Low-Bandwidth Mode (PWA) | 1 sprint | Detect slow connections, auto-reduce photo quality, disable video previews. Organizers on job sites often have 2G. (Pitchman sweep) |
| 23 | Unsubscribe-to-Snooze (MailerLite) | 0.5 sprints | Pause emails 30 days instead of full unsubscribe. Preserves seasonal organizers. (Pitchman sweep) |

---

## Agent Task Queue

Proactive tasks assigned to the fleet. Not product features — operational work agents own.

### Pre-Beta (Block on these before first real organizer)
| Task | Agent | Priority | Brief |
|------|-------|----------|-------|
| OAuth Security Red-Team | findasale-hacker | P0 | Red-team state CSRF, redirect_uri hijack, account takeover before OAuth ships |
| Payment Edge-Case QA Pass | findasale-qa | P0 | Run $0.50/$99,999/decimal/refund/chargeback vectors on production payment flow |
| Full-Text Search Migration Rollback Plan | findasale-architect | P0 | Document down() steps + playbook for migration 20260310000001 + last 4 |
| Beta Organizer Email Sequence | findasale-cx | P1 | 3-email triggered sequence (welcome / day-3 nudge / day-7 help) → load via MailerLite MCP |
| Fee Decision Brief | findasale-advisory-board | P1 | Compare 5%/7% vs. alternatives using BUSINESS_PLAN.md; give Patrick something to decide against |

### Beta Support (Run during/after first organizers activate)
| Task | Agent | Priority | Brief |
|------|-------|----------|-------|
| Spring Content Push | findasale-marketing | P1 | "Spring Estate Sales 2026" blog + 3 social posts — peak demand is NOW, publish this week |
| Beta Dry Run | findasale-cx + findasale-ux | P1 | Impersonate first-time organizer through full flow; log every friction point before real users do |
| Support KB Pre-Population | findasale-support | P1 | Draft 10 predictable FAQ entries before beta launches (payouts, cancellation, photos, search) |

### Infrastructure (One-time, pays off indefinitely)
| Task | Agent | Priority | Brief |
|------|-------|----------|-------|
| Bug Blitz Scoping | findasale-qa + health-scout | P0 | Produce prioritized P0/P1/P2 bug list before Session 105 so dev session is pure execution |
| RECOVERY.md Decision Trees | findasale-ops | P1 | Convert 3 main failure scenarios to IF/THEN decision trees; label safe-to-auto vs. needs-Patrick |
| STACK.md Deploy Risk Matrix | findasale-deploy | P1 | Write code-area → risk-level table (payments/auth/schema=HIGH) into STACK.md |
| Connector-Matrix.md | cowork-power-user | P2 | Audit available MCP connectors vs. Phase 3+4 roadmap features; save to `claude_docs/operations/connector-matrix.md` |

---

## Sync Points

| Sync | What's Needed | Status |
|------|---------------|--------|
| ⚡ Confirm 5%/7% fee | Pricing analysis done — Patrick decides | Pending Patrick |
| ⚡ Beta readiness | Patrick's checklist above → first real user | Waiting on Patrick items |
| ⚡ Beta feedback loops | Beta feedback → Claude iterates on features | Pending beta launch |

---

## Deferred & Long-Term Hold

| Feature | Reason | Revisit |
|---------|--------|--------|
| White-label MaaS | Business decision — beta validation first | After beta data |
| Consignment Integration | Thrift store POS — post-beta complexity | After beta data |
| QuickBooks Integration | CSV export covers 80% of need | When organizers ask |
| Video-to-inventory | Vision models can't reliably segment rooms yet | Late 2026+ |
| Multi-metro expansion | Beta validation first | After beta data |
| AR Furniture Preview | Hardware not ready | Long-term R&D |
| BUSINESS_PLAN.md rewrite | Current doc still references Grand Rapids as primary focus; needs update to reflect national open-to-all-organizers positioning and current fee/feature state | After beta data confirms positioning |
| Zero-Downtime Migration Framework | Blue-green migrations for large tables (items, purchases). Critical as data grows past 10k rows. Architect designs; Dev builds helpers. | When table sizes warrant it |
| Canary Deploy + Auto-Rollback | Deploy to Vercel preview + Railway staging first; auto-rollback if smoke tests fail. Enables daily deploys without risk. | After beta stabilizes |
| Audit Automation Library | Codify 8 pre-beta audit paths as reusable tests; run on every deploy. health-scout creates `audit_baseline.json`. | After beta launch |

*Deprecated (won't build): Co-Branded Yard Signs, Multi-Format Marketing Kit.*

---

## Infrastructure

All infra complete. Backend: Railway. DB: Neon (63 migrations applied as of 2026-03-07). Frontend: Vercel (`finda.sale`). Git: `.\push.ps1` replaces `git push`. See `claude_docs/CORE.md` and `claude_docs/STACK.md`.

---

## Maintenance Rules

This document is updated at **every session wrap** when:
- A Patrick checklist item is completed
- A feature ships
- Beta status changes
- A deferred item is activated or cancelled

**Enforcement:** `claude_docs/CORE.md` §15(b) and `claude_docs/SESSION_WRAP_PROTOCOL.md` Step 2.
Roadmap and session-log are always updated in the same commit.
