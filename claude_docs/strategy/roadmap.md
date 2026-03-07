# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-07 (v17 — Phase 2 features 1+2 shipped in session 87)
**Status:** Production MVP live at finda.sale. Beta: GO. All phases + CA/CB/CC/CD complete. Full history: `claude_docs/strategy/COMPLETED_PHASES.md`.

---

## Parallel Path Architecture

5 tracks run concurrently. Sync points defined below.

**P — Patrick (Human):** Beta recruitment, API keys, branding decisions, Stripe setup, real-world partnerships.
**CA — Claude: Production Readiness:** ✅ All tasks complete. See COMPLETED_PHASES.md.
**CB — Claude: AI Image Processing:** ✅ All tasks complete. See COMPLETED_PHASES.md.
**CC — Claude: Business Intel & Content:** Ongoing scheduled intelligence tasks.
**CD — Claude: Innovation & Experience:** Active sprint + deferred items below.

---

## Path P — Patrick (Active Items Only)

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
- [ ] ⚡ **Sync: Confirm 5%/7% platform fee (CC3 analysis complete — Patrick decision pending)**

### P4: Beta Recruitment
- [ ] Identify 5 target beta organizers (`claude_docs/beta-launch/organizer-outreach.md` ready)
- [ ] Schedule 1-on-1 onboarding sessions
- [ ] Hand-hold first 3 sales
- [ ] Collect structured feedback
- [ ] ⚡ **Sync: feedback → Claude for iteration**

---

## Path CC — Ongoing

### CC4: Automated Intelligence (running)
7 scheduled tasks: competitor monitoring, industry intel, changelog scanning, UX spots, health scout (weekly), monthly digest, workflow retrospective.

---

## Path CD — Feature Pipeline

### Phase 2 — Post-Beta Stabilization (Next 6–8 Weeks)
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 1 | ✅ AI Sale Description Writer | done | Shipped session 87 (commit 7b1b71d). generateSaleDescription() + ✨ button on create/edit sale. |
| 2 | ✅ Branded Social Templates | done | Shipped session 87 (commit 982dd6e). Route wired, dashboard integrated, code quality fixed. |
| 3 | Shopper Loyalty Program | 1 sprint | Thank-you coupons, coupon tracking, email integration. |
| 4 | Search by Item Type | 2 sprints | Index items, search UI, result optimization. |

### Phase 3 — Weeks 8–16
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 5 | Stripe Terminal POS | 2 sprints | In-person checkout. No monthly fees. Works with existing Stripe Connect. |
| 6 | Seller Performance Dashboard | 2 sprints | Analytics, benchmarks, pricing recommendations. |
| 7 | Shopper Referral Rewards | 1–2 sprints | Referral tracking, rewards distribution, email notifications. |
| 8 | Batch Operations Toolkit | 1 sprint | Bulk pricing, status updates, photo uploads. |

### Phase 4 — Post-16 Weeks
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 9 | Premium Organizer Tier | 2 sprints | Feature gating + billing integration. |
| 10 | Real-Time Status Updates | 1 sprint | Organizer mobile widget, SMS/email alerts. |
| 11 | Shopper Referral Rewards expansion | 1 sprint | Viral growth loop. |
| 12 | Verified Organizer Badge | 1–2 sprints | Professional differentiation, trust signal. |

### Deprecated / Deferred Indefinitely
| Feature | Reason |
|---------|--------|
| White-label MaaS | Business decision — beta validation first |
| Consignment Integration | Thrift store POS — post-beta complexity |
| AR Furniture Preview | Hardware not ready — long-term R&D |
| Co-Branded Yard Signs | High operational overhead; low revenue; deprecated per research |
| QuickBooks Integration | CSV export covers 80% of need; defer until organizer demand |
| Multi-Format Marketing Kit | Current PDF implementation sufficient |

---

## Active Sync Points

| Sync | What Converges | Status |
|------|----------------|--------|
| ⚡ Confirm 5%/7% fee | CC3 analysis → Patrick decides | Pending Patrick |
| ⚡ Beta readiness | All paths green → first real user | Waiting on P items above |
| ⚡ Beta feedback loops | P4 feedback → Claude iterates | Pending beta launch |

---

## Long-Term Hold

| Item | Reason | Revisit |
|------|--------|---------|
| Video-to-inventory | Vision models can’t reliably segment rooms yet | Late 2026+ |
| Multi-metro expansion | Beta validation first | After beta data |

---

## Infrastructure

All infra complete. Backend: Railway. DB: Neon (35 migrations applied 2026-03-06). Frontend: Vercel (`finda.sale`). Git: `.\push.ps1` replaces `git push`. See `claude_docs/CORE.md` and `claude_docs/STACK.md`.

---

## Maintenance Rules

This document is updated at **every session wrap** when:
- A P-path item is completed by Patrick
- A CD sprint feature ships
- Beta status changes
- A deferred item is activated or cancelled

**Enforcement:** `claude_docs/CORE.md` §15(b) and `claude_docs/SESSION_WRAP_PROTOCOL.md` Step 2.
Roadmap and session-log are always updated in the same commit.
