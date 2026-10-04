/**
 * TCGCSV ingest for Pokemon and Yu-Gi-Oh (ADR-134 section 3.3, batch B3). OFF by default: it only
 * runs when CARD_CATALOG_GAMES lists POKEMON or YUGIOH, which waits on legal decision D2
 * (TCGCSV publishes no terms page and its data originates from TCGplayer).
 *
 * Verified live on 2026-10-03 (read-only GETs of public JSON):
 *  - GET https://tcgcsv.com/last-updated.txt -> '2026-10-03T20:05:38+0000'
 *  - GET /tcgplayer/categories: Magic 1, YuGiOh 2, Pokemon 3
 *  - GET /tcgplayer/{cat}/groups -> {success, errors, results:[{groupId,name,abbreviation,
 *    isSupplemental,publishedOn,modifiedOn,categoryId}]} (Pokemon 220 groups, Yu-Gi-Oh 658)
 *  - GET /tcgplayer/{cat}/{group}/products -> results[].{productId,name,imageUrl,extendedData:
 *    [{name:'Number',value:'001/102'},{name:'Rarity',...}]}; sealed products have no Number
 *  - GET /tcgplayer/{cat}/{group}/prices -> results[].{productId,marketPrice,subTypeName,...}
 *    Pokemon sub-types seen: Normal, Holofoil, Reverse Holofoil. Yu-Gi-Oh sub-types seen:
 *    Unlimited, 1st Edition (an edition, not a finish; see SUB_TYPE_MAP).
 *
 * Etiquette: identifiable User-Agent, 250 ms between requests (the site's FAQ example sleeps
 * 0.25 s), one retry for a network error or HTTP 5xx, none for HTTP 429 (the run stops).
 * Products are re-fetched only for groups modified since the last success (with a 24 hour margin)
 * or not yet loaded; prices are fetched for every group on every run.
 */
import type { IngestResult, PriceRow, PrintingRow } from './types';
import { TCGCSV_CATEGORY_IDS, getEnabledGames, getUserAgent } from './catalogConfig';
import { HttpStatusError, RateLimitedError, buildHeaders, getJson, getText, nodeHttpGet } from './httpClient';
import { checkDbSpaceOrSkip, defaultAlert, defaultSleep, emptyResult, failRun, IngestDeps } from './ingestCommon';
import { normalizeCardName, parsePrice, parseSourceVersionDate, yearFromDate } from './normalize';
import { createPrismaCatalogStore } from './catalogStore';

export const TCGCSV_BASE_URL = 'https://tcgcsv.com';
export const TCGCSV_REQUEST_SPACING_MS = 250;
export const TCGCSV_BATCH_SIZE = 1000;
const PRODUCT_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 1000;

type PriceField = 'usd' | 'usdFoil' | 'usdReverse';
type TcgGame = 'POKEMON' | 'YUGIOH';

/**
 * Which TCGCSV sub-type fills which price column, and the finish it implies. Anything not listed
 * is counted in the job log and not stored. Pokemon follows the ADR. For Yu-Gi-Oh only
 * 'Unlimited' is stored: '1st Edition' is an edition with a different value, not a finish, and
 * the finish model cannot hold it (DECISION NEEDED, see the batch handoff).
 */
export const SUB_TYPE_MAP: Record<TcgGame, Record<string, { field: PriceField; finish: string }>> = {
  POKEMON: {
    Normal: { field: 'usd', finish: 'NONFOIL' },
    Holofoil: { field: 'usdFoil', finish: 'HOLO' },
    'Reverse Holofoil': { field: 'usdReverse', finish: 'REVERSE_HOLO' },
  },
  YUGIOH: {
    Unlimited: { field: 'usd', finish: 'NONFOIL' },
  },
};

export interface TcgGroup {
  groupId: number;
  name: string;
  abbreviation: string | null;
  isSupplemental: boolean;
  publishedOn: string | null;
  modifiedOn: string | null;
}

export function groupSetCode(group: TcgGroup): string {
  const abbr = String(group.abbreviation ?? '').trim().toLowerCase();
  return abbr || `g${group.groupId}`;
}

function extended(product: any, name: string): string | null {
  const list = Array.isArray(product?.extendedData) ? product.extendedData : [];
  const hit = list.find((e: any) => e && e.name === name);
  const v = hit && hit.value !== undefined && hit.value !== null ? String(hit.value).trim() : '';
  return v || null;
}

