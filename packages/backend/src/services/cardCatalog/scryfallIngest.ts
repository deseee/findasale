/**
 * Scryfall bulk ingest for MTG (ADR-134 section 3.3, batch B3).
 *
 * Rules re-verified against the official docs on 2026-10-03:
 *  - https://scryfall.com/docs/api : every request to api.scryfall.com carries an accurate
 *    User-Agent and an Accept header; cache downloaded data at least 24 hours; no paywalling,
 *    repackaging or proxying of the data; no implying Scryfall endorsement.
 *  - https://scryfall.com/docs/api/bulk-data : bulk files are gzipped JSONL (.jsonl.gz), listed by
 *    GET https://api.scryfall.com/bulk-data (fields updated_at, jsonl_download_uri,
 *    compressed_size); collected every 12-24 hours; bulk prices are "dangerously stale after 24
 *    hours" and "not updated frequently enough to power a storefront or sales system", so prices
 *    are only ever a Suggested estimate with an as-of date.
 *  - https://scryfall.com/docs/api/rate-limits : 10 requests per second for ordinary endpoints,
 *    2 per second for /cards/search|named|random|collection; an HTTP 429 limits access for 30
 *    seconds and must not be ignored; downloads from *.scryfall.io are not rate limited.
 *
 * This job therefore makes exactly two kinds of request per run: one GET /bulk-data (a 10 per
 * second endpoint) and one file download from data.scryfall.io. It never calls /cards/*.
 *
 * Streaming: gunzip -> line splitter -> 1,000-row batches. The file is never buffered.
 * A run that fails leaves the previously stored rows in place (the job only upserts).
 */
import * as zlib from 'zlib';
import type { CatalogStore, IngestResult, PriceRow, PrintingRow } from './types';
import { getUserAgent } from './catalogConfig';
import {
  assertAllowedUrl,
  assertOk,
  buildHeaders,
  getJson,
  iterateLines,
  nodeHttpGet,
} from './httpClient';
import { checkDbSpaceOrSkip, defaultAlert, defaultSleep, emptyResult, failRun, IngestDeps } from './ingestCommon';
import { normalizeCardName, parsePrice, toIntOrNull, yearFromDate } from './normalize';
import { createPrismaCatalogStore } from './catalogStore';

export const SCRYFALL_BULK_DATA_URL = 'https://api.scryfall.com/bulk-data';
export const SCRYFALL_BULK_TYPE = 'default_cards';
export const SCRYFALL_BATCH_SIZE = 1000;
/** A bulk file with more unparseable lines than this is treated as corrupt. */
export const SCRYFALL_MAX_BAD_LINES = 50;

const FINISH_MAP: Record<string, string> = { nonfoil: 'NONFOIL', foil: 'FOIL', etched: 'ETCHED' };

function imageUrl(card: any, size: 'small' | 'normal'): string | null {
  const direct = card?.image_uris?.[size];
  if (typeof direct === 'string' && direct) return direct;
  const face = Array.isArray(card?.card_faces) ? card.card_faces[0]?.image_uris?.[size] : null;
  return typeof face === 'string' && face ? face : null;
}

/**
 * Maps one Scryfall card object (default_cards) to a catalog row and its price row.
 * Returns null for objects a card shop never sells: non-cards, digital-only cards (no paper
 * printing) and art series cards. Language variants are not rows (default_cards is one printing
 * per card in English, or in its only printed language); language lives on ItemCard.
 */
