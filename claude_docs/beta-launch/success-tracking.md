# Beta Success Tracking Framework

---

## Part 1: Success Milestones Definition

### Milestone 1: Published a Sale
**What it means:** Organizer created a sale listing with at least one sale item and clicked "Publish" or "Go Live".
**Why it matters:** Publishing signals the organizer got past setup friction and believes the platform is worth using.
**How to measure:**
- Check database: `sales.status = 'published' AND sales.organizerId = [organizer_id]`
- Or check organizer dashboard: look for sale with status badge "Published" or "Live"

**Expected timing:** Within 3 days of registration for engaged organizers.

---

### Milestone 2: Added 10+ Items
**What it means:** Organizer uploaded and saved 10 or more items across any sale(s).
**Why it matters:** 10+ items creates enough inventory depth to attract browsers. Below 10, sales feel sparse.
**How to measure:**
- Check database: `COUNT(items WHERE organizerId = [organizer_id]) >= 10`
- Or check organizer dashboard: Insights > Total Items Ever, or specific sale detail > Item Count

**Expected timing:** Within 7 days of first sale published (if organizer is engaged).

---

### Milestone 3: Had 1+ Buyer Interaction
**What it means:** Organizer received at least one of the following from a unique buyer:
- 1 message inquiry about an item
- 1 purchase/order
- 1 bid (if auction feature active)

**Why it matters:** This is the "money moment" — proves the platform is generating buyer engagement, which is the core value prop.
**How to measure:**
- Check database: `COUNT(messages WHERE receiverId = [organizer_id] AND senderRole = 'SHOPPER') >= 1` OR `COUNT(orders WHERE organizerId = [organizer_id]) >= 1` OR `COUNT(bids WHERE itemOwnerId = [organizer_id]) >= 1`
- Or check organizer dashboard: Messages inbox has > 0 unread, or Orders tab shows sales, or Insights page shows buyer activity

**Expected timing:** Within 14 days of first sale published (varies by sale timing and visibility).

---

## Part 2: Weekly Check-In Template

Run this checklist every Monday. It takes 15–20 minutes.

### Step 1: Load the Beta Organizer List
Open `beta-status.md`. You'll reference it throughout.

### Step 2: Check Last Active Dates (RED Alert)
For each organizer:
- [ ] Open their user dashboard in admin panel (or check database: `users.lastLoginAt`)
- [ ] If `lastLoginAt` is > 3 days ago AND they're still in first week of registration → Mark RED
- [ ] Log the date in beta-status.md
- **Action:** Send reengagement email from onboarding-emails.md, or make a phone call if RED for > 48 hours

### Step 3: Check Milestone Progress (YELLOW Alert)
For each organizer registered 7+ days:
- [ ] Verify: Have they published a sale? (Milestone 1)
  - [ ] If NO → They're YELLOW. Send help email from onboarding-emails.md.
- [ ] Verify: If published, did they add 10+ items? (Milestone 2)
  - [ ] If NO → They're YELLOW. Send item collection help email.
- [ ] Verify: Did they get any buyer interaction? (Milestone 3)
  - [ ] If NO → They're YELLOW. Check: is the sale published? Is it visible? Is it just timing?

### Step 4: Identify GREEN Organizers (Celebration Trigger)
For each organizer:
- [ ] Have all 3 milestones been hit? (Check "First Buyer Interaction" date in beta-status.md)
- [ ] If YES and you haven't sent milestone celebration email yet → Send it from onboarding-emails.md
- [ ] Update "Health" column to GREEN and log celebration email sent in Notes

### Step 5: Scan for Churn Risk
For YELLOW organizers:
- [ ] How long have they been YELLOW? (days since Milestone 1 or 2 incomplete)
  - If 14+ days with no progress → Mark as "At Risk of Churn" in Notes
  - Plan: Make a phone call this week, or schedule a walkthrough
- [ ] For RED organizers:
  - If 7+ days with no login → Escalate to "Inactive" status
  - Plan: Follow-up email, then mark "Churned" if no response in 7 more days

