/**
 * Synthetic fixtures for the card catalog tests (ADR-134 batch B3). Nothing here touches the
 * network or a database. Shapes follow the live Scryfall bulk-data listing and default_cards
 * objects, and the TCGCSV groups / products / prices payloads, as checked on 2026-10-03.
 */
import * as zlib from 'zlib';
import { Readable } from 'stream';
import type {
  CatalogGame,
  CatalogSourceId,
  CatalogStore,
  FinishUpdate,
  PriceRow,
  PrintingRow,
  RunRecord,
  SourceState,
} from '../../services/cardCatalog/types';
import type { HttpGet, HttpResponse } from '../../services/cardCatalog/httpClient';

export const SCRYFALL_UPDATED_AT = '2026-10-03T21:05:42.559+00:00';
export const SCRYFALL_DOWNLOAD_URL = 'https://data.scryfall.io/default-cards/default-cards-20261003210542.jsonl.gz';

export const fixtureUuid = (i: number): string => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

/** One Scryfall default_cards object. i drives every field deterministically. */
export function scryfallCard(i: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = fixtureUuid(i);
  return {
    object: 'card',
    id,
    oracle_id: fixtureUuid(10000 + i),
    name: `Test Card ${i}`,
    lang: 'en',
    released_at: '2024-02-09',
    layout: 'normal',
    set: 'TST',
    set_name: 'Test Set',
    collector_number: String(i + 1),
    rarity: 'common',
    finishes: i % 3 === 0 ? ['nonfoil', 'foil'] : ['nonfoil'],
    games: ['paper', 'mtgo'],
    digital: false,
    tcgplayer_id: 100000 + i,
    cardmarket_id: 200000 + i,
    image_uris: {
      small: `https://cards.scryfall.io/small/front/0/0/${id}.jpg`,
      normal: `https://cards.scryfall.io/normal/front/0/0/${id}.jpg`,
    },
    prices: {
      usd: i % 7 === 6 ? null : (0.25 + i * 0.1).toFixed(2),
      usd_foil: i % 3 === 0 ? '1.50' : null,
      usd_etched: null,
      eur: '0.20',
    },
    ...overrides,
  };
}

export function scryfallRows(count = 50): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, i) => scryfallCard(i));
}

