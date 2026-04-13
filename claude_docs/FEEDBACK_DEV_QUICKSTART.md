# Feedback System — Dev Quickstart

**For:** findasale-dev subagent
**TL;DR:** Remove floating button, add settings form, add 10 event-triggered micro-surveys. Full spec in `FEEDBACK_SYSTEM_SPEC.md`.

---

## What You're Building

Replace the floating feedback button with:
1. **Static form** in Settings (organizer + shopper settings pages)
2. **10 micro-surveys** that fire after specific user actions
3. **Suppression system** so users can opt out of surveys

---

## Quick Task List

### Backend (Prisma + API)
- [ ] Add `FeedbackSuppression` model to schema.prisma
- [ ] Add `firstSalePublished` + `lastSurveyShownAt` to User model
- [ ] Extend `submitFeedback` to accept `surveyType` and `dontAskAgain` flags
- [ ] New endpoint: `POST /api/feedback/suppression` (create suppression)
- [ ] New endpoint: `GET /api/feedback/suppression` (list suppressions for user)
- [ ] Migration: up (add tables) + down (rollback)

### Frontend (React)
- [ ] Remove `FeedbackWidget.tsx` and all imports
- [ ] Create `FeedbackSurvey.tsx` (portal modal, 10s auto-dismiss, focus trap)
- [ ] Create `FeedbackMenu.tsx` (static form in settings)
- [ ] Create `useFeedbackSurvey` hook (trigger logic + suppression check)
- [ ] Create `FeedbackContext` (session-level survey state)
- [ ] Integrate FeedbackMenu into:
  - `pages/organizer/settings.tsx` (Help & Support section)
  - `pages/shopper/settings.tsx` (Help & Support section)
- [ ] Integrate FeedbackSurvey portal into `pages/_app.tsx`
- [ ] Add trigger calls to 10 pages/components:
  - OG-1: `pages/organizer/edit-sale/[id].tsx` (on publish)
  - OG-2: `pages/organizer/add-items/[saleId].tsx` (on 10th item)
  - OG-3: `pages/organizer/inventory.tsx` (on mark sold)
  - OG-4: `pages/organizer/pos.tsx` (on checkout complete)
  - OG-5: `pages/organizer/settings.tsx` (on any setting save)
  - SH-1: Checkout success page (on order confirmed)
  - SH-2: `pages/items/[id].tsx` (on favorite)
  - SH-3: `pages/items/[id].tsx` (on bid placed)
  - SH-4: Haul create component (on post)
  - SH-5: Organizer profile or sale detail (on follow)

### QA
- [ ] Test each trigger fires at the right moment
- [ ] Test "Don't ask again" suppression persists across sessions
- [ ] Test 30-min cooldown between surveys
- [ ] Test max 1 survey per session
- [ ] Test max 1 per 24 hours
- [ ] Test tier gating (OG-4 not shown for FREE)
- [ ] Test focus trap: ESC closes, modal traps focus
- [ ] Test 10s auto-dismiss on mobile
- [ ] Test dark mode styling

---

## The 10 Surveys at a Glance

| ID | Trigger | Role | Question | Type |
|----|---------|------|----------|------|
| OG-1 | First sale published | ORG | "How confident about photos?" | 3-button |
| OG-2 | 10th item added | ORG | "Rate photo experience" | 3-button |
| OG-3 | First item sold | ORG | "How connected with buyer?" | 3-button |
| OG-4 | First POS checkout | ORG | "Payment process smooth?" | 3-button + SIMPLE+ tier gate |
| OG-5 | First settings change | ORG | "Easy to find?" | 3-button |
| SH-1 | First purchase | SHOPPER | "Checkout easy?" | 3-button |
| SH-2 | First favorite | SHOPPER | "Why this item?" | 3-button |
| SH-3 | First bid | SHOPPER | "Confident in price?" | 3-button |
| SH-4 | First haul posted | SHOPPER | "Fun to share?" | 3-button |
| SH-5 | First follow | SHOPPER | "What drew you?" | 3-button |

All surveys:
- 1 question (3-button scale)
- "Don't ask again" checkbox
- 10s auto-dismiss if no interaction
- X to close
- Submit button

---

## Code Patterns

### Trigger Pattern (Call after action succeeds)
```typescript
// In the API success handler or after setStatus callback
const { useFeedbackSurvey } = require('../../hooks/useFeedbackSurvey');
const { showSurvey } = useFeedbackSurvey();

// After user publishes sale
if (res.status === 200) {
  showSurvey('OG-1');  // Hook checks: auth, role, suppression, cooldown
}
```

