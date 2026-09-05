/**
 * curioController.ts -- Curio (resale-value scanner) backend, Phases 2-4.
 * See claude_docs/feature-notes/curio-api-adr-2026-07-17.md (Architect-approved spec).
 *
 * A thin orchestration layer over infrastructure that already exists and is already live:
 *   - Identification: analyzeItemImage()/analyzeItemImages() (cloudAIService.ts) -- Curio is the
 *     7th caller, no changes to that pipeline.
 *   - Degraded-mode identification: getVisionLabelsDegraded() (cloudAIService.ts, new Phase 1 fn).
 *   - Comps: fetchEbayPriceComps() (ebayController.ts) -- written through to PricingComp.
 *   - Cost/rate governance: lib/curioCostTracker.ts (Phase 1) -- a fully separate pool from the
 *     existing organizer AI_DAILY_CALL_CAP.
 *
 * Every endpoint here requires `authenticate` (see routes/curio.ts) -- there is no anonymous
 * tier anywhere in Curio v1 (ADR Decision #3). CurioScan.userId is non-nullable to match.
 */

import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import {
  analyzeItemImage,
  analyzeItemImages,
  getVisionLabelsDegraded,
  isCloudAIAvailable,
} from '../services/cloudAIService';
import { fetchEbayPriceComps, suggestEbayCategoryForTitle } from './ebayController';
import { uploadToCloudinaryWithRetry } from './uploadController';
import {
  isCurioCostCeilingExceeded,
  isCurioDegradedMode,
  trackCurioScan,
  CURIO_FULL_SCAN_COST_ESTIMATE_USD,
  CURIO_DEGRADED_SCAN_COST_PER_IMAGE_USD,
} from '../lib/curioCostTracker';

const VALID_SOURCE_SURFACES = ['PWA_CAMERA', 'EXTENSION_RIGHTCLICK', 'EXTENSION_UPLOAD'];
const VALID_DEAL_CHECK_DOMAINS = ['facebook.com', 'craigslist.org', 'offerup.com'];

interface CurioIdentification {
  title: string;
  description: string;
  category: string | null;
  brand: string | null;
  condition: string | null;
  confidence: number;
}

interface CurioListing {
  title: string;
  price: number; // dollars -- matches the existing eBay comps convention (EbayCompTiles.tsx), NOT cents
  url: string;
  imageUrl: string | null;
}

/** Derive a stable-ish external listing id from an eBay itemWebUrl for the PricingComp @@unique. */
function externalListingIdFromUrl(url: string): string {
  const match = url.match(/\/itm\/(?:[^/]+\/)?(\d+)/);
  if (match) return match[1];
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  return `url_${Math.abs(hash)}`;
}

/**
 * Write-through cache for Curio's eBay comps into the existing, previously-dormant PricingComp
 * model (schema.prisma) -- per ADR Constraint, Curio must not build a new bespoke cache. Every
 * row is isSoldPrice=false: these are active listings, never sold data (ADR Rationale #1).
 * Best-effort, never blocks or fails the caller -- a single bad listing (missing url, etc.) is
 * skipped, not fatal to the rest.
 */
async function writeThroughPricingComps(
  listings: CurioListing[],
  category: string | null,
  brand: string | null
): Promise<void> {
  const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  for (const listing of listings) {
    if (!listing.url) continue;
    try {
      const externalListingId = externalListingIdFromUrl(listing.url);
      await prisma.pricingComp.upsert({
        where: { sourceId_externalListingId: { sourceId: 'ebay', externalListingId } },
        create: {
          sourceId: 'ebay',
          externalListingId,
          externalUrl: listing.url,
          title: listing.title,
          price: BigInt(Math.round(listing.price * 100)),
          isSoldPrice: false,
          saleDate: new Date(),
          category: category || null,
          brand: brand || null,
          confidence: 0.5,
          sampleSize: 1,
          comparabilityScore: 0.6,
          expireAt,
        },
        update: {
          title: listing.title,
          price: BigInt(Math.round(listing.price * 100)),
          fetchedAt: new Date(),
          expireAt,
        },
      });
    } catch (err) {
      console.warn('[curioController] PricingComp write-through failed for one listing (non-blocking):', err);
    }
  }
}

