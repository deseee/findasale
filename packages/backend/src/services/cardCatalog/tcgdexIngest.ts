/**
 * TCGdex ingest for Pokemon IDENTITY data (card name, set, collector number, rarity, print
 * variants). OFF by default: it runs only when CARD_CATALOG_ENABLED and
 * CARD_CATALOG_TCGDEX_ENABLED are both true.
 *
 * Source: github.com/tcgdex/cards-database (MIT license, see tcgdexAttribution.ts and
 * NOTICE-tcgdex.md). Verified 2026-10-12: the repository has no releases and publishes no JSON
 * export; its sets and cards are TypeScript modules under data/ (and data-asia/ for Japanese,
 * Korean and Chinese), laid out as data/<Series>/<Set>.ts and data/<Series>/<Set>/<localId>.ts.
 * So production obtains the data like this, in a single request per run:
 *   1. GET https://codeload.github.com/tcgdex/cards-database/tar.gz/<pinned commit>   (gzip tar)
 *   2. gunzip -> streaming tar reader (tcgdexTarReader.ts) -> only data/ and data-asia/ .ts files
 *   3. each file is read by the restricted literal reader (tcgdexLiteralParser.ts), which never
 *      executes the code -> pure mapping (tcgdexMap.ts) -> upsert through CatalogStore.
 * It does NOT call api.tcgdex.net (whose responses add TCGplayer and Cardmarket prices), and it
 * never reads thirdParty ids, prices or images from the files (see tcgdexMap.ts).
 *
 * Etiquette and safety:
 *  - one archive download per run, and none at all when the pinned ref and language list are
 *    unchanged since the last complete run (sourceVersion); the ref is a commit id or tag, never a
 *    moving branch
 *  - identifiable User-Agent; HTTP 429 or any error stops the run, no retry
 *  - database-space guard exactly like the Scryfall job (DB_SOFT_LIMIT_MB), checked before any
 *    network call and again every TCGDEX_SPACE_CHECK_EVERY_SETS sets
 *  - sets are written one at a time, so a failing set is recorded and the run continues; a file
 *    the reader cannot handle is skipped and counted, and a run where too many are unreadable
 *    fails as a whole
 *  - the job only upserts: a failed run leaves the previous rows serving
 */
import * as zlib from 'zlib';
import type { IngestResult, PrintingRow } from './types';
import {
  TCGDEX_ASIAN_LANGUAGE_CODES,
  TCGDEX_REPO_NAME,
  TCGDEX_REPO_OWNER,
  getTcgdexLanguages,
  getTcgdexRef,
  getUserAgent,
  isAcceptableTcgdexRef,
  isCatalogEnabled,
  isTcgdexEnabled,
} from './catalogConfig';
import { assertAllowedUrl, assertOk, buildHeaders, nodeHttpGet } from './httpClient';
import { checkDbSpaceOrSkip, defaultAlert, defaultSleep, emptyResult, failRun, IngestDeps } from './ingestCommon';
import { createPrismaCatalogStore } from './catalogStore';
import { parseTcgdexDataFile } from './tcgdexLiteralParser';
import { TcgdexSetMeta, assertIdentityOnly, mapTcgdexCard, readSetMeta } from './tcgdexMap';
import { DEFAULT_TAR_LIMITS, TarLimits, iterateTar } from './tcgdexTarReader';

export const TCGDEX_BATCH_SIZE = 1000;
/** The database-space guard is repeated after every this many sets. */
export const TCGDEX_SPACE_CHECK_EVERY_SETS = 25;
/** A run where more than this share of card files cannot be read is treated as a broken source. */
export const TCGDEX_MAX_UNREADABLE_RATIO = 0.05;
/** Cards held back while waiting for their set file (the archive lists a set file before its cards). */
const MAX_PENDING_CARDS_PER_SET = 5000;
const MAX_LISTED_PROBLEM_SETS = 20;

export function tcgdexArchiveUrl(ref: string): string {
  return `https://codeload.github.com/${TCGDEX_REPO_OWNER}/${TCGDEX_REPO_NAME}/tar.gz/${encodeURIComponent(ref)}`;
}

