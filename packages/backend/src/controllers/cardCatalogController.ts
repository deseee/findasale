/**
 * Card catalog lookup API (ADR-134 section 3.4, batch B3).
 *
 * Routes (mounted at /api/cards by the wiring batch; see routes/cardCatalog.ts):
 *   GET  /vocabulary       games, finishes, condition codes, graders, grades, languages
 *   GET  /search           prefix search or exact set+number, capped at 20
 *   POST /resolve          up to 500 refs -> EXACT | AMBIGUOUS | UNMATCHED (used by intake)
 *   GET  /suggested-price  Suggested price block for one printing (computed, never stored). With the optional priceBook
 *                          dependency (ADR-140 section 12.1) and the shop's book on, the answer comes from the book
 *   GET  /status           CardDataSource freshness for the UI banner (plus data attributions when TCGdex is on)
 *
 * Contract:
 *  - Every success body is { success: true, catalogReady, dataAsOf: { SCRYFALL, TCGCSV }, ...payload,
 *    data: payload } (payload keys appear both at the top level and under `data`).
 *  - Errors are { error, code } with code CARD_VALIDATION (400), CARD_NOT_FOUND (404) or
 *    CARD_CATALOG_ERROR (500).
 *  - With CARD_CATALOG_ENABLED unset or false, or before the first ingest, every route answers
 *    HTTP 200 with catalogReady:false and empty results. The catalog is never required to list.
 *  - No tier gate (Scryfall's terms forbid paywalling its data). Reads local tables only.
 *  - Nothing here writes to the database.
 *  - Price book (ADR-140 sections 12.1 and 12.2): with no priceBook dependency, or the book off, or the book failing, the
 *    suggested-price response is exactly the legacy one. The only other change is that, with
 *    CARD_CATALOG_PRICE_REFERENCE_ENABLED off, the suggestion says catalogReference: 'OFF'.
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import { CatalogDb, getCatalogDb } from '../services/cardCatalog/catalogStore';
import { EnvLike, CATALOG_GAMES } from '../services/cardCatalog/catalogConfig';
import { EBAY_MINIMUM_PRICE } from '../services/cardCatalog/cardPriceSuggestionService';
import { getCatalogVocabulary } from '../services/cardCatalog/catalogVocabulary';
import {
  CatalogState,
  RESOLVE_MAX_REFS,
  SEARCH_MIN_QUERY_CHARS,
  clampSearchLimit,
  isGameServed,
  loadCatalogState,
  resolveRefs,
  searchPrintings,
  suggestPriceForPrinting,
} from '../services/cardCatalog/cardCatalogLookup';
import { normalizeCardName } from '../services/cardCatalog/normalize';
import type { PrintingDto } from '../services/cardCatalog/cardCatalogLookup';
import { isPriceBookEnabled } from '../services/priceBook/config';
import { asPriceBookDb, isPriceBookError } from '../services/priceBook/db';
import { suggestForRoute } from '../services/priceBook/suggestService';
import type { PriceSuggestion } from '../services/priceBook/types';

/** What the legacy route hands the price book for one card (ADR-140 section 12.1). */
export interface PriceBookRouteInput {
  organizerId: string;
  /** The organizer's own item, when the caller sent one. A foreign or unknown id is answered as not found. */
  itemId: string | null;
  printing: PrintingDto;
  finish: string;
  conditionCode: string;
  language: string;
  graded: boolean;
  env: EnvLike;
  now: Date;
}

export type PriceBookRouteOutcome =
  | { kind: 'ANSWER'; suggestion: PriceSuggestion }
  | { kind: 'ITEM_NOT_FOUND' };

/**
 * The optional price book dependency. suggestForRoute resolves to null when the book is off or the shop has no enabled
 * book, and must not throw for anything else the route can fall back from (the route also guards it).
 */
export interface CardCatalogPriceBookDep {
  suggestForRoute(input: PriceBookRouteInput): Promise<PriceBookRouteOutcome | null>;
}

export interface CardCatalogControllerDeps {
  getDb: () => CatalogDb;
  getEnv: () => EnvLike;
  now: () => Date;
  /** Absent means the legacy answer only. */
  priceBook?: CardCatalogPriceBookDep;
}

