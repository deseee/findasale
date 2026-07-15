# FindA.Sale — Facebook Marketplace Autofill (browser extension)

Fills an organizer's Facebook Marketplace **Create listing** form — title, price,
condition, description, and **photos** — straight from their FindA.Sale inventory.
The organizer reviews and clicks **Publish**. FindA.Sale never logs into Facebook
or publishes for them.

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
3. A Facebook "Create listing" tab opens; each item's fields + photos auto-fill.
4. **You review and click Publish.** Then click **"I published — next item"** in the
   FindA.Sale panel to advance to the next queued item.

## How it works
- `popup.js` → asks the background worker for the organizer's items.
- `background.js` → reads the finda.sale `accessToken` cookie, calls
  `finda.sale/api/extension/*` with a Bearer token, and fetches item photos
  cross-origin (Cloudinary + eBay hosts).
- `fas-content.js` → on `facebook.com/marketplace/create/*`, fills fields via the
  React-safe native setter and injects photos into Facebook's file input
  (`fetch → File → DataTransfer → input.files → change`). Never clicks Publish.
- `fas-selectors.js` → the ONLY place Facebook's form is located, by role/aria/text
  (never Facebook's CSS classes). If Facebook changes their form, update this file.

## Guardrails
- No auto-publish (human clicks Publish — the ban-risk firewall).
- Runs only in the organizer's own session, at human pace, opt-in.
- Not a pnpm workspace member; never built/deployed by Vercel or Railway.
