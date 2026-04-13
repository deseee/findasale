# S256 UX Specifications: 41 Items + Organizer Onboarding Flow

**Prepared by:** findasale-ux
**Date:** 2026-03-23
**Source:** S248 Full-Product Walkthrough Findings (114 items)
**Target:** Parallel findasale-dev implementation

---

## TASK 1: 41 UX Items Grouped by Feature Area

### Batch 1: Discovery & Search (11 items)

**Batch Name:** Homepage & Discovery Experience

**Items:**
| ID | Description | Acceptance Criteria | Complexity |
|---|---|---|---|
| H1 | Treasure hunt modal appears at top of page and cannot be dismissed — add close/dismiss button | Button closes modal without navigating away; modal can be closed on first visit; state persists on reload | S |
| H2 | "Sales near you" cards lack context — should show more info (distance, date, item count?) or different placement | Cards display useful metadata; layout optimized for scanning; mobile-friendly spacing | M |
| H3 | Homepage needs UX review and possible redesign — is current layout serving beta testers? | Design audit completed; recommendations documented (separate task) | L |
| H4 | Search only finds sale name and "about" field — doesn't search item titles or organizer names | Search query matches: sale name + about + item titles + organizer name; results ranked by relevance | M |
| H5 | No dark/light mode toggle in nav | Toggle visible in nav/header on all pages; persists theme across session; works in dark mode | S |
| I1 | Gallery photos broken often (Inspiration page) — test data issue with image URLs | All gallery items render images correctly; no alt-text-only fallbacks; seed data verified | M |
| I2 | Inspiration page has 2 footers | Single footer on /inspiration; consistent with other pages | S |
| I3 | Can like items on Inspiration page but can't wishlist — missing wishlist action | Wishlist button visible on inspiration items; adds to collection; matches behavior on other pages | S |
| T1 | Trending page thumbnails broken often — test data issue | All trending items render thumbnails; no missing images; test data verified | M |
| T2 | Can like trending items but can't wishlist — missing action | Wishlist button visible on trending items; same behavior as Inspiration | S |
| M2 | Map: Plan Your Route needs starting point default (user location) + ending point (same as start toggle) | Map loads with user location (if permission granted); start=location, end=location; toggle works; mobile-friendly | M |

---

### Batch 2: Shopper Navigation & Global Elements (8 items)

**Batch Name:** Navigation, Layout & Consistency

**Items:**
| ID | Description | Acceptance Criteria | Complexity |
|---|---|---|---|
| H13 | Organizer-specific pages not dark mode enabled | All organizer pages (dashboard, settings, profile, etc.) have dark mode styles; no white text on white; no light-only elements | L |
| H14 | Organizer pages only accessible from frontpage — hard to find | Nav includes link to organizer dashboard/pages when user is an organizer; accessible from all pages | S |
| OD1 | "Organizer Dashboard" and "My Dashboard" (shopper) ambiguous in dropdown | Shopper sees "Shopper Dashboard"; organizer sees "Organizer Dashboard"; no confusion | S |
| OD2 | "My Profile" appears for both roles — ambiguous | Shopper: "My Profile (Shopper)"; Organizer: "My Profile (Organizer)" or just role-specific label | S |
| AL2 | Alerts page: White text on white element in dark mode | All form elements, buttons, cards have sufficient contrast in dark mode (WCAG AA 4.5:1) | S |
| S3 | Settings page has 2 footers | Single footer on /shopper/settings and /organizer/settings | S |
| C1 | Contact copy bloated — "We're here to help..." can be shortened | Contact section uses concise copy: "We're here to help! Reach out with any questions or feedback." | S |
| C2 | Contact form "Send" button doesn't submit — broken | Form submits on click; success/error toast shown; form clears on success | M |

---

### Batch 3: Shopper Dashboard & Profile (9 items)

**Batch Name:** Shopper Account & Dashboard

