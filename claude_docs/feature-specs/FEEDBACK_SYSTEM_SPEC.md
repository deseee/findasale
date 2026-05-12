# In-App Feedback System Specification

**Author:** UX & Product Design
**Date:** 2026-04-05
**Status:** Ready for Dev Handoff
**Phase:** Replace floating widget (S397+)

---

## Executive Summary

Replace the floating feedback button with a more integrated, non-intrusive system:
1. **Static menu item** — Always accessible in Settings (organizers/shoppers both)
2. **Event-triggered micro-surveys** — Fire after meaningful user actions (1–2 questions max)
3. **Smart suppression** — "Don't ask again" option on every modal, cooldown periods, frequency caps

This spec avoids the modal z-index/overlay issues FindA.Sale has had before by using a portal-based architecture. The system respects user tier, role, and frequency tolerance.

---

## Current State

### Existing Widget (FeedbackWidget.tsx)
- **Location:** Floating button (bottom-right, z-40)
- **Behavior:** Opens on-demand modal with 5-star rating + optional text
- **Data:** Posts to `/api/feedback` with rating, text, page, userAgent
- **Schema:** `Feedback { id, userId?, rating (1-5), text?, page?, userAgent?, createdAt }`
- **Issues:** Looks "beta", competes with FAB buttons, always visible

### Backend Status
- Endpoints exist and work: `POST /api/feedback`, `GET /api/feedback`, `GET /api/feedback/stats`
- Admin dashboard can view all feedback (no changes needed)
- No "don't ask again" or suppression tracking yet

---

## System Architecture

### 1. Static Menu Item (Always Available)

**Location & Access:**
- **Organizers:** Settings menu → "Send Feedback" (same level as other support links)
- **Shoppers:** Settings menu → "Send Feedback" (same level as other support links)
- **Admin:** Existing `/api/feedback` dashboard remains unchanged

**User Journey:**
```
User opens Settings
  → Scrolls to "Help & Support" section
  → Taps "Send Feedback"
  → Opens full feedback form in modal
  → Can submit anytime (no frequency cap here — they're explicitly asking)
```

**Form Design:**
- **Title:** "Help us improve" (plain English)
- **Question 1:** "How would you rate your experience?" (5-star rating, required)
- **Question 2:** "Any thoughts to share?" (text area, optional, max 500 chars)
- **Tone:** Warm, grateful. Emphasize that feedback directly shapes the roadmap.
- **Submit:** "Send Feedback" button (always enabled if rating is selected)
- **Close:** X button or "Not now" button — both just dismiss
- **Success state:** Checkmark + "Thanks! We're reading every submission" + auto-close after 2s

**Modal Behavior:**
- Render as portal (body-level, not inside page container) to avoid z-index hell
- Overlay = dark-40, modal = white/dark-adaptive with 4px shadow
- Mobile-first: slides up from bottom on mobile, centers on desktop
- Proper focus trap: trap focus inside modal when open, return focus on close
- ESC key closes it

---

### 2. Event-Triggered Micro-Surveys

Surveys fire AFTER a meaningful action completes. They're **contextual** (ask about what just happened) and **non-intrusive** (small modal, easy to dismiss).

#### Design Constants
- **Questions per survey:** 1–2 (max)
- **Always included:** "Don't ask again" checkbox (with explainer: "We'll stop showing this survey")
- **Frequency cap:** Max 1 survey per session, 1 per user per day
- **Cooldown:** 30 minutes between surveys for the same user
- **Portal rendering:** Body-level to avoid z-index conflicts
- **Auto-dismiss:** If user ignores for 10 seconds, survey fades and auto-dismisses (low friction)

#### Survey List (by Role & Trigger Moment)

All surveys fire only if:
- User is authenticated (not anonymous)
- User hasn't checked "don't ask again" for this survey
- No other survey is showing in this session
- 30 minutes have passed since the last survey

---

## ORGANIZER SURVEYS

### OG-1: First Sale Published
**Trigger:** User publishes their first sale (status DRAFT → PUBLISHED)
**Audience:** Organizers only (detected via `user.roles.includes('ORGANIZER')`)
**Frequency:** Once ever (not per sale — use a `firstSalePublished` flag in User model)
**Survey:**
```
Title: "Your first sale is live!"
Question: "How confident do you feel about the photos?"
Options:  Struggling  |  Okay  |  Great  (3-button quick rating)
Subtext:  "(Your answer helps us prioritize features)"
```

**Why this moment?** Users have just completed their biggest friction point (adding items + publishing). Photo quality is the #1 determinant of sale success. Asking now captures immediate experience.

