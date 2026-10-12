/**
 * In-memory stand-ins for the card scan tests (ADR-138 batch B2): a small synthetic catalog, a resolver that
 * follows the same phases as the real catalog lookup (ids, then set code plus number narrowed by name, then name),
 * and factories for observations and scan entries. Nothing here touches a database, the network or a recognizer.
 * All names and ids are synthetic.
 */
import type { CatalogState, PrintingDto, ResolveRef, ResolveResult } from '../../services/cardCatalog/cardCatalogLookup';
import { collectorNumbersMatch, normalizeCardName } from '../../services/cardCatalog/normalize';
import type { CardObservation, ScanEntryRow } from '../../services/cardScan/types';
import type { FakeIntakeSeed } from './intakeFakes';
import { READY_STATE, makeFakeIntakeDb, printing } from './intakeFakes';
import type { ScanDeps } from '../../services/cardScan/sessionService';

export { READY_STATE, printing };

export const CATALOG_OFF_STATE: CatalogState = {
  enabled: false,
  catalogReady: false,
  readyGames: [],
  dataAsOf: { SCRYFALL: null, TCGCSV: null },
  sources: [],
};

export const SESSION_ID = 'sess_scan_1';
export const ORGANIZER_ID = 'org_scan_1';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function card(n: number, over: Partial<PrintingDto>): PrintingDto {
  return printing({ id: `SCRYFALL:${uuid(n)}`, scryfallId: uuid(n), tcgplayerProductId: 5000 + n, ...over });
}

/** Six printings of one name (more than the five candidates a lookup returns). */
export const BOLTS: PrintingDto[] = [
  card(1, { name: 'Lightning Bolt', setCode: 'lea', setName: 'Limited Edition Alpha', collectorNumber: '161', releaseYear: 1993, finishes: ['NONFOIL'] }),
  card(2, { name: 'Lightning Bolt', setCode: 'm10', setName: 'Magic 2010', collectorNumber: '146', releaseYear: 2009, finishes: ['NONFOIL', 'FOIL'] }),
  card(3, { name: 'Lightning Bolt', setCode: '2xm', setName: 'Double Masters', collectorNumber: '117', releaseYear: 2020, finishes: ['NONFOIL', 'FOIL'] }),
  card(4, { name: 'Lightning Bolt', setCode: 'a25', setName: 'Masters 25', collectorNumber: '141', releaseYear: 2018, finishes: ['NONFOIL', 'FOIL'] }),
  card(5, { name: 'Lightning Bolt', setCode: 'sta', setName: 'Strixhaven Mystical Archive', collectorNumber: '42', releaseYear: 2021, finishes: ['NONFOIL', 'FOIL', 'ETCHED'] }),
  card(6, { name: 'Lightning Bolt', setCode: 'clb', setName: 'Commander Legends Battle for Baldur', collectorNumber: '187', releaseYear: 2022, finishes: ['NONFOIL', 'FOIL'] }),
];

/** A name with exactly one printing (one finish). */
export const MOX: PrintingDto = card(10, { name: 'Mox Pearl', setCode: 'lea', setName: 'Limited Edition Alpha', collectorNumber: '263', releaseYear: 1993, finishes: ['NONFOIL'] });

/** A double-faced card with exactly one printing in two finishes. */
export const DELVER: PrintingDto = card(20, {
  name: 'Delver of Secrets // Insectile Aberration',
  setCode: 'isd',
  setName: 'Innistrad',
  collectorNumber: '51',
  releaseYear: 2011,
  finishes: ['NONFOIL', 'FOIL'],
});

/** A name with three printings. */
export const COUNTERSPELLS: PrintingDto[] = [
  card(30, { name: 'Counterspell', setCode: 'lea', setName: 'Limited Edition Alpha', collectorNumber: '55', releaseYear: 1993, finishes: ['NONFOIL'] }),
  card(31, { name: 'Counterspell', setCode: '2ed', setName: 'Unlimited Edition', collectorNumber: '62', releaseYear: 1993, finishes: ['NONFOIL'] }),
  card(32, { name: 'Counterspell', setCode: 'mh2', setName: 'Modern Horizons 2', collectorNumber: '267', releaseYear: 2021, finishes: ['NONFOIL', 'FOIL'] }),
];

/** Foil-only printing, to check that a single-finish printing never takes a session default finish. */
export const FOIL_ONLY: PrintingDto = card(40, { name: 'Promo Dragon', setCode: 'pro', setName: 'Synthetic Promos', collectorNumber: '1', releaseYear: 2023, finishes: ['FOIL'] });

export const CATALOG: PrintingDto[] = [...BOLTS, MOX, DELVER, ...COUNTERSPELLS, FOIL_ONLY];

