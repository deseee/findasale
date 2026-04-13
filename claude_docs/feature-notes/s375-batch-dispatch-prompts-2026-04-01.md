# S375 Batch Dispatch Prompts — Features #229, #235, #240–244
**Prepared:** S374 (2026-04-01)
**Intent:** One-shot or near-one-shot build of 7 features across parallel agent dispatches
**Load this doc at session start before dispatching any agents**

---

## Pre-Dispatch Survey Findings (S374)

**DO NOT RE-SURVEY — facts locked here:**

- `pdfkit` (^0.15.0) and `qrcode` (^1.5.4) **already installed** in `packages/backend/package.json`
- `printKitController.ts` **already exists**: yard sign QR page + Avery 5160 item sticker grid. Features #240/#242 are extensions of this, not new builds.
- `labelController.ts` **already exists**: 4×3" single-item labels + multi-item sale PDF. Item labels currently show text ID only — no QR code.
- `marketingKitController.ts` and `earningsPdfController.ts` also use PDFKit — same lazy-require pattern.
- `brand-kit.tsx` page **already exists** at `packages/frontend/pages/organizer/brand-kit.tsx`
- `print-kit/[saleId].tsx` **already exists** at `packages/frontend/pages/organizer/print-kit/[saleId].tsx`
- Item schema already has: `estimatedValue Decimal?`, `aiSuggestedPrice Decimal?` — no new schema fields needed for #229 Phase 1
- No `SaleDonation`, `TaxReceipt`, `EbayListing`, or `OrganizerEbayConnection` models exist yet — #235 and #244 Phase 2 need migrations
- No smart cart code exists anywhere
- No eBay comp or export code exists anywhere
- Dashboard tools grid references `print-inventory` with PRO tier gate — confirms print tools are in the organizer tools section

---

## Batching Strategy

**⚠️ File ownership rules — agents touching the same file must be in the same agent or run sequentially:**

| Agent | Features | Schema? | Key files owned | Can parallel with? |
|-------|----------|---------|-----------------|-------------------|
| Agent 1 | #240 + #242 | No | `printKitController.ts`, `labelController.ts`, `print-kit/[saleId].tsx` | 2, 3, 4 |
| Agent 2 | #241 | No | `brand-kit.tsx`, new `brandKitPrintController.ts` | 1, 3, 4 |
| Agent 3 | #229 + #244 Phase 1 | No | new `ebayController.ts`, `items/[id].tsx` or new page | 1, 2, 4 |
| Agent 4 | #243 | No | new `useShopperCart.ts`, new `ShopperCartDrawer.tsx`, `sales/[id].tsx` | 1, 2, 3 |
| Agent 5 | #235 | **Yes** | `schema.prisma`, new `charityController.ts`, new `charity-close/[saleId].tsx`, `edit-sale/[id].tsx` | None (schema = run solo) |

**Session A:** Dispatch Agents 1, 2, 3, 4 in PARALLEL. All are no-schema, no file conflicts.
**Session B:** Dispatch Agent 5 alone. Patrick deploys migration before other features that depend on it.

**⚠️ eBay API key blocker for #229:** Patrick must create an eBay developer app at https://developer.ebay.com to get `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` for the Browse API. Agent 3 should build the endpoint but it will return a placeholder/mock response until credentials are set. Flag this in the dispatch.

---

## AGENT 1 DISPATCH PROMPT
### Features: #240 Print-to-QR Sign Kit + #242 QR/Barcode Item Labels

