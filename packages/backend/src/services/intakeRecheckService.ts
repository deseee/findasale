/**
 * intakeRecheckService.ts -- inventory recheck: run the intake quality layer over items that already exist (2026-11-05).
 *
 * Used by POST /api/internal/intake-recheck (secret-protected, routes/internal.ts). For each item it:
 *   - downloads the item's STORED photos (same SSRF guard as re-analyze), no new photos, no Vision call
 *   - uses the item's CURRENT fields as the pass-1 input (pass 1 is NOT re-run)
 *   - runs the Haiku verify pass + deterministic fixes and checks (services/intakeReview.ts), same model, same cost
 *     ceiling and daily call cap as tagging
 *   - apply=false (default): returns what it would change, writes nothing
 *   - apply=true: writes only high-confidence corrections (>= AI_VERIFY_APPLY_THRESHOLD) and deterministic fixes, only to
 *     title / description / brand / condition / category / tags, never to a field in userEditedFields, and stores the
 *     notes at Item.catalogSuggestions.intakeReview
 *
 * Hard rules: never changes price (or any price field), never touches a SOLD, DONATED or deleted item, never changes the
 * package weight (the stored weight only gets a note), and never pushes anything to a marketplace by itself.
 *
 * Marketplaces: no eBay push, no extension job, no Shopify/Etsy/Discogs/Reverb call is made here. Those pushes only happen
 * from explicit organizer actions (updateItem save, "Update eBay now"), not from database writes. For an item listed on
 * eBay with a changed title/description/condition, apply sets ebayContentDirtyAt (the same flag an organizer save sets), so
 * the eBay pull-sync cron does not pull eBay's older text back over the fix; the new text reaches eBay on the next push.
 * Extension marketplaces (Poshmark, Mercari, Vinted, ...) keep the old text until the organizer updates them. Each item
 * summary reports where it is listed (listedOn) so the caller can see which listings now differ.
 */
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { isSafeFetchUrl, SAFE_FETCH_AXIOS_OPTIONS } from '../utils/safeFetchUrl';
import { computeAnthropicCostUsd } from '../lib/aiCostTracker';
import { classifyEbayShipping } from '../utils/ebayShippingClassifier';
import { importedOnlyEditNeedsDirtyMark } from '../utils/ebayImportedEditMarker';
import { EXTENSION_PLATFORMS, listedExtensionPlatformsByItemId } from './itemMarketplaceStatusService';
import { appendIntakeNotes, intakeReviewStats, runIntakeQuality, storedWeightNote, withIntakeReview, type IntakeQualityResult } from './intakeReview';
import { verifyMaxImages } from './intakeVerifyPass';
import type { IntakeReview } from './intakeReviewTypes';

/** Item statuses a recheck may look at. SOLD and DONATED are never allowed, even when asked for. */
export const RECHECK_ALLOWED_STATUSES = ['AVAILABLE', 'RESERVED', 'INVOICE_ISSUED', 'AUCTION_ENDED'] as const;
/** Default: every live, unsold item. */
export const RECHECK_DEFAULT_STATUSES = ['AVAILABLE', 'RESERVED'] as const;
export const RECHECK_FORBIDDEN_STATUSES = ['SOLD', 'DONATED'] as const;
/** The only Item columns a recheck may write (besides catalogSuggestions and the bookkeeping flags below). */
export const RECHECK_WRITABLE_FIELDS = ['title', 'description', 'brand', 'condition', 'category', 'tags'] as const;
type WritableField = (typeof RECHECK_WRITABLE_FIELDS)[number];

const EBAY_CONTENT_FIELDS: ReadonlyArray<WritableField> = ['title', 'description', 'condition'];

export interface IntakeRecheckParams {
  organizerId?: string;
  itemIds?: string[];
  limit: number;
  apply: boolean;
  statuses: string[];
  /** Pause between items (ms). Default 750. */
  delayMs: number;
}

