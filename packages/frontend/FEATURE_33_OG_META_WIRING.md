# Feature #33: Share Card Factory — Integration Guide

## Summary

Three new files created to support Cloudinary-based OG image generation for social sharing. When users share FindA.Sale links on iMessage, Facebook, Twitter, or Slack, they'll see branded preview cards (1200×630) instead of blank links.

## Files Created

1. **`lib/ogImage.ts`** — Cloudinary URL builder
2. **`components/SaleOGMeta.tsx`** — Sale detail page meta tags component
3. **`components/ItemOGMeta.tsx`** — Item detail page meta tags component

## Environment Setup

### Add Cloudinary Cloud Name to Frontend

Currently, the backend has `CLOUDINARY_CLOUD_NAME=db8yhzjdq` in `.env`, but the frontend doesn't.

**Action required:** Add to `packages/frontend/.env.local` (or `.env` if you prefer):

```
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=db8yhzjdq
```

This allows the frontend OG components to generate valid Cloudinary URLs. Without it, the code defaults to `db8yhzjdq` but explicit configuration is better.

---

## Integration: Sale Detail Page

**File:** `packages/frontend/pages/sales/[id].tsx`

### Current State

The sale detail page currently uses the existing `/api/og` endpoint and has inline Head tags:

```tsx
const ogImageUrl = `${siteUrl}/api/og?${new URLSearchParams({
  type: 'sale',
  title: sale.title,
  date: `${format(saleStartDate, 'MMM d')}–${format(saleEndDate, 'MMM d, yyyy')}`,
  location: `${sale.city}, ${sale.state}`,
  itemCount: sale.items?.length?.toString() || '0',
  organizer: sale.organizer?.businessName || '',
}).toString()}`;

return (
  <div className="min-h-screen bg-warm-50">
    <Head>
      <title>{sale.title} - FindA.Sale</title>
      <meta name="description" content={...} />
      <meta property="og:title" content={...} />
      <meta property="og:description" content={...} />
      <meta property="og:image" content={ogImageUrl} />
      {/* ... Twitter Card tags ... */}
    </Head>
    {/* ... rest of page ... */}
  </div>
);
```

### To Switch to Cloudinary-Based OG Images

**Option A: Replace existing Head (Recommended — cleaner)**

1. Add import at the top of the file:
```tsx
import SaleOGMeta from '../../components/SaleOGMeta';
```

2. Replace the entire `<Head>` section (lines ~266–313) with:
```tsx
return (
  <div className="min-h-screen bg-warm-50">
    <SaleOGMeta
      sale={{
        id: sale.id,
        title: sale.title,
        description: sale.description,
        startDate: sale.startDate,
        endDate: sale.endDate,
        city: sale.city,
        state: sale.state,
        photos: sale.photoUrls?.map(url => ({ url })), // Adapt if photoUrls is a string array
        address: sale.address,
        organizer: sale.organizer,
        items: sale.items,
      }}
    />
    {/* ... rest of page ... */}
  </div>
);
```

3. Delete the old `ogImageUrl` constant and the old `<Head>` block entirely.

**Option B: Keep existing endpoint, use new component alongside (Safer for A/B testing)**

If you want to compare the Cloudinary URLs with the existing `/api/og` endpoint first, you can run both in parallel:

```tsx
import SaleOGMeta from '../../components/SaleOGMeta';

// Keep the old setup for comparison
const ogImageUrl = `${siteUrl}/api/og?...`; // existing code

return (
  <div className="min-h-screen bg-warm-50">
    {/* Comment out old Head temporarily to see which one is used */}
    {/* <Head>... old tags ...</Head> */}

    {/* New Cloudinary-based tags */}
    <SaleOGMeta sale={{...}} />

    {/* ... rest of page ... */}
  </div>
);
```

---

## Integration: Item Detail Page

**File:** `packages/frontend/pages/items/[id].tsx`

### Current State

The item detail page currently has minimal OG setup:

```tsx
<Head>
  <title>{item.title} - FindA.Sale</title>
  <meta name="description" content={item.description} />
  <meta property="og:title" content={item.title} />
  <meta property="og:description" content={item.description} />
  <meta property="og:image" content={item.photoUrls[0] || ''} />
</Head>
```

### To Add Rich OG Images

1. Add import at the top:
```tsx
import ItemOGMeta from '../../components/ItemOGMeta';
```

