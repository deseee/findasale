/**
 * City Coordinate Backfill Cron — eagerly populate CityCoordinate for every city
 * slug the site can serve, instead of waiting for a page view to warm each one.
 *
 * WHY THIS EXISTS (2026-07-28)
 * ----------------------------
 * /sales/by-city/:citySlug (routes/sales.ts) resolves the slug to a centroid via
 * CityCoordinate and runs a 35-mile radius query. When the slug has no CityCoordinate
 * row AND cannot be geocoded on the spot, it SILENTLY degrades to exact city-string
 * matching — a far narrower query that reports HTTP 200 with an empty list. Nothing
 * logged, nothing alerted; the page just looked like a city with no sales.
 *
 * That cache is populated on demand, one slug per page view, so it only ever covered
 * cities someone had already visited. Measured against production 2026-07-28:
 *   - 2,710 city slugs currently have active inventory
 *   - 1,088 of them (40%) had NO CityCoordinate row
 * Sampling 80 of those uncached slugs directly against Nominatim (1.15s spacing):
 *   77 geocoded first try, 2 were non-US, 1 was an un-geocodable typo, 0 transient.
 * So the gap was never a geocoding-failure problem — it was a cold-cache problem.
 * Pages showed zero sales purely because nobody had loaded them before Google did.
 *
 * DESIGN
 * ------
 * - Idempotent: skips any slug that already has a CityCoordinate row; writes via upsert.
 * - Resumable: each run re-derives the outstanding set, so an interrupted run costs
 *   nothing. MAX_SLUGS_PER_RUN bounds wall-clock time; the next run picks up the rest.
 * - Prioritized: cities with the most ACTIVE inventory are geocoded first, so the
 *   runs that matter most land first.
 * - Rate-limited: geocodeCityState() self-serializes on the shared Nominatim limiter,
 *   and this job adds the extra 1,100ms inter-call delay that geocodingService.ts's
 *   header comment requires of high-volume batch callers (same convention as
 *   geocodeBacklogJob.ts). Nominatim is free; no billed geocoder is used here.
 * - Negative cache: slugs that cannot be resolved are recorded in CityGeocodeFailure
 *   so they stop consuming rate-limited requests a resolvable city could have used.
 *
 * Slug derivation is deliberately the SAME canonicalCitySlug() generator that
 * /sales/city-slugs uses to build the sitemap and every city getStaticPaths, so this
 * job can never warm a slug space the site doesn't actually serve (utils/citySlug.ts).
 *
 * Wired in: packages/backend/src/index.ts alongside scheduleGeocodeBacklogCron.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { canonicalCitySlug } from '../utils/citySlug';
import { geocodeCityState } from '../services/geocodingService';

/** Bounded so one cron run cannot occupy the process for hours. */
const MAX_SLUGS_PER_RUN = 150;

/** geocodingService.ts header: batch callers must add 1,100ms between calls. */
const MIN_REQUEST_INTERVAL_MS = 1100;

/** Attempts before a slug is marked permanent and stops being retried. */
const MAX_ATTEMPTS_BEFORE_PERMANENT = 3;

/**
 * Sale-coordinate fallback thresholds. A city with real inventory already has real
 * geocoded points in the Sale table (Sale.lat/lng is ~98.7% populated), so its own
 * sales are a valid centroid source when Nominatim has never heard of the place name.
 * This is what rescues genuine typos: production has one sale in "Burnabt, BC" whose
 * own lat/lng is 49.282,-123.002 — Burnaby, exactly right — while the string
 * "Burnabt" geocodes to nothing, ever.
 */
const MIN_SALE_POINTS_FOR_CENTROID = 2;
const MAX_SALE_SPREAD_MILES = 35;

const EARTH_RADIUS_MILES = 3959;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface SlugTarget {
  slug: string;
  /** Display city/state — first (highest-volume) raw row that produced this slug. */
  city: string;
  state: string;
  activeCount: number;
  totalCount: number;
}

/**
 * Build the outstanding work list: every canonical city slug the site can serve that
 * has no CityCoordinate row yet, most-active-inventory first.
 *
 * Mirrors /sales/city-slugs' universe (status IN PUBLISHED|ENDED, city+state present)
 * but WITHOUT its LIMIT 200 — that limit caps what the sitemap emits, not what
 * getStaticPaths can render, because every city page uses fallback: 'blocking'.
 */