### Suppression Check Pattern (In hook)
```typescript
const checkSuppression = async (surveyType: string) => {
  const res = await api.get('/api/feedback/suppression');
  const suppressedIds = res.data.map(s => s.surveyType);
  return suppressedIds.includes(surveyType);
};
```

### Auto-Dismiss Pattern (In component)
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    setIsOpen(false);  // After 10 seconds of no interaction
  }, 10000);

  const resetTimer = () => clearTimeout(timer) && setTimeout(() => {
    setIsOpen(false);
  }, 10000);

  window.addEventListener('click', resetTimer);
  window.addEventListener('keydown', resetTimer);

  return () => {
    clearTimeout(timer);
    window.removeEventListener('click', resetTimer);
    window.removeEventListener('keydown', resetTimer);
  };
}, [isOpen]);
```

### Portal Pattern (In _app.tsx)
```tsx
import FeedbackSurvey from '../components/FeedbackSurvey';
import FeedbackProvider from '../context/FeedbackContext';

export default function App({ Component, pageProps }) {
  return (
    <FeedbackProvider>
      <Component {...pageProps} />
      <FeedbackSurvey />  {/* Renders to body, not inside Component */}
    </FeedbackProvider>
  );
}
```

---

## Gotchas & Anti-Patterns

### ❌ DON'T: Fire survey on page load
```typescript
// BAD — fires even if action failed
useEffect(() => {
  showSurvey('OG-1');
}, []);
```

### ✅ DO: Fire survey after action succeeds
```typescript
// GOOD — fires only after publish succeeds
const handlePublish = async () => {
  const res = await api.post('/sales/publish', { saleId });
  if (res.status === 200) {
    showSurvey('OG-1');  // <-- Here, after success
  }
};
```

### ❌ DON'T: Store suppression in localStorage
```typescript
// BAD — user clears cache, suppression gone
localStorage.setItem('suppressed_OG-1', 'true');
```

### ✅ DO: Store suppression in DB
```typescript
// GOOD — persists across clears
await api.post('/api/feedback/suppression', { surveyType: 'OG-1' });
```

### ❌ DON'T: Render modal inside page container
```tsx
// BAD — modal gets clipped by parent overflow-hidden
<div className="overflow-hidden max-h-screen">
  <FeedbackSurvey />  {/* Trapped inside container, z-index broken */}
</div>
```

### ✅ DO: Render modal as portal to body
```tsx
// GOOD — modal is outside page flow, full z-index control
const surveyPortal = ReactDOM.createPortal(
  <FeedbackSurvey />,
  document.body  // <-- Render to body, not inside component tree
);
```

---

## Reference Files

- **Full spec:** `claude_docs/FEEDBACK_SYSTEM_SPEC.md` (617 lines, all details)
- **Survey mapping:** `claude_docs/FEEDBACK_SURVEY_MAPPING.md` (373 lines, user flows → triggers)
- **Handoff summary:** `claude_docs/FEEDBACK_SYSTEM_HANDOFF.md` (for Patrick, high-level overview)
- **Current widget:** `packages/frontend/components/FeedbackWidget.tsx` (to remove)
- **Feedback controller:** `packages/backend/src/controllers/feedbackController.ts` (to extend)

---

## Acceptance Criteria

Feature is ✅ when:
1. Floating button is gone (FeedbackWidget removed)
2. Settings pages have "Send Feedback" link → opens form
3. All 10 surveys fire at their specified moments
4. "Don't ask again" suppresses future surveys
5. Max 1 survey per session
6. Max 1 per 24 hours
7. 30-min cooldown between surveys
8. Survey auto-dismisses after 10s idle
9. OG-4 only shows for SIMPLE+ tiers
10. Dark mode works (white bg on light, dark-800 on dark)
11. Mobile: swipe-down + X button both dismiss
12. Focus is trapped (ESC closes)
13. TypeScript: zero errors

---

## Start Here

1. Read `FEEDBACK_SYSTEM_SPEC.md` (all architecture decisions)
2. Read `FEEDBACK_SURVEY_MAPPING.md` (triggers & user flows)
3. Add schema tables (Prisma)
4. Extend feedback API
5. Build components in order: `FeedbackSurvey` → `FeedbackMenu` → `useFeedbackSurvey`
6. Integrate into settings pages
7. Add triggers to the 10 code locations
8. Test each trigger + suppression + cooldown
9. Dark mode + mobile UX pass
10. TypeScript clean

---

Good luck. All decisions are locked; no unknowns blocking your start.
