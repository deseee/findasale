/**
 * Canonical item conditions and categories
 * Single source of truth for item metadata across the frontend
 */

import { normalizeCondition } from './conditionModel';

// ============================================================================
// CONDITIONS -- one vocabulary, shared with lib/conditionModel.ts
// ============================================================================
// Canonical Item.condition values: NEW | USED | REFURBISHED | PARTS_OR_REPAIR (schema.prisma, backend
// utils/conditionMapping.ts). Used goods also carry a grade A, B, C or D (grade S is retired). lib/conditionModel.ts
// is the model (normalization, grade picker options, eBay preview); the exports below stay for the pages that
// import them (PreviewModal, SmartInventoryUpload, review.tsx) and are kept consistent with it by
// lib/__tests__/conditionModel.test.ts and lib/__tests__/itemConstants.test.ts.
export const CONDITIONS = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'] as const;
export type Condition = typeof CONDITIONS[number];

/**
 * Display labels for the canonical conditions (same strings as CANONICAL_CONDITION_LABELS in conditionModel.ts).
 * Use this when rendering condition dropdowns or labels to users.
 */
export const CONDITION_LABELS: Record<Condition, string> = {
  NEW: 'New',
  USED: 'Used',
  REFURBISHED: 'Refurbished',
  PARTS_OR_REPAIR: 'Parts / Repair',
};

/**
 * LEGACY display map for values already stored in the database. Read-only display of old data: new code should use
 * normalizeCondition / readConditionForForm from lib/conditionModel.ts. Every entry matches that model:
 *   - canonical conditions use CONDITION_LABELS;
 *   - grade letters use the approved grade wording (A Excellent, B Very good, C Good, D Acceptable; S is retired and is
 *     read as A, so it is labelled "(legacy)");
 *   - legacy condition words read the way the backend reads them: LIKE_NEW, EXCELLENT, GOOD and FAIR are Used,
 *     POOR and FOR_PARTS are Parts / Repair.
 */
export const CONDITION_MAP: Record<string, string> = {
  // Canonical DB values
  'NEW': CONDITION_LABELS.NEW,
  'USED': CONDITION_LABELS.USED,
  'REFURBISHED': CONDITION_LABELS.REFURBISHED,
  'PARTS_OR_REPAIR': CONDITION_LABELS.PARTS_OR_REPAIR,
  // Grade letters (conditionGrade field)
  'S': 'Excellent (legacy)',
  'A': 'Excellent',
  'B': 'Very good',
  'C': 'Good',
  'D': 'Acceptable',
  // Legacy condition values from older records
  'LIKE_NEW': CONDITION_LABELS.USED,
  'EXCELLENT': CONDITION_LABELS.USED,
  'GOOD': CONDITION_LABELS.USED,
  'FAIR': CONDITION_LABELS.USED,
  'POOR': CONDITION_LABELS.PARTS_OR_REPAIR,
  'FOR_PARTS': CONDITION_LABELS.PARTS_OR_REPAIR,
};

/**
 * Format a condition value (or grade letter) to a human-readable label.
 * Exact matches use CONDITION_MAP; other spellings ("Like New", "used_good") go through the condition model;
 * anything unrecognized is returned as it was stored.
 */
export function formatCondition(value: string | null | undefined): string {
  if (!value) return 'Not specified';
  if (CONDITION_MAP[value]) return CONDITION_MAP[value];
  const normalized = normalizeCondition(value).condition;
  return normalized ? CONDITION_LABELS[normalized] : value;
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