**Items:**
| ID | Description | Acceptance Criteria | Complexity |
|---|---|---|---|
| SD1 | Dashboard: Collection, loyalty, etc. buttons link away instead of displaying inline like Overview/Purchases | Tabs or buttons show content on same page (not navigate away); consistent layout; mobile-friendly | M |
| SD2 | Dashboard Overview: White elements in dark mode | Overview section has no white-only elements in dark mode; all text readable (4.5:1 contrast) | S |
| SD3 | Dashboard: "Sales near you" tries to load in white, then fails | Sales near you loads correctly; no white-only loading state; error state shown if fetch fails | M |
| SD5 | Upgrade button → Hunt Pass checkout but no explanation of why to upgrade | Upgrade button shows value prop (features list, pricing, benefits) before checkout; contextual messaging | S |
| SD6 | Buttons for purchases, watchlist, saved items, points don't click — just display numbers | All stat buttons are clickable; navigate to relevant pages (purchases list, watchlist, etc.) | M |
| SD7 | "Browse upcoming sales" appears randomly at bottom | Card has clear placement (always visible if shown); consistent location across visits; not random | S |
| SD8 | Dashboard: Pickups section has white card in dark mode | Pickups card has dark mode styles; readable text; consistent with other cards | S |
| SD9 | Subscribed tab: No test data; "follow seller" from front page didn't work | Test data includes 3+ followed organizers per shopper; follow action from homepage works end-to-end | M |
| PR2 | Profile: Hunt Pass prominent but no context; points shown but no explanation | Cards explain what Hunt Pass is and what points are good for (link to FAQ or hover tooltip) | S |

---

### Batch 4: Shopper Loyalty & Rewards (8 items)

**Batch Name:** Loyalty, Badges, Gamification Explanations

**Items:**
| ID | Description | Acceptance Criteria | Complexity |
|---|---|---|---|
| CP2 | Collector Passport: "Specialties" and "keywords" undefined — no explanation | Explanatory text (tooltip or inline) explains both terms; links to help doc or example | S |
| CP3 | Collector Passport page has 2 footers | Single footer; consistent with other pages | S |
| LY1–LY10 | Loyalty page: No explanation of stamps, milestones, badges, when benefits apply, what benefits are, where to access them, why user gets them | Each element (stamps, milestones, badges) has explanatory label/tooltip; benefits clearly listed with conditions; clear CTA for claiming benefits | L |
| LY11 | Loyalty page has 2 footers | Single footer | S |
| AL3 | Alerts page: "Keywords" and "tags" present but not distinguished or explained | Explanatory text clarifies difference between keywords (search terms) and tags (categories); examples provided | S |
| AL4 | Alerts page: Can't search for matching items from alert card — only edit or delete | "View matching items" or "Search" button visible on each alert; navigates to search results | S |
| AL5 | Alerts page has 2 footers | Single footer | S |
| L2–L7 | Leaderboard: Only generic explanation; no spec for what badges represent, what users win, why seasonal, tie-in with Hunt Pass | Full leaderboard spec needed (separate strategic task); for now, ensure current state has clear label explaining mechanics | L |

---

### Batch 5: Shopper Wishlist & Collections (8 items)

**Batch Name:** Favorites, Wishlists, Alerts Consolidation

**Items:**
| ID | Description | Acceptance Criteria | Complexity |
|---|---|---|---|
| FV1 | Lots of overlap: Alerts vs Wishlists vs Favorites — unclear distinction | Consolidation decision made (D-xxx); nav/UI reflects single mental model for saved items | L |
| FV2 | Dropdown shows "My Wishlists" but page called "Favorites" — label mismatch | Labels consistent: dropdown matches page title; "Wishlist" or "Favorites" used consistently across site | S |
| AL1 | Alerts page: Is this same as wishlist? Unclear distinction | Consolidation decision made and documented; UI clarifies relationship or consolidates pages | L |
| PR5 | Profile: "Sale interests" — how different from wishlist/alerts? | Feature overlap decision made (D-xxx); user docs clarify or feature is removed/consolidated | L |
| TR1 | Trails page: Completely broken — can't create new trail, no data | Trail creation works; data loads; page functional; test data includes 2–3 completed trails per user | M |
| TR2 | Trails page has 2 footers | Single footer | S |
| LL1 | Loot Log: No sales data to test with | Test data includes 3+ purchase history items per shopper; Loot Log page displays purchases | M |
| CP1 | Collector Passport: No test data | Test data includes passport specialties/keywords for 5+ test shoppers; page loads and displays data | M |

---

### Batch 6: Organizer Dashboard & Settings (9 items)

**Batch Name:** Organizer Workspace Setup

