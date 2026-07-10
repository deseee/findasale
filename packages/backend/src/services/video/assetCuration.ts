/**
 * assetCuration.ts — ADR-078 (Automated Video Content Pipeline), Wave 2a.
 *
 * First stage of the video production pipeline (asset curation -> script ->
 * voiceover -> assembly -> captions -> thumbnail). Pulls a Sale's real items +
 * Cloudinary photos and scores/orders them into a shot list for the video
 * assembler, reusing tags/labels ALREADY stored by cloudAIService.ts's Vision
 * -> Haiku tagging pass. This module makes NO new Vision API calls and no new
 * Anthropic calls — it only reads data that already exists on Photo/Item rows.
 *
 * Data sources (see packages/database/prisma/schema.prisma):
 *   - Photo.visionLabels   String[]   — aggregated Vision API labels for that photo
 *   - Photo.photoRole      PhotoRole  — FRONT | BACK_STAMP | DETAIL_DAMAGE | LABEL_BRAND | MULTI_ANGLE | UNKNOWN
 *   - Photo.isPrimary      Boolean    — organizer/AI-selected best photo for the item
 *   - Item.aiConfidence    Float      — Camera Workflow v2 AI confidence score (0.0-1.0)
 *   - Item.isHighValue     Boolean    — Feature #371 auto/manual high-value flag
 *   - Item.tags            String[]  — CB5 AI-generated search tags
 *   - Item.photoUrls       String[]  — legacy fallback for items with no Photo rows yet
 *
 * Two trigger shapes (VideoTriggerType):
 *   - saleId set     (SALE_LIVE / SALE_ENDING / MANUAL-with-sale) — real DB-backed curation below.
 *   - guideTopic set (GUIDE_LIBRARY / MANUAL-guide)               — see "Guide-topic path" section;
 *     there is currently no DB-backed visual asset source for evergreen guide content
 *     (confirmed against claude_docs/strategy/guide-and-video-library-plan.md — existing
 *     `/packages/frontend/public/*.html` assets are sales/ad pitches, not guide screenshots,
 *     and the plan's own "real screenshots from a seed account" note has no automated
 *     capture pipeline yet). Returns an empty shot list rather than inventing a source.
 */

import { prisma } from '../../lib/prisma';

/**
 * ADR-079 (Motion Footage Extension): Cloudinary URLs are self-describing —
 * an image upload URL contains `/image/upload/` and a video upload URL
 * contains `/video/upload/` (confirmed against videoAssembly.ts's own
 * `uploader.upload(filePath, { resource_type: 'video', ... })` call and
 * Cloudinary's standard URL structure). No schema/DB field is needed to carry
 * this — a substring check on the URL itself is sufficient and reliable.
 */
const VIDEO_URL_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv']);

export function inferMediaTypeFromUrl(url: string): 'image' | 'video' {
  // Cloudinary URLs self-describe via their path segment — keep these two
  // checks FIRST so existing DB-photo (Cloudinary) behavior is unchanged.
  if (url.includes('/video/upload/')) return 'video';
  if (url.includes('/image/upload/')) return 'image';
  // ADR-079 R2 extension: raw footage now lives on Cloudflare R2, whose
  // presigned GET URLs (and plain object keys) are NOT self-describing by path
  // segment — infer by file extension instead. Strip any query string first so
  // a presigned URL's ?X-Amz-... params don't defeat the extension match.
  const qIndex = url.indexOf('?');
  const pathPart = qIndex >= 0 ? url.slice(0, qIndex) : url;
  const dot = pathPart.lastIndexOf('.');
  const slash = pathPart.lastIndexOf('/');
  const ext = dot > slash ? pathPart.slice(dot).toLowerCase() : '';
  return VIDEO_URL_EXTENSIONS.has(ext) ? 'video' : 'image';
}

/** One curated shot in final video order. */
export interface CuratedShot {
  itemId: string;
  photoUrl: string;
  itemTitle: string;
  photoRole: string; // PhotoRole enum value, or 'LEGACY' when sourced from Item.photoUrls fallback (no Photo row)
  score: number;
  reason: string; // short human-readable justification — useful for the AWAITING_REVIEW staged file and QA
  /**
   * ADR-079: media type of `photoUrl`'s Cloudinary asset, inferred via
   * inferMediaTypeFromUrl() above. Every shot produced by curateFromSale()/
   * curateFromGuideTopic() today is 'image' — those paths only ever pull
   * Photo.url / Item.photoUrls entries, which are always images. A 'video'
   * shot is added to a shot list manually by a session (via the raw-footage/
   * ingestion path, packages/backend/scripts/ingestRawFootage.ts) before
   * calling assembleVideo() directly — this module does not yet generate
   * video shots itself.
   */
  mediaType: 'image' | 'video';
  /**
   * ADR-079: required when mediaType==='video' — the exact number of seconds
   * of the clip to feature (its own full length if short enough to feature in
   * full, or a chosen trim window if longer). This is a curation-time
   * decision, NOT something assembleVideo() infers or measures itself.
   * Ignored for mediaType==='image' shots (their duration is computed from
   * the remaining voiceover time budget instead — see videoAssembly.ts).
   */
  clipDuration?: number;
}

