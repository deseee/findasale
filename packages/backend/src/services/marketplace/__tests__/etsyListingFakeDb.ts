/**
 * In-memory stand-in for the slice of Prisma that the Etsy B3 modules use (test helper, not a test).
 * Models: item (with a nested sale and card), marketplaceAccount, etsyShopSettings, etsyListing,
 * etsyTaxonomyNode. Implements where semantics for equality, null, Date compare, OR, AND, nested
 * relation filters (item.sale), and the operators lt, lte, gt, gte, not, in, notIn, contains
 * (case-insensitive when mode is insensitive) and startsWith. Every method is synchronous inside
 * its async wrapper, so updateMany claims are genuinely atomic, like a single SQL UPDATE.
 * $transaction accepts an array of already-started operations (the shape B3 uses).
 */

type Row = Record<string, any>;

const OPERATORS = new Set(['lt', 'lte', 'gt', 'gte', 'not', 'in', 'notIn', 'contains', 'startsWith', 'mode', 'equals']);
const num = (v: any) => (v instanceof Date ? v.getTime() : v);

export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    if (k === 'AND') return (Array.isArray(cond) ? (cond as Row[]) : [cond as Row]).every((w) => matches(row, w));
    const v = row[k] === undefined ? null : row[k];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const keys = Object.keys(cond);
      if (!keys.every((op) => OPERATORS.has(op))) {
        // nested relation filter, for example item.sale
        return v !== null && typeof v === 'object' && matches(v as Row, cond as Row);
      }
      const insensitive = (cond as Row).mode === 'insensitive';
      const norm = (x: any) => (insensitive && typeof x === 'string' ? x.toLowerCase() : x);
      return keys.every((op) => {
        const arg = (cond as Row)[op];
        switch (op) {
          case 'mode':
            return true;
          case 'equals':
            return norm(v) === norm(arg);
          case 'lt':
            return v !== null && num(v) < num(arg);
          case 'lte':
            return v !== null && num(v) <= num(arg);
          case 'gt':
            return v !== null && num(v) > num(arg);
          case 'gte':
            return v !== null && num(v) >= num(arg);
          case 'not':
            return num(v) !== num(arg);
          case 'in':
            return (arg as any[]).includes(v);
          case 'notIn':
            return !(arg as any[]).includes(v);
          case 'contains':
            return typeof v === 'string' && norm(v).includes(norm(arg));
          case 'startsWith':
            return typeof v === 'string' && norm(v).startsWith(norm(arg));
          default:
            throw new Error(`etsyListingFakeDb: unsupported operator ${op}`);
        }
      });
    }
    return num(v) === num(cond === undefined ? null : cond);
  });
}

export interface FakeDbOptions {
  /** Clock used for createdAt and updatedAt. Tests move it to age rows. */
  clock?: () => Date;
}