/**
 * Maps a TCGCSV product to a catalog row. Products without a Number are sealed or accessory
 * products and return null. Supplemental groups carry a refresh timestamp in publishedOn, not a
 * release date, so their releaseYear is null (ADR section 2.6).
 */
export function mapTcgcsvProduct(game: TcgGame, group: TcgGroup, product: any, finishes: string[]): PrintingRow | null {
  const productId = Number(product?.productId);
  if (!Number.isInteger(productId) || productId <= 0) return null;
  const name = typeof product?.name === 'string' ? product.name.trim() : '';
  if (!name) return null;
  const number = extended(product, 'Number');
  if (!number) return null;
  const image = typeof product?.imageUrl === 'string' && product.imageUrl ? product.imageUrl : null;
  return {
    id: `TCGCSV:${productId}`,
    source: 'TCGCSV',
    game,
    name,
    nameNorm: normalizeCardName(name),
    setCode: groupSetCode(group),
    setName: group.name || null,
    collectorNumber: number,
    language: 'en',
    rarity: extended(product, 'Rarity'),
    releaseYear: group.isSupplemental ? null : yearFromDate(group.publishedOn),
    finishes,
    scryfallId: null,
    tcgplayerProductId: productId,
    cardmarketId: null,
    imageSmallUrl: image,
    imageNormalUrl: image,
  };
}

export interface PriceMap {
  prices: Map<number, { usd: string | null; usdFoil: string | null; usdReverse: string | null }>;
  finishes: Map<number, string[]>;
}

