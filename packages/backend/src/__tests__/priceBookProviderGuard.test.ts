/**
 * Price book provider guard (ADR-140 section 5.1, acceptance AT-4).
 */
import {
  CATALOG_REFERENCE_SWITCH,
  CATALOG_REFERENCE_TERMS,
  getActiveProviders,
  isAllowedCatalogOrigin,
  isCatalogReferenceActive,
  isSwitchOn,
  termsAllow,
} from '../services/priceBook/providers/types';
import type { ProviderTerms, ReferenceProvider } from '../services/priceBook/providers/types';
import { DEFAULT_BOOK_SETTINGS, REFERENCE_KINDS } from '../services/priceBook/vocabulary';
import type { BookSettings } from '../services/priceBook/types';

const book = (over: Partial<BookSettings> = {}): BookSettings => ({
  ...DEFAULT_BOOK_SETTINGS,
  referenceOrder: [...DEFAULT_BOOK_SETTINGS.referenceOrder],
  ...over,
});

const provider = (kind: ReferenceProvider['kind'], terms: ProviderTerms, active: boolean | (() => boolean) = true): ReferenceProvider => ({
  kind,
  terms,
  isActive: () => (typeof active === 'function' ? active() : active),
  fetch: async () => new Map(),
});

const CLEARED: ProviderTerms = { status: 'CLEARED', reviewedOn: null, reference: 'ADR-140 section 5.2' };
const NOT_CLEARED: ProviderTerms = { status: 'NOT_CLEARED', reviewedOn: null, reference: 'ADR-140 section 5.1' };
const CONDITIONAL: ProviderTerms = { status: 'CONDITIONAL', reviewedOn: null, reference: 'x', switchName: 'SOME_SWITCH' };

/** Every switch name anyone could invent, all on. */
const EVERYTHING_ON: Record<string, string> = {
  SOME_SWITCH: 'true',
  CARD_CATALOG_PRICE_REFERENCE_ENABLED: 'true',
  CARD_PRICE_BOOK_ENABLED: 'true',
  CARD_PRICE_BOOK_LICENSED_FEED_ID: 'acme',
  LICENSED_FEED: 'true',
};

describe('AT-4 a NOT_CLEARED provider is never returned', () => {
  it('even with every environment switch on and an isActive that says yes', () => {
    const feed = provider('LICENSED_FEED', NOT_CLEARED, true);
    expect(getActiveProviders(EVERYTHING_ON, book({ allowCatalogReference: true }), [feed])).toEqual([]);
    expect(termsAllow(NOT_CLEARED, EVERYTHING_ON)).toBe(false);
  });

  it('an unknown status is treated as not cleared', () => {
    const odd = provider('MANUAL', { status: 'WHATEVER' as unknown as ProviderTerms['status'], reviewedOn: null, reference: 'x' });
    expect(getActiveProviders(EVERYTHING_ON, book(), [odd])).toEqual([]);
  });

  it('a provider with no terms at all is not returned', () => {
    const bare = { kind: 'MANUAL', isActive: () => true, fetch: async () => new Map() } as unknown as ReferenceProvider;
    expect(getActiveProviders(EVERYTHING_ON, book(), [bare])).toEqual([]);
  });
});

describe('AT-4 CLEARED and CONDITIONAL providers', () => {
  it('a CLEARED active provider is returned and an inactive one is not', () => {
    const on = provider('MANUAL', CLEARED, true);
    const off = provider('SHOP_BENCHMARK', CLEARED, false);
    expect(getActiveProviders({}, book(), [on, off])).toEqual([on]);
  });

  it('a CONDITIONAL provider needs its switch AND isActive', () => {
    const p = provider('CATALOG_REFERENCE', CONDITIONAL, true);
    expect(getActiveProviders({}, book(), [p])).toEqual([]);
    expect(getActiveProviders({ SOME_SWITCH: 'false' }, book(), [p])).toEqual([]);
    expect(getActiveProviders({ SOME_SWITCH: 'maybe' }, book(), [p])).toEqual([]);
    expect(getActiveProviders({ SOME_SWITCH: 'TRUE' }, book(), [p])).toEqual([p]);
    const inactive = provider('CATALOG_REFERENCE', CONDITIONAL, false);
    expect(getActiveProviders({ SOME_SWITCH: 'true' }, book(), [inactive])).toEqual([]);
  });

  it('a CONDITIONAL provider with no switch name is never returned', () => {
    const p = provider('CATALOG_REFERENCE', { status: 'CONDITIONAL', reviewedOn: null, reference: 'x' }, true);
    expect(getActiveProviders(EVERYTHING_ON, book(), [p])).toEqual([]);
  });

  it('an isActive that throws is treated as inactive', () => {
    const p = provider('MANUAL', CLEARED, () => {
      throw new Error('boom');
    });
    expect(getActiveProviders({}, book(), [p])).toEqual([]);
  });

  it('providers come back in the order of book.referenceOrder, and a kind outside the order is not used', () => {
    const a = provider('MANUAL', CLEARED);
    const b = provider('SHOP_SOLD_HISTORY', CLEARED);
    const c = provider('SHOP_BENCHMARK', CLEARED);
    expect(getActiveProviders({}, book(), [c, b, a])).toEqual([a, b, c]);
    expect(getActiveProviders({}, book({ referenceOrder: ['SHOP_BENCHMARK', 'MANUAL'] }), [a, b, c])).toEqual([c, a]);
    expect(getActiveProviders({}, book({ referenceOrder: [] }), [a, b, c])).toEqual([]);
  });

  it('does not return the same provider twice when the order repeats a kind', () => {
    const a = provider('MANUAL', CLEARED);
    expect(getActiveProviders({}, book({ referenceOrder: ['MANUAL', 'MANUAL'] }), [a])).toEqual([a]);
  });
});