export interface CurateAssetsInput {
  saleId?: string; // present for SALE_LIVE / SALE_ENDING / sale-scoped MANUAL jobs
  guideTopic?: string; // present for GUIDE_LIBRARY / guide-scoped MANUAL jobs
  maxShots?: number; // cap on shot list length; default 12 (roughly a 45-60s video at ~4-5s/shot)
}

export interface AssetCurationResult {
  /** Cloudinary photo URLs only, in final video order — the shape ADR-078 asks this module to output. */
  orderedShotList: string[];
  /** Same shots with metadata (real item id/title) so scriptGenerator.ts can ground its script
   *  in real DB fields without re-querying by URL. */
  shots: CuratedShot[];
}

// Per-photo-role weight for shot-list scoring. FRONT and LABEL_BRAND are the clearest,
// most identifiable "establishing" shots for a video; DETAIL_DAMAGE photos are the least
// flattering for a promo/attention clip (still usable, just weighted lower) — same role
// vocabulary cloudAIService.ts's buildRoleContextPrompt() already uses for tagging context.
const PHOTO_ROLE_WEIGHT: Record<string, number> = {
  FRONT: 30,
  LABEL_BRAND: 20,
  MULTI_ANGLE: 12,
  BACK_STAMP: 8,
  DETAIL_DAMAGE: 4,
  UNKNOWN: 10,
};

const DEFAULT_MAX_SHOTS = 12;
const HIGH_VALUE_PRICE_CAP = 200; // dollars — price contribution to score caps out here

/**
 * Score a single photo. Higher = a clearer, more "showable" shot.
 *   - Photo role weight (FRONT/LABEL_BRAND favored, DETAIL_DAMAGE deprioritized)
 *   - +15 if this is the item's isPrimary photo (already vetted as the best shot)
 *   - + up to 20 for Vision label richness (more legible labels = a clearer, more
 *     specific subject — same "specificity helps" reasoning cloudAIService.ts's
 *     Haiku prompts already lean on for tagging confidence)
 */
function scorePhoto(photo: { photoRole: string; isPrimary: boolean; visionLabels: string[] }): number {
  let score = PHOTO_ROLE_WEIGHT[photo.photoRole] ?? PHOTO_ROLE_WEIGHT.UNKNOWN;
  if (photo.isPrimary) score += 15;
  score += Math.min(photo.visionLabels?.length ?? 0, 10) * 2;
  return score;
}

/**
 * Score the item itself (independent of which photo is chosen). Higher = a more
 * interesting item to feature in the video.
 *   - AI confidence (0-20) — a confidently-identified item is less likely to be
 *     mislabeled on camera
 *   - +15 for isHighValue items — these are the items most worth showcasing
 *   - Tag richness (up to +12) — more descriptive tags usually means a more
 *     visually/narratively interesting item (era, maker, material all present)
 *   - Price (up to +20, capped at $200) — pricier items tend to be the more
 *     compelling "wow" items for a promo/attention hook
 */
function scoreItem(item: { aiConfidence: number | null; isHighValue: boolean; tags: string[]; price: number | null }): number {
  let score = (item.aiConfidence ?? 0.5) * 20;
  if (item.isHighValue) score += 15;
  score += Math.min(item.tags?.length ?? 0, 8) * 1.5;
  if (item.price) score += Math.min(item.price, HIGH_VALUE_PRICE_CAP) / 10;
  return score;
}

/** Sale-scoped candidate before final ordering/dedup. */
interface Candidate {
  itemId: string;
  itemTitle: string;
  photoUrl: string;
  photoRole: string;
  score: number;
  reason: string;
}

/**
 * Real-asset curation for a Sale (SALE_LIVE / SALE_ENDING / sale-scoped MANUAL).
 * Picks the single best photo per item (dedup — a shot list should not repeat the
 * same item), scores candidates by item-level + photo-level signals combined, and
 * returns the top `maxShots` in descending score order.
 */
