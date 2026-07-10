#!/usr/bin/env node

/**
 * Raw Footage Ingestion Script — ADR-079 (Motion Footage Extension), §2
 *
 * REPURPOSED (raw footage moved off Cloudinary onto Cloudflare R2): this script
 * no longer uploads local raw-footage/incoming/ files to Cloudinary. Raw footage
 * now arrives in a separate, PRIVATE Cloudflare R2 bucket
 * (`findasale-raw-footage`) that Patrick's phone auto-syncs clips into directly
 * — so there is nothing for this backend to upload. Its job is now simply to
 * LIST what's currently sitting in the R2 bucket and print, for each object, a
 * short-TTL presigned GET URL plus its inferred mediaType, so a session can
 * paste those straight into a CuratedShot list
 * (packages/backend/src/services/video/assetCuration.ts) — mediaType: 'video'
 * with a clipDuration (seconds) for clips — before calling assembleVideo()
 * (packages/backend/src/services/video/videoAssembly.ts).
 *
 * It reads NOTHING from the local filesystem and uploads NOTHING. All R2 access
 * goes through r2Client.ts, which reads the existing R2_* Railway env vars
 * (R2_ENDPOINT / R2_BUCKET / R2_REGION / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)
 * — no new credentials, no new vendor account, no Cloudinary image-credit spend.
 *
 * After a video successfully assembles, the orchestrator
 * (videoJobOrchestrator.ts) DELETES the consumed raw objects from R2 — footage
 * is transient (ADR-079). This script does not delete anything; it only lists.
 *
 * Usage:
 *   cd packages/backend
 *   npx ts-node scripts/ingestRawFootage.ts
 */

import { listRawFootage } from '../src/services/video/r2Client';

async function main(): Promise<void> {
  const objects = await listRawFootage();

  if (objects.length === 0) {
    console.log('[ingestRawFootage] R2 raw-footage bucket is empty. Nothing to list.');
    return;
  }

  console.log(`[ingestRawFootage] Found ${objects.length} object(s) in the R2 raw-footage bucket:\n`);

  for (const obj of objects) {
    console.log(`  key:       ${obj.key}`);
    console.log(`  mediaType: ${obj.mediaType}`);
    console.log(`  url:       ${obj.url}`);
    console.log('');
  }

  console.log(
    '[ingestRawFootage] Paste each url into a CuratedShot.photoUrl (set mediaType, and\n' +
      '  clipDuration in seconds for video clips), then call assembleVideo(). Presigned URLs\n' +
      '  expire in ~1 hour — re-run this script if they lapse.'
  );
}

main().catch((err) => {
  console.error('[ingestRawFootage] Fatal error:', err);
  process.exitCode = 1;
});