function nameMatches(rowNameNorm: string, queryNorm: string): boolean {
  return rowNameNorm === queryNorm || rowNameNorm.startsWith(`${queryNorm} `);
}

function answer(ref: string, rows: PrintingDto[]): ResolveResult {
  const unique = Array.from(new Map(rows.map((r) => [r.id, r])).values());
  const sorted = [...unique].sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0) || a.setCode.localeCompare(b.setCode));
  if (sorted.length === 0) return { ref, status: 'UNMATCHED', candidates: [], truncated: false };
  return { ref, status: sorted.length === 1 ? 'EXACT' : 'AMBIGUOUS', candidates: sorted.slice(0, 5), truncated: sorted.length > 5 };
}

function resolveOne(all: PrintingDto[], r: ResolveRef): ResolveResult {
  const pool = all.filter((p) => p.game === r.game);
  if (r.scryfallId) {
    const hit = pool.find((p) => p.scryfallId === String(r.scryfallId).trim().toLowerCase());
    if (hit) return answer(r.ref, [hit]);
  }
  if (r.tcgplayerProductId) {
    const hits = pool.filter((p) => p.tcgplayerProductId === r.tcgplayerProductId);
    if (hits.length === 1) return answer(r.ref, hits);
  }
  if (r.setCode && r.collectorNumber) {
    let rows = pool.filter((p) => p.setCode.toLowerCase() === String(r.setCode).trim().toLowerCase() && collectorNumbersMatch(p.collectorNumber, r.collectorNumber));
    if (rows.length > 1 && r.name) {
      const nn = normalizeCardName(r.name);
      const narrowed = rows.filter((p) => nameMatches(normalizeCardName(p.name), nn));
      if (narrowed.length > 0) rows = narrowed;
    }
    if (rows.length > 0) return answer(r.ref, rows);
  }
  if (r.name && normalizeCardName(r.name).length > 0) {
    const nn = normalizeCardName(r.name);
    const setFilter = r.setCode && String(r.setCode).trim() ? String(r.setCode).trim().toLowerCase() : null;
    const rows = pool.filter((p) => nameMatches(normalizeCardName(p.name), nn) && (!setFilter || p.setCode.toLowerCase() === setFilter));
    const exact = rows.filter((p) => normalizeCardName(p.name) === nn);
    return answer(r.ref, exact.length > 0 ? exact : rows);
  }
  return answer(r.ref, []);
}

/** A resolver over a fixed list of printings that records every call (the refs it was given). */
export function makeCatalogResolver(printings: PrintingDto[] = CATALOG) {
  const calls: ResolveRef[][] = [];
  const resolve = async (refs: ResolveRef[]): Promise<ResolveResult[]> => {
    calls.push(refs);
    return refs.map((r) => resolveOne(printings, r));
  };
  return { resolve, calls, refCount: () => calls.reduce((sum, list) => sum + list.length, 0) };
}

export function observation(over: Partial<CardObservation> = {}): CardObservation {
  return { providerId: 'haiku-card', game: 'MTG', ...over };
}

const T0 = new Date(1_700_000_000_000);

export function scanEntry(over: Partial<ScanEntryRow> = {}): ScanEntryRow {
  return {
    id: 'entry_1',
    sessionId: SESSION_ID,
    organizerId: ORGANIZER_ID,
    seq: 1,
    source: 'PHOTO',
    clientEntryId: null,
    placementId: null,
    imageSha256: null,
    providerId: 'haiku-card',
    attempts: 1,
    readGame: null,
    readName: null,
    readSetCode: null,
    readSetName: null,
    readCollectorNumber: null,
    readLanguage: null,
    readFinish: null,
    readScryfallId: null,
    readConfidence: null,
    readQuantity: null,
    suggestedConditionCode: null,
    suggestedGrader: null,
    suggestedGrade: null,
    suggestedCertNumber: null,
    suggestionSource: null,
    resolution: 'UNMATCHED',
    resolutionNote: null,
    game: 'MTG',
    printingId: null,
    acceptAsTyped: false,
    cardName: null,
    setCode: null,
    setName: null,
    collectorNumber: null,
    language: null,
    finish: null,
    conditionCode: null,
    grader: null,
    grade: null,
    certNumber: null,
    quantity: 1,
    price: null,
    status: 'NEEDS_REVIEW',
    errorCode: null,
    suspectDuplicateOf: null,
    committedBatchId: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

/** The printings by id, as the commit bridge would load them. */
export function printingMap(list: PrintingDto[] = CATALOG): Map<string, PrintingDto> {
  return new Map(list.map((p) => [p.id, p]));
}

// ---------------------------------------------------------------------------------------------
// Scan database fake and harness (batch B3)
// ---------------------------------------------------------------------------------------------

export const SALE_ID = 'sale_scan_1';
export const USER_ID = 'user_scan_1';
export const OTHER_ORGANIZER_ID = 'org_scan_2';
export const OTHER_SALE_ID = 'sale_scan_2';

type FakeRow = Record<string, any>;

function valueMatches(v: any, cond: any): boolean {
  if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
  if (cond && typeof cond === 'object') {
    if ('in' in cond && !cond.in.includes(v)) return false;
    if ('notIn' in cond && cond.notIn.includes(v)) return false;
    if ('not' in cond && valueMatches(v, cond.not)) return false;
    if ('gt' in cond && !(v > cond.gt)) return false;
    if ('lt' in cond && !(v < cond.lt)) return false;
    return true;
  }
  return (v ?? null) === (cond ?? null);
}

function rowMatches(row: FakeRow, where: any): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries<any>(where)) {
    if (key === 'OR') {
      if (!cond.some((w: any) => rowMatches(row, w))) return false;
      continue;
    }
    if (!valueMatches(row[key], cond)) return false;
  }
  return true;
}

