/**
 * Postgres persistence for the card catalog (ADR-134 sections 3.2 and 3.3).
 *
 * Writes use raw INSERT ... ON CONFLICT ... DO UPDATE ... WHERE <row differs>, so a row whose
 * values are unchanged is not rewritten at all (the measured dead-tuple cost in the ADR comes from
 * rewriting every row daily). The lockfile pins @prisma/client 5.22.0, which does have
 * createManyAndReturn, but it cannot express "update only when different", so raw SQL is used.
 *
 * The SQL below is constant text with bound parameters ($1..$n). No value is ever concatenated
 * into a statement. Every text column is passed as text[] with '' standing for NULL (NULLIF in
 * the SELECT), which avoids relying on NULL elements inside driver-serialized arrays.
 *
 * Importing this module does not load Prisma; the client is required lazily on first use.
 */
import type {
  CatalogGame,
  CatalogSourceId,
  CatalogStore,
  FinishUpdate,
  PriceRow,
  PrintingRow,
  RunRecord,
  SourceState,
} from './types';
import { truncate } from './normalize';

/** The slice of the Prisma client this layer uses. Tests pass a fake that matches it. */
export interface CatalogDb {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  cardPrinting: {
    findMany(args: any): Promise<any[]>;
    findUnique(args: any): Promise<any>;
  };
  cardDataSource: {
    findUnique(args: any): Promise<any>;
    findMany(args?: any): Promise<any[]>;
    upsert(args: any): Promise<any>;
  };
}

/** Lazy accessor: requiring lib/prisma at import time would construct a PrismaClient in every test and script. */
export function getCatalogDb(): CatalogDb {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../../lib/prisma') as { prisma: unknown };
  return mod.prisma as unknown as CatalogDb;
}

export const PRINTING_UPSERT_SQL = `
INSERT INTO "CardPrinting"
  ("id","source","game","name","nameNorm","setCode","setName","collectorNumber","language","rarity",
   "releaseYear","finishes","scryfallId","tcgplayerProductId","cardmarketId","imageSmallUrl","imageNormalUrl","updatedAt")
SELECT v.c_id, v.c_source, v.c_game, v.c_name, v.c_name_norm, v.c_set_code,
  NULLIF(v.c_set_name,''), NULLIF(v.c_collector_number,''), NULLIF(v.c_language,''), NULLIF(v.c_rarity,''),
  NULLIF(v.c_release_year,'')::int,
  CASE WHEN v.c_finishes = '' THEN ARRAY[]::text[] ELSE string_to_array(v.c_finishes, ',') END,
  NULLIF(v.c_scryfall_id,''), NULLIF(v.c_tcgplayer_id,'')::int, NULLIF(v.c_cardmarket_id,'')::int,
  NULLIF(v.c_img_small,''), NULLIF(v.c_img_normal,''), now()
FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::text[],
            $10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],$17::text[])
  AS v(c_id,c_source,c_game,c_name,c_name_norm,c_set_code,c_set_name,c_collector_number,c_language,c_rarity,
       c_release_year,c_finishes,c_scryfall_id,c_tcgplayer_id,c_cardmarket_id,c_img_small,c_img_normal)
ON CONFLICT ("id") DO UPDATE SET
  "source" = EXCLUDED."source", "game" = EXCLUDED."game", "name" = EXCLUDED."name", "nameNorm" = EXCLUDED."nameNorm",
  "setCode" = EXCLUDED."setCode", "setName" = EXCLUDED."setName", "collectorNumber" = EXCLUDED."collectorNumber",
  "language" = EXCLUDED."language", "rarity" = EXCLUDED."rarity", "releaseYear" = EXCLUDED."releaseYear",
  "finishes" = EXCLUDED."finishes", "scryfallId" = EXCLUDED."scryfallId",
  "tcgplayerProductId" = EXCLUDED."tcgplayerProductId", "cardmarketId" = EXCLUDED."cardmarketId",
  "imageSmallUrl" = EXCLUDED."imageSmallUrl", "imageNormalUrl" = EXCLUDED."imageNormalUrl", "updatedAt" = now()
WHERE ("CardPrinting"."source","CardPrinting"."game","CardPrinting"."name","CardPrinting"."nameNorm",
       "CardPrinting"."setCode","CardPrinting"."setName","CardPrinting"."collectorNumber","CardPrinting"."language",
       "CardPrinting"."rarity","CardPrinting"."releaseYear","CardPrinting"."finishes","CardPrinting"."scryfallId",
       "CardPrinting"."tcgplayerProductId","CardPrinting"."cardmarketId","CardPrinting"."imageSmallUrl",
       "CardPrinting"."imageNormalUrl")
  IS DISTINCT FROM
      (EXCLUDED."source",EXCLUDED."game",EXCLUDED."name",EXCLUDED."nameNorm",
       EXCLUDED."setCode",EXCLUDED."setName",EXCLUDED."collectorNumber",EXCLUDED."language",
       EXCLUDED."rarity",EXCLUDED."releaseYear",EXCLUDED."finishes",EXCLUDED."scryfallId",
       EXCLUDED."tcgplayerProductId",EXCLUDED."cardmarketId",EXCLUDED."imageSmallUrl",
       EXCLUDED."imageNormalUrl")
`;

