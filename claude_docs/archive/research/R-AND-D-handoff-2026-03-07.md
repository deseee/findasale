# R&D Handoff Summary — March 7, 2026
**Research Period:** 2026-03-07
**Topics:** Zapier MCP for onboarding automation + SEO tooling strategy
**Deliverables:** 2 detailed research memos + this summary

---

## Topic 1: Zapier MCP for Organizer Onboarding — DEFER

**Question:** Should FindA.Sale connect Zapier MCP to automate organizer onboarding?

**Finding:** Zapier MCP adds unnecessary complexity and cost. MailerLite's native automation engine (already connected, included free) solves the onboarding problem in 15 minutes with zero additional cost.

**Recommendation:**
- **Immediate (Pre-Beta):** Build onboarding workflow in MailerLite Automations (welcome email → 2-day delay → checklist email → 5-day delay → launch announcement). Setup: 15 minutes, cost: $0.
- **Post-Beta (Q2 2026):** Only revisit Zapier MCP if workflow requirements expand beyond email (multi-channel outreach, HubSpot CRM sync, Asana ticket creation).

**Why Zapier Is Overkill Now:**
- MailerLite automation already covers email + list segmentation
- Zapier free tier = 50 MCP calls/month = 1–2 organizers/month (too low for beta)
- Pro plan ($19–29/month) adds cost for marginal gain
- Introduces another SaaS vendor to manage

**Viable Later:** If organizer onboarding scales to 100+/month and requires CRM/ticketing sync, Zapier becomes cost-effective (Pro plan ~$25/month for 500+ tasks/month).

**File:** `/claude_docs/research/tech-eval-zapier-mcp-2026-03-07.md`

---

## Topic 2: SEO Tooling Strategy — DEFER, BUT IMPLEMENT GSC MCP NOW

**Question:** Should FindA.Sale connect Ahrefs (or equivalent) SEO tool now or post-beta?

**Finding:** Premium SEO tools (Ahrefs $129/month, Semrush $120/month) are premature on a 3-month-old domain with unknown organic search potential. Instead, implement Google Search Console MCP immediately (free) to establish baseline metrics. Post-beta, if GSC data shows >5% organic traffic, upgrade to Ahrefs Lite.

**Recommendation:**
- **Immediate (This Week):** Connect Google Search Console MCP to Claude Code. Verify finda.sale is indexable. Collect baseline organic search queries and ranking data. Setup: 20 minutes, cost: $0.
- **During Beta:** Monitor organic search growth via GSC + GA4. Let real user behavior inform SEO strategy.
- **Post-Beta (May 2026):** If organic traffic >5% of total, propose Ahrefs Lite ($129/month). If <1%, defer SEO tooling and focus growth on paid/email/social.

**Why Ahrefs Is Not Ready Now:**
- New domain has near-zero organic traffic (3 months old, just went live)
- Ahrefs Lite plan is $129/month minimum (expensive for unvalidated channel)
- Keyword research tools are "nice to have" when you have no organic traffic to analyze
- GSC provides actual data (your domain's search performance); Ahrefs provides estimates (competitors)
- Better to first understand what people are already searching for when they find finda.sale

**Viable Later:** After 3 months of live beta data, if GSC shows 50+ relevant organic queries/month landing on site, Ahrefs keyword research becomes actionable (validates that SEO is a viable growth lever; informs content roadmap).

**Free Alternative to Premium Tools:** Google Analytics 4 + Google Search Console MCP provide 80% of the insight for 0% of the cost. Don't pay for competitive analysis until organic search is a proven channel.

**File:** `/claude_docs/research/tech-eval-seo-tooling-2026-03-07.md`

---

## Summary Decision Table

| Topic | Recommendation | Immediate Action | Timeline | Cost |
|-------|-----------------|------------------|----------|------|
| **Zapier MCP** | Defer | Build MailerLite automation instead | Pre-beta | $0 |
| **Ahrefs/SEO Tools** | Defer | Connect GSC MCP | This week | $0 |

---

## Immediate Next Steps (For Patrick)

1. **Confirm MailerLite automation approach** for organizer onboarding is acceptable.
   - If yes: I will create MailerLite workflow (15-min task).
   - If no: Clarify what multi-channel capability is needed (ticketing, CRM, Slack, etc.).

2. **Confirm GSC MCP setup is approved** for baseline SEO metrics.
   - If yes: I will install MCP, authenticate, and run first report.
   - If no: Clarify what SEO visibility you'd prefer (or defer entirely to post-beta).

3. **Schedule post-beta SEO review** for May 2026 (optional).
   - Propose date/format to assess organic search growth and decide Ahrefs investment.

---

## Context for Future Reference

- **Zapier MCP:** Available in Anthropic's registry; 8,000+ integrations; 30,000+ actions. Best used for multi-system orchestration (not email-only workflows).
- **Ahrefs MCP:** Available (official server on GitHub); includes keyword research, backlink analysis, rank tracking, content gaps. Pricing: $129–$1,499/month depending on tier.
- **Semrush MCP:** Available (official server); broader feature set (PPC + SEO). Pricing: $120–$499/month.
- **Google Search Console MCP:** Available (open-source implementations); free; data specific to your domain. Best for understanding actual organic search performance.
- **MailerLite:** Already connected. Native automations cover email workflows (welcome, sequences, segmentation). No SEO or multi-channel capabilities.

---

**Research Completed:** 2026-03-07
**Ready for Review:** Yes
**Questions?** Refer to individual memo files for detailed findings, cost breakdowns, and integration instructions.

