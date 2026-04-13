# Legal Compliance — Executive Summary for Patrick

**Status**: READY FOR BETA (with 5 minor fixes)

---

## The Good News

✅ **ToS & Privacy Policy are in place and comprehensive.** CA1 shipped correctly.

✅ **Checkout consent is properly implemented** — checkbox blocks payment until user agrees.

✅ **Stripe compliance is solid** — fees clearly disclosed, no cardholder data stored.

✅ **Liability is capped appropriately** — marketplace not liable for item quality or disputes beyond our control.

✅ **No legal blockers** — nothing prevents beta launch.

---

## Five Items to Fix Before Beta (Not Hard)

| Issue | Severity | Fix Time | Notes |
|-------|----------|----------|-------|
| Refund/dispute process vague in ToS | MEDIUM | 30 min | Add: "48-hour window, 7-day investigation, clear escalation." |
| Sales tax not mentioned in ToS | MEDIUM | 15 min | Add: "Organizers responsible for tax per their jurisdiction. FindA.Sale doesn't collect." |
| Organizer fulfillment timeline unclear | LOW | 20 min | Add: "24-hour acknowledgment, 30-day pickup window." |
| Stripe KYC requirement not stated clearly | MEDIUM | 20 min | Add: "Organizers must complete KYC before payouts." |
| Data deletion process not documented for support team | MEDIUM | 45 min | Create internal workflow: "When user requests deletion, delete personal data in 30 days, keep transaction records." |

**Total Implementation Time**: ~2 hours for Claude to code + update docs.

---

## One Thing to Do Externally (Attorney Review)

**You need a Michigan business attorney to answer 3 questions:**

1. **"Do I need a permit to run an estate sale in Grand Rapids?"**
   - Impact: If yes, ToS must require organizers to get permits
   - Timeline: 2–3 days for brief opinion
   - Cost: ~$300–500
   - Contact: Kent County Clerk, or hire MI business attorney

2. **"Does FindA.Sale owe sales tax collection obligations in Michigan?"**
   - Impact: May require platform to collect tax on behalf of organizers
   - Timeline: 3–5 days for opinion with cash-flow analysis
   - Cost: ~$500–1000
   - Contact: MI CPA or business attorney

3. **"Does Michigan law require a licensed auctioneer for live bidding on the platform?"**
   - Impact: May require disclaimers or organizer licensing
   - Timeline: Can wait 30 days post-beta; not a blocker
   - Cost: ~$400–700

**Recommendation**: Call Michigan attorney this week. Get answers to Q1 & Q2 before beta. Q3 can wait until post-beta.

---

## The Two-Week Plan

### Week of March 10
- [ ] You: Call Michigan attorney, ask Q1 & Q2
- [ ] Claude: Update ToS/Privacy Policy per recommendations doc
- [ ] Claude: Add data deletion SOP to support KB
- [ ] Patrick: Receive attorney opinion, share with Claude

### Week of March 17
- [ ] Claude: Merge all code + ToS/Privacy changes to main
- [ ] You: Review updated ToS/Privacy before launch
- [ ] You: Send beta invite to 5–10 Grand Rapids organizers
- [ ] Launch beta

---

## If You Don't Fix These Before Beta?

**Risk Level**: MEDIUM (not catastrophic, but risky at scale)

- Organizers won't know they're responsible for sales tax → may sue you if they get a tax bill
- Buyers confused about refund process → increase in support escalations
- No documented data deletion workflow → compliance violation if GDPR user requests deletion
- Stripe KYC requirement unclear → organizers complain they can't get paid

**You'll have to fix it mid-beta anyway**, so better to do it now while you're not on fire with users.

---

## The Bottom Line

**You are legal-ready for 100 beta users in Grand Rapids.** The foundation is solid.

Just:
1. Call an attorney (this week)
2. Update 5 ToS/Privacy sections (1–2 hours of work)
3. Create 1 internal data deletion workflow (30 mins)
4. Deploy

Then launch beta with confidence.

---

## Files You Need to Review

1. **Full audit**: `/claude_docs/beta-launch/legal-compliance-scan-2026-03-06.md`
   - Detailed findings, risk levels, next steps

2. **Code changes**: `/claude_docs/beta-launch/legal-recommendations-for-dev.md`
   - Exact text to add to ToS/Privacy Policy
   - Backend code changes
   - Support team instructions

3. **This file**: `/claude_docs/beta-launch/LEGAL_EXEC_SUMMARY.md`
   - Quick reference (you're reading it now)

---

**Any questions? Reach out. Let's ship this.** — FindA.Sale Legal Agent

