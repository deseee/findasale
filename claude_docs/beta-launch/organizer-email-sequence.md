# FindA.Sale Beta Organizer Onboarding Email Sequence

**Status:** ✓ LIVE in MailerLite
**Automation ID:** `181389777358030205`
**Automation Name:** FindASale Beta Organizer Welcome
**Trigger:** Subscriber joins "Beta Organizers" group
**Enabled:** Yes
**Created:** 2026-03-08

---

## Sequence Overview

This is a 3-email automation triggered when an organizer joins the Beta Organizers group. Each email is conditional:

- **Email 1** (immediate): Welcome + onboarding CTA
- **Delay 3 days** → check if `sale_published` field is populated
  - If YES: organizer moves to "Published Sale" group (exits sequence)
  - If NO: send Email 2
- **Delay 4 days** (from Email 2) → check again if `sale_published` is populated
  - If YES: organizer moves to "Published Sale" group (exits sequence)
  - If NO: send Email 3

---

## Email Copy

### Email 1: Welcome (Sent Immediately)

**Subject:** Your FindA.Sale beta access is ready😁

**From:** support@finda.sale
**From Name:** FindASale Support
**Reply-To:** support@finda.sale

**Body (Plain Text):**

```
Hey organizer,

You're in. Here's what to do first:

1. Create your sale
2. Add your inventory
3. Share the link with interested buyers

Most organizers get their first sale live in under 10 minutes.

Create your first sale → [CTA: finda.sale/organizer/create-sale]

Questions? Reply to this email.

Patrick
FindA.Sale
```

**Word Count:** ~60 words
**CTA Button:** "Create Your First Sale" → `finda.sale/organizer/create-sale`
**Status in MailerLite:** Designed (HTML + Rich Text)
**Sent:** 1 | Opens: 1 (100%)

---

### Email 2: Day 3 Check-In

**Subject:** Create your first FindA.Sale in 5 minutes

**From:** support@finda.sale
**From Name:** FindASale Support
**Reply-To:** support@finda.sale

**Trigger:** Sent 3 days after Email 1 IF `sale_published` field is empty

**Body (Plain Text):**

```
Quick check-in.

Haven't created your sale yet? Here's the fastest path:

→ Create sale
→ Upload a few items
→ Share the link

If you're stuck, just reply. We'll unblock you.

Pick up where you left off → [CTA button]

Patrick
FindA.Sale
```

**Word Count:** ~55 words
**CTA Button:** "Pick up where you left off" → `finda.sale/organizer/create-sale`
**Status in MailerLite:** Designed (HTML + Rich Text)
**Sent:** 0 | Scheduled (awaiting delay)

---

### Email 3: Day 7 Help / Feedback Request

**Subject:** 5 minutes to make FindA.Sale better?

**From:** support@finda.sale
**From Name:** FindASale Support
**Reply-To:** support@finda.sale

**Trigger:** Sent 4 days after Email 2 IF `sale_published` field is still empty

**Body (Plain Text):**

```
How's your first sale going?

By now you either have your sale live or you're stuck somewhere.

Either way, I want to know. A 15-minute call might help us both.

→ Reply to this email to let me know how it's going
→ Or book a call if you want hands-on help

Patrick
FindA.Sale
```

**Word Count:** ~55 words
**CTA Button:** "Reply to this email" or "Book a call"
**Status in MailerLite:** Designed (HTML + Rich Text)
**Sent:** 0 | Scheduled (awaiting delays)

---

## Automation Logic

```
Subscriber joins "Beta Organizers" group
│
├─→ Email 1: Welcome (immediate)
│   │
│   └─→ Wait 3 days
│       │
│       ├─→ IF sale_published ✓
│       │   └─→ Move to "Published Sale" group (end)
│       │
│       └─→ IF sale_published ✗
│           │
│           ├─→ Email 2: Day 3 Check-In
│           │   │
│           │   └─→ Wait 4 days
│           │       │
│           │       ├─→ IF sale_published ✓
│           │       │   └─→ Move to "Published Sale" group (end)
│           │       │
│           │       └─→ IF sale_published ✗
│           │           └─→ Email 3: Day 7 Feedback Request
```

---

## Custom Fields Used

- **sale_published** (text field, ID: 1163971)
  - When an organizer publishes their first sale, this field should be populated via API/backend
  - Triggers the exit condition

---

## Groups

- **Trigger Group:** Beta Organizers (ID: `181314853593417582`)
  - Current subscribers: 1
  - Open rate: 100%

- **Success Group:** Published Sale (ID: `181390303395055439`)
  - Destination when organizer creates their first sale
  - Exits the onboarding sequence

---

## Current Performance

- **Email 1:** Sent 1, Opened 1 (100%)
- **Email 2:** Not yet sent (awaiting day 3 check)
- **Email 3:** Not yet sent (awaiting day 7 check)

---

## Brand Voice Notes

- Direct, warm, conversational
- Uses "organizer" not "user"
- Focuses on reducing workload, not feature-stacking
- Sign-off from Patrick (founder/CS lead)
- No corporate jargon
- CTAs are action-oriented, not clickbaity

---

## Next Steps

1. **Ensure backend tracking:** When organizer publishes a sale, set the `sale_published` custom field to a truthy value (timestamp, "true", etc.)
2. **Monitor engagement:** Check Email 2 & 3 open/click rates as more organizers onboard
3. **Test the exit condition:** Verify organizers are moved to "Published Sale" group after their first publish
4. **Iterate copy:** After 50+ emails sent, review feedback and adjust tone/CTAs if needed

---

**Last Updated:** 2026-03-09
**Maintained By:** FindA.Sale CS