export function mapScryfallCard(card: any, snapshotAt: Date): { printing: PrintingRow; price: PriceRow | null } | null {
  if (!card || typeof card !== 'object') return null;
  if (card.object !== undefined && card.object !== 'card') return null;
  if (typeof card.id !== 'string' || !card.id || typeof card.name !== 'string' || !card.name) return null;
  if (typeof card.set !== 'string' || !card.set) return null;
  if (card.digital === true) return null;
  if (Array.isArray(card.games) && card.games.length > 0 && !card.games.includes('paper')) return null;
  if (card.layout === 'art_series') return null;

  const finishes = (Array.isArray(card.finishes) ? card.finishes : [])
    .map((f: unknown) => FINISH_MAP[String(f)])
    .filter((f: string | undefined): f is string => !!f);

  const id = `SCRYFALL:${card.id}`;
  const printing: PrintingRow = {
    id,
    source: 'SCRYFALL',
    game: 'MTG',
    name: card.name,
    nameNorm: normalizeCardName(card.name),
    setCode: String(card.set).toLowerCase(),
    setName: typeof card.set_name === 'string' && card.set_name ? card.set_name : null,
    collectorNumber: card.collector_number !== undefined && card.collector_number !== null ? String(card.collector_number) : null,
    language: typeof card.lang === 'string' && card.lang ? card.lang : null,
    rarity: typeof card.rarity === 'string' && card.rarity ? card.rarity : null,
    releaseYear: yearFromDate(card.released_at),
    finishes,
    scryfallId: card.id,
    tcgplayerProductId: toIntOrNull(card.tcgplayer_id),
    cardmarketId: toIntOrNull(card.cardmarket_id),
    imageSmallUrl: imageUrl(card, 'small'),
    imageNormalUrl: imageUrl(card, 'normal'),
  };

  const prices = card.prices ?? {};
  const usd = parsePrice(prices.usd);
  const usdFoil = parsePrice(prices.usd_foil);
  const usdEtched = parsePrice(prices.usd_etched);
  const price: PriceRow = { printingId: id, usd, usdFoil, usdEtched, usdReverse: null, asOf: snapshotAt };
  return { printing, price };
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

async function flush(
  store: CatalogStore,
  printings: Map<string, PrintingRow>,
  prices: Map<string, PriceRow>,
  result: IngestResult,
): Promise<void> {
  if (printings.size === 0) return;
  result.printingsChanged += await store.upsertPrintings(Array.from(printings.values()));
  result.pricesChanged += await store.upsertPrices(Array.from(prices.values()));
  printings.clear();
  prices.clear();
}

/**
 * Runs one Scryfall refresh. Never throws: every failure is recorded in CardDataSource and
 * returned as status 'FAILED'.
 */
export async function runScryfallIngest(overrides: Partial<IngestDeps> = {}): Promise<IngestResult> {
  const deps = resolveDeps(overrides);
  const { store, httpGet, now } = deps;
  const result = emptyResult('SCRYFALL');
  try {
    // 1. Database-space guard, before any network call.
    const skipped = await checkDbSpaceOrSkip('SCRYFALL', deps);
    if (skipped) return skipped;

    const headers = buildHeaders(getUserAgent(deps.env));

    // 2. Discover the current file (one call to a 10 per second endpoint).
    const listing = await getJson<{ data?: any[] }>(httpGet, SCRYFALL_BULK_DATA_URL, headers);
    const entry = (listing.data ?? []).find((o: any) => o && o.type === SCRYFALL_BULK_TYPE);
    if (!entry) throw new Error(`Bulk listing has no ${SCRYFALL_BULK_TYPE} entry`);
    const downloadUrl: unknown = entry.jsonl_download_uri ?? entry.download_uri;
    const version: unknown = entry.updated_at;
    if (typeof downloadUrl !== 'string' || !downloadUrl) throw new Error('Bulk entry has no jsonl_download_uri');
    if (typeof version !== 'string' || !version) throw new Error('Bulk entry has no updated_at');
    assertAllowedUrl(downloadUrl);

    // 3. Skip when the stored version is already current.
    const current = await store.getSource('SCRYFALL');
    if (current?.sourceVersion === version) {
      await store.recordRun('SCRYFALL', { status: 'SKIPPED_UNCHANGED', now: now(), sourceVersion: version, rowsUpserted: 0 });
      return { ...result, status: 'SKIPPED_UNCHANGED' };
    }
    const parsedVersion = new Date(version);
    const snapshotAt = Number.isNaN(parsedVersion.getTime()) ? now() : parsedVersion;

    // 4. Stream the file.
    const res = await httpGet(downloadUrl, headers);
    assertOk(res, downloadUrl);
    const gunzip = zlib.createGunzip();
    res.body.on('error', (e: Error) => gunzip.destroy(e));
    res.body.pipe(gunzip);

    const printings = new Map<string, PrintingRow>();
    const prices = new Map<string, PriceRow>();
    let badLines = 0;
    for await (const line of iterateLines(gunzip)) {
      let card: any;
      try {
        card = JSON.parse(line);
      } catch {
        badLines++;
        result.rowsSkipped++;
        if (badLines > SCRYFALL_MAX_BAD_LINES) throw new Error('Bulk file has too many unparseable lines');
        continue;
      }
      result.rowsRead++;
      const mapped = mapScryfallCard(card, snapshotAt);
      if (!mapped) {
        result.rowsSkipped++;
        continue;
      }
      printings.set(mapped.printing.id, mapped.printing);
      if (mapped.price) prices.set(mapped.printing.id, mapped.price);
      if (printings.size >= SCRYFALL_BATCH_SIZE) await flush(store, printings, prices, result);
    }
    await flush(store, printings, prices, result);

    if (result.rowsRead - result.rowsSkipped <= 0) throw new Error('Bulk file contained no usable cards');

    await store.recordRun('SCRYFALL', {
      status: 'OK',
      now: now(),
      sourceVersion: version,
      rowsUpserted: result.printingsChanged,
    });
    console.log(
      `[card-catalog] SCRYFALL ok: read=${result.rowsRead} skipped=${result.rowsSkipped} printingsChanged=${result.printingsChanged} pricesChanged=${result.pricesChanged}`,
    );
    return result;
  } catch (err) {
    return failRun('SCRYFALL', deps, err, result);
  }
}
