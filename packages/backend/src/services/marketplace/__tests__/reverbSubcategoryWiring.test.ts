/**
 * reverbConnector.ts -- sub-category wiring (S-REVERB-SUBCATEGORY, 2026-10-05). fetch is mocked; nothing
 * hits Reverb. The mocked /categories/flat shape ({ categories: [{ uuid, name, full_name, slug, root_slug }] })
 * is an ASSUMPTION about Reverb's response: it was never fetched live (no Reverb call was made). The
 * connector only trusts an entry carrying the leaf's own slug plus a matching root, so a different real
 * shape simply yields no sub-category and the request is exactly the pre-change request.
 *
 * What this pins: (1) behavior-compat -- whenever the sub-category cannot be resolved or matched, the body
 * POSTed to /listings equals the old payload exactly; (2) when it can, only the two category fields change.
 */

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    marketplaceAccount: { findFirst: jest.fn(), update: jest.fn(async () => ({})) },
  },
}));
jest.mock('../../../utils/tokenCrypto', () => ({ encryptToken: (t: string) => t, decryptToken: (t: string) => t }));

import { prisma } from '../../../lib/prisma';
import { createReverbListing, pickReverbSubcategoryUuid } from '../reverbConnector';

const p = prisma as any;
const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

// Top-level UUIDs from reverbConnector.ts's own fallback table (already public in the repo).
const TOP = {
  Amps: '09055aa7-ed49-459d-9452-aa959f288dc2',
  'Electric Guitars': 'dfd39027-d134-4353-b9e4-57dc6be791b9',
  'Effects and Pedals': 'fa10f97c-dd98-4a8f-933b-8cb55eb653dd',
  'Pro Audio': 'b021203f-1ed8-476c-a8fc-32d4e3b0ef9e',
} as Record<string, string>;
const GOOD_CONDITION = 'f7a3f48c-972a-44c6-b01a-0cd27488d3f6';
const SUB_COMBO = '11111111-1111-4111-8111-111111111111';
const SUB_SOLID = '22222222-2222-4222-8222-222222222222';
const SUB_DELAY_FX = '33333333-3333-4333-8333-333333333333';
const SUB_DELAY_PRO = '44444444-4444-4444-8444-444444444444';

function topEntry(name: string, slug: string) {
  return { uuid: TOP[name], name, full_name: name, slug, root_slug: slug };
}
function subEntry(uuid: string, name: string, fullName: string, slug: string, rootSlug: string | undefined) {
  const e: any = { uuid, name, full_name: fullName, slug };
  if (rootSlug !== undefined) e.root_slug = rootSlug;
  return e;
}

/** Mock flat list: the four top-level categories used here plus a few sub-categories. */
function flatList(extra: any[] = []) {
  return [
    topEntry('Amps', 'amps'),
    topEntry('Electric Guitars', 'electric-guitars'),
    topEntry('Effects and Pedals', 'effects-and-pedals'),
    topEntry('Pro Audio', 'pro-audio'),
    subEntry(SUB_COMBO, 'Combos', 'Amps / Guitar Amps / Combos', 'guitar-combos', 'amps'),
    subEntry(SUB_SOLID, 'Solid Body', 'Electric Guitars / Solid Body', 'solid-body', 'electric-guitars'),
    ...extra,
  ];
}

function resp(status: number, body: any) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body };
}

let flatResponse: any;
let posts: any[];

function installFetch() {
  posts = [];
  fetchMock.mockImplementation(async (url: string, init?: any) => {
    if (/\/listing_conditions$/.test(url)) return resp(500, {}); // -> fallback "Good" uuid
    if (/\/categories\/flat$/.test(url)) return flatResponse;
    if (/\/listings$/.test(url) && init && init.method === 'POST') {
      posts.push(JSON.parse(init.body));
      return resp(201, { listing: { id: 'rv_1' } });
    }
    return resp(404, {});
  });
}

function makeItem(over: Record<string, unknown> = {}): any {
  return {
    id: 'item_1',
    organizerId: 'org_1',
    title: 'Acme LA15R Guitar Combo Amplifier',
    description: 'Works great.',
    brand: 'Acme',
    mpn: 'LA15R',
    condition: 'USED',
    price: 49.5,
    currency: 'USD',
    photoUrls: ['https://img.example.com/1.jpg'],
    sku: 'SKU-1',
    tags: [],
    category: 'Musical Instruments & Gear',
    ebayCategoryId: '38072',
    ebayCategoryName: 'Guitar Amplifiers',
    ...over,
  };
}

/** The body this connector sent BEFORE the sub-category change, written out literally. */
function oldBody(item: any, categoryUuid: string) {
  return {
    title: item.title,
    description: item.description,
    make: item.brand,
    model: item.mpn,
    condition: { uuid: GOOD_CONDITION },
    price: { amount: '49.50', currency: 'USD' },
    photos: ['https://img.example.com/1.jpg'],
    sku: 'SKU-1',
    has_inventory: false,
    publish: 'false',
    categories: [{ uuid: categoryUuid }],
    category_uuids: [categoryUuid],
  };
}