2. Replace the `<Head>` section with:
```tsx
<ItemOGMeta
  item={{
    id: item.id,
    title: item.title,
    description: item.description,
    price: item.price,
    auctionStartPrice: item.auctionStartPrice,
    currentBid: item.currentBid,
    condition: item.condition,
    photos: item.photoUrls?.map(url => ({ url })), // Adapt based on current structure
  }}
  saleName={item.sale?.title || 'Estate Sale'}
  saleId={item.sale?.id || ''}
/>
```

3. Delete the old `<Head>` block entirely.

---

## How the Cloudinary URLs Work

### Example Generated URL (Sale)

```
https://res.cloudinary.com/db8yhzjdq/image/upload/
w_1200,h_630,c_fill,g_auto,f_jpg,q_auto/
l_text:Arial_60_bold:Vintage%20Estate%20Sale,co_rgb:1a1a1a,x_0,y_-150/
l_text:Arial_36:Mar%2015%E2%80%9317%2C%202026%20%E2%80%A2%20Grand%20Rapids%2C%20MI,co_rgb:6B5A42,x_0,y_50/
l_text:Arial_32_bold:finda.sale,co_rgb:D97706,x_0,y_270/
b_rgb:fef3c7,w_1200,h_630
```

**Breaks down as:**
- `w_1200,h_630,c_fill,g_auto,f_jpg,q_auto` — Size, format, auto quality
- `l_text:...` — Text overlays (title, date/location, watermark)
- `b_rgb:fef3c7,w_1200,h_630` — Fallback color if no photo (warm amber)

If a photo is available, the URL uses that as the base image; otherwise, it creates a solid color background with text.

### Example Generated URL (Item)

```
https://res.cloudinary.com/db8yhzjdq/image/upload/
w_1200,h_630,c_fill,g_auto,f_jpg,q_auto/
l_text:Arial_60_bold:Vintage%20Mahogany%20Dresser,co_rgb:1a1a1a,x_0,y_-100/
l_text:Arial_32:from%20Estate%20Sale,co_rgb:6B5A42,x_0,y_20/
l_text:Arial_48_bold:%2445.99,co_rgb:D97706,x_0,y_100/
l_text:Arial_28:Good%20condition,co_rgb:6B5A42,x_0,y_180/
l_text:Arial_28_bold:finda.sale,co_rgb:D97706,x_0,y_280/
items%2Fxyz%2Fphoto.jpg
```

---

## Important Notes

### 1. Photo Data Structure

The components expect photos in one of two formats:

**With explicit Cloudinary public ID:**
```tsx
photos: [
  { publicId: 'sales/abc123/photo_1', url: '...' },
  // ...
]
```

**With full Cloudinary URL (public ID extracted):**
```tsx
photos: [
  { url: 'https://res.cloudinary.com/db8yhzjdq/image/upload/v1234/sales/abc123/photo.jpg' },
  // ...
]
```

**Plain URL array (current setup in sales/[id].tsx):**
```tsx
photoUrls: ['https://res.cloudinary.com/.../photo1.jpg', ...]
```

→ **Convert to:** `sale.photoUrls?.map(url => ({ url }))`

### 2. Cloudinary Public IDs vs Full URLs

**Current codebase pattern:** The `photoUrls` array contains full Cloudinary URLs. The `ogImage.ts` utility can extract the public ID from these URLs automatically using regex.

**No schema changes needed** — the feature works with existing data.

### 3. Social Media Preview Testing

After deploying:
- **Facebook:** Use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) to test
- **Twitter:** Use [Twitter Card Validator](https://cards-dev.twitter.com/validator)
- **Slack:** Paste link in Slack to see preview
- **iMessage:** Share link on iPhone to see preview

---

## URL Routing Note for Items

The `ItemOGMeta` component currently generates URLs like:
```
https://finda.sale/sales/{saleId}/items/{itemId}
```

**Verify this matches your actual routing!** If items are routed differently (e.g., `/items/{itemId}` directly), update the `canonicalUrl` in the component or override it when calling:

```tsx
<ItemOGMeta
  item={...}
  saleName={...}
  saleId={...}
  canonicalUrl={`https://finda.sale/items/${item.id}`} // Custom if needed
/>
```

---

## No Migration Needed

- **Database schema:** No changes required
- **API changes:** None
- **Environment variables:** Only frontend gets `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (already exists as `CLOUDINARY_CLOUD_NAME` in backend)

---

## Files Summary

| File | Purpose | Type |
|------|---------|------|
| `lib/ogImage.ts` | Cloudinary URL builder (functions) | Utility |
| `components/SaleOGMeta.tsx` | Sale OG meta tags (React component) | Component |
| `components/ItemOGMeta.tsx` | Item OG meta tags (React component) | Component |

All three are ready to use. No additional dependencies required (uses existing `next/head`).
