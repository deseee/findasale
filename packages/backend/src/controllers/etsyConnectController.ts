/**
 * etsyConnectController.ts -- HTTP layer for the Etsy connection (ADR-135 D1.5, D1.8, D2.2).
 * Batch B1. Routes live in routes/etsy.ts; the logic lives in services/marketplace/etsyAuth.ts.
 *
 * Security posture (CLAUDE.md section 9): every handler derives the organizer from the JWT subject
 * (req.user.id -> Organizer.userId). Nothing here accepts an organizer id, shop id, Etsy listing id,
 * redirect URI or token from the client. The callback is an authenticated POST bound to the organizer
 * and user that started the flow, so a stolen authorization code cannot be completed by someone else.
 * The kill switch (ETSY_CONNECTOR_ENABLED) is a per-route middleware, NOT router.use, so it never
 * intercepts the other Etsy routers that share the /api/etsy prefix (the webhook must still answer 200).
 *
 * Error text is organizer-facing and fixed (ETSY_MESSAGES); raw Etsy bodies and internal messages are
 * never returned. State and token-exchange failures share ONE generic message.
 *
 * Handlers are built by makeEtsyConnectHandlers(deps) so tests can inject a fake Prisma client, env
 * and auth deps. Nothing reads env or the database at import time.
 */

import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import {
  ETSY_ATTRIBUTION,
  completeEtsyConnect,
  disconnectEtsyAccount,
  fetchEtsyShopSetupOptions,
  getEtsyConnectionStatus,
  saveEtsyShopSetup,
  startEtsyConnect,
} from '../services/marketplace/etsyAuth';
import type { EtsyAuthDeps } from '../services/marketplace/etsyAuth';
import { EtsyError } from '../services/marketplace/etsyBudget';
import type { EtsyEnv } from '../services/marketplace/etsyBudget';
import { isEtsyConnectorEnabled } from '../services/marketplace/etsyHttp';

/** Organizer-facing copy. No "AI", no "estate sale", no em dashes (copy-lint test enforces it). */
export const ETSY_MESSAGES = {
  disabled: 'Etsy is not available right now.',
  notAllowed: 'Etsy is not enabled for your account yet.',
  busy: 'Etsy is busy. Try again in a moment.',
  generic: 'Etsy could not complete this step. Try again, or contact support.',
  needsReauth: 'Etsy needs you to reconnect your shop.',
  notConnected: 'Connect your Etsy shop first.',
  connectFailed: 'We could not complete the Etsy connection. Please start the connection again.',
  noShop: 'We could not find an Etsy shop on that Etsy account. Open a shop on Etsy, then connect again.',
  shopInUse: 'That Etsy shop is already connected to another FindA.Sale account.',
  emptySetup: 'Create a shipping profile and a processing profile in your Etsy shop settings, then come back.',
  disconnectNotice:
    "Your Etsy listings stay live on Etsy. FindA.Sale can no longer end them for you. To remove FindA.Sale's access, open Etsy account settings, Apps.",
  setupInvalid: 'Choose a shipping profile and a processing profile from your Etsy shop.',
  authRequired: 'Authentication required',
  organizerMissing: 'Organizer profile not found',
  attribution: ETSY_ATTRIBUTION,
} as const;

export function currencyUnsupportedMessage(code: string): string {
  return `Your Etsy shop uses ${code}. Etsy listings from FindA.Sale currently need a USD shop.`;
}

export function confirmDisconnectMessage(activeListingCount: number): string {
  const noun = activeListingCount === 1 ? 'listing is' : 'listings are';
  return `${activeListingCount} Etsy ${noun} live or waiting to be published. Disconnecting leaves live listings on Etsy. Confirm to continue.`;
}

interface MappedError {
  httpStatus: number;
  code: string;
  message: string;
  retryAt?: Date;
}

