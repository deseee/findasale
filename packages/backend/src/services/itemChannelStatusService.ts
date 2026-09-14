/*
 * itemChannelStatusService.ts -- Add Items collapsed-row multi-channel publish
 * status (2026-09-14). Read-only composition layer, per
 * claude_docs/feature-notes/ADR-2026-09-14-add-items-multichannel-status-aggregation.md.
 *
 * Deliberately does NOT touch or refactor the existing independent systems it
 * calls into (marketplaceEligibilityRules.ts, EbayConnection/ShopifyListing
 * fields, MarketplaceListingJob). This file only composes their existing
 * signals into one per-item shape for the Add Items list page.
 *
 * Discogs is published-only here on purpose -- its real eligibility check
 * (checkDiscogsEligibility in discogsListingConnector.ts) is a live,
 * rate-limited, OAuth-authenticated call to Discogs's own catalog search API
 * per item, and was never designed to run for every row of a 50-200 item
 * list on every page load. That check stays exactly where it already lives
 * (the row-expand / GET /api/discogs/items/:id/eligibility endpoint).
 *
 * Reverb (added 2026-09-14, ADR addendum): full PUBLISHED/ELIGIBLE parity
 * with every other Tier A channel. Eligibility uses the registry's new
 * 'REVERB' CATEGORY_ALLOWLIST rule (marketplaceEligibilityRules.ts), kept in
 * lockstep with the exact category gate reverbMarketplaceController.ts's
 * pushItemToReverb already enforces server-side. Published uses the new
 * Item.reverbListingId field (mirrors discogsListingId), populated by
 * reverbMarketplaceController.ts on a successful push and cleared on
 * delete/end-listing.
 */

import { checkEligibility, EligibilityCheckItem } from './marketplaceEligibilityRules';

export type ChannelStatusValue = 'PUBLISHED' | 'ELIGIBLE' | null;

export interface ItemChannelStatus {
  ebay: ChannelStatusValue;
  shopify: ChannelStatusValue;
  facebook: ChannelStatusValue;
  craigslist: ChannelStatusValue;
  gumtreeAu: ChannelStatusValue;
  grailed: ChannelStatusValue;
  poshmark: ChannelStatusValue;
  mercari: ChannelStatusValue;
  vinted: ChannelStatusValue;
  discogs: ChannelStatusValue;
  reverb: ChannelStatusValue;
}

/** Minimal item shape this service needs. Matches fields already selected by
 * getDraftItemsBySaleId's Prisma query (itemController.ts). */
export interface ChannelStatusItemInput extends EligibilityCheckItem {
  id: string;
  ebayListingId: string | null | undefined;
  discogsListingId: string | null | undefined;
  reverbListingId: string | null | undefined;
  shopifyListing: { id: string } | null | undefined;
}

/** Minimal organizer shape this service needs -- caller fetches these fields
 * explicitly rather than this service doing its own Prisma calls, keeping it
 * a pure function with zero I/O of its own. */
export interface ChannelStatusOrganizerInput {
  hasEbayConnection: boolean;
  shopifyEnabled: boolean;
  subscriptionTier: string; // 'SIMPLE' | 'PRO' | 'TEAMS'
  hasActiveDiscogsAccount: boolean;
  hasActiveReverbAccount: boolean;
}

/** Which extension-based (no official API/OAuth) platforms this organizer has
 * ever posted to, derived by the caller from a single batched
 * MarketplaceListingJob query scoped to the organizer (not per-item). A
 * platform the organizer has never used shows no dot at all, published or
 * eligible -- avoids noise for channels an organizer doesn't actually use. */
export interface ExtensionPlatformsUsed {
  facebook: boolean;
  craigslist: boolean;
  gumtreeAu: boolean;
  grailed: boolean;
  poshmark: boolean;
  mercari: boolean;
  vinted: boolean;
}