const ORIGINAL_ENV = process.env.REVERB_SUBCATEGORY_DISABLED;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.REVERB_SUBCATEGORY_DISABLED;
  (p.marketplaceAccount.findFirst as jest.Mock).mockResolvedValue({ id: 'acct_1', accessToken: 'tok' });
  flatResponse = resp(200, { categories: flatList() });
  installFetch();
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.REVERB_SUBCATEGORY_DISABLED;
  else process.env.REVERB_SUBCATEGORY_DISABLED = ORIGINAL_ENV;
});

describe('createReverbListing: resolved sub-category', () => {
  it('sends the sub-category UUID in both category fields and changes nothing else', async () => {
    const item = makeItem();
    await createReverbListing('org_1', item);
    expect(posts.length).toBe(1);
    expect(posts[0]).toEqual(oldBody(item, SUB_COMBO));
    expect(posts[0].categories).toEqual([{ uuid: SUB_COMBO }]);
    expect(posts[0].category_uuids).toEqual([SUB_COMBO]);
  });

  it('resolves an electric guitar body type the same way', async () => {
    const item = makeItem({ title: 'Acme Stratocaster Electric Guitar', ebayCategoryId: '33034', ebayCategoryName: null });
    await createReverbListing('org_1', item);
    expect(posts[0].categories).toEqual([{ uuid: SUB_SOLID }]);
  });

  it('matches on slug + root_slug, so the same leaf slug under another top-level category is not picked', async () => {
    flatResponse = resp(200, {
      categories: flatList([
        subEntry(SUB_DELAY_PRO, 'Delay', 'Pro Audio / Outboard Gear / Delay', 'delay', 'pro-audio'),
        subEntry(SUB_DELAY_FX, 'Delay', 'Effects and Pedals / Delay', 'delay', 'effects-and-pedals'),
      ]),
    });
    await createReverbListing('org_1', makeItem({ title: 'Acme delay pedal', ebayCategoryId: null, ebayCategoryName: null }));
    expect(posts[0].categories).toEqual([{ uuid: SUB_DELAY_FX }]);
  });

  it('accepts an entry with no root_slug when the first segment of its full_name is the chosen top-level category', async () => {
    flatResponse = resp(200, {
      categories: [topEntry('Amps', 'amps'), subEntry(SUB_COMBO, 'Combos', 'Amps / Guitar Amps / Combos', 'guitar-combos', undefined)],
    });
    await createReverbListing('org_1', makeItem());
    expect(posts[0].categories).toEqual([{ uuid: SUB_COMBO }]);
  });

  it('reads the embedded _embedded.categories shape the connector already supported', async () => {
    flatResponse = resp(200, { _embedded: { categories: flatList() } });
    await createReverbListing('org_1', makeItem());
    expect(posts[0].categories).toEqual([{ uuid: SUB_COMBO }]);
  });
});