export interface IntakeRecheckItemSummary {
  itemId: string;
  title: string | null;
  status: 'would-change' | 'applied' | 'no-change' | 'skipped' | 'error';
  reason?: string;
  verifyPass?: IntakeReview['verifyPass'];
  verifySkipReason?: string | null;
  /** Field changes made (apply=true) or that would be made (apply=false). Price is never among them. */
  changes: Partial<Record<WritableField, { from: unknown; to: unknown }>>;
  /** Organizer-edited fields that had a suggestion and were left alone (notes only). */
  protectedFields: string[];
  stats?: ReturnType<typeof intakeReviewStats>;
  noteCodes: string[];
  costUsd: number;
  listedOn: { ebay: boolean; extension: string[] };
  /** apply=true and the item is listed on eBay with a content change: ebayContentDirtyAt was set (no push made). */
  ebayContentMarkedDirty?: boolean;
  intakeReview?: IntakeReview | null;
}

export interface IntakeRecheckResult {
  apply: boolean;
  /** Always 'none': the recheck never pushes to a marketplace. */
  marketplaceSync: 'none';
  marketplaceNote: string;
  params: { organizerId: string | null; itemIds: string[] | null; limit: number; statuses: string[] };
  stoppedEarly: string | null;
  totals: {
    considered: number;
    checked: number;
    changed: number;
    applied: number;
    skipped: number;
    errors: number;
    verifyRan: number;
    costUsd: number;
    estimatedCostPerItemUsd: number;
  };
  items: IntakeRecheckItemSummary[];
}

export class IntakeRecheckParamError extends Error {}

/** Validates the request body. Throws IntakeRecheckParamError on bad input. Exported for tests and the route. */
export function parseIntakeRecheckParams(body: unknown): IntakeRecheckParams {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const organizerId = typeof b.organizerId === 'string' && b.organizerId.trim() ? b.organizerId.trim() : undefined;
  let itemIds: string[] | undefined;
  if (b.itemIds !== undefined) {
    if (!Array.isArray(b.itemIds)) throw new IntakeRecheckParamError('itemIds must be an array of strings');
    itemIds = [...new Set(b.itemIds.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim()))].slice(0, 100);
    if (itemIds.length === 0) throw new IntakeRecheckParamError('itemIds is empty');
  }
  const rawLimit = typeof b.limit === 'number' ? b.limit : parseInt(String(b.limit ?? ''), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : 25;
  const apply = b.apply === true;
  let statuses: string[] = [...RECHECK_DEFAULT_STATUSES];
  if (b.statuses !== undefined) {
    if (!Array.isArray(b.statuses)) throw new IntakeRecheckParamError('statuses must be an array');
    const asked = b.statuses.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
    const bad = asked.filter((s) => !(RECHECK_ALLOWED_STATUSES as readonly string[]).includes(s));
    if (bad.length > 0) throw new IntakeRecheckParamError(`statuses not allowed: ${bad.join(', ')} (allowed: ${RECHECK_ALLOWED_STATUSES.join(', ')})`);
    if (asked.length > 0) statuses = [...new Set(asked)];
  }
  const rawDelay = typeof b.delayMs === 'number' ? b.delayMs : NaN;
  const delayMs = Number.isFinite(rawDelay) ? Math.max(0, Math.min(5000, Math.floor(rawDelay))) : 750;
  return { organizerId, itemIds, limit, apply, statuses, delayMs };
}

/**
 * Rough per-item verify-pass cost on Haiku 4.5 ($1 / M input, $5 / M output) when a call reports no usage: about 1,600
 * input tokens per photo sent (capped at AI_VERIFY_MAX_IMAGES, default 4) plus about 1,400 tokens of prompt, and up to
 * about 400 output tokens.
 */
export function estimateRecheckCostUsd(photoCount: number, model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'): number {
  const photos = Math.max(1, Math.min(photoCount, verifyMaxImages()));
  return computeAnthropicCostUsd(model, photos * 1600 + 1400, 400);
}