```
You are building two related extensions to the existing print infrastructure for FindA.Sale.

IMPORTANT: Read these files FIRST before writing any code:
1. packages/database/prisma/schema.prisma — confirm Item and Sale fields
2. packages/backend/src/controllers/printKitController.ts — EXISTING yard sign + sticker logic
3. packages/backend/src/controllers/labelController.ts — EXISTING label logic
4. packages/frontend/pages/organizer/print-kit/[saleId].tsx — EXISTING print kit UI
5. packages/backend/src/routes/*.ts — find where print/label routes are registered

---

FEATURE #240: Print-to-QR Sign Kit (ORG, SIMPLE)
Goal: Expand the existing printKitController.ts to support additional sign templates beyond the current yard sign. Add new endpoints/templates for directional signs, table tents, hang tags, and a second QR yard sign layout.

Backend — extend printKitController.ts with new export functions:
- `getYardSignKit` (existing — keep, improve design): Larger QR code + sale title + date + address + "Scan to browse & buy" tagline. Letter size.
- `getDirectionalSignKit` NEW: Half-page (5.5"×8.5") landscape. Arrow graphic (simple ▶) + "Estate Sale →" or "Yard Sale →" text + QR. Intended for street corners. Generate 2 per page.
- `getTableTentKit` NEW: 4"×6" folded tent card design. Front: sale name + QR + date/time. Back: FindA.Sale URL text. Landscape, 2 per page.
- `getHangTagKit` NEW: 3"×2" hang tag sheet, 4×2 grid (8 per page). Each tag: sale name (small) + QR code. Perforated-style border (dashed rect).
- `getFullSignKitPDF` NEW: Combined multi-section PDF containing all of the above in one download.

Each endpoint: GET /api/organizer/sales/:saleId/signs/[type] where type = yard | directional | table-tent | hang-tag | full-kit

All use the same PDFKit lazy-require pattern already in the file. Ownership check: sale.organizer.userId === req.user.id.

Frontend — extend print-kit/[saleId].tsx:
Add a "Sign Templates" section above the existing content. Show 5 download buttons (one per sign type + full kit). Each button triggers a download via window.open(`${apiBase}/organizer/sales/${saleId}/signs/yard`, '_blank') pattern. Add a brief description under each button explaining the use case. Keep the existing item price tags section below.

---

FEATURE #242: QR/Barcode Item Labels (ORG, SIMPLE)
Goal: Add actual QR codes to item labels. Currently labelController.ts shows text "ID: {item.id}" — replace with a scannable QR code that links to the item's public page.

Backend — modify labelController.ts:
- Import QRCode from 'qrcode' (already installed)
- In drawLabel(): generate a QR buffer for `${FRONTEND_URL}/items/${item.id}` using QRCode.toBuffer(), then embed it as a small image (40×40px) in the bottom-right of the label
- Keep all existing label text (title, price, category, condition, sale name)
- For the multi-label PDF endpoint, generate all QR buffers first, then render (avoid async issues inside the loop — use Promise.all before the render loop)

Frontend — extend print-kit/[saleId].tsx:
Add a "QR Item Labels" section. Two download options:
1. "Download QR Labels (6-up)" — calls GET /api/sales/:saleId/labels (already exists, modified)
2. "Download QR Labels (Avery 5160 stickers)" — existing sticker sheet from printKitController.ts

Also add a "Print Single Label" link on the item edit page (packages/frontend/pages/organizer/edit-item/[id].tsx) — a small "🏷️ Print Label" button that opens /api/items/:id/label in a new tab.

---

NAVIGATION:
In the organizer dashboard (packages/frontend/pages/organizer/dashboard.tsx), find the tools grid section. Confirm a "Print Kit" link exists. If it only links to /organizer/print-inventory, add or update it to also show a "Signs & Labels" tool entry linking to /organizer/print-kit (requires a saleId — so the link should go to /organizer/sales then the user selects a sale, OR route to a sale selector modal). Check how other sale-scoped tools handle this (e.g., holds.tsx uses ?saleId= query param).

---

KNOCK-ON EFFECTS:
- Grep for all usages of '/api/organizer/sales/:saleId/print-kit' — confirm the existing frontend correctly calls this route after any path changes
- Grep for 'labelController' and 'getSingleItemLabel' in routes files — confirm routes are still registered correctly

TYPESCRIPT CHECK (mandatory before returning):
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
Both must return zero errors.

Return: explicit list of every file created or modified.
```

