/**
 * Consignor Square connection (2026-10-06): one place for how a consignor's Square OAuth result
 * is written to the Consignor row, shared by BOTH paths so they can never drift:
 *
 *   1. The organizer path (squareConnectController.ts handleSquareConnectCallback, CONSIGNOR
 *      branch): an authenticated organizer connects Square on the consignor's behalf. Behavior is
 *      unchanged from before this file existed: an unconditional update of the same five columns.
 *
 *   2. The consignor PORTAL path (no FindA.Sale account): the consignor opens their emailed
 *      portal link (Consignor.portalToken, a capability URL) and connects Square themselves.
 *      Because a link alone must never be able to silently redirect where someone's money goes,
 *      the portal path is FIRST CONNECT ONLY:
 *        - start and callback both refuse (409 SQUARE_ALREADY_CONNECTED) once the consignor is
 *          squareOnboarded with a squareAccountId; to swap accounts the consignor (or the organizer)
 *          must disconnect first (disconnectPortalSquare below, 2026-10-06), which emails the
 *          organizer and the consignor;
 *        - if a not-yet-active Square account is already stored, the portal may only reconnect
 *          the SAME Square merchant (SQUARE_ACCOUNT_MISMATCH otherwise);
 *        - the write itself is conditional (updateMany guarded on squareAccountId being null or
 *          the same merchant), so a concurrent organizer connect can never be overwritten.
 *      State handling: a signed portal-variant state (squareConnectService.ts
 *      encodeSquarePortalOAuthState) bound to the consignor id, 20-minute TTL, with a single-use
 *      nonce whose SHA-256 is stored on the row at start and consumed atomically on callback.
 *
 * Shared-merchant note: the SAME Square merchant id may legitimately appear on several rows (one
 * person consigning with several organizers, or also being an organizer / booth operator).
 * Nothing here rejects that, there is no uniqueness constraint on Consignor.squareAccountId, and
 * squareConnectService.recordAndCheckSquareBankFingerprints only compares a fingerprint against
 * rows with a DIFFERENT squareAccountId, so a shared merchant is never flagged as fraud while a
 * shared bank account across different merchants still is.
 */
import { prisma } from '../lib/prisma';
import { decryptToken, encryptToken } from '../utils/tokenCrypto';
import {
  buildSquarePortalAuthorizeUrl,
  decodeSquarePortalOAuthState,
  exchangeSquareAuthorizationCode,
  fetchAndCheckSquareBankFingerprints,
  getSquareAccountStatus,
  hashSquarePortalNonce,
  isPayoutFlaggedForReview,
  refreshSquareAccessToken,
  type SquareAccountStatus,
  type SquareTokenResult,
} from './squareConnectService';
import {
  sendConsignorSquareConnectedNotice,
  sendConsignorSquareDisconnectedNotice,
  sendOrganizerConsignorDataRemovalRequest,
  sendOrganizerConsignorSquareConnectedNotice,
  sendOrganizerConsignorSquareDisconnectedNotice,
} from './consignorEmailService';
import {
  CONSIGNOR_SQUARE_CLEARED_FIELDS,
  consignorHasSquareData,
  revokeConsignorSquareConnection,
} from './consignorSquareDisconnectService';
import { consignorSquareStatus, portalCanConnectSquare, type ConsignorSquareStatus } from '../utils/consignorSquareStatus';

// ---------------------------------------------------------------------------------------------
// Status helpers (used by the organizer list and the public portal)
// ---------------------------------------------------------------------------------------------

export { consignorSquareStatus, portalCanConnectSquare } from '../utils/consignorSquareStatus';
export type { ConsignorSquareStatus } from '../utils/consignorSquareStatus';

// ---------------------------------------------------------------------------------------------
// Shared persistence (organizer + portal)
// ---------------------------------------------------------------------------------------------

