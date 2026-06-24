# UX Audit — Organizer Claim Flow (Post-Click Conversion)
**Date:** 2026-06-01
**Trigger:** Outreach pipeline: 757 sent, 154 opened (20.3%), 2 clicked (0.3%), **0 claimed (0%)**
**Scope:** Full path from outreach email click → organizer dashboard

---

## Job to be Done

An estate sale organizer clicked an email link about their FindA.Sale storefront. In the next 2–5 minutes they are trying to: **take ownership of the profile we built for them.**

That's the job. Every step that isn't that job is friction.

---

## Flow Map (current state)

```
Email CTA click
  → /api/outreach/click?trackingId=...&original=... (redirect)
    → /organizers/{id}?utm_source=outreach&... (organizer profile page)
      → user scrolls, reads, finds "Claim This Profile — It's Free" button
        → window.location.href = /register?claim={organizerId}
          → /register page (generic "Create your account" form)
            → user completes 8-9 fields
              → registration POST → login token
                → router.push('/organizer/dashboard')  ← claim never fires
```

---

## Findings

### P0 — Bug: The claim is silently never completed

**File:** `pages/register.tsx` + `pages/_app.tsx`

This is the root cause of 0 claimed from 2 clicks.

The claim button on `/organizers/[id].tsx` does:
```js
window.location.href = `/register?claim=${organizer.id}`;
```

The register.tsx `useEffect` reads URL params — but **only** `?ref=`, `?aff=`, and `?invite=`. It never reads `?claim=`. So `claimOrganizerId` is never written to sessionStorage.

The claim execution logic lives in `_app.tsx` (lines 169–185) and reads `sessionStorage.getItem('claimOrganizerId')`. Since that key is never written, the claim never fires — for either auth path.

Additionally, the email/password registration `handleSubmit` has **zero claim logic**. The `/api/organizers/{id}/claim-oauth` endpoint is only called from the OAuth callback path. An organizer who registers with email+password and arrives from the claim flow never gets their profile linked.

**Impact:** Every person who has ever clicked "Claim This Profile" and registered with email/password has an account but no linked profile. The platform shows 0 claimed — this is why.

**Fix required (findasale-dev):**

1. In `register.tsx` useEffect, add:
```ts
const claim = params.get('claim');
if (claim) {
  sessionStorage.setItem('claimOrganizerId', claim);
  setFormData(prev => ({ ...prev, role: 'ORGANIZER' }));
}
```

2. In `register.tsx` `handleSubmit`, after successful registration when role === ORGANIZER, fire the claim endpoint:
```ts
const claimId = sessionStorage.getItem('claimOrganizerId');
if (claimId) {
  sessionStorage.removeItem('claimOrganizerId');
  try {
    await api.post(`/organizers/${claimId}/claim-oauth`);
  } catch (_) { /* non-fatal */ }
  router.push('/organizer/dashboard?claimed=true');
  return;
}
```

3. In `register.tsx` OAuth button handlers, add before `signIn()`:
```ts
const claimParam = new URLSearchParams(window.location.search).get('claim');
if (claimParam) sessionStorage.setItem('claimOrganizerId', claimParam);
```

---

### HIGH — Role defaults to "Shopper"

**File:** `pages/register.tsx` — `role` state initializes to `'USER'`

An estate sale organizer arriving from outreach email sees a form that defaults to "Shopper." Business fields (business name, phone, address) are hidden behind the role dropdown — they only appear after the user changes the selector to "Sale Organizer."

An organizer who misses the dropdown or doesn't understand the distinction registers as a Shopper. Even if the `?claim=` fix ships, a Shopper registration won't have the ORGANIZER role needed for the claim to make sense on their dashboard.

**Fix:** Already included in P0 fix #1 above — `setFormData(prev => ({ ...prev, role: 'ORGANIZER' }))` when `?claim=` is present.

---

### HIGH — No contextual framing: "Create your account" ≠ "Claim your profile"

**File:** `pages/register.tsx` — h2 text is "Create your account"

The organizer clicked an email about *their storefront*, arrived at *their profile page*, clicked *"Claim This Profile"* — and landed on a completely generic page with no mention of the business they're claiming or what happens after they register.

There is no: "You're claiming [Business Name]'s profile." No: "Once you register, you'll have full control of this storefront." Nothing that connects the registration to the action they started.

A confused user leaves. Two people clicked, zero claimed.

**Fix:** When `?claim=` is present (and optionally `?biz=` business name can be passed as a URL param):

```tsx
{claimOrganizerId && (
  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-center">
    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
      You're claiming your FindA.Sale storefront.
    </p>
    <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
      Create a free account to take ownership and start managing your profile.
    </p>
  </div>
)}
```

Also change the h2 from "Create your account" to "Claim your storefront" when `?claim=` is in the URL.

---

### HIGH — 3-step click path adds unnecessary drop-off point

**Flow:** Email → Organizer profile page → Register page

The email CTA links to `/organizers/{id}` (the profile page), not directly to `/register?claim={id}`. The organizer must then find and click the claim button *again* on the profile page.

The profile page is value-building (shows their scraper data, sales history preview) but it also adds a drop-off point. The 2 clicks tracked may have gone to the profile page, not to the register page — meaning the actual click-to-register conversion is unknown.

**Fix (medium effort):** Add a direct `?action=claim` path. If `?action=claim` is in the URL on the profile page, immediately redirect to `/register?claim={id}` without requiring an additional button click. This preserves the profile page for organic/direct visitors while fast-pathing outreach clicks.

