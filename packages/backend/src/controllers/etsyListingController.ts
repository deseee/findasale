/**
 * etsyListingController.ts -- HTTP layer for the Etsy listing lifecycle (ADR-135 D2, D3.1, D4,
 * batch E-B3). Routes live in routes/etsyListings.ts; the logic lives in
 * services/marketplace/etsyConnector.ts and etsyTaxonomy.ts.
 *
 * Security posture (CLAUDE.md section 9): every handler derives the organizer from the JWT subject
 * (req.user.id -> Organizer.userId) and re-checks item ownership before anything else. Nothing here
 * reads an organizer id, Etsy listing id, shop id, price or owner field from the client: the handlers
 * pick named fields out of the body (an `etsyListingId` or `shopId` in the body is never read). The
 * kill switch (ETSY_CONNECTOR_ENABLED) is a per-route middleware, reused from etsyConnectController,
 * so it never intercepts the other routers that share the /api/etsy prefix.
 *
 * Error text is organizer-facing and fixed; raw Etsy bodies and internal messages are never returned.
 * The eligibility endpoint answers 422 { eligible: false, reason, message } like Discogs and Reverb do.
 *
 * Handlers are built by makeEtsyListingHandlers(deps) so tests can inject a fake Prisma client, env,
 * Etsy request function and draft starter. Nothing reads env or the database at import time.
 */

import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { EtsyError } from '../services/marketplace/etsyBudget';
import { etsyWhenMadeQualifies, ETSY_VINTAGE_MIN_AGE_YEARS, ETSY_WHEN_MADE } from '../config/etsyWhenMade';
import { checkEtsyEligibility } from '../services/marketplace/etsyEligibility';
import { lotRefusalForPlatform } from '../services/bulkLot/bulkLotExportGuard';
import { isBulkLotsEnabled } from '../services/bulkLot/bulkLotConfig';
import {
  ETSY_LISTING_MESSAGES,
  EtsyListingError,
  endEtsyListing,
  getEtsyListingStatus,
  loadOwnedEtsyItem,
  publishEtsyListing,
  requestEtsyDraft,
  runEtsyDraftWorker,
  serializeEtsyListing,
} from '../services/marketplace/etsyConnector';
import type { EtsyConnectorDeps } from '../services/marketplace/etsyConnector';
import { ETSY_TAXONOMY_MESSAGES, searchEtsyTaxonomyLeaves } from '../services/marketplace/etsyTaxonomy';
import { etsyKillSwitch as defaultEtsyKillSwitch, mapEtsyError } from './etsyConnectController';

/** Organizer-facing copy owned by this controller. No "AI", no "estate sale", no em dashes. */
export const ETSY_LISTING_CONTROLLER_MESSAGES = {
  authRequired: 'Authentication required',
  organizerMissing: 'Organizer profile not found',
  itemNotFound: ETSY_LISTING_MESSAGES.itemNotFound,
  ended: 'Your Etsy listing has been ended.',
  discarded: 'The Etsy draft has been discarded.',
  taxonomyUnavailable: ETSY_TAXONOMY_MESSAGES.notReady,
} as const;

export interface EtsyListingControllerDeps extends EtsyConnectorDeps {
  /** Resolve the Organizer id for a user id. Defaults to prisma.organizer.findUnique({ where: { userId } }). */
  resolveOrganizerId?: (userId: string) => Promise<string | null>;
  /** Start the draft worker for a claimed row. Defaults to fire-and-forget runEtsyDraftWorker(id, deps). */
  startDraftWorker?: (listingRowId: string) => void;
}

const MAX_QUERY_LEN = 100;

function queryString(value: unknown, max: number = MAX_QUERY_LEN): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t ? t.slice(0, max) : undefined;
}

