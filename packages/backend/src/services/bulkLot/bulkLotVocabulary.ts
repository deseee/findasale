/**
 * Bulk lot vocabulary (ADR-136). Single source of truth for the lot kinds. Pure constants: no env reads, no network,
 * no imports. The frontend never hardcodes these lists; it reads them from GET /api/bulk-lots/status.
 */
export const BULK_LOT_KINDS = [
  'BULK_COMMON',
  'BULK_UNCOMMON',
  'BULK_COMMON_UNCOMMON',
  'BULK_RARE',
  'BULK_LAND',
  'BULK_MIXED',
] as const;
export type BulkLotKind = (typeof BULK_LOT_KINDS)[number];

export const BULK_LOT_KIND_LABELS: Record<BulkLotKind, string> = {
  BULK_COMMON: 'Bulk commons',
  BULK_UNCOMMON: 'Bulk uncommons',
  BULK_COMMON_UNCOMMON: 'Bulk commons and uncommons',
  BULK_RARE: 'Bulk rares',
  BULK_LAND: 'Basic lands',
  BULK_MIXED: 'Mixed bulk',
};

export const DEFAULT_BULK_LOT_KIND: BulkLotKind = 'BULK_COMMON_UNCOMMON';
export const DEFAULT_BULK_LOT_GAME = 'MTG';

export const BULK_LOT_VOCABULARY = {
  kinds: BULK_LOT_KINDS,
  labels: BULK_LOT_KIND_LABELS,
  defaultKind: DEFAULT_BULK_LOT_KIND,
  defaultGame: DEFAULT_BULK_LOT_GAME,
} as const;