**Job-to-be-Done:** "I published my sale. Do I feel ready?"

---

### OG-2: First 10 Items Added
**Trigger:** User adds their 10th item to a sale (cumulative count for that sale)
**Audience:** Organizers only
**Frequency:** Once per sale
**Survey:**
```
Title: "How's the add-items flow treating you?"
Question: "Rate your experience adding photos"
Options:  Too slow  |  Okay  |  Fast  (quick 3-button scale)
Subtext:  "(We use this to optimize the editor)"
```

**Why this moment?** By item 10, the user has formed an opinion about the UX. It's not too early (they might be overwhelmed), not too late (they're still motivated). This is the sweet spot for workflow feedback.

**Job-to-be-Done:** "Is this photo upload system working for me?"

---

### OG-3: First Item Marked Sold
**Trigger:** User marks an item status as SOLD (via inventory page or item edit)
**Audience:** Organizers only
**Frequency:** Once per sale (not per item)
**Survey:**
```
Title: "Great! An item sold."
Question: "How did you connect with the buyer?"
Options:  In-person  |  Online bid  |  Other  (quick selector)
Subtext:  "(This helps us understand your selling model)"
```

**Why this moment?** Organizers just completed a sale. This captures the moment they're most engaged and happy. Understanding their selling model (auction vs. fixed price, online vs. in-person) is crucial for feature prioritization.

**Job-to-be-Done:** "How are you actually selling things?"

---

### OG-4: First Checkout/POS Use
**Trigger:** User completes a POS transaction or initiates a Hold-to-Pay invoice
**Audience:** Organizers (SIMPLE / PRO / TEAMS tier only, not FREE)
**Frequency:** Once ever
**Survey:**
```
Title: "You used online checkout!"
Question: "Was the payment process smooth?"
Options:  Nope  |  Okay  |  Smooth  (3-button scale)
Subtext:  "(We want checkout to be effortless)"
```

**Why this moment?** First time using payments is high-friction and high-value. Immediate feedback on frictionless vs. problematic.

**Job-to-be-Done:** "Is online payment realistic for my sale format?"

---

### OG-5: First Settings Change
**Trigger:** User changes any setting on the Settings page (subscription, notifications, profile, etc.)
**Audience:** Organizers only
**Frequency:** Once ever
**Survey:**
```
Title: "Settings updated."
Question: "Was that easy to find?"
Options:  No  |  Sort of  |  Yes  (3-button scale)
Subtext:  "(Navigation feedback helps us build better menus)"
```

**Why this moment?** Right after they successfully changed a setting, they know if the UX worked.

**Job-to-be-Done:** "Can I configure this platform without help?"

---

## SHOPPER SURVEYS

### SH-1: First Purchase Completed
**Trigger:** User completes checkout and purchase is confirmed (payment captured, order confirmed)
**Audience:** Shoppers only
**Frequency:** Once ever
**Survey:**
```
Title: "Purchase confirmed!"
Question: "How easy was checkout?"
Options:  Confusing  |  Okay  |  Smooth  (3-button scale)
Subtext:  "(We're improving the buying experience)"
```

**Why this moment?** Immediate post-purchase, while they're happy and engaged. Checkout friction is measured here.

**Job-to-be-Done:** "Am I confident buying on this platform?"

---

### SH-2: First Item Favorited
**Trigger:** User taps the heart icon on an item (favorite created)
**Audience:** Shoppers only
**Frequency:** Once ever
**Survey:**
```
Title: "Added to favorites!"
Question: "Why this item?"
Options:  Looks cool  |  Good price  |  Saving for later  (quick selector)
Subtext:  "(Helps us suggest items you'll love)"
```

**Why this moment?** When a user favorites an item, we're capturing their taste/intention. This is valuable for recommendation tuning.

**Job-to-be-Done:** "Can I find things I actually want?"

---

### SH-3: First Item Bid Placed (Auction Mode)
**Trigger:** User places their first bid on any auction item
**Audience:** Shoppers only (auction mode enabled)
**Frequency:** Once ever
**Survey:**
```
Title: "Bid placed!"
Question: "How confident are you in the final price?"
Options:  Uncertain  |  Reasonable  |  Great deal  (3-button scale)
Subtext:  "(Auction pricing feedback helps us tune listings)"
```

**Why this moment?** Bid placement is high-engagement. Understanding if bidders feel the auction is fair helps organizers set better min bids.

**Job-to-be-Done:** "Is this auction legitimate?"

---

