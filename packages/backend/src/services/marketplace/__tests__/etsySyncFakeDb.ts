/**
 * In-memory stand-in for the slice of Prisma that the Etsy E-B4 sync modules use (test helper, not a
 * test). Models: item, etsyListing, etsyShopSettings, marketplaceAccount, etsySoldEvent,
 * processedWebhookEvent, organizer. Reuses the where-matcher of etsyListingFakeDb. Every method is
 * synchronous inside its async wrapper, so updateMany claims are genuinely atomic, like one SQL UPDATE.
 * Records every write that carries data so tests can assert the exact fields sent to Prisma.
 */

import { matches } from './etsyListingFakeDb';

type Row = Record<string, any>;

export interface SyncFakeOptions {
  clock?: () => Date;
}

export function makeEtsySyncFakeDb(options: SyncFakeOptions = {}) {
  const clock = options.clock ?? (() => new Date());
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;
  const store = {
    items: [] as Row[],
    listings: [] as Row[],
    settings: [] as Row[],
    accounts: [] as Row[],
    soldEvents: [] as Row[],
    webhookEvents: [] as Row[],
    organizers: [] as Row[],
  };
  const writes = {
    soldEventCreates: [] as Row[],
    listingUpdates: [] as Array<{ where: Row; data: Row }>,
    itemUpdates: [] as Array<{ where: Row; data: Row }>,
    settingsUpdates: [] as Array<{ where: Row; data: Row }>,
  };
  const copy = (r: Row | null | undefined) => (r ? { ...r } : null);
  const p2002 = (msg: string) => {
    const err: any = new Error(msg);
    err.code = 'P2002';
    return err;
  };
  const sorted = (rows: Row[], ob?: Row) => {
    if (!ob) return rows;
    const [[key, dir]] = Object.entries(ob);
    return [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
  };
  const many = (rows: Row[], { where, orderBy, take }: Row = {}) => {
    const hit = sorted(rows.filter((r) => matches(r, where ?? {})), orderBy).map((r) => ({ ...r }));
    return typeof take === 'number' ? hit.slice(0, take) : hit;
  };
  const updateManyOn = (rows: Row[], where: Row, data: Row, bump: boolean) => {
    let count = 0;
    for (const r of rows) {
      if (matches(r, where)) {
        Object.assign(r, data);
        if (bump && !('updatedAt' in data)) r.updatedAt = clock();
        count++;
      }
    }
    return { count };
  };

  const db: any = {
    store,
    writes,
    item: {
      findFirst: async ({ where }: Row) => copy(store.items.find((r) => matches(r, where))),
      findUnique: async ({ where }: Row) => copy(store.items.find((r) => matches(r, where))),
      findMany: async (args: Row) => many(store.items, args),
      updateMany: async ({ where, data }: Row) => {
        writes.itemUpdates.push({ where, data });
        return updateManyOn(store.items, where, data, false);
      },
    },
    etsyListing: {
      findFirst: async ({ where }: Row) => copy(store.listings.find((r) => matches(r, where))),
      findUnique: async ({ where }: Row) => copy(store.listings.find((r) => matches(r, where))),
      findMany: async (args: Row) => many(store.listings, args),
      updateMany: async ({ where, data }: Row) => {
        writes.listingUpdates.push({ where, data });
        return updateManyOn(store.listings, where, data, true);
      },
      groupBy: async ({ by, where }: Row) => {
        const seen = new Set<string>();
        const out: Row[] = [];
        for (const r of store.listings.filter((x) => matches(x, where ?? {}))) {
          const key = by.map((k: string) => String(r[k])).join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(Object.fromEntries(by.map((k: string) => [k, r[k]])));
        }
        return out;
      },
    },
    etsyShopSettings: {
      findFirst: async ({ where }: Row) => copy(store.settings.find((r) => matches(r, where))),
      findUnique: async ({ where }: Row) => copy(store.settings.find((r) => matches(r, where))),
      update: async ({ where, data }: Row) => {
        writes.settingsUpdates.push({ where, data });
        const r = store.settings.find((x) => matches(x, where));
        if (!r) throw new Error('fake db: settings not found');
        Object.assign(r, data);
        return { ...r };
      },
      updateMany: async ({ where, data }: Row) => {
        writes.settingsUpdates.push({ where, data });
        return updateManyOn(store.settings, where, data, false);
      },
    },
    marketplaceAccount: {
      findFirst: async ({ where }: Row) => copy(store.accounts.find((r) => matches(r, where))),
      findMany: async (args: Row) => many(store.accounts, args),
    },
    etsySoldEvent: {
      create: async ({ data }: Row) => {
        if (store.soldEvents.some((r) => r.transactionId === data.transactionId)) throw p2002('Unique constraint failed on transactionId');
        writes.soldEventCreates.push({ ...data });
        const row = { id: nextId('sold'), createdAt: clock(), ...data };
        store.soldEvents.push(row);
        return { ...row };
      },
      deleteMany: async ({ where }: Row) => {
        const before = store.soldEvents.length;
        store.soldEvents = store.soldEvents.filter((r) => !matches(r, where ?? {}));
        return { count: before - store.soldEvents.length };
      },
      findMany: async (args: Row) => many(store.soldEvents, args),
    },
    processedWebhookEvent: {
      create: async ({ data }: Row) => {
        if (store.webhookEvents.some((r) => r.eventId === data.eventId)) throw p2002('Unique constraint failed on eventId');
        const now = clock();
        const row = { status: 'PENDING', processedAt: now, updatedAt: now, ...data };
        store.webhookEvents.push(row);
        return { ...row };
      },
      findUnique: async ({ where }: Row) => copy(store.webhookEvents.find((r) => matches(r, where))),
      updateMany: async ({ where, data }: Row) => updateManyOn(store.webhookEvents, where, data, true),
    },
    organizer: {
      findUnique: async ({ where }: Row) => copy(store.organizers.find((r) => matches(r, where))),
    },
  };
  return db;
}

export function seedSyncItem(db: any, over: Row = {}): Row {
  const row = {
    id: 'item_1',
    title: 'Vintage Brass Candlestick',
    organizerId: 'org_1',
    saleId: 'sale_1',
    sale: { organizerId: 'org_1' },
    status: 'AVAILABLE',
    deletedAt: null,
    lastSoldVia: null,
    stockTotal: 1,
    stockSold: 0,
    price: 25,
    ...over,
  };
  db.store.items.push(row);
  return row;
}

export function seedSyncListing(db: any, over: Row = {}): Row {
  const row = {
    id: `listing_${db.store.listings.length + 1}`,
    itemId: 'item_1',
    organizerId: 'org_1',
    shopId: '555',
    etsyListingId: '9001',
    state: 'ACTIVE',
    syncedQuantity: 1,
    syncedPrice: 25,
    endedAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...over,
  };
  db.store.listings.push(row);
  return row;
}

export function seedSyncConnection(db: any, over: { organizerId?: string; shopId?: string; settings?: Row; account?: Row } = {}) {
  const organizerId = over.organizerId ?? 'org_1';
  const account = {
    id: `acct_${db.store.accounts.length + 1}`,
    organizerId,
    platform: 'ETSY',
    status: 'ACTIVE',
    ...(over.account ?? {}),
  };
  db.store.accounts.push(account);
  const settings = {
    id: `settings_${db.store.settings.length + 1}`,
    organizerId,
    marketplaceAccountId: account.id,
    shopId: over.shopId ?? '555',
    receiptCursor: null,
    lastReceiptPollAt: null,
    lastWebhookAt: null,
    ...(over.settings ?? {}),
  };
  db.store.settings.push(settings);
  return { account, settings };
}
