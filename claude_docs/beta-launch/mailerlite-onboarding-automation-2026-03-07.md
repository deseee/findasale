# MailerLite Organizer Onboarding Automation — 2026-03-07

**Status:** Ready to implement
**Author:** FindA.Sale Customer Success
**Platform:** MailerLite Automation Builder (current UI — updated 2026-03-07)
**Trigger:** Beta Organizers group membership
**Cost:** Free (MailerLite native automation)

> **UI NOTE:** This spec is written for the current MailerLite drag-and-drop automation builder.
> The old "Classic" MailerLite UI used different terminology (Tags, Custom Event conditions, v1 API).
> None of that applies here. Use this document.

---

## Automation Overview

This automation runs automatically when an organizer is added to the "Beta Organizers" group in MailerLite. It sends a 3-email onboarding sequence over 10 days with an intelligent exit: if the organizer publishes a sale (which causes the backend to set a custom field), remaining emails are skipped.

**Why this works:**
- Organizers who publish sales don't need encouragement emails — they're already active.
- Organizers who don't engage get a gentle check-in and feedback request.
- Zero manual intervention after setup. Patrick's time saved: ~2 hours per cohort.

---

## Email Sequence Specification

### Email 1: Welcome (Sent Immediately)

**Subject Line:** Your FindA.Sale beta access is ready

**From:** Patrick [your-email@findasale.com]

**Body:**

Hi {subscriber.first_name | default: "there"},

Welcome to FindA.Sale. I'm Patrick — I built this for estate sale organizers like you.

You now have full access, completely free during beta. No credit card charged.

Here's what to do right now:

Log in at finda.sale and click "Create Sale." Give it a name—the address and date work great. Takes 90 seconds. Then add 5–10 photos of items and let our AI fill in descriptions and tags. You edit anything you want. Publish when ready.

**You have my direct support:**

If anything feels stuck or unclear, reply to this email or text me at [Your Phone]. I'm reading every message and answering same-day during beta.

**This week's goal:**

Get your first sale published. That's when you'll see the real time-savings.

Looking forward to hearing how it goes.

Patrick
FindA.Sale
[Phone]

---

### Email 2: Day 3 Check-In (Sent 3 Days After Email 1)

**Subject Line:** Create your first sale in 5 minutes

**From:** Patrick [your-email@findasale.com]

**Body:**

Hi {subscriber.first_name | default: "there"},

Quick check-in — did you get a chance to log in yet?

If you have, awesome! I'd love to hear what you're thinking so far.

If not, no worries. Here's how to get your first sale live in 5 minutes.

**Step 1:** Click "Create Sale" on your dashboard. Type the address and date. Save.

**Step 2:** Upload 5–10 item photos. For each, write a quick description: "vintage lamp," "oak dresser," "box of books." Takes 5 minutes total.

**Step 3:** Let AI work. Our system auto-fills category, condition, and a real description. Review and save.

**Step 4:** Hit publish. Copy your sale link and share it.

The AI tagging is the game-changer here—it cuts description writing from 30 minutes per 10 items to about 5 minutes.

Questions? Reply anytime.

Patrick

---

### Email 3: Day 7 Feedback Request (Sent 7 Days After Email 1)

**Subject Line:** 5 minutes to make FindA.Sale better?

**From:** Patrick [your-email@findasale.com]

**Body:**

Hi {subscriber.first_name | default: "there"},

Thanks for being a beta tester. I'd like your feedback on how things are going so far. Just 5 quick questions:

1. How easy was it to create your first sale? (1–10)
2. What did you think of the AI item tagging quality?
3. Have you seen any buyer interest yet?
4. What's one thing you'd change or add?
5. If we charge $X/month after beta, would you use this?

Reply with your answers or call me if you prefer talking it through. Your feedback directly shapes what we build next.

Thanks,

Patrick

---

## Automation Flow