async function buildTargets(): Promise<SlugTarget[]> {
  const totalRows = await prisma.$queryRaw<Array<{ city: string; state: string; count: bigint }>>`
    SELECT city, state, COUNT(*) AS count
    FROM "Sale"
    WHERE status IN ('PUBLISHED', 'ENDED')
      AND city IS NOT NULL
      AND state IS NOT NULL
    GROUP BY city, state
    ORDER BY count DESC
  `;

  const activeRows = await prisma.$queryRaw<Array<{ city: string; state: string; count: bigint }>>`
    SELECT city, state, COUNT(*) AS count
    FROM "Sale"
    WHERE status = 'PUBLISHED'
      AND "deletedAt" IS NULL
      AND ("isOngoing" = true OR "endDate" >= NOW())
      AND city IS NOT NULL
      AND state IS NOT NULL
    GROUP BY city, state
  `;

  const activeByCity = new Map<string, number>();
  for (const row of activeRows) {
    const key = `${row.city.toLowerCase()}|${row.state.toLowerCase()}`;
    activeByCity.set(key, (activeByCity.get(key) ?? 0) + Number(row.count));
  }

  // Distinct (city, state) rows legitimately collapse onto one canonical slug
  // (e.g. 'Washington'/'DC' and 'Washington'/'D.C.'), so counts are merged and the
  // first row — rows arrive ORDER BY count DESC — supplies the display city/state.
  const bySlug = new Map<string, SlugTarget>();
  for (const row of totalRows) {
    const slug = canonicalCitySlug(row.city, row.state);
    if (!slug) continue;

    const active = activeByCity.get(`${row.city.toLowerCase()}|${row.state.toLowerCase()}`) ?? 0;
    const existing = bySlug.get(slug);
    if (!existing) {
      bySlug.set(slug, {
        slug,
        city: row.city,
        state: row.state,
        activeCount: active,
        totalCount: Number(row.count),
      });
      continue;
    }
    existing.activeCount += active;
    existing.totalCount += Number(row.count);
  }

  const cached = await prisma.cityCoordinate.findMany({ select: { slug: true } });
  const cachedSlugs = new Set(cached.map((c) => c.slug));
  const skipSlugs = await loadPermanentFailureSlugs();

  return Array.from(bySlug.values())
    .filter((t) => !cachedSlugs.has(t.slug) && !skipSlugs.has(t.slug))
    .sort((a, b) => b.activeCount - a.activeCount || b.totalCount - a.totalCount);
}

/**
 * CityGeocodeFailure is reached through raw SQL rather than the typed Prisma client
 * on purpose: the model ships in schema.prisma with this change, but the migration is
 * a separate manual step (CLAUDE.md §6), and Railway deploys code without running
 * migrations. Raw SQL + a swallowed error means the job keeps doing its real work on
 * a database where the table does not exist yet, instead of crash-looping the cron
 * until someone runs `prisma migrate deploy`.
 */
async function loadPermanentFailureSlugs(): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRaw<Array<{ slug: string }>>`
      SELECT slug FROM "CityGeocodeFailure" WHERE permanent = true
    `;
    return new Set(rows.map((r) => r.slug));
  } catch (_err) {
    console.warn(
      '[cityCoordinateBackfill] CityGeocodeFailure table unavailable — running without a negative cache. ' +
        'Apply packages/database/prisma/migrations/city_geocode_failure to enable it.'
    );
    return new Set<string>();
  }
}

async function recordFailure(target: SlugTarget, reason: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "CityGeocodeFailure" ("slug", "city", "state", "attempts", "permanent", "lastReason", "firstFailedAt", "lastAttemptAt")
      VALUES (${target.slug}, ${target.city}, ${target.state}, 1, false, ${reason}, NOW(), NOW())
      ON CONFLICT ("slug") DO UPDATE SET
        "attempts"      = "CityGeocodeFailure"."attempts" + 1,
        "permanent"     = ("CityGeocodeFailure"."attempts" + 1) >= ${MAX_ATTEMPTS_BEFORE_PERMANENT},
        "lastReason"    = ${reason},
        "lastAttemptAt" = NOW()
    `;
  } catch (err) {
    // Non-fatal — worst case the slug is retried on the next run.
    console.warn(
      `[cityCoordinateBackfill] Could not record failure for ${target.slug}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Derive a centroid from the city's own geocoded sales. Requires several points and
 * a tight spread so one mis-geocoded outlier cannot drag a city's centroid across the
 * country — if the points disagree by more than the by-city radius itself, they are
 * not describing one city and the fallback declines.
 */
async function saleDerivedCentroid(
  city: string,
  state: string
): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.sale.findMany({
    where: {
      city: { equals: city, mode: 'insensitive' },
      state: { equals: state, mode: 'insensitive' },
      deletedAt: null,
      lat: { not: null },
      lng: { not: null },
    },
    select: { lat: true, lng: true },
    take: 200,
  });

  const points = rows
    .filter((r): r is { lat: number; lng: number } => r.lat != null && r.lng != null)
    .map((r) => ({ lat: r.lat, lng: r.lng }));

  if (points.length < MIN_SALE_POINTS_FOR_CENTROID) return null;

  const centroid = {
    lat: median(points.map((p) => p.lat)),
    lng: median(points.map((p) => p.lng)),
  };

  const withinRadius = points.filter(
    (p) => haversineMiles(centroid.lat, centroid.lng, p.lat, p.lng) <= MAX_SALE_SPREAD_MILES
  );
  // Majority of the city's own sales must agree with the median before it is trusted.
  if (withinRadius.length / points.length < 0.6) return null;

  return centroid;
}