/**
 * POST /api/curio/scan -- submit 1-3 photos, get AI identification + a value estimate from
 * active eBay comps. authenticate + curioRateLimiter + curioCostGate already ran (routes/curio.ts).
 */
export const submitScan = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'LOGIN_REQUIRED' });
    }

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    const sourceSurface = req.body?.sourceSurface;

    if (!VALID_SOURCE_SURFACES.includes(sourceSurface)) {
      return res.status(400).json({ message: `sourceSurface must be one of ${VALID_SOURCE_SURFACES.join(', ')}` });
    }
    if (files.length === 0 || files.length > 3) {
      return res.status(400).json({ message: 'Provide 1-3 photos' });
    }

    // Upload photos to Cloudinary first -- CurioScan.photoUrls needs durable URLs regardless of
    // which identification pipeline runs below (reuses uploadController.ts's existing helper,
    // same retry-on-420 behavior as uploadRapidfire).
    let photoUrls: string[];
    try {
      const uploads = await Promise.all(files.map((f) => uploadToCloudinaryWithRetry(f.buffer, 'findasale/curio')));
      photoUrls = uploads.map((u) => u.original);
    } catch (uploadErr) {
      console.error('[curioController] Cloudinary upload failed:', uploadErr);
      return res.status(500).json({ message: 'Photo upload failed' });
    }

    // Mode selection -- checked AFTER photos are safely uploaded (never lose the user's photos
    // over a cost-gate decision). See ADR API Contract (a) for the three response shapes this
    // drives: full pipeline, soft-threshold degraded, hard-cap.
    const hardCapped = await isCurioCostCeilingExceeded();
    const degradedThresholdHit = !hardCapped && (await isCurioDegradedMode());
    const runDegradedVision = hardCapped || degradedThresholdHit;

    let identification: CurioIdentification;
    let scanCostUsd = 0;

    if (runDegradedVision) {
      // SECURITY/SPEND FIX (findasale-hacker pass): hardCapped means the $9 monthly ceiling is
      // ALREADY exceeded -- this must be true hard-cap-identification-only (zero further paid
      // Vision/Haiku calls), matching the doc comment above and the module's "hard $ stop"
      // contract. The prior version fired a real (cheaper, but non-zero-cost) Vision call here
      // even when hardCapped was true, so the $9 ceiling never actually stopped spend -- it just
      // slowed it down. Only run the degraded Vision call for the soft-threshold case.
      if (!hardCapped && isCloudAIAvailable()) {
        const primaryBuffer = files[0].buffer;
        const labelResult = await getVisionLabelsDegraded(primaryBuffer.toString('base64'));
        identification = {
          title: labelResult.objectLabels[0] || 'Unidentified item',
          description: labelResult.objectLabels.slice(1, 4).join(', '),
          category: null,
          brand: null,
          condition: null,
          confidence: 0.3,
        };
        scanCostUsd = CURIO_DEGRADED_SCAN_COST_PER_IMAGE_USD;
      } else {
        // hardCapped (or cloud AI unavailable): zero Vision/Haiku spend, scanCostUsd stays at its
        // 0 default.
        identification = { title: 'Unidentified item', description: '', category: null, brand: null, condition: null, confidence: 0.2 };
      }
    } else {
      const buffers = files.map((f) => f.buffer);
      const mimeTypes = files.map((f) => f.mimetype || 'image/jpeg');
      let aiResult: Awaited<ReturnType<typeof analyzeItemImage>> | null = null;
      let aiThrew = false;
      try {
        aiResult = files.length > 1 ? await analyzeItemImages(buffers, mimeTypes) : await analyzeItemImage(buffers[0], mimeTypes[0]);
      } catch (aiErr) {
        // BUG FIX (findasale-hacker/QA pass, 2026-08-29): analyzeItemImage(s)() does not only
        // return null on failure -- it can also THROW (AI_TIMEOUT/AI_RATE_LIMIT/AI_PARSE_ERROR/
        // AI_ERROR, see cloudAIService.ts's catch block). This branch previously only handled the
        // null-return case, so any thrown error propagated past this function entirely and
        // surfaced as a raw 500 "Scan failed" from submitScan's outer try/catch -- confirmed live
        // this session with a degenerate test image (Railway log: "AI_ERROR: AI analysis
        // unavailable" at the old analyzeItemImage(s) call site). Worse, because the throw
        // happened before trackCurioScan() below, a scan that may well have incurred real
        // Vision/Haiku spend went completely unrecorded in Curio's own $ ledger. Route any thrown
        // AI error into the same graceful "Unidentified item" fallback the null-return case
        // already has, instead of losing the request.
        aiThrew = true;
        console.warn('[curioController] analyzeItemImage(s) threw, falling back to placeholder identification:', aiErr);
      }
      if (aiResult) {
        // A real Vision+Haiku call actually ran (analyzeItemImage(s)() only returns non-null
        // after completing the full pipeline) -- charge the worst-case estimate against Curio's
        // monthly $ pool. See CURIO_FULL_SCAN_COST_ESTIMATE_USD doc comment for the estimate basis.
        scanCostUsd = CURIO_FULL_SCAN_COST_ESTIMATE_USD;
        identification = {
          title: aiResult.title,
          description: aiResult.description,
          category: aiResult.category || null,
          brand: aiResult.brand || null,
          condition: aiResult.condition || null,
          confidence: aiResult.confidence ?? 0.5,
        };
      } else if (aiThrew) {
        // The pipeline was actually invoked and failed partway through (timeout/rate-limit/parse
        // error, or a photo the AI genuinely could not analyze) -- unlike the "returned null
        // before any call" case below, real API spend may well have already been incurred, so
        // this is charged the same worst-case estimate as a completed call rather than 0.
        scanCostUsd = CURIO_FULL_SCAN_COST_ESTIMATE_USD;
        identification = { title: 'Unidentified item', description: '', category: null, brand: null, condition: null, confidence: 0.2 };
      } else {
        // analyzeItemImage(s)() returned null BEFORE making any Vision/Haiku call -- either cloud
        // AI isn't configured, or the shared organizer AI ceiling/daily-call-cap
        // (isAICostCeilingExceeded/isAIDailyCallCapAvailable, aiCostTracker.ts) is itself
        // exhausted (both checks run first thing inside analyzeItemImage(s)(), before any network
        // call). Zero real spend happened, so scanCostUsd correctly stays at its 0 default --
        // charging the full estimate here would overcount Curio's monthly $ pool for a call that
        // never actually fired.
        identification = { title: 'Unidentified item', description: '', category: null, brand: null, condition: null, confidence: 0.2 };
      }
    }

    // Comps -- attempted unless the hard $ ceiling has been hit. eBay itself is free/quota-only
    // (not part of the dollar-cost gate, ADR Risk section), so degraded-threshold mode still gets
    // a value estimate; only the hard-cap response explicitly zeroes value/comparableListings.
    let value: { low: number; high: number; median: number; basis: string; compsFound: number } | null = null;
    let comparableListings: CurioListing[] = [];
    if (!hardCapped) {
      try {
        const comps = await fetchEbayPriceComps({
          title: identification.title,
          category: identification.category || undefined,
          condition: identification.condition || undefined,
          maxResults: 10,
        });
        if (comps.count > 0 && !comps.isMockData) {
          value = {
            low: Math.round(comps.min * 100),
            high: Math.round(comps.max * 100),
            median: Math.round(comps.median * 100),
            basis: 'similar_active_listings',
            compsFound: comps.count,
          };
          comparableListings = comps.listings.map((l) => ({ title: l.title, price: l.price, url: l.url, imageUrl: l.imageUrl || null }));
          writeThroughPricingComps(comparableListings, identification.category, identification.brand).catch(() => {});
        }
      } catch (compsErr) {
        console.warn('[curioController] eBay comps lookup failed (non-blocking):', compsErr);
      }
    }

    // guildXpAwarded: NOT wired to xpService.awardXp() this dispatch. No CURIO/scan XP amount
    // exists yet in guild-primer.tsx or any Patrick-approved XP table (checked this session) --
    // inventing a number here would be an undocumented XP-economy decision, which is out of
    // scope for a Dev dispatch. Field is always 0 until Patrick/Architect sets a real amount.
    // See Handoff Contract Blocked/Flagged.
    const guildXpAwarded = 0;

    const scan = await prisma.curioScan.create({
      data: {
        userId,
        sourceSurface,
        photoUrls,
        title: identification.title,
        description: identification.description || null,
        category: identification.category,
        brand: identification.brand,
        condition: identification.condition,
        aiConfidence: identification.confidence,
        priceLow: value?.low ?? null,
        priceHigh: value?.high ?? null,
        priceMedian: value?.median ?? null,
        valueBasis: 'similar_active_listings',
        comparableListings: comparableListings.length > 0 ? (comparableListings as any) : undefined,
        guildXpAwarded,
      },
    });

    await trackCurioScan(userId, scanCostUsd);

    const responseBody: Record<string, unknown> = {
      scanId: scan.id,
      identification: {
        title: identification.title,
        description: identification.description,
        category: identification.category,
        brand: identification.brand,
        condition: identification.condition,
        confidence: identification.confidence,
      },
      value,
      comparableListings,
      guildXpAwarded,
    };
    if (hardCapped) {
      responseBody.degraded = true;
      responseBody.message = 'Value estimate temporarily unavailable — try again shortly';
    } else if (degradedThresholdHit) {
      responseBody.degraded = true;
      responseBody.message = "Running a lighter scan right now — most of today's free budget is in use";
    }

    return res.status(200).json(responseBody);
  } catch (error) {
    console.error('[curioController] submitScan error:', error);
    return res.status(500).json({ message: 'Scan failed' });
  }
};