const ITEM_SELECT = {
  id: true,
  title: true,
  description: true,
  brand: true,
  condition: true,
  category: true,
  tags: true,
  mpn: true,
  photoUrls: true,
  status: true,
  deletedAt: true,
  userEditedFields: true,
  catalogSuggestions: true,
  packageWeightOz: true,
  packageConfirmedByOrganizer: true,
  ebayOfferId: true,
  ebayListingId: true,
  updatedAt: true,
} as const;

type RecheckItem = {
  id: string;
  title: string | null;
  description: string | null;
  brand: string | null;
  condition: string | null;
  category: string | null;
  tags: string[];
  mpn: string | null;
  photoUrls: string[];
  status: string;
  deletedAt: Date | null;
  userEditedFields: string[];
  catalogSuggestions: unknown;
  packageWeightOz: number | null;
  packageConfirmedByOrganizer: boolean | null;
  ebayOfferId: string | null;
  ebayListingId: string | null;
  updatedAt: Date;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadPhotos(urls: string[]): Promise<{ images: string[]; mimeTypes: string[] }> {
  const images: string[] = [];
  const mimeTypes: string[] = [];
  for (const url of urls.slice(0, 5)) {
    if (!isSafeFetchUrl(url)) continue;
    try {
      const resp = await axios.get(url, {
        ...SAFE_FETCH_AXIOS_OPTIONS,
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'User-Agent': 'FindaSale-ImageTagger/1.0 (+https://finda.sale; secondary-sale item tagging)' },
      });
      const contentType = String(resp.headers?.['content-type'] || '').split(';')[0].trim();
      images.push(Buffer.from(resp.data).toString('base64'));
      mimeTypes.push(contentType.startsWith('image/') ? contentType : 'image/jpeg');
    } catch (err) {
      console.warn('[intakeRecheck] photo download failed:', err instanceof Error ? err.message : err);
    }
  }
  return { images, mimeTypes };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  return (a ?? null) === (b ?? null);
}

