# FindA.Sale — Facebook Marketplace Autofill (browser extension)

Fills an organizer's Facebook Marketplace **Create listing** form — title, price,
condition, description, and **photos** — straight from their FindA.Sale inventory,
then auto-advances through Delivery, Offer, and Groups and clicks **Publish** itself
(2026-07-15 ADR-084 amendment). It stops immediately and asks for help if any step
doesn't match what it expects — it never guesses past a step it can't find. FindA.Sale
never logs into Facebook directly; everything runs inside the organizer's own
browser session. It drives Facebook's form with ordinary content-script events. The
Chrome `debugger` permission is declared in the manifest but is used only on Grailed
(a real mouse click for its Designer field) and for dismissing a navigation dialog
during Vinted runs; the Facebook flow itself does not use it.

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
  or step button not found) rather than guessing past it. Clicks are ordinary
  content-script synthetic events — `realClick()` in `fas-selectors.js` dispatches a full
  hover/focus/press/release sequence (pointerover → pointerenter → pointermove →
  pointerdown → mousedown → focus → pointerup → mouseup → click), which Facebook's
  shipping-weight picker and "Update" button accept (confirmed live 2026-07-17). The
  Facebook flow does not need the debugger permission.
- `fas-selectors.js` → the ONLY place Facebook's form is located, by role/aria/text
  (never Facebook's CSS classes). If Facebook changes their form, update this file.

## Kits / bundles
A kit (`listingType: 'KIT'`) posts exactly like any other item on every marketplace. The backend sends
`isKit`, `kitComponents: [{ title, quantity }]` and a description that already ends with an "Includes:" list;
`config.js` (`FAS_KIT`) forwards those fields through the queue entries and sets `quantity` from the item's
current stock. The popup shows a KIT badge and the component list. `fas-quantity.js` fills a listing form's
Quantity input when the form has one (a no-op elsewhere). Stock changes caused by a component sale reach the
extension through the same `/extension/pending-updates` and `/extension/price-sync-queue` notifications as
price changes. As of 1.0.6 they are APPLIED automatically (see "Automatic price and stock sync" below) instead of only notifying.

## Guardrails
- Stops on hard errors only (a required field or step button genuinely not found) —
  never guesses past a step it can't confidently complete, never marks an item listed
  without confirming Facebook's own URL left the create-listing flow.
- Groups: never auto-checks any of the organizer's Facebook groups (left at Facebook's
  own default of none selected) — a deliberate choice, not a limitation.
- Runs only in the organizer's own session, with human-paced delays between actions,
  opt-in per organizer.
- Not a pnpm workspace member; never built/deployed by Vercel or Railway.
- Uses only ordinary content-script synthetic events to interact with Facebook's form.
  Facebook's shipping-weight picker and "Update" button accept these events given the
  full hover/focus/press/release sequence (confirmed live 2026-07-17). The `debugger`
  permission (Chrome DevTools Protocol) is used only for Grailed's Designer field and a
  Vinted navigation dialog; Chrome shows its "is debugging this browser" banner while it
  is attached.
- Marketplace policy research, enforcement evidence and the soft-go policy live in
  ADR-084 (Addendum 2026-10-01 and the research passes after it).
- findasale-legal reviewed this amendment 2026-07-15 and approved it for shipping with
  the conditions above — see ADR-084's amendment section.

## Automatic price and stock sync (1.0.6)
When you change an item's price or stock on FindA.Sale, the extension updates the live listing itself on Facebook Marketplace,
Craigslist, Gumtree Australia, Poshmark, Mercari and Grailed. No clicks, no "go update it" reminder. It uses the same consent
setting as listing removal: popup > More settings > **Keep listings in sync**: *Update & remove automatically* (default) applies
changes in a background tab, *Notify me* only reminds you, *Off* does nothing. The per-marketplace Pause also applies.

How a change is applied (`fas-edit-core.js`, `fas-edit-engine.js`, `background.js` "Automatic price + quantity apply"):
- Every ~20 min the existing alarm reads `GET /extension/pending-updates` (Facebook) and `GET /extension/price-sync-queue` (the
  other five): entries carry `priceDrift`, `quantityDrift`, `price`/`newPrice`, `quantity` and (where the backend knows it) the
  remote listing id. They are queued and worked through ONE marketplace at a time, ONE listing at a time, in a dedicated tab.
- The engine is injected on demand (`chrome.scripting.executeScript`, no new content-script entries or host permissions are needed;
  the existing host permissions cover all six sites). Each call does a single action and reports; `background.js` keeps the state
  because a page navigation destroys page JS.
- The listing is found by id when known, otherwise **discovered** from the seller's own management page by exact title (never
  guessed; zero or ambiguous matches fail the item). A URL like `/sell/edit/<id>/` is only a first attempt.