### Step 6: Collect and Triage Feedback
- [ ] Check organizer Notes column — any feedback collected since last week?
- [ ] Check email (if organizers reply to outreach emails) — any feedback or issues mentioned?
- [ ] For each piece of feedback, triage per **Feedback Triage Rules** (see Part 3)
  - Log triage decision in notes and create appropriate ticket

### Step 7: Update beta-status.md
- [ ] Update "Last Active" for each organizer (use database or admin panel)
- [ ] Update milestone completion dates if any new milestones hit
- [ ] Recalculate Health (GREEN/YELLOW/RED)
- [ ] Add notes for all actions taken this week

---

## Part 3: Organizer Health Decision Criteria

### When to Offer Extra Help (YELLOW → Engaged)
- Organizer registered 3+ days ago but hasn't published
- Organizer published but hasn't hit 10 items yet
- Organizer hit milestones 1 & 2 but no buyer interaction after 10 days (might be a visibility issue, not an engagement issue)

**Action:**
- Send appropriate help email from onboarding-emails.md (reengagement, item help, or visibility help)
- Offer a phone call or screen share
- Log outreach in beta-status.md Notes

---

### When to Consider Organizer Churned (RED → Gone)
- No login > 7 days post-registration, and no response to reengagement email
- Explicitly said "not interested" or "too confusing" in reply to outreach
- Account shows error on login (inactive email, etc.)

**Action:**
- Mark as "Churned" in beta-status.md
- Log reason in Notes (silence, explicit rejection, technical blocker)
- **Do not delete account.** Keep in system for post-mortem analysis (why did they churn?)
- Use churned organizers data to improve future waves

---

### When to Invite More Organizers (Cohort Health)
Check this every 2 weeks:
- [ ] Count: How many organizers are GREEN? Target: 60%+
- [ ] Count: How many are YELLOW? Target: 20–30% (engaged but need help)
- [ ] Count: How many are RED or Churned? Target: 10%–20%

**If cohort is healthy (60%+ GREEN):**
- Invite next wave of 5 organizers from outreach list

**If cohort is struggling (<40% GREEN):**
- Pause new invites
- Focus on supporting YELLOW organizers to convert to GREEN
- Investigate: What's the #1 drop-off reason? (Unclear UI? Missing feature? Bad timing?)

---

## Part 4: Feedback Triage Rules

When organizers provide feedback (via email reply, support message, or notes), triage it immediately.

### Rule 1: Bug Reports
**Identifier:** "Feature X doesn't work", "I got an error", "The app crashed"

**Triage to:** QA / Dev Team (create GitHub issue or internal bug ticket)

**Ticket format:**
```
Title: [Bug] {Feature Name} — {Symptom}
Description: Organizer {Name} reported: {exact quote}
Organizer: {Name} ({Email})
Severity: User-blocking / Minor
Expected: {what should happen}
Actual: {what happened}
Steps to reproduce: {if known}
```

**Follow-up:** Reply to organizer with "Thanks, we logged this. ETA fix: [day]" (or link to ticket if public)

---

### Rule 2: UX Friction
**Identifier:** "It was confusing to...", "I couldn't figure out how to...", "The button is hard to find"

**Triage to:** UX Agent (create design review ticket)

**Ticket format:**
```
Title: [UX] {Feature} — {Friction Point}
Description: Organizer {Name} reported: {exact quote}
Context: Happened during {specific action}
Organizer: {Name} ({Email})
User impact: Slows down {task}, blocks {goal}
Suggested fix (if organizer offered one): {idea}
```

**Follow-up:** Reply with "Thanks for the feedback. This is exactly what helps us prioritize." No need for ETA; UX is async.

---

### Rule 3: Feature Requests
**Identifier:** "Would be nice if...", "What if you could...", "I wish it did X"

**Triage to:** R&D / Product (add to feature backlog or roadmap)