/**
 * POST /api/curio/deal-check -- extension-provided, client-extracted listing data. Comps-only
 * verdict; MUST NOT perform any server-side fetch of sourceUrl (ADR Constraint -- client-side DOM
 * extraction only, mirrors the existing private FB-autofill extension's posture). Deliberately
 * does NOT run curioCostGate/consume the Curio scan-cost pool: this endpoint never calls
 * Vision/Haiku, only the free/quota-only eBay comps lookup (already capped by
 * EBAY_PRICE_COMPS_DAILY_CAP inside fetchEbayPriceComps itself).
 */
export const dealCheck = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'LOGIN_REQUIRED' });
    }

    const { sourceDomain, title, askingPrice } = req.body || {};
    if (!title || typeof askingPrice !== 'number') {
      return res.status(400).json({ message: 'title and askingPrice (cents) are required' });
    }
    if (sourceDomain && !VALID_DEAL_CHECK_DOMAINS.includes(sourceDomain)) {
      console.warn(`[curioController] dealCheck: unexpected sourceDomain "${sourceDomain}"`);
    }

    let verdict: 'GOOD_DEAL' | 'FAIR' | 'OVERPRICED' | 'UNKNOWN' = 'UNKNOWN';
    let value: { low: number; high: number; median: number; basis: string } | null = null;
    let comparableListings: CurioListing[] = [];

    try {
      const comps = await fetchEbayPriceComps({ title, maxResults: 10 });
      if (comps.count > 0 && !comps.isMockData) {
        const lowCents = Math.round(comps.min * 100);
        const highCents = Math.round(comps.max * 100);
        const medianCents = Math.round(comps.median * 100);
        value = { low: lowCents, high: highCents, median: medianCents, basis: 'similar_active_listings' };
        comparableListings = comps.listings.map((l) => ({ title: l.title, price: l.price, url: l.url, imageUrl: l.imageUrl || null }));
        writeThroughPricingComps(comparableListings, null, null).catch(() => {});

        if (askingPrice <= lowCents) verdict = 'GOOD_DEAL';
        else if (askingPrice <= medianCents) verdict = 'FAIR';
        else verdict = 'OVERPRICED';
      }
    } catch (compsErr) {
      console.warn('[curioController] dealCheck comps lookup failed (non-blocking):', compsErr);
    }

    return res.status(200).json({ verdict, value, comparableListings });
  } catch (error) {
    console.error('[curioController] dealCheck error:', error);
    return res.status(500).json({ message: 'Deal check failed' });
  }
};