**Items:**
| ID | Description | Acceptance Criteria | Complexity |
|---|---|---|---|
| ODB1 | Organizer dashboard: POS should be more prominent | POS button/section visible above the fold; consistent color/styling; mobile-accessible | S |
| OV1 | Overview tab: Gamified with no direction — badges, points with no context | Cards explain gamification mechanics (link to guide or hover tooltip); context for badges/points | S |
| OV2 | Overview tab: 2 links to reputation score (duplicate) | Single link to reputation; no redundant navigation | S |
| OV3 | Overview tab: Organizer/payouts only accessible from overview? | Payouts link accessible from nav or settings; not hidden in dashboard tab | S |
| OS1 | Organizer settings very different from shopper settings — needs parity review | Feature parity audit completed (separate task); decide which features should be shared | L |
| OS2 | Workspace doesn't load; links to findasale.com instead of finda.sale | Workspace links use correct domain (finda.sale); pages load without 404 | S |
| OS3 | /workspace/[slug] returns 404 | Workspace routes work; slugs from settings resolve; no broken links | M |
| OP2 | Profile: "Your sales" section just links to dashboard — why on profile? | Remove redundant link or clarify purpose with explanatory copy | S |
| OP3 | Profile: "Quick links" and "sale interests" — how different from settings? | Consolidation decision made; pages reorganized or features removed | L |

---

### Batch 7: Organizer Advanced Tools (9 items)

**Batch Name:** Inventory, Reporting, Command Center, Appraisals

**Items:**
| ID | Description | Acceptance Criteria | Complexity |
|---|---|---|---|
| IL1 | Item Library page: Completely broken | Page loads; can view/manage library items; consistent with rest of dashboard | M |
| IL2–IL4 | Item Library: No explanation of what library is, how to add items, how it differs from regular items | Explanatory text (UI label + help link) clarifies purpose, workflow, and distinction; examples shown | S |
| PI1 | Print Inventory: Button takes forever; prints whole page with multiple white pages | Print function exports clean inventory list (PDF or native print) in under 2 seconds; mobile-friendly | M |
| PI2 | Print Inventory: Can't select individual sales to print | Sale selector dropdown allows filtering by sale; print button respects selection | S |
| FR1 | Flip Reports page: "Error Unable to load flip report. Please try again." | Flip reports load (or empty state shown if no data); error message replaced with helpful context | M |
| CC2–CC6 | Command Center: Offline mode needs spec (how to use, when needed, does it work for POS/cards, sync alerts) | Offline mode spec completed (separate task); UI clearly explains when/how to use it | L |
| AP1–AP3 | Appraisal Requests: How do others receive requests? Do they need to return to page? How do they benefit? | Full appraisal flow spec (separate task); UI shows status of pending requests; notifications sent to recipients | L |
| TY1 | Typology page: Broken — black text on dark background | Page styled correctly in light and dark modes; text readable in both (4.5:1 contrast) | S |
| WH1 | Webhooks: No way to know how to begin testing | Help text or link added; documentation linked; example cURL or test payload provided | S |

---

## TASK 2: Organizer Onboarding Flow Specification

### Current State Map

**Current Architecture (as of S255):**

Two separate modals exist in `/organizer/dashboard`:
1. **OnboardingWizard** (OnboardingWizard.tsx) — 4-step form modal
   - Triggered: `showWizard && !orgProfile?.onboardingComplete`
   - Step 1: Profile setup (business name, phone, bio)
   - Step 2: Stripe Connect (payment setup)
   - Step 3: Create first sale (educational flow)
   - Step 4: Completion screen
   - State: Persisted via API (`POST /organizers/me/onboarding-complete`)
   - UX Issue: Modal dismissible at any step; no clear recovery path if dismissed

2. **OrganizerOnboardingModal** (OrganizerOnboardingModal.tsx) — 5-step walkthrough modal
   - Different component; 5 steps with icons + emoji
   - Appears to be alternative/legacy implementation
   - Not currently rendered in dashboard
   - Redundant with OnboardingWizard

3. **Post-Login Flow:**
   - User registers → redirected to `/auth/register-organizer`
   - After registration → `/organizer/dashboard`
   - Dashboard checks: `orgProfile?.onboardingComplete`
   - If false: shows OnboardingWizard

4. **Current Issues (P2 from S248):**
   - Two modal components exist (code duplication)
   - No clear entry point or sequencing
   - Modal can be dismissed without completing critical steps (Stripe)
   - "How It Works" card shown on dashboard when onboarding incomplete (lines 651–677)
   - Recovery path unclear if user dismisses modal partway through

### Gap Analysis

