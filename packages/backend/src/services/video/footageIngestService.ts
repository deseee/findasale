/**
 * footageIngestService.ts — ADR-080 §3 (event-driven trigger + debounce batching),
 * §4 (FootageBatch / FootageAsset data model). Stage 1b: EVENT-DRIVEN INGEST.
 *
 * WHAT THIS STAGE DOES (and only this):
 *   1. Reconciles the R2 raw-footage bucket (source of truth) against the
 *      FootageAsset table — creating a row for every R2 object that does NOT yet
 *      have one, idempotently (r2Key is @unique, so a redelivered ping/event
 *      never double-creates a clip). See ADR-080 §3.3 (idempotency).
 *   2. Groups new assets into the single currently-OPEN FootageBatch (a "shoot"),
 *      opening a new batch if none is OPEN, and bumps that batch's last-activity
 *      timestamp so the quiet-seal timer (below) resets on every new clip
 *      (ADR-080 §3.2).
 *   3. sealStaleFootageBatches(): the quiet-seal — moves an OPEN batch to SEALED
 *      once it has gone quiet for FOOTAGE_BATCH_SEAL_MINUTES. This is the END of
 *      Stage 1b. It does NOT enqueue analysis/assembly (see the TODO in
 *      sealStaleFootageBatches — the SEALED batch is the handoff point to the
 *      next stage, ADR-080 §3.1 / §4).
 *
 * TRIGGER MODEL (approved simplification over ADR-080 §3.1's Cloudflare Queue):
 * the primary trigger is an authenticated ping from Patrick's PC uploader hitting
 * POST /api/video/footage-ingest. The backend then reads R2 as the source of
 * truth — the ping is only a "check now" signal, never the data itself. The
 * endpoint ALSO accepts a Cloudflare R2 object-create event-notification body so
 * an R2-native event source is a future drop-in with zero code change here:
 * whether woken by a bare ping or an R2 event, this service always reconciles the
 * full R2 listing, so both paths converge on identical behavior. parseR2EventKeys
 * below extracts the triggering object key(s) purely for logging/observability.
 *
 * NOTE ON PERSISTED FIELDS: FootageAsset stores the durable r2Key + inferred
 * mediaType. It intentionally does NOT store the presigned `url` — that URL is a
 * short-TTL (1h) presigned GET regenerated on demand by r2Client.listRawFootage;
 * the schema has no column for it and persisting a value that expires in an hour
 * would be a bug. r2Key is the durable handle everything downstream re-signs from.
 */

import { prisma } from '../../lib/prisma';
import { listRawFootage } from './r2Client';

/** Result of one ingest reconciliation pass. */
export interface FootageIngestResult {
  /** Number of brand-new FootageAsset rows created this pass. */
  assetsCreated: number;
  /** The OPEN batch new assets were attached to (null only if there was no work
   *  and no OPEN batch exists). */
  batchId: string | null;
  /** Total R2 objects seen this pass (for observability). */
  r2ObjectCount: number;
  /** Object keys parsed from an R2 event body, if one was supplied (logging only). */
  triggeredByKeys: string[];
}

/**
 * Tolerantly extract object key(s) from a Cloudflare R2 object-create
 * event-notification body. R2 delivers events shaped roughly like:
 *   { account, action: "PutObject", bucket, object: { key, size, eTag }, eventTime }
 * We handle a single event object, an array of them, and an { records: [...] }
 * envelope defensively. Returns [] for a bare ping / unrecognized body — the
 * caller reconciles the full R2 listing regardless, so a missed parse is never
 * a correctness problem, only a log-detail one.
 */
export function parseR2EventKeys(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const keys: string[] = [];

  const pushFromRecord = (rec: any): void => {
    if (!rec || typeof rec !== 'object') return;
    // Cloudflare R2 native shape: { object: { key } }
    const k = rec.object?.key ?? rec.key ?? rec.Key;
    if (typeof k === 'string' && k.length > 0) keys.push(k);
  };

  const b = body as any;
  if (Array.isArray(b)) {
    b.forEach(pushFromRecord);
  } else if (Array.isArray(b.records)) {
    b.records.forEach(pushFromRecord);
  } else if (Array.isArray(b.Records)) {
    b.Records.forEach(pushFromRecord);
  } else {
    pushFromRecord(b);
  }
  return keys;
}

/**
 * Reconcile R2 -> FootageAsset and attach any new assets to the OPEN batch.
 * Idempotent: existing keys are skipped; a race that slips past the pre-check is
 * caught by the r2Key unique constraint (P2002 -> skip). Safe to call on every
 * ping / event / redelivery.
 *
 * @param eventBody optional parsed R2 event-notification body (or null for a
 *                  bare "check now" ping). Used only to log what triggered us.
 */
