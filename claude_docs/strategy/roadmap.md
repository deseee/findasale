# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-06 (v15 — Lean restructure. Beta status: GO. Maintenance rules added.)
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

## Path CD — Active Sprint + Deferred

### Next Sprint
| Feature | Status | Notes |
|---------|--------|-------|
| AI Sale Description Writer | ⬜ Ready to build | 80% infra exists in `cloudAIService.ts`. Highest-ROI next feature. |
| Branded Social Templates | ⬜ Ready to build | Auto-generate shareable sale images for organizers. |

### Deferred (Post-Beta)
| Feature | Reason |
|---------|--------|
| White-label MaaS | Business decision — Grand Rapids validation first |
| Consignment Integration | Thrift store POS — post-beta complexity |
| AR Furniture Preview | Hardware not ready — long-term R&D |

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
| Video-to-inventory | Vision models can't reliably segment rooms yet | Late 2026+ |
| Multi-metro expansion | Grand Rapids validation first | After beta data |

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
