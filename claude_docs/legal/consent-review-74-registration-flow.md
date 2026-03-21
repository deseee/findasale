# Legal Compliance Review — #74 Role-Aware Registration Consent Flow

**Date:** 2026-03-21
**Reviewer:** FindA.Sale Legal & Compliance Agent
**Feature:** #74 Role-Aware Registration Consent Flow
**Dependencies:** #72 Phase 1 + Phase 2 Complete

---

## Executive Summary

**Overall Risk: YELLOW → GREEN** (with revisions below)

The checkboxes are legally compliant with CAN-SPAM, TCPA, GDPR, and CCPA if implemented as specified. No blockers to ship. Two items require attorney review before beta launch.

---

## Compliance Analysis

### 1. CAN-SPAM & TCPA

**Status: COMPLIANT** (conditions apply)

| Checkbox | Email Type | Basis | Compliance |
|---|---|---|---|
| Organizer sale management alerts | Transactional | Account necessity | ✅ No opt-in legally required |
| Shopper nearby sale alerts | Marketing | Interest-based | ✅ Opt-in explicitly captured |

**Condition:** ORGANIZER checkbox must default to UNCHECKED (best practice even for transactional).

**TCPA:** SMS not collected at signup — TCPA does not apply now. If SMS alerts added later, require separate explicit opt-in.

### 2. GDPR Compliance

**Status: COMPLIANT**

- ✅ Separate checkbox per purpose
- ✅ Unambiguous affirmative action (no pre-ticked boxes)
- ✅ Easy withdrawal via unsubscribe
- ✅ `RoleConsent.marketingOptInAt` timestamp proves consent
- ✅ Privacy Policy covers withdrawal rights

### 3. CCPA Compliance

**Status: COMPLIANT** — unsubscribe rights already present.

---

## Revised Consent Copy (Ready for Dev)

### Organizer Registration:

```
☐ Yes, send me sale management alerts by email
  (item sold, new reservations, payout updates)
```

**Helper text:** "We'll send these alerts whenever a significant event occurs on your sale. You can unsubscribe anytime."

### Shopper Registration:

```
☐ Yes, send me nearby sale alerts and special deals
  (emails about sales near you, new discoveries, flash deals)
```

**Helper text:** "We'll send discovery emails no more than twice per week. You can unsubscribe anytime."

---

## Privacy Policy Additions (Required)

Insert into Privacy Policy Section 2 ("How We Use Your Information"):

```markdown
### Email Communications and Consent

**Transactional Emails (Sale Management Alerts for Organizers)**

Organizers receive event-triggered transactional emails when an item sells, a reservation is made, or a payout is processed. These are necessary to operate your account. Configure in Settings or contact us to adjust.

**Marketing Emails (Discovery & Deal Alerts for Shoppers)**

Shoppers who opt in receive discovery emails (sales near you, flash deals, new features) no more than twice per week. Unsubscribe anytime via the unsubscribe link or Settings. We retain opt-outs for at least one year.

**Email Withdrawal**

Withdraw consent at any time without penalty. Contact support@finda.sale or use the unsubscribe link in any email.
```

---

## Implementation Checklist

- [ ] `register.tsx`: Add role-conditional checkboxes, unchecked by default, using revised copy
- [ ] `authController.ts`: Capture `marketingOptInAt = now()` if checked; null if unchecked
- [ ] `emailService.ts`: Respect `marketingOptInAt` and `emailOptOut` flags before sending non-transactional emails
- [ ] Admin API: Add endpoint to export `RoleConsent` table for GDPR/CCPA requests
- [ ] Privacy Policy: Add "Email Consent & Frequency" section

---

## Attorney Review Items (Before Beta Launch)

| Priority | Item |
|---|---|
| 🔴 HIGH | Verify Resend/MailerLite ToS permits your consent approach and honors opt-outs |
| 🔴 HIGH | Confirm Michigan + California email law compliance (state laws beyond CAN-SPAM) |

---

## Clear to Ship?

**YES** — Proceed with development using revised copy. Attorney sign-off on two HIGH items strongly recommended before beta launch but not blocking dev.

**Risk Level After Mitigation:** GREEN

---

**Report prepared by:** FindA.Sale Legal & Compliance Agent  
**Date:** 2026-03-21  
**Status:** Ready for development dispatch