export function makeEtsyListingFakeDb(options: FakeDbOptions = {}) {
  const clock = options.clock ?? (() => new Date());
  let seq = 0;
  const id = (p: string) => `${p}_${++seq}`;
  const store = {
    items: [] as Row[],
    accounts: [] as Row[],
    settings: [] as Row[],
    listings: [] as Row[],
    nodes: [] as Row[],
  };
  const calls = { transactions: [] as number[], createMany: [] as number[], deleteMany: 0 };
  const copy = (r: Row | null | undefined) => (r ? { ...r } : null);
  const orderBy = (rows: Row[], ob?: Row) => {
    if (!ob) return rows;
    const [[key, dir]] = Object.entries(ob);
    return [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
  };
  const accountWhere = (where: Row): Row => (where.organizerId_platform ? { ...where.organizerId_platform } : where);

  const db: any = {
    store,
    calls,
    item: {
      findFirst: async ({ where }: Row) => {
        const r = store.items.find((x) => matches(x, where));
        return copy(r);
      },
      findUnique: async ({ where }: Row) => copy(store.items.find((x) => matches(x, where))),
    },
    marketplaceAccount: {
      findUnique: async ({ where }: Row) => copy(store.accounts.find((x) => matches(x, accountWhere(where)))),
      update: async ({ where, data }: Row) => {
        const r = store.accounts.find((x) => matches(x, accountWhere(where)));
        if (!r) throw new Error('fake db: account not found');
        Object.assign(r, data);
        return { ...r };
      },
      updateMany: async ({ where, data }: Row) => {
        let count = 0;
        for (const r of store.accounts) {
          if (matches(r, accountWhere(where))) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      },
    },
    etsyShopSettings: {
      findUnique: async ({ where }: Row) => copy(store.settings.find((x) => matches(x, where))),
      update: async ({ where, data }: Row) => {
        const r = store.settings.find((x) => matches(x, where));
        if (!r) throw new Error('fake db: settings not found');
        Object.assign(r, data);
        return { ...r };
      },
    },
    etsyListing: {
      findUnique: async ({ where }: Row) => copy(store.listings.find((x) => matches(x, where))),
      findFirst: async ({ where }: Row) => copy(store.listings.find((x) => matches(x, where))),
      create: async ({ data }: Row) => {
        if (store.listings.some((x) => x.itemId === data.itemId)) {
          const err: any = new Error('Unique constraint failed on the fields: (`itemId`)');
          err.code = 'P2002';
          throw err;
        }
        const now = clock();
        const row = {
          id: id('listing'),
          etsyListingId: null,
          state: 'PREPARING',
          failedStep: null,
          lastErrorMessage: null,
          lastErrorAt: null,
          whoMade: 'someone_else',
          isSupply: false,
          taxonomyId: null,
          shippingProfileId: null,
          returnPolicyId: null,
          readinessStateId: null,
          imagesUploaded: 0,
          syncedQuantity: null,
          syncedPrice: null,
          attestedAt: null,
          attestedByUserId: null,
          publishedAt: null,
          expiresAt: null,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        store.listings.push(row);
        return { ...row };
      },
      updateMany: async ({ where, data }: Row) => {
        let count = 0;
        for (const r of store.listings) {
          if (matches(r, where)) {
            Object.assign(r, data, { updatedAt: clock() });
            count++;
          }
        }
        return { count };
      },
      update: async ({ where, data }: Row) => {
        const r = store.listings.find((x) => matches(x, where));
        if (!r) throw new Error('fake db: listing not found');
        Object.assign(r, data, { updatedAt: clock() });
        return { ...r };
      },
      count: async ({ where }: Row = {}) => store.listings.filter((x) => matches(x, where ?? {})).length,
    },
    etsyTaxonomyNode: {
      count: async ({ where }: Row = {}) => store.nodes.filter((x) => matches(x, where ?? {})).length,
      findUnique: async ({ where }: Row) => copy(store.nodes.find((x) => matches(x, where))),
      findMany: async ({ where, take, orderBy: ob }: Row = {}) => {
        const rows = orderBy(store.nodes.filter((x) => matches(x, where ?? {})), ob).map((r) => ({ ...r }));
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
      deleteMany: async () => {
        calls.deleteMany++;
        const n = store.nodes.length;
        store.nodes = [];
        return { count: n };
      },
      createMany: async ({ data }: Row) => {
        calls.createMany.push(data.length);
        for (const d of data) store.nodes.push({ ...d });
        return { count: data.length };
      },
    },
    $transaction: async (ops: any) => {
      if (!Array.isArray(ops)) throw new Error('fake db: only array transactions are supported');
      calls.transactions.push(ops.length);
      return Promise.all(ops);
    },
  };
  return db;
}

/** A listing row as the draft claim would leave it, for seeding tests. */
export function seedListing(db: any, over: Row = {}): Row {
  const row = {
    id: `seed_${db.store.listings.length + 1}`,
    itemId: 'item_1',
    organizerId: 'org_1',
    shopId: '555',
    etsyListingId: null,
    state: 'DRAFT_PENDING',
    failedStep: null,
    lastErrorMessage: null,
    lastErrorAt: null,
    whenMade: '1970s',
    whoMade: 'someone_else',
    isSupply: false,
    taxonomyId: 1234,
    shippingProfileId: '11',
    returnPolicyId: '22',
    readinessStateId: '33',
    imagesUploaded: 0,
    syncedQuantity: null,
    syncedPrice: null,
    attestedAt: new Date('2026-10-03T11:00:00.000Z'),
    attestedByUserId: 'user_1',
    publishedAt: null,
    expiresAt: null,
    endedAt: null,
    createdAt: new Date('2026-10-03T11:00:00.000Z'),
    updatedAt: new Date('2026-10-03T11:00:00.000Z'),
    ...over,
  };
  db.store.listings.push(row);
  return row;
}

/** A plain single-unit item owned by org_1. */
export function seedItem(db: any, over: Row = {}): Row {
  const row = {
    id: 'item_1',
    title: 'Vintage Brass Candlestick',
    description: 'Solid brass candlestick with a small dent on the base.',
    price: 25,
    status: 'AVAILABLE',
    organizerId: 'org_1',
    saleId: null,
    sale: null,
    deletedAt: null,
    category: 'Home & Garden',
    condition: 'USED',
    conditionGrade: 'B',
    photoUrls: [
      'https://res.cloudinary.com/demo/image/upload/v1/a1.jpg',
      'https://res.cloudinary.com/demo/image/upload/v1/a2.jpg',
      'https://res.cloudinary.com/demo/image/upload/v1/a3.jpg',
    ],
    tags: ['brass', 'candlestick'],
    material: 'Brass',
    stockTotal: 1,
    stockSold: 0,
    packageWeightOz: null,
    packageLengthIn: null,
    packageWidthIn: null,
    packageHeightIn: null,
    card: null,
    ...over,
  };
  db.store.items.push(row);
  return row;
}

/** An ACTIVE Etsy account plus its shop settings for an organizer. */
export function seedEtsyConnection(db: any, over: { organizerId?: string; account?: Row; settings?: Row } = {}) {
  const organizerId = over.organizerId ?? 'org_1';
  const account = {
    id: `acct_${db.store.accounts.length + 1}`,
    organizerId,
    platform: 'ETSY',
    status: 'ACTIVE',
    accessToken: 'enc:v1:' + Buffer.from('1001.ACCESSTOKEN00000000000', 'utf8').toString('hex'),
    refreshToken: 'enc:v1:' + Buffer.from('1001.REFRESHTOKEN0000000000', 'utf8').toString('hex'),
    tokenExpiresAt: new Date('2026-10-03T13:00:00.000Z'),
    grantedScopes: 'listings_r listings_w listings_d transactions_r shops_r',
    externalShopId: '555',
    refreshLeaseUntil: null,
    ...(over.account ?? {}),
  };
  db.store.accounts.push(account);
  const settings = {
    id: `settings_${db.store.settings.length + 1}`,
    organizerId,
    marketplaceAccountId: account.id,
    shopId: '555',
    shopName: 'Vintage Corner',
    shopCurrency: 'USD',
    defaultShippingProfileId: '11',
    defaultReturnPolicyId: '22',
    defaultReadinessStateId: '33',
    ...(over.settings ?? {}),
  };
  db.store.settings.push(settings);
  return { account, settings };
}

/** A small taxonomy: Home > Decor > Candles and Holders (leaf), Home > Decor (non-leaf). */
export function seedTaxonomy(db: any) {
  const fetchedAt = new Date('2026-10-01T00:00:00.000Z');
  const nodes = [
    { id: 1, parentId: null, name: 'Home & Living', level: 1, isLeaf: false, fullPath: 'Home & Living' },
    { id: 10, parentId: 1, name: 'Home Decor', level: 2, isLeaf: false, fullPath: 'Home & Living > Home Decor' },
    { id: 1234, parentId: 10, name: 'Candle Holders', level: 3, isLeaf: true, fullPath: 'Home & Living > Home Decor > Candle Holders' },
    { id: 1235, parentId: 10, name: 'Wall Art', level: 3, isLeaf: true, fullPath: 'Home & Living > Home Decor > Wall Art' },
    { id: 2, parentId: null, name: 'Jewelry', level: 1, isLeaf: false, fullPath: 'Jewelry' },
    { id: 20, parentId: 2, name: 'Brass Necklaces', level: 2, isLeaf: true, fullPath: 'Jewelry > Brass Necklaces' },
  ];
  for (const n of nodes) db.store.nodes.push({ ...n, fetchedAt });
  return nodes;
}