**Ticket format:**
```
Title: [Feature Request] {Feature Name}
Description: Organizer {Name} requested: {exact quote}
Problem it solves: {why organizer wants this}
Organizer: {Name} ({Email})
Priority: Low (feature request) unless organizer is critical path (GREEN, high-volume)
```

**Follow-up:** Reply with "Great idea! We're tracking this for future builds." No commitment on timeline.

---

### Rule 4: Positive Signals / Testimonials
**Identifier:** "Love that...", "This saved me...", "My buyers loved it", "Way faster than before"

**Triage to:** Marketing / Growth (convert to testimonial or case study)

**Action:**
- Reply asking: "Would you be willing to share a short testimonial about [specific feature]?"
- If yes → Collect full quote and photo (headshot + sale photo)
- If yes → Add to testimonials file (or Notion, or wherever you store them)
- Use in website copy, cold outreach, social media

**Example response:**
```
Hi {Name},

That's exactly what we built this for! Would you be okay with me sharing your comment with other organizers? We'd love to feature your feedback on our site.

If you're open to it, could you give us:
- A 1-2 sentence quote about what you love
- A photo of you (or your sale) we could use

Thanks!
```

---

### Rule 5: Support Questions (Not Feedback)
**Identifier:** "How do I...?", "Where is the X button?", "Can I do Y?"

**Triage to:** Self (Patrick answers directly)

**Action:**
- Reply immediately with clear step-by-step answer
- Log common questions and turn into FAQ or `/guide` improvement
- If >2 organizers ask same question → Escalate to UX (means docs are unclear)

---

## Part 5: Feedback Log Template

Keep a simple spreadsheet or document to track all feedback. Update weekly.

| Date | Organizer | Channel | Feedback | Type | Triage | Ticket # | Status |
|---|---|---|---|---|---|---|---|
| 2026-03-05 | Organizer 4 | Email Reply | "Loving the AI tagging, saved me hours" | Positive | Marketing | N/A | Feature in testimonials |
| 2026-03-05 | Organizer 2 | Phone Call | "The item upload button is hard to find on mobile" | UX Friction | UX Team | UX-142 | Backlog |
| 2026-03-06 | Organizer 1 | Email Reply | "App crashed when I tried to edit a sale" | Bug | Dev | BUG-58 | In Review |
| 2026-03-06 | Organizer 3 | Message | "Would love batch edit for descriptions" | Feature Request | R&D | FR-12 | Roadmap |

---

## Part 6: Template — Weekly Success Report

Run this after your check-in. Share with team:

**BETA COHORT STATUS — Week of [Date]**

**Health Summary:**
- GREEN (all 3 milestones): X organizers
- YELLOW (registered, incomplete): X organizers
- RED (no activity): X organizers
- Churned: X organizers

**This Week:**
- Milestone celebrations sent: X
- Help emails sent: X
- Reengagement calls made: X
- Bugs triaged: X
- Feature requests: X

**Next Week Priorities:**
1. [Specific action for RED organizer]
2. [Specific action for YELLOW organizer]
3. [Specific bug or UX fix to monitor]

**Cohort Health Trend:**
[GREEN % is up/down; YELLOW engagement improving/slipping; any concerning patterns?]

---

## Part 7: Churn Exit Survey (Optional)

If organizer explicitly churns (marks account inactive, says "not for us", or 14+ days silent after reengagement), send a short exit survey before you lose them:

**Subject:** One quick question before you go

---

Hi [Name],

I notice you're winding down with FindA.Sale. No judgment at all — I'd just like to understand why so we can improve for the next group of organizers.

Could you pick the #1 reason below?

- [ ] It was too confusing to set up
- [ ] I didn't have time to list my items
- [ ] The platform didn't get enough buyer traffic
- [ ] I didn't need it after all
- [ ] Found a tool I prefer
- [ ] Other: ____________

If you pick "other," I'd love to hear a bit more.

Thanks either way. If you ever want to try again, just reach out.

[Your name]

---

*(Note: This is optional. Use if you want to gather post-mortem data. Most of the time, silence is the data — it means the activation step was too hard.)*
