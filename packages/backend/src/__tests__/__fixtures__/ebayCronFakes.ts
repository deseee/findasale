/**
 * In-memory stand-in for the Prisma calls the eBay sold sync (jobs/ebaySoldSyncCron.ts) and the real
 * itemStockService.sellItemUnits make, for the bulk lot bundle tests (ADR-136 Addendum C). Nothing here touches a real
 * database or the network. $executeRaw models the guarded UPDATE of sellItemUnits.
 */
export interface FakeLot {
  id: string;
  title: string;
  saleId: string | null;
  status: string;
  stockTotal: number | null;
  stockSold: number;
  ebayListingId: string | null;
  ebayOfferId: string | null;
  ebayQuantityAvailable: number | null;
  ebayQuantitySold: number;
  lastSoldVia?: string | null;
  bundleSize: number | null; // null = no bundle row (an ordinary item)
}

export interface FakeLedgerRow {
  id: string;
  itemId: string;
  ebayListingId: string;
  ebayOrderId: string;
  ebayLineItemId: string;
  quantitySold: number;
  bulkQuantity?: number | null;
  bulkShortfall?: number | null;
  bulkReleasedAt?: Date | null;
  createdAt: Date;
}

export const store = {
  items: [] as FakeLot[],
  ledger: [] as FakeLedgerRow[],
  lastItemFindMany: null as null | { where: any; select: any },
  reset() {
    this.items = [];
    this.ledger = [];
    this.lastItemFindMany = null;
  },
  item(id: string): FakeLot {
    const it = this.items.find((i) => i.id === id);
    if (!it) throw new Error(`no fake item ${id}`);
    return it;
  },
};

let ledgerSeq = 0;

export const prisma: any = {
  ebayConnection: {
    findUnique: async () => ({ organizerId: 'org1' }),
    update: async () => ({}),
  },
  organizer: { findUnique: async () => ({ userId: 'user1' }) },
  item: {
    findMany: async (args: any) => {
      store.lastItemFindMany = { where: args.where, select: args.select };
      const wantBundle = Boolean(args.select?.ebayBundle);
      const includeBundleRows = JSON.stringify(args.where).includes('ebayBundle');
      return store.items
        .filter((i) => i.status === 'AVAILABLE' || (i.ebayQuantityAvailable ?? 0) > 1 || (includeBundleRows && i.bundleSize !== null))
        .map((i) => ({
          id: i.id,
          ebayListingId: i.ebayListingId,
          ebayOfferId: i.ebayOfferId,
          title: i.title,
          saleId: i.saleId,
          ebayQuantityAvailable: i.ebayQuantityAvailable,
          ebayQuantitySold: i.ebayQuantitySold,
          ...(wantBundle ? { ebayBundle: i.bundleSize === null ? null : { bundleSize: i.bundleSize } } : {}),
        }));
    },
    findUnique: async ({ where }: any) => {
      const it = store.items.find((i) => i.id === where.id);
      return it ? { stockTotal: it.stockTotal, stockSold: it.stockSold, status: it.status } : null;
    },
    findUniqueOrThrow: async ({ where }: any) => {
      const it = store.item(where.id);
      return { stockTotal: it.stockTotal, stockSold: it.stockSold, status: it.status };
    },
    update: async ({ where, data }: any) => {
      const it = store.item(where.id);
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && 'increment' in (v as any)) (it as any)[k] += (v as any).increment;
        else (it as any)[k] = v;
      }
      return { ebayQuantitySold: it.ebayQuantitySold, ebayQuantityAvailable: it.ebayQuantityAvailable, status: it.status };
    },
    updateMany: async ({ where, data }: any) => {
      const it = store.items.find((i) => i.id === where.id);
      if (!it) return { count: 0 };
      if (where.status && it.status !== where.status) return { count: 0 };
      if (where.stockSold?.gte !== undefined && !(it.stockSold >= where.stockSold.gte)) return { count: 0 };
      if (where.stockSold?.gt !== undefined && !(it.stockSold > where.stockSold.gt)) return { count: 0 };
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && 'decrement' in (v as any)) (it as any)[k] -= (v as any).decrement;
        else (it as any)[k] = v;
      }
      return { count: 1 };
    },
  },
  $executeRaw: async (_strings: TemplateStringsArray, units: number, itemId: string) => {
    const it = store.items.find((i) => i.id === itemId);
    if (!it) return 0;
    if (it.stockSold + units <= (it.stockTotal ?? 1)) {
      it.stockSold += units; // the guarded UPDATE: capacity re-checked in the same statement as the write
      return 1;
    }
    return 0;
  },
  ebaySoldEvent: {
    create: async ({ data }: any) => {
      if (store.ledger.some((r) => r.ebayOrderId === data.ebayOrderId && r.ebayLineItemId === data.ebayLineItemId)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row: FakeLedgerRow = { id: `ev${++ledgerSeq}`, createdAt: new Date(), bulkQuantity: null, bulkShortfall: null, bulkReleasedAt: null, ...data };
      store.ledger.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const k = where.ebayOrderId_ebayLineItemId;
      const row = store.ledger.find((r) => r.ebayOrderId === k.ebayOrderId && r.ebayLineItemId === k.ebayLineItemId);
      if (!row) throw new Error('no ledger row');
      Object.assign(row, data);
      return row;
    },
    findMany: async (args: any) => {
      if (!args?.where?.bulkQuantity) return []; // the reverse reconcile queries
      return store.ledger
        .filter((r) => r.bulkQuantity != null && !r.bulkReleasedAt)
        .map((r) => ({ ...r, item: { title: store.items.find((i) => i.id === r.itemId)?.title ?? null } }));
    },
    updateMany: async ({ where, data }: any) => {
      const row = store.ledger.find((r) => r.id === where.id && (where.bulkReleasedAt === null ? !r.bulkReleasedAt : true));
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  },
  notification: { create: async () => ({}) },
};