function sortRows(rows: FakeRow[], orderBy: any): FakeRow[] {
  if (!orderBy) return rows;
  const [[key, dir]] = Object.entries<any>(orderBy);
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => (a[key] > b[key] ? sign : a[key] < b[key] ? -sign : 0));
}

function pickFields(row: FakeRow, select?: any): FakeRow {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]]));
}

function applyData(row: FakeRow, data: FakeRow, stamp: () => Date): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) row[key] = (row[key] ?? 0) + value.increment;
    else row[key] = value;
  }
  row.updatedAt = stamp();
}

/**
 * A Prisma-shaped fake of CardScanSession and CardScanEntry on top of the intake fake (sale, item, CardIntakeBatch,
 * transactions). Supports the where forms the scan code uses (equality, in, notIn, not, gt, lt, OR, Date equality),
 * atomic increment, the unique indexes of the schema (P2002) and the cascade on session delete. updatedAt always
 * moves forward on a write, and createdAt follows the injected clock so repeat-window tests can control time.
 */
export function makeFakeScanDb(seed: FakeIntakeSeed = {}, clock: () => number = () => Date.now()) {
  const db: any = makeFakeIntakeDb(seed);
  const sessions = new Map<string, FakeRow>();
  const entries = new Map<string, FakeRow>();
  let nextId = 1;
  const counters = { sessionCreates: 0, entryCreates: 0, entryUpdates: 0 };

  const stampFor = (row?: FakeRow) => () => new Date(Math.max(clock(), row ? row.updatedAt.getTime() + 1 : 0));

  const table = (store: Map<string, FakeRow>, prefix: string, defaults: () => FakeRow, uniques: string[][], onDelete?: (ids: string[]) => void) => ({
    findFirst: async (args: any) => {
      const rows = sortRows(Array.from(store.values()).filter((r) => rowMatches(r, args?.where)), args?.orderBy);
      return rows[0] ? { ...rows[0] } : null;
    },
    findMany: async (args: any) => {
      let rows = sortRows(Array.from(store.values()).filter((r) => rowMatches(r, args?.where)), args?.orderBy);
      if (typeof args?.take === 'number') rows = rows.slice(0, args.take);
      return rows.map((r) => pickFields(r, args?.select));
    },
    count: async (args: any) => Array.from(store.values()).filter((r) => rowMatches(r, args?.where)).length,
    create: async (args: any) => {
      const row: FakeRow = { ...defaults(), ...args.data };
      for (const tuple of uniques) {
        if (tuple.some((k) => row[k] === null || row[k] === undefined)) continue;
        const clash = Array.from(store.values()).some((other) => tuple.every((k) => other[k] === row[k]));
        if (clash) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      row.id = `${prefix}_${nextId++}`;
      row.createdAt = new Date(clock());
      row.updatedAt = row.createdAt;
      store.set(row.id, row);
      return pickFields(row, args.select);
    },
    update: async (args: any) => {
      const row = Array.from(store.values()).find((r) => rowMatches(r, args.where));
      if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
      applyData(row, args.data, stampFor(row));
      return pickFields(row, args.select);
    },
    updateMany: async (args: any) => {
      const hits = Array.from(store.values()).filter((r) => rowMatches(r, args.where));
      for (const row of hits) applyData(row, args.data, stampFor(row));
      return { count: hits.length };
    },
    deleteMany: async (args: any) => {
      const hits = Array.from(store.values()).filter((r) => rowMatches(r, args.where));
      for (const row of hits) store.delete(row.id);
      onDelete?.(hits.map((r) => r.id));
      return { count: hits.length };
    },
  });

  const sessionTable = table(
    sessions,
    'sess',
    () => ({
      source: 'PHOTO',
      label: null,
      status: 'OPEN',
      defaultGame: 'MTG',
      defaultConditionCode: null,
      defaultFinish: null,
      nextSeq: 0,
      commitMode: null,
      commitManifestSha256: null,
      lastActivityAt: new Date(clock()),
    }),
    [],
    (ids) => {
      for (const e of Array.from(entries.values())) if (ids.includes(e.sessionId)) entries.delete(e.id);
    }
  );
  db.cardScanSession = {
    ...sessionTable,
    create: async (args: any) => {
      counters.sessionCreates += 1;
      return sessionTable.create(args);
    },
  };
  const entryDefaults = (): FakeRow => {
    const base: FakeRow = { ...scanEntry() };
    delete base.id;
    delete base.createdAt;
    delete base.updatedAt;
    return base;
  };
  const entryTable = table(entries, 'entry', entryDefaults, [['sessionId', 'seq'], ['sessionId', 'clientEntryId'], ['sessionId', 'placementId'], ['sessionId', 'imageSha256']]);
  db.cardScanEntry = {
    ...entryTable,
    create: async (args: any) => {
      counters.entryCreates += 1;
      return entryTable.create(args);
    },
    updateMany: async (args: any) => {
      counters.entryUpdates += 1;
      return entryTable.updateMany(args);
    },
  };
  db.scan = {
    sessions,
    entries,
    counters,
    /** Inserts a session row directly (bypasses the service). */
    seedSession(over: FakeRow = {}): FakeRow {
      const at = new Date(clock());
      const row: FakeRow = {
        id: `sess_seed_${nextId++}`,
        organizerId: ORGANIZER_ID,
        saleId: SALE_ID,
        source: 'PHOTO',
        label: null,
        status: 'OPEN',
        defaultGame: 'MTG',
        defaultConditionCode: null,
        defaultFinish: null,
        nextSeq: 0,
        commitMode: null,
        commitManifestSha256: null,
        lastActivityAt: at,
        createdAt: at,
        updatedAt: at,
        ...over,
      };
      sessions.set(row.id, row);
      return { ...row };
    },
    /** Inserts an entry row directly and keeps the session's nextSeq at least as high as the entry's seq. */
    seedEntry(over: FakeRow = {}): FakeRow {
      const base = scanEntry();
      const at = new Date(clock());
      const row: FakeRow = { ...base, id: `entry_seed_${nextId++}`, createdAt: at, updatedAt: at, ...over };
      entries.set(row.id, row);
      const session = sessions.get(row.sessionId);
      if (session && session.nextSeq < row.seq) session.nextSeq = row.seq;
      return { ...row };
    },
    entriesOf(sessionId: string): FakeRow[] {
      return Array.from(entries.values())
        .filter((e) => e.sessionId === sessionId)
        .sort((a, b) => a.seq - b.seq)
        .map((e) => ({ ...e }));
    },
  };
  return db;
}

export interface ScanHarnessOptions {
  catalog?: PrintingDto[];
  state?: CatalogState;
  env?: Record<string, string | undefined>;
  dbSizeBytes?: number | null;
  startMs?: number;
  sales?: Array<{ id: string; organizerId: string; userId: string }>;
}

/**
 * Everything a scan service test needs: the fake database, a clock the test advances, the in-memory catalog
 * resolver (records every call) and the ScanDeps wired to them. Two organizers each own one sale.
 */
export function makeScanHarness(opts: ScanHarnessOptions = {}) {
  const clock = { ms: opts.startMs ?? 1_700_000_000_000 };
  const catalog = opts.catalog ?? CATALOG;
  const db = makeFakeScanDb(
    {
      sales: opts.sales ?? [
        { id: SALE_ID, organizerId: ORGANIZER_ID, userId: USER_ID },
        { id: OTHER_SALE_ID, organizerId: OTHER_ORGANIZER_ID, userId: 'user_scan_2' },
      ],
    },
    () => clock.ms
  );
  const resolver = makeCatalogResolver(catalog);
  const printingLoads: string[][] = [];
  const deps: ScanDeps = {
    db,
    resolve: resolver.resolve,
    getCatalogState: async () => opts.state ?? READY_STATE,
    loadPrintings: async (ids: string[]) => {
      printingLoads.push(ids);
      return catalog.filter((p) => ids.includes(p.id));
    },
    getDbSizeBytes: async () => (opts.dbSizeBytes === undefined ? null : opts.dbSizeBytes),
    env: opts.env ?? {},
    now: () => new Date(clock.ms),
  };
  return { deps, db, clock, resolver, printingLoads, scan: db.scan };
}
