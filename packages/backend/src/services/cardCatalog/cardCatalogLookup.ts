/**
 * Read side of the card catalog (ADR-134 sections 3.4 and 3.7, batch B3).
 *
 * Every function reads local tables only. When the catalog is disabled (CARD_CATALOG_ENABLED not
 * true) or a game has not been ingested yet, callers get catalogReady:false and empty results,
 * never an error, so listing is never blocked on the catalog.
 *
 * Caps (Scryfall's "do not repackage or proxy" rule): search returns at most 20 rows, resolve at
 * most 500 refs with at most 5 candidates each, and there is no list-all function.
 */
import type { CatalogGame, CatalogSourceId } from './types';
import { CatalogDb, getCatalogDb } from './catalogStore';
import { CATALOG_GAMES, EnvLike, getEnabledGames, getPriceStaleHours, isCatalogEnabled } from './catalogConfig';
import {
  collectorNumberCandidates,
  collectorNumbersMatch,
  normalizeCardName,
  parseSourceVersionDate,
} from './normalize';
import { computeSuggestedPrice, SuggestionResult } from './cardPriceSuggestionService';

export const SEARCH_MAX_LIMIT = 20;
export const SEARCH_MIN_QUERY_CHARS = 2;
export const RESOLVE_MAX_REFS = 500;
export const RESOLVE_MAX_CANDIDATES = 5;
const NAME_QUERY_TAKE = 40;
const NAME_QUERY_CONCURRENCY = 8;
const PAIR_QUERY_CHUNK = 100;

export const GAME_SOURCE: Record<CatalogGame, CatalogSourceId> = {
  MTG: 'SCRYFALL',
  POKEMON: 'TCGCSV',
  YUGIOH: 'TCGCSV',
};

export interface PriceBlock {
  usd: number | null;
  usdFoil: number | null;
  usdEtched: number | null;
  usdReverse: number | null;
  asOf: string | null;
}

export interface PrintingDto {
  id: string;
  source: string;
  game: string;
  name: string;
  setCode: string;
  setName: string | null;
  collectorNumber: string | null;
  language: string | null;
  rarity: string | null;
  releaseYear: number | null;
  finishes: string[];
  scryfallId: string | null;
  tcgplayerProductId: number | null;
  cardmarketId: number | null;
  imageSmallUrl: string | null;
  imageNormalUrl: string | null;
  price: PriceBlock | null;
}

const PRINTING_SELECT = {
  id: true,
  source: true,
  game: true,
  name: true,
  nameNorm: true,
  setCode: true,
  setName: true,
  collectorNumber: true,
  language: true,
  rarity: true,
  releaseYear: true,
  finishes: true,
  scryfallId: true,
  tcgplayerProductId: true,
  cardmarketId: true,
  imageSmallUrl: true,
  imageNormalUrl: true,
  price: { select: { usd: true, usdFoil: true, usdEtched: true, usdReverse: true, asOf: true } },
};

/** Prisma Decimal (decimal.js), number or string to a plain number; null stays null. */
export function decimalToNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const anyV = v as { toNumber?: () => number; toString?: () => string };
  if (typeof anyV.toNumber === 'function') {
    const n = anyV.toNumber();
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
}