---

## AGENT 2 DISPATCH PROMPT
### Feature: #241 Organizer Brand Kit Expansion

```
You are extending the existing Brand Kit feature (#31) for FindA.Sale.

IMPORTANT: Read these files FIRST before writing any code:
1. packages/database/prisma/schema.prisma — confirm BrandKit/Organizer model fields (look for logoUrl, primaryColor, secondaryColor, etc.)
2. packages/frontend/pages/organizer/brand-kit.tsx — ENTIRE FILE. This is the existing brand kit UI.
3. packages/backend/src/controllers/marketingKitController.ts — see how PDFKit is used for brand-aware PDFs
4. packages/backend/src/routes/*.ts — find where brand kit routes are registered

---

FEATURE #241: Organizer Brand Kit Expansion (ORG, PRO)
Goal: Extend the brand kit to produce downloadable, brand-consistent print assets.

What the existing Brand Kit (#31) already does:
- Organizer can set: logo, primaryColor, secondaryColor, businessName, social handles
- These fields exist on the Organizer or a related BrandKit model — READ THE SCHEMA to confirm exact field names

New capabilities to add (PRO-gated, use existing tierGate.ts / requireTier middleware):

BACKEND — new file: packages/backend/src/controllers/brandKitPrintController.ts
Use the same PDFKit lazy-require pattern as marketingKitController.ts.

Endpoint 1: GET /api/organizer/brand-kit/business-card
- Generates a single business card PDF (3.5"×2" — standard US business card)
- Front: organizer businessName (large), tagline "Estate Sale Specialist" (small), logo (if set — embed Cloudinary URL as image), primaryColor as background accent bar, phone/email/website from organizer profile
- Produce 10 per letter-page (2×5 grid)
- Requires: organizerId from req.user — look up organizer by userId

Endpoint 2: GET /api/organizer/brand-kit/letterhead
- Generates a blank letterhead PDF (Letter size, portrait)
- Header: logo (if set) + businessName on left, contact info on right, primaryColor horizontal rule below header
- Footer: website + "Powered by FindA.Sale" in small text
- Body area: intentionally blank (for printing and writing on)

Endpoint 3: GET /api/organizer/brand-kit/social-headers
- Generates a PDF with 3 pre-sized social media header templates:
  - Facebook Cover: 820×312px — businessName + logo + primaryColor background
  - Instagram Profile: 320×320px — logo centered on primaryColor background
  - Twitter/X Header: 1500×500px — businessName + tagline
- Instructions on how to save/crop each (text below each template)

Endpoint 4: GET /api/organizer/brand-kit/yard-sign-branded
- Same as print kit yard sign but uses brand colors + logo (if set) instead of default black/white
- If no brand colors set: fall back to default FindA.Sale colors with a toast hint "Set your brand colors to personalize"

FRONTEND — extend brand-kit.tsx:
Add a "Downloadable Brand Assets" section at the bottom of the existing brand kit page. Show 4 download buttons (one per endpoint above). Each button: "Download Business Cards", "Download Letterhead Template", "Download Social Headers", "Download Branded Yard Sign". Wrap entire section in a PRO tier gate component (check how other PRO gates are implemented in the codebase — look for TierGatedNav or similar component usage in existing pages). If organizer is not PRO, show "Upgrade to PRO" upsell card instead.

If the organizer has no logo set, show an inline note: "Add your logo above to personalize these assets."

---

KNOCK-ON EFFECTS:
- After adding new routes to the brand kit routes file, grep to confirm no existing brand-kit endpoints break
- Confirm: logo image embedding in PDFKit works with HTTPS Cloudinary URLs. PDFKit supports embedding images from URL buffers — fetch the image buffer first using node-fetch or axios, then pass the buffer to doc.image()

TYPESCRIPT CHECK (mandatory before returning):
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
Both must return zero errors.

Return: explicit list of every file created or modified.
```

