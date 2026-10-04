/**
 * Card catalog lookup API (ADR-134 section 3.4, batch B3).
 *
 * Routes (mounted at /api/cards by the wiring batch; see routes/cardCatalog.ts):
 *   GET  /vocabulary       games, finishes, condition codes, graders, grades, languages
 *   GET  /search           prefix search or exact set+number, capped at 20
 *   POST /resolve          up to 500 refs -> EXACT | AMBIGUOUS | UNMATCHED (used by intake)
 *   GET  /suggested-price  Suggested price block for one printing (computed, never stored)
 *   GET  /status           CardDataSource freshness for the UI banner
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
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import { CatalogDb, getCatalogDb } from '../services/cardCatalog/catalogStore';
import { EnvLike, CATALOG_GAMES } from '../services/cardCatalog/catalogConfig';
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

export interface CardCatalogControllerDeps {
  getDb: () => CatalogDb;
  getEnv: () => EnvLike;
  now: () => Date;
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
});

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
      const found = await searchPrintings({ game: q.game as any, q: q.q, set: q.set, number: q.number, limit }, deps.getDb());
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
      const resolved = served.length > 0 ? await resolveRefs(served as any, deps.getDb()) : [];
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
      return sendOk(res, st, { printingId: parsed.data.printingId, printing: outcome.printing, suggestion: s });
    } catch (err) {
      return sendServerError(res, 'suggested-price', err);
    }
  };

  const status = async (_req: AuthRequest, res: Response) => {
    try {
      const st = await state();
      return sendOk(res, st, { enabled: st.enabled, readyGames: st.readyGames, sources: st.sources });
    } catch (err) {
      return sendServerError(res, 'status', err);
    }
  };

  return { getVocabulary, search, resolve, suggestedPrice, status };
}

/** Handlers wired to the real database and process.env. */
export const cardCatalogHandlers = createCardCatalogHandlers();
