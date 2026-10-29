/**
 * Poshmark Multi Item listing, 2nd and later unit sales (2026-10-29).
 *
 * A Multi Item listing stays live after a unit sells there, so after the first sale its newest MarketplaceListingJob row is the
 * sold_on_poshmark REMOVE row, not a POST/POSTED row. commitPlatformUnitSale used to read that as "no live listing" and drop the
 * 2nd sale unless its e-mail came more than NEW_EMAIL_SALE_TOLERANCE_MS after the 1st (or it had no date), so stock stayed high
 * while Poshmark showed fewer units. These run sales 1, 2 and 3 of a qty-3 item through the real Poshmark sold-report path
 * (processPlatformSoldReport -> commitFacebookNativeSale -> commitPlatformUnitSale) against an in-memory listing-row table, and pin:
 *  - every unit sale decrements stock exactly once (a replayed e-mail or the same Poshmark order again takes nothing);
 *  - Poshmark's own quantity stays in step (units showing == stock left, so no quantity push is due) and the listing is never
 *    treated as gone while stock remains; at 0 the item is SOLD and the sold-out listing is no longer live;
 *  - a caller with neither an e-mail nor an order id is unchanged (no-op on the live Multi Item listing).
 * Mocked Prisma, synthetic data, no network.
 */
type Row = {
  id: string; itemId: string; platform: string; action: string; status: string; createdAt: Date;
  lastErrorMessage: string | null; remoteListingId: string | null; syncedQuantity: number | null;
};

const ITEM = 'cmposhmulti0000000000001';
const LISTING = '6a982ae87789ea7d11785248';
const TITLE = 'Vintage Pyrex Butterprint Mixing Bowl 403 Turquoise';

const db: { rows: Row[]; stockTotal: number; stockSold: number; status: string; now: number; seq: number } = {
  rows: [], stockTotal: 3, stockSold: 0, status: 'AVAILABLE', now: 0, seq: 0,
};

