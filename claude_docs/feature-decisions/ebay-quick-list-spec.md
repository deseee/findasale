# Feature Spec: eBay Quick List (AI-Assisted eBay Export)
**Feature #:** 244
**Session:** S374
**Status:** Spec Complete — Ready for Build
**Tier:** SIMPLE (Phase 1 CSV), PRO (Phase 2 direct API push)
**Role:** ORG
**Overlap:** #229 AI Comp Tool (price suggestion feeds directly into eBay price field)

---

## Problem

Estate sale organizers who want to flip unsold items on eBay currently re-enter all item data manually: title, description, condition, category, price, and photos. FindA.Sale already captures all of this data during intake via AI tagging. This is wasted effort that creates friction and delays post-sale monetization.

---

## Opportunity

Our AI tagging pipeline (Google Vision + Claude Haiku) already produces:
- **Title** — AI-generated, SEO-optimized
- **Description** — keyword-rich, buyer-intent copy
- **Condition grade** — S/A/B/C/D (maps directly to eBay condition enums)
- **Category** — item category (maps to eBay category ID via lookup table)
- **Tags / Aspects** — item specifics that eBay requires per category
- **Photos** — Cloudinary HTTPS URLs, watermarked with FindA.Sale branding
- **Estimated value / price suggestion** — via AI or #229 AI Comp Tool

The eBay Inventory API (`createOrReplaceInventoryItem`) accepts all of these fields directly. We can pre-fill an entire eBay listing from data we already have.

---

## eBay Inventory API Field Mapping

| eBay Inventory API Field | FindA.Sale Source | Notes |
|--------------------------|------------------|-------|
| `product.title` | `item.title` (AI-generated) | Max 80 chars — truncate if needed |
| `product.description` | `item.aiDescription` | Strip internal tags |
| `condition` | `item.conditionGrade` | See condition mapping below |
| `product.imageUrls[]` | Cloudinary watermarked photo URLs | Must be HTTPS — already compliant |
| `product.aspects` | `item.tags[]` | Key-value pairs per category |
| `offer.pricingSummary.price` | `item.estimatedValue` or #229 price suggestion | Organizer can override |
| `offer.categoryId` | `item.category` → eBay category ID lookup | See category mapping below |
| `inventoryItem.availability.shipToLocationAvailability.quantity` | Always 1 | Estate sale items are single-unit |
| `offer.sku` | `item.id` (prefixed `FAS-`) | Auto-generated |
| `offer.listingDescription` | Same as description | Populated from AI copy |

### Condition Mapping
| FindA.Sale Grade | eBay Condition String | eBay Condition ID |
|------------------|-----------------------|-------------------|
| S (New/Sealed) | NEW | 1000 |
| A (Like New) | LIKE_NEW | 3000 |
| B (Very Good) | VERY_GOOD | 4000 |
| C (Good) | GOOD | 5000 |
| D (Acceptable) | ACCEPTABLE | 6000 |

### What Organizer Still Provides
- eBay business policies (payment, fulfillment, return) — set once in eBay Seller Hub, reused per listing
- Shipping details / location (set once at account link)
- Final review + approval before publish (required by eBay TOS for third-party integrations)

---

## Two-Phase Build Plan

### Phase 1 — CSV Export (No OAuth Required)
**Complexity:** Low (1 sprint)
**How it works:**
1. Organizer selects 1 or more items from a sale (post-sale "unsold" view works best)
2. FindA.Sale generates an eBay-compatible CSV in eBay File Exchange / Seller Hub Bulk Upload format
3. All fields pre-filled from AI data (title, description, condition, category, price, photo URLs)
4. Organizer downloads CSV → uploads to eBay Seller Hub → reviews → publishes

**Key fields in eBay CSV format:**
`*Action, *Category, PicURL, *Title, Description, *StartPrice, *Quantity, *ConditionID, *ListingDuration, *ReturnsAcceptedOption, *Format`