export async function ingestFootage(eventBody?: unknown): Promise<FootageIngestResult> {
  const triggeredByKeys = parseR2EventKeys(eventBody ?? null);
  if (triggeredByKeys.length > 0) {
    console.log(`[footage-ingest] Woken by R2 event for key(s): ${triggeredByKeys.join(', ')}`);
  } else {
    console.log('[footage-ingest] Bare check-now ping — reconciling full R2 listing');
  }

  // R2 is the source of truth.
  const objects = await listRawFootage();
  const r2ObjectCount = objects.length;

  if (objects.length === 0) {
    const openBatch = await prisma.footageBatch.findFirst({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    console.log('[footage-ingest] R2 bucket empty — nothing to ingest');
    return { assetsCreated: 0, batchId: openBatch?.id ?? null, r2ObjectCount, triggeredByKeys };
  }

  // Which keys already have a row?
  const keys = objects.map((o) => o.key);
  const existing = await prisma.footageAsset.findMany({
    where: { r2Key: { in: keys } },
    select: { r2Key: true },
  });
  const existingKeys = new Set(existing.map((e) => e.r2Key));
  const newObjects = objects.filter((o) => !existingKeys.has(o.key));

  if (newObjects.length === 0) {
    const openBatch = await prisma.footageBatch.findFirst({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    console.log(`[footage-ingest] No new footage (${r2ObjectCount} object(s) already ingested)`);
    return { assetsCreated: 0, batchId: openBatch?.id ?? null, r2ObjectCount, triggeredByKeys };
  }

  // Attach to the currently-OPEN batch (the "shoot"), or open a new one.
  let batch = await prisma.footageBatch.findFirst({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!batch) {
    batch = await prisma.footageBatch.create({
      data: { status: 'OPEN' }, // organizerId null = FindA.Sale house account (ADR-080 §3.2)
      select: { id: true },
    });
    console.log(`[footage-ingest] Opened new FootageBatch ${batch.id}`);
  }

  let assetsCreated = 0;
  for (const obj of newObjects) {
    try {
      await prisma.footageAsset.create({
        data: {
          batchId: batch.id,
          r2Key: obj.key,
          mediaType: obj.mediaType, // 'video' | 'image' (r2Client.inferMediaTypeFromKey)
          status: 'UPLOADED', // schema initial state (FootageAssetStatus @default(UPLOADED))
        },
      });
      assetsCreated++;
    } catch (err: any) {
      // P2002 = unique violation on r2Key: a concurrent ingest already created it.
      // Idempotent by design — skip, don't fail the whole pass.
      if (err?.code === 'P2002') {
        console.log(`[footage-ingest] Skipped ${obj.key} — already ingested (concurrent create)`);
        continue;
      }
      throw err;
    }
  }

  // Bump the batch's last-activity timestamp so the quiet-seal timer resets on
  // every new clip (ADR-080 §3.2). FootageBatch.updatedAt is @updatedAt, which
  // Prisma advances to now() on any update() call — this no-op status write is
  // the touch. sealStaleFootageBatches() reads updatedAt as the quiet-since time.
  if (assetsCreated > 0) {
    await prisma.footageBatch.update({
      where: { id: batch.id },
      data: { status: 'OPEN' },
    });
  }

  console.log(
    `[footage-ingest] Created ${assetsCreated} asset(s) on batch ${batch.id} (${r2ObjectCount} R2 object(s) total)`
  );
  return { assetsCreated, batchId: batch.id, r2ObjectCount, triggeredByKeys };
}

/** Resolve the configurable quiet-seal window (minutes). Default 20. */
function getSealMinutes(): number {
  const raw = process.env.FOOTAGE_BATCH_SEAL_MINUTES;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

/** Result of one seal sweep. */
export interface FootageSealResult {
  sealedBatchIds: string[];
  sealMinutes: number;
}

/**
 * Quiet-seal sweep — the END of Stage 1b. Seals any OPEN FootageBatch whose
 * last-activity (updatedAt) is older than FOOTAGE_BATCH_SEAL_MINUTES. This is a
 * pure DB-timestamp check — it does NOT poll R2. Intended to run on a light
 * recurring interval (~5 min) registered in index.ts alongside the other crons.
 *
 * Concurrency-safe: each seal is a guarded updateMany (status still OPEN AND
 * still quiet) so two overlapping sweeps can never double-seal or seal a batch
 * that received a clip in the meantime.
 */
export async function sealStaleFootageBatches(): Promise<FootageSealResult> {
  const sealMinutes = getSealMinutes();
  const cutoff = new Date(Date.now() - sealMinutes * 60 * 1000);

  const candidates = await prisma.footageBatch.findMany({
    where: { status: 'OPEN', updatedAt: { lt: cutoff } },
    select: { id: true, updatedAt: true, _count: { select: { assets: true } } },
  });

  const sealedBatchIds: string[] = [];
  for (const b of candidates) {
    // Never seal an empty batch into the pipeline (defensive — ingest only opens
    // a batch when it has a clip to attach, so this should not occur).
    if (b._count.assets === 0) {
      console.log(`[footage-seal] Skipping empty batch ${b.id} (0 assets)`);
      continue;
    }

    const { count } = await prisma.footageBatch.updateMany({
      where: { id: b.id, status: 'OPEN', updatedAt: { lt: cutoff } },
      data: { status: 'SEALED', sealedAt: new Date() },
    });

    if (count === 1) {
      sealedBatchIds.push(b.id);
      const quietForMin = Math.round((Date.now() - b.updatedAt.getTime()) / 60000);
      console.log(
        `[footage-seal] Sealed batch ${b.id} — ${b._count.assets} asset(s), quiet for ~${quietForMin} min ` +
          `(threshold ${sealMinutes} min)`
      );

      // TODO (ADR-080 §3.1 / §4 handoff): a SEALED FootageBatch is the handoff
      // point to the NEXT stage (per-clip ClipAnalysis -> format inference ->
      // template assembly, which reuses the ADR-078 VideoJob pipeline via
      // FootageBatch.videoJobId). That enqueue is deliberately NOT done here —
      // Stage 1b ends at SEALED. Wire the analysis/VideoJob enqueue in the next
      // stage's dispatch.
    }
  }

  if (sealedBatchIds.length === 0) {
    console.log(`[footage-seal] No OPEN batches quiet longer than ${sealMinutes} min`);
  }
  return { sealedBatchIds, sealMinutes };
}
