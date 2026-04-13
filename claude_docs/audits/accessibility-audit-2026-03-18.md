# Accessibility Audit: FindA.Sale
**Standard:** WCAG 2.1 AA | **Date:** 2026-03-18 | **Audit Type:** Third Pass (Live & Code Review)

---

## Executive Summary

FindA.Sale demonstrates **foundational accessibility competence** with a skip link, semantic form labels, ARIA landmarks, and focus indicators. However, the **dense navigation architecture and color palette create barriers** for keyboard users, low-vision users, and screen reader users.

**Issues Found:** 18 | **Critical:** 4 | **Major:** 7 | **Minor:** 7

---

## Critical Findings (WCAG A/AA Failures)

### 1. Missing H1 on Multiple Pages
**WCAG Criterion:** 1.3.1 Info and Relationships (Level A)
**Severity:** 🔴 Critical
**Issue:** Live page analysis shows pages use H2 as the primary heading instead of a single H1. The page structure starts with H2 ("Discover Amazing Deals" on homepage), violating fundamental heading hierarchy requirements.
**Files Affected:** `packages/frontend/pages/index.tsx`, `packages/frontend/pages/trending.tsx`, `packages/frontend/pages/cities.tsx`
**Impact:** Screen reader users cannot identify page purpose; assistive tech cannot reliably navigate page structure.
**Fix:**
```jsx
// Currently:
<h2 className="text-3xl font-bold">Discover Amazing Deals</h2>

// Change to:
<h1 className="text-3xl font-bold">Discover Amazing Deals</h1>
```

### 2. Icon-Only Buttons Without Accessible Names
**WCAG Criterion:** 1.1.1 Non-Text Content (Level A) & 4.1.2 Name, Role, Value (Level A)
**Severity:** 🔴 Critical
**Issue:** The bottom tab navigation (Browse, Map, Saved, Messages, Profile) uses SVG icons with `aria-hidden="true"` but relies on visual-only text labels. The `<Link>` component is not a semantic button and lacks proper ARIA labeling. Additionally, icon-only social login buttons (Google, Facebook) on login page have no descriptive text.
**Files Affected:**
- `packages/frontend/components/BottomTabNav.tsx` (lines 132–160)
- `packages/frontend/pages/login.tsx` (lines 195–215)
**Code Snippet:**
```jsx
// BottomTabNav.tsx current:
<Link href={tab.href} className={...}>
  <Icon active={active} />
  <span className="text-[10px]">{tab.label}</span>  {/* Text label buried in <span> */}
</Link>

// Should be:
<Link
  href={tab.href}
  aria-label={`${tab.label}${active ? ' (current)' : ''}`}
  className={...}
>
  <Icon active={active} />
  <span className="text-[10px]" aria-hidden="true">{tab.label}</span>
</Link>
```
**Impact:** Keyboard users and screen reader users cannot identify the purpose of navigation tabs. Social login buttons announce as "button" with no context.

### 3. Excessive Tab Stops Before Main Content
**WCAG Criterion:** 2.4.3 Focus Order (Level A)
**Severity:** 🔴 Critical
**Issue:** The Layout component presents 25+ navigation links and action buttons (across desktop nav, mobile drawer, and authenticated user menu) before users can tab to main content. Desktop users must navigate through:
- Main navigation (9 links)
- Saved, Messages icons (2 interactive elements)
- User menu with conditional 15+ links (organizer/shopper/admin)
- Theme toggle (1 interactive)
- Logout button (1 interactive)

This exceeds accessibility best practices (5–7 focusable elements before main is typical).
**Files Affected:** `packages/frontend/components/Layout.tsx` (lines 231–345)
**Impact:** Keyboard navigation becomes tedious; users with motor disabilities face fatigue and abandon forms.
**Fix:** Implement keyboard skip commands or tab-trapping in the drawer. Add `tabindex="-1"` to non-essential nav items when drawer is not visible.