/** Runs the recheck. Sequential, one item at a time, stops when the cost ceiling or daily cap is hit. Never throws per item. */
export async function runIntakeRecheck(params: IntakeRecheckParams): Promise<IntakeRecheckResult> {
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  const statuses = params.statuses.filter((s) => !(RECHECK_FORBIDDEN_STATUSES as readonly string[]).includes(s));
  const where: Record<string, unknown> = {
    deletedAt: null,
    status: { in: statuses, notIn: [...RECHECK_FORBIDDEN_STATUSES] },
  };
  if (params.itemIds) where.id = { in: params.itemIds };
  if (params.organizerId) where.OR = [{ organizerId: params.organizerId }, { sale: { organizerId: params.organizerId } }];

  const items = (await prisma.item.findMany({
    where: where as any,
    select: ITEM_SELECT,
    orderBy: { createdAt: 'desc' },
    take: params.limit,
  })) as unknown as RecheckItem[];

  const summaries: IntakeRecheckItemSummary[] = [];
  const emptyListed = { ebay: false, extension: [] as string[] };

  // Requested ids that were not returned: sold, donated, deleted, another organizer's, or not found.
  if (params.itemIds) {
    const found = new Set(items.map((i) => i.id));
    for (const id of params.itemIds) {
      if (!found.has(id)) {
        summaries.push({ itemId: id, title: null, status: 'skipped', reason: 'not eligible (sold, donated, deleted, other status or not found)', changes: {}, protectedFields: [], noteCodes: [], costUsd: 0, listedOn: emptyListed });
      }
    }
  }

  // Where each item is listed (one batched query). Best-effort: a failure only blanks the extension list.
  let extensionByItem = new Map<string, Set<string>>();
  try {
    if (items.length > 0) {
      const rows = await prisma.marketplaceListingJob.findMany({
        where: { itemId: { in: items.map((i) => i.id) }, platform: { in: [...EXTENSION_PLATFORMS] } },
        select: { itemId: true, platform: true, action: true, status: true, createdAt: true, lastErrorMessage: true, syncedQuantity: true },
      });
      extensionByItem = listedExtensionPlatformsByItemId(rows as any) as unknown as Map<string, Set<string>>;
    }
  } catch (err) {
    console.warn('[intakeRecheck] marketplace listing lookup failed (listedOn.extension left empty):', err instanceof Error ? err.message : err);
  }

  let stoppedEarly: string | null = null;
  let costUsd = 0;
  let verifyRan = 0;
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const listedOn = { ebay: !!(item.ebayOfferId || item.ebayListingId), extension: [...(extensionByItem.get(item.id) ?? [])] };
    const base: IntakeRecheckItemSummary = { itemId: item.id, title: item.title, status: 'no-change', changes: {}, protectedFields: [], noteCodes: [], costUsd: 0, listedOn };
    if (stoppedEarly) {
      summaries.push({ ...base, status: 'skipped', reason: stoppedEarly });
      continue;
    }
    // Belt and braces: the query already excludes these.
    if ((RECHECK_FORBIDDEN_STATUSES as readonly string[]).includes(item.status) || item.deletedAt) {
      summaries.push({ ...base, status: 'skipped', reason: `status ${item.status}` });
      continue;
    }
    try {
      if (!item.photoUrls || item.photoUrls.length === 0) {
        summaries.push({ ...base, status: 'skipped', reason: 'no photos' });
        continue;
      }
      const { images, mimeTypes } = await downloadPhotos(item.photoUrls);
      if (images.length === 0) {
        summaries.push({ ...base, status: 'skipped', reason: 'photo download failed' });
        continue;
      }
      const edited = item.userEditedFields ?? [];
      // Current fields are the pass-1 input. No weight estimate: a recheck never changes the package weight.
      const pass1: IntakeQualityResult = {
        title: item.title ?? '',
        description: item.description ?? '',
        brand: item.brand ?? undefined,
        condition: item.condition ?? '',
        category: item.category ?? undefined,
        tags: Array.isArray(item.tags) ? [...item.tags] : [],
        mpn: item.mpn ?? undefined,
      };
      const review0 = await runIntakeQuality(pass1, {
        imageBase64Array: images,
        mimeTypes,
        userEditedFields: edited,
        organizerWeightSet: true,
        priorTitle: item.title,
        priorDescription: item.description,
        totalPhotoCount: item.photoUrls.length,
        logLabel: `recheck item=${item.id} apply=${params.apply}`,
      });
      // Stored weight: note only (never changed), and only when the organizer did not set it.
      const organizerWeight = item.packageConfirmedByOrganizer === true || edited.includes('packageWeightOz');
      const weightNote = organizerWeight ? null : storedWeightNote(review0.family, item.packageWeightOz, item.title);
      const review = weightNote ? appendIntakeNotes(review0, [weightNote]) : review0;

      if (review.verifyPass === 'ran') {
        verifyRan += 1;
        const itemCost = review.verifyUsage
          ? computeAnthropicCostUsd(model, review.verifyUsage.inputTokens, review.verifyUsage.outputTokens)
          : estimateRecheckCostUsd(images.length, model);
        base.costUsd = Math.round(itemCost * 1e6) / 1e6;
        costUsd += itemCost;
      }
      base.verifyPass = review.verifyPass;
      base.verifySkipReason = review.verifySkipReason ?? null;
      base.stats = intakeReviewStats(review);
      base.noteCodes = review.notes.map((n) => n.code);
      base.intakeReview = review;

      const changes: IntakeRecheckItemSummary['changes'] = {};
      const current: Record<WritableField, unknown> = {
        title: item.title, description: item.description, brand: item.brand, condition: item.condition, category: item.category, tags: item.tags,
      };
      const next: Record<WritableField, unknown> = {
        title: pass1.title, description: pass1.description, brand: pass1.brand ?? null, condition: pass1.condition, category: pass1.category ?? null, tags: pass1.tags,
      };
      for (const field of RECHECK_WRITABLE_FIELDS) {
        if (sameValue(current[field], next[field])) continue;
        if (edited.includes(field)) {
          base.protectedFields.push(field);
          continue; // organizer intent wins (the merge already skips these; this is the second guard)
        }
        if (next[field] == null || next[field] === '') continue; // never blank a field
        changes[field] = { from: current[field] ?? null, to: next[field] };
      }
      base.changes = changes;
      const changedFields = Object.keys(changes) as WritableField[];

      if (!params.apply) {
        summaries.push({ ...base, status: changedFields.length > 0 ? 'would-change' : 'no-change' });
      } else {
        const data: Record<string, unknown> = {};
        for (const f of changedFields) data[f] = changes[f]!.to;
        data.catalogSuggestions = withIntakeReview(item.catalogSuggestions, undefined, review);
        if (data.category !== undefined || data.tags !== undefined) {
          data.ebayShippingClassification = classifyEbayShipping(
            (data.category !== undefined ? data.category : item.category) as string | null,
            (data.tags !== undefined ? data.tags : item.tags) as string[]
          );
        }
        const ebayContentChange = listedOn.ebay && changedFields.some((f) => EBAY_CONTENT_FIELDS.includes(f));
        const importedDirty = importedOnlyEditNeedsDirtyMark(item, {
          title: data.title as string | undefined,
          description: data.description as string | undefined,
          condition: data.condition as string | undefined,
          category: data.category as string | undefined,
          tags: data.tags as string[] | undefined,
        });
        if (ebayContentChange || importedDirty) data.ebayContentDirtyAt = new Date();
        // Optimistic lock + status guard: an organizer edit or a sale since the read wins; nothing is written.
        const written = await prisma.item.updateMany({
          where: { id: item.id, updatedAt: item.updatedAt, deletedAt: null, status: { notIn: [...RECHECK_FORBIDDEN_STATUSES] } },
          data: data as any,
        });
        if (written.count === 0) {
          summaries.push({ ...base, status: 'skipped', reason: 'item changed or sold during the recheck; nothing written', changes: {} });
        } else {
          summaries.push({
            ...base,
            status: changedFields.length > 0 ? 'applied' : 'no-change',
            ebayContentMarkedDirty: data.ebayContentDirtyAt !== undefined ? true : undefined,
          });
        }
      }

      if (review.verifyPass === 'gated') {
        stoppedEarly = `stopped: ${review.verifySkipReason || 'AI cost ceiling or daily cap reached'}`;
      }
    } catch (err) {
      console.warn(`[intakeRecheck] item ${item.id} failed:`, err instanceof Error ? err.message : err);
      summaries.push({ ...base, status: 'error', reason: String(err instanceof Error ? err.message : err).slice(0, 200) });
    }
    if (params.delayMs > 0 && idx < items.length - 1 && !stoppedEarly) await sleep(params.delayMs);
  }

  const count = (s: IntakeRecheckItemSummary['status']) => summaries.filter((x) => x.status === s).length;
  const result: IntakeRecheckResult = {
    apply: params.apply,
    marketplaceSync: 'none',
    marketplaceNote:
      'No marketplace was updated. eBay-listed items with a changed title, description or condition are marked as having a local edit (ebayContentDirtyAt) so the eBay pull does not undo it; the new text goes to eBay on the next push. Extension marketplaces keep the old text until the organizer updates them.',
    params: { organizerId: params.organizerId ?? null, itemIds: params.itemIds ?? null, limit: params.limit, statuses },
    stoppedEarly,
    totals: {
      considered: items.length,
      checked: summaries.filter((s) => s.verifyPass !== undefined).length,
      changed: count('would-change') + count('applied'),
      applied: count('applied'),
      skipped: count('skipped'),
      errors: count('error'),
      verifyRan,
      costUsd: Math.round(costUsd * 1e6) / 1e6,
      estimatedCostPerItemUsd: Math.round(estimateRecheckCostUsd(4, model) * 1e6) / 1e6,
    },
    items: summaries,
  };
  console.log(
    `[intakeRecheck] apply=${params.apply} considered=${result.totals.considered} checked=${result.totals.checked} changed=${result.totals.changed} applied=${result.totals.applied} skipped=${result.totals.skipped} errors=${result.totals.errors} verifyRan=${verifyRan} costUsd=${result.totals.costUsd}${stoppedEarly ? ` ${stoppedEarly}` : ''}`
  );
  return result;
}