/**
 * GET /api/curio/finds?cursor=&limit=20 -- paginated Finds collection, owner-scoped (userId from
 * the authenticated session, never a param -- no cross-account read path exists).
 */
export const listFinds = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'LOGIN_REQUIRED' });
    }

    const limitRaw = parseInt((req.query.limit as string) || '20', 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;
    const cursor = (req.query.cursor as string) || undefined;

    const scans = await prisma.curioScan.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = scans.length > limit;
    const page = hasMore ? scans.slice(0, limit) : scans;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const totalValueAgg = await prisma.curioScan.aggregate({
      where: { userId, deletedAt: null },
      _sum: { priceMedian: true },
    });

    const finds = page.map((s) => ({
      scanId: s.id,
      identification: {
        title: s.title,
        description: s.description,
        category: s.category,
        brand: s.brand,
        condition: s.condition,
        confidence: s.aiConfidence,
      },
      value:
        s.priceLow != null && s.priceHigh != null && s.priceMedian != null
          ? {
              low: s.priceLow,
              high: s.priceHigh,
              median: s.priceMedian,
              basis: s.valueBasis || 'similar_active_listings',
              compsFound: Array.isArray(s.comparableListings) ? (s.comparableListings as unknown[]).length : 0,
            }
          : null,
      photoUrl: s.photoUrls?.[0] || null,
      createdAt: s.createdAt,
      convertedToItemId: s.convertedToItemId,
    }));

    return res.status(200).json({
      finds,
      totalValueIdentifiedCents: totalValueAgg._sum.priceMedian || 0,
      nextCursor,
    });
  } catch (error) {
    console.error('[curioController] listFinds error:', error);
    return res.status(500).json({ message: 'Failed to load finds' });
  }
};