---

## AGENT 3 DISPATCH PROMPT
### Features: #229 AI Comp Tool + #244 Phase 1 eBay CSV Export

```
You are building two tightly coupled features for FindA.Sale: an AI price comparison tool that searches eBay sold listings, and a CSV export that pre-fills eBay listing fields from our AI data.

⚠️ CRITICAL PREREQUISITE: eBay API credentials may not be set in environment. Build the eBay Browse API call behind a try/catch that returns mock data if EBAY_CLIENT_ID or EBAY_CLIENT_SECRET are not set. Do NOT make the feature unusable without credentials — mock gracefully.

IMPORTANT: Read these files FIRST before writing any code:
1. packages/database/prisma/schema.prisma — confirm Item fields: estimatedValue, aiSuggestedPrice, title, description, category, condition, tags (or aiTags), photoUrls
2. packages/backend/src/controllers/itemController.ts — lines around AI callback / estimatedValue update (search for "estimatedValue" or "aiSuggestedPrice") — understand the AI analysis flow
3. packages/frontend/pages/organizer/edit-item/[id].tsx — understand the item edit page structure
4. packages/frontend/pages/organizer/add-items/[saleId].tsx — understand the add-items flow
5. packages/backend/src/routes/items.ts — confirm existing item routes
6. claude_docs/feature-decisions/ebay-quick-list-spec.md — read the full spec

---

FEATURE #229: AI Comp Tool (ORG, SIMPLE)
Goal: When an organizer views or edits an item, they can tap "Get Price Comps" to see recent eBay sold listings for similar items and get a suggested price range.

BACKEND — new file: packages/backend/src/controllers/ebayController.ts

eBay Browse API authentication: Use OAuth 2.0 Client Credentials flow:
POST https://api.ebay.com/identity/v1/oauth2/token
  Authorization: Basic base64(EBAY_CLIENT_ID:EBAY_CLIENT_SECRET)
  Body: grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope

Then use the access token to call:
GET https://api.ebay.com/buy/browse/v1/item_summary/search?q={encodedTitle}&filter=conditionIds:{conditionId},buyingOptions:{FIXED_PRICE},price:[5..],priceCurrency:USD&sort=endDate&limit=10

eBay condition IDs (map from our grades):
- S → 1000 (New)
- A → 3000 (Like New)
- B → 4000 (Very Good)
- C → 5000 (Good)
- D → 6000 (Acceptable)

Parse the response: extract itemSummaries[].price.value — compute min, max, median from the results.

Endpoint: POST /api/items/:id/comps
- Auth: organizer must own the item's sale
- Body: none (reads from item record)
- Response: { min: number, max: number, median: number, count: number, suggestedPrice: number, compsRunAt: string, listings: [{title, price, condition, url}] }
- On success: PATCH item.aiSuggestedPrice = median (write back to DB)
- On eBay API failure or missing credentials: return mock data { min: 25, max: 75, median: 45, count: 0, isMockData: true, message: "eBay credentials not configured — showing sample data" }

FRONTEND — modify packages/frontend/pages/organizer/edit-item/[id].tsx:
Add a "💰 Get Price Comps" button below the price input field. On click: POST /api/items/:id/comps → show a small results panel:
  "Found {count} sold listings on eBay
   Range: ${min} – ${max} | Suggested: ${median}
   [Apply Suggested Price] [View on eBay ↗]"
Loading state: "Searching eBay sold listings..."
If isMockData: show "⚠️ Demo data — eBay credentials not configured" in small gray text.

If item.aiSuggestedPrice already exists (from a prior comp run), show it immediately without a new call and add a "Refresh" button.

---

FEATURE #244 Phase 1: eBay CSV Export (ORG, SIMPLE)
Goal: Generate an eBay-compatible CSV that organizers can upload to eBay Seller Hub Bulk Listings. Pre-fills all fields from AI data.

BACKEND — add to ebayController.ts:

eBay category mapping table (static, hardcoded — expand over time):
const EBAY_CATEGORY_MAP: Record<string, string> = {
  'Furniture': '3197',
  'Electronics': '58058',
  'Clothing': '11450',
  'Jewelry': '281',
  'Art': '550',
  'Books': '267',
  'Toys': '220',
  'Kitchen': '20625',
  'Tools': '631',
  'Sports': '888',
  'Collectibles': '1',
  'Other': '99',
  // default fallback
};

Endpoint: GET /api/organizer/sales/:saleId/ebay-export
- Auth: organizer must own the sale
- Query param: ?photoMode=watermarked|clean (default: watermarked)
  - watermarked: use existing Cloudinary photo URLs (they already have the watermark)
  - clean: use the base Cloudinary URL without transformation (remove any watermark transformation from the URL string if present)
- Fetches all AVAILABLE items for the sale (not SOLD, not DRAFT)
- Generates CSV with these columns (eBay File Exchange format):
  *Action, *Category, PicURL, *Title, Description, *StartPrice, *Quantity, *ConditionID, *ListingDuration, *ReturnsAcceptedOption, *Format, SKU, ItemSpecifics:Brand, ItemSpecifics:Condition Description

  Values:
  - *Action: "Add"
  - *Category: EBAY_CATEGORY_MAP[item.category] || '99'
  - PicURL: first photo URL (watermarked or clean based on param)
  - *Title: item.title (truncate to 80 chars)
  - Description: item.description or item.aiDescription
  - *StartPrice: item.aiSuggestedPrice || item.estimatedValue || item.price || 9.99
  - *Quantity: 1
  - *ConditionID: map from item.condition using condition map above
  - *ListingDuration: "GTC" (Good Till Cancelled)
  - *ReturnsAcceptedOption: "ReturnsAccepted"
  - *Format: "FixedPrice"
  - SKU: "FAS-" + item.id

- Set headers: Content-Type: text/csv, Content-Disposition: attachment; filename="ebay-export-{saleTitle}-{date}.csv"

FRONTEND — add eBay export to organizer items management:
In packages/frontend/pages/organizer/edit-sale/[id].tsx OR packages/frontend/pages/organizer/sales.tsx (check which page lists items for an organizer's sale):
Add an "Export to eBay" button in the sale actions area. On click: show a small modal with:
  - "Export {N} available items as eBay CSV"
  - Toggle: "Include FindA.Sale watermark (recommended) / Remove watermark"
    - If "Remove watermark" selected: show "Clean photo exports are available with PRO" (tier gate, check tierGate pattern)
  - [Download CSV] button → window.open(`/api/organizer/sales/${saleId}/ebay-export?photoMode=watermarked`, '_blank')
  - Help text: "Upload this CSV to eBay Seller Hub → Listings → Bulk Create"

---

KNOCK-ON EFFECTS:
- After adding /api/items/:id/comps and /api/organizer/sales/:saleId/ebay-export routes, confirm they're registered in the appropriate routes files
- Confirm item.condition field exists in schema and what values it holds (look for existing condition validation in itemController.ts)
- If item.tags is stored as a string array or JSON, confirm the correct field name for AI-generated tags

TYPESCRIPT CHECK (mandatory before returning):
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
Both must return zero errors.

Return: explicit list of every file created or modified.
```