/**
 * Prices attach to existing printings only (the JOIN drops ids with no printing row, for example
 * TCGCSV sealed products). A row with no price at all is inserted only if one already exists, so a
 * price that disappears upstream is cleared rather than kept forever. asOf is excluded from the
 * "differs" test on purpose: it records when the price last changed; freshness of unchanged rows
 * is carried by CardDataSource.sourceVersion.
 */
export const PRICE_UPSERT_SQL = `
INSERT INTO "CardPrice" ("printingId","usd","usdFoil","usdEtched","usdReverse","asOf")
SELECT v.c_id, NULLIF(v.c_usd,'')::numeric, NULLIF(v.c_usd_foil,'')::numeric,
  NULLIF(v.c_usd_etched,'')::numeric, NULLIF(v.c_usd_reverse,'')::numeric,
  (v.c_as_of::timestamptz AT TIME ZONE 'UTC')
FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[])
  AS v(c_id,c_usd,c_usd_foil,c_usd_etched,c_usd_reverse,c_as_of)
JOIN "CardPrinting" p ON p."id" = v.c_id
WHERE v.c_usd <> '' OR v.c_usd_foil <> '' OR v.c_usd_etched <> '' OR v.c_usd_reverse <> ''
   OR EXISTS (SELECT 1 FROM "CardPrice" e WHERE e."printingId" = v.c_id)
ON CONFLICT ("printingId") DO UPDATE SET
  "usd" = EXCLUDED."usd", "usdFoil" = EXCLUDED."usdFoil", "usdEtched" = EXCLUDED."usdEtched",
  "usdReverse" = EXCLUDED."usdReverse", "asOf" = EXCLUDED."asOf"
WHERE ("CardPrice"."usd","CardPrice"."usdFoil","CardPrice"."usdEtched","CardPrice"."usdReverse")
  IS DISTINCT FROM (EXCLUDED."usd",EXCLUDED."usdFoil",EXCLUDED."usdEtched",EXCLUDED."usdReverse")
`;

export const FINISH_UPDATE_SQL = `
UPDATE "CardPrinting" AS p
SET "finishes" = string_to_array(v.c_finishes, ','), "updatedAt" = now()
FROM unnest($1::text[],$2::text[]) AS v(c_id,c_finishes)
WHERE p."id" = v.c_id AND p."finishes" IS DISTINCT FROM string_to_array(v.c_finishes, ',')
`;

export const DB_SIZE_SQL = 'SELECT pg_database_size(current_database())::float8 AS bytes';

export const LOADED_SET_CODES_SQL =
  'SELECT DISTINCT "setCode" AS "setCode" FROM "CardPrinting" WHERE "game" = $1 AND "source" = $2';

const s = (v: string | null | undefined): string => (v === null || v === undefined ? '' : v);
const n = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

/** Column arrays for PRINTING_UPSERT_SQL, in $1..$17 order. */
export function printingParams(rows: PrintingRow[]): string[][] {
  return [
    rows.map((r) => r.id),
    rows.map((r) => r.source),
    rows.map((r) => r.game),
    rows.map((r) => r.name),
    rows.map((r) => r.nameNorm),
    rows.map((r) => r.setCode),
    rows.map((r) => s(r.setName)),
    rows.map((r) => s(r.collectorNumber)),
    rows.map((r) => s(r.language)),
    rows.map((r) => s(r.rarity)),
    rows.map((r) => n(r.releaseYear)),
    rows.map((r) => r.finishes.join(',')),
    rows.map((r) => s(r.scryfallId)),
    rows.map((r) => n(r.tcgplayerProductId)),
    rows.map((r) => n(r.cardmarketId)),
    rows.map((r) => s(r.imageSmallUrl)),
    rows.map((r) => s(r.imageNormalUrl)),
  ];
}

