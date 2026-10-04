/**
 * itemChannelStatusService -- Etsy channel dot (ADR-135 D4.6, B6). Pure function, no mocks needed.
 * Covers: etsy is null unless the organizer has an active Etsy account; ACTIVE listing is PUBLISHED, and
 * PUBLISHED_INELIGIBLE when the live age rule now fails; ELIGIBLE when the rule passes (card year, attested era,
 * craft supply); no data means no dot (allowlist posture); and every non-Etsy key is unchanged for items and
 * organizers that carry no Etsy inputs.
 */
import {
  computeChannelStatusForItems,
  ChannelStatusItemInput,
  ChannelStatusOrganizerInput,
  ExtensionPlatformsUsed,
} from '../itemChannelStatusService';

const NO_EXT: ExtensionPlatformsUsed = { facebook: false, craigslist: false, gumtreeAu: false, grailed: false, poshmark: false, mercari: false, vinted: false };

const baseOrganizer = (over: Partial<ChannelStatusOrganizerInput> = {}): ChannelStatusOrganizerInput => ({
  hasEbayConnection: true,
  shopifyEnabled: false,
  subscriptionTier: 'PRO',
  hasActiveDiscogsAccount: false,
  hasActiveReverbAccount: false,
  ...over,
});

const baseItem = (over: Partial<ChannelStatusItemInput> = {}): ChannelStatusItemInput =>
  ({
    id: 'i1',
    ebayListingId: null,
    discogsListingId: null,
    reverbListingId: null,
    shopifyListing: null,
    ebayCategoryId: null,
    asOfYear: 2026, // test injection: cutoff 2006
    ...over,
  }) as ChannelStatusItemInput;

const etsyOf = (item: ChannelStatusItemInput, org: ChannelStatusOrganizerInput) =>
  computeChannelStatusForItems([item], org, NO_EXT, new Map())[item.id].etsy;

describe('etsy dot', () => {
  const connected = baseOrganizer({ hasActiveEtsyAccount: true });

  it('is null when the organizer has no active Etsy account, even for a qualifying card', () => {
    const item = baseItem({ releaseYear: 1999 });
    expect(etsyOf(item, baseOrganizer())).toBeNull();
    expect(etsyOf(item, baseOrganizer({ hasActiveEtsyAccount: false }))).toBeNull();
  });

  it('is ELIGIBLE for a card released in 2006 or earlier, and null for 2007 or later', () => {
    expect(etsyOf(baseItem({ releaseYear: 2006 }), connected)).toBe('ELIGIBLE');
    expect(etsyOf(baseItem({ releaseYear: 1993 }), connected)).toBe('ELIGIBLE');
    expect(etsyOf(baseItem({ releaseYear: 2007 }), connected)).toBeNull();
  });

  it('is ELIGIBLE for an attested qualifying era and for a craft supply, null for a recent era', () => {
    expect(etsyOf(baseItem({ etsyWhenMade: 'before_2007' }), connected)).toBe('ELIGIBLE');
    expect(etsyOf(baseItem({ etsyWhenMade: '2010_2019' }), connected)).toBeNull();
    expect(etsyOf(baseItem({ etsyIsCraftSupply: true }), connected)).toBe('ELIGIBLE');
  });

  it('a craft-supply tick never rescues a card whose own release year is too recent', () => {
    expect(etsyOf(baseItem({ releaseYear: 2015, etsyIsCraftSupply: true }), connected)).toBeNull();
  });

  it('no era, no craft-supply tick and no card year means no dot', () => {
    expect(etsyOf(baseItem(), connected)).toBeNull();
    expect(etsyOf(baseItem({ etsyWhenMade: null, etsyIsCraftSupply: null, releaseYear: null }), connected)).toBeNull();
  });

  it('draft and other non-live listing states still show ELIGIBLE when the rule passes', () => {
    for (const etsyListingState of ['PREPARING', 'DRAFT_PENDING', 'DRAFT_READY', 'ENDED', 'FAILED']) {
      expect(etsyOf(baseItem({ etsyListingState, etsyWhenMade: 'before_2007' }), connected)).toBe('ELIGIBLE');
    }
  });

  it('an ACTIVE listing is PUBLISHED while the rule passes and PUBLISHED_INELIGIBLE once it fails', () => {
    expect(etsyOf(baseItem({ etsyListingState: 'ACTIVE', etsyWhenMade: 'before_2007' }), connected)).toBe('PUBLISHED');
    expect(etsyOf(baseItem({ etsyListingState: 'ACTIVE', releaseYear: 1995 }), connected)).toBe('PUBLISHED');
    // the card's year decides alone, so a stale era does not keep the dot green
    expect(etsyOf(baseItem({ etsyListingState: 'ACTIVE', releaseYear: 2015, etsyWhenMade: 'before_2007' }), connected)).toBe('PUBLISHED_INELIGIBLE');
    // no data at all is treated as ineligible (allowlist posture), so the live listing is flagged
    expect(etsyOf(baseItem({ etsyListingState: 'ACTIVE' }), connected)).toBe('PUBLISHED_INELIGIBLE');
  });

  it('an ACTIVE listing row for an organizer who is no longer connected shows no dot', () => {
    expect(etsyOf(baseItem({ etsyListingState: 'ACTIVE', etsyWhenMade: 'before_2007' }), baseOrganizer())).toBeNull();
  });
});

