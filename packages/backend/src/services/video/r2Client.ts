/**
 * r2Client.ts — ADR-079 (Motion Footage Extension), Cloudflare R2 raw-footage store.
 *
 * WHY THIS EXISTS: raw video/photo footage used to be uploaded to the PRODUCT
 * Cloudinary account (see the pre-rewrite ingestRawFootage.ts / videoAssembly.ts
 * upload pattern), which ate the website's image-credit budget. Raw footage now
 * lives in a SEPARATE, PRIVATE Cloudflare R2 bucket (`findasale-raw-footage`)
 * that Patrick's phone auto-syncs clips into directly. R2 is S3-compatible, so
 * this module talks to it with the AWS S3 v3 SDK.
 *
 * Credentials come from Railway backend env vars that ALREADY EXIST — this
 * module invents no new names:
 *   R2_ENDPOINT           — S3 API endpoint for the R2 account
 *   R2_BUCKET             — bucket name (value: findasale-raw-footage)
 *   R2_REGION             — region (value: auto)
 *   R2_ACCESS_KEY_ID      — R2 access key id
 *   R2_SECRET_ACCESS_KEY  — R2 secret access key
 *
 * Lifecycle (ADR-079): footage is TRANSIENT. A session lists the bucket
 * (listRawFootage) to get short-TTL presigned GET URLs it can paste into a
 * CuratedShot list; after a video successfully assembles, the orchestrator
 * deletes each consumed object (deleteRawFootageObject) so the free tier never
 * fills. The bucket is PRIVATE — URLs are always short-lived presigned GETs,
 * never public.
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_REGION = process.env.R2_REGION || 'auto';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

/**
 * ADR-080 §7 retention window. A batch's raw R2 assets are kept until
 * `retainUntil` (approvedAt/rejectedAt + these many days) so a human can still
 * reopen/inspect recently-decided footage before it's gone for good. The daily
 * footageRetentionCron sweep (footageRetentionCron.ts) is what actually deletes
 * past this window -- these constants are read by both the approve/reject
 * handlers (to SET retainUntil) and the sweep (to decide what's due).
 */
export const FOOTAGE_RETENTION_DAYS = parseInt(process.env.FOOTAGE_RETENTION_DAYS || '30', 10);
export const FOOTAGE_REJECT_RETENTION_DAYS = parseInt(process.env.FOOTAGE_REJECT_RETENTION_DAYS || '7', 10);

/** Presigned GET URL lifetime. Kept short (1h) — the bucket is private and a
 *  session only needs the URL long enough to paste it into a shot list and run
 *  an assembly. */
const PRESIGN_TTL_SECONDS = 60 * 60;

/** Same video extension vocabulary the rest of the pipeline uses
 *  (videoAssembly.ts / ingestRawFootage.ts). Anything not in this set is
 *  treated as an image. */
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv']);

let _client: S3Client | null = null;

/** Lazily construct the S3 client so importing this module never throws just
 *  because env vars aren't loaded yet (e.g. in the type-checker or a test that
 *  never actually calls R2). Uses path-style addressing so a presigned URL is a
 *  predictable `${endpoint}/${bucket}/${key}?...` shape that extractR2KeyFromUrl
 *  below can reliably reverse. */
function getClient(): S3Client {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      'r2Client: R2 is not configured — R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must all be set'
    );
  }
  if (!_client) {
    _client = new S3Client({
      region: R2_REGION,
      endpoint: R2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

function bucketName(): string {
  if (!R2_BUCKET) {
    throw new Error('r2Client: R2_BUCKET env var is not set');
  }
  return R2_BUCKET;
}

/** Infer media type from a bare object key (or any string ending in a filename)
 *  by file extension. Video extensions -> 'video'; everything else -> 'image'. */
export function inferMediaTypeFromKey(key: string): 'video' | 'image' {
  const dot = key.lastIndexOf('.');
  const slash = key.lastIndexOf('/');
  const ext = dot > slash ? key.slice(dot).toLowerCase() : '';
  return VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image';
}

export interface RawFootageObject {
  /** R2 object key (the delete handle). */
  key: string;
  /** Short-TTL presigned GET URL — paste into a CuratedShot.photoUrl. */
  url: string;
  /** 'video' | 'image', inferred from the key's file extension. */
  mediaType: 'video' | 'image';
}

/**
 * List every object currently in the raw-footage bucket and return, for each, a
 * short-TTL presigned GET URL plus its inferred mediaType. Paginates so a bucket
 * with >1000 objects is fully enumerated. Folder-placeholder keys (ending in
 * '/') are skipped.
 */
export async function listRawFootage(): Promise<RawFootageObject[]> {
  const client = getClient();
  const bucket = bucketName();
  const results: RawFootageObject[] = [];
  let continuationToken: string | undefined;

  do {
    const resp = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken })
    );
    for (const obj of resp.Contents ?? []) {
      if (!obj.Key || obj.Key.endsWith('/')) continue;
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: obj.Key }),
        { expiresIn: PRESIGN_TTL_SECONDS }
      );
      results.push({ key: obj.Key, url, mediaType: inferMediaTypeFromKey(obj.Key) });
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  return results;
}

/**
 * Delete a single raw-footage object by key. Called by the orchestrator ONLY
 * after a video successfully assembles (footage is transient — ADR-079).
 */
export async function deleteRawFootageObject(key: string): Promise<void> {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}

/**
 * Reverse a presigned R2 GET URL (or a plain `${endpoint}/${bucket}/${key}` URL)
 * back to its object key, so the orchestrator can figure out which R2 objects a
 * finished video consumed from the CuratedShot.photoUrl values alone. Returns
 * null for any URL that is NOT one of our R2 objects (e.g. a Cloudinary DB-photo
 * URL) — the caller uses that null to skip non-R2 shots safely.
 */
/**
 * Presigned GET URL for a SINGLE raw-footage object key (ADR-080 §5 clip download).
 * clipAnalysisService downloads one clip at a time from R2 by key; regenerating a
 * short-TTL presigned GET on demand avoids re-listing the whole bucket per clip
 * (listRawFootage) and mirrors the exact presign shape used there. The bucket is
 * private, so this is always a short-lived presigned GET — never a public URL.
 */
export async function getPresignedFootageUrl(
  key: string,
  ttlSeconds: number = PRESIGN_TTL_SECONDS,
): Promise<string> {
  const client = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucketName(), Key: key }),
    { expiresIn: ttlSeconds },
  );
}

export function extractR2KeyFromUrl(url: string): string | null {
  if (!R2_ENDPOINT || !R2_BUCKET) return null;
  try {
    const parsed = new URL(url);
    const endpointHost = new URL(R2_ENDPOINT).host;
    if (parsed.host !== endpointHost) return null;
    const pathname = parsed.pathname.replace(/^\/+/, '');
    const prefix = `${R2_BUCKET}/`;
    if (!pathname.startsWith(prefix)) return null;
    const key = pathname.slice(prefix.length);
    return key ? decodeURIComponent(key) : null;
  } catch {
    return null;
  }
}