export interface EncryptedSquareTokenFields {
  squareAccessTokenEncrypted: string;
  squareRefreshTokenEncrypted: string | null;
  squareTokenExpiresAt: Date | null;
}

/** Same encryption treatment handleSquareConnectCallback has always applied. */
export function encryptSquareTokenFields(token: SquareTokenResult): EncryptedSquareTokenFields {
  return {
    squareAccessTokenEncrypted: encryptToken(token.accessToken),
    squareRefreshTokenEncrypted: token.refreshToken ? encryptToken(token.refreshToken) : null,
    squareTokenExpiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
  };
}

/** The exact column set written for a consignor connection, in one place. */
export function consignorSquareConnectionData(tokens: EncryptedSquareTokenFields, status: SquareAccountStatus) {
  return {
    squareAccountId: status.merchantId,
    squareOnboarded: status.active,
    squareAccessTokenEncrypted: tokens.squareAccessTokenEncrypted,
    squareRefreshTokenEncrypted: tokens.squareRefreshTokenEncrypted,
    squareTokenExpiresAt: tokens.squareTokenExpiresAt,
  };
}

/**
 * Writes a consignor's Square connection.
 *  - mode 'ORGANIZER': unconditional update, byte-for-byte what handleSquareConnectCallback did
 *    inline before this refactor. Returns true (update throws if the row is gone, as before).
 *  - mode 'PORTAL': conditional write; only succeeds when no Square account is stored yet or the
 *    stored one is the same merchant. Returns false when the guard did not match.
 */
