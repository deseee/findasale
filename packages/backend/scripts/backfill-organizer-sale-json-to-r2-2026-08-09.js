#!/usr/bin/env node
/**
 * backfill-organizer-sale-json-to-r2-2026-08-09.js
 *
 * ADDITIVE / READ-MOSTLY. Does NOT delete or null out the original JSON columns.
 * Uploads Organizer.esnMemberships, Organizer.sourcesJson, and Sale.scrapedMetadata
 * to the EXISTING findasale-raw-footage R2 bucket under a distinct "organizer-blobs/"
 * and "sale-blobs/" key prefix (NOT touched by footageRetentionCron.ts, which only
 * deletes keys it finds via FootageBatch DB rows -- these new keys are never
 * registered there, so they are safe from that sweep).
 *
 * Run this AFTER the ALTER TABLE block (see r2-columns.sql) has been applied.
 *
 * Usage:
 *   cd C:\Users\desee\ClaudeProjects\FindaSale\packages\backend
 *   node scripts\backfill-organizer-sale-json-to-r2-2026-08-09.js --limit 15
 *
 * Start with --limit 15 (small test batch). Once you've spot-checked the
 * results (see the printed R2 keys), re-run with a bigger --limit or drop the
 * flag to process everything NULL-R2-key rows in batches of 500 until done --
 * safe to re-run any time, it only touches rows where the *R2Key column is
 * still NULL.
 */
const { PrismaClient } = require('@prisma/client');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const prisma = new PrismaClient();

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_REGION = process.env.R2_REGION || 'auto';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const s3 = new S3Client({
  region: R2_REGION,
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

async function uploadJson(key, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: 'application/json' }));
  return body.length;
}

function getLimit() {
  const i = process.argv.indexOf('--limit');
  return i !== -1 ? parseInt(process.argv[i + 1], 10) : 500;
}

async function backfillOrganizerField(field, keyField, prefix, limit) {
  const rows = await prisma.organizer.findMany({
    where: { [field]: { not: null }, [keyField]: null },
    select: { id: true, [field]: true },
    take: limit,
  });
  let bytes = 0;
  for (const row of rows) {
    const key = `${prefix}/${row.id}/${field}.json`;
    const size = await uploadJson(key, row[field]);
    bytes += size;
    await prisma.organizer.update({ where: { id: row.id }, data: { [keyField]: key } });
    console.log(`  Organizer ${row.id} ${field} -> ${key} (${size} bytes)`);
  }
  console.log(`Organizer.${field}: ${rows.length} rows backfilled, ${bytes} bytes uploaded`);
  return rows.length;
}

async function backfillSaleScrapedMetadata(limit) {
  const rows = await prisma.sale.findMany({
    where: { scrapedMetadata: { not: null }, scrapedMetadataR2Key: null },
    select: { id: true, scrapedMetadata: true },
    take: limit,
  });
  let bytes = 0;
  for (const row of rows) {
    const key = `sale-blobs/${row.id}/scrapedMetadata.json`;
    const size = await uploadJson(key, row.scrapedMetadata);
    bytes += size;
    await prisma.sale.update({ where: { id: row.id }, data: { scrapedMetadataR2Key: key } });
    console.log(`  Sale ${row.id} scrapedMetadata -> ${key} (${size} bytes)`);
  }
  console.log(`Sale.scrapedMetadata: ${rows.length} rows backfilled, ${bytes} bytes uploaded`);
  return rows.length;
}

(async () => {
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('Missing R2_* env vars -- run this where the backend env is loaded (Railway run, or a local .env with the Railway values).');
    process.exit(1);
  }
  const limit = getLimit();
  console.log(`Starting backfill, limit=${limit} rows per field. Original JSON columns are NOT modified.`);
  await backfillOrganizerField('esnMemberships', 'esnMembershipsR2Key', 'organizer-blobs', limit);
  await backfillOrganizerField('sourcesJson', 'sourcesJsonR2Key', 'organizer-blobs', limit);
  await backfillSaleScrapedMetadata(limit);
  await prisma.$disconnect();
  console.log('Done. Original JSON columns untouched -- re-run with a larger --limit (or no flag) to continue.');
})().catch((e) => { console.error(e); process.exit(1); });