export function makeEtsyListingHandlers(deps: EtsyListingControllerDeps = {}) {
  const getEnv = () => deps.env ?? process.env;
  const getNow = () => (deps.now ?? (() => new Date()))();

  function respondError(res: Response, err: unknown, where: string): void {
    if (err instanceof EtsyListingError) {
      res.status(err.httpStatus).json({ ...(err.details ?? {}), code: err.code, message: err.message });
      return;
    }
    const mapped = mapEtsyError(err);
    if (mapped.httpStatus >= 500 && !(err instanceof EtsyError)) {
      // Unexpected failure: log the type only, never the message (it could carry token fragments).
      console.error(`[etsy] ${where} failed unexpectedly:`, (err as any)?.name || 'Error');
    }
    res.status(mapped.httpStatus).json({
      code: mapped.code,
      message: mapped.message,
      ...(mapped.code === 'ETSY_DISABLED' ? { enabled: false } : {}),
      ...(mapped.retryAt ? { retryAt: mapped.retryAt } : {}),
    });
  }

  async function resolveOrganizer(req: AuthRequest, res: Response): Promise<{ organizerId: string; userId: string } | null> {
    const userId: string | undefined = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: ETSY_LISTING_CONTROLLER_MESSAGES.authRequired });
      return null;
    }
    let organizerId: string | null;
    if (deps.resolveOrganizerId) {
      organizerId = await deps.resolveOrganizerId(userId);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const db = deps.db ?? require('../lib/prisma').prisma;
      const organizer = await db.organizer.findUnique({ where: { userId }, select: { id: true } });
      organizerId = organizer?.id ?? null;
    }
    if (!organizerId) {
      res.status(404).json({ message: ETSY_LISTING_CONTROLLER_MESSAGES.organizerMissing });
      return null;
    }
    return { organizerId, userId };
  }

  /** Organizer plus an item they own, or a response has already been sent and null comes back. */
  async function resolveOwnedItem(req: AuthRequest, res: Response): Promise<{ organizerId: string; userId: string; item: any } | null> {
    const who = await resolveOrganizer(req, res);
    if (!who) return null;
    const item = await loadOwnedEtsyItem(who.organizerId, String(req.params.id ?? ''), deps);
    if (!item) {
      res.status(404).json({ code: 'ETSY_ITEM_NOT_FOUND', message: ETSY_LISTING_CONTROLLER_MESSAGES.itemNotFound });
      return null;
    }
    // Bulk lots (ADR-136 Addendum C) are priced per 1,000 cards and counted in cards: Etsy cannot sell one.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const lotDb = deps.db ?? require('../lib/prisma').prisma;
    const lotRefusal = await lotRefusalForPlatform(lotDb, 'Etsy', [item.id], isBulkLotsEnabled(getEnv() as Record<string, string | undefined>));
    if (lotRefusal) {
      res.status(lotRefusal.status).json({ code: lotRefusal.code, message: lotRefusal.message });
      return null;
    }
    return { ...who, item };
  }

  const eraOptions = () => {
    const asOfYear = deps.asOfYear ?? getNow().getFullYear();
    return ETSY_WHEN_MADE.map((e) => ({ value: e.value, label: e.label, vintage: etsyWhenMadeQualifies(e.value, asOfYear) }));
  };

    /** Bulk-lot refusal for the routes that do not load the item themselves (draft, publish, end). True means a response was sent. */
  async function refuseBulkLot(req: AuthRequest, res: Response, organizerId: string): Promise<boolean> {
    const item = await loadOwnedEtsyItem(organizerId, String(req.params.id ?? ''), deps);
    if (!item) return false; // not found or not theirs: the normal path answers it
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const lotDb = deps.db ?? require('../lib/prisma').prisma;
    const lotRefusal = await lotRefusalForPlatform(lotDb, 'Etsy', [item.id], isBulkLotsEnabled(getEnv() as Record<string, string | undefined>));
    if (!lotRefusal) return false;
    res.status(lotRefusal.status).json({ code: lotRefusal.code, message: lotRefusal.message });
    return true;
  }