/** Column arrays for PRICE_UPSERT_SQL, in $1..$6 order. */
export function priceParams(rows: PriceRow[]): string[][] {
  return [
    rows.map((r) => r.printingId),
    rows.map((r) => s(r.usd)),
    rows.map((r) => s(r.usdFoil)),
    rows.map((r) => s(r.usdEtched)),
    rows.map((r) => s(r.usdReverse)),
    rows.map((r) => r.asOf.toISOString()),
  ];
}

const mapSource = (row: any): SourceState => ({
  source: row.source,
  lastAttemptAt: row.lastAttemptAt ?? null,
  lastSuccessAt: row.lastSuccessAt ?? null,
  lastStatus: row.lastStatus ?? null,
  lastError: row.lastError ?? null,
  sourceVersion: row.sourceVersion ?? null,
  rowsUpserted: row.rowsUpserted ?? 0,
  consecutiveFailures: row.consecutiveFailures ?? 0,
});

export function createPrismaCatalogStore(db: CatalogDb = getCatalogDb()): CatalogStore {
  return {
    async getDbSizeMb() {
      const rows = await db.$queryRawUnsafe<Array<{ bytes: number | string | null }>>(DB_SIZE_SQL);
      const bytes = Number(rows?.[0]?.bytes);
      return Number.isFinite(bytes) ? bytes / (1024 * 1024) : null;
    },

    async upsertPrintings(rows) {
      if (rows.length === 0) return 0;
      return db.$executeRawUnsafe(PRINTING_UPSERT_SQL, ...printingParams(rows));
    },

    async upsertPrices(rows) {
      if (rows.length === 0) return 0;
      return db.$executeRawUnsafe(PRICE_UPSERT_SQL, ...priceParams(rows));
    },

    async updateFinishes(rows: FinishUpdate[]) {
      const usable = rows.filter((r) => r.finishes.length > 0);
      if (usable.length === 0) return 0;
      return db.$executeRawUnsafe(
        FINISH_UPDATE_SQL,
        usable.map((r) => r.id),
        usable.map((r) => r.finishes.join(',')),
      );
    },

    async getSource(source: CatalogSourceId) {
      const row = await db.cardDataSource.findUnique({ where: { source } });
      return row ? mapSource(row) : null;
    },

    async recordRun(source: CatalogSourceId, record: RunRecord) {
      const error = record.error ? truncate(record.error, 500) : null;
      let data: Record<string, unknown>;
      let create: Record<string, unknown>;
      if (record.status === 'FAILED') {
        data = { lastAttemptAt: record.now, lastStatus: 'FAILED', lastError: error, consecutiveFailures: { increment: 1 } };
        create = { source, lastAttemptAt: record.now, lastStatus: 'FAILED', lastError: error, consecutiveFailures: 1 };
      } else if (record.status === 'SKIPPED_DB_SPACE') {
        data = { lastAttemptAt: record.now, lastStatus: 'SKIPPED_DB_SPACE', lastError: error };
        create = { source, lastAttemptAt: record.now, lastStatus: 'SKIPPED_DB_SPACE', lastError: error };
      } else {
        data = {
          lastAttemptAt: record.now,
          lastSuccessAt: record.now,
          lastStatus: record.status,
          lastError: null,
          consecutiveFailures: 0,
          rowsUpserted: record.rowsUpserted ?? 0,
          ...(record.sourceVersion ? { sourceVersion: record.sourceVersion } : {}),
        };
        create = { source, ...data };
      }
      const row = await db.cardDataSource.upsert({ where: { source }, create, update: data });
      return { consecutiveFailures: Number(row?.consecutiveFailures ?? 0) };
    },

    async loadedSetCodes(game: CatalogGame) {
      const rows = await db.$queryRawUnsafe<Array<{ setCode: string }>>(LOADED_SET_CODES_SQL, game, 'TCGCSV');
      return new Set((rows ?? []).map((r) => String(r.setCode).toLowerCase()));
    },
  };
}