describe('createReverbListing: behavior-compat (request identical to the old payload)', () => {
  it('the live list has no slug fields: top-level UUID, exactly the old body', async () => {
    const item = makeItem();
    flatResponse = resp(200, {
      categories: [
        { uuid: TOP.Amps, name: 'Amps', full_name: 'Amps' },
        { uuid: SUB_COMBO, name: 'Combos', full_name: 'Amps / Guitar Amps / Combos' },
      ],
    });
    await createReverbListing('org_1', item);
    expect(posts[0]).toEqual(oldBody(item, TOP.Amps));
  });

  it('the leaf is absent from the live list: old body', async () => {
    const item = makeItem();
    flatResponse = resp(200, { categories: [topEntry('Amps', 'amps')] });
    await createReverbListing('org_1', item);
    expect(posts[0]).toEqual(oldBody(item, TOP.Amps));
  });

  it('the leaf slug exists only under a different root: old body', async () => {
    const item = makeItem();
    flatResponse = resp(200, {
      categories: [topEntry('Amps', 'amps'), subEntry(SUB_COMBO, 'Combos', 'Pro Audio / Combos', 'guitar-combos', 'pro-audio')],
    });
    await createReverbListing('org_1', item);
    expect(posts[0]).toEqual(oldBody(item, TOP.Amps));
  });

  it('no root_slug and a full_name from another top-level category: old body', async () => {
    const item = makeItem();
    flatResponse = resp(200, {
      categories: [topEntry('Amps', 'amps'), subEntry(SUB_COMBO, 'Combos', 'Pro Audio / Combos', 'guitar-combos', undefined)],
    });
    await createReverbListing('org_1', item);
    expect(posts[0]).toEqual(oldBody(item, TOP.Amps));
  });

  it('two live entries match the same leaf (ambiguous): old body', async () => {
    const item = makeItem();
    flatResponse = resp(200, {
      categories: flatList([subEntry('55555555-5555-4555-8555-555555555555', 'Combos', 'Amps / Combos', 'guitar-combos', 'amps')]),
    });
    await createReverbListing('org_1', item);
    expect(posts[0]).toEqual(oldBody(item, TOP.Amps));
  });

  it('the resolver is not confident (two facets named): old body even though both leaves exist live', async () => {
    const item = makeItem({ title: 'Acme left-handed Stratocaster Electric Guitar', ebayCategoryId: null, ebayCategoryName: null });
    flatResponse = resp(200, {
      categories: flatList([subEntry('66666666-6666-4666-8666-666666666666', 'Left-handed', 'Electric Guitars / Left-handed', 'left-handed', 'electric-guitars')]),
    });
    await createReverbListing('org_1', item);
    expect(posts[0]).toEqual(oldBody(item, TOP['Electric Guitars']));
  });

  it('an accessory the keyword rules filed under a guitar bucket stays at the top-level UUID', async () => {
    const item = makeItem({ title: 'Acme Stratocaster Guitar Strap', ebayCategoryId: '46677', ebayCategoryName: 'Straps' });
    await createReverbListing('org_1', item);
    expect(posts[0]).toEqual(oldBody(item, TOP['Electric Guitars']));
  });

  it('the kill switch REVERB_SUBCATEGORY_DISABLED=true restores the old body for an item that would resolve', async () => {
    const item = makeItem();
    process.env.REVERB_SUBCATEGORY_DISABLED = 'true';
    await createReverbListing('org_1', item);
    expect(posts[0]).toEqual(oldBody(item, TOP.Amps));
  });

  it('when the live categories call fails, the fallback table UUID is sent exactly as before', async () => {
    const item = makeItem();
    flatResponse = resp(500, {});
    await createReverbListing('org_1', item);
    expect(posts[0]).toEqual(oldBody(item, TOP.Amps));
  });

  it('when the live categories call throws, the fallback table UUID is sent exactly as before', async () => {
    const item = makeItem();
    const warn = console.warn;
    console.warn = () => {};
    try {
      fetchMock.mockImplementation(async (url: string, init?: any) => {
        if (/\/categories\/flat$/.test(url)) throw new Error('network down');
        if (/\/listing_conditions$/.test(url)) return resp(500, {});
        if (/\/listings$/.test(url) && init && init.method === 'POST') {
          posts.push(JSON.parse(init.body));
          return resp(201, { listing: { id: 'rv_1' } });
        }
        return resp(404, {});
      });
      await createReverbListing('org_1', item);
    } finally {
      console.warn = warn;
    }
    expect(posts[0]).toEqual(oldBody(item, TOP.Amps));
  });

  it('an explicit reverbCategoryUuid override skips resolution entirely (no categories call)', async () => {
    const item = makeItem();
    await createReverbListing('org_1', item, { reverbCategoryUuid: 'override-uuid' });
    expect(posts[0]).toEqual(oldBody(item, 'override-uuid'));
    expect(fetchMock.mock.calls.some((c: any[]) => /categories\/flat/.test(c[0]))).toBe(false);
  });

  it('with sub-category and old paths side by side, the two bodies differ only in the two category fields', async () => {
    const item = makeItem();
    await createReverbListing('org_1', item);
    process.env.REVERB_SUBCATEGORY_DISABLED = 'true';
    await createReverbListing('org_1', item);
    const withSub = { ...posts[0] };
    const without = { ...posts[1] };
    delete withSub.categories; delete withSub.category_uuids;
    delete without.categories; delete without.category_uuids;
    expect(withSub).toEqual(without);
    expect(posts[0].categories).toEqual([{ uuid: SUB_COMBO }]);
    expect(posts[1].categories).toEqual([{ uuid: TOP.Amps }]);
  });
});

describe('pickReverbSubcategoryUuid', () => {
  it('returns null and never throws on a malformed list', () => {
    const item = makeItem();
    expect(pickReverbSubcategoryUuid(null as any, 'Amps', item)).toBeNull();
    expect(pickReverbSubcategoryUuid(undefined as any, 'Amps', item)).toBeNull();
    expect(pickReverbSubcategoryUuid([null, undefined, 5, 'x', {}, { uuid: 1, slug: 2 }] as any, 'Amps', item)).toBeNull();
    expect(pickReverbSubcategoryUuid(flatList(), 'Amps', null as any)).toBeNull();
  });

  it('is case-insensitive on slug and root_slug and ignores an entry without a uuid', () => {
    const item = makeItem();
    const list = [
      { slug: 'Guitar-Combos', root_slug: 'AMPS' }, // no uuid
      { uuid: SUB_COMBO, slug: 'Guitar-Combos', root_slug: 'AMPS' },
    ];
    expect(pickReverbSubcategoryUuid(list, 'Amps', item)).toBe(SUB_COMBO);
  });

  it('is null for a top-level name the tree does not know', () => {
    expect(pickReverbSubcategoryUuid(flatList(), 'Guitars', makeItem())).toBeNull();
  });
});
