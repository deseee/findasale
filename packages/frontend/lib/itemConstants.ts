/**
 * Canonical item conditions and categories
 * Single source of truth for item metadata across the frontend
 */

// ============================================================================
// CONDITIONS — Match schema.prisma Item model exactly
// ============================================================================
// Schema source: packages/database/prisma/schema.prisma
// Comment: NEW | USED | REFURBISHED | PARTS_OR_REPAIR
// These are the authoritative DB values; use CONDITION_LABELS for display
export const CONDITIONS = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'] as const;
export type Condition = typeof CONDITIONS[number];

/**
 * Display labels for conditions
 * Use this when rendering condition dropdowns or labels to users
 * Maps from DB values to human-readable labels
 */
export const CONDITION_LABELS: Record<Condition, string> = {
  NEW: 'New',
  USED: 'Used',
  REFURBISHED: 'Refurbished',
  PARTS_OR_REPAIR: 'Parts / Repair',
};

/**
 * Condition mappings for display
 * Handles both DB values and AI-suggested grades (S/A/B/C/D)
 * Used for backwards compatibility with existing DB records and condition grades
 */
export const CONDITION_MAP: Record<string, string> = {
  // Canonical DB values
  'NEW': 'New',
  'USED': 'Used',
  'REFURBISHED': 'Refurbished',
  'PARTS_OR_REPAIR': 'Parts or Repair',
  // Grade letters (from conditionGrade field: S | A | B | C | D)
  'S': 'Mint',
  'A': 'Excellent',
  'B': 'Good',
  'C': 'Fair',
  'D': 'Poor',
  // Legacy mappings for backwards compatibility with older DB records
  'LIKE_NEW': 'New',
  'EXCELLENT': 'New',
  'GOOD': 'Used',
  'FAIR': 'Used',
  'POOR': 'Parts or Repair',
  'FOR_PARTS': 'For Parts / As-Is',
};

/**
 * Format a condition value to a human-readable label
 * Handles both DB values and legacy formats
 */
export function formatCondition(value: string | null | undefined): string {
  if (!value) return 'Not specified';
  return CONDITION_MAP[value] || value;
}

// ============================================================================
// CATEGORIES — Organizer-facing product categories
// ============================================================================
export const CATEGORIES = [
  'Furniture',
  'Jewelry',
  'Art & Decor',
  'Clothing',
  'Kitchenware',
  'Tools & Hardware',
  'Collectibles',
  'Electronics',
  'Books & Media',
  'Other',
] as const;

export type Category = typeof CATEGORIES[number];

// ============================================================================
// CATEGORY DISPLAY HELPER
// ============================================================================
// Decodes HTML entities and simplifies colon-separated eBay category paths
// to just the last (most specific) segment for display purposes.
// The raw value is preserved for filtering/data operations.
export const formatCategoryLabel = (category: string | null | undefined): string => {
  if (!category) return '';
  const decoded = category
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  const segments = decoded.split(':').map((s) => s.trim()).filter(Boolean);
  const label = segments[segments.length - 1] || decoded;
  return label.charAt(0).toUpperCase() + label.slice(1);
};
