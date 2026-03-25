import { Item } from '@prisma/client';

type ExportFormat = 'ebay' | 'amazon' | 'facebook';

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
 * Map condition codes to human-readable labels
 */
function mapCondition(condition: string | null | undefined): string {
  if (!condition) return 'Unknown';

  const conditionMap: Record<string, string> = {
    mint: 'Mint',
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
  };

  return conditionMap[condition.toLowerCase()] || 'Unknown';
}

/**
 * eBay Format: Title, Description, Price, Condition, Category, UPC, Item Specifics
 */
function formatEbayCsv(items: Item[]): string {
  const headers = ['Title', 'Description', 'Price', 'Condition', 'Category', 'UPC', 'Item Specifics'];
  const rows: string[] = [headers.map(escapeCsvField).join(',')];

  items.forEach((item) => {
    const row = [
      escapeCsvField(item.title),
      escapeCsvField(item.description || ''),
      escapeCsvField(item.price ?? ''),
      escapeCsvField(mapCondition(item.condition)),
      escapeCsvField(item.category || ''),
      escapeCsvField(item.sku || ''),
      escapeCsvField(''), // Item Specifics placeholder
    ];
    rows.push(row.join(','));
  });

  return rows.join('\n');
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
      escapeCsvField(mapCondition(item.condition)),
      escapeCsvField(item.price ?? ''),
      escapeCsvField(description),
      escapeCsvField(shippingValue),
    ];
    rows.push(row.join(','));
  });

  return rows.join('\n');
}

/**
 * Facebook Marketplace Format: title, price, category, condition, description, availability
 */
function formatFacebookCsv(items: Item[]): string {
  const headers = ['title', 'price', 'category', 'condition', 'description', 'availability'];
  const rows: string[] = [headers.map(escapeCsvField).join(',')];

  items.forEach((item) => {
    const availability = item.status === 'AVAILABLE' ? 'In Stock' : 'Out of Stock';

    const row = [
      escapeCsvField(item.title),
      escapeCsvField(item.price ?? ''),
      escapeCsvField(item.category || ''),
      escapeCsvField(mapCondition(item.condition)),
      escapeCsvField(item.description || ''),
      escapeCsvField(availability),
    ];
    rows.push(row.join(','));
  });

  return rows.join('\n');
}

/**
 * Main export function — routes to format-specific generators
 */
export function generateCsvExport(items: Item[], format: ExportFormat): string {
  switch (format) {
    case 'ebay':
      return formatEbayCsv(items);
    case 'amazon':
      return formatAmazonCsv(items);
    case 'facebook':
      return formatFacebookCsv(items);
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