/** Map any thrown value to a fixed organizer-facing response. Never echoes internal or Etsy text. */
export function mapEtsyError(err: unknown): MappedError {
  if (err instanceof EtsyError) {
    switch (err.code) {
      case 'ETSY_DISABLED':
      case 'ETSY_NOT_CONFIGURED':
        return { httpStatus: 503, code: 'ETSY_DISABLED', message: ETSY_MESSAGES.disabled };
      case 'ETSY_NOT_ALLOWED':
        return { httpStatus: 403, code: 'ETSY_NOT_ALLOWED', message: ETSY_MESSAGES.notAllowed };
      case 'ETSY_BUDGET':
      case 'ETSY_BLOCKED':
      case 'ETSY_BUSY':
      case 'ETSY_REFRESH_BUSY':
        return { httpStatus: 503, code: 'ETSY_BUSY', message: ETSY_MESSAGES.busy, retryAt: err.retryAt };
      case 'ETSY_NEEDS_REAUTH':
        return { httpStatus: 409, code: 'ETSY_NEEDS_REAUTH', message: ETSY_MESSAGES.needsReauth };
      case 'ETSY_NOT_CONNECTED':
        return { httpStatus: 404, code: 'ETSY_NOT_CONNECTED', message: ETSY_MESSAGES.notConnected };
      case 'ETSY_STATE_INVALID':
      case 'ETSY_TOKEN_EXCHANGE_FAILED':
        // One generic answer: the response never says which check failed.
        return { httpStatus: 400, code: 'ETSY_CONNECT_FAILED', message: ETSY_MESSAGES.connectFailed };
      case 'ETSY_NO_SHOP':
        return { httpStatus: 422, code: 'ETSY_NO_SHOP', message: ETSY_MESSAGES.noShop };
      case 'ETSY_SHOP_IN_USE':
        return { httpStatus: 409, code: 'ETSY_SHOP_IN_USE', message: ETSY_MESSAGES.shopInUse };
      default:
        return { httpStatus: 502, code: 'ETSY_ERROR', message: ETSY_MESSAGES.generic };
    }
  }
  return { httpStatus: 500, code: 'ETSY_ERROR', message: ETSY_MESSAGES.generic };
}

export interface EtsyConnectControllerDeps extends EtsyAuthDeps {
  /** Resolve the Organizer id for a user id. Defaults to prisma.organizer.findUnique({ where: { userId } }). */
  resolveOrganizerId?: (userId: string) => Promise<string | null>;
}