```
[Organizer Joins "Beta Organizers" Group]
           ↓
    [SEND Email 1: Welcome — immediately]
           ↓
    [WAIT 3 days]
           ↓
    [CONDITION: sale_published field Is set?]
    ↙                              ↘
  YES                              NO
  ↓                                ↓
[END — Success]           [SEND Email 2: Check-in]
                                   ↓
                           [WAIT 4 more days]
                                   ↓
                   [CONDITION: sale_published field Is set?]
                   ↙                              ↘
                 YES                              NO
                 ↓                                ↓
            [END — Success]           [SEND Email 3: Feedback]
                                               ↓
                                         [END AUTOMATION]
```

---

## SETUP FOR PATRICK (15 minutes to go live)

---

### Prerequisites

- MailerLite account (you have it)
- The three email texts above
- List of organizer emails ready to add

---

### STEP 1: Create "Beta Organizers" Group

1. In MailerLite, click **Subscribers** (left sidebar)
2. Click the **Groups** tab at the top
3. Click **New group** (top right)
4. Name: `Beta Organizers`
5. Click **Create group**

Done.

---

### STEP 2: Create "sale_published" Custom Field

This replaces the old "Tags" approach. MailerLite's current UI has **Fields**, not Tags.

1. Click **Subscribers** (left sidebar)
2. Click the **Fields** tab at the top
3. Click **Add new field**
4. Field name: `sale_published`
5. Field type: **Text**
6. Click **Save**

This field will be set by the backend when an organizer publishes a sale. The automation checks it before sending Email 2 and Email 3.

---

### STEP 3: Build the Automation Workflow

1. Click **Automations** in the left sidebar
2. Click **New automation** (top right)
3. Choose **Create from scratch**

You'll see a canvas. The left panel shows **Triggers**, **Rules**, and **Actions** tabs.

---

#### Add the Trigger

1. In the left panel, click the **Triggers** tab
2. Find **Joins a group** and drag it onto the canvas
3. In the sidebar that opens, under **Groups**, select **Beta Organizers**
4. Click **Save**

---

#### Add Email 1 — Send Immediately

1. Click the **+** icon below the trigger
2. From the left panel, click the **Actions** tab
3. Choose **Send email**
4. Create the email for this step (MailerLite lets you design it inline):
   - Subject: `Your FindA.Sale beta access is ready`
   - From: your email
   - Body: copy from "Email 1: Welcome" above
   - Use `{subscriber.first_name | default: "there"}` for personalization
5. Click **Save**

---

#### Add Wait — 3 Days

1. Click **+** below Email 1
2. From the left panel, click the **Rules** tab
3. Choose **Delay**
4. Set duration: **3 days**
5. Click **Save**

---

#### Add Condition — Check If Sale Published (Before Email 2)

1. Click **+** below the 3-day wait
2. From the **Rules** tab, choose **Condition**
3. In the condition settings:
   - Category: **Custom fields**
   - Field: `sale_published`
   - Operator: **Is set**
4. Click **Save**

The automation now branches. One path for YES (published), one for NO.

---

#### YES path (sale published → exit)

1. On the condition node, click the **Yes/True** branch output
2. Click **+** on that path
3. From **Actions**, choose **Unsubscribe** → or simply leave it as **End of workflow** (no action needed — the path terminates automatically)

If you want to be explicit, add a **Move to groups** action to move them to a "Published Sale" group for tracking purposes. Optional.

---

#### NO path (not published → send Email 2)

1. On the condition node, click the **No/False** branch output
2. Click **+** on that path
3. From **Actions**, choose **Send email**
4. Create Email 2:
   - Subject: `Create your first sale in 5 minutes`
   - Body: copy from "Email 2: Day 3 Check-In" above
5. Click **Save**

---

#### Add Wait — 4 More Days (Before Email 3)

1. Click **+** below Email 2
2. **Rules** → **Delay**
3. Set duration: **4 days** (total: 7 days from Email 1)
4. Click **Save**

---

#### Add Condition — Check If Sale Published (Before Email 3)

1. Click **+** below the 4-day wait
2. **Rules** → **Condition**
3. Settings:
   - Category: **Custom fields**
   - Field: `sale_published`
   - Operator: **Is set**
4. Click **Save**

---

#### YES path → End

