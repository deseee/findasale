#!/usr/bin/env node

/**
 * Raw Footage Ingestion Script — ADR-079 (Motion Footage Extension), §2
 *
 * One-off, session-triggered script (NOT a cron/watcher — ADR-079 explicitly
 * scopes day-one ingestion as manual, "keep it simple, day one"). Reads
 * whatever files Patrick has dropped into raw-footage/incoming/ (repo root,
 * gitignored — see root .gitignore and ADR-079 §2 for why this lives outside
 * claude_docs/), uploads each to Cloudinary using the SAME
 * cloudinary.uploader.upload pattern videoAssembly.ts already uses
 * (packages/backend/src/services/video/videoAssembly.ts's
 * uploadFileToCloudinary()) — same CLOUDINARY_* env vars, no new credentials,
 * no new vendor account. Video files (.mp4/.mov/.m4v/.webm/.avi/.mkv) upload
 * with resource_type: 'video'; anything else uploads with resource_type:
 * 'image'.
 *
 * After a successful upload, the source file is moved to
 * raw-footage/processed/ so re-running the script never re-uploads the same
 * file (simple filesystem idempotency — no DB bookkeeping needed for Phase 1
 * volume, per ADR-079 §2).
 *
 * Prints each resulting secure_url + inferred mediaType so a session can paste
 * it directly into a CuratedShot entry
 * (packages/backend/src/services/video/assetCuration.ts) with
 * mediaType: 'video' and a clipDuration (seconds), when building/calling
 * assembleVideo() (packages/backend/src/services/video/videoAssembly.ts).
 * Cloudinary URLs self-describe media type via their /image/upload/ vs.
 * /video/upload/ path segment (ADR-079 §4) — matches assetCuration.ts's
 * inferMediaTypeFromUrl() helper exactly.
 *
 * Usage:
 *   cd packages/backend
 *   npx ts-node scripts/ingestRawFootage.ts
 *
 * Requires the same CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
 * CLOUDINARY_API_SECRET env vars already used elsewhere in this backend
 * (packages/backend/.env locally, or Railway env vars in production — this
 * script has no separate config path and creates no new credentials).
 */

import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs/promises';
import path from 'path';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// repo root is 3 levels up from packages/backend/scripts/
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const INCOMING_DIR = path.join(REPO_ROOT, 'raw-footage', 'incoming');
const PROCESSED_DIR = path.join(REPO_ROOT, 'raw-footage', 'processed');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv']);

function resourceTypeFor(fileName: string): 'video' | 'image' {
  return VIDEO_EXTENSIONS.has(path.extname(fileName).toLowerCase()) ? 'video' : 'image';
}

function uploadFileToCloudinary(
  filePath: string,
  resourceType: 'video' | 'image',
  folder: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(filePath, { resource_type: resourceType, folder }, (error, result) => {
      if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));
      resolve(result.secure_url);
    });
  });
}

async function main(): Promise<void> {
  await fs.mkdir(INCOMING_DIR, { recursive: true });
  await fs.mkdir(PROCESSED_DIR, { recursive: true });

  const entries = await fs.readdir(INCOMING_DIR, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && !e.name.startsWith('.'));

  if (files.length === 0) {
    console.log(`[ingestRawFootage] No files found in ${INCOMING_DIR}. Nothing to do.`);
    return;
  }

  console.log(`[ingestRawFootage] Found ${files.length} file(s) in ${INCOMING_DIR}.`);

  for (const entry of files) {
    const fileName = entry.name;
    const sourcePath = path.join(INCOMING_DIR, fileName);
    const resourceType = resourceTypeFor(fileName);

    try {
      console.log(`[ingestRawFootage] Uploading ${fileName} (resource_type=${resourceType}) ...`);
      const secureUrl = await uploadFileToCloudinary(sourcePath, resourceType, 'findasale/raw-footage');
      console.log(`[ingestRawFootage]   -> ${secureUrl}  (mediaType=${resourceType})`);

      const destPath = path.join(PROCESSED_DIR, fileName);
      await fs.rename(sourcePath, destPath);
      console.log(`[ingestRawFootage]   moved to ${destPath}`);
    } catch (err: any) {
      console.error(`[ingestRawFootage] FAILED for ${fileName}:`, err?.message ?? err);
    }
  }

  console.log('[ingestRawFootage] Done.');
}

main().catch((err) => {
  console.error('[ingestRawFootage] Fatal error:', err);
  process.exitCode = 1;
});
