/**
 * Crosslisting blockers for the Add Items list: items that cannot go to some marketplaces
 * because shipping data is missing or the organizer marked them not for shipping.
 *
 * Trust rule mirrors extensionController.getAutolistQueue `hasTrustedPackage`: a weight counts as
 * confirmed when packageConfirmedByOrganizer === true, or packageEstimateSource is a known source
 * other than SEED (generic fallback) or AI (unmeasured estimate). Pure module, no imports.
 */

const UNTRUSTED_PACKAGE_SOURCES = ['SEED', 'AI'];

export type WeightIssue = 'NONE' | 'UNCONFIRMED' | null;

export interface CrosslistBlockers {
  /** 'NONE' = no weight at all, 'UNCONFIRMED' = a weight exists but is only an estimate, null = fine. */
  weight: WeightIssue;
  /** True when length, width or height is missing or not above zero. */
  noDimensions: boolean;
  /** ebayShippingOverride === 'LOCAL_PICKUP_ONLY'. */
  pickupOnly: boolean;
  /** ebayShippingOverride === 'DONT_LIST'. */
  dontList: boolean;
}

export const WEIGHT_BADGE_TEXT = { NONE: 'No weight', UNCONFIRMED: 'Weight not confirmed' } as const;
export const WEIGHT_BADGE_TITLE = {
  NONE: 'No package weight yet. Mercari needs a confirmed weight, and other marketplaces need one to calculate shipping. Open the item and add the package weight.',
  UNCONFIRMED: 'The weight is only an estimate. Mercari needs a confirmed weight before it will list the item. Open the item and confirm or enter the package weight.',
} as const;
export const DIMENSIONS_BADGE_TEXT = 'No dimensions';
export const DIMENSIONS_BADGE_TITLE =
  'Length, width and height are missing. Poshmark and Mercari use package dimensions for their size checks. Open the item and add them.';
export const PICKUP_BADGE_TEXT = 'Pickup only';
export const PICKUP_BADGE_TITLE = 'Marked local pickup only, so this item is not listed on Poshmark, Mercari, Vinted or Grailed, and any listing already there is taken down.';
export const DONT_LIST_BADGE_TEXT = 'Not for crosslisting';
export const DONT_LIST_BADGE_TITLE = 'Marked do not list, so this item is not sent to any shipping marketplace.';

function positive(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

export function hasTrustedPackage(item: {
  packageEstimateSource?: string | null;
  packageConfirmedByOrganizer?: boolean | null;
}): boolean {
  return (
    item.packageConfirmedByOrganizer === true ||
    (item.packageEstimateSource != null && !UNTRUSTED_PACKAGE_SOURCES.includes(item.packageEstimateSource))
  );
}

export function getCrosslistBlockers(item: any): CrosslistBlockers {
  const pickupOnly = item?.ebayShippingOverride === 'LOCAL_PICKUP_ONLY';
  const dontList = item?.ebayShippingOverride === 'DONT_LIST';
  // Shipping data is irrelevant once the item is marked not for shipping, so do not nag about it.
  if (pickupOnly || dontList) return { weight: null, noDimensions: false, pickupOnly, dontList };

  let weight: WeightIssue = null;
  if (!positive(item?.packageWeightOz)) {
    // An estimate-only weight (aiPackageWeightOz) is never a confirmed weight.
    weight = positive(item?.aiPackageWeightOz) ? 'UNCONFIRMED' : 'NONE';
  } else if (!hasTrustedPackage(item)) {
    weight = 'UNCONFIRMED';
  }
  const noDimensions = !(positive(item?.packageLengthIn) && positive(item?.packageWidthIn) && positive(item?.packageHeightIn));
  return { weight, noDimensions, pickupOnly: false, dontList: false };
}

export type CrosslistFilter = 'weight' | 'dimensions' | 'notForShipping';

export function matchesCrosslistFilter(b: CrosslistBlockers, f: CrosslistFilter): boolean {
  if (f === 'weight') return b.weight !== null;
  if (f === 'dimensions') return b.noDimensions;
  return b.pickupOnly || b.dontList;
}

/** Counts across the given items (callers pass non-sold items). */
export function countCrosslistBlockers(items: any[]): { weight: number; dimensions: number; pickupOnly: number; dontList: number } {
  const out = { weight: 0, dimensions: 0, pickupOnly: 0, dontList: 0 };
  for (const it of items) {
    const b = getCrosslistBlockers(it);
    if (b.weight) out.weight++;
    if (b.noDimensions) out.dimensions++;
    if (b.pickupOnly) out.pickupOnly++;
    if (b.dontList) out.dontList++;
  }
  return out;
}