- **Nothing counts as done until the new value is read back from the live listing** (Poshmark: a second API GET; the others: the
  reloaded edit form or the dashboard row). Only then is `POST /extension/items/:id/price-synced` (Facebook) or
  `/price-synced-for-platform` (others) called.
- Failure leaves the drift in place and retries on a capped exponential backoff: 15 min, 30 min, 1 h ... capped at 6 h; after 6
  failures an item is parked for 24 h, then gets a fresh ladder. A block (login wall, challenge/Cloudflare page, CAPTCHA or phone
  verification, HTTP 403/429, "action blocked") stops that marketplace's run and backs the whole marketplace off the same way.
- Pace: serial edits, 2-9 s jitter between listings (Facebook 4-9 s), per-run and per-hour caps per marketplace
  (`LIMITS` in `fas-edit-core.js`).
- Notifications happen ONLY on failure (first failure of an item, when it gets parked, or when a marketplace run is blocked).
- Quantity: Poshmark (`inventory.size_quantities[].quantity_available`, revision echoed back) and Facebook (when its edit form has a
  Quantity control) are written. Craigslist, Gumtree, Mercari and Grailed are one unit per listing, so a stock change is
  acknowledged to the backend without an edit. A stock of 0 is not an edit at all: the item is SOLD and the existing
  `/extension/pending-removals` flow removes the listing automatically (same alarm tick, same setting).
- Popup > More settings > **Price and stock sync** shows the last run, the log, "Sync now", and **Copy edit diagnostics**: per
  marketplace, the edit page's form field names/aria-labels, button texts and the last network URLs, captured at the form and at every
  failure, so selectors can be tightened from real data.

Per-marketplace mechanics and selector provenance:
| Marketplace | Path | Save | Verify | Provenance |
|---|---|---|---|---|
| Poshmark | same-origin JSON API: `meta#csrftoken` on `/edit-listing/<24hex>`, `GET/POST /vm-rest/posts/<id>`, full post echoed back; falls back to the edit form (`#listing-price-modal-listing-price-input`, `[data-et-name=update]`) | `POST` | re-GET (or reloaded form) | verified-in-DOM (edit page, csrf meta, inputs, Update); API endpoints documented (phposh, ai-listings) |
| Mercari | item page `a[data-testid=EditListing]` -> `/sell/edit/<id>/`, `input#Price[name=sellPrice]` | `button[data-testid=ListButton]` "Update" | reload edit page, read price | verified-in-DOM |
| Grailed | `/listings/<id>/edit` (found from `/sell/for-sale` cards), `input[type=tel][name=price]`, floor `smartPricing.minimumPrice` | "PUBLISH" submit | reload edit page, read price | verified-in-DOM |
| Craigslist | account dashboard row -> POST `edit` form (hidden `crypt`) -> `input[name=price]` -> Continue... | Continue chain | dashboard row "- $price" suffix | dashboard + edit form verified-in-DOM; edit form price field name documented only |
| Facebook | listing page / selling dashboard -> Edit control (aria-label) -> Price input after the "Price" label span | Save/Update/Next | reload, reopen edit, read price | not inspectable (signed out): documented + discovery + diagnostics |
| Gumtree AU | `m-my-ads.html` -> Edit -> `form#pstad-main-form` `price.amount` | "Save ad" | re-open edit, read price | not inspectable (signed out): documented + discovery + diagnostics |

Listing references (1.0.7): when a posting succeeds, every platform's content script now sends the posted listing's URL and/or bare id with
`markListed` (`remoteListingUrl` / `remoteListingId`), so edits go straight to the live listing instead of title-matching. Captured from the
post-submit page: Poshmark `/listing/<slug>-<24hex>`, Grailed `/listings/<id>`, Mercari `/us/item/m<id>/`, Craigslist the posting id on the
confirmation/manage page (9-12 digits), Gumtree AU the ad id (8-12 digits), Facebook `/marketplace/item/<id>`. Capture is best-effort: if the
page shows no id yet, `markListed` goes out with nulls exactly as before and a posting is never blocked or failed. Listings with no stored
reference are picked up after the fact: when a price/stock edit finds and verifies the live listing by title, its id is reported once to the
backend (`/remote-listing-id`, set-once). Id formats validated in the extension (`fas-listing-ref.js` `REMOTE_ID_RE`) and background
(`SET_REMOTE_ID_CONFIG`) match the backend: Facebook numeric item id, Poshmark 24-hex, Mercari `m<digits>`, Grailed numeric, Craigslist 9-12
digits, Gumtree AU 8-12 digits (Vinted unchanged).