Leave the Yes branch as end of workflow (no action needed).

---

#### NO path → Send Email 3

1. Click **+** on the No/False path
2. **Actions** → **Send email**
3. Create Email 3:
   - Subject: `10 minutes to make FindA.Sale better?`
   - Body: copy from "Email 3: Day 7 Feedback Request" above
4. Click **Save**

The workflow ends after Email 3 naturally.

---

#### Activate

1. At the top of the canvas, name the automation: `Beta Organizer Onboarding`
2. Click **Activate** (top right)

Done. The automation is now live.

---

### STEP 4: Test With Yourself

1. Click **Subscribers** → **Add subscriber**
2. Add your own email and name
3. Under **Groups**, select **Beta Organizers**
4. Click **Save**

You should receive Email 1 within a few minutes. Verify subject, body, and personalization. Once confirmed, you're ready to add real organizers.

---

### STEP 5: Add Organizers

**One at a time:**
1. Subscribers → Add subscriber
2. Enter email + name
3. Assign to **Beta Organizers**
4. Save → Email 1 sends automatically

**Bulk import (CSV):**
1. Subscribers → **Import**
2. Upload CSV with columns: `email`, `first_name`, `last_name`
3. Map fields
4. Assign import to **Beta Organizers** group
5. Import → Email 1 sends to each

---

### STEP 6: Monitor Performance

1. Click **Automations** → select your automation
2. Check the **Analytics** tab for:
   - Subscribers entered
   - Open rates per email
   - Exits (condition = YES — published a sale)
   - Unsubscribes

Weekly targets: Email 1 open rate 70%+, Email 2: 50%+, Email 3: 40%+

---

## Backend Integration — "sale_published" Custom Field

**This is what engineering must implement for the exit condition to work.**

When an organizer publishes a sale, the backend must update their MailerLite subscriber record to set the `sale_published` custom field. The automation checks this field before sending Email 2 and Email 3.

### API Endpoint (MailerLite API v2)

**Base URL:** `https://connect.mailerlite.com/api`

**Auth:** `Authorization: Bearer {MAILERLITE_API_KEY}`

**Step 1 — Find the subscriber ID by email:**

```
GET https://connect.mailerlite.com/api/subscribers/{organizer_email}
```

Returns the subscriber object including `id`.

**Step 2 — Update the custom field:**

```
PUT https://connect.mailerlite.com/api/subscribers/{subscriber_id}

Headers:
  Authorization: Bearer {MAILERLITE_API_KEY}
  Content-Type: application/json

Body:
{
  "fields": {
    "sale_published": "yes"
  }
}
```

**Or in one upsert call (create/update by email):**

```
POST https://connect.mailerlite.com/api/subscribers

Headers:
  Authorization: Bearer {MAILERLITE_API_KEY}
  Content-Type: application/json

Body:
{
  "email": "{organizer_email}",
  "fields": {
    "sale_published": "yes"
  }
}
```

The upsert approach is simpler and preferred — no need to look up subscriber ID first.

### When to fire this

In `packages/backend/src/routes/sales.ts` (or wherever sale status changes to PUBLISHED), add a call to `mailerliteService.markSalePublished(organizer.email)`.

The findasale-dev agent handles this implementation — see work item #4 in next-session-prompt.md.

### Environment variable required

`MAILERLITE_API_KEY` must be set in Railway and in `packages/backend/.env`.
To find it: MailerLite → Integrations → MailerLite API → Copy API key.

---

## Rollback / Pause

1. Automations → select automation
2. Click **Pause** (top right) — does not delete, can be resumed
3. Organizers mid-automation stop receiving emails until resumed

---

## Future Iterations (Post-Beta)

- Day 14 email for organizers who haven't published ("Last check-in")
- Branch on email opens for extra support
- A/B test subject lines on Day 3 and Day 7 emails
- Segment feedback into feature request vs. pricing tracks

---

*Updated 2026-03-07 — Rewritten for current MailerLite UI (drag-and-drop builder, Custom Fields, API v2). Old spec used Tags, Custom Event conditions, and API v1 — none of those exist in current MailerLite.*