export interface BackfillResult {
  outstanding: number;
  attempted: number;
  geocoded: number;
  saleDerived: number;
  failed: number;
}

export async function runCityCoordinateBackfill(
  maxSlugs: number = MAX_SLUGS_PER_RUN
): Promise<BackfillResult> {
  const targets = await buildTargets();

  if (targets.length === 0) {
    console.log('[cityCoordinateBackfill] No city slugs missing a centroid — cache is warm.');
    return { outstanding: 0, attempted: 0, geocoded: 0, saleDerived: 0, failed: 0 };
  }

  const batch = targets.slice(0, maxSlugs);
  console.log(
    `[cityCoordinateBackfill] ${targets.length} slug(s) missing a centroid; processing ${batch.length} this run ` +
      `(top: ${batch[0].slug} @ ${batch[0].activeCount} active sales).`
  );

  let geocoded = 0;
  let saleDerived = 0;
  let failed = 0;

  for (const target of batch) {
    try {
      // Slug parsing mirrors /sales/by-city so the centroid this job caches is the
      // one that endpoint would have resolved for itself on a cache miss.
      const parts = target.slug.split('-');
      const stateCode = parts[parts.length - 1].toUpperCase();
      const cityName = parts
        .slice(0, -1)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      const geo = await geocodeCityState(cityName, stateCode);

      let lat: number;
      let lng: number;
      let source: string;

      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        source = geo.source;
      } else {
        const fromSales = await saleDerivedCentroid(target.city, target.state);
        if (!fromSales) {
          failed++;
          console.warn(
            `[cityCoordinateBackfill] FAIL ${target.slug} ("${cityName}", ${stateCode}) — ` +
              `no Nominatim match and no usable sale coordinates (${target.activeCount} active sales).`
          );
          await recordFailure(target, 'no-nominatim-match-no-sale-coordinates');
          await sleep(MIN_REQUEST_INTERVAL_MS);
          continue;
        }
        lat = fromSales.lat;
        lng = fromSales.lng;
        source = 'sale-centroid';
        saleDerived++;
      }

      await prisma.cityCoordinate.upsert({
        where: { slug: target.slug },
        create: { slug: target.slug, city: cityName, state: stateCode, lat, lng, source },
        update: { lat, lng, source, geocodedAt: new Date() },
      });

      if (source !== 'sale-centroid') geocoded++;
      console.log(
        `[cityCoordinateBackfill] OK ${target.slug} -> ${lat.toFixed(4)},${lng.toFixed(4)} ` +
          `(source=${source}, activeSales=${target.activeCount})`
      );
    } catch (err) {
      // Per-slug errors must not stop the batch.
      failed++;
      console.error(
        `[cityCoordinateBackfill] Unexpected error for ${target.slug}:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    // Politeness delay on top of geocodeCityState's own shared limiter, per the
    // batch-caller requirement in geocodingService.ts's header comment.
    await sleep(MIN_REQUEST_INTERVAL_MS);
  }

  const result: BackfillResult = {
    outstanding: targets.length,
    attempted: batch.length,
    geocoded,
    saleDerived,
    failed,
  };
  console.log(
    `[cityCoordinateBackfill] Run complete — geocoded: ${geocoded}, sale-derived: ${saleDerived}, ` +
      `failed: ${failed}, attempted: ${batch.length}, still outstanding: ${targets.length - batch.length}`
  );
  return result;
}

/**
 * Schedule the city-coordinate backfill cron — every 6 hours at :30.
 * Offset from geocodeBacklogJob (which runs on the hour, every 2 hours) so the two
 * Nominatim consumers do not contend for the same rate-limit window.
 */
export function scheduleCityCoordinateBackfillCron(): void {
  cron.schedule(
    '30 */6 * * *',
    cronGuard({ jobName: 'cityCoordinateBackfill' }, async () => {
      await runCityCoordinateBackfill();
    })
  );
  console.log('[cityCoordinateBackfill] Scheduled — runs every 6 hours at :30');
}