function strMatch(v: string | null, f: any): boolean {
  if (f == null) return true;
  if (typeof f === 'string') return v === f;
  const s = v ?? '';
  if (v == null && (f.startsWith !== undefined || f.endsWith !== undefined || f.contains !== undefined)) return false;
  if (f.startsWith !== undefined && !s.startsWith(f.startsWith)) return false;
  if (f.endsWith !== undefined && !s.endsWith(f.endsWith)) return false;
  if (f.contains !== undefined && !s.includes(f.contains)) return false;
  return true;
}
function rowMatch(r: Row, where: any): boolean {
  if (!where) return true;
  for (const [k, f] of Object.entries(where)) {
    if (k === 'NOT') { if (rowMatch(r, f)) return false; continue; }
    if (k === 'createdAt') { if ((f as any).lt && !(r.createdAt < (f as any).lt)) return false; continue; }
    if (k === 'lastErrorMessage' || k === 'remoteListingId') { if (!strMatch((r as any)[k], f)) return false; continue; }
    if ((r as any)[k] !== f) return false;
  }
  return true;
}
const newestFirst = (a: Row, b: Row) => b.createdAt.getTime() - a.createdAt.getTime();
const jobApi = {
  findFirst: jest.fn(async ({ where }: any) => db.rows.filter((r) => rowMatch(r, where)).sort(newestFirst)[0] ?? null),
  findMany: jest.fn(async ({ where }: any) => db.rows.filter((r) => rowMatch(r, where))),
  create: jest.fn(async ({ data }: any) => {
    const row: Row = {
      id: 'r' + ++db.seq, itemId: data.itemId, platform: data.platform, action: data.action, status: data.status,
      createdAt: new Date(db.now), lastErrorMessage: data.lastErrorMessage ?? null, remoteListingId: data.remoteListingId ?? null,
      syncedQuantity: data.syncedQuantity ?? null,
    };
    db.rows.push(row);
    return row;
  }),
};
const mockTx: any = {
  $queryRaw: jest.fn(async () => [{ status: db.status, stockTotal: db.stockTotal, listingType: null }]),
  marketplaceListingJob: jobApi,
};
jest.mock('../../lib/prisma', () => ({
  prisma: {
    item: {
      findUnique: jest.fn(async () => ({ stockTotal: db.stockTotal, listingType: null, status: db.status })),
      update: jest.fn(async () => ({})),
    },
    marketplaceListingJob: jobApi,
    $transaction: jest.fn(async (cb: any) => cb(mockTx)),
  },
}));
jest.mock('../itemStockService', () => ({
  sellItemUnits: jest.fn(async (_id: string, n: number) => {
    if (db.stockSold + n > db.stockTotal) throw new Error('oversell');
    db.stockSold += n;
    const remainingStock = db.stockTotal - db.stockSold;
    if (remainingStock === 0) db.status = 'SOLD';
    return { fullySoldOut: remainingStock === 0, remainingStock };
  }),
}));
jest.mock('../soldElsewhereUnitSale', () => ({ takeSoldElsewhereUnit: jest.fn(), fireItemStockSync: jest.fn() }));
jest.mock('../marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn(async () => undefined) }));
jest.mock('../itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return { commitItemSale: jest.fn(async () => ({})), ItemAlreadyCommittedError };
});
jest.mock('../saleReopenGuard', () => ({ isReportOfCancelledReopenedSale: jest.fn(async () => false) }));
jest.mock('../bulkLot/bulkLotInvariants', () => ({ lotChannelRefusal: jest.fn(async () => null) }));
jest.mock('../bulkLot/bulkLotConfig', () => ({ isBulkLotsEnabled: () => false }));
jest.mock('../../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../shopifyService', () => ({ markShopifyItemSold: jest.fn(async () => undefined) }));
jest.mock('../marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn(async () => 'skipped') }));

import { processPlatformSoldReport } from '../platformSoldDetectionService';
import { commitFacebookNativeSale, normalizeSaleOrderId, parseSaleOrderId } from '../facebookNativeSaleService';
import { runWithSoldEmailSource } from '../soldEmailSourceGuard';
import { sellItemUnits } from '../itemStockService';
import { fireItemStockSync } from '../soldElsewhereUnitSale';
import { endEbayListingIfExists } from '../../controllers/ebayController';
import { liveListingFromRows } from '../liveListingState';
import { listingStateForAutoQueue } from '../singleUnitRepost';

const T0 = Date.UTC(2026, 9, 29, 15, 0);
const MIN = 60 * 1000;
const deps = {
  loadCandidateItems: async () => [{ id: ITEM, title: TITLE, status: db.status }],
  loadPlatformJobs: async () => [] as Array<{ itemId: string; remoteListingId: string | null }>,
  getItemStatus: async () => db.status,
};

/** One Poshmark sold e-mail, processed the way the poller does (e-mail context, then the platform sold report). */
function poshSale(atMin: number, mailId: string, orderId?: string) {
  db.now = T0 + atMin * MIN + 30 * 1000; // processed 30 s after it was sent
  return runWithSoldEmailSource({ key: `sold-email:Poshmark:<${mailId}@poshmark.com>`, sentAt: new Date(T0 + atMin * MIN) }, () =>
    processPlatformSoldReport('POSHMARK', 'POSHMARK', 'org1', { remoteListingId: '', title: TITLE, ...(orderId ? { orderId } : {}) }, deps as any));
}
const poshRows = () => db.rows.filter((r) => r.platform === 'POSHMARK');
const stockLeft = () => db.stockTotal - db.stockSold;
const unitSaleRows = () => poshRows().filter((r) => r.action === 'REMOVE' && String(r.lastErrorMessage).startsWith('sold_on_poshmark'));

beforeEach(() => {
  jest.clearAllMocks();
  db.rows = [];
  db.stockTotal = 3;
  db.stockSold = 0;
  db.status = 'AVAILABLE';
  db.seq = 0;
  // Posted on Poshmark as a Multi Item listing showing 3 (syncedQuantity is the baseline), an hour before the first sale.
  db.rows.push({
    id: 'post1', itemId: ITEM, platform: 'POSHMARK', action: 'POST', status: 'POSTED', createdAt: new Date(T0 - 60 * MIN),
    lastErrorMessage: null, remoteListingId: LISTING, syncedQuantity: 3,
  });
});

describe('Poshmark Multi Item qty 3: sales 1, 2 and 3', () => {
  it('each unit sale takes exactly one unit; the listing stays live with Poshmark\'s count in step until 0', async () => {
    // Sale 1
    const r1 = await poshSale(0, 'm1', '6a9900000000000000000001');
    expect(r1).toMatchObject({ result: 'sold', itemId: ITEM, itemStatus: 'AVAILABLE' });
    expect(stockLeft()).toBe(2);
    let live = liveListingFromRows(poshRows(), 'POSHMARK');
    expect(live).toMatchObject({ afterUnitSale: true, unitsShowing: 2, remoteListingId: LISTING });
    expect(live!.unitsShowing).toBe(stockLeft()); // Poshmark already shows 2: no quantity drift, nothing to push
    expect(listingStateForAutoQueue(poshRows(), 'POSHMARK', stockLeft())).toBe('multi_unit_listing_live'); // never reposted / pulled

    // Sale 2, three minutes later (inside the old 10-minute tolerance that used to drop it)
    const r2 = await poshSale(3, 'm2', '6a9900000000000000000002');
    expect(r2).toMatchObject({ result: 'sold', itemStatus: 'AVAILABLE' });
    expect(stockLeft()).toBe(1);
    live = liveListingFromRows(poshRows(), 'POSHMARK');
    expect(live).toMatchObject({ afterUnitSale: true, unitsShowing: 1 });
    expect(live!.unitsShowing).toBe(stockLeft());
    expect(listingStateForAutoQueue(poshRows(), 'POSHMARK', stockLeft())).toBe('multi_unit_listing_live');
    expect(db.status).toBe('AVAILABLE');
    expect(endEbayListingIfExists).not.toHaveBeenCalled(); // other markets keep their listings while stock remains

    // Sale 3: the last unit
    const r3 = await poshSale(5, 'm3', '6a9900000000000000000003');
    expect(r3).toMatchObject({ result: 'sold', itemStatus: 'SOLD' });
    expect(stockLeft()).toBe(0);
    expect(db.status).toBe('SOLD');
    expect(liveListingFromRows(poshRows(), 'POSHMARK')).toBeNull(); // Poshmark ended the sold-out listing itself
    expect(endEbayListingIfExists).toHaveBeenCalledWith(ITEM); // full sold fan-out on the last unit only

    expect(sellItemUnits).toHaveBeenCalledTimes(3);
    expect(unitSaleRows().map((r) => parseSaleOrderId(r.lastErrorMessage))).toEqual([
      '6a9900000000000000000001', '6a9900000000000000000002', '6a9900000000000000000003',
    ]);
    expect(fireItemStockSync).toHaveBeenCalledTimes(2); // the two partial sales re-push the one stock number
  });

  it('sales 2 and 3 with e-mails but no order id (body parse failed) still count once each', async () => {
    await poshSale(0, 'n1');
    await poshSale(1, 'n2');
    expect(stockLeft()).toBe(1);
    expect(liveListingFromRows(poshRows(), 'POSHMARK')).toMatchObject({ unitsShowing: 1 });
    await poshSale(2, 'n3');
    expect(stockLeft()).toBe(0);
    expect(db.status).toBe('SOLD');
    expect(sellItemUnits).toHaveBeenCalledTimes(3);
  });

  it('the same Poshmark order reported again (another copy of the e-mail) takes no second unit', async () => {
    await poshSale(0, 'a1', '6a99000000000000000000aa');
    await poshSale(4, 'a2', '6a99000000000000000000bb');
    expect(stockLeft()).toBe(1);
    const again = await poshSale(6, 'a2-copy', '6A99000000000000000000BB'); // same order, different Message-ID, upper-case
    expect(again.result).toBe('notAvailable'); // already counted; the item is still AVAILABLE with 1 left
    expect(stockLeft()).toBe(1);
    expect(unitSaleRows()).toHaveLength(2);
    expect(liveListingFromRows(poshRows(), 'POSHMARK')).toMatchObject({ unitsShowing: 1 });
  });

  it('a replay of the same e-mail (same Message-ID) takes no second unit', async () => {
    await poshSale(0, 'b1', '6a99000000000000000000c1');
    await poshSale(2, 'b2', '6a99000000000000000000c2');
    await poshSale(2, 'b2', '6a99000000000000000000c2');
    expect(stockLeft()).toBe(1);
    expect(sellItemUnits).toHaveBeenCalledTimes(2);
  });

  it('a sale with no e-mail and no order id on the live Multi Item listing is unchanged (no-op: a repeat cannot be told apart)', async () => {
    await poshSale(0, 'c1', '6a99000000000000000000d1');
    expect(stockLeft()).toBe(2);
    const r = await commitFacebookNativeSale(ITEM, 'POSHMARK', { soldOnPlatform: { platform: 'POSHMARK', remoteListingId: null } });
    expect(r).toMatchObject({ alreadyCommitted: true, noopReason: 'no_live_posted_row' });
    expect(stockLeft()).toBe(2);
  });

  it('a Multi Item listing posted with fewer units than stock: once Poshmark sells out, a later Poshmark e-mail does not take a unit', async () => {
    db.rows[0].syncedQuantity = 2; // Poshmark showed 2 of the 3 in stock
    await poshSale(0, 'd1', '6a99000000000000000000e1');
    await poshSale(1, 'd2', '6a99000000000000000000e2');
    expect(stockLeft()).toBe(1);
    expect(liveListingFromRows(poshRows(), 'POSHMARK')).toBeNull(); // sold out on Poshmark
    expect(listingStateForAutoQueue(poshRows(), 'POSHMARK', stockLeft())).toBe('repost_after_sale'); // offered again for the last unit
    const r = await poshSale(2, 'd3', '6a99000000000000000000e3'); // inside the tolerance, no live listing to have sold it
    expect(r.result).toBe('notAvailable');
    expect(stockLeft()).toBe(1);
  });

  it('a stock decrement elsewhere is pushed to Poshmark as quantity drift (units showing > stock left)', async () => {
    await poshSale(0, 'e1', '6a99000000000000000000f1');
    db.stockSold += 1; // a unit sold at the counter
    const live = liveListingFromRows(poshRows(), 'POSHMARK');
    expect(live!.unitsShowing).toBe(2);
    expect(stockLeft()).toBe(1);
    expect(live!.unitsShowing).not.toBe(stockLeft()); // getPriceSyncQueue queues a Poshmark quantity edit to 1
  });
});

describe('order id helpers', () => {
  it('normalizeSaleOrderId accepts plain ids and refuses anything else', () => {
    expect(normalizeSaleOrderId(' 6A982AE87789EA7D11785248 ')).toBe('6a982ae87789ea7d11785248');
    expect(normalizeSaleOrderId('')).toBeNull();
    expect(normalizeSaleOrderId(null)).toBeNull();
    expect(normalizeSaleOrderId('a|b')).toBeNull();
    expect(normalizeSaleOrderId('x'.repeat(65))).toBeNull();
  });
  it('parseSaleOrderId reads the tag with or without the e-mail tags after it', () => {
    expect(parseSaleOrderId('sold_on_poshmark|order:abcd1234')).toBe('abcd1234');
    expect(parseSaleOrderId('sold_on_poshmark|order:abcd1234|sent:1761750000000|src:0123456789abcdef')).toBe('abcd1234');
    expect(parseSaleOrderId('sold_on_poshmark|sent:1761750000000|src:0123456789abcdef')).toBeNull();
    expect(parseSaleOrderId(null)).toBeNull();
  });
});
