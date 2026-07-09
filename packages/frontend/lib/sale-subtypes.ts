// Canonical sale-type -> subtype taxonomy. Single source of truth — do not duplicate
// this list elsewhere (see ADR-023, claude_docs/feature-notes/ADR-023-sale-subtype-reconciliation.md,
// for why scattering this list across files was the root cause of a whole taxonomy cleanup).

export interface SaleSubtypeOption {
  value: string;
  label: string;
}

export const SALE_SUBTYPES: Record<string, SaleSubtypeOption[]> = {
  ESTATE: [
    { value: 'estate', label: 'Estate Sale' },
    { value: 'downsizing', label: 'Downsizing Sale' },
    { value: 'liquidation', label: 'Liquidation Sale' },
  ],
  YARD: [
    { value: 'yard', label: 'Yard / Garage Sale' },
    { value: 'moving', label: 'Moving Sale' },
  ],
  AUCTION: [
    { value: 'auction', label: 'Auction House' },
    { value: 'storage', label: 'Storage Auction' },
  ],
  FLEA_MARKET: [
    { value: 'flea', label: 'Flea Market' },
    { value: 'popup', label: 'Pop-Up Event' },
    { value: 'swap_meet', label: 'Swap Meet' },
  ],
  RETAIL: [
    { value: 'storefront', label: 'Storefront' },
    { value: 'consignment', label: 'Consignment Shop' },
  ],
  DORM_DASH: [],
};

export function getSubtypesFor(saleType: string | undefined | null): SaleSubtypeOption[] {
  if (!saleType) return [];
  return SALE_SUBTYPES[saleType] ?? [];
}