---

## AGENT 4 DISPATCH PROMPT
### Feature: #243 Smart Cart (Shopper Running Total)

```
You are building a Phase 1 Smart Cart for shoppers on FindA.Sale. This is a localStorage-based running total that lets shoppers track items they intend to buy as they browse a sale.

IMPORTANT: Read these files FIRST before writing any code:
1. packages/database/prisma/schema.prisma — confirm Item fields: id, title, price, status, photoUrls, condition, saleId
2. packages/frontend/pages/sales/[id].tsx — the main sale detail page where shoppers browse items
3. packages/frontend/pages/items/[id].tsx (if it exists) — item detail page
4. packages/frontend/pages/shopper/holds.tsx (if it exists) OR the Hold-to-Pay flow — understand how shopper checkout currently works
5. packages/frontend/components/ — look for any existing cart-related components

---

FEATURE #243: Smart Cart — Phase 1 (SHO, SIMPLE)
Phase 1 scope: localStorage cart only. No backend. No holds created. No payment. Just a "running total" UI that persists during the browsing session.

Phase 2 (NOT this sprint): QR scan to add items, full POS integration.

---

NEW FILE: packages/frontend/hooks/useShopperCart.ts
Implement a React hook using localStorage:
- Cart state: { items: CartItem[], saleId: string | null }
- CartItem: { id: string, title: string, price: number | null, photoUrl?: string, saleId: string }
- Functions: addItem(item), removeItem(id), clearCart(), getTotal()
- Cart is scoped to a single sale (saleId). If organizer tries to add item from a different sale, show a confirm modal: "Your cart has items from a different sale. Clear cart and start new?"
- Persist to localStorage key: 'fas_shopper_cart'
- Export: useShopperCart()

NEW FILE: packages/frontend/components/ShopperCartDrawer.tsx
A slide-in drawer (right side, mobile-friendly) showing:
- Header: "My Cart" + sale name (small) + X button to close
- Item list: photo thumbnail + title + price for each item
- Remove button (×) per item
- Running total at bottom: "Total: $XX.XX" (sum of all prices with prices; items without price show as "N/A")
- [Place Holds] button → navigates to /shopper/holds or the Hold-to-Pay page with the item IDs pre-selected (if that feature supports URL params — check #221 in roadmap context — if not, just show a note "Visit Holds to reserve these items")
- [Clear Cart] button
- Empty state: "Your cart is empty. Browse items and tap + to add them."

The drawer should be triggered by a floating Cart FAB (Floating Action Button) visible when the cart has items:
- Bottom-right of screen
- Shows item count badge
- Tapping opens the drawer

Integrate into layout:
- Add the ShopperCartDrawer and CartFAB to the sale detail page (packages/frontend/pages/sales/[id].tsx)
- Add an "Add to Cart" button on each item card within the sale detail page
  - Only show the button if item.status === 'AVAILABLE' and item.price is not null (digital pricing required)
  - Button: small "+ Cart" or shopping cart icon button next to existing buy/hold buttons
  - On add: show a brief toast "Added to cart" (use existing ToastContext)
  - If item already in cart: button shows "✓ In Cart" (disabled, green)

Nav integration:
- In the shopper bottom tab nav or header, if cart has items, show a cart icon with badge
- Check packages/frontend/components/BottomTabNav.tsx — add cart icon/badge if appropriate, or add a standalone CartIndicator component to the sale detail page layout only (less invasive)

---

KNOCK-ON EFFECTS:
- Confirm item cards in sales/[id].tsx render individual items with price/status accessible — the Add to Cart button needs these fields
- Confirm ToastContext is available in sales/[id].tsx (grep for useToast imports in the file)
- Do NOT add cart functionality to the organizer dashboard or any organizer page — shopper-only

TYPESCRIPT CHECK (mandatory before returning):
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
Zero errors required.

Return: explicit list of every file created or modified.
```

