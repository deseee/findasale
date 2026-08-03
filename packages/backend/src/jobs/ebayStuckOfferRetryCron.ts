/**
 * ebayStuckOfferRetryCron.ts — Auto-retry eBay offers stuck in "Pending Publish"
 *
 * Root cause this closes (S1215, 2026-08-03 diagnostic): the eBay Inventory API
 * publish flow always persists Item.ebayOfferId immediately after creating the
 * offer, THEN attempts the separate publish call (see pushSaleToEbay /
 * publishItemOffer in ebayController.ts, and ebayPublishWithSelfHeal in
 * ebayPublishService.ts). If that publish step fails for any reason — an eBay
 * errorId with no registered healer, or a network/timeout error — the item is
 * left with ebayOfferId set and ebayListingId null. The organizer sees a
 * "Pending Publish" badge with a manual "Publish now" button, but NOTHING
 * previously retried this automatically. Two real production items
 * (cmr3qfir2000d13dy3ppkn3rl, cmsaozd8600vnjgvqfajiohfm) sat in this state
 * indefinitely because no organizer happened to click the button again.
 *
 * This cron closes that gap WITHOUT the classic eBay Inventory API footgun of
 * re-calling "create offer" on an item that already has one (which throws a
 * duplicate-offer error and makes things worse). It is offer-aware by
 * construction: the query only selects items that already have ebayOfferId
 * set, and ebayPublishWithSelfHeal() — same self-heal loop pushSaleToEbay and
 * publishItemOffer already use — ONLY ever POSTs
 * /sell/inventory/v1/offer/{offerId}/publish (and its registered healers PUT/
 * GET/DELETE that same existing offer). It never calls
 * POST /sell/inventory/v1/offer to create a new one.
 *
 * Runs every 2 hours. Each item is attempted at most once per failure —
 * ebayNeedsReview is set true on any failed attempt (by this cron or by the
 * two manual publish call sites, see ebayController.ts S1215 fix) and the
 * query excludes items already flagged, so a permanently-broken offer is
 * retried once, flagged, and then left alone rather than hammered forever.
 * An organizer (or Patrick, via the item editor / re-push) can always clear
 * ebayNeedsReview by successfully publishing again, which re-enters this
 * cron's retry pool.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { refreshEbayAccessToken } from '../services/ebayHttp';
import { ebayPublishWithSelfHeal } from '../services/ebayPublishService';
import { isEbayRateLimited } from '../lib/ebayRateLimiter';

const EBAY_API_DELAY_MS = 250;
// Only retry items whose offer hasn't been touched in a while — avoids racing
// a publish that is still genuinely in-flight from a concurrent organizer
// action (pushSaleToEbay / publishItemOffer / itemController PushSync all
// update Item.updatedAt as part of the same request that created the offer).
const MIN_STALE_MINUTES = 30;
// Bound worst-case load per run across all organizers.
const MAX_ITEMS_PER_RUN = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface StuckItem {
  id: string;
  title: string;
  condition: string | null;
  brand: string | null;
  mpn: string | null;
  ebayCategoryId: string | null;
  ebayCategoryName: string | null;
  ebayOfferId: string | null;
  category: string | null;
  isbn: string | null;
  draftStatus: string | null;
  ebayListedAt: Date | null;
  sale: { organizerId: string } | null;
}

async function retryStuckOffer(item: StuckItem, accessToken: string): Promise<boolean> {
  try {
    const healResult = await ebayPublishWithSelfHeal({
      item: {
        id: item.id,
        title: item.title,
        condition: item.condition,
        brand: item.brand,
        mpn: item.mpn,
        ebayCategoryId: item.ebayCategoryId,
        ebayCategoryName: item.ebayCategoryName,
        ebayOfferId: item.ebayOfferId,
        category: item.category,
        isbn: item.isbn,
      },
      accessToken,
    });

    if (healResult.published && healResult.listingId) {
      await prisma.item.update({
        where: { id: item.id },
        data: {
          ebayListingId: healResult.listingId,
          listedOnEbayAt: new Date(),
          ebayListedAt: item.ebayListedAt ?? new Date(),
          ebayNeedsReview: false,
          ...(item.draftStatus !== 'PUBLISHED' ? { draftStatus: 'PUBLISHED' } : {}),
        },
      });
      console.log(
        `[eBay StuckOfferRetry] item=${item.id} offer=${item.ebayOfferId} recovered — listingId=${healResult.listingId}`
      );
      return true;
    }

    // Still failing — flag so this run (and future runs) don't retry it again
    // until someone successfully republishes (which clears ebayNeedsReview).
    await prisma.item.update({
      where: { id: item.id },
      data: { ebayNeedsReview: true },
    });
    console.warn(
      `[eBay StuckOfferRetry] item=${item.id} offer=${item.ebayOfferId} still failing ` +
        `(lastErrorId=${healResult.lastErrorId ?? 'none'} reason=${healResult.lastErrorMessage ?? 'unknown'}) — flagged ebayNeedsReview, will not auto-retry again`
    );
    return false;
  } catch (err) {
    console.error(
      `[eBay StuckOfferRetry] item=${item.id} offer=${item.ebayOfferId} threw:`,
      err instanceof Error ? err.message : String(err)
    );
    try {
      await prisma.item.update({ where: { id: item.id }, data: { ebayNeedsReview: true } });
    } catch (flagErr) {
      console.warn(`[eBay StuckOfferRetry] item=${item.id} failed to set ebayNeedsReview (non-fatal):`, (flagErr as Error).message);
    }
    return false;
  }
}

async function runEbayStuckOfferRetryCron(): Promise<void> {
  const staleCutoff = new Date(Date.now() - MIN_STALE_MINUTES * 60 * 1000);

  const stuckItems = await prisma.item.findMany({
    where: {
      status: 'AVAILABLE',
      isActive: true,
      deletedAt: null,
      ebayOfferId: { not: null },
      ebayListingId: null,
      ebayNeedsReview: false,
      saleId: { not: null },
      updatedAt: { lt: staleCutoff },
    },
    select: {
      id: true,
      title: true,
      condition: true,
      brand: true,
      mpn: true,
      ebayCategoryId: true,
      ebayCategoryName: true,
      ebayOfferId: true,
      category: true,
      isbn: true,
      draftStatus: true,
      ebayListedAt: true,
      sale: { select: { organizerId: true } },
    },
    take: MAX_ITEMS_PER_RUN,
  });

  if (stuckItems.length === 0) {
    console.log('[eBay StuckOfferRetry] No stuck offers found');
    return;
  }

  console.log(`[eBay StuckOfferRetry] Found ${stuckItems.length} stuck offer(s) to retry`);

  // Group by organizer so we refresh each organizer's token once.
  const byOrganizer = new Map<string, StuckItem[]>();
  for (const item of stuckItems) {
    const organizerId = item.sale?.organizerId;
    if (!organizerId) continue;
    const list = byOrganizer.get(organizerId) ?? [];
    list.push(item as StuckItem);
    byOrganizer.set(organizerId, list);
  }

  let recovered = 0;
  let stillStuck = 0;

  for (const [organizerId, items] of byOrganizer) {
    if (isEbayRateLimited()) {
      console.warn('[eBay StuckOfferRetry] Daily eBay rate limit reached — stopping run early');
      break;
    }

    const accessToken = await refreshEbayAccessToken(organizerId);
    if (!accessToken) {
      console.warn(`[eBay StuckOfferRetry] Organizer ${organizerId}: could not refresh token — skipping ${items.length} item(s)`);
      continue;
    }

    for (const item of items) {
      if (isEbayRateLimited()) {
        console.warn('[eBay StuckOfferRetry] Daily eBay rate limit reached mid-organizer — stopping run early');
        break;
      }
      const ok = await retryStuckOffer(item, accessToken);
      if (ok) recovered++;
      else stillStuck++;
      await sleep(EBAY_API_DELAY_MS);
    }
  }

  console.log(`[eBay StuckOfferRetry] Run complete — recovered=${recovered} stillStuck=${stillStuck}`);
}

export function startEbayStuckOfferRetryCron(): void {
  // Every 2 hours — infrequent enough to never meaningfully compete with the
  // daily eBay API call budget, frequent enough that a stuck offer doesn't sit
  // for more than a couple hours before either recovering or getting flagged.
  cron.schedule(
    '0 */2 * * *',
    cronGuard({ jobName: 'ebayStuckOfferRetryCron' }, runEbayStuckOfferRetryCron)
  );
  console.log('[eBay StuckOfferRetry] Cron registered — runs every 2 hours');
}
