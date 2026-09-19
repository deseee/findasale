/**
 * footageIngestService.ts — ADR-080 §3 (event-driven trigger + debounce batching),
 * §4 (FootageBatch / FootageAsset data model). Stage 1b: EVENT-DRIVEN INGEST.
 *
 * WHAT THIS STAGE DOES (and only this):
 *   1. Reconciles the R2 raw-footage bucket (source of truth) against the
 *      FootageAsset table — creating a row for every R2 object that does NOT yet
 *      have one, idempotently (r2Key is @unique, so a redelivered ping/event
 *      never double-creates a clip). See ADR-080 §3.3 (idempotency).
 *   2. Groups new assets by SUBJECT (r2Client.subjectPrefixFromKey -- the first
 *      path segment of a nested R2 key, e.g. "shipping/A001.mp4" -> "shipping")
 *      and attaches each subject's assets to that subject's own OPEN
 *      FootageBatch (a "shoot"), opening a new batch per subject if none is
 *      OPEN yet. Bare root-level keys (e.g. "A001.mp4", today's default from
 *      Patrick's rclone uploader) have no subject and keep going through a
 *      single shared "unsorted" OPEN batch, exactly as before. Each affected
 *      batch's own last-activity timestamp is bumped so its own quiet-seal
 *      timer (below) resets independently on every new clip in that subject
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
import { listRawFootage, subjectPrefixFromKey, type RawFootageObject } from './r2Client';
import { classifyBatch } from './footageClassifyService';

/** Result of one ingest reconciliation pass. */
export interface FootageIngestResult {
  /** Number of brand-new FootageAsset rows created this pass. */
  assetsCreated: number;
  /** The OPEN batch new assets were attached to (null only if there was no work
   *  and no OPEN batch exists). When new assets spanned more than one subject
   *  (see batchIds), this is the first batch encountered this pass -- existing
   *  callers that only read batchId keep working exactly as before. */
  batchId: string | null;
  /** Total R2 objects seen this pass (for observability). */
  r2ObjectCount: number;
  /** Object keys parsed from an R2 event body, if one was supplied (logging only). */
  triggeredByKeys: string[];
  /**
   * ADDITIVE, OPTIONAL. Every OPEN batch touched or created this pass, in the
   * order encountered (batchId is always batchIds[0] when both are present).
   * One batch per distinct subject prefix (see r2Client.subjectPrefixFromKey),
   * plus, when any bare root-level keys were ingested, the single shared
   * "unsorted" batch. Existing callers that only read batchId are unaffected.
   */
  batchIds?: string[];
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
    return {
      assetsCreated: 0,
      batchId: openBatch?.id ?? null,
      r2ObjectCount,
      triggeredByKeys,
      batchIds: openBatch ? [openBatch.id] : [],
    };
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
    return {
      assetsCreated: 0,
      batchId: openBatch?.id ?? null,
      r2ObjectCount,
      triggeredByKeys,
      batchIds: openBatch ? [openBatch.id] : [],
    };
  }

  // Group new objects by SUBJECT (the first path segment of a nested R2 key --
  // see r2Client.subjectPrefixFromKey). Two unrelated shoots uploaded in the
  // same debounce window (e.g. "shipping/A001.mp4" and "rapidfire/A002.mp4")
  // must never merge into one batch/video. Bare root-level keys (no subject,
  // e.g. "A001.mp4") all share ONE group keyed by `null` -- this is exactly
  // today's "unsorted" behavior, unchanged.
  const groups = new Map<string | null, RawFootageObject[]>();
  for (const obj of newObjects) {
    const subject = subjectPrefixFromKey(obj.key);
    const group = groups.get(subject);
    if (group) {
      group.push(obj);
    } else {
      groups.set(subject, [obj]);
    }
  }

  // Load every currently-OPEN batch along with its existing assets' r2Keys so
  // we can tell which OPEN batch (if any) already belongs to which subject.
  const openBatches = await prisma.footageBatch.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, assets: { select: { r2Key: true } } },
  });

  // Resolve each group to a batch id: reuse an OPEN batch only when every one
  // of ITS existing assets already resolves to that same subject (or, for the
  // unsorted group, only when every existing asset is itself unsorted). A
  // batch with no assets yet, or with a mix of subjects (should not occur
  // going forward, but defensive for pre-existing data), is never reused --
  // a fresh batch is opened instead so we never silently merge two subjects.
  const usedExistingBatchIds = new Set<string>();
  const batchIdByGroup = new Map<string | null, string>();
  for (const [subject, objs] of groups) {
    const match = openBatches.find(
      (b) => !usedExistingBatchIds.has(b.id) && batchSubjectIdentity(b.assets) === subject
    );
    let batchId: string;
    if (match) {
      batchId = match.id;
      usedExistingBatchIds.add(batchId);
    } else {
      const created = await prisma.footageBatch.create({
        data: { status: 'OPEN' }, // organizerId null = FindA.Sale house account (ADR-080 §3.2)
        select: { id: true },
      });
      batchId = created.id;
      console.log(
        subject
          ? `[footage-ingest] Opened new FootageBatch ${batchId} for subject "${subject}" (${objs.length} object(s))`
          : `[footage-ingest] Opened new FootageBatch ${batchId} (unsorted, ${objs.length} object(s))`
      );
    }
    batchIdByGroup.set(subject, batchId);
  }

  let assetsCreated = 0;
  const batchesWithNewAssets = new Set<string>();
  for (const [subject, objs] of groups) {
    const batchId = batchIdByGroup.get(subject)!;
    for (const obj of objs) {
      try {
        await prisma.footageAsset.create({
          data: {
            batchId,
            r2Key: obj.key,
            mediaType: obj.mediaType, // 'video' | 'image' (r2Client.inferMediaTypeFromKey)
            status: 'UPLOADED', // schema initial state (FootageAssetStatus @default(UPLOADED))
          },
        });
        assetsCreated++;
        batchesWithNewAssets.add(batchId);
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
  }

  // Bump each AFFECTED batch's own last-activity timestamp so ITS quiet-seal
  // timer resets independently (ADR-080 §3.2) -- every subject now has its own
  // 20-minute window instead of one shared one. FootageBatch.updatedAt is
  // @updatedAt, which Prisma advances to now() on any update() call -- this
  // no-op status write is the touch. sealStaleFootageBatches() reads updatedAt
  // as the quiet-since time.
  for (const batchId of batchesWithNewAssets) {
    await prisma.footageBatch.update({
      where: { id: batchId },
      data: { status: 'OPEN' },
    });
  }

  const batchIds = [...batchIdByGroup.values()];
  console.log(
    `[footage-ingest] Created ${assetsCreated} asset(s) across ${batchIds.length} batch(es) (${r2ObjectCount} R2 object(s) total)`
  );
  return { assetsCreated, batchId: batchIds[0] ?? null, r2ObjectCount, triggeredByKeys, batchIds };
}

/**
 * Determine an OPEN batch's subject identity from its existing assets: `null`
 * if it's the shared "unsorted" batch (every asset is a bare root-level key),
 * a string if every asset shares one subject prefix, or `undefined` if the
 * batch has no assets yet or a mix of subjects -- both of which mean "do not
 * reuse this batch."
 */
function batchSubjectIdentity(assets: { r2Key: string }[]): string | null | undefined {
  if (assets.length === 0) return undefined;
  let identity: string | null = null;
  let first = true;
  for (const asset of assets) {
    const subject = subjectPrefixFromKey(asset.r2Key);
    if (first) {
      identity = subject;
      first = false;
    } else if (subject !== identity) {
      return undefined;
    }
  }
  return identity;
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

      // ADR-080 §5/§6 handoff: a freshly SEALED batch is handed to the
      // CLASSIFICATION stage (per-clip ClipAnalysis -> format inference ->
      // confidence gate). Fire-and-forget + FAILURE-ISOLATED: classifyBatch owns
      // its own status transitions (ANALYZING/ASSEMBLING/NEEDS_INPUT/FAILED) and
      // must NEVER throw into the seal cron. A classify crash sets the batch to a
      // FAILED status inside classifyBatch; this catch is the belt-and-suspenders
      // backstop so an unexpected throw still cannot crash the sweep.
      void classifyBatch(b.id).catch((err) => {
        console.error(`[footage-seal] classifyBatch(${b.id}) crashed (isolated, cron continues):`, err?.message ?? err);
      });
    }
  }

  if (sealedBatchIds.length === 0) {
    console.log(`[footage-seal] No OPEN batches quiet longer than ${sealMinutes} min`);
  }
  return { sealedBatchIds, sealMinutes };
}