### SH-4: First Haul Posted
**Trigger:** User posts a haul (UGCPhoto created with photo + description)
**Audience:** Shoppers only
**Frequency:** Once ever
**Survey:**
```
Title: "Your haul is live!"
Question: "How fun was sharing it?"
Options:  Annoying  |  Okay  |  Fun  (3-button scale)
Subtext:  "(Community features work best when users share)"
```

**Why this moment?** Users who post content are your most engaged. Understanding if posting is frictionless or annoying shapes future UGC design.

**Job-to-be-Done:** "Will I come back to share more?"

---

### SH-5: First Sale Followed
**Trigger:** User clicks "Follow" on an organizer or sale (Follow created)
**Audience:** Shoppers only
**Frequency:** Once ever
**Survey:**
```
Title: "You're following this organizer!"
Question: "What drew you to them?"
Options:  Great items  |  Good reputation  |  Location  (quick selector)
Subtext:  "(Helps us recommend organizers you'll love)"
```

**Why this moment?** When a user explicitly follows someone, they're signaling interest. This data improves recommendations.

**Job-to-be-Done:** "Will I come back to this organizer?"

---

## BOTH ROLES (Cross-Platform)

### BOTH-1: "Don't Ask Again" Pattern (Universal)
**Every survey includes:**
```
[ ✓ ] Don't ask me about this again
```

**Behavior:**
- Checkbox is unchecked by default
- If checked before submitting, the survey type is permanently suppressed for that user
- Suppression is stored in a new `FeedbackSuppression` table (see schema below)
- Suppression persists across sessions (DB-backed, not localStorage)

---

## State Management & Data Model

### New Database Tables

#### FeedbackSuppression
Tracks which surveys a user has opted out of.

```prisma
model FeedbackSuppression {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  surveyType  String   // e.g., "OG-1", "SH-2", "BOTH-1"
  suppressedAt DateTime @default(now())

  @@unique([userId, surveyType])
  @@index([userId])
}
```

#### User Model Extension
Add to existing User model:
```prisma
  feedbackSuppressions FeedbackSuppression[] @relation()
  firstSalePublished   Boolean @default(false)  // For OG-1 trigger gate
  lastSurveyShownAt    DateTime?               // For session/cooldown logic
```

### Frontend State (React Hook)

```typescript
interface FeedbackState {
  isSurveyOpen: boolean;
  currentSurvey: SurveyType | null;
  answer: string | null;
  dontAskAgain: boolean;
  isSubmitting: boolean;
  cooldownEndTime: number | null; // epoch ms
}

interface SurveyType {
  id: string; // "OG-1", "SH-2", etc.
  title: string;
  question: string;
  options?: string[]; // For button-based surveys
  isTextArea: boolean;
  role: 'ORGANIZER' | 'SHOPPER' | 'BOTH';
}
```

---

## Component Architecture

### FeedbackMenu Item (Settings Page)
**File:** `packages/frontend/components/FeedbackMenu.tsx`

```tsx
export const FeedbackMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  // Renders as modal portal on open
  // Always visible in settings
}
```

**Placement:**
```
Settings Page
├─ Account
├─ Notifications
├─ [Help & Support]
│  └─ FAQ
│  └─ Contact Support
│  └─ Send Feedback       <-- HERE
└─ Delete Account
```

---

### FeedbackSurvey Component (Event-Triggered)
**File:** `packages/frontend/components/FeedbackSurvey.tsx`

Props:
```typescript
interface FeedbackSurveyProps {
  survey: SurveyType;
  onSubmit: (rating: number | string, dontAskAgain: boolean) => Promise<void>;
  onDismiss: () => void;
}
```