export type TcgdexFamily = 'data' | 'data-asia';

export interface TcgdexPathInfo {
  kind: 'set' | 'card';
  family: TcgdexFamily;
  /** 'data/<Series>/<Set>' for both the set file and its card folder. */
  setDir: string;
  /** Card file name without '.ts'; null for a set file. */
  localId: string | null;
}

/**
 * Classifies an archive path (the first segment is the repository folder, for example
 * 'cards-database-<sha>'). Only data/<Series>/<Set>.ts and data/<Series>/<Set>/<card>.ts (and the
 * same under data-asia/) are of interest; everything else returns null.
 */
export function classifyTcgdexPath(path: string): TcgdexPathInfo | null {
  const segs = path.split('/');
  if (segs.length < 4) return null;
  if (segs.some((s) => s === '' || s === '.' || s === '..')) return null;
  const rel = segs.slice(1);
  const family = rel[0];
  if (family !== 'data' && family !== 'data-asia') return null;
  const last = rel[rel.length - 1];
  if (!last.endsWith('.ts') || last.length <= 3) return null;
  const stem = last.slice(0, -3);
  if (rel.length === 3) return { kind: 'set', family, setDir: `${rel[0]}/${rel[1]}/${stem}`, localId: null };
  if (rel.length === 4) return { kind: 'card', family, setDir: `${rel[0]}/${rel[1]}/${rel[2]}`, localId: stem };
  return null;
}

export interface TcgdexProgress {
  setsSeen: number;
  setsUpserted: number;
  setsFailed: number;
  cardsRead: number;
  printingsChanged: number;
}

export interface TcgdexIngestOverrides extends Partial<IngestDeps> {
  onProgress?: (progress: TcgdexProgress) => void;
  limits?: TarLimits;
}

