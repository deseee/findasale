# Sprint 2 Architecture Specification

**Date:** 2026-03-15
**Architect:** findasale-architect
**Status:** Ready for Development
**Context Checkpoint:** No (continued work)

---

## Overview

Three features for Sprint 2, all focused on helping organizers promote their sales across external platforms:

1. **Cloudinary Watermark Utility** — Pure function to apply FindA.Sale watermark overlay to image URLs
2. **Export Controller** — Generate three export formats (EstateSales.NET CSV, Facebook JSON, Craigslist text)
3. **Promote Page** — Organizer-facing UI to download/copy exports

**Schema Impact:** None. All features operate on existing data.
**New NPM Packages:** `csv-stringify` (if not present in backend)

---

## Feature 1: Cloudinary Watermark Utility

### Location
`packages/backend/src/utils/cloudinaryWatermark.ts`

### Purpose
Apply a FindA.Sale watermark overlay to Cloudinary image URLs using URL-based transformations (no re-upload, no API calls).

### Function Signature

```typescript
/**
 * Applies a FindA.Sale watermark overlay to a Cloudinary image URL
 * using URL-based transformations (no re-upload or API calls).
 *
 * @param originalUrl - Full Cloudinary URL (https://res.cloudinary.com/...)
 * @returns Watermarked URL with transformation chain appended
 *
 * Example input:  https://res.cloudinary.com/abc/image/upload/v1/findasale/item123.jpg
 * Example output: https://res.cloudinary.com/abc/image/upload/l_text:Montserrat_bold_18:FindA.Sale,g_south_east,x_20,y_20,o_60/v1/findasale/item123.jpg
 */
export function getWatermarkedUrl(originalUrl: string): string
```

### Algorithm