**Behavior:**
- Renders as portal (body-level)
- Modal slides up from bottom on mobile
- 10-second idle auto-dismiss (user doesn't interact = modal fades out)
- Proper focus management: trap focus, restore focus on close
- ESC key closes without submitting
- "Don't ask again" checkbox
- Submit button only enabled if user has selected an option

---

### useFeedbackSurvey Hook
**File:** `packages/frontend/hooks/useFeedbackSurvey.ts`

```typescript
export const useFeedbackSurvey = () => {
  // Determines which survey (if any) should fire right now
  // Checks: user role, trigger conditions, suppression status, cooldown, frequency caps
  // Returns: { survey: SurveyType | null, shouldShow: boolean }

  const checkAndShowSurvey = async (trigger: TriggerEvent) => {
    // Called after an action completes
    // Validates: role, suppression, cooldown
    // If all pass: returns survey to show
    // If any fail: returns null (don't show)
  }
}
```

---

## Trigger Logic

All triggers are **action-based**, not page-load-based. They fire only when:

1. User completes the action (not just navigates to the page)
2. User is authenticated
3. User's role matches the survey audience
4. Survey is not suppressed for this user
5. 30 minutes have passed since last survey shown
6. No other survey is currently visible
7. If "once ever" survey: check `firstSalePublished` flag or equivalent

### Trigger Implementation Pattern

Each trigger is implemented as a callback in the relevant page/component:

**Example: OG-1 (First Sale Published)**
```typescript
// In organizer/dashboard.tsx or edit-sale.tsx
const handlePublishSale = async () => {
  // ... publish API call ...

  // After success:
  if (isFirstSalePublished) {
    useFeedbackSurvey().showSurvey('OG-1');  // Fire survey if conditions met
  }
}
```

---

## Frequency & Suppression Rules

### Per-Session Frequency
- **Max 1 survey per session** (even if multiple triggers fire)
- Track: `feedbackState.currentSurveyId` in context
- If survey is showing, ignore all other triggers until dismissed or submitted

### Per-User Frequency
- **Max 1 survey per 24 hours** (not per day calendar — per 24-hour rolling window)
- Track: `user.lastSurveyShownAt` in DB
- Check: `now() - lastSurveyShownAt >= 24 * 60 * 60 * 1000`

### Cooldown Between Surveys
- **30-minute cooldown after any survey is dismissed/submitted**
- Track: `feedbackState.cooldownEndTime`
- Purpose: Don't spam users who are in a heavy-action session (e.g., adding 20 items)

### Permanent Suppression
- User checks "Don't ask again" → Insert row in `FeedbackSuppression`
- On every trigger, check: `SELECT * FROM FeedbackSuppression WHERE userId=X AND surveyType=Y`
- If exists: skip survey

### Tier Awareness
- **OG-4** (POS) only fires for SIMPLE+ (not FREE)
- Check: `user.roles.includes('ORGANIZER') && organizerTier !== 'FREE'`

---

## Edge Cases & Handling

| Edge Case | Handling |
|-----------|----------|
| User opens feedback form while survey is showing | Survey auto-dismisses; form opens |
| User goes offline while survey is open | Survey remains visible; submit fails gracefully with "retry" button |
| User browser-closes during survey submission | Submission completes server-side; cooldown still applied |
| Survey trigger fires for anonymous user | Survey is not shown (auth-only) |
| User rapid-clicks to trigger same action 5 times | Only first trigger fires survey; subsequent ignored (session lock) |
| User has suppressed all surveys | No surveys ever show (graceful fallback to static menu item) |
| "Don't ask again" checked; later user changes mind | No UI to re-enable; must reach out to support to reset |
| User is on FREE tier but survey requires SIMPLE+ | Survey is not shown (silent skip) |

---

## Implementation Checklist

### Backend
- [ ] Add `FeedbackSuppression` table to schema.prisma
- [ ] Add `firstSalePublished` and `lastSurveyShownAt` fields to User model
- [ ] Extend `feedbackController.ts` to handle suppression checks
- [ ] Extend `POST /api/feedback` to accept `surveyType` and `dontAskAgain` flags
- [ ] New endpoint: `POST /api/feedback/suppression` (create suppression record)
- [ ] New endpoint: `GET /api/feedback/suppression` (list suppressions for current user)
- [ ] Update migration: add new tables and fields

### Frontend
- [ ] Create `FeedbackSurvey.tsx` component (portal-based, auto-dismiss at 10s)
- [ ] Create `FeedbackMenu.tsx` component (static form in settings)
- [ ] Create `useFeedbackSurvey` hook (trigger logic, suppression check, cooldown)
- [ ] Create `useFeedbackContext` context (session-level survey state)
- [ ] Integrate `FeedbackMenu` into Settings pages (both organizer & shopper)
- [ ] Integrate `FeedbackSurvey` portal into `_app.tsx` (globally available)
- [ ] Add trigger calls to all survey points:
  - OG-1: `pages/organizer/edit-sale/[id].tsx` (on publish)
  - OG-2: `pages/organizer/add-items/[saleId].tsx` (on 10th item)
  - OG-3: `pages/organizer/inventory.tsx` (on mark sold)
  - OG-4: `pages/organizer/pos.tsx` (on checkout complete) or hold-to-pay modal
  - OG-5: `pages/organizer/settings.tsx` (on any setting save)
  - SH-1: Checkout success page (on order confirmed)
  - SH-2: `pages/items/[id].tsx` (on favorite click)
  - SH-3: `pages/items/[id].tsx` (on bid placed)
  - SH-4: Haul create/post component (on haul posted)
  - SH-5: `pages/organizers/[id].tsx` or sale page (on follow click)
- [ ] Remove old `FeedbackWidget.tsx` floating button and all refs
- [ ] TypeScript compile check (zero errors)

### QA
- [ ] Static menu form: rating scales, text input, success state
- [ ] Survey modal: slides up on mobile, centers on desktop
- [ ] "Don't ask again" checkbox: suppresses future surveys
- [ ] Each trigger: fires at right moment with right content
- [ ] Cooldown: surveys don't spam within 30 min
- [ ] Suppression persists: reload page, still suppressed
- [ ] Tier gating: OG-4 doesn't show for FREE tier
- [ ] Session lock: only 1 survey visible at once
- [ ] Auto-dismiss: survey fades after 10s of inactivity
- [ ] Focus trap: ESC closes, modal traps focus
- [ ] Offline: submit fails gracefully, doesn't crash

---

## Copy & Tone

All copy uses plain English, warm tone, non-technical:

**Do:**
- "How would you rate your experience?"
- "Any thoughts to share?"
- "Thanks! We're reading every submission"
- "We'll stop showing this survey"

**Don't:**
- "Please rate your NPS" (jargon)
- "Provide narrative feedback in JSON format" (too technical)
- "This data will be used for metrics aggregation" (cold)

**Explainer text** (on every survey):
- Keep to 1 line
- Focus on the "why" user should answer: "(Navigation feedback helps us build better menus)"

---

## Success Metrics (Post-Launch Monitoring)

Once deployed, track:
1. **Survey completion rate** — % who submit vs. dismiss
2. **Suppression rate** — % who check "don't ask again"
3. **Avg rating by survey type** — Which moments have highest satisfaction?
4. **Response volume by role** — Are organizers/shoppers equally engaged?
5. **Time-to-submit** — How long does user take to answer?
6. **Auto-dismiss rate** — How many surveys timeout without interaction?

These metrics inform future survey improvements and frequency adjustments.

---

## Notes for Dev Handoff

### Avoid Common Pitfalls
1. **Z-index hell:** Use portal rendering at body level, not inside page containers. This is THE critical lesson from previous FindA.Sale modal bugs.
2. **Focus management:** Use `react-focus-lock` or manual focus trapping. Don't rely on CSS order.
3. **Auto-dismiss timing:** 10 seconds of NO interaction (keydown, click, scroll), not 10 seconds since modal opened. This is important for accessibility.
4. **Suppression persistence:** Store in DB, not localStorage. localStorage can be cleared; DB survives.
5. **Trigger placement:** Call survey check AFTER the action completes, not before. A failed action shouldn't show a survey.
6. **Mobile UX:** On touch devices, swipe-down to dismiss should also work (in addition to X button).

### Styling Constraints
- Modal should use existing Tailwind design system (warm-900, warm-100, etc.)
- Dark mode: adaptive background (white on light mode, dark-800 on dark mode)
- Mobile: 100vw width at bottom, slides up 300ms
- Desktop: centered, max-width 500px, fade-in 200ms
- Overlay: `fixed inset-0 bg-black bg-opacity-40 z-50`
- Modal container: `z-51` (above overlay)

### No Schema Breaking Changes
The new fields (`firstSalePublished`, `lastSurveyShownAt`) are optional and default to safe values. Existing migrations don't need to change — just add a new migration for the new table and fields.

---

## Appendix: Survey Trigger Reference

| Survey | Trigger | Role | Frequency | Tier Gate |
|--------|---------|------|-----------|-----------|
| OG-1 | First sale published | ORGANIZER | Once ever | None |
| OG-2 | 10th item added | ORGANIZER | Once per sale | None |
| OG-3 | Item marked sold | ORGANIZER | Once per sale | None |
| OG-4 | First POS/H2P checkout | ORGANIZER | Once ever | SIMPLE+ |
| OG-5 | Any setting changed | ORGANIZER | Once ever | None |
| SH-1 | Purchase completed | SHOPPER | Once ever | None |
| SH-2 | Item favorited | SHOPPER | Once ever | None |
| SH-3 | Bid placed | SHOPPER | Once ever | Auction tier* |
| SH-4 | Haul posted | SHOPPER | Once ever | None |
| SH-5 | Sale/organizer followed | SHOPPER | Once ever | None |

*Auction listing type available to all tier, but only fire survey if auction is enabled for the sale.

---

**End of Spec**

Handoff ready for `findasale-dev`.