export function toPrintingDto(row: any): PrintingDto {
  const p = row.price;
  return {
    id: row.id,
    source: row.source,
    game: row.game,
    name: row.name,
    setCode: row.setCode,
    setName: row.setName ?? null,
    collectorNumber: row.collectorNumber ?? null,
    language: row.language ?? null,
    rarity: row.rarity ?? null,
    releaseYear: row.releaseYear ?? null,
    finishes: Array.isArray(row.finishes) ? row.finishes : [],
    scryfallId: row.scryfallId ?? null,
    tcgplayerProductId: row.tcgplayerProductId ?? null,
    cardmarketId: row.cardmarketId ?? null,
    imageSmallUrl: row.imageSmallUrl ?? null,
    imageNormalUrl: row.imageNormalUrl ?? null,
    price: p
      ? {
          usd: decimalToNumber(p.usd),
          usdFoil: decimalToNumber(p.usdFoil),
          usdEtched: decimalToNumber(p.usdEtched),
          usdReverse: decimalToNumber(p.usdReverse),
          asOf: p.asOf instanceof Date ? p.asOf.toISOString() : p.asOf ? String(p.asOf) : null,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Catalog state (readiness and freshness), the envelope every route returns
// ---------------------------------------------------------------------------------------------

export interface CatalogState {
  enabled: boolean;
  /** True when at least one enabled game has a source that has completed a run. */
  catalogReady: boolean;
  readyGames: CatalogGame[];
  dataAsOf: { SCRYFALL: string | null; TCGCSV: string | null };
  sources: Array<{
    source: CatalogSourceId;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastStatus: string | null;
    consecutiveFailures: number;
    dataAsOf: string | null;
  }>;
}

export const DISABLED_STATE: CatalogState = {
  enabled: false,
  catalogReady: false,
  readyGames: [],
  dataAsOf: { SCRYFALL: null, TCGCSV: null },
  sources: [],
};

const iso = (d: Date | null | undefined): string | null => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

/** Snapshot time of a source's data: the date in sourceVersion, else the last success time. */
function sourceDataAsOf(row: any): Date | null {
  return parseSourceVersionDate(row?.sourceVersion) ?? (row?.lastSuccessAt instanceof Date ? row.lastSuccessAt : null);
}

/**
 * Reads CardDataSource (two rows at most). Does not touch the database at all when the catalog is
 * disabled.
 */
export async function loadCatalogState(db: () => CatalogDb = getCatalogDb, env: EnvLike = process.env): Promise<CatalogState> {
  if (!isCatalogEnabled(env)) return DISABLED_STATE;
  const games = getEnabledGames(env);
  const rows = await db().cardDataSource.findMany({});
  const bySource = new Map<string, any>(rows.map((r: any) => [r.source, r]));
  const wanted = new Set<CatalogSourceId>(games.map((g) => GAME_SOURCE[g]));

  const readyGames = games.filter((g) => bySource.get(GAME_SOURCE[g])?.lastSuccessAt);
  const dataAsOf = { SCRYFALL: null as string | null, TCGCSV: null as string | null };
  const sources: CatalogState['sources'] = [];
  for (const source of wanted) {
    const row = bySource.get(source);
    if (!row) continue;
    const asOf = iso(sourceDataAsOf(row));
    dataAsOf[source] = asOf;
    sources.push({
      source,
      lastAttemptAt: iso(row.lastAttemptAt),
      lastSuccessAt: iso(row.lastSuccessAt),
      lastStatus: row.lastStatus ?? null,
      consecutiveFailures: Number(row.consecutiveFailures ?? 0),
      dataAsOf: asOf,
    });
  }
  return { enabled: true, catalogReady: readyGames.length > 0, readyGames, dataAsOf, sources };
}

export function isGameServed(state: CatalogState, game: CatalogGame): boolean {
  return state.readyGames.includes(game);
}

export function isCatalogGame(value: unknown): value is CatalogGame {
  return typeof value === 'string' && (CATALOG_GAMES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

export interface SearchParams {
  game: CatalogGame;
  q?: string | null;
  set?: string | null;
  number?: string | null;
  limit?: number | null;
}

export interface SearchResult {
  results: PrintingDto[];
  /** True when more rows matched than were returned. */
  capped: boolean;
}

/** Clamps a requested limit to 1..SEARCH_MAX_LIMIT (default 20). */
export function clampSearchLimit(limit: unknown): number {
  const n = Math.floor(Number(limit));
  if (!Number.isFinite(n) || n < 1) return SEARCH_MAX_LIMIT;
  return Math.min(n, SEARCH_MAX_LIMIT);
}

/** Prisma where-fragment matching a typed collector number against its stored spellings. */
function collectorNumberWhere(raw: string): Record<string, unknown> | null {
  const candidates = collectorNumberCandidates(raw);
  if (candidates.length === 0) return null;
  return {
    OR: [
      { collectorNumber: { in: candidates } },
      ...candidates.map((c) => ({ collectorNumber: { startsWith: `${c}/` } })),
    ],
  };
}

/**
 * Prefix search on the normalized name, or exact (set, number). Needs a name of at least two
 * characters, or a set together with a number; anything else returns no rows.
 */
export async function searchPrintings(params: SearchParams, db: CatalogDb = getCatalogDb()): Promise<SearchResult> {
  const limit = clampSearchLimit(params.limit);
  const qn = normalizeCardName(params.q ?? '');
  const set = String(params.set ?? '').trim().toLowerCase();
  const number = String(params.number ?? '').trim();
  const hasName = qn.length >= SEARCH_MIN_QUERY_CHARS;
  const hasSetNumber = set.length > 0 && number.length > 0;
  if (!hasName && !hasSetNumber) return { results: [], capped: false };

  const where: Record<string, unknown> = { game: params.game };
  if (hasName) where.nameNorm = { startsWith: qn };
  if (set) where.setCode = set;
  if (number) {
    const numberWhere = collectorNumberWhere(number);
    if (numberWhere) Object.assign(where, { AND: [numberWhere] });
  }

  const rows = await db.cardPrinting.findMany({
    where,
    select: PRINTING_SELECT,
    orderBy: [{ nameNorm: 'asc' }, { setCode: 'asc' }, { collectorNumber: 'asc' }],
    take: limit + 1,
  });
  const capped = rows.length > limit;
  return { results: rows.slice(0, limit).map(toPrintingDto), capped };
}

// ---------------------------------------------------------------------------------------------
// Resolve (used by intake)
// ---------------------------------------------------------------------------------------------

export interface ResolveRef {
  ref: string;
  game: CatalogGame;
  scryfallId?: string | null;
  tcgplayerProductId?: number | null;
  setCode?: string | null;
  collectorNumber?: string | null;
  name?: string | null;
  language?: string | null;
  finish?: string | null;
}

export type ResolveStatus = 'EXACT' | 'AMBIGUOUS' | 'UNMATCHED';

export interface ResolveResult {
  ref: string;
  status: ResolveStatus;
  candidates: PrintingDto[];
  /** True when more than RESOLVE_MAX_CANDIDATES printings matched. */
  truncated: boolean;
}

/** Newest release first, then set code and canonical number, so candidate order is deterministic. */
function sortCandidates(rows: any[]): any[] {
  return [...rows].sort((a, b) => {
    const ya = a.releaseYear ?? 0;
    const yb = b.releaseYear ?? 0;
    if (ya !== yb) return yb - ya;
    if (a.setCode !== b.setCode) return String(a.setCode).localeCompare(String(b.setCode));
    return String(a.collectorNumber ?? '').localeCompare(String(b.collectorNumber ?? ''), undefined, { numeric: true });
  });
}

function nameMatches(rowNameNorm: string, queryNorm: string): boolean {
  return rowNameNorm === queryNorm || rowNameNorm.startsWith(`${queryNorm} `);
}

function toResolveResult(ref: string, rows: any[]): ResolveResult {
  const unique = new Map<string, any>();
  for (const r of rows) unique.set(r.id, r);
  const sorted = sortCandidates(Array.from(unique.values()));
  if (sorted.length === 0) return { ref, status: 'UNMATCHED', candidates: [], truncated: false };
  return {
    ref,
    status: sorted.length === 1 ? 'EXACT' : 'AMBIGUOUS',
    candidates: sorted.slice(0, RESOLVE_MAX_CANDIDATES).map(toPrintingDto),
    truncated: sorted.length > RESOLVE_MAX_CANDIDATES,
  };
}

/**
 * Matches up to 500 refs to printings: by Scryfall id or TCGplayer product id first, then by
 * set code plus collector number, then by name (optionally within a set). The caller validates
 * the 500 cap (the HTTP layer returns 400); a longer list is rejected here too.
 */
export async function resolveRefs(refs: ResolveRef[], db: CatalogDb = getCatalogDb()): Promise<ResolveResult[]> {
  if (refs.length > RESOLVE_MAX_REFS) throw new Error(`resolve accepts at most ${RESOLVE_MAX_REFS} refs`);
  const out: Array<ResolveResult | null> = refs.map(() => null);

  // Phase 1: stable ids.
  const sfIds = Array.from(new Set(refs.map((r) => (r.scryfallId ? `SCRYFALL:${String(r.scryfallId).trim().toLowerCase()}` : '')).filter(Boolean)));
  const tcgIds = Array.from(new Set(refs.map((r) => r.tcgplayerProductId).filter((v): v is number => Number.isInteger(v) && (v as number) > 0)));
  const bySfId = new Map<string, any>();
  const byTcgId = new Map<number, any[]>();
  if (sfIds.length > 0) {
    const rows = await db.cardPrinting.findMany({ where: { id: { in: sfIds } }, select: PRINTING_SELECT, take: sfIds.length });
    for (const r of rows) bySfId.set(String(r.id), r);
  }
  if (tcgIds.length > 0) {
    const rows = await db.cardPrinting.findMany({
      where: { tcgplayerProductId: { in: tcgIds } },
      select: PRINTING_SELECT,
      take: tcgIds.length * 3,
    });
    for (const r of rows) {
      const list = byTcgId.get(r.tcgplayerProductId) ?? [];
      list.push(r);
      byTcgId.set(r.tcgplayerProductId, list);
    }
  }
  refs.forEach((r, i) => {
    if (r.scryfallId) {
      const hit = bySfId.get(`SCRYFALL:${String(r.scryfallId).trim().toLowerCase()}`);
      if (hit && hit.game === r.game) {
        out[i] = toResolveResult(r.ref, [hit]);
        return;
      }
    }
    if (r.tcgplayerProductId) {
      const hits = (byTcgId.get(r.tcgplayerProductId) ?? []).filter((h) => h.game === r.game);
      if (hits.length === 1) out[i] = toResolveResult(r.ref, hits);
    }
  });

  // Phase 2: set code plus collector number.
  const pending = refs
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => out[i] === null && r.setCode && r.collectorNumber && String(r.setCode).trim() && String(r.collectorNumber).trim());
  const pairRows = new Map<string, any[]>();
  for (let start = 0; start < pending.length; start += PAIR_QUERY_CHUNK) {
    const part = pending.slice(start, start + PAIR_QUERY_CHUNK);
    const or = part
      .map(({ r }) => {
        const numberWhere = collectorNumberWhere(String(r.collectorNumber));
        return numberWhere
          ? { AND: [{ game: r.game, setCode: String(r.setCode).trim().toLowerCase() }, numberWhere] }
          : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
    if (or.length === 0) continue;
    const rows = await db.cardPrinting.findMany({ where: { OR: or }, select: PRINTING_SELECT, take: part.length * 20 });
    for (const row of rows) {
      const key = `${row.game}|${String(row.setCode).toLowerCase()}`;
      const list = pairRows.get(key) ?? [];
      list.push(row);
      pairRows.set(key, list);
    }
  }
  for (const { r, i } of pending) {
    const key = `${r.game}|${String(r.setCode).trim().toLowerCase()}`;
    let rows = (pairRows.get(key) ?? []).filter((row) => collectorNumbersMatch(row.collectorNumber, r.collectorNumber));
    if (rows.length > 1 && r.name) {
      const nn = normalizeCardName(r.name);
      const narrowed = rows.filter((row) => nameMatches(String(row.nameNorm), nn));
      if (narrowed.length > 0) rows = narrowed;
    }
    if (rows.length > 0) out[i] = toResolveResult(r.ref, rows);
  }

  // Phase 3: name (optionally within a set), a bounded number of queries at a time.
  const byName = refs
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => out[i] === null && r.name && normalizeCardName(r.name).length > 0);
  for (let start = 0; start < byName.length; start += NAME_QUERY_CONCURRENCY) {
    const part = byName.slice(start, start + NAME_QUERY_CONCURRENCY);
    await Promise.all(
      part.map(async ({ r, i }) => {
        const nn = normalizeCardName(r.name);
        const where: Record<string, unknown> = { game: r.game, nameNorm: { startsWith: nn } };
        if (r.setCode && String(r.setCode).trim()) where.setCode = String(r.setCode).trim().toLowerCase();
        const rows = (await db.cardPrinting.findMany({
          where,
          select: PRINTING_SELECT,
          orderBy: [{ nameNorm: 'asc' }],
          take: NAME_QUERY_TAKE,
        })).filter((row: any) => nameMatches(String(row.nameNorm), nn));
        const exact = rows.filter((row: any) => row.nameNorm === nn);
        out[i] = toResolveResult(r.ref, exact.length > 0 ? exact : rows);
      }),
    );
  }

  return refs.map((r, i) => out[i] ?? { ref: r.ref, status: 'UNMATCHED' as const, candidates: [], truncated: false });
}

// ---------------------------------------------------------------------------------------------
// Suggested price
// ---------------------------------------------------------------------------------------------

export interface SuggestedPriceParams {
  printingId: string;
  finish?: string | null;
  conditionCode?: string | null;
  language?: string | null;
  grader?: string | null;
  grade?: string | null;
}

export type SuggestedPriceOutcome =
  | { found: false }
  | { found: true; printing: PrintingDto; suggestion: SuggestionResult };

/** Loads the printing and its stored price, then computes the suggestion. Writes nothing. */
export async function suggestPriceForPrinting(
  params: SuggestedPriceParams,
  db: CatalogDb = getCatalogDb(),
  env: EnvLike = process.env,
  now: Date = new Date(),
): Promise<SuggestedPriceOutcome> {
  const row = await db.cardPrinting.findUnique({ where: { id: params.printingId }, select: PRINTING_SELECT });
  if (!row) return { found: false };
  const dto = toPrintingDto(row);
  const sourceRow = await db.cardDataSource.findUnique({ where: { source: row.source } });
  const sourceAsOf = sourceRow ? sourceDataAsOf(sourceRow) : null;
  const asOfDate = dto.price?.asOf ? new Date(dto.price.asOf) : null;
  const suggestion = computeSuggestedPrice({
    price: dto.price
      ? {
          usd: dto.price.usd,
          usdFoil: dto.price.usdFoil,
          usdEtched: dto.price.usdEtched,
          usdReverse: dto.price.usdReverse,
          asOf: asOfDate && !Number.isNaN(asOfDate.getTime()) ? asOfDate : null,
        }
      : null,
    sourceAsOf,
    finish: params.finish,
    conditionCode: params.conditionCode,
    language: params.language,
    grader: params.grader,
    grade: params.grade,
    now,
    staleHours: getPriceStaleHours(env),
  });
  return { found: true, printing: dto, suggestion };
}