Alternatively: for Touch 1–2 emails, change the CTA from "See your storefront" to "Claim your storefront" and link directly to `/register?claim={id}`. The profile page is more appropriate for Touch 3–4 (re-engagement) where curiosity is the job.

---

### MEDIUM — Date of birth required, contradicts "Claim in 30 seconds"

**File:** `pages/register.tsx` — `dateOfBirth` required field with COPPA copy

The DOB field is required. It's labeled "required to verify you're 13 or older." Estate sale organizers are typically 40–65 years old. Requiring a date of birth is unexpected friction in what the email positioned as "Claim in 30 seconds" / "Takes 2 minutes."

The 30-second promise vs. 9-field form is a trust violation. If someone opens a form expecting 30 seconds and finds 9 required fields, a significant fraction will close the tab.

**Fix (design):** Cannot remove DOB (COPPA compliance). Options:
1. Move DOB to the end of the form, after all the "important" fields — it reads less like a barrier
2. Change the label copy from "required to verify you're 13 or older" to just "Date of birth" — the compliance reason makes it feel more surveillance-y than necessary
3. Update email copy to say "Takes 2 minutes" (accurate) instead of "Claim in 30 seconds" (not accurate for form completion)

---

### MEDIUM — "47 shoppers viewed your sales" is hardcoded

**File:** `pages/organizers/[id].tsx` line ~472

```tsx
<p className="text-xs text-center text-gray-500 dark:text-gray-400">
  Takes 2 minutes · <strong className="text-gray-400 dark:text-gray-300">47 shoppers</strong> viewed your sales this month
</p>
```

Every single unclaimed organizer profile shows "47 shoppers viewed your sales this month" — regardless of actual view count. This is fabricated social proof. If an organizer is tech-savvy enough to check their analytics elsewhere and sees it doesn't match, this destroys trust. And it means the urgency signal is the same for an organizer with 2 scraper listings and one with 40.

**Fix:** Wire this to the actual organizer page view count from the outreach page-view logging (which already fires on `?ref=outreach` visits — see the useEffect at line 120). Or use the existing `followerCount` or sale count as a proxy if view count isn't stored. If no real data is available, remove the stat entirely — an honest empty is better than a fake number.

---

### LOW — Invite code field creates "gated" impression

**File:** `pages/register.tsx` — invite code field with "Beta Invite Code (if you have one)" label

The field is optional, but it's visually prominent and uses the word "Beta." For organizers who arrived from a cold email about their storefront, seeing a "Beta Invite Code" field signals: "This might be invite-only. Do I qualify?"

They don't have a code. They don't know if they need one. Some will bounce.

**Fix:** Hide the invite code field when `?claim=` is in the URL. Organizers arriving from outreach are pre-qualified — they don't need an invite code and shouldn't see one.

---

## Summary Table

| Severity | Issue | File | Fix |
|----------|-------|------|-----|
| **P0** | `?claim=` param never stored to sessionStorage — claim never fires | `register.tsx` | Add `sessionStorage.setItem('claimOrganizerId', claim)` in useEffect |
| **P0** | Email/password registration has zero claim logic | `register.tsx` handleSubmit | Fire `/organizers/{id}/claim-oauth` after successful ORGANIZER registration |
| **P0** | OAuth buttons don't store `claimOrganizerId` before signIn() | `register.tsx` OAuth handlers | Add sessionStorage write before each `signIn()` call |
| **HIGH** | Role defaults to "Shopper" when arriving from claim flow | `register.tsx` | Pre-select ORGANIZER when `?claim=` present (included in P0 fix) |
| **HIGH** | No contextual framing — page says "Create your account" | `register.tsx` | Add claim context banner + change h2 when `?claim=` present |
| **HIGH** | 3-step click path (email → profile → register) | `organizers/[id].tsx` + email templates | Add `?action=claim` fast-path OR change CTA links to point directly to `/register?claim=` |
| **MEDIUM** | DOB field contradicts "30 seconds" email promise | `register.tsx` | Move DOB to bottom, remove compliance copy, fix email time estimate |
| **MEDIUM** | "47 shoppers" stat is hardcoded fake number | `organizers/[id].tsx` | Wire to real view count or remove |
| **LOW** | Invite code field visible to outreach claimants | `register.tsx` | Hide when `?claim=` present |

---

## Dev Handoff

All P0 and HIGH fixes are in `register.tsx` and `organizers/[id].tsx`. Changes are targeted — no schema changes, no backend changes. The backend `claim-oauth` endpoint already exists and already works (it's the same one used in `_app.tsx`). This is purely a frontend wiring fix.

**Priority order for findasale-dev:**
1. P0 fixes in `register.tsx` (useEffect + handleSubmit + OAuth handlers) — 20 lines max
2. Claim context banner + h2 change in `register.tsx` — 10 lines
3. Role pre-selection — already in #1
4. "47 shoppers" hardcoded stat — 5 lines (remove or wire)
5. Invite code hide — 5 lines
6. `?action=claim` fast-path — separate ticket, medium effort

**TypeScript check required before push:**
```bash
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```

---

## Open Question for Patrick

The email CTA currently links to the organizer profile page (`/organizers/{id}`), not directly to `/register?claim={id}`. Changing the CTA to go straight to registration skips the "see your storefront" value-building moment.

**Decision:** For Touch 1 (cold first contact), keep the profile page link — the organizer should see what we built before committing. For Touch 3+ (re-engagement, "you opened but didn't click"), link directly to `/register?claim={id}` — they've already seen it, they just need to be moved to action.

No Patrick action needed to ship the P0 fix — that's dev work. This is just strategic context.