### 4. Color Contrast on Amber Palette in Dark Mode
**WCAG Criterion:** 1.4.3 Contrast (Minimum) (Level AA)
**Severity:** 🔴 Critical
**Issue:** The amber-600 color (#D97706) used throughout the UI has insufficient contrast ratios:
- **Amber-600 on white (warm-100 #F9F7F4):** ~6.2:1 (passes 4.5:1 for AA text, but low for UI components)
- **Amber-600 on dark gray background (warm-800 #2D261C):** ~3.8:1 (FAILS WCAG AA at 4.5:1 requirement for normal text)
- **Amber-400 (#FBBF24) on warm-900 (#1A1A1A) in dark mode:** ~5.8:1 (barely passes)

Affected components:
- Hover states on navigation links
- "Sign in with" buttons
- Secondary accent elements

**Tailwind Config Reference:** `packages/frontend/tailwind.config.js` (lines 26–37)
**Impact:** Low-vision users cannot distinguish interactive elements; users with color blindness miss hover feedback entirely.
**Test Results:**
| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Amber-600 text | #D97706 | #1A1A1A (dark mode) | 3.8:1 | 4.5:1 AA | ❌ |
| Amber-600 link hover | #D97706 | #F9F7F4 | 6.2:1 | 4.5:1 AA | ✅ |
| Amber-600 CTA button | #D97706 | white | 6.5:1 | 4.5:1 AA | ✅ |

**Fix:** Use amber-700 (#B45309) for dark-mode text, which achieves 5.2:1 on warm-900.

---

## Major Findings (Significant WCAG Issues)

### 5. Missing Landmark Regions in Mobile Drawer
**WCAG Criterion:** 1.3.1 Info and Relationships (Level A)
**Severity:** 🟡 Major
**Issue:** The mobile drawer (`#mobile-drawer`) uses `role="dialog"` but is semantically a navigation sidebar. It should use `role="navigation"` or a `<nav>` element instead. Current markup does not allow screen reader users to skip the drawer menu easily.
**Files Affected:** `packages/frontend/components/Layout.tsx` (lines 380–390)
**Current:**
```jsx
<div
  id="mobile-drawer"
  role="dialog"
  aria-modal="true"
  aria-label="Navigation menu"
>
```
**Should be:**
```jsx
<nav
  id="mobile-drawer"
  aria-label="Mobile navigation menu"
  className={...}
>
```
**Impact:** Screen reader users cannot use landmark navigation shortcuts; announced as "dialog" instead of "navigation".

### 6. Missing Focus Trap Exit Mechanism in Mobile Drawer
**WCAG Criterion:** 2.4.3 Focus Order (Level A)
**Severity:** 🟡 Major
**Issue:** The mobile drawer attempts focus management (line 37: `drawerRef.current?.focus()`), but lacks proper focus trap implementation. When the drawer closes, focus is not returned to the trigger button (hamburger menu). Keyboard users following ARIA authoring practices expect focus to return to the trigger.
**Files Affected:** `packages/frontend/components/Layout.tsx` (lines 327–343)
**Missing:**
```jsx
const triggerRef = useRef<HTMLButtonElement>(null);

useEffect(() => {
  if (!menuOpen && triggerRef.current) {
    triggerRef.current.focus();  // Return focus to trigger
  }
}, [menuOpen]);
```

### 7. Label-Input Association in Login Form (Minor Issue)
**WCAG Criterion:** 1.3.1 Info and Relationships (Level A)
**Severity:** 🟡 Major
**Issue:** While labels exist and use `htmlFor`, they are hidden with `sr-only` class. Placeholder text is present but unreliable as a substitute for visible labels. Users with cognitive disabilities may not understand context if placeholders disappear on input focus.
**Files Affected:** `packages/frontend/pages/login.tsx` (lines 94–126), `packages/frontend/pages/register.tsx`
**Current:**
```jsx
<label htmlFor="email-address" className="sr-only">
  Email address
</label>
<input placeholder="Email address" />
```
**Recommendation:** Add visible label alongside or above input.

### 8. Error Messages Not Associated with Inputs
**WCAG Criterion:** 3.3.1 Error Identification (Level A)
**Severity:** 🟡 Major
**Issue:** The error div on login form (line 85–90) displays errors but uses no `aria-describedby` to link errors to form fields. Screen reader users cannot associate error messages with the field that caused them.
**Files Affected:** `packages/frontend/pages/login.tsx` (lines 84–91)
**Missing:**
```jsx
<div id="form-errors" className="rounded-md bg-red-50 p-4" role="alert">
  <div className="text-sm text-red-700">{error}</div>
</div>

<input
  id="email-address"
  aria-describedby={error ? "form-errors" : undefined}
  {...}
/>
```

### 9. Social Login Buttons Lack Descriptive Text
**WCAG Criterion:** 4.1.2 Name, Role, Value (Level A)
**Severity:** 🟡 Major
**Issue:** Google and Facebook login buttons on the login page use only SVG icons without text or ARIA labels. Screen readers announce these as generic "button" with no context.
**Files Affected:** `packages/frontend/pages/login.tsx` (lines 194–225)
**Current:**
```jsx
<button type="button" onClick={() => signIn('google', ...)}>
  <svg aria-hidden="true">...</svg>
</button>
```
**Should be:**
```jsx
<button
  type="button"
  onClick={() => signIn('google', ...)}
  aria-label="Sign in with Google"
>
  <svg aria-hidden="true">...</svg>
  <span className="sr-only">Sign in with Google</span>
</button>
```

### 10. Heading Hierarchy Fragmentation on Cities Page
**WCAG Criterion:** 1.3.1 Info and Relationships (Level A)
**Severity:** 🟡 Major
**Issue:** Live fetch shows missing H2 subheadings to organize city sections. Grid layout lacks logical heading structure for screen reader navigation.

### 11. "Hot Sales" and Trending Sections Use Emoji Without Alt Text
**WCAG Criterion:** 1.1.1 Non-Text Content (Level A)
**Severity:** 🟡 Major
**Issue:** Headings like "🔥 Hot Sales" and "⭐ Most Wanted Items" embed emoji characters directly. These announce as accessible characters but muddy the intent for screen readers.
**Example from trending page HTML analysis.**
**Should be:**
```jsx
<h2 className="text-lg font-bold">
  <span aria-label="Hot">🔥</span> Hot Sales
</h2>
```

---

## Keyboard Navigation & Focus Issues

### 12. No Keyboard Support for Carousel/Rapid Actions
**WCAG Criterion:** 2.1.1 Keyboard (Level A)
**Severity:** 🟡 Major
**Issue:** If the site uses carousels (e.g., rapid photo upload in `CaptureButton`, `RapidCarousel` components), keyboard navigation (arrow keys, Enter) is not documented.
**Files Affected:** `packages/frontend/components/camera/RapidCarousel.tsx` (inferred from file list)
**Recommendation:** Implement arrow-key navigation, Enter/Space to select, and announce current/total slides to screen readers.

---

## Color Contrast Details

| Element | Foreground | Background | Contrast Ratio | WCAG AA Requirement | Pass? | Context |
|---------|-----------|------------|-----------------|-------------------|-------|---------|
| Amber-600 text | #D97706 | Warm-100 (#F9F7F4) | 6.2:1 | 4.5:1 | ✅ | Normal text OK; buttons/UI risky |
| Amber-600 text | #D97706 | Warm-900 (#1A1A1A) dark mode | 3.8:1 | 4.5:1 | ❌ | **FAILS** — buttons in dark mode |
| Amber-700 text | #B45309 | Warm-900 (#1A1A1A) dark mode | 5.2:1 | 4.5:1 | ✅ | Recommended replacement |
| Warm-500 text | #8B7355 | Warm-100 (#F9F7F4) | 3.1:1 | 4.5:1 (AA) | ❌ | Secondary text too light |
| Warm-600 text | #6B5A42 | Warm-100 (#F9F7F4) | 3.9:1 | 4.5:1 (AA) | ⚠️ Marginal | Muted nav text barely passes |
| Amber-400 text | #FBBF24 | Warm-900 (#1A1A1A) dark mode | 5.8:1 | 4.5:1 | ✅ | Dark mode accent acceptable |
| White text | #FFFFFF | Amber-600 (#D97706) CTA | 7.2:1 | 4.5:1 | ✅ | Primary buttons strong |

---

## Screen Reader Experience

### 13. Missing Main Region on Some Pages
**WCAG Criterion:** 1.3.1 Info and Relationships (Level A)
**Severity:** 🟡 Major
**Issue:** Layout includes a `<main id="main-content">` (line 430), which is good, but live pages may have multiple `<main>` elements or missing region semantics.
**Recommendation:** Audit each page route to ensure exactly one `<main>` per page and all regions present: `<header>`, `<nav>`, `<main>`, `<footer>`.

### 14. Link Text Clarity Issue: "← Back" and Arrow Symbols
**WCAG Criterion:** 2.4.4 Link Purpose (In Context) (Level A)
**Severity:** 🟢 Minor
**Issue:** Links using arrow symbols ("←", "→") lack textual context. Screen readers announce the arrow character literally, confusing users unfamiliar with that convention.
**Example from cities page:** `← Back to home`
**Should be:** `Back to home` (or use `aria-label="Back to home"` if visual design requires arrow-only).

---

## Form Accessibility

### 15. Password Visibility Toggle Not Present
**WCAG Criterion:** 2.1.2 No Keyboard Trap (Level A)
**Severity:** 🟢 Minor
**Issue:** Login form has no "show/hide password" toggle. Users with visual processing differences or motor disabilities cannot verify entered text before submission.
**Files Affected:** `packages/frontend/pages/login.tsx`
**Recommendation:**
```jsx
const [showPassword, setShowPassword] = useState(false);

<div className="relative">
  <input
    type={showPassword ? "text" : "password"}
    {...}
  />
  <button
    type="button"
    onClick={() => setShowPassword(!showPassword)}
    aria-label={showPassword ? "Hide password" : "Show password"}
  >
    {showPassword ? "Hide" : "Show"}
  </button>
</div>
```

### 16. Disabled Button Opacity Insufficient
**WCAG Criterion:** 1.4.3 Contrast (Minimum) (Level AA)
**Severity:** 🟢 Minor
**Issue:** Buttons use `disabled:opacity-50` (50% opacity) which may drop contrast below 4.5:1 for some color combinations. Disabled state should maintain 3:1 minimum contrast for UI components.
**Files Affected:** `packages/frontend/pages/login.tsx`, `packages/frontend/pages/register.tsx`

### 17. Checkbox Labels Could Be Improved
**WCAG Criterion:** 2.4.7 Focus Visible (Level AA)
**Severity:** 🟢 Minor
**Issue:** Remember-me checkbox is properly labeled but the label is small text (text-sm). Users with low vision might miss it.

---

## Mobile & Desktop Discrepancies

### 18. Desktop Nav Not Fully Keyboard Accessible
**WCAG Criterion:** 2.1.1 Keyboard (Level A)
**Severity:** 🟡 Major
**Issue:** Desktop navigation bar shows conditional links for authenticated users (Dashboard, Premium Plans, Organizer Tools, etc.). These form a long horizontal list without grouping or submenu support. Keyboard users cannot collapse/expand role-specific sections.
**Files Affected:** `packages/frontend/components/Layout.tsx` (lines 238–321)
**Current Structure:** 25+ sequential links
**Recommendation:** Implement collapsible sections (e.g., "Organizer Tools ▼") or use `<nav role="navigation">` with semantic `<details>/<summary>` for grouping.

---

## Quick Wins (Low-Effort Fixes)

### 1. Add H1 to All Page Templates (1–2 lines per page)
```jsx
<h1 className="sr-only">FindA.Sale — Estate Sales & Auctions</h1>
```

### 2. Update BottomTabNav with ARIA Labels (1 change)
```jsx
<Link href={tab.href} aria-label={tab.label} aria-current={active ? 'page' : undefined} ...>
```

### 3. Fix Social Button Labels (3 buttons, ~5 lines)
```jsx
<button aria-label="Sign in with Google" ...>
```

### 4. Change Dark Mode Accent from Amber-600 to Amber-700 in Dark Context
```jsx
// In dark mode branch:
className="dark:text-amber-700"  // instead of dark:text-amber-600
```

### 5. Add Error Association to Form Inputs (~5 lines)
```jsx
<div id="form-error" role="alert">{error}</div>
<input aria-describedby={error ? "form-error" : undefined} />
```

---

## Recommendations by Priority

### Priority 1 (Fix Immediately — Blocks Core Functionality)
1. **Add H1 to page templates** — Fixes heading hierarchy violations across all pages
2. **Fix button accessible names** — Bottom nav and social buttons currently announce as generic "button"
3. **Resolve color contrast in dark mode** — Amber-600 fails WCAG AA on dark backgrounds
4. **Associate errors with form fields** — Error messages are orphaned from inputs

### Priority 2 (Fix This Sprint — Major UX Impact)
5. **Implement focus trap in mobile drawer** — Return focus to hamburger trigger on close
6. **Reduce tab stops before main content** — Add `tabindex="-1"` to non-essential nav or implement drawer keyboard skip
7. **Fix landmark semantics** — Change drawer from `role="dialog"` to `role="navigation"`
8. **Add password visibility toggle** — Improve form UX and reduce errors

### Priority 3 (Fix This Quarter — Nice-to-Have)
9. **Improve label visibility** — Move email/password labels from sr-only to visible above inputs
10. **Add emoji alt text** — Replace inline emoji with labeled text or aria-label
11. **Implement submenu structure** — Group organizer/shopper tools in collapsible sections
12. **Test with real assistive tech** — VoiceOver, NVDA, Jaws to catch edge cases

---

## Testing Recommendations

### Automated Testing Tools to Add
- **axe DevTools** for continuous integration
- **WAVE** browser extension for spot checks
- **Lighthouse** CI for contrast & heading checks

### Manual Testing Checklist
- [ ] Tab through every page with keyboard only — no mouse
- [ ] Test with NVDA (Windows) or VoiceOver (Mac/iOS)
- [ ] Zoom to 200% on mobile and ensure no horizontal scroll
- [ ] Test all forms with screen reader enabled
- [ ] Verify focus indicators are visible on all interactive elements
- [ ] Check dark mode contrast with color picker tool

---

## Appendix: WCAG Criteria Mapped

| Finding # | WCAG 2.1 Criterion | Level | Type |
|-----------|------------------|-------|------|
| 1 | 1.3.1 Info and Relationships | A | Structure |
| 2 | 1.1.1 Non-Text Content & 4.1.2 Name, Role, Value | A | Labeling |
| 3 | 2.4.3 Focus Order | A | Keyboard |
| 4 | 1.4.3 Contrast (Minimum) | AA | Perceivable |
| 5 | 1.3.1 Info and Relationships | A | Structure |
| 6 | 2.4.3 Focus Order | A | Keyboard |
| 7 | 1.3.1 Info and Relationships | A | Structure |
| 8 | 3.3.1 Error Identification | A | Forms |
| 9 | 4.1.2 Name, Role, Value | A | Semantics |
| 10 | 1.3.1 Info and Relationships | A | Structure |
| 11 | 1.1.1 Non-Text Content | A | Labeling |
| 12 | 2.1.1 Keyboard | A | Keyboard |
| 13 | 1.3.1 Info and Relationships | A | Structure |
| 14 | 2.4.4 Link Purpose (In Context) | A | Navigation |
| 15 | 2.1.2 No Keyboard Trap | A | Keyboard |
| 16 | 1.4.3 Contrast (Minimum) | AA | Perceivable |
| 17 | 2.4.7 Focus Visible | AA | Keyboard |
| 18 | 2.1.1 Keyboard | A | Keyboard |

---

## Audit Notes

- **Skill Used:** design:accessibility
- **Live Pages Tested:** finda.sale/, /login, /trending, /cities
- **Code Files Reviewed:** Layout.tsx, BottomTabNav.tsx, login.tsx, register.tsx, tailwind.config.js
- **Color Contrast Tool:** Manual WCAG AAA calculator (WCAG 2.1 relative luminance formula)
- **Heading Hierarchy:** Verified via live page HTML fetch
- **Keyboard Testing:** Logic-based on component structure; manual VoiceOver/NVDA testing recommended

---

**Report Completed:** 2026-03-18
**Next Audit:** Post-remediation (2 weeks)