/**
 * The real price book dependency (ADR-140 section 12.1). Guarded by CARD_PRICE_BOOK_ENABLED (default off, read on every call):
 * with the flag off it answers null without touching the database. getDb is a test hook; production lazily requires the
 * shared client (importing lib/prisma at load time would construct a client in every test).
 */
export function createPriceBookRouteDep(getDb?: () => unknown): CardCatalogPriceBookDep {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dbFor = getDb ?? (() => (require('../lib/prisma') as { prisma: unknown }).prisma);
  return {
    async suggestForRoute(input) {
      if (!isPriceBookEnabled(input.env)) return null;
      try {
        const out = await suggestForRoute(
          { db: asPriceBookDb(dbFor()), organizerId: input.organizerId, now: input.now, env: input.env },
          [
            {
              itemId: input.itemId,
              printingId: input.printing.id,
              game: input.printing.game,
              finish: input.finish,
              conditionCode: input.conditionCode,
              language: input.language,
              graded: input.graded,
              quantity: 1,
            },
          ],
          { family: 'RETAIL' },
        );
        const row = out?.results[0];
        return row ? { kind: 'ANSWER', suggestion: row.suggestion } : null;
      } catch (err) {
        if (isPriceBookError(err) && err.code === 'NOT_FOUND') return { kind: 'ITEM_NOT_FOUND' };
        console.error('[cardCatalog] price book suggestion failed, using the catalog answer:', err instanceof Error ? err.message : err);
        return null;
      }
    },
  };
}

const gameEnum = z.enum(CATALOG_GAMES as unknown as [string, ...string[]]);
const optionalText = (max: number) => z.string().trim().max(max).optional();

const searchQuerySchema = z.object({
  game: gameEnum,
  q: optionalText(100),
  set: optionalText(20),
  number: optionalText(20),
  limit: z.coerce.number().int().optional(),
});

const refSchema = z.object({
  ref: z.string().trim().min(1).max(100),
  game: gameEnum,
  scryfallId: z.string().trim().max(64).nullish(),
  tcgplayerProductId: z.number().int().positive().nullish(),
  setCode: z.string().trim().max(20).nullish(),
  collectorNumber: z.string().trim().max(20).nullish(),
  name: z.string().trim().max(200).nullish(),
  language: z.string().trim().max(10).nullish(),
  finish: z.string().trim().max(20).nullish(),
});

const resolveBodySchema = z.object({
  refs: z.array(refSchema).max(RESOLVE_MAX_REFS, `At most ${RESOLVE_MAX_REFS} refs per request`),
});