/**
 * DELETE /api/curio/finds/:scanId -- soft delete (CurioScan.deletedAt), owner-only. Real
 * tenant-isolation check: a cross-account delete attempt is rejected with 403, not silently
 * no-op'd or 404'd (404 is reserved for "doesn't exist/already deleted").
 */
export const deleteFind = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'LOGIN_REQUIRED' });
    }
    const { scanId } = req.params;

    const scan = await prisma.curioScan.findUnique({ where: { id: scanId } });
    if (!scan || scan.deletedAt) {
      return res.status(404).json({ message: 'Find not found' });
    }
    if (scan.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized to delete this find' });
    }

    await prisma.curioScan.update({ where: { id: scanId }, data: { deletedAt: new Date() } });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[curioController] deleteFind error:', error);
    return res.status(500).json({ message: 'Failed to delete find' });
  }
};

/**
 * POST /api/curio/scan/:scanId/convert -- convert a scan into a DRAFT Item (saleId: null,
 * draftStatus: 'DRAFT', organizerId set), auto-provisioning a missing Organizer exactly per
 * authController.ts redeemInvite() (re-confirmed this session to start at line 999, not the
 * ADR's stale 923 -- Organizer.create() with defaulted businessName/phone/address, User.role
 * update in the SAME transaction, then a fresh access+refresh JWT re-issued via res.cookie so
 * the session reflects the new ORGANIZER role immediately, no logout/login required).
 */