describe('AT-4 the catalog provider rules', () => {
  const catalog = provider('CATALOG_REFERENCE', CATALOG_REFERENCE_TERMS, false);
  const live = (): ReferenceProvider => ({
    ...catalog,
    isActive: ({ env: e, book: bk }) => isCatalogReferenceActive(e, bk),
  });

  it('is CONDITIONAL on the platform switch, which defaults to on', () => {
    expect(CATALOG_REFERENCE_TERMS.status).toBe('CONDITIONAL');
    expect(CATALOG_REFERENCE_TERMS.switchName).toBe(CATALOG_REFERENCE_SWITCH);
    expect(CATALOG_REFERENCE_SWITCH).toBe('CARD_CATALOG_PRICE_REFERENCE_ENABLED');
    expect(CATALOG_REFERENCE_TERMS.switchDefaultOn).toBe(true);
  });

  it('unset means active (when the book opted in); false, 0, no, off make it inactive', () => {
    const optedIn = book({ allowCatalogReference: true });
    const p = live();
    expect(getActiveProviders({}, optedIn, [p])).toEqual([p]);
    for (const off of ['false', 'FALSE', '0', 'no', 'off', ' off ']) {
      expect(getActiveProviders({ CARD_CATALOG_PRICE_REFERENCE_ENABLED: off }, optedIn, [p])).toEqual([]);
    }
    for (const on of ['true', '1', 'yes', 'on', '', 'garbage']) {
      expect(getActiveProviders({ CARD_CATALOG_PRICE_REFERENCE_ENABLED: on }, optedIn, [p])).toEqual([p]);
    }
  });

  it('needs the book opt-in even when the platform switch is on', () => {
    const p = live();
    expect(getActiveProviders({ CARD_CATALOG_PRICE_REFERENCE_ENABLED: 'true' }, book({ allowCatalogReference: false }), [p])).toEqual([]);
    expect(isCatalogReferenceActive({}, { allowCatalogReference: false })).toBe(false);
    expect(isCatalogReferenceActive({}, { allowCatalogReference: true })).toBe(true);
    expect(isCatalogReferenceActive({ CARD_CATALOG_PRICE_REFERENCE_ENABLED: 'false' }, { allowCatalogReference: true })).toBe(false);
  });

  it('refuses any catalog row whose source is not SCRYFALL (a TCGCSV origin row is refused)', () => {
    expect(isAllowedCatalogOrigin('SCRYFALL')).toBe(true);
    expect(isAllowedCatalogOrigin(' scryfall ')).toBe(true);
    expect(isAllowedCatalogOrigin('TCGCSV')).toBe(false);
    expect(isAllowedCatalogOrigin('TCGDEX')).toBe(false);
    expect(isAllowedCatalogOrigin('')).toBe(false);
    expect(isAllowedCatalogOrigin(null)).toBe(false);
    expect(isAllowedCatalogOrigin(undefined)).toBe(false);
  });
});

describe('isSwitchOn', () => {
  it('uses the default when unset or unrecognized and the explicit word otherwise', () => {
    expect(isSwitchOn({}, 'X', false)).toBe(false);
    expect(isSwitchOn({}, 'X', true)).toBe(true);
    expect(isSwitchOn({ X: 'on' }, 'X', false)).toBe(true);
    expect(isSwitchOn({ X: 'off' }, 'X', true)).toBe(false);
    expect(isSwitchOn({ X: '  Yes ' }, 'X', false)).toBe(true);
    expect(isSwitchOn({ X: 'junk' }, 'X', true)).toBe(true);
    expect(isSwitchOn({ X: 'junk' }, 'X', false)).toBe(false);
  });
});

describe('reference kinds', () => {
  it('the five kinds of ADR-140 section 5.2', () => {
    expect([...REFERENCE_KINDS]).toEqual(['MANUAL', 'SHOP_SOLD_HISTORY', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE', 'LICENSED_FEED']);
  });
});