export async function persistConsignorSquareConnection(
  consignorId: string,
  tokens: EncryptedSquareTokenFields,
  status: SquareAccountStatus,
  mode: 'ORGANIZER' | 'PORTAL'
): Promise<boolean> {
  const data = consignorSquareConnectionData(tokens, status);
  if (mode === 'ORGANIZER') {
    await prisma.consignor.update({ where: { id: consignorId }, data });
    return true;
  }
  const result = await prisma.consignor.updateMany({
    where: {
      id: consignorId,
      OR: [{ squareAccountId: null }, { squareAccountId: status.merchantId }],
    },
    data,
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------------------------
// Portal flow
// ---------------------------------------------------------------------------------------------

export type PortalSquareErrorCode =
  | 'PORTAL_NOT_FOUND'
  | 'SQUARE_ALREADY_CONNECTED'
  | 'SQUARE_UNAVAILABLE'
  | 'STATE_INVALID'
  | 'STATE_MISMATCH'
  | 'STATE_USED'
  | 'CODE_INVALID'
  | 'SQUARE_EXCHANGE_FAILED'
  | 'SQUARE_ACCOUNT_MISMATCH'
  | 'REQUEST_NOT_SENT';

export class PortalSquareError extends Error {
  status: number;
  code: PortalSquareErrorCode;
  constructor(status: number, code: PortalSquareErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'PortalSquareError';
  }
}

const MSG = {
  notFound: 'Portal not found',
  alreadyConnected:
    'A Square account is already connected for your payouts. To use a different one, disconnect it first from your portal.',
  unavailable: 'Square connection is not available right now. Please try again later.',
  stateInvalid: 'This Square connection link has expired or is not valid. Please start again from your portal.',
  stateUsed: 'This Square connection was already used or replaced by a newer one. Please start again from your portal.',
  codeInvalid: 'Square did not send back a valid response. Please start again from your portal.',
  exchangeFailed: 'Square could not confirm the connection. Please start again from your portal.',
  accountMismatch:
    'A different Square account is already saved for your payouts. If it needs to change, please contact your organizer.',
};

const PORTAL_CONSIGNOR_SELECT = {
  id: true,
  name: true,
  email: true,
  squareAccountId: true,
  squareOnboarded: true,
  squareAccessTokenEncrypted: true,
  squareRefreshTokenEncrypted: true,
  squareTokenExpiresAt: true,
  squarePortalOAuthNonce: true,
  payoutsFlaggedForReview: true,
} as const;

function isPlausiblePortalToken(token: unknown): token is string {
  return typeof token === 'string' && token.length > 0 && token.length <= 128;
}

async function findConsignorByPortalToken(portalToken: unknown) {
  if (!isPlausiblePortalToken(portalToken)) return null;
  return prisma.consignor.findUnique({ where: { portalToken }, select: PORTAL_CONSIGNOR_SELECT });
}

export interface PortalSquareStatusView {
  status: ConsignorSquareStatus;
  canConnect: boolean;
  payoutsFlaggedForReview: boolean;
}

function statusView(row: { squareAccountId: string | null; squareOnboarded: boolean; payoutsFlaggedForReview: boolean }): PortalSquareStatusView {
  return {
    status: consignorSquareStatus(row),
    canConnect: portalCanConnectSquare(row),
    payoutsFlaggedForReview: Boolean(row.payoutsFlaggedForReview),
  };
}

/** GET status, cached values only. Never returns merchant ids or tokens. */
export async function getPortalSquareStatus(portalToken: unknown): Promise<PortalSquareStatusView> {
  const consignor = await findConsignorByPortalToken(portalToken);
  if (!consignor) throw new PortalSquareError(404, 'PORTAL_NOT_FOUND', MSG.notFound);
  return statusView(consignor);
}

/**
 * Start: returns the Square authorize URL. Stores only the SHA-256 of the fresh nonce, which
 * invalidates any earlier unfinished start for this consignor.
 */
export async function startPortalSquareConnection(portalToken: unknown): Promise<{ onboardingUrl: string }> {
  const consignor = await findConsignorByPortalToken(portalToken);
  if (!consignor) throw new PortalSquareError(404, 'PORTAL_NOT_FOUND', MSG.notFound);
  if (!portalCanConnectSquare(consignor)) {
    throw new PortalSquareError(409, 'SQUARE_ALREADY_CONNECTED', MSG.alreadyConnected);
  }
  let built: { url: string; nonce: string };
  try {
    built = buildSquarePortalAuthorizeUrl(consignor.id);
  } catch (err: any) {
    console.error('[consignorSquareConnect] Square authorize URL unavailable:', err?.message || 'unknown');
    throw new PortalSquareError(503, 'SQUARE_UNAVAILABLE', MSG.unavailable);
  }
  await prisma.consignor.update({
    where: { id: consignor.id },
    data: { squarePortalOAuthNonce: hashSquarePortalNonce(built.nonce) },
  });
  return { onboardingUrl: built.url };
}

export interface PortalSquareCallbackResult extends PortalSquareStatusView {
  squareOnboarded: boolean;
  needsActivation: boolean;
}

/**
 * Callback: completes the portal connection. Order matters:
 *   decode state -> resolve consignor from the portal token in the URL -> state must name THAT
 *   consignor -> refuse if already connected -> consume the nonce atomically (replay guard) ->
 *   exchange the code -> refuse a different merchant than one already stored -> conditional write
 *   -> bank-fingerprint check -> notify consignor and organizer (non-blocking).
 */
export async function completePortalSquareConnection(params: {
  portalToken: unknown;
  code: unknown;
  state: unknown;
}): Promise<PortalSquareCallbackResult> {
  const decoded = typeof params.state === 'string' ? decodeSquarePortalOAuthState(params.state) : null;
  if (!decoded) throw new PortalSquareError(400, 'STATE_INVALID', MSG.stateInvalid);

  const consignor = await findConsignorByPortalToken(params.portalToken);
  if (!consignor) throw new PortalSquareError(404, 'PORTAL_NOT_FOUND', MSG.notFound);

  if (decoded.ownerId !== consignor.id) {
    // A state minted for a different consignor's portal. Same user-facing message as an
    // invalid state so the response does not confirm which consignor the state belongs to.
    throw new PortalSquareError(403, 'STATE_MISMATCH', MSG.stateInvalid);
  }

  if (!portalCanConnectSquare(consignor)) {
    throw new PortalSquareError(409, 'SQUARE_ALREADY_CONNECTED', MSG.alreadyConnected);
  }

  const code = params.code;
  if (typeof code !== 'string' || !code || code.length > 512) {
    throw new PortalSquareError(400, 'CODE_INVALID', MSG.codeInvalid);
  }

  const consumed = await prisma.consignor.updateMany({
    where: { id: consignor.id, squarePortalOAuthNonce: hashSquarePortalNonce(decoded.nonce) },
    data: { squarePortalOAuthNonce: null },
  });
  if (consumed.count === 0) throw new PortalSquareError(409, 'STATE_USED', MSG.stateUsed);

  let token: SquareTokenResult;
  let status: SquareAccountStatus;
  try {
    token = await exchangeSquareAuthorizationCode(code);
    status = await getSquareAccountStatus(token.accessToken);
  } catch (error: any) {
    // Same minimal, token-free logging posture as handleSquareConnectCallback.
    console.error(
      '[consignorSquareConnect] portal code exchange failed:',
      error?.statusCode ?? error?.response?.status,
      error?.result?.errors?.[0]?.category || error?.result?.errors?.[0]?.code || error?.message || 'Unknown error'
    );
    throw new PortalSquareError(502, 'SQUARE_EXCHANGE_FAILED', MSG.exchangeFailed);
  }

  if (consignor.squareAccountId && consignor.squareAccountId !== status.merchantId) {
    throw new PortalSquareError(409, 'SQUARE_ACCOUNT_MISMATCH', MSG.accountMismatch);
  }

  const written = await persistConsignorSquareConnection(consignor.id, encryptSquareTokenFields(token), status, 'PORTAL');
  if (!written) throw new PortalSquareError(409, 'SQUARE_ACCOUNT_MISMATCH', MSG.accountMismatch);

  // Non-fatal by design (never throws), awaited for the same reason as the organizer callback:
  // this is the moment the access token is in hand.
  await fetchAndCheckSquareBankFingerprints(token.accessToken, status.merchantId);
  const flagged = await isPayoutFlaggedForReview('CONSIGNOR', consignor.id);

  console.log(`[consignorSquareConnect] Portal Square connect completed for consignor ${consignor.id}: active=${status.active}.`);

  void notifyPortalSquareConnected(consignor.id, status.active).catch((err) =>
    console.warn('[consignorSquareConnect] connect notices failed:', err?.message || err)
  );

  return {
    status: status.active ? 'ACTIVE' : 'NEEDS_ACTIVATION',
    canConnect: !status.active,
    payoutsFlaggedForReview: flagged,
    squareOnboarded: status.active,
    needsActivation: !status.active,
  };
}

/** Emails the consignor and the workspace owner after a portal connect. Never throws. */
export async function notifyPortalSquareConnected(consignorId: string, active: boolean): Promise<void> {
  try {
    const row = await prisma.consignor.findUnique({
      where: { id: consignorId },
      select: {
        name: true,
        email: true,
        workspace: { select: { name: true, owner: { select: { user: { select: { email: true } } } } } },
      },
    });
    if (!row) return;
    const organizerName = row.workspace?.name || 'Your organizer';
    const organizerEmail = row.workspace?.owner?.user?.email ?? null;
    const at = new Date();
    await Promise.all([
      sendConsignorSquareConnectedNotice({
        consignorName: row.name,
        consignorEmail: row.email,
        organizerName,
        active,
        connectedAt: at,
      }),
      sendOrganizerConsignorSquareConnectedNotice({
        organizerEmail,
        organizerName,
        consignorName: row.name,
        active,
        connectedAt: at,
      }),
    ]);
  } catch (err: any) {
    console.warn('[consignorSquareConnect] notifyPortalSquareConnected failed:', err?.message || err);
  }
}

const SQUARE_TOKEN_REFRESH_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * Refresh status (portal "Check again" button for a NEEDS_ACTIVATION account): re-reads the
 * merchant's status from Square with the stored token (refreshing it first if it is close to
 * expiry). Only ever updates squareOnboarded / token columns for the SAME merchant; it can never
 * change which Square account is stored. Falls back to cached status on any Square error.
 */
export async function refreshPortalSquareStatus(portalToken: unknown): Promise<PortalSquareStatusView> {
  const consignor = await findConsignorByPortalToken(portalToken);
  if (!consignor) throw new PortalSquareError(404, 'PORTAL_NOT_FOUND', MSG.notFound);
  if (!consignor.squareAccountId || !consignor.squareAccessTokenEncrypted) return statusView(consignor);

  try {
    let accessToken: string;
    let tokenUpdate: {
      squareAccessTokenEncrypted?: string;
      squareRefreshTokenEncrypted?: string;
      squareTokenExpiresAt?: Date | null;
    } = {};
    const expiresAt = consignor.squareTokenExpiresAt;
    const needsRefresh = !!expiresAt && expiresAt.getTime() <= Date.now() + SQUARE_TOKEN_REFRESH_SKEW_MS;
    if (needsRefresh && consignor.squareRefreshTokenEncrypted) {
      const refreshed = await refreshSquareAccessToken(decryptToken(consignor.squareRefreshTokenEncrypted));
      accessToken = refreshed.accessToken;
      tokenUpdate = {
        squareAccessTokenEncrypted: encryptToken(refreshed.accessToken),
        ...(refreshed.refreshToken ? { squareRefreshTokenEncrypted: encryptToken(refreshed.refreshToken) } : {}),
        squareTokenExpiresAt: refreshed.expiresAt ? new Date(refreshed.expiresAt) : null,
      };
    } else {
      accessToken = decryptToken(consignor.squareAccessTokenEncrypted);
    }

    const status = await getSquareAccountStatus(accessToken);
    if (status.merchantId !== consignor.squareAccountId) {
      // Never let a status refresh change the stored merchant.
      console.warn(`[consignorSquareConnect] refresh merchant mismatch for consignor ${consignor.id}; keeping cached status.`);
      return statusView(consignor);
    }
    await prisma.consignor.update({
      where: { id: consignor.id },
      data: { ...tokenUpdate, squareOnboarded: status.active },
    });
    return statusView({ ...consignor, squareOnboarded: status.active });
  } catch (error: any) {
    console.error(
      '[consignorSquareConnect] status refresh failed:',
      error?.statusCode ?? error?.response?.status,
      error?.result?.errors?.[0]?.code || error?.message || 'Unknown error'
    );
    return statusView(consignor);
  }
}

// ---------------------------------------------------------------------------------------------
// Self-serve disconnect + data-removal request (2026-10-06)
// ---------------------------------------------------------------------------------------------

export interface PortalSquareDisconnectResult extends PortalSquareStatusView {
  /** true when this call actually removed a connection; false when there was nothing to remove. */
  disconnected: boolean;
}

/**
 * Consignor disconnects Square from their portal. Revokes at Square (non-fatal, skipped when the
 * same merchant is connected elsewhere, see consignorSquareDisconnectService), clears the stored
 * Square columns AND any in-flight OAuth nonce, keeps every ledger/payout/sales record, then tells
 * the organizer and the consignor (non-blocking). Idempotent: already disconnected is a 200 with
 * disconnected=false and no email. The clear is conditional on the merchant id read above, so two
 * concurrent calls cannot both send notices.
 */
export async function disconnectPortalSquare(portalToken: unknown): Promise<PortalSquareDisconnectResult> {
  const consignor = await findConsignorByPortalToken(portalToken);
  if (!consignor) throw new PortalSquareError(404, 'PORTAL_NOT_FOUND', MSG.notFound);

  const notConnected = (): PortalSquareDisconnectResult => ({
    status: 'NOT_CONNECTED',
    canConnect: true,
    payoutsFlaggedForReview: Boolean(consignor.payoutsFlaggedForReview),
    disconnected: false,
  });
  if (!consignorHasSquareData(consignor)) return notConnected();

  await revokeConsignorSquareConnection(consignor);

  const cleared = await prisma.consignor.updateMany({
    where: { id: consignor.id, squareAccountId: consignor.squareAccountId ?? null },
    data: { ...CONSIGNOR_SQUARE_CLEARED_FIELDS },
  });
  if (cleared.count === 0) return notConnected();

  console.log(`[consignorSquareConnect] Portal Square disconnect completed for consignor ${consignor.id}.`);
  void notifyPortalSquareDisconnected(consignor.id).catch((err) =>
    console.warn('[consignorSquareConnect] disconnect notices failed:', err?.message || err)
  );
  return { ...notConnected(), disconnected: true };
}

/** Emails the workspace owner (and the consignor) after a portal disconnect. Never throws. */
export async function notifyPortalSquareDisconnected(consignorId: string): Promise<void> {
  try {
    const row = await prisma.consignor.findUnique({
      where: { id: consignorId },
      select: {
        name: true,
        email: true,
        workspace: { select: { name: true, owner: { select: { user: { select: { email: true } } } } } },
      },
    });
    if (!row) return;
    const organizerName = row.workspace?.name || 'Your organizer';
    const organizerEmail = row.workspace?.owner?.user?.email ?? null;
    const at = new Date();
    await Promise.all([
      sendOrganizerConsignorSquareDisconnectedNotice({
        organizerEmail,
        organizerName,
        consignorName: row.name,
        disconnectedAt: at,
      }),
      sendConsignorSquareDisconnectedNotice({
        consignorName: row.name,
        consignorEmail: row.email,
        organizerName,
        disconnectedAt: at,
      }),
    ]);
  } catch (err: any) {
    console.warn('[consignorSquareConnect] notifyPortalSquareDisconnected failed:', err?.message || err);
  }
}

/**
 * Consignor asks, from their portal, for their personal data to be removed or reviewed. Records and
 * deletes NOTHING: it only emails the workspace owner so a person can follow up (sales and payout
 * records may have to be kept for legal and accounting reasons). Throws REQUEST_NOT_SENT (503) when
 * the organizer could not be emailed, so the consignor is never told a request went through when it
 * did not. Rate limited per token at the route (consignorPortalDataRemovalLimiter).
 */
export async function requestPortalDataRemoval(portalToken: unknown): Promise<{ requested: true }> {
  const found = await findConsignorByPortalToken(portalToken);
  if (!found) throw new PortalSquareError(404, 'PORTAL_NOT_FOUND', MSG.notFound);
  const row = await prisma.consignor.findUnique({
    where: { id: found.id },
    select: {
      name: true,
      email: true,
      workspace: { select: { name: true, owner: { select: { user: { select: { email: true } } } } } },
    },
  });
  if (!row) throw new PortalSquareError(404, 'PORTAL_NOT_FOUND', MSG.notFound);
  const result = await sendOrganizerConsignorDataRemovalRequest({
    organizerEmail: row.workspace?.owner?.user?.email ?? null,
    organizerName: row.workspace?.name || 'Your organizer',
    consignorName: row.name,
    consignorEmail: row.email,
    requestedAt: new Date(),
  });
  if (!result.sent) {
    console.warn(`[consignorSquareConnect] data-removal request for consignor ${found.id} not delivered: ${result.reason}`);
    throw new PortalSquareError(
      503,
      'REQUEST_NOT_SENT',
      'We could not send your request right now. Please try again later, or contact your organizer directly.'
    );
  }
  console.log(`[consignorSquareConnect] Data-removal request sent to organizer for consignor ${found.id}.`);
  return { requested: true };
}
