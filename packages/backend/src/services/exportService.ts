import { Item } from '@prisma/client';
import { getWatermarkedUrl } from '../utils/cloudinaryWatermark';

type ExportFormat = 'ebay' | 'amazon' | 'facebook' | 'quickbooks';

/**
 * CSV Escape Helper — standard CSV escaping
 * Wraps fields with commas/quotes/newlines, escapes internal quotes
 */
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Map condition grades to eBay Seller Hub bulk upload Condition strings
 * eBay Seller Hub CSV format requires human-readable condition values, NOT numeric IDs
 * FindA.Sale uses letter grades (A, B, C, D, etc.) and plain text conditions
 */
function mapConditionToEbayString(condition: string | null | undefined): string {
  if (!condition) return 'Used'; // Default to Used

  const conditionMap: Record<string, string> = {
    'NEW': 'New',
    'LIKE_NEW': 'Like New',
    'A': 'Like New', // Like New
    'GOOD': 'Very Good',
    'USED': 'Used',
    'B': 'Very Good', // Good
    'REFURBISHED': 'Manufacturer refurbished',
    'FAIR': 'Good',
    'C': 'Good', // Fair
    'POOR': 'For parts or not working',
    'D': 'For parts or not working', // Poor
    'PARTS_OR_REPAIR': 'For parts or not working',
  };

  return conditionMap[condition.toUpperCase()] || 'Used'; // Default to Used
}

/**
 * eBay Draft Listings Template Format
 * Matches eBay's official Seller Hub bulk upload template
 * https://www.ebay.com/help/selling/listings/creating-managing-listings/upload-listings
 */
function formatEbayCsv(items: Item[], includeWatermark: boolean = false): string {
  // eBay template header rows (required for Seller Hub bulk upload)
  const infoRows: string[] = [
    '#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,',
    '#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html,,,,,,,,,,',
    '"#INFO After you\'ve successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts",,,,,,,,,,',
    '#INFO,,,,,,,,,,',
  ];

  // Column header row (exact format required by eBay)
  const headerRow = 'Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8),Custom label (SKU),Category ID,*Title,UPC,*Price,*Quantity,Item photo URL,*Condition,Description,*Format';

  const rows: string[] = [...infoRows, headerRow];

  items.forEach((item) => {
    // Extract first photo URL or use empty string
    let photoUrl = '';
    if (item.photoUrls && item.photoUrls.length > 0) {
      photoUrl = item.photoUrls[0];
      // Apply Cloudinary watermark overlay if requested
      if (includeWatermark && photoUrl) {
        photoUrl = getWatermarkedUrl(photoUrl);
      }
    }

    // Truncate title to 80 chars (eBay limit)
    const truncatedTitle = item.title.substring(0, 80);

    // Clean description: strip HTML tags, limit to 500 chars
    const cleanDescription = (item.description || '')
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
      .substring(0, 500);

    // Format price as plain number (e.g., "19.99")
    const formattedPrice = item.price ? parseFloat(String(item.price)).toFixed(2) : '';

    // Build data row
    const row = [
      escapeCsvField('Draft'), // Action
      escapeCsvField(item.sku || item.id), // Custom label (SKU)
      escapeCsvField(''), // Category ID (organizer fills in)
      escapeCsvField(truncatedTitle), // Title
      escapeCsvField(''), // UPC (we don't have this)
      escapeCsvField(formattedPrice), // Price
      escapeCsvField('1'), // Quantity
      escapeCsvField(photoUrl), // Item photo URL
      escapeCsvField(mapConditionToEbayString(item.condition)), // Condition
      escapeCsvField(cleanDescription), // Description
      escapeCsvField('FixedPrice'), // Format
    ];

    rows.push(row.join(','));
  });

  return rows.join('\n');
}

/**
 * Map condition to human-readable label for Amazon/Facebook exports
 */
function mapConditionLabel(condition: string | null | undefined): string {
  if (!condition) return 'Used';

  const conditionMap: Record<string, string> = {
    'NEW': 'New',
    'LIKE_NEW': 'Like New',
    'A': 'Like New',
    'GOOD': 'Good',
    'USED': 'Used',
    'B': 'Good',
    'REFURBISHED': 'Refurbished',
    'FAIR': 'Fair',
    'C': 'Fair',
    'POOR': 'Poor',
    'D': 'Poor',
    'PARTS_OR_REPAIR': 'Parts or Not Working',
  };

  return conditionMap[condition.toUpperCase()] || 'Used';
}