| Gap | Impact | Priority |
|---|---|---|
| **Two onboarding modals** | Confusing codebase; unclear which is authoritative; potential for both to render | HIGH |
| **No Stripe requirement** | User can skip payment setup; platform can't process sales | HIGH |
| **No profile completion requirement** | Business name optional; settings incomplete | MEDIUM |
| **Dismissible at any step** | User can abandon flow mid-setup with no reminder | HIGH |
| **No success state persistence** | If user refreshes, wizard reappears even after completing steps | MEDIUM |
| **No email verification** | User can register with invalid email; can't receive sales notifications | MEDIUM |
| **No onboarding for team members** | TEAMS tier users added by owner don't see onboarding | HIGH |
| **Not integrated with `/organizer/settings`** | Profile data entry separated from full settings page | MEDIUM |
| **No first-sale guidance** | User completes wizard but still needs help creating first sale | MEDIUM |
| **Mobile layout untested** | Modals may be unreadable on small screens (organizers use phones) | HIGH |

---

### Proposed Organizer Onboarding Flow Specification

#### Overview

**Goal:** New organizers complete a single, intuitive flow from signup → first publishable sale within 5 minutes.

**Key Principles:**
1. **One unified modal** — no redundancy
2. **Required steps only** — Stripe + business name mandatory; everything else optional
3. **Sticky completion** — progress saved after each step
4. **Mobile-first** — designed for phone completion
5. **Clear next steps** — wizard exits to actionable state (first sale draft or dashboard)
6. **Recovery path** — dismissed users see reminder on dashboard

#### Flow Map

```
Signup/Register
  ↓
/auth/register-organizer (email verification)
  ↓
/organizer/dashboard (+ OnboardingFlow modal)
  ├─ Modal not shown if:
  │   ├─ onboardingComplete = true
  │   ├─ Email not verified
  │   ├─ User dismissed and localStorage set (with reminder card visible)
  │
  ├─ Modal shown (sticky on back button/refresh):
  │   ├─ Step 1: Email Verification (auto-filled, verify button)
  │   ├─ Step 2: Business Profile (required: name, optional: phone, bio)
  │   ├─ Step 3: Payment Setup (Stripe; required; skip = can't publish)
  │   ├─ Step 4: Create Sale (optional; user can do later)
  │   └─ Step 5: Success → navigate to create-sale OR dashboard
  │
  └─ If dismissed:
      ├─ Reminder card shows on dashboard
      └─ "Resume onboarding" link re-opens modal
```

#### Detailed Step Specifications

##### Step 1: Email Verification

**User Goal:** Confirm email ownership; enable sale notifications.

**Layout:**
```
Title: "Verify Your Email"
Subtitle: "We'll send you sale alerts and payment confirmations."

[Auto-filled email]
"Resend verification link?"

[Verify] [Skip for Now]
```

**Acceptance Criteria:**
- Email field pre-filled from registration
- One-click "Verify" sends email (or checks if already verified)
- Skip option available but flagged as risky
- Success state: "✓ Email verified"
- Loading state shown during verification
- Mobile: Full-width input, tap-friendly buttons

**Dev Handoff:**
- Endpoint: `POST /auth/verify-email-resend` (if not already verified)
- Check: `user.emailVerified` flag
- Handle: Already-verified emails (skip step automatically)

---

##### Step 2: Business Profile

**User Goal:** Set up public identity; configure payment destination.

**Layout:**
```
Title: "Your Business Profile"
Subtitle: "Shoppers will see this when they visit your sales."

[Required] Business Name *
[Input] e.g., "Johnson Estate Sales"

[Optional] Phone Number
[Input] e.g., "(616) 555-0100"

[Optional] Bio
[Textarea] "Tell shoppers about your business..."

[Optional] Sale Type (radio)
  ○ Estate Sales
  ○ Consignment/Inventory
  ○ Auctions
  ○ Flea Market/Yard Sale
  ○ Other

[Remind Me Later] [Save & Continue]
```

**Acceptance Criteria:**
- Business name required (validated non-empty)
- Phone/bio optional but encouraged (value prop tooltip?)
- Sale type helps personalize dashboard later
- Save validates fields; shows error if business name empty
- Success toast: "Profile saved"
- Prefill from existing organizer record if available
- Mobile: Single-column, clear label spacing

**Dev Handoff:**
- Endpoint: `PATCH /organizers/me` (businessName, phone, bio, saleType)
- Validation: businessName must be 2+ characters
- Save state: `organizerProfileComplete = true` flag (not `onboardingComplete` yet)

---

