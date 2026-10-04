/**
 * Marketplace condition strings read through the one condition vocabulary (item editor unification, U4).
 *
 * These helpers replace three copies of the same Facebook mapping (exportController x2, extensionController).
 * Every function reads the NORMALIZED condition (normalizeCondition from ./conditionMapping), so legacy values
 * (LIKE_NEW, EXCELLENT, GOOD, FAIR, POOR, any casing) land on one of the four canonical conditions. The output
 * strings for the four canonical conditions are exactly the strings that shipped before; grade never changes them.
 *
 * PURE: no prisma, no services.
 */
import { normalizeCondition } from './conditionMapping';

/**
 * Facebook Marketplace condition label (bulk upload XLSX and the extension's pre-formatted condition string).
 * NEW -> New, REFURBISHED -> Used - Like New, PARTS_OR_REPAIR -> Used - Fair, USED and unknown -> Used - Good.
 */
export function facebookMarketplaceCondition(condition: string | null | undefined): string {
  switch (normalizeCondition(condition).condition) {
    case 'NEW':
      return 'New';
    case 'REFURBISHED':
      return 'Used - Like New';
    case 'PARTS_OR_REPAIR':
      return 'Used - Fair';
    case 'USED':
    default:
      return 'Used - Good';
  }
}

/**
 * Facebook Commerce Manager catalog condition enum. Accepted values: new, refurbished, used_like_new, used_good,
 * used_fair, used_poor. NEW -> new, REFURBISHED -> used_like_new, USED -> used_good, PARTS_OR_REPAIR -> used_fair,
 * and a missing or unrecognized condition -> used (as before).
 */
export function facebookCommerceCondition(condition: string | null | undefined): string {
  switch (normalizeCondition(condition).condition) {
    case 'NEW':
      return 'new';
    case 'REFURBISHED':
      return 'used_like_new';
    case 'USED':
      return 'used_good';
    case 'PARTS_OR_REPAIR':
      return 'used_fair';
    default:
      return 'used';
  }
}