**Effort estimate:** ~40–50 hours (backend CSV generator, frontend export button + item selector)

---

### Phase 2 — Direct API Push (eBay OAuth)
**Complexity:** Medium (2 sprints)
**How it works:**
1. Organizer connects eBay account (OAuth 2.0 via eBay developer app)
2. FindA.Sale calls `createOrReplaceInventoryItem` with pre-filled payload
3. Organizer reviews pre-filled listing in a FindA.Sale review modal
4. Organizer approves → FindA.Sale calls `createOffer` + `publishOffer`
5. Item goes live on eBay. FindA.Sale marks item as "Listed on eBay" in its own inventory

**Required eBay API scopes:** `https://api.ebay.com/oauth/api_scope/sell.inventory`

**Effort estimate:** ~80–100 hours (OAuth flow, API integration, review modal, status sync)

---

## Overlap with #229 AI Comp Tool

#229 (AI Comp Tool) searches eBay sold listings to suggest a price. The eBay Quick List (#244) uses that price suggestion as the default `offer.pricingSummary.price` when generating the listing. These features should be designed to wire together:

- If #229 has run for an item → pre-fill eBay price from comp suggestion
- If #229 has not run → pre-fill from `item.estimatedValue` (AI-generated during intake)

Recommended sequencing: build #229 price suggestion first, then #244 consumes it.

---

## Category Mapping Strategy

eBay requires a numeric category ID. Our item categories (Furniture, Electronics, Clothing, etc.) need a lookup table mapping to eBay leaf category IDs.

Phase 1 approach: Static mapping table for ~20 most common estate sale categories (covers ~85% of items). Organizer manually selects eBay category for unmapped items.

Phase 2 approach: Use eBay Taxonomy API (`getItemAspectsForCategory`) to dynamically suggest the most relevant leaf category based on item title + tags.

---

## UX Flow (Phase 1)

```
Post-sale item view (filter: Unsold)
  → [Export to eBay] button (SIMPLE tier gate)
  → Item selector modal (checkbox list of unsold items)
  → [Generate eBay CSV] button
  → Download CSV file (ebay-export-[sale-name]-[date].csv)
  → Toast: "CSV ready. Upload to eBay Seller Hub → Bulk Listings."
  → Optional help link → eBay Seller Hub upload guide
```

---

## Revenue & Strategic Value

- **Direct revenue:** No per-listing fee (Phase 1). Potential: gate Phase 2 direct push as PRO feature or charge $0.25/item pushed (explore post-beta).
- **Retention driver:** Organizers who list unsold items on eBay via FindA.Sale associate eBay success with FindA.Sale — increases platform stickiness.
- **Differentiation:** No estate sale competitor offers eBay integration. First-mover advantage in "AI intake → multi-platform export" workflow.
- **eBay TOS compliance:** Phase 1 CSV has zero TOS risk. Phase 2 requires organizer approval per listing (eBay policy) — UX must enforce this with explicit confirmation step.

---

## Open Questions for Patrick
1. Should eBay Quick List export **watermarked** photos (brand protection) or clean photos (better eBay shopper experience)?
2. Phase 1 only, or prioritize Phase 2 direct push from the start?
3. Should items exported to eBay be marked as "unavailable" on FindA.Sale automatically, or stay active on both?

---

## References
- [eBay Inventory API Overview](https://developer.ebay.com/api-docs/sell/inventory/overview.html)
- [Required fields for publishing an offer](https://developer.ebay.com/api-docs/sell/static/inventory/publishing-offers.html)
- [createOrReplaceInventoryItem](https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item/methods/createOrReplaceInventoryItem)
- Advisory board S236 minutes (Etsy integration analysis — applicable risk patterns): `claude_docs/feature-decisions/advisory-board-S236-print-kit-etsy.md`
- Feature #229 spec (AI Comp Tool): roadmap entry + any future spec doc

**Created:** S374 (2026-04-01)