##### Step 3: Payment Setup (Stripe) — REQUIRED

**User Goal:** Enable money collection; understand payout timeline.

**Layout:**
```
Title: "Get Paid for Your Sales"
Subtitle: "Connect your bank account to receive payments."

[Icon: Payment card]

Info Card (blue bg):
  "Why Stripe Connect?"
  ✓ Fast, secure payouts to your bank
  ✓ Automatic payments after each sale
  ✓ Your fees, transparent
  ✓ No hidden platform costs

[Button: "Connect Stripe"] [Learn More →]

Or: [Button: "Skip for Now"] (shows warning)
  ⚠ You can't publish a sale without payment setup.
  Click "Skip" to finish later. Reminder will appear on dashboard.
```

**Acceptance Criteria:**
- Clear explanation of why Stripe is required
- "Connect Stripe" button initiates OAuth flow
- OAuth redirects back to `/organizer/dashboard?stripe=connected`
- Success: Modal shows ✓ checkmark next to Stripe step
- Skip allowed but dashboard shows persistent "Complete payment setup" banner
- Mobile: Large tap target, clear CTA
- Handles case where user has already connected Stripe (skip step)

**Dev Handoff:**
- Endpoint: `POST /stripe/create-connect-account` (existing, uses OAuth)
- Check: `user.stripeConnectId` existence
- Flag: `stripeConnectComplete` (user can complete wizard without, but can't publish)
- Redirect param: `?stripe=connected` on return

---

##### Step 4: Create First Sale (Optional)

**User Goal:** Understand sale creation workflow; optionally start first sale.

**Layout:**
```
Title: "Create Your First Sale"
Subtitle: "A 'sale' is where you list all items you're selling together."

[Example sale card]
  "Estate Sale — March 29"
  "2024 Oak Lane, Grand Rapids"
  "5 hours remaining"

What goes in a sale?
  ✓ Sale date & location
  ✓ Description & photos
  ✓ Individual items (furniture, decor, etc.)
  ✓ Price for each item (or bid price)

You can:
  • Create multiple sales at once
  • Add items as you go (draft mode)
  • Publish when you're ready

[Skip for Now] [Create Sale]
```

**Acceptance Criteria:**
- "Create Sale" navigates to `/organizer/create-sale` with draft flag
- Prefills sale type from Step 2 if selected
- "Skip for Now" moves to Step 5
- Explains that sales are drafts until published
- Mobile: Card layout, readable text
- Timeout: If user doesn't complete sale creation, return to dashboard after 10 min idle

**Dev Handoff:**
- Endpoint: `POST /sales` (with `isDraft = true`)
- Prefill: `saleType` from organizer profile
- Success: Redirect to `/organizer/edit-sale/[saleId]`
- Timeout: Session logic to detect idle and redirect to dashboard

---

##### Step 5: Success & Next Steps

**User Goal:** Understand what to do next; feel confident moving forward.

**Layout:**
```
[Icon: 🎉]

Title: "You're All Set!"
Subtitle: "Your organizer account is ready."

Status Checklist:
  ✓ Email verified
  ✓ Profile created (Business name)
  ✓ Payment connected (Stripe)
  ✓ (If completed) First sale started

Next Steps:
  → Add items to your sale
  → Connect product photos
  → Set prices (or open bids)
  → Publish when ready
  → Share QR code with shoppers

[Go to Dashboard] or [Continue Creating Sale]
```

**Acceptance Criteria:**
- Shows completion status of all steps
- Highlights any skipped items (esp. Stripe)
- Two CTAs: resume sale creation OR go to dashboard
- Success: `POST /organizers/me/onboarding-complete` called
- Success: `onboardingComplete = true` persisted
- Modal closed; user sees dashboard
- If Stripe skipped: Dashboard shows reminder banner ("Complete payment to publish")
- Mobile: Full-width buttons, scannable checklist

**Dev Handoff:**
- Endpoint: `POST /organizers/me/onboarding-complete`
- Payload: `{ completedAt: timestamp }`
- Set flag: `onboardingComplete = true` + `stripeConnectComplete` (may be false)
- Clear localStorage dismissal flag

---

#### Dismissal & Recovery

**If user clicks "Skip" or closes modal:**

1. **First dismissal (Step 1–3):**
   - Save progress to localStorage: `{ step: 2, progress: {...} }`
   - Show modal again on next visit to dashboard
   - Do NOT mark `onboardingComplete = true`

2. **Persistent reminder (if skipped multiple times):**
   - Dashboard shows card: "Complete your setup in 2 minutes" with [Resume] button
   - Card persists until all required steps done (email + business name + Stripe)
   - Red badge on nav if Stripe not connected and sales exist (can't publish)

**Acceptance Criteria:**
- Dismissal doesn't lose user data
- Reminder visible but non-blocking
- User can navigate dashboard while onboarding incomplete
- Stripe requirement enforced at sale publish time (can't go live without it)

---

#### Edge Cases

| Scenario | Handling |
|---|---|
| User already verified email | Skip Step 1 automatically |
| User already has Stripe connected | Skip Step 3 automatically |
| User already filled profile | Prefill Step 2; option to edit |
| User is team member (TEAMS tier) | Skip full flow; show "Ready to start?" quick start instead |
| User visits `/organizer/settings` during onboarding | Allow navigation; save progress; offer to resume |
| User doesn't verify email for 7 days | Send reminder email with verification link |
| User skips Stripe but tries to publish | Show modal: "Finish setup to publish" + Stripe step highlight |

---

#### Mobile-Specific Design Notes

- Modal width: 90vw (max-width: 600px) on mobile
- Portrait orientation: Full-height scrollable modal (not full-screen)
- Buttons: 44px tap target minimum
- Input fields: 16px font (prevents iOS zoom)
- Multi-step progress: Show dots (mobile) + "Step X of 5" label
- Back button: On mobile, "Back" navigates within modal (not browser back)
- No horizontal scrolling at any breakpoint

---

#### Acceptance Criteria (Full Flow)

**User completes onboarding when:**
1. Email verified ✓
2. Business name entered ✓
3. Stripe connected (or modal shown with warning) ✓
4. User sees "You're All Set" screen ✓
5. Dashboard loads without modal ✓
6. Dashboard shows "How It Works" card only if onboarding incomplete ✓

**User can navigate dashboard but cannot:**
- Publish a sale without Stripe connected
- Go to `/organizer/settings` without dismissing modal (or modal persists)

**Recovery scenario:**
1. User dismisses Step 2
2. Modal does NOT reappear
3. Dashboard shows persistent reminder card
4. Click [Resume] reopens modal at Step 2
5. Complete steps; modal closes
6. Dashboard stops showing reminder

---

### Files Likely Impacted

**For findasale-dev dispatch:**

| File | Impact | Notes |
|---|---|---|
| `pages/organizer/dashboard.tsx` | MAJOR | Remove/unify modal rendering; update conditional logic |
| `components/OnboardingWizard.tsx` | MAJOR | Consolidate with OrganizerOnboardingModal; 5 steps (added email + combined into one) |
| `components/OrganizerOnboardingModal.tsx` | DELETE | Merge into OnboardingWizard or remove entirely |
| `hooks/useOrganizerProfile.ts` | UPDATE | Add `emailVerified`, `stripeConnectComplete` flags |
| `pages/organizer/create-sale.tsx` | UPDATE | Handle `isDraft` + onboarding redirect logic |
| `pages/auth/register-organizer.tsx` | UPDATE | Add email verification flow post-registration |
| `components/OnboardingReminder.tsx` | CREATE | Persistent card for skipped users on dashboard |
| `styles/mobile.css` (or Tailwind) | UPDATE | Responsive modal styles (600px max-width, tap targets) |
| `lib/api.ts` | UPDATE (maybe) | Ensure endpoints exist: verify-email, onboarding-complete, stripe setup |

---

### Recommended Implementation Order

1. **Session 1:** Consolidate onboarding modal (remove OrganizerOnboardingModal, unify into OnboardingWizard)
2. **Session 2:** Add Step 1 (email verification) + Step 5 (success screen)
3. **Session 3:** Add dismissal/reminder card logic + localStorage persistence
4. **Session 4:** Mobile testing + responsive design refinements
5. **Session 5:** Edge case handling (team members, pre-filled profiles, Stripe enforcement)

---

## Summary

**41 UX items** organized into 7 batches (discovery, navigation, shopper dashboard, loyalty, wishlist, organizer dashboard, advanced tools).

**Organizer onboarding** redesigned as single 5-step flow with required (email + business name + Stripe) and optional (sale creation) steps. Current state has redundant modals and unclear recovery paths. Proposed flow is sticky, mobile-first, and includes persistent reminders for dismissed users.

Both deliverables ready for parallel findasale-dev implementation.