export function makeEtsyConnectHandlers(deps: EtsyConnectControllerDeps = {}) {
  const getEnv = (): EtsyEnv => deps.env ?? process.env;
  const authDeps = (): EtsyAuthDeps => deps;

  function respondError(res: Response, err: unknown, where: string): void {
    const mapped = mapEtsyError(err);
    if (mapped.httpStatus >= 500 && !(err instanceof EtsyError)) {
      // Unexpected failure: log the type only, never the message (it could carry token fragments).
      console.error(`[etsy] ${where} failed unexpectedly:`, (err as any)?.name || 'Error');
    } else if (mapped.httpStatus >= 500 && err instanceof EtsyError) {
      // Diagnostic (2026-10-04): the Etsy error code and upstream HTTP status only, never the message or any token.
      console.error(`[etsy] ${where} failed: code=${err.code} upstreamStatus=${err.status ?? 'n/a'}`);
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
      res.status(401).json({ message: ETSY_MESSAGES.authRequired });
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
      res.status(404).json({ message: ETSY_MESSAGES.organizerMissing });
      return null;
    }
    return { organizerId, userId };
  }

  /** 503 { code: 'ETSY_DISABLED', enabled: false } unless ETSY_CONNECTOR_ENABLED is exactly 'true'. */
  const etsyKillSwitch = (_req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!isEtsyConnectorEnabled(getEnv())) {
      res.status(503).json({ code: 'ETSY_DISABLED', enabled: false, message: ETSY_MESSAGES.disabled });
      return;
    }
    next();
  };

  /** GET /api/etsy/connect -> { authorizeUrl }. */
  const connect = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const who = await resolveOrganizer(req, res);
      if (!who) return;
      const result = await startEtsyConnect(who, authDeps());
      res.json({ authorizeUrl: result.authorizeUrl });
    } catch (err) {
      respondError(res, err, 'connect');
    }
  };

  /** POST /api/etsy/callback  body { code, state }. */
  const callback = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const who = await resolveOrganizer(req, res);
      if (!who) return;
      const result = await completeEtsyConnect(
        { organizerId: who.organizerId, userId: who.userId, code: req.body?.code, state: req.body?.state },
        authDeps()
      );
      const unsupported = result.shopCurrency && result.shopCurrency.toUpperCase() !== 'USD';
      res.json({
        success: true,
        connected: true,
        shopId: result.shopId,
        shopName: result.shopName,
        shopCurrency: result.shopCurrency,
        currencySupported: !unsupported,
        ...(unsupported ? { currencyMessage: currencyUnsupportedMessage(String(result.shopCurrency)) } : {}),
        attribution: ETSY_MESSAGES.attribution,
      });
    } catch (err) {
      respondError(res, err, 'callback');
    }
  };

  /** GET /api/etsy/connection (local state only, no Etsy call). */
  const getConnection = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const who = await resolveOrganizer(req, res);
      if (!who) return;
      const status = await getEtsyConnectionStatus(who.organizerId, authDeps());
      res.json({
        ...status,
        ...(status.shopCurrency && !status.currencySupported ? { currencyMessage: currencyUnsupportedMessage(status.shopCurrency) } : {}),
        ...(status.needsReauth || status.missingScopes.length > 0 ? { reconnectMessage: ETSY_MESSAGES.needsReauth } : {}),
      });
    } catch (err) {
      respondError(res, err, 'connection');
    }
  };

  /** DELETE /api/etsy/connection[?confirm=true]. 409 { activeListingCount } until confirmed when listings are live. */
  const disconnect = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const who = await resolveOrganizer(req, res);
      if (!who) return;
      const confirm = String(req.query?.confirm ?? '') === 'true';
      const result = await disconnectEtsyAccount({ organizerId: who.organizerId, confirm }, authDeps());
      if (result.needsConfirm) {
        res.status(409).json({
          code: 'ETSY_CONFIRM_REQUIRED',
          activeListingCount: result.activeListingCount,
          message: confirmDisconnectMessage(result.activeListingCount),
        });
        return;
      }
      res.json({
        success: true,
        disconnected: true,
        orphanedListingCount: result.orphanedListingCount,
        notice: ETSY_MESSAGES.disconnectNotice,
      });
    } catch (err) {
      respondError(res, err, 'disconnect');
    }
  };

  /** GET /api/etsy/shop-setup -> shipping profiles, return policies, processing profiles, current selection. */
  const getShopSetup = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const who = await resolveOrganizer(req, res);
      if (!who) return;
      const options = await fetchEtsyShopSetupOptions(who.organizerId, authDeps());
      res.json({ ...options, emptyMessage: options.needsEtsySideSetup ? ETSY_MESSAGES.emptySetup : null });
    } catch (err) {
      respondError(res, err, 'shop-setup');
    }
  };

  /** PUT /api/etsy/shop-setup  body { defaultShippingProfileId, defaultReturnPolicyId?, defaultReadinessStateId }. */
  const putShopSetup = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const who = await resolveOrganizer(req, res);
      if (!who) return;
      const result = await saveEtsyShopSetup(
        {
          organizerId: who.organizerId,
          shippingProfileId: req.body?.defaultShippingProfileId,
          returnPolicyId: req.body?.defaultReturnPolicyId,
          readinessStateId: req.body?.defaultReadinessStateId,
        },
        authDeps()
      );
      if (!result.ok) {
        res.status(400).json({ code: 'ETSY_SETUP_INVALID', field: result.field, message: ETSY_MESSAGES.setupInvalid });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      respondError(res, err, 'shop-setup-save');
    }
  };

  return { etsyKillSwitch, connect, callback, getConnection, disconnect, getShopSetup, putShopSetup };
}

const defaultHandlers = makeEtsyConnectHandlers();

export const etsyKillSwitch = defaultHandlers.etsyKillSwitch;
export const connectEtsyEndpoint = defaultHandlers.connect;
export const etsyCallbackEndpoint = defaultHandlers.callback;
export const getEtsyConnectionEndpoint = defaultHandlers.getConnection;
export const disconnectEtsyEndpoint = defaultHandlers.disconnect;
export const getEtsyShopSetupEndpoint = defaultHandlers.getShopSetup;
export const putEtsyShopSetupEndpoint = defaultHandlers.putShopSetup;