/**
 * Amazon Format: product-id, product-id-type, item-condition, price, item-note, will-ship-internationally
 */
function formatAmazonCsv(items: Item[]): string {
  const headers = ['product-id', 'product-id-type', 'item-condition', 'price', 'item-note', 'will-ship-internationally'];
  const rows: string[] = [headers.map(escapeCsvField).join(',')];

  items.forEach((item) => {
    const productId = item.sku || item.id;
    const description = item.description ? item.description.substring(0, 500) : '';
    const shippingValue = item.shippingAvailable ? 'Yes' : 'No';

    const row = [
      escapeCsvField(productId),
      escapeCsvField('SellerSKU'),
      escapeCsvField(mapConditionLabel(item.condition)),
      escapeCsvField(item.price ?? ''),
      escapeCsvField(description),
      escapeCsvField(shippingValue),
    ];
    rows.push(row.join(','));
  });

  return rows.join('\n');
}

/**
 * Facebook Marketplace Format: title, price, category, condition, description, availability, image_url
 */
function formatFacebookCsv(items: Item[]): string {
  const headers = ['title', 'price', 'category', 'condition', 'description', 'availability', 'image_url'];
  const rows: string[] = [headers.map(escapeCsvField).join(',')];

  items.forEach((item) => {
    const availability = item.status === 'AVAILABLE' ? 'In Stock' : 'Out of Stock';

    // Get watermarked photo URL
    let photoUrl = '';
    if (item.photoUrls && item.photoUrls.length > 0) {
      photoUrl = item.photoUrls[0];
      photoUrl = getWatermarkedUrl(photoUrl);
    }

    const row = [
      escapeCsvField(item.title),
      escapeCsvField(item.price ?? ''),
      escapeCsvField(item.category || ''),
      escapeCsvField(mapConditionLabel(item.condition)),
      escapeCsvField(item.description || ''),
      escapeCsvField(availability),
      escapeCsvField(photoUrl),
    ];
    rows.push(row.join(','));
  });

  return rows.join('\n');
}

/**
 * QuickBooks Format: Account, Name, Amount, Date, Memo, Class
 * Pre-wire for QuickBooks integration — account code hardcoded to '4100' (Sales Income)
 */
function formatQuickBooksCsv(items: Item[]): string {
  const headers = ['Account', 'Name', 'Amount', 'Date', 'Memo', 'Class'];
  const rows: string[] = [headers.map(escapeCsvField).join(',')];

  items.forEach((item) => {
    // Account code: hardcoded to '4100' (Sales Income) — Pre-wire: will be configurable when QB feature activates
    const accountCode = '4100';
    const name = item.title;
    const amount = item.price ?? '';
    // Date: use item.updatedAt ISO date split at 'T' for YYYY-MM-DD
    const dateStr = item.updatedAt ? new Date(item.updatedAt).toISOString().split('T')[0] : '';
    // Memo: category or 'Item'
    const memo = `${item.category || 'Item'} - ${item.title}`;
    // Class: empty string (configurable in future)
    const classCode = '';

    const row = [
      escapeCsvField(accountCode),
      escapeCsvField(name),
      escapeCsvField(amount),
      escapeCsvField(dateStr),
      escapeCsvField(memo),
      escapeCsvField(classCode),
    ];
    rows.push(row.join(','));
  });

  return rows.join('\n');
}

/**
 * Main export function — routes to format-specific generators
 */
export function generateCsvExport(items: Item[], format: ExportFormat, includeWatermark: boolean = false): string {
  switch (format) {
    case 'ebay':
      return formatEbayCsv(items, includeWatermark);
    case 'amazon':
      return formatAmazonCsv(items);
    case 'facebook':
      return formatFacebookCsv(items);
    case 'quickbooks':
      return formatQuickBooksCsv(items);
    default:
      throw new Error(`Unknown export format: ${format}`);
  }
}

/**
 * Generate safe filename for CSV
 */
export function generateCsvFilename(saleTitle: string, format: ExportFormat): string {
  const today = new Date().toISOString().split('T')[0];
  const sanitized = saleTitle.replace(/[^a-zA-Z0-9-_ ]/g, '_').replace(/\s+/g, '_');
  return `${sanitized}_${format}_export_${today}.csv`;
}