const suggestedPriceQuerySchema = z.object({
  printingId: z.string().trim().min(1).max(80),
  finish: optionalText(20),
  conditionCode: optionalText(10),
  language: optionalText(10),
  grader: optionalText(20),
  grade: optionalText(30),
  itemId: optionalText(80),
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The legacy suggestion shape (ADR-140 section 12.1 item 3) built from a price book answer, plus the additive priceBook block
 * (the section 10.1 result). Returns null when the book's answer is not one the legacy shape can carry (INVALID_INPUT), so
 * the caller keeps the catalog answer.
 */
function suggestionFromBook(
  s: PriceSuggestion,
  basis: { finish: string; conditionCode: string },
  now: Date,
): Record<string, unknown> | null {
  if (!s.ok || s.priceCents === null) {
    if (s.code === undefined || s.code === 'INVALID_INPUT') return null;
    return {
      ok: false,
      code: s.code,
      suggestedPrice: null,
      message: s.why,
      priceBook: { ok: false, code: s.code, priceCents: null, applyAllowed: false, why: s.why },
    };
  }
  const price = s.priceCents / 100;
  const asOfMs = s.priceAsOf ? new Date(s.priceAsOf).getTime() : NaN;
  return {
    ok: true,
    suggestedPrice: price,
    currency: 'USD',
    basis: { finish: basis.finish, conditionCode: basis.conditionCode },
    asOf: s.priceAsOf,
    showDataDate: Number.isFinite(asOfMs) && now.getTime() - asOfMs > DAY_MS,
    stale: s.warnings.some((w) => w.code === 'REFERENCE_OLD'),
    belowEbayMinimum: price < EBAY_MINIMUM_PRICE,
    note: s.why,
    priceBook: {
      ok: true,
      priceCents: s.priceCents,
      price,
      currency: 'USD',
      priceSource: s.priceSource,
      priceAsOf: s.priceAsOf,
      referenceCents: s.referenceCents,
      referenceOrigin: s.referenceOrigin,
      referenceLabel: s.referenceLabel,
      rule: s.rule,
      unchanged: s.unchanged,
      applyAllowed: s.applyAllowed,
      lockedReason: s.lockedReason,
      review: s.review,
      warnings: s.warnings,
      trace: s.trace,
      why: s.why,
    },
  };
}

function validationError(res: Response, error: z.ZodError) {
  const first = error.issues[0];
  const where = first && first.path.length > 0 ? `${first.path.join('.')}: ` : '';
  return res.status(400).json({ error: `${where}${first?.message ?? 'Invalid request'}`, code: 'CARD_VALIDATION' });
}

function sendOk(res: Response, state: CatalogState, payload: Record<string, unknown>) {
  return res.json({ success: true, catalogReady: state.catalogReady, dataAsOf: state.dataAsOf, ...payload, data: payload });
}

function sendServerError(res: Response, label: string, err: unknown) {
  console.error(`[cardCatalog] ${label} error:`, err instanceof Error ? err.message : err);
  return res.status(500).json({ error: 'Card lookup is not available right now.', code: 'CARD_CATALOG_ERROR' });
}

export function createCardCatalogHandlers(overrides: Partial<CardCatalogControllerDeps> = {}) {
  const deps: CardCatalogControllerDeps = {
    getDb: overrides.getDb ?? getCatalogDb,
    getEnv: overrides.getEnv ?? (() => process.env),
    now: overrides.now ?? (() => new Date()),
    priceBook: overrides.priceBook,
  };

  const state = () => loadCatalogState(deps.getDb, deps.getEnv());

  const getVocabulary = async (_req: AuthRequest, res: Response) => {
    try {
      return sendOk(res, await state(), getCatalogVocabulary() as unknown as Record<string, unknown>);
    } catch (err) {
      return sendServerError(res, 'vocabulary', err);
    }
  };

  const search = async (req: AuthRequest, res: Response) => {
    try {
      const parsed = searchQuerySchema.safeParse(req.query);
      if (!parsed.success) return validationError(res, parsed.error);
      const q = parsed.data;
      const hasName = normalizeCardName(q.q ?? '').length >= SEARCH_MIN_QUERY_CHARS;
      const hasSetNumber = !!(q.set && q.number);
      if (!hasName && !hasSetNumber) {
        return res.status(400).json({
          error: `Provide q (at least ${SEARCH_MIN_QUERY_CHARS} characters) or both set and number`,
          code: 'CARD_VALIDATION',
        });
      }
      const st = await state();
      const limit = clampSearchLimit(q.limit);
      if (!isGameServed(st, q.game as any)) return sendOk(res, st, { results: [], capped: false, limit });
      const found = await searchPrintings({ game: q.game as any, q: q.q, set: q.set, number: q.number, limit }, deps.getDb(), deps.getEnv());
      return sendOk(res, st, { results: found.results, capped: found.capped, limit });
    } catch (err) {
      return sendServerError(res, 'search', err);
    }
  };

  const resolve = async (req: AuthRequest, res: Response) => {
    try {
      const parsed = resolveBodySchema.safeParse(req.body);
      if (!parsed.success) return validationError(res, parsed.error);
      const refs = parsed.data.refs;
      const st = await state();
      const unmatched = (r: { ref: string }) => ({ ref: r.ref, status: 'UNMATCHED', candidates: [], truncated: false });
      if (!st.catalogReady) return sendOk(res, st, { results: refs.map(unmatched) });
      const served = refs.filter((r) => isGameServed(st, r.game as any));
      const resolved = served.length > 0 ? await resolveRefs(served as any, deps.getDb(), deps.getEnv()) : [];
      const byRef = new Map<object, unknown>();
      served.forEach((r, i) => byRef.set(r, resolved[i]));
      const results = refs.map((r) => byRef.get(r) ?? unmatched(r));
      return sendOk(res, st, { results });
    } catch (err) {
      return sendServerError(res, 'resolve', err);
    }
  };

  const suggestedPrice = async (req: AuthRequest, res: Response) => {
    try {
      const parsed = suggestedPriceQuerySchema.safeParse(req.query);
      if (!parsed.success) return validationError(res, parsed.error);
      const st = await state();
      if (!st.catalogReady) return sendOk(res, st, { printingId: parsed.data.printingId, printing: null, suggestion: null });
      const outcome = await suggestPriceForPrinting(parsed.data, deps.getDb(), deps.getEnv(), deps.now());
      if (!outcome.found) return res.status(404).json({ error: 'Printing not found', code: 'CARD_NOT_FOUND' });
      const s = outcome.suggestion;
      if (!s.ok && (s.code === 'INVALID_FINISH' || s.code === 'INVALID_CONDITION')) {
        return res.status(400).json({ error: s.message, code: 'CARD_VALIDATION' });
      }
      let suggestion: Record<string, unknown> = s as unknown as Record<string, unknown>;
      // ADR-140 section 12.1: the shop's price book answers when it is on; any other outcome keeps the catalog answer.
      const organizerId: string | null = req.user?.organizerProfile?.id ?? null;
      if (deps.priceBook && organizerId) {
        const q = parsed.data;
        const finish = (q.finish ?? 'NONFOIL').toUpperCase() || 'NONFOIL';
        const conditionCode = (q.conditionCode ?? 'NM').toUpperCase() || 'NM';
        let booked: PriceBookRouteOutcome | null = null;
        try {
          booked = await deps.priceBook.suggestForRoute({
            organizerId,
            itemId: q.itemId ? q.itemId : null,
            printing: outcome.printing,
            finish,
            conditionCode,
            language: (q.language ?? 'en').toLowerCase() || 'en',
            graded: Boolean((q.grader && q.grader.trim()) || (q.grade && q.grade.trim())),
            env: deps.getEnv(),
            now: deps.now(),
          });
        } catch (err) {
          console.error('[cardCatalog] price book dependency failed, using the catalog answer:', err instanceof Error ? err.message : err);
        }
        if (booked && booked.kind === 'ITEM_NOT_FOUND') {
          return res.status(404).json({ error: 'Item not found', code: 'CARD_NOT_FOUND' });
        }
        if (booked && booked.kind === 'ANSWER') {
          const shaped = suggestionFromBook(booked.suggestion, { finish, conditionCode }, deps.now());
          if (shaped) suggestion = shaped;
        }
      }
      if (outcome.catalogReference) suggestion = { ...suggestion, catalogReference: outcome.catalogReference };
      return sendOk(res, st, { printingId: parsed.data.printingId, printing: outcome.printing, suggestion });
    } catch (err) {
      return sendServerError(res, 'suggested-price', err);
    }
  };

  const status = async (_req: AuthRequest, res: Response) => {
    try {
      const st = await state();
      // `attribution` (the TCGdex copyright and MIT notice) appears only while CARD_CATALOG_TCGDEX_ENABLED is on.
      return sendOk(res, st, {
        enabled: st.enabled,
        readyGames: st.readyGames,
        sources: st.sources,
        ...(st.attributions && st.attributions.length > 0 ? { attribution: st.attributions } : {}),
      });
    } catch (err) {
      return sendServerError(res, 'status', err);
    }
  };

  return { getVocabulary, search, resolve, suggestedPrice, status };
}

/**
 * Handlers wired to the real database and process.env. The price book dependency is the real one; it answers nothing
 * (null) while CARD_PRICE_BOOK_ENABLED is off, so this wiring changes nothing until that flag is turned on.
 */
export const cardCatalogHandlers = createCardCatalogHandlers({ priceBook: createPriceBookRouteDep() });
