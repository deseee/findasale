/**
 * eBay Category Hierarchy Types
 * Imported from static JSON for CSV export category picker
 */

export interface EbayCategoryChild {
  id: string;
  name: string;
}

export interface EbayCategory {
  id: string;
  name: string;
  children: EbayCategoryChild[];
}

export type EbayCategoryList = EbayCategory[];
