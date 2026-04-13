# QA Evidence Schema — FindA.Sale
**Version:** 1.0 — S300 (2026-03-26)
**Authority:** CLAUDE.md §9 + findasale-qa SKILL.md
**Purpose:** Define what constitutes valid evidence for a ✅ QA verdict

---

## The Core Rule

A ✅ is valid only when it includes screenshot IDs proving the POST-ACTION STATE.

Post-action state = the state that ONLY EXISTS if the action succeeded.

---

## Required Evidence for Every ✅

### Step-by-step process (mandatory order):

1. Navigate to the feature URL in Chrome MCP
2. **Screenshot BEFORE:** `computer(action:"screenshot", save_to_disk:true)` → save ID as `before_id`
3. Perform the interaction (click, type, submit, upload)
4. Wait for response (confirm no error state)
5. **Screenshot AFTER:** `computer(action:"screenshot", save_to_disk:true)` → save ID as `after_id`
6. Reload the page (navigate away + back, or Ctrl+R)
7. **Screenshot RELOAD:** `computer(action:"screenshot", save_to_disk:true)` → save ID as `reload_id`
8. Write verdict with all IDs

### Required evidence sentence format:
```
Navigated to [URL] as [user/role]. Clicked [exact element]. Saw [specific outcome] — screenshot [after_id]. Reloaded — [outcome persisted/not] — screenshot [reload_id].
```

---

## What "Post-Action State" Means

The screenshot must show evidence that ONLY EXISTS if the action succeeded:

| Feature | ❌ Wrong Screenshot | ✅ Correct Screenshot |
|---------|-------------------|----------------------|
| Edit item field | Form with save button visible | Edited value displayed after reload |
| Upload photo | Upload button / file picker | Photo visible in item gallery |
| Add brand follow | Follow button | Brand name in Followed Brands list |
| Delete item | Delete confirmation dialog | Item absent from item list after reload |
| Submit form | Filled form | Success toast / confirmation page |
| Like item | Like button | Filled heart icon after reload |
| Send message | Compose box | Message visible in conversation thread |
| Create sale | Sale creation form | New sale appearing in sales list |

---

## How Patrick Spot-Checks Without Retesting

Each ✅ in the findings table includes screenshot IDs. Patrick:

1. Opens screenshot `[after_id]` — does it show what's described as the outcome?
2. Opens screenshot `[reload_id]` — does the outcome persist after reload?

If screenshot shows the wrong thing (page load, error state, form pre-action) → ✅ is invalidated immediately.

**Patrick does not need to retest. He looks at the screenshot and asks: "does this show what would only exist if the action succeeded?"**

---

## Valid Evidence Examples

### ✅ Item Edit (correct)
```
Navigated to /organizer/add-items/sale123 as user2@example.com.
Clicked Edit on item "Victorian Lamp". Changed price from $25 to $45. Clicked Save Changes.
Saw price updated to $45.00 in item card — screenshot ss_abc123.
Navigated away to /organizer/dashboard, returned to /organizer/add-items/sale123 — price still $45.00 — screenshot ss_def456.
```

### ✅ Brand Follow (correct)
```
Navigated to /shopper/dashboard as user11@example.com. Clicked Brands tab.
Typed "Williams Estate" in brand search. Clicked Follow.
Saw "Williams Estate" appear in Followed Brands list — screenshot ss_ghi789.
Refreshed page — "Williams Estate" still in list — screenshot ss_jkl012.
```

### ❌ Rubber-stamp (invalid — no screenshots)
```
Navigated to item edit page. Edit and Delete buttons visible. Feature working correctly.
```

### ❌ Page-load stamp (invalid — wrong state)
```
Navigated to /organizer/add-items/sale123. Page loaded successfully — screenshot ss_mno345.
```
*(Screenshot shows page load, not post-edit outcome — invalid.)*

---

## UNVERIFIED Is Always Valid

If Chrome MCP is unavailable, the feature has no test data, or the interaction fails:

```
UNVERIFIED — Chrome MCP timeout. Could not complete interaction.
What's needed: Chrome MCP access + sale with existing items for user2@example.com.
```

One honest UNVERIFIED is worth ten fabricated ✅ marks.

---

## PostStop Hook Enforcement

The `.claude/hooks/qa-evidence-verifier.sh` hook fires when any QA session ends.

- If ✅ marks found with ZERO screenshot evidence → **exit 2 (session blocked)**
- If ✅ count significantly exceeds screenshot count → **warning (session continues)**
- If evidence ratio looks reasonable → **pass (session completes normally)**

The hook cannot be bypassed. Exit code 2 blocks session completion.