export function jsonl(rows: unknown[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

export function gzipJsonl(rows: unknown[]): Buffer {
  return zlib.gzipSync(Buffer.from(jsonl(rows), 'utf8'));
}

/** A Readable that delivers the buffer in several chunks. */
export function chunked(buf: Buffer, size = 700): Readable {
  const parts: Buffer[] = [];
  for (let i = 0; i < buf.length; i += size) parts.push(buf.subarray(i, i + size));
  return Readable.from(parts);
}

export function bulkListing(updatedAt = SCRYFALL_UPDATED_AT, downloadUrl = SCRYFALL_DOWNLOAD_URL) {
  return {
    object: 'list',
    has_more: false,
    data: [
      { object: 'bulk_data', type: 'oracle_cards', updated_at: updatedAt, jsonl_download_uri: 'https://data.scryfall.io/oracle-cards/x.jsonl.gz', compressed_size: 1 },
      { object: 'bulk_data', type: 'default_cards', updated_at: updatedAt, jsonl_download_uri: downloadUrl, compressed_size: 78692716 },
    ],
  };
}

export interface FakeHttpCall {
  url: string;
  headers: Record<string, string>;
}

export interface FakeReply {
  status?: number;
  body?: string | Buffer | Readable;
}

/** HttpGet backed by a handler; records every call. */
export function fakeHttp(handler: (url: string, calls: FakeHttpCall[]) => FakeReply | Promise<FakeReply>) {
  const calls: FakeHttpCall[] = [];
  const httpGet: HttpGet = async (url, headers) => {
    calls.push({ url, headers });
    const reply = await handler(url, calls);
    const status = reply.status ?? 200;
    const raw = reply.body ?? '';
    const body = raw instanceof Readable ? raw : Readable.from([Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8')]);
    const res: HttpResponse = { status, headers: {}, body };
    return res;
  };
  return { httpGet, calls };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * In-memory CatalogStore with the same contract as the SQL implementation: a row identical to
 * the stored one is not rewritten and is not counted; prices attach to existing printings only;
 * asOf is not part of the "differs" test.
 */
export class MemoryCatalogStore implements CatalogStore {
  printings = new Map<string, PrintingRow>();
  prices = new Map<string, PriceRow>();
  sources = new Map<string, SourceState>();
  dbSizeMb: number | null = 100;
  runs: Array<{ source: CatalogSourceId; record: RunRecord }> = [];

  async getDbSizeMb() {
    return this.dbSizeMb;
  }

  async upsertPrintings(rows: PrintingRow[]) {
    let changed = 0;
    for (const r of rows) {
      const prev = this.printings.get(r.id);
      if (!prev || !same(prev, r)) {
        this.printings.set(r.id, { ...r, finishes: [...r.finishes] });
        changed++;
      }
    }
    return changed;
  }

  async upsertPrices(rows: PriceRow[]) {
    let changed = 0;
    for (const r of rows) {
      if (!this.printings.has(r.printingId)) continue;
      const prev = this.prices.get(r.printingId);
      const hasAny = r.usd !== null || r.usdFoil !== null || r.usdEtched !== null || r.usdReverse !== null;
      if (!prev && !hasAny) continue;
      const key = (p: PriceRow) => [p.usd, p.usdFoil, p.usdEtched, p.usdReverse];
      if (!prev || !same(key(prev), key(r))) {
        this.prices.set(r.printingId, { ...r });
        changed++;
      }
    }
    return changed;
  }

  async updateFinishes(rows: FinishUpdate[]) {
    let changed = 0;
    for (const r of rows) {
      const p = this.printings.get(r.id);
      if (p && !same(p.finishes, r.finishes)) {
        p.finishes = [...r.finishes];
        changed++;
      }
    }
    return changed;
  }

  async getSource(source: CatalogSourceId) {
    return this.sources.get(source) ?? null;
  }

  async recordRun(source: CatalogSourceId, record: RunRecord) {
    this.runs.push({ source, record });
    const prev: SourceState = this.sources.get(source) ?? {
      source,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastStatus: null,
      lastError: null,
      sourceVersion: null,
      rowsUpserted: 0,
      consecutiveFailures: 0,
    };
    const next: SourceState = { ...prev, lastAttemptAt: record.now, lastStatus: record.status };
    if (record.status === 'FAILED') {
      next.lastError = record.error ?? null;
      next.consecutiveFailures = prev.consecutiveFailures + 1;
    } else if (record.status === 'SKIPPED_DB_SPACE') {
      next.lastError = record.error ?? null;
    } else {
      next.lastSuccessAt = record.now;
      next.lastError = null;
      next.consecutiveFailures = 0;
      next.rowsUpserted = record.rowsUpserted ?? 0;
      if (record.sourceVersion) next.sourceVersion = record.sourceVersion;
    }
    this.sources.set(source, next);
    return { consecutiveFailures: next.consecutiveFailures };
  }

  async loadedSetCodes(game: CatalogGame) {
    const out = new Set<string>();
    for (const p of this.printings.values()) if (p.game === game && p.source === 'TCGCSV') out.add(p.setCode.toLowerCase());
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Fake Prisma-shaped db for the read side (lookup, controller)
// ---------------------------------------------------------------------------------------------

/** Evaluates the small subset of Prisma where-syntax the lookup service emits. */
export function matchesWhere(row: any, where: any): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries<any>(where)) {
    if (key === 'OR') {
      if (!cond.some((c: any) => matchesWhere(row, c))) return false;
    } else if (key === 'AND') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.every((c: any) => matchesWhere(row, c))) return false;
    } else if (cond !== null && typeof cond === 'object') {
      const v = row[key];
      if ('in' in cond && !cond.in.includes(v)) return false;
      if ('startsWith' in cond && !(typeof v === 'string' && v.startsWith(cond.startsWith))) return false;
      if ('equals' in cond && v !== cond.equals) return false;
    } else if (row[key] !== cond) {
      return false;
    }
  }
  return true;
}

export interface FakeDbOptions {
  printings?: any[];
  sources?: any[];
  /** When true the fake ignores `take` (proves the service caps results itself). */
  ignoreTake?: boolean;
}

export function makeFakeDb(opts: FakeDbOptions = {}) {
  const printings = opts.printings ?? [];
  const sources = opts.sources ?? [];
  const findMany = jest.fn(async (args: any) => {
    let rows = printings.filter((r) => matchesWhere(r, args?.where));
    if (!opts.ignoreTake && typeof args?.take === 'number') rows = rows.slice(0, args.take);
    return rows;
  });
  const findUnique = jest.fn(async (args: any) => printings.find((r) => matchesWhere(r, args?.where)) ?? null);
  const db: any = {
    $executeRawUnsafe: jest.fn(async () => 0),
    $queryRawUnsafe: jest.fn(async () => []),
    cardPrinting: { findMany, findUnique },
    cardDataSource: {
      findMany: jest.fn(async () => sources),
      findUnique: jest.fn(async (args: any) => sources.find((s) => s.source === args?.where?.source) ?? null),
      upsert: jest.fn(async () => ({})),
    },
  };
  return { db, findMany, findUnique };
}

/** A printing row as the database would return it (with nameNorm and an included price). */
export function dbPrinting(over: Record<string, unknown> = {}): any {
  return {
    id: 'SCRYFALL:x',
    source: 'SCRYFALL',
    game: 'MTG',
    name: 'Lightning Bolt',
    nameNorm: 'lightning bolt',
    setCode: 'lea',
    setName: 'Limited Edition Alpha',
    collectorNumber: '161',
    language: 'en',
    rarity: 'common',
    releaseYear: 1993,
    finishes: ['NONFOIL'],
    scryfallId: 'x',
    tcgplayerProductId: null,
    cardmarketId: null,
    imageSmallUrl: null,
    imageNormalUrl: null,
    price: { usd: 100, usdFoil: null, usdEtched: null, usdReverse: null, asOf: new Date('2026-10-03T21:05:42Z') },
    ...over,
  };
}

export const READY_SCRYFALL_SOURCE = {
  source: 'SCRYFALL',
  lastAttemptAt: new Date('2026-10-03T22:00:00Z'),
  lastSuccessAt: new Date('2026-10-03T22:00:00Z'),
  lastStatus: 'OK',
  lastError: null,
  sourceVersion: SCRYFALL_UPDATED_AT,
  rowsUpserted: 50,
  consecutiveFailures: 0,
};

// ---------------------------------------------------------------------------------------------
// TCGCSV payloads
// ---------------------------------------------------------------------------------------------

export const TCG_LAST_UPDATED = '2026-10-03T20:05:38+0000';

export const tcgGroups = (game: 'POKEMON' | 'YUGIOH') => ({
  success: true,
  errors: [],
  results:
    game === 'POKEMON'
      ? [
          { groupId: 604, name: 'Base Set', abbreviation: 'BS', isSupplemental: false, publishedOn: '1999-01-09T00:00:00', modifiedOn: '2026-02-17T13:08:33.207', categoryId: 3 },
          { groupId: 2332, name: 'Professor Program Promos', abbreviation: 'PPP', isSupplemental: true, publishedOn: '2026-10-03T20:00:05Z', modifiedOn: '2026-10-03T20:00:05Z', categoryId: 3 },
        ]
      : [{ groupId: 330, name: 'The Legend of Blue Eyes White Dragon', abbreviation: 'LOB', isSupplemental: false, publishedOn: '2002-03-08T00:00:00', modifiedOn: '2026-08-20T20:55:13.41', categoryId: 2 }],
});

const product = (productId: number, name: string, number: string | null, rarity = 'Rare') => ({
  productId,
  name,
  cleanName: name,
  imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`,
  categoryId: 3,
  groupId: 604,
  extendedData: number === null ? [] : [{ name: 'Number', displayName: 'Card Number', value: number }, { name: 'Rarity', displayName: 'Rarity', value: rarity }],
});

export const tcgProducts = (groupId: number) =>
  groupId === 604
    ? { success: true, errors: [], results: [product(42346, 'Alakazam', '001/102', 'Holo Rare'), product(42347, 'Blastoise', '002/102', 'Holo Rare'), product(99999, 'Base Set Booster Box', null)] }
    : groupId === 2332
      ? { success: true, errors: [], results: [product(77001, 'Pikachu Promo', 'PP-001', 'Promo')] }
      : { success: true, errors: [], results: [product(55001, 'Aqua Madoor', 'LOB-027')] };

export const tcgPrices = (groupId: number) =>
  groupId === 604
    ? {
        success: true,
        errors: [],
        results: [
          { productId: 42346, lowPrice: 43.99, midPrice: 59.99, highPrice: 9999, marketPrice: 69.41, directLowPrice: 50.12, subTypeName: 'Holofoil' },
          { productId: 42347, lowPrice: 36.99, midPrice: 75, highPrice: 500, marketPrice: 91.06, directLowPrice: 248.98, subTypeName: 'Holofoil' },
          { productId: 42347, lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 3.5, directLowPrice: null, subTypeName: 'Normal' },
          { productId: 42346, lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 2.25, directLowPrice: null, subTypeName: '1st Edition Holofoil' },
        ],
      }
    : groupId === 2332
      ? { success: true, errors: [], results: [{ productId: 77001, marketPrice: 1.1, subTypeName: 'Normal' }] }
      : { success: true, errors: [], results: [{ productId: 55001, marketPrice: 0.5, subTypeName: 'Unlimited' }, { productId: 55001, marketPrice: 9.5, subTypeName: '1st Edition' }] };