/** Folds a /prices result list into one price block and finish list per product. */
export function buildPriceMap(game: TcgGame, results: any[], unmapped: Map<string, number>): PriceMap {
  const map: PriceMap = { prices: new Map(), finishes: new Map() };
  const subTypes = SUB_TYPE_MAP[game];
  for (const row of results) {
    const productId = Number(row?.productId);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    const subType = String(row?.subTypeName ?? '');
    const target = subTypes[subType];
    if (!target) {
      const key = `${game}:${subType || '(none)'}`;
      unmapped.set(key, (unmapped.get(key) ?? 0) + 1);
      continue;
    }
    const block = map.prices.get(productId) ?? { usd: null, usdFoil: null, usdReverse: null };
    block[target.field] = parsePrice(row.marketPrice);
    map.prices.set(productId, block);
    const fin = map.finishes.get(productId) ?? [];
    if (!fin.includes(target.finish)) fin.push(target.finish);
    map.finishes.set(productId, fin);
  }
  return map;
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

function parseGroups(payload: any): TcgGroup[] {
  if (!payload || payload.success === false || !Array.isArray(payload.results)) {
    throw new Error('Unexpected TCGCSV groups response');
  }
  const out: TcgGroup[] = [];
  for (const g of payload.results) {
    const groupId = Number(g?.groupId);
    if (!Number.isInteger(groupId) || groupId <= 0) continue;
    out.push({
      groupId,
      name: typeof g.name === 'string' ? g.name : '',
      abbreviation: typeof g.abbreviation === 'string' ? g.abbreviation : null,
      isSupplemental: g.isSupplemental === true,
      publishedOn: typeof g.publishedOn === 'string' ? g.publishedOn : null,
      modifiedOn: typeof g.modifiedOn === 'string' ? g.modifiedOn : null,
    });
  }
  return out;
}

function modifiedMs(group: TcgGroup): number | null {
  if (!group.modifiedOn) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(group.modifiedOn);
  const ms = new Date(hasZone ? group.modifiedOn : `${group.modifiedOn}Z`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Runs one TCGCSV refresh for the enabled games. Returns status 'DISABLED' (and touches nothing)
 * when neither POKEMON nor YUGIOH is enabled. Never throws.
 */
export async function runTcgcsvIngest(overrides: Partial<IngestDeps> = {}): Promise<IngestResult> {
  const deps = resolveDeps(overrides);
  const { store, httpGet, now, sleep, env } = deps;
  const games = getEnabledGames(env).filter((g): g is TcgGame => g === 'POKEMON' || g === 'YUGIOH');
  if (games.length === 0) return { ...emptyResult('TCGCSV'), status: 'DISABLED' };

  const result = emptyResult('TCGCSV');
  const unmapped = new Map<string, number>();
  try {
    const skipped = await checkDbSpaceOrSkip('TCGCSV', deps);
    if (skipped) return skipped;

    const headers = buildHeaders(getUserAgent(env));
    let requests = 0;
    const spaced = async <T>(fn: () => Promise<T>): Promise<T> => {
      if (requests > 0) await sleep(TCGCSV_REQUEST_SPACING_MS);
      requests++;
      return fn();
    };
    const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof RateLimitedError) throw err;
        if (err instanceof HttpStatusError && err.status < 500) throw err;
        await sleep(RETRY_DELAY_MS);
        return fn();
      }
    };
    const fetchJson = (url: string) => spaced(() => withRetry(() => getJson<any>(httpGet, url, headers)));

    const lastUpdated = (await spaced(() => withRetry(() => getText(httpGet, `${TCGCSV_BASE_URL}/last-updated.txt`, headers)))).trim();
    if (!lastUpdated) throw new Error('TCGCSV last-updated.txt was empty');
    const version = `${lastUpdated}|${games.join(',')}`;
    const current = await store.getSource('TCGCSV');
    if (current?.sourceVersion === version) {
      await store.recordRun('TCGCSV', { status: 'SKIPPED_UNCHANGED', now: now(), sourceVersion: version, rowsUpserted: 0 });
      return { ...result, status: 'SKIPPED_UNCHANGED' };
    }
    const snapshotAt = parseSourceVersionDate(version) ?? now();
    const refetchBefore = current?.lastSuccessAt ? current.lastSuccessAt.getTime() - PRODUCT_REFRESH_MARGIN_MS : null;

    let groupCount = 0;
    for (const game of games) {
      const category = TCGCSV_CATEGORY_IDS[game];
      const groups = parseGroups(await fetchJson(`${TCGCSV_BASE_URL}/tcgplayer/${category}/groups`));
      const loaded = await store.loadedSetCodes(game);
      for (const group of groups) {
        groupCount++;
        const setCode = groupSetCode(group);
        const mod = modifiedMs(group);
        const needProducts = refetchBefore === null || mod === null || mod > refetchBefore || !loaded.has(setCode);

        const pricePayload = await fetchJson(`${TCGCSV_BASE_URL}/tcgplayer/${category}/${group.groupId}/prices`);
        const priceMap = buildPriceMap(game, Array.isArray(pricePayload?.results) ? pricePayload.results : [], unmapped);

        if (needProducts) {
          const productPayload = await fetchJson(`${TCGCSV_BASE_URL}/tcgplayer/${category}/${group.groupId}/products`);
          const products: any[] = Array.isArray(productPayload?.results) ? productPayload.results : [];
          const rows: PrintingRow[] = [];
          for (const product of products) {
            result.rowsRead++;
            const row = mapTcgcsvProduct(game, group, product, priceMap.finishes.get(Number(product?.productId)) ?? []);
            if (row) rows.push(row);
            else result.rowsSkipped++;
          }
          for (const part of chunk(rows, TCGCSV_BATCH_SIZE)) result.printingsChanged += await store.upsertPrintings(part);
        } else {
          const updates = Array.from(priceMap.finishes.entries()).map(([productId, finishes]) => ({
            id: `TCGCSV:${productId}`,
            finishes,
          }));
          for (const part of chunk(updates, TCGCSV_BATCH_SIZE)) result.printingsChanged += await store.updateFinishes(part);
        }

        const priceRows: PriceRow[] = Array.from(priceMap.prices.entries()).map(([productId, block]) => ({
          printingId: `TCGCSV:${productId}`,
          usd: block.usd,
          usdFoil: block.usdFoil,
          usdEtched: null,
          usdReverse: block.usdReverse,
          asOf: snapshotAt,
        }));
        for (const part of chunk(priceRows, TCGCSV_BATCH_SIZE)) result.pricesChanged += await store.upsertPrices(part);
      }
    }

    result.detail = { groups: groupCount, requests, unmappedSubTypes: Object.fromEntries(unmapped) };
    await store.recordRun('TCGCSV', { status: 'OK', now: now(), sourceVersion: version, rowsUpserted: result.printingsChanged });
    console.log(
      `[card-catalog] TCGCSV ok: groups=${groupCount} requests=${requests} printingsChanged=${result.printingsChanged} pricesChanged=${result.pricesChanged} unmapped=${JSON.stringify(Object.fromEntries(unmapped))}`,
    );
    return result;
  } catch (err) {
    result.detail = { unmappedSubTypes: Object.fromEntries(unmapped) };
    return failRun('TCGCSV', deps, err, result);
  }
}