describe('every other channel is unchanged for items and organizers with no Etsy inputs', () => {
  it('returns the same values for the pre-Etsy keys, plus etsy: null', () => {
    const items = [
      baseItem({ id: 'a', ebayListingId: 'E1' }),
      baseItem({ id: 'b', ebayCategoryId: '183454' }),
      baseItem({ id: 'c', reverbListingId: 'R1', discogsListingId: 'D1' }),
    ];
    const org = baseOrganizer({ hasActiveDiscogsAccount: true });
    const out = computeChannelStatusForItems(items, org, NO_EXT, new Map());
    const { etsy: _a, ...a } = out.a;
    const { etsy: _b, ...b } = out.b;
    const { etsy: _c, ...c } = out.c;
    expect(out.a.etsy).toBeNull();
    expect(out.b.etsy).toBeNull();
    expect(out.c.etsy).toBeNull();
    expect(a).toEqual({ ebay: 'PUBLISHED', shopify: null, discogs: null, reverb: null, facebook: null, craigslist: null, gumtreeAu: null, grailed: null, poshmark: null, mercari: null, vinted: null });
    expect(b).toEqual({ ebay: 'ELIGIBLE', shopify: null, discogs: null, reverb: null, facebook: null, craigslist: null, gumtreeAu: null, grailed: null, poshmark: null, mercari: null, vinted: null });
    expect(c).toEqual({ ebay: null, shopify: null, discogs: 'PUBLISHED', reverb: null, facebook: null, craigslist: null, gumtreeAu: null, grailed: null, poshmark: null, mercari: null, vinted: null });
  });

  it('connecting Etsy changes only the etsy key', () => {
    const items = [baseItem({ id: 'a', ebayListingId: 'E1', releaseYear: 1999 }), baseItem({ id: 'b', ebayCategoryId: '183454' })];
    const without = computeChannelStatusForItems(items, baseOrganizer(), NO_EXT, new Map());
    const withEtsy = computeChannelStatusForItems(items, baseOrganizer({ hasActiveEtsyAccount: true }), NO_EXT, new Map());
    for (const id of ['a', 'b']) {
      const { etsy: _x, ...rest } = withEtsy[id];
      const { etsy: _y, ...restWithout } = without[id];
      expect(rest).toEqual(restWithout);
    }
    expect(withEtsy.a.etsy).toBe('ELIGIBLE');
    expect(withEtsy.b.etsy).toBeNull();
  });
});
