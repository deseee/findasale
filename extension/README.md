# FindA.Sale — Facebook Marketplace Autofill (browser extension)

Fills an organizer's Facebook Marketplace **Create listing** form — title, price,
condition, description, and **photos** — straight from their FindA.Sale inventory,
then auto-advances through Delivery, Offer, and Groups and clicks **Publish** itself
(2026-07-15 ADR-084 amendment). It stops immediately and asks for help if any step
doesn't match what it expects — it never guesses past a step it can't find. FindA.Sale
never logs into Facebook directly; everything runs inside the organizer's own
browser session.

Why an extension: Facebook has no Marketplace listing API, only personal profiles
can list (not Pages), and the bulk-upload spreadsheet has no photo column — so the
only way to get photos + fields into a listing is inside the organizer's own
browser session. Full rationale: `claude_docs/architecture/ADR-084-marketplace-autofill-extension.md`.

## Load it (developer / beta)
1. Chrome/Edge → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. Sign in at https://finda.sale as an organizer in the same browser.

## Use it
1. Click the FindA.Sale toolbar icon → your items load (grouped by sale; already-
   listed items are hidden by default).
2. Tick the items you want to list → **List N on Marketplace**.
3. A Facebook "Create listing" tab opens; each item's fields + photos auto-fill,
   and the extension clicks through Delivery, Offer, and Groups and publishes it.
4. It automatically moves to the next queued item. If anything doesn't match what
   Facebook is expected to show, it stops and tells you exactly which step failed —
   nothing further gets published until you check it.

## How it works
- `popup.js` → asks the background worker for the organizer's items.
- `background.js` → reads the finda.sale `accessToken` cookie, calls
  `finda.sale/api/extension/*` with a Bearer token, and fetches item photos
  cross-origin (Cloudinary + eBay hosts).
- `fas-content.js` → on `facebook.com/marketplace/create/*`, fills fields via the
  React-safe native setter, injects photos into Facebook's file input
  (`fetch → File → DataTransfer → input.files → change`), then auto-advances through
  Delivery/Offer/Groups and clicks Publish. Stops on any hard error (a required field
  or step button not found) rather than guessing past it.
- `fas-selectors.js` → the ONLY place Facebook's form is located, by role/aria/text
  (never Facebook's CSS classes). If Facebook changes their form, update this file.

## Guardrails
- Stops on hard errors only (a required field or step button genuinely not found) —
  never guesses past a step it can't confidently complete, never marks an item listed
  without confirming Facebook's own URL left the create-listing flow.
- Groups: never auto-checks any of the organizer's Facebook groups (left at Facebook's
  own default of none selected) — a deliberate choice, not a limitation.
- Runs only in the organizer's own session, with human-paced delays between actions,
  opt-in per organizer.
- Not a pnpm workspace member; never built/deployed by Vercel or Railway.
- findasale-legal reviewed this amendment 2026-07-15 (reviewed and approved for shipping,
  clear-to-ship with the above conditions) — see ADR-084's amendment section.