/** Per-item set of extension platforms already PUBLISHED (posted, not yet
 * removed) -- caller derives this from the same batched MarketplaceListingJob
 * query used for ExtensionPlatformsUsed, keyed by itemId. */
export type PublishedExtensionPlatformsByItemId = Map<string, Set<
  'FACEBOOK' | 'CRAIGSLIST' | 'GUMTREE_AU' | 'GRAILED' | 'POSHMARK' | 'MERCARI' | 'VINTED'
>>;

function extensionChannelStatus(
  platform: 'FACEBOOK' | 'CRAIGSLIST' | 'GUMTREE_AU' | 'GRAILED' | 'POSHMARK' | 'MERCARI' | 'VINTED',
  organizerUsesPlatform: boolean,
  itemPublishedOnPlatform: boolean,
  item: EligibilityCheckItem
): ChannelStatusValue {
  if (!organizerUsesPlatform) return null; // organizer has never used this channel -- don't show it at all
  if (itemPublishedOnPlatform) return 'PUBLISHED';
  const result = checkEligibility(platform, item);
  return result.eligible ? 'ELIGIBLE' : null;
}

/** Pure composition function -- no I/O. Caller has already fetched
 * everything needed (items, organizer flags, batched job data). */
export function computeChannelStatusForItems(
  items: ChannelStatusItemInput[],
  organizer: ChannelStatusOrganizerInput,
  extensionPlatformsUsed: ExtensionPlatformsUsed,
  publishedExtensionPlatformsByItemId: PublishedExtensionPlatformsByItemId
): Record<string, ItemChannelStatus> {
  const result: Record<string, ItemChannelStatus> = {};

  const shopifyEligible = organizer.shopifyEnabled && organizer.subscriptionTier === 'TEAMS';

  for (const item of items) {
    const publishedOnItem = publishedExtensionPlatformsByItemId.get(item.id) ?? new Set();

    result[item.id] = {
      ebay: !organizer.hasEbayConnection
        ? null
        : item.ebayListingId
          ? 'PUBLISHED'
          : item.ebayCategoryId
            ? 'ELIGIBLE'
            : null,

      shopify: !shopifyEligible
        ? null
        : item.shopifyListing
          ? 'PUBLISHED'
          : 'ELIGIBLE',

      // Discogs: published-only by design (see file header) -- never 'ELIGIBLE' here.
      discogs: organizer.hasActiveDiscogsAccount && item.discogsListingId ? 'PUBLISHED' : null,

      // Reverb (2026-09-14 addendum): full Tier A parity -- PUBLISHED when a real listing id is
      // persisted, else ELIGIBLE when connected and the registry's REVERB allowlist rule passes.
      reverb: !organizer.hasActiveReverbAccount
        ? null
        : item.reverbListingId
          ? 'PUBLISHED'
          : checkEligibility('REVERB', item).eligible
            ? 'ELIGIBLE'
            : null,

      facebook: extensionChannelStatus('FACEBOOK', extensionPlatformsUsed.facebook, publishedOnItem.has('FACEBOOK'), item),
      craigslist: extensionChannelStatus('CRAIGSLIST', extensionPlatformsUsed.craigslist, publishedOnItem.has('CRAIGSLIST'), item),
      gumtreeAu: extensionChannelStatus('GUMTREE_AU', extensionPlatformsUsed.gumtreeAu, publishedOnItem.has('GUMTREE_AU'), item),
      grailed: extensionChannelStatus('GRAILED', extensionPlatformsUsed.grailed, publishedOnItem.has('GRAILED'), item),
      poshmark: extensionChannelStatus('POSHMARK', extensionPlatformsUsed.poshmark, publishedOnItem.has('POSHMARK'), item),
      mercari: extensionChannelStatus('MERCARI', extensionPlatformsUsed.mercari, publishedOnItem.has('MERCARI'), item),
      vinted: extensionChannelStatus('VINTED', extensionPlatformsUsed.vinted, publishedOnItem.has('VINTED'), item),
    };
  }

  return result;
}
