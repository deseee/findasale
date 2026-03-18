# FindA.Sale Beta Launch Checklist
*Created: 2026-03-06 (Session 82)*

Use this before opening beta access to Grand Rapids organizers.
Track completion in each section. Patrick owns ⚡ items; Claude owns 🤖 items.

---

## ✅ Infrastructure (All Complete)

| Item | Status | Notes |
|------|--------|-------|
| Railway backend deploy | ✅ | `backend-production-153c9.up.railway.app` |
| Neon PostgreSQL | ✅ | All 35 migrations applied |
| Vercel frontend | ✅ | Auto-deploys from main |
| Sentry error tracking | ✅ | DSNs in Railway + Vercel |
| UptimeRobot monitoring | ✅ | Patrick confirmed 2026-03-05 |
| Stripe webhooks | ✅ | `STRIPE_WEBHOOK_SECRET` set in Railway |
| OAuth (Google + Facebook) | ✅ | Env vars confirmed in Vercel |
| Support email | ✅ | support@finda.sale forwarding active |

---

## ✅ Code & Feature Completeness

| Feature | Status |
|---------|--------|
| Sale creation + management | ✅ |
| Item add / AI tagging | ✅ |
| Shopper browse / search / map | ✅ |
| Checkout + Stripe payments | ✅ |
| Organizer payouts (Stripe Connect) | ✅ |
| OAuth social login | ✅ |
| Push + email notifications | ✅ |
| Follow organizer | ✅ (Session 81) |
| Messaging (shopper ↔ organizer) | ✅ |
| Reviews + ratings | ✅ |
| Auction bidding (live + proxy) | ✅ |
| Flash deals | ✅ |
| Treasure hunt / live drop | ✅ |
| Streak challenges + Hunt Pass | ✅ (Session 81) |
| AI Discovery Feed | ✅ |
| Visual search | ✅ |
| Dynamic pricing suggestions | ✅ (DB comps, Session 82) |
| Virtual sale tours | ✅ (Session 82) |
| Leaderboard | ✅ |
| Neighborhood landing pages | ✅ |
| QR codes | ✅ |
| Print inventory | ✅ |
| Organizer insights | ✅ |
| ToS + Privacy Policy | ✅ |

---

## ⚡ Patrick — Pre-Beta (Blocking)

| Item | Status | Action |
|------|--------|--------|
| Confirm 5% / 7% fee decision | ⬜ Pending | Review `claude_docs/research/CC3-pricing-analysis.md` |
| Stripe business account | ⬜ Pending | finda.sale business entity |
| Google Search Console | ⬜ Pending | Verify finda.sale ownership |
| Business cards | ⬜ Pending | Use `claude_docs/brand/business-card-front/back.png` → Vistaprint |
| Beta organizer recruitment | ⬜ Pending | Target 5–10 Grand Rapids estate sale companies |
| CA7 guide review | ⬜ Pending | Review `/guide` + `/faq` pages before sharing with beta users |

---

## ⚡ Patrick — Nice to Have Before Beta

| Item | Notes |
|------|-------|
| Google Business Profile | Helps local SEO in Grand Rapids |
| Google Voice number | Dedicated support line |
| P4 beta feedback loop | Set up how you'll collect organizer feedback (Slack, email, etc.) |

---

## 🤖 Claude — Remaining Code Work (Non-Blocking)

| Item | Priority | Notes |
|------|----------|-------|
| Admin `findMany` pagination | ✅ DONE | All 5 findMany already have `take:` limits — verified clean |
| `.env.example` drift fix | ✅ DONE | Ollama vars removed, cloud AI vars added (session 82) |
| `buyingPool` user select cleanup | ✅ DONE | `include: { user: { select: {email,name} } }` (session 82) |
| Beta invite flow (admin + register + auth) | ✅ DONE | Admin routes wired, register.tsx ?invite= param + field, authController validates + redeems (session 82) |
| CD2 Phase 4 features | Post-beta | Reverse auction enhancements, Group buying, AR preview |

---

## 🚀 Go/No-Go Gate

Before flipping the beta switch:

- [ ] Patrick confirms fee structure
- [ ] At least 1 test sale published end-to-end on production
- [ ] At least 1 test purchase completed on production
- [ ] Stripe payout tested (even $1 to Patrick's own account)
- [ ] Support email tested (send to support@finda.sale, confirm receipt)
- [ ] Beta invite emails drafted and ready
- [ ] `push.ps1` health check: clean push with no errors

---

## Beta Feedback Loop

Once beta users are active:
1. Check Railway logs daily for errors
2. Check Sentry weekly for new issues
3. Weekly email digest to Patrick via the `organizer-weekly-digest` scheduled task
4. Bi-weekly workflow review (1st + 15th at 9AM) via `workflow-review` scheduled task
5. Session with Claude every 1–2 weeks to address feedback and ship fixes

---

*This document is owned by Claude. Update as items are completed.*
*Reference: `claude_docs/STATE.md` for current project state.*