export const convertScanToListing = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'LOGIN_REQUIRED' });
    }
    const { scanId } = req.params;

    const scan = await prisma.curioScan.findUnique({ where: { id: scanId } });
    if (!scan || scan.deletedAt) {
      return res.status(404).json({ message: 'Find not found' });
    }
    if (scan.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized to convert this find' });
    }
    if (scan.convertedToItemId) {
      return res.status(400).json({ message: 'This find has already been converted to a listing', itemId: scan.convertedToItemId });
    }

    let organizerAutoProvisioned = false;
    let organizer = await prisma.organizer.findUnique({ where: { userId } });

    if (!organizer) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Mirrors authController.ts redeemInvite() (lines 999-1063) for the auto-provision
      // branch -- see ADR Decision #6. SECURITY/ROBUSTNESS FIX (findasale-hacker pass): the
      // original version only checked `organizer` for null OUTSIDE this transaction, then
      // unconditionally created one inside it -- a TOCTOU gap unlike redeemInvite() (which
      // re-checks existingOrganizer INSIDE its transaction). Two concurrent /convert requests
      // from the same user (double-click, client retry) could both pass the outer null check and
      // both attempt tx.organizer.create() with the same userId; since Organizer.userId is
      // @unique (schema.prisma), the second would throw and surface as a raw 500 instead of
      // resolving cleanly. Re-checking inside the transaction, exactly like redeemInvite(), closes
      // that gap.
      // BUG FIX (findasale-hacker/QA pass, 2026-08-29): only the deprecated singular `role`
      // field was ever updated here, never the `roles` array -- DB-confirmed via QA this session
      // (role became 'ORGANIZER' but roles stayed ['USER']). Any caller that checks
      // `roles.includes('ORGANIZER')` without also OR-ing `role === 'ORGANIZER'` would silently
      // miss a Curio-auto-provisioned organizer. Same gap existed in authController.ts
      // redeemInvite() (the function this block explicitly mirrors) -- fixed there too, same
      // dispatch.
      const rolesWithOrganizer = user.roles?.includes('ORGANIZER') ? user.roles : [...(user.roles || ['USER']), 'ORGANIZER'];
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { role: 'ORGANIZER', roles: rolesWithOrganizer } });
        const existingOrganizer = await tx.organizer.findUnique({ where: { userId } });
        if (!existingOrganizer) {
          await tx.organizer.create({
            data: {
              userId,
              businessName: user.name || 'My Sale',
              phone: '',
              address: '',
            },
          });
        }
      });
      // Re-fetch as a plain top-level statement OUTSIDE the $transaction closure -- mirrors
      // authController.ts redeemInvite()'s `organizerProfile` re-fetch pattern (line ~1077).
      // Root cause of TS2339 x5 (CI, 2026-08-28): assigning to the outer `organizer` from
      // INSIDE the transaction closure above caused TypeScript to narrow `organizer` to `never`
      // for every read below it (a documented TS closure-assignment narrowing quirk -- writing
      // to an outer `let` from within a nested function invalidates in-block CFA narrowing back
      // to `never` when combined with the `if (!organizer)` guard, instead of widening to the
      // declared `Organizer | null` type). Moving the reassignment to a plain sequential
      // statement avoids the quirk entirely, exactly as redeemInvite() already does.
      organizer = await prisma.organizer.findUnique({ where: { userId } });
      organizerAutoProvisioned = true;

      const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
      const roleSubscription = await prisma.userRoleSubscription.findFirst({ where: { userId, role: 'ORGANIZER' } });
      const subscriptionLapsed = !!(roleSubscription && roleSubscription.tierLapsedAt !== null && roleSubscription.tierResumedAt === null);
      const userRoles = updatedUser?.roles && updatedUser.roles.length > 0 ? updatedUser.roles : ['ORGANIZER'];

      if (!updatedUser) {
        return res.status(500).json({ message: 'Failed to resolve user after organizer auto-provision' });
      }

      const accessToken = jwt.sign(
        {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: 'ORGANIZER',
          roles: userRoles,
          referralCode: updatedUser.referralCode,
          tokenVersion: updatedUser.tokenVersion,
          emailVerified: updatedUser.emailVerified,
          subscriptionTier: organizer?.subscriptionTier ?? 'SIMPLE',
          subscriptionStatus: organizer?.subscriptionStatus ?? null,
          subscriptionLapsed,
          organizerTokenVersion: organizer?.tokenVersion ?? 0,
          onboardingComplete: organizer?.onboardingComplete ?? false,
          createdAt: updatedUser.createdAt.toISOString(),
          huntPassActive: updatedUser.huntPassActive,
          huntPassExpiry: updatedUser.huntPassExpiry,
          guildXp: updatedUser.guildXp || 0,
        },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );

      const refreshToken = jwt.sign(
        {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: 'ORGANIZER',
          roles: userRoles,
          tokenVersion: updatedUser.tokenVersion,
          organizerTokenVersion: organizer?.tokenVersion ?? 0,
        },
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!,
        { expiresIn: '30d' }
      );

      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 1000,
      });
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }

    if (!organizer) {
      // Unreachable in practice -- organizer is either found above or just created in the
      // transaction -- but never assume; fail loudly instead of creating an orphaned Item.
      return res.status(500).json({ message: 'Failed to resolve organizer profile' });
    }

    // Resolve a real eBay leaf category up front so the Edit Item page's Category picker
    // doesn't render blank for Curio-converted listings (findasale-dev fix, 2026-09-04, QA
    // finding on roadmap #636). Reuses the same app-token-authenticated Taxonomy API resolver
    // ebayController.ts already calls for regular AI-tagged items (ADR 2026-06-14) -- no
    // organizer eBay connection is required, this is a platform-level app token, not per-user.
    // Best-effort: a failed/empty suggestion must never block the listing from being created.
    let ebayCategoryId: string | null = null;
    let ebayCategoryName: string | null = null;
    try {
      const suggested = await suggestEbayCategoryForTitle(scan.title, scan.category);
      if (suggested) {
        ebayCategoryId = suggested.categoryId;
        ebayCategoryName = suggested.categoryName;
      }
    } catch (categoryErr) {
      console.warn('[curioController] eBay category suggestion failed (non-blocking):', categoryErr);
    }

    const item = await prisma.item.create({
      data: {
        title: scan.title,
        description: scan.description,
        category: scan.category,
        brand: scan.brand,
        condition: scan.condition,
        photoUrls: scan.photoUrls,
        price: scan.priceMedian != null ? scan.priceMedian / 100 : null,
        saleId: null,
        organizerId: organizer.id,
        inInventory: true,
        status: 'AVAILABLE',
        draftStatus: 'DRAFT',
        listingType: 'FIXED',
        isActive: true,
        embedding: [],
        isAiTagged: true,
        aiConfidence: scan.aiConfidence,
        ebayCategoryId,
        ebayCategoryName,
      },
    });

    await prisma.curioScan.update({
      where: { id: scanId },
      data: { convertedToItemId: item.id, convertedAt: new Date() },
    });

    return res.status(200).json({
      itemId: item.id,
      saleId: null,
      draftStatus: 'DRAFT',
      organizerAutoProvisioned,
    });
  } catch (error) {
    console.error('[curioController] convertScanToListing error:', error);
    return res.status(500).json({ message: 'Failed to convert find to listing' });
  }
};
