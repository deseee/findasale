/**
 * Per-platform chips for the item form ("Where this is listed" and the sticky header strip), from the
 * marketplace-status response plus what the edit payload already says about eBay and Discogs.
 *
 * Pure module. All twelve platforms are always returned, in a fixed order, so the form can show the listed ones and keep
 * the rest collapsed under "Other marketplaces". Extension marketplaces (Facebook, Craigslist, Gumtree AU, Poshmark,
 * Mercari, Vinted, Grailed) carry a prompt only: FindA.Sale never pushes to them, so there is nothing to click.
 */
import type { MarketplaceStatus } from './itemMarketplaceApi';

export const PLATFORM_KEYS = [
  'ebay',
  'discogs',
  'reverb',
  'etsy',
  'shopify',
  'facebook',
  'craigslist',
  'gumtreeAu',
  'poshmark',
  'mercari',
  'vinted',
  'grailed',
] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

const EXTENSION_KEYS: ReadonlyArray<string> = ['facebook', 'craigslist', 'gumtreeAu', 'poshmark', 'mercari', 'vinted', 'grailed'];

const DEFAULT_LABELS: Record<PlatformKey, string> = {
  ebay: 'eBay',
  discogs: 'Discogs',
  reverb: 'Reverb',
  etsy: 'Etsy',
  shopify: 'Shopify',
  facebook: 'Facebook',
  craigslist: 'Craigslist',
  gumtreeAu: 'Gumtree AU',
  poshmark: 'Poshmark',
  mercari: 'Mercari',
  vinted: 'Vinted',
  grailed: 'Grailed',
};

export type ChipKind = 'live' | 'pending' | 'manual' | 'paused' | 'quiet';

export interface PlatformChip {
  key: PlatformKey;
  label: string;
  kind: ChipKind;
  /** Header strip text, for example "eBay live" or "Vinted: update by hand". */
  short: string;
  /** Section status text, for example "Live" or "Listed, needs manual update". */
  long: string;
  /** Extension marketplaces only, when listed: "Needs manual update on Vinted". */
  prompt?: string;
  /** True for a platform where the item is listed in some form (live, pending, manual or paused). */
  listed: boolean;
  isExtension: boolean;
}

export interface ChipItemInput {
  ebayListingId?: string | null;
  ebayOfferId?: string | null;
  discogsListingId?: string | null;
}

export function buildPlatformChips(status: MarketplaceStatus | undefined, item: ChipItemInput): PlatformChip[] {
  return PLATFORM_KEYS.map((key) => {
    const entry = status ? status.platforms[key] : undefined;
    const label = (entry && entry.label) || DEFAULT_LABELS[key];
    const isExtension = EXTENSION_KEYS.indexOf(key) !== -1;
    const st = entry ? String(entry.status) : '';
    const make = (kind: ChipKind, short: string, long: string, prompt?: string): PlatformChip => ({
      key,
      label,
      kind,
      short,
      long,
      ...(prompt ? { prompt } : {}),
      listed: kind !== 'quiet',
      isExtension,
    });

    if (key === 'ebay') {
      if (st === 'paused') return make('paused', 'eBay paused', 'Sync paused');
      if (item.ebayListingId) return make('live', 'eBay live', 'Live');
      if (item.ebayOfferId) return make('pending', 'eBay pending', 'Pending publish');
      if (st === 'live') return make('live', 'eBay live', 'Live');
      return make('quiet', 'eBay', 'Not listed');
    }
    if (key === 'discogs' && !entry && item.discogsListingId) return make('live', 'Discogs live', 'Live');

    if (st === 'live') return make('live', `${label} live`, 'Live');
    if (st === 'listed_needs_manual_update') {
      return make('manual', `${label}: update by hand`, 'Listed, needs manual update', `Needs manual update on ${label}`);
    }
    if (st === 'paused') return make('paused', `${label} paused`, 'Paused');
    return make('quiet', label, st === 'eligible' ? 'Not listed yet' : 'Not listed');
  });
}