---

## AGENT 5 DISPATCH PROMPT
### Feature: #235 Charity Close + Tax Receipt PDF

```
You are building the Charity Close feature for FindA.Sale — a post-sale workflow that lets estate sale organizers donate unsold items to charity and generate a tax receipt PDF for their client.

⚠️ THIS AGENT MODIFIES schema.prisma. A Prisma migration will be required after this agent returns. The organizer must run: npx prisma migrate dev --name add_charity_close

IMPORTANT: Read these files FIRST before writing any code:
1. packages/database/prisma/schema.prisma — ENTIRE FILE. Understand existing Sale, Item, SaleSettlement models.
2. packages/backend/src/controllers/settlementController.ts — understand the Settlement Hub pattern (this feature sits alongside it)
3. packages/frontend/pages/organizer/settlement/[saleId].tsx — understand the Settlement wizard UI pattern
4. packages/frontend/pages/organizer/edit-sale/[id].tsx — this is where we add the "Charity Close" button for ENDED sales
5. packages/backend/src/controllers/earningsPdfController.ts — see PDFKit usage pattern for receipts

---

FEATURE #235: Charity Close + Tax Receipt PDF (ORG, SIMPLE)
This feature is accessible only for ENDED sales (status === 'ENDED'). Organizers can:
1. Select a charity (from a short list or enter custom)
2. Review unsold items being donated
3. (Optional) Schedule a pickup date
4. Generate + download a PDF tax receipt

---

SCHEMA CHANGES — add to schema.prisma:
(Add after SaleSettlement model)

model SaleDonation {
  id              String    @id @default(cuid())
  saleId          String    @unique
  sale            Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)
  charityName     String
  charityEin      String?
  charityAddress  String?
  pickupDate      DateTime?
  pickupNotes     String?
  estimatedValue  Decimal   @default(0)
  itemCount       Int       @default(0)
  donationStatus  String    @default("PENDING")  // PENDING | SCHEDULED | COMPLETED
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  taxReceipt      TaxReceipt?
  donatedItems    DonatedItem[]
}

model DonatedItem {
  id            String      @id @default(cuid())
  donationId    String
  donation      SaleDonation @relation(fields: [donationId], references: [id], onDelete: Cascade)
  itemId        String
  item          Item        @relation(fields: [itemId], references: [id])
  estimatedValue Decimal?
  @@index([donationId])
}

model TaxReceipt {
  id          String      @id @default(cuid())
  donationId  String      @unique
  donation    SaleDonation @relation(fields: [donationId], references: [id], onDelete: Cascade)
  pdfUrl      String?
  generatedAt DateTime    @default(now())
  emailedAt   DateTime?
}

Also add to Item model: donatedItems DonatedItem[]
Also add to Sale model: donation SaleDonation?

---

BACKEND — new file: packages/backend/src/controllers/charityController.ts

Endpoints:
1. GET /api/organizer/sales/:saleId/charity/unsold-items
   - Returns all AVAILABLE (unsold) items for the sale with title, estimatedValue, aiSuggestedPrice, category, condition
   - Auth: organizer must own the sale

2. POST /api/organizer/sales/:saleId/charity
   - Body: { charityName, charityEin?, charityAddress?, pickupDate?, itemIds: string[], pickupNotes? }
   - Creates SaleDonation record + DonatedItem records for each itemId
   - Computes estimatedValue sum from item.estimatedValue || item.aiSuggestedPrice || item.price || 0
   - Returns: { donationId, estimatedValue, itemCount }

3. GET /api/organizer/sales/:saleId/charity
   - Returns existing SaleDonation for this sale (if any), including donatedItems and taxReceipt

4. GET /api/organizer/donations/:donationId/tax-receipt
   - Generates and streams the tax receipt PDF
   - If TaxReceipt record exists with pdfUrl: redirect to pdfUrl (future Cloudinary upload)
   - For now: generate PDF inline and stream it
   - PDF content (Letter size):
     * Header: "Non-Cash Charitable Contribution Receipt" (large)
     * Donor info: organizer name + sale title
     * Charity info: charityName, charityEin (if set), charityAddress (if set)
     * Donation date: today's date
     * Item table: item title | estimated value — one row per donated item
     * Total estimated value (bold, bottom of table)
     * Disclaimer: "This receipt is provided for informational purposes. Please consult a tax professional regarding deductibility."
     * Footer: "Generated by FindA.Sale | finda.sale"
   - Set headers: Content-Type: application/pdf, Content-Disposition: attachment; filename="tax-receipt-{saleId}.pdf"
   - Use same PDFKit lazy-require pattern as earningsPdfController.ts

---

FRONTEND — new page: packages/frontend/pages/organizer/charity-close/[saleId].tsx
4-step wizard (use the settlement wizard as a reference for the step pattern):

Step 1 — Choose Charity:
  - Pre-populated options (radio buttons): "Goodwill", "Salvation Army", "Habitat for Humanity ReStore", "Other (enter below)"
  - Custom input shown if "Other" selected: Charity Name, EIN (optional), Address (optional)
  - [Next →]

Step 2 — Review Items:
  - Table of unsold items fetched from GET /charity/unsold-items
  - Checkbox per item (all pre-selected)
  - Estimated value shown per item (from estimatedValue || aiSuggestedPrice || price)
  - Running total at bottom: "Donating {N} items, estimated value: ${total}"
  - [← Back] [Next →]

Step 3 — Schedule Pickup (optional):
  - Date picker for pickup date
  - Textarea for pickup notes (gate code, special instructions)
  - "Skip if dropping off yourself" option
  - [← Back] [Submit Donation →]

Step 4 — Confirmation + Receipt:
  - "Donation recorded ✓"
  - Summary: charity name, item count, estimated value, pickup date (if set)
  - [Download Tax Receipt PDF] button → window.open(`/api/organizer/donations/${donationId}/tax-receipt`, '_blank')
  - [Back to Dashboard] button

---

NAVIGATION — modify packages/frontend/pages/organizer/edit-sale/[id].tsx:
Find where the "Settle This Sale" button appears (for ENDED sales) and add a "Donate Unsold Items →" button alongside it.
- Only show for ENDED sales
- Link to: /organizer/charity-close/[saleId]
- If SaleDonation already exists for this sale: show "View Donation Receipt" instead, linking to step 4 summary

---

KNOCK-ON EFFECTS:
- After adding DonatedItem relation to Item and Sale, confirm no existing Item queries break (use select to avoid over-fetching the new relation)
- Grep for existing sale status checks around 'ENDED' to understand where this button should appear
- Confirm PDFKit lazy-require pattern from earningsPdfController.ts is copied exactly

TYPESCRIPT CHECK (mandatory before returning):
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
Both must return zero errors.

⚠️ DO NOT run prisma migrate — only update schema.prisma and generate the SQL migration file. Patrick will run the migration manually.

Return: explicit list of every file created or modified, plus the migration SQL filename.
```