1. Validate URL is a Cloudinary URL (contains `res.cloudinary.com`)
2. If not Cloudinary, return unchanged (fail-safe for edge cases)
3. Insert watermark transformation layer before `/v` segment (e.g., before `/v1/`)
4. Watermark parameters:
   - **Text:** `FindA.Sale`
   - **Font:** Montserrat Bold, size 18px
   - **Gravity:** `south_east` (bottom-right)
   - **Offset:** 20px from right, 20px from bottom
   - **Opacity:** 0.6 (semi-transparent)
   - **Color:** White (#FFFFFF)

### Cloudinary Transformation String

Construct the transformation as:
```
l_text:Montserrat_bold_18:FindA.Sale,g_south_east,x_20,y_20,o_60
```

This goes **before** the `/v1/` segment in the URL.

### Dependencies
None (pure string manipulation)

### Example

**Input:**
```
https://res.cloudinary.com/findasale/image/upload/v1/findasale/abc123.jpg
```

**Output:**
```
https://res.cloudinary.com/findasale/image/upload/l_text:Montserrat_bold_18:FindA.Sale,g_south_east,x_20,y_20,o_60/v1/findasale/abc123.jpg
```

### Error Handling

- If URL is not a Cloudinary URL, return unchanged (don't throw)
- If URL is invalid/malformed, return unchanged

---

## Feature 2: Export Controller

### Location
`packages/backend/src/controllers/exportController.ts`

### Purpose
Generate three export formats from a published sale's inventory.

### Three Export Handlers

All handlers:
- Require authentication (`authenticate` middleware)
- Verify organizer ownership
- Fetch PUBLISHED items only
- Apply watermark to all photo URLs
- Return 400 if no published items exist
- Return 403 if organizer doesn't own the sale

#### 1. Export EstateSales.NET CSV

**Endpoint:** `GET /api/export/:saleId/estatesales-csv`

**Response:** CSV file download
**Content-Type:** `text/csv`
**Filename:** `sale-{saleId}-estatesales.csv`

**CSV Columns (in order):**
1. `Title` — Item.title
2. `Category` — Item.category (mapped; see mapping table below)
3. `Price` — Item.price (2 decimal places, e.g., "149.99")
4. `Description` — Item.description (truncated to 500 chars, sanitized for CSV)
5. `Condition` — Item.condition (MINT/EXCELLENT/GOOD/FAIR/POOR or empty)
6. `Photo URL` — Watermarked primary photo (Item.photoUrls[0] with `getWatermarkedUrl()` applied)
7. `Shipping Available` — "Yes" or "No"
8. `Shipping Price` — Item.shippingPrice (if applicable) or empty

**Category Mapping (FindA.Sale → EstateSales.NET):**

| FindA.Sale | EstateSales.NET |
|------------|-----------------|
| furniture | Furniture |
| decor | Home Décor |
| vintage | Vintage & Collectibles |
| textiles | Clothing & Textiles |
| collectibles | Collectibles |
| art | Art & Antiques |
| antiques | Art & Antiques |
| jewelry | Jewelry & Watches |
| books | Books |
| tools | Tools & Hardware |
| electronics | Electronics |
| clothing | Clothing & Textiles |
| home | Home & Garden |
| other / null | Other |

**Function Signature:**

```typescript
export const exportEstatesalesCSV = async (req: AuthRequest, res: Response): Promise<void>
```

---

#### 2. Export Facebook Marketplace JSON

**Endpoint:** `GET /api/export/:saleId/facebook-json`

**Response:** JSON object
**Content-Type:** `application/json`

**Response Shape:**

```typescript
{
  sale: {
    title: string;           // Sale.title
    description: string;     // Sale.description (optional, may be empty)
    address: string;         // Sale.address
    city: string;            // Sale.city
    saleUrl: string;         // https://finda.sale/sales/[saleId]
  };
  items: Array<{
    id: string;              // Item.id
    title: string;           // Item.title
    price: number;           // Item.price (null if not set)
    description: string;     // Item.description (null if not set)
    category: string;        // Item.category
    condition: string;       // Item.condition
    images: Array<{
      url: string;           // Watermarked URL
      isPrimary: boolean;    // true for first image
    }>;
    shipping: {
      available: boolean;    // Item.shippingAvailable
      price?: number;        // Item.shippingPrice (optional)
    };
  }>;
}
```

**Function Signature:**

```typescript
export const exportFacebookJSON = async (req: AuthRequest, res: Response): Promise<void>
```

---

#### 3. Export Craigslist Plain Text

**Endpoint:** `GET /api/export/:saleId/craigslist-text`

**Response:** Plain text file download
**Content-Type:** `text/plain`
**Filename:** `sale-{saleId}-craigslist.txt`

**Format:** Single continuous text block ready to copy/paste into Craigslist:

```
--- SALE DETAILS ---
[Sale.title]
When: [Sale.startDate formatted] — [Sale.endDate formatted]
Where: [Sale.address], [Sale.city], [Sale.state] [Sale.zip]
More Info: https://finda.sale/sales/[saleId]

--- ITEMS FOR SALE ---

[Item.title]
$[Item.price] — [Item.condition]
[Item.description]
[Watermarked photo URL]

[Item.title]
$[Item.price] — [Item.condition]
[Item.description]
[Watermarked photo URL]

[... repeat for each item ...]

Contact: [Organizer.email] | [Organizer.phone]
```

**Function Signature:**

```typescript
export const exportCraigslistText = async (req: AuthRequest, res: Response): Promise<void>
```

---

### Common Implementation Pattern

All three handlers follow this pattern:

```typescript
export const exportEstatesalesCSV = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { saleId } = req.params;
    const userId = req.userId; // from AuthRequest

    // Fetch sale with organizer and published items
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: true,
        items: {
          where: { status: 'PUBLISHED' },
          select: {
            id: true,
            title: true,
            price: true,
            description: true,
            category: true,
            condition: true,
            photoUrls: true,
            shippingAvailable: true,
            shippingPrice: true
          }
        }
      }
    });

    // Verify ownership
    if (!sale) {
      return res.status(400).json({ error: 'Sale not found' });
    }
    if (sale.organizer.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (!sale.items || sale.items.length === 0) {
      return res.status(400).json({ error: 'No published items to export' });
    }

    // Apply watermark to all photo URLs
    const enrichedItems = sale.items.map(item => ({
      ...item,
      photoUrls: item.photoUrls.map(url => getWatermarkedUrl(url))
    }));

    // Format and return based on handler type
    // [format-specific logic]

    res.status(200).json(...) or res.attachment(...).send(...)
  } catch (error) {
    console.error('exportEstatesalesCSV error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
};
```

### Error Codes

- **400:** Sale not found OR no published items
- **403:** Organizer mismatch (you don't own this sale)
- **500:** Export generation or file download failed

---

### Route Registration

**Option A: Add to `packages/backend/src/routes/sales.ts`**

```typescript
import {
  exportEstatesalesCSV,
  exportFacebookJSON,
  exportCraigslistText
} from '../controllers/exportController';

// ... existing routes ...

router.get('/:saleId/export/estatesales-csv', authenticate, exportEstatesalesCSV);
router.get('/:saleId/export/facebook-json', authenticate, exportFacebookJSON);
router.get('/:saleId/export/craigslist-text', authenticate, exportCraigslistText);
```

**Option B: Create new `packages/backend/src/routes/export.ts`**

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  exportEstatesalesCSV,
  exportFacebookJSON,
  exportCraigslistText
} from '../controllers/exportController';

const router = Router();

router.get('/:saleId/estatesales-csv', authenticate, exportEstatesalesCSV);
router.get('/:saleId/facebook-json', authenticate, exportFacebookJSON);
router.get('/:saleId/craigslist-text', authenticate, exportCraigslistText);

export default router;
```

Then in `packages/backend/src/routes/routes.ts`:

```typescript
import exportRouter from './export';

// ... other routes ...

app.use('/api/export', exportRouter);
```

---

## Feature 3: Promote Page

### Location
`packages/frontend/pages/promote.tsx`

### Route
`/promote/[saleId]`

### Purpose
Organizer-facing page to download/copy export formats for a specific sale.

### Page Structure

```typescript
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import api from '../lib/api';

export default function PromotePage(): JSX.Element {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch sale to verify ownership
  const { data: sale, isLoading: saleLoading, isError } = useQuery(
    ['sale', saleId],
    () => saleId ? api.get(`/api/sales/${saleId}`) : Promise.reject('No saleId'),
    { enabled: !!saleId && !!user }
  );

  // Verify ownership
  if (saleLoading) return <LoadingSpinner />;
  if (!user) return <RedirectTo path="/login" />;
  if (isError || !sale) return <Error404 />;
  if (sale.organizer.userId !== user.id) return <Error403 />;

  // Download handlers
  const downloadEstatesalesCSV = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/export/${saleId}/estatesales-csv`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sale-${saleId}-estatesales.csv`;
      a.click();
      setToast({ message: 'CSV downloaded successfully', type: 'success' });
    } catch (error) {
      setToast({ message: 'Failed to download CSV', type: 'error' });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const copyFacebookJSON = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/export/${saleId}/facebook-json`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Export failed');
      const data = await response.json();
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setToast({ message: 'Copied to clipboard!', type: 'success' });
    } catch (error) {
      setToast({ message: 'Failed to copy to clipboard', type: 'error' });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const downloadCraigslistText = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/export/${saleId}/craigslist-text`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sale-${saleId}-craigslist.txt`;
      a.click();
      setToast({ message: 'Text file downloaded successfully', type: 'success' });
    } catch (error) {
      setToast({ message: 'Failed to download text file', type: 'error' });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Promote Your Sale — FindA.Sale</title>
      </Head>

      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-warm-900 mb-2">Promote Your Sale</h1>
        <p className="text-warm-700 text-lg mb-8">
          Export your listings to reach shoppers on other platforms.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ExportCard
            title="EstateSales.NET"
            description="Export as CSV. Download and upload to EstateSales.NET."
            icon="📊"
            buttonText="Download CSV"
            onClick={downloadEstatesalesCSV}
            loading={loading}
          />
          <ExportCard
            title="Facebook Marketplace"
            description="Export as JSON. Copy to clipboard and share on Facebook."
            icon="📱"
            buttonText="Copy to Clipboard"
            onClick={copyFacebookJSON}
            loading={loading}
          />
          <ExportCard
            title="Craigslist"
            description="Export as plain text. Download and paste into Craigslist."
            icon="📝"
            buttonText="Download Text"
            onClick={downloadCraigslistText}
            loading={loading}
          />
        </div>

        {toast && (
          <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}>
            {toast.message}
          </div>
        )}
      </div>
    </>
  );
}
```

### ExportCard Component

```typescript
interface ExportCardProps {
  title: string;
  description: string;
  icon: string;
  buttonText: string;
  onClick: () => Promise<void>;
  loading: boolean;
}

const ExportCard: React.FC<ExportCardProps> = ({
  title,
  description,
  icon,
  buttonText,
  onClick,
  loading
}) => {
  return (
    <div className="border border-warm-200 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-warm-900 mb-2">{title}</h3>
      <p className="text-warm-700 text-sm mb-6 leading-relaxed">{description}</p>
      <button
        onClick={onClick}
        disabled={loading}
        className={`w-full py-2 rounded-lg font-medium transition ${
          loading
            ? 'bg-warm-300 text-warm-700 cursor-not-allowed'
            : 'bg-warm-600 text-white hover:bg-warm-700'
        }`}
      >
        {loading ? 'Processing...' : buttonText}
      </button>
    </div>
  );
};
```

### Helper Functions

Create `packages/frontend/lib/exportHelpers.ts`:

```typescript
import { getAuthToken } from './auth'; // adjust import based on your auth lib

export async function downloadFile(
  endpoint: string,
  filename: string,
  onError?: (err: Error) => void
): Promise<void> {
  try {
    const token = getAuthToken();
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    if (onError) onError(error as Error);
    throw error;
  }
}

export async function copyToClipboard(
  endpoint: string,
  onError?: (err: Error) => void
): Promise<void> {
  try {
    const token = getAuthToken();
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const text = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(text);
  } catch (error) {
    if (onError) onError(error as Error);
    throw error;
  }
}
```

---

## Shared Types

Add to `packages/shared/src/index.ts`:

```typescript
// Sprint 2: Export features
export type ExportFormat = 'estatesales-csv' | 'facebook-json' | 'craigslist-text';

export interface ExportedItem {
  id: string;
  title: string;
  price?: number;
  description?: string;
  category?: string;
  condition?: string;
  photoUrls: string[];
  shippingAvailable?: boolean;
  shippingPrice?: number;
}

export interface FacebookExportData {
  sale: {
    title: string;
    description: string;
    address: string;
    city: string;
    saleUrl: string;
  };
  items: Array<ExportedItem & {
    images: Array<{ url: string; isPrimary: boolean }>;
    shipping: { available: boolean; price?: number };
  }>;
}
```

---

## Files to Create

1. `packages/backend/src/utils/cloudinaryWatermark.ts`
2. `packages/backend/src/controllers/exportController.ts`
3. `packages/backend/src/routes/export.ts` (if Option B is chosen)
4. `packages/frontend/pages/promote.tsx`
5. `packages/frontend/lib/exportHelpers.ts` (optional, can inline in page)

---

## Files to Modify

1. `packages/shared/src/index.ts` — Add export types
2. `packages/backend/src/routes/routes.ts` — Register export router (if Option B)
3. `packages/backend/package.json` — Add `csv-stringify` if not present
4. `packages/frontend/pages/dashboard.tsx` (or relevant location) — Add "Promote" link

---

## Schema Changes

**None.** All features operate on existing data.

---

## Dependencies

- **Backend:** `csv-stringify` (npm package, add if missing)
  ```bash
  pnpm add csv-stringify --filter backend
  ```
- **Frontend:** None new (uses existing React Query, Next.js, fetch API)
- **Cloudinary:** Already integrated (no new setup needed)

---

## Error Handling

All three export endpoints return:
- **400:** Sale not found OR no published items exist
- **403:** Organizer ID mismatch (not your sale)
- **500:** File generation failed

Frontend shows toast notifications for success and error states.

---

## Testing Checklist

- [ ] CSV exports valid columns in correct order
- [ ] CSV properly escapes special characters (commas, quotes)
- [ ] Facebook JSON structure matches spec
- [ ] Craigslist text is readable and properly formatted
- [ ] Watermark URLs correctly constructed
- [ ] Watermark images load and display in browser
- [ ] Organizer ownership enforced on all endpoints
- [ ] Non-PUBLISHED items excluded from exports
- [ ] Empty sale returns 400 error
- [ ] Downloaded files have correct MIME types
- [ ] Downloaded filenames are descriptive
- [ ] Frontend auth flow works (token passed correctly)
- [ ] Toast notifications appear on success/error

---

## Integration Notes

1. **Route Mounting:** Ensure export routes are registered in the main Express router before `/api/*` wildcard routes (if any).
2. **Frontend Navigation:** Add a "Promote" button or link in the organizer dashboard (possibly on the sale detail card or a new menu item).
3. **Auth Context:** Frontend uses existing `useAuth()` hook and token retrieval mechanism.

---

## Handoff Notes

This spec is complete and ready for development by findasale-dev. All function signatures, error codes, and response shapes are defined. No schema changes needed. Three features are independent and can be developed in parallel (watermark first, then exports, then UI).

**Next Step:** Dev implementation and unit testing.