/**
   * GET /api/etsy/items/:id/eligibility?whenMade=&isSupply=
   * 200 { eligible: true, reason: null, code: 'OK', eras, ... } or 422 { eligible: false, reason, message, code, eras, ... }.
   * whenMade and isSupply are the organizer's attestation; when absent the saved draft's values are used.
   */
  const getEligibility = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const owned = await resolveOwnedItem(req, res);
      if (!owned) return;
      const { organizerId, item } = owned;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const db = deps.db ?? require('../lib/prisma').prisma;
      const saved = await db.etsyListing.findFirst({ where: { itemId: item.id, organizerId } });

      const qWhenMade = queryString(req.query?.whenMade, 40);
      const qSupply = typeof req.query?.isSupply === 'string' ? req.query.isSupply : undefined;
      const whenMade = qWhenMade ?? (typeof saved?.whenMade === 'string' ? saved.whenMade : null);
      const isSupply = qSupply !== undefined ? qSupply === 'true' : saved?.isSupply === true;

      const result = checkEtsyEligibility({ card: item.card ?? null }, { whenMade, isSupply, asOfYear: deps.asOfYear });
      const extras = {
        code: result.code,
        cardReleaseYear: typeof item.card?.releaseYear === 'number' ? item.card.releaseYear : null,
        minAgeYears: ETSY_VINTAGE_MIN_AGE_YEARS,
        eras: eraOptions(),
      };
      if (!result.eligible) {
        res.status(422).json({ eligible: false, reason: result.reason, message: result.reason, ...extras });
        return;
      }
      res.json({ eligible: true, reason: null, ...extras });
    } catch (err) {
      respondError(res, err, 'eligibility');
    }
  };

  /** GET /api/etsy/taxonomy/suggest?itemId=&q=&limit= -> leaf categories: keyword suggestions plus a searchable list. */
  const suggestTaxonomy = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const who = await resolveOrganizer(req, res);
      if (!who) return;
      const itemId = queryString(req.query?.itemId);
      let item: any = null;
      if (itemId) {
        item = await loadOwnedEtsyItem(who.organizerId, itemId, deps);
        if (!item) {
          res.status(404).json({ code: 'ETSY_ITEM_NOT_FOUND', message: ETSY_LISTING_CONTROLLER_MESSAGES.itemNotFound });
          return;
        }
      }
      const limitRaw = parseInt(String(req.query?.limit ?? ''), 10);
      const result = await searchEtsyTaxonomyLeaves(
        {
          query: queryString(req.query?.q),
          itemTitle: item?.title ?? null,
          itemCategory: item?.category ?? null,
          limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
        },
        { db: deps.db, env: getEnv(), now: deps.now, request: deps.request, http: deps.http }
      );
      if (!result.ready) {
        res.status(503).json({ code: 'ETSY_TAXONOMY_UNAVAILABLE', message: ETSY_LISTING_CONTROLLER_MESSAGES.taxonomyUnavailable, ready: false });
        return;
      }
      res.json(result);
    } catch (err) {
      respondError(res, err, 'taxonomy-suggest');
    }
  };

  /**
   * POST /api/etsy/items/:id/draft
   * body { whenMade?, isSupply?, taxonomyId, shippingProfileId?, returnPolicyId?, readinessStateId?, attest: true }
   * 202 { listing, started } while the draft is built in the background. Poll GET /items/:id/listing.
   */
  const createDraft = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const who = await resolveOrganizer(req, res);
      if (!who) return;
      if (await refuseBulkLot(req, res, who.organizerId)) return;
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      // Only these named fields are ever read. etsyListingId, shopId, organizerId and similar are ignored.
      const { listing, started } = await requestEtsyDraft(
        {
          organizerId: who.organizerId,
          userId: who.userId,
          itemId: String(req.params.id ?? ''),
          whenMade: body.whenMade,
          isSupply: body.isSupply,
          taxonomyId: body.taxonomyId,
          shippingProfileId: body.shippingProfileId,
          returnPolicyId: body.returnPolicyId,
          readinessStateId: body.readinessStateId,
          attest: body.attest,
        },
        deps
      );
      if (started) {
        const start = deps.startDraftWorker ?? ((id: string) => void runEtsyDraftWorker(id, deps).catch(() => undefined));
        start(listing.id);
      }
      res.status(202).json({ listing: serializeEtsyListing(listing), started });
    } catch (err) {
      respondError(res, err, 'draft');
    }
  };

  /** GET /api/etsy/items/:id/listing -> { listing: null } or { listing }. Local data only, safe to poll every 2 seconds. */
  const getListing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const owned = await resolveOwnedItem(req, res);
      if (!owned) return;
      const listing = await getEtsyListingStatus({ organizerId: owned.organizerId, itemId: owned.item.id, item: owned.item }, deps);
      res.json({ listing });
    } catch (err) {
      respondError(res, err, 'listing-status');
    }
  };

  /** POST /api/etsy/items/:id/publish  body { confirm: true }. Etsy charges $0.20 when the listing goes live. */
  const publish = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const who = await resolveOrganizer(req, res);
      if (!who) return;
      if (await refuseBulkLot(req, res, who.organizerId)) return;
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { listing, alreadyActive } = await publishEtsyListing(
        { organizerId: who.organizerId, itemId: String(req.params.id ?? ''), confirm: body.confirm },
        deps
      );
      res.json({ listing: serializeEtsyListing(listing), alreadyActive });
    } catch (err) {
      respondError(res, err, 'publish');
    }
  };

  /** DELETE /api/etsy/items/:id/listing -> ends a live listing or discards a draft. Works while pushing is switched off. */
  const endListing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const who = await resolveOrganizer(req, res);
      if (!who) return;
      if (await refuseBulkLot(req, res, who.organizerId)) return;
      const { outcome, listing } = await endEtsyListing({ organizerId: who.organizerId, itemId: String(req.params.id ?? '') }, deps);
      res.json({
        success: true,
        outcome,
        message: outcome === 'skipped' && listing.state === 'ENDED' && !listing.etsyListingId ? ETSY_LISTING_CONTROLLER_MESSAGES.discarded : ETSY_LISTING_CONTROLLER_MESSAGES.ended,
        listing: serializeEtsyListing(listing),
      });
    } catch (err) {
      respondError(res, err, 'end');
    }
  };

  return { getEligibility, suggestTaxonomy, createDraft, getListing, publish, endListing };
}

const defaultHandlers = makeEtsyListingHandlers();

export const etsyKillSwitch = defaultEtsyKillSwitch;
export const getEtsyEligibilityEndpoint = defaultHandlers.getEligibility;
export const suggestEtsyTaxonomyEndpoint = defaultHandlers.suggestTaxonomy;
export const createEtsyDraftEndpoint = defaultHandlers.createDraft;
export const getEtsyListingEndpoint = defaultHandlers.getListing;
export const publishEtsyListingEndpoint = defaultHandlers.publish;
export const endEtsyListingEndpoint = defaultHandlers.endListing;