---

## Session A Dispatch Order (Run All In Parallel)
Agents 1, 2, 3, and 4 have NO file conflicts and NO schema dependencies. Dispatch all four in a single message.

```
[DISPATCH IN PARALLEL — single message, 4 agents]
Agent 1: #240 + #242 (Print Suite)
Agent 2: #241 (Brand Kit Expansion)
Agent 3: #229 + #244 Phase 1 (eBay)
Agent 4: #243 (Smart Cart)
```

After all 4 return: collect changed-files lists, run compile checks, compile single push block.

## Session B (After Session A Deployed)
Agent 5: #235 (Charity Close — requires schema migration)
Patrick deploys migration to Railway before testing.

---

## Patrick Action Required Before Session A
- [ ] **eBay Developer App**: Create app at https://developer.ebay.com, get `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET`
- [ ] Set `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` as Railway env vars (Agent 3 builds gracefully without them, but comps will show mock data until set)

## Patrick Action Required Before Session B
- No blockers — schema migration and deploy are the only step, and Agent 5 outputs the SQL file.

---

## Feature → Roadmap Status After Build
When session completes, update these roadmap rows:
- #229 → Shipped SXX — Pending Chrome QA
- #235 → Shipped SXX — Pending Migration Deploy + Chrome QA
- #240 → Shipped SXX — Pending Chrome QA
- #241 → Shipped SXX — Pending Chrome QA
- #242 → Shipped SXX — Pending Chrome QA
- #243 → Shipped SXX — Pending Chrome QA
- #244 Phase 1 → Shipped SXX — Pending Chrome QA