function resolveDeps(overrides: Partial<IngestDeps>): IngestDeps {
  return {
    store: overrides.store ?? createPrismaCatalogStore(),
    httpGet: overrides.httpGet ?? nodeHttpGet,
    now: overrides.now ?? (() => new Date()),
    env: overrides.env ?? process.env,
    alert: overrides.alert ?? defaultAlert,
    sleep: overrides.sleep ?? defaultSleep,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface SetState {
  family: TcgdexFamily;
  meta: TcgdexSetMeta | 'BAD' | null;
  pending: Array<{ localId: string; text: string }>;
  rows: Map<string, PrintingRow>;
}

/**
 * Runs one TCGdex refresh. Returns status 'DISABLED' (and touches nothing: no store, no network)
 * unless both CARD_CATALOG_ENABLED and CARD_CATALOG_TCGDEX_ENABLED are on. Never throws: every
 * failure is recorded in CardDataSource and returned as status 'FAILED'.
 */
export async function runTcgdexIngest(overrides: TcgdexIngestOverrides = {}): Promise<IngestResult> {
  const envForGate = overrides.env ?? process.env;
  if (!isCatalogEnabled(envForGate) || !isTcgdexEnabled(envForGate)) {
    return { ...emptyResult('TCGDEX'), status: 'DISABLED' };
  }

  const deps = resolveDeps(overrides);
  const { store, httpGet, now, env } = deps;
  const result = emptyResult('TCGDEX');
  const limits = overrides.limits ?? DEFAULT_TAR_LIMITS;

  const stats = {
    setsSeen: new Set<string>(),
    setsFlushed: 0,
    setsUpserted: 0,
    setsFailed: [] as string[],
    badSets: [] as string[],
    parseFailures: 0,
    noSetMeta: 0,
    languageMissing: 0,
    unmapped: new Map<string, number>(),
  };

  try {
    // 1. Settings that make a run reproducible.
    const ref = getTcgdexRef(env);
    if (!isAcceptableTcgdexRef(ref)) {
      throw new Error('CARD_CATALOG_TCGDEX_REF must be a commit id or a tag, not a moving branch name');
    }
    const langs = getTcgdexLanguages(env);
    const intlLangs = langs.filter((l) => !TCGDEX_ASIAN_LANGUAGE_CODES.includes(l));
    const asiaLangs = langs.filter((l) => TCGDEX_ASIAN_LANGUAGE_CODES.includes(l));
    const langsFor = (family: TcgdexFamily): string[] => (family === 'data' ? intlLangs : asiaLangs);
    const version = `tcgdex:${ref}|${langs.join(',')}`;

    // 2. Database-space guard, before any network call (same helper as the Scryfall job).
    const skipped = await checkDbSpaceOrSkip('TCGDEX', deps);
    if (skipped) return skipped;

    // 3. Nothing to do when this exact ref and language list was already loaded completely.
    const current = await store.getSource('TCGDEX');
    if (current?.sourceVersion === version) {
      await store.recordRun('TCGDEX', { status: 'SKIPPED_UNCHANGED', now: now(), sourceVersion: version, rowsUpserted: 0 });
      return { ...result, status: 'SKIPPED_UNCHANGED' };
    }

    // 4. One download of the pinned archive, streamed.
    const url = tcgdexArchiveUrl(ref);
    assertAllowedUrl(url);
    const headers = buildHeaders(getUserAgent(env), 'application/gzip, application/x-gzip;q=0.9, */*;q=0.5');
    const res = await httpGet(url, headers);
    assertOk(res, url);
    const gunzip = zlib.createGunzip();
    res.body.on('error', (e: Error) => gunzip.destroy(e));
    res.body.pipe(gunzip);

    const metaByDir = new Map<string, TcgdexSetMeta | 'BAD'>();
    const states = new Map<string, SetState>();

    const progress = (): void => {
      if (!overrides.onProgress) return;
      overrides.onProgress({
        setsSeen: stats.setsSeen.size,
        setsUpserted: stats.setsUpserted,
        setsFailed: stats.setsFailed.length,
        cardsRead: result.rowsRead,
        printingsChanged: result.printingsChanged,
      });
    };

    const getState = (dir: string, family: TcgdexFamily): SetState => {
      let st = states.get(dir);
      if (!st) {
        st = { family, meta: metaByDir.get(dir) ?? null, pending: [], rows: new Map<string, PrintingRow>() };
        states.set(dir, st);
        stats.setsSeen.add(dir);
      }
      return st;
    };

    const skipUnreadable = (): void => {
      result.rowsRead++;
      result.rowsSkipped++;
      stats.noSetMeta++;
    };

    const handleCard = (st: SetState, localId: string, text: string): void => {
      const meta = st.meta;
      if (meta === null || meta === 'BAD') {
        skipUnreadable();
        return;
      }
      result.rowsRead++;
      let card: Record<string, unknown>;
      try {
        card = parseTcgdexDataFile(text);
      } catch {
        stats.parseFailures++;
        result.rowsSkipped++;
        return;
      }
      let produced = false;
      for (const lang of langsFor(st.family)) {
        const mapped = mapTcgdexCard({ set: meta, localId, card, lang });
        if (!mapped) continue;
        for (const row of mapped.rows) st.rows.set(row.id, row);
        for (const note of mapped.notes) stats.unmapped.set(note, (stats.unmapped.get(note) ?? 0) + 1);
        produced = true;
      }
      if (!produced) {
        stats.languageMissing++;
        result.rowsSkipped++;
      }
    };

    const handleSet = (dir: string, family: TcgdexFamily, text: string): void => {
      const st = getState(dir, family);
      let meta: TcgdexSetMeta | 'BAD';
      try {
        meta = readSetMeta(parseTcgdexDataFile(text)) ?? 'BAD';
      } catch {
        meta = 'BAD';
      }
      if (meta === 'BAD' && stats.badSets.length < MAX_LISTED_PROBLEM_SETS) stats.badSets.push(dir);
      metaByDir.set(dir, meta);
      st.meta = meta;
      const waiting = st.pending;
      st.pending = [];
      for (const p of waiting) handleCard(st, p.localId, p.text);
    };

    const finishSet = async (dir: string): Promise<void> => {
      const st = states.get(dir);
      if (!st) return;
      states.delete(dir);
      for (let i = 0; i < st.pending.length; i++) skipUnreadable();
      stats.setsFlushed++;
      const rows = Array.from(st.rows.values());
      if (rows.length > 0) {
        try {
          for (const row of rows) assertIdentityOnly(row);
          for (const part of chunk(rows, TCGDEX_BATCH_SIZE)) result.printingsChanged += await store.upsertPrintings(part);
          stats.setsUpserted++;
        } catch (err) {
          if (stats.setsFailed.length < MAX_LISTED_PROBLEM_SETS) stats.setsFailed.push(dir);
          console.error(`[card-catalog] TCGDEX set ${dir} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      progress();
    };

    const buildDetail = (): Record<string, unknown> => ({
      ref,
      languages: langs,
      sets: stats.setsSeen.size,
      setsUpserted: stats.setsUpserted,
      setsFailed: stats.setsFailed,
      unreadableSets: stats.badSets,
      unreadableCards: stats.parseFailures,
      cardsWithoutSet: stats.noSetMeta,
      cardsNotInRequestedLanguages: stats.languageMissing,
      unmappedVariantNotes: Object.fromEntries(stats.unmapped),
    });

    const wants = (path: string): boolean => {
      const info = classifyTcgdexPath(path);
      return info !== null && langsFor(info.family).length > 0;
    };

    try {
      let currentDir: string | null = null;
      for await (const file of iterateTar(gunzip, wants, limits)) {
        const info = classifyTcgdexPath(file.path);
        if (!info) continue;
        if (currentDir !== null && info.setDir !== currentDir) {
          await finishSet(currentDir);
          if (stats.setsFlushed % TCGDEX_SPACE_CHECK_EVERY_SETS === 0) {
            const stop = await checkDbSpaceOrSkip('TCGDEX', deps);
            if (stop) return { ...result, status: 'SKIPPED_DB_SPACE', error: stop.error, detail: buildDetail() };
          }
        }
        currentDir = info.setDir;
        const text = file.data.toString('utf8');
        if (info.kind === 'set') {
          handleSet(info.setDir, info.family, text);
        } else {
          const st = getState(info.setDir, info.family);
          const localId = info.localId ?? '';
          if (st.meta === null) {
            if (st.pending.length < MAX_PENDING_CARDS_PER_SET) st.pending.push({ localId, text });
            else skipUnreadable();
          } else {
            handleCard(st, localId, text);
          }
        }
      }
      if (currentDir !== null) await finishSet(currentDir);
      for (const dir of Array.from(states.keys())) await finishSet(dir);
    } finally {
      gunzip.destroy();
      res.body.destroy();
    }

    result.detail = buildDetail();

    // 5. A source that has mostly stopped parsing, or yielded nothing, is a failure, not a success.
    const unreadable = stats.parseFailures + stats.noSetMeta;
    if (result.rowsRead > 0 && unreadable / result.rowsRead > TCGDEX_MAX_UNREADABLE_RATIO) {
      throw new Error(`TCGdex archive: ${unreadable} of ${result.rowsRead} card files could not be read`);
    }
    if (result.rowsRead - result.rowsSkipped <= 0) throw new Error('TCGdex archive contained no usable cards');

    // 6. Record the run. A set that failed to write keeps the version unrecorded so the next run retries everything.
    const complete = stats.setsFailed.length === 0;
    await store.recordRun('TCGDEX', {
      status: 'OK',
      now: now(),
      sourceVersion: complete ? version : null,
      rowsUpserted: result.printingsChanged,
    });
    if (!complete) {
      deps.alert(`Card catalog TCGDEX refresh finished with ${stats.setsFailed.length} set(s) that could not be written: ${stats.setsFailed.slice(0, 5).join(', ')}`);
    }
    console.log(
      `[card-catalog] TCGDEX ok: ref=${ref} sets=${stats.setsSeen.size} cardFiles=${result.rowsRead} skipped=${result.rowsSkipped} printingsChanged=${result.printingsChanged} failedSets=${stats.setsFailed.length}`,
    );
    return result;
  } catch (err) {
    return failRun('TCGDEX', deps, err, result);
  }
}