async function curateFromSale(saleId: string, maxShots: number): Promise<AssetCurationResult> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: {
        where: { isActive: true, deletedAt: null, status: 'AVAILABLE' },
        include: {
          photos: {
            orderBy: [{ isPrimary: 'desc' }, { orderIndex: 'asc' }],
          },
        },
      },
    },
  });

  if (!sale) {
    throw new Error(`assetCuration: Sale ${saleId} not found`);
  }
  if (sale.status !== 'PUBLISHED') {
    throw new Error(`assetCuration: Sale ${saleId} is not PUBLISHED (status=${sale.status}) — refusing to curate assets for a non-live sale`);
  }

  const candidates: Candidate[] = [];

  for (const item of sale.items) {
    const itemScore = scoreItem({
      aiConfidence: item.aiConfidence,
      isHighValue: item.isHighValue,
      tags: item.tags,
      price: item.price,
    });

    if (item.photos.length > 0) {
      // Photo rows exist — pick the single best-scoring photo for this item.
      let best = item.photos[0];
      let bestPhotoScore = scorePhoto(best);
      for (const photo of item.photos) {
        const photoScore = scorePhoto(photo);
        if (photoScore > bestPhotoScore) {
          best = photo;
          bestPhotoScore = photoScore;
        }
      }
      candidates.push({
        itemId: item.id,
        itemTitle: item.title,
        photoUrl: best.url,
        photoRole: best.photoRole,
        score: itemScore + bestPhotoScore,
        reason: `role=${best.photoRole}${best.isPrimary ? ' (primary)' : ''}, ${best.visionLabels?.length ?? 0} vision labels, aiConfidence=${(item.aiConfidence ?? 0.5).toFixed(2)}${item.isHighValue ? ', high-value' : ''}`,
      });
    } else if (item.photoUrls.length > 0) {
      // Legacy fallback: item predates the Photo table (no per-photo role/label data).
      // Use the first photoUrl (existing "primary photo" convention elsewhere in the
      // codebase, e.g. cloudAIService.ts's selectBestEbayFrame index-0 fallback).
      candidates.push({
        itemId: item.id,
        itemTitle: item.title,
        photoUrl: item.photoUrls[0],
        photoRole: 'LEGACY',
        score: itemScore, // no per-photo signal available, item-level score only
        reason: `legacy photoUrls fallback (no Photo record), aiConfidence=${(item.aiConfidence ?? 0.5).toFixed(2)}${item.isHighValue ? ', high-value' : ''}`,
      });
    }
    // Items with no photos at all (photos.length === 0 AND photoUrls.length === 0)
    // are skipped — nothing to show.
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, maxShots);

  const shots: CuratedShot[] = top.map((c) => ({
    itemId: c.itemId,
    photoUrl: c.photoUrl,
    itemTitle: c.itemTitle,
    photoRole: c.photoRole,
    score: Math.round(c.score * 100) / 100,
    reason: c.reason,
    // ADR-079: always 'image' here — every candidate above is sourced from a
    // real Photo.url or legacy Item.photoUrls entry, both of which are
    // Cloudinary image uploads, never video.
    mediaType: inferMediaTypeFromUrl(c.photoUrl),
  }));

  return {
    orderedShotList: shots.map((s) => s.photoUrl),
    shots,
  };
}

/**
 * Guide-topic path (GUIDE_LIBRARY trigger, no saleId). There is no DB-backed source
 * of curated visual assets for evergreen guide content today:
 *   - `/packages/frontend/public/*-video-ad*.html` and `*-video.html` assets referenced
 *     in claude_docs/strategy/guide-and-video-library-plan.md §2 are sales/ad pitch
 *     videos, not per-guide-topic screenshots — wrong content, not a real source.
 *   - The plan's §6.3 "Screenshots are real screenshots from a seed account, not
 *     mockups" is a production NOTE for humans building written guides, not an
 *     automated capture pipeline with a queryable table.
 * TODO(ADR-078 Phase 1 follow-up): once a real guide-asset source exists (e.g. a
 * seed-account screenshot capture step, or a curated CMS-style asset list keyed by
 * guideTopic), wire it in here. Until then, return an empty shot list rather than
 * inventing a fake data source — scriptGenerator.ts / videoAssembly.ts must treat an
 * empty orderedShotList as "no visuals available yet" for this guideTopic.
 */
function curateFromGuideTopic(guideTopic: string): AssetCurationResult {
  console.warn(`[assetCuration] No curated visual asset source exists yet for guideTopic="${guideTopic}" — returning empty shot list. See TODO in assetCuration.ts.`);
  return { orderedShotList: [], shots: [] };
}

/**
 * Curate and order the visual assets (Cloudinary photo URLs) for a VideoJob.
 * Exactly one of `input.saleId` / `input.guideTopic` must be provided, matching
 * VideoJob's own nullable-pair shape (ADR-078 schema: saleId? / guideTopic?).
 */
export async function curateAssetsForVideo(input: CurateAssetsInput): Promise<AssetCurationResult> {
  const { saleId, guideTopic, maxShots = DEFAULT_MAX_SHOTS } = input;

  if (!saleId && !guideTopic) {
    throw new Error('curateAssetsForVideo: one of saleId or guideTopic is required');
  }
  if (saleId && guideTopic) {
    throw new Error('curateAssetsForVideo: saleId and guideTopic are mutually exclusive');
  }

  if (saleId) {
    return curateFromSale(saleId, maxShots);
  }

  return curateFromGuideTopic(guideTopic as string);
}
