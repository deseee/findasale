/**
 * refreshTokenService.ts -- refresh-token rotation with reuse detection (2026-09-30 auth hardening).
 *
 * Before: the refresh cookie was a stateless 30-day JWT. Stolen once, it minted access tokens for 30 days and could
 * only be killed by bumping User.tokenVersion (every device logged out). Now every issued refresh token has a row
 * (RefreshToken, keyed by the SHA-256 of its random `jti`) inside a rotation FAMILY:
 *
 *   login / oauth / passkey / invite-redeem / exit-impersonation -> new family, first token
 *   POST /auth/refresh (cookie)  -> the presented row is consumed atomically (conditional updateMany where
 *                                   revokedAt is null) and the next token in the same family is issued
 *   presenting an already-consumed token OUTSIDE the short reuse leeway -> the WHOLE family is revoked and the
 *                                   user must log in again (a stolen token was replayed, or the thief raced the
 *                                   owner: either way both lose the session); a security event is logged
 *   presenting one INSIDE the leeway (default 10s) -> a concurrent refresh from a second tab; a sibling token in
 *                                   the same family is issued instead of tripping the alarm
 *   logout -> family revoked; password change / reset -> every family of the user revoked
 *
 * Legacy tokens (issued before this deploy: no `jti`, no row) are accepted ONCE and upgraded into a new family, only
 * while now < graceStart + AUTH_LEGACY_REFRESH_GRACE_DAYS (default 14). The one-time use is enforced by inserting a
 * row keyed 'legacy:' + SHA-256(token) under the unique tokenHash index. graceStart is
 * AUTH_LEGACY_REFRESH_GRACE_STARTS_AT if set, else the createdAt of the oldest RefreshToken row (the first token this
 * code ever issued), else now. Legacy tokens expire on their own within 30 days of issue, so this anchor cannot be
 * stretched by pruning.
 *
 * Clients that cannot store a rotated cookie (the browser extension's service worker does a credential-less
 * cross-origin fetch with X-Refresh-Token) get `rotate: false`: the token is validated against its row but not
 * consumed, and no new refresh token is issued to them.
 *
 * If the RefreshToken table does not exist yet (the migration is applied manually), issuing falls back to the old
 * stateless token with a loud error log so login keeps working, and legacy tokens keep being accepted.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { prisma } from '../index';
import { logSecurityEvent } from '../utils/securityEvent';

const db = (): any => prisma as any;

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USED_REASONS = ['rotated', 'legacy_upgraded'];

export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true, // always HTTPS
  sameSite: 'lax' as const,
  path: '/', // sent regardless of proxy path depth (see authController history)
  maxAge: REFRESH_TTL_MS,
};

const sha256Hex = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');
export const hashJti = (jti: string): string => sha256Hex(jti);
export const hashLegacyToken = (token: string): string => 'legacy:' + sha256Hex(token);

const refreshSecret = (): string => (process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET) as string;

function envInt(name: string, dflt: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return dflt;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? n : dflt;
}
export const reuseLeewayMs = (): number => envInt('AUTH_REFRESH_REUSE_LEEWAY_SECONDS', 10) * 1000;
export const legacyGraceDays = (): number => envInt('AUTH_LEGACY_REFRESH_GRACE_DAYS', 14);

export const isMissingTableError = (err: any): boolean =>
  err?.code === 'P2021' || err?.code === 'P2022' || /relation ".*" does not exist|table .* does not exist/i.test(String(err?.message || ''));

function ctxOf(req?: Request | any): { ip: string | null; userAgent: string | null } {
  const ua = req?.headers?.['user-agent'];
  return {
    ip: typeof req?.ip === 'string' ? req.ip.slice(0, 64) : null,
    userAgent: typeof ua === 'string' ? ua.slice(0, 255) : null,
  };
}

function mint(claims: Record<string, any>): { token: string; jti: string; expiresAt: Date } {
  const jti = crypto.randomBytes(24).toString('hex');
  const token = jwt.sign(claims, refreshSecret(), { expiresIn: '30d', jwtid: jti });
  return { token, jti, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) };
}

/**
 * Issue a refresh token for a fresh session (new family). `claims` is the same claim object the old inline
 * jwt.sign calls used (id, email, name, role, roles, tokenVersion, organizerTokenVersion). Returns the JWT string.
 */
export async function issueRefreshToken(claims: Record<string, any> & { id: string }, opts: { req?: Request | any; familyId?: string } = {}): Promise<string> {
  const { token, jti, expiresAt } = mint(claims);
  const { ip, userAgent } = ctxOf(opts.req);
  try {
    await db().refreshToken.create({
      data: { userId: claims.id, familyId: opts.familyId ?? crypto.randomUUID(), tokenHash: hashJti(jti), expiresAt, ip, userAgent },
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      console.error('[refreshToken] RefreshToken table is missing: apply migration 20260930010000_refresh_token_rotation. Issuing a stateless refresh token meanwhile.');
      return jwt.sign(claims, refreshSecret(), { expiresIn: '30d' });
    }
    throw err;
  }
  return token;
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie('refreshToken', token, REFRESH_COOKIE_OPTIONS);
}

export type RotationFailure = 'REFRESH_REUSE_DETECTED' | 'REFRESH_REVOKED' | 'REFRESH_UNKNOWN' | 'REFRESH_EXPIRED' | 'LEGACY_REFRESH_EXPIRED';
export type RotationResult =
  | { ok: true; rotated: boolean; refreshToken?: string; familyId?: string; legacy?: boolean }
  | { ok: false; code: RotationFailure };

const fail = (code: RotationFailure): RotationResult => ({ ok: false, code });

let anchorCache: Date | null = null;
/** Test helper. */
export const __resetRefreshTokenCaches = (): void => { anchorCache = null; };

async function legacyGraceEndsAt(now: Date): Promise<Date> {
  const days = legacyGraceDays();
  let anchor: Date | null = null;
  const envStart = process.env.AUTH_LEGACY_REFRESH_GRACE_STARTS_AT;
  if (envStart) {
    const d = new Date(envStart);
    if (!Number.isNaN(d.getTime())) anchor = d;
  }
  if (!anchor && anchorCache) anchor = anchorCache;
  if (!anchor) {
    try {
      const first = await db().refreshToken.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
      if (first?.createdAt) {
        anchorCache = new Date(first.createdAt);
        anchor = anchorCache;
      }
    } catch (err) {
      if (!isMissingTableError(err)) console.error('[refreshToken] grace anchor lookup failed:', err);
    }
  }
  return new Date((anchor ?? now).getTime() + days * 24 * 60 * 60 * 1000);
}

export async function revokeFamily(familyId: string, reason: string): Promise<number> {
  try {
    const r = await db().refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
    return r?.count ?? 0;
  } catch (err) {
    console.error('[refreshToken] revokeFamily failed:', err);
    return 0;
  }
}

/** Revoke every live refresh token of a user (password change / reset). Never throws: tokenVersion already kills them. */
export async function revokeAllRefreshTokensForUser(userId: string, reason: string): Promise<number> {
  try {
    const r = await db().refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
    return r?.count ?? 0;
  } catch (err) {
    if (!isMissingTableError(err)) console.error('[refreshToken] revokeAll failed:', err);
    return 0;
  }
}

/** Logout: revoke the family of the presented refresh token. Best effort, never throws. */
export async function revokeFamilyOfToken(presented: string | undefined | null, reason = 'logout'): Promise<void> {
  if (!presented) return;
  try {
    const payload: any = jwt.verify(presented, refreshSecret(), { algorithms: ['HS256'], ignoreExpiration: true });
    if (typeof payload?.jti === 'string') {
      const row = await db().refreshToken.findUnique({ where: { tokenHash: hashJti(payload.jti) } });
      if (row) await revokeFamily(row.familyId, reason);
      return;
    }
    // Legacy token (no jti): burn it so the pre-deploy cookie cannot be used after logout during the grace window.
    if (typeof payload?.id === 'string') {
      await db().refreshToken.create({
        data: {
          userId: payload.id, familyId: crypto.randomUUID(), tokenHash: hashLegacyToken(presented),
          expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + REFRESH_TTL_MS),
          revokedAt: new Date(), revokedReason: reason,
        },
      });
    }
  } catch (err: any) {
    if (err?.code === 'P2002' || err?.name === 'JsonWebTokenError' || isMissingTableError(err)) return;
    console.error('[refreshToken] logout revoke failed:', err);
  }
}

export async function pruneExpiredRefreshTokens(now: Date = new Date(), keepDays = 7): Promise<number> {
  const cutoff = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000);
  const r = await db().refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  return r?.count ?? 0;
}

interface RotateInput {
  presented: string;
  payload: any; // the verified refresh JWT payload
  rotate: boolean; // false for header-sourced clients that cannot store a rotated cookie
  nextClaims: Record<string, any> & { id: string }; // claims for the next token, built from the FRESH user row
  req?: Request | any;
  now?: Date;
}

/** Create the next token's row (sibling or child) inside `client` and return the signed JWT. */
async function createNext(client: any, input: RotateInput, familyId: string, now: Date, id: string): Promise<{ token: string }> {
  const next = mint(input.nextClaims);
  const { ip, userAgent } = ctxOf(input.req);
  await client.refreshToken.create({
    data: { id, userId: input.nextClaims.id, familyId, tokenHash: hashJti(next.jti), expiresAt: next.expiresAt, ip, userAgent, createdAt: now },
  });
  return { token: next.token };
}

async function handleUsedRow(row: any, input: RotateInput, now: Date): Promise<RotationResult> {
  let current = row;
  try {
    current = (await db().refreshToken.findUnique({ where: { id: row.id } })) ?? row;
  } catch { /* use what we have */ }

  const used = USED_REASONS.includes(current.revokedReason);
  const withinLeeway = used && current.revokedAt && now.getTime() - new Date(current.revokedAt).getTime() <= reuseLeewayMs();
  if (withinLeeway) {
    // A concurrent refresh (second tab, retry) racing the first. Only if the family is still alive.
    const active = await db().refreshToken.count({ where: { familyId: current.familyId, revokedAt: null } });
    if (active > 0) {
      if (!input.rotate) return { ok: true, rotated: false, familyId: current.familyId };
      const { token } = await createNext(db(), input, current.familyId, now, crypto.randomUUID());
      return { ok: true, rotated: true, refreshToken: token, familyId: current.familyId };
    }
    return fail('REFRESH_REVOKED');
  }
  if (used) {
    const revoked = await revokeFamily(current.familyId, 'reuse_detected');
    logSecurityEvent('refresh_token_reuse', {
      userId: current.userId, familyId: current.familyId, revokedRows: revoked,
      usedAt: current.revokedAt, ...ctxOf(input.req),
    });
    return fail('REFRESH_REUSE_DETECTED');
  }
  return fail('REFRESH_REVOKED'); // logout / password change / earlier reuse detection
}

async function handleLegacy(input: RotateInput, now: Date): Promise<RotationResult> {
  const ends = await legacyGraceEndsAt(now);
  if (now.getTime() >= ends.getTime()) return fail('LEGACY_REFRESH_EXPIRED');
  if (!input.rotate) return { ok: true, rotated: false, legacy: true };

  const tokenHash = hashLegacyToken(input.presented);
  const familyId = crypto.randomUUID();
  const childId = crypto.randomUUID();
  const legacyId = crypto.randomUUID();
  let signed = '';
  try {
    await db().$transaction(async (tx: any) => {
      await tx.refreshToken.create({
        data: {
          id: legacyId, userId: input.payload.id, familyId, tokenHash,
          expiresAt: input.payload.exp ? new Date(input.payload.exp * 1000) : new Date(now.getTime() + REFRESH_TTL_MS),
          revokedAt: now, revokedReason: 'legacy_upgraded', replacedById: childId, createdAt: now, ...ctxOf(input.req),
        },
      });
      signed = (await createNext(tx, input, familyId, now, childId)).token;
    });
    return { ok: true, rotated: true, refreshToken: signed, familyId, legacy: true };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // Already upgraded once: a concurrent tab (inside the leeway) or a replay (revokes that family).
      const existing = await db().refreshToken.findUnique({ where: { tokenHash } });
      if (existing) return handleUsedRow(existing, input, now);
      return fail('REFRESH_REVOKED');
    }
    if (isMissingTableError(err)) {
      console.error('[refreshToken] RefreshToken table is missing: accepting legacy token without upgrade. Apply migration 20260930010000_refresh_token_rotation.');
      return { ok: true, rotated: false, legacy: true };
    }
    throw err;
  }
}

/**
 * Validate (and, when input.rotate, consume and replace) a presented refresh token. The caller has already verified
 * the JWT signature/expiry and the user's tokenVersion / suspension state.
 */
export async function rotateRefreshToken(input: RotateInput): Promise<RotationResult> {
  const now = input.now ?? new Date();
  const jti = typeof input.payload?.jti === 'string' ? input.payload.jti : null;
  if (!jti) return handleLegacy(input, now);

  const row = await db().refreshToken.findUnique({ where: { tokenHash: hashJti(jti) } });
  if (!row || row.userId !== input.payload.id) return fail('REFRESH_UNKNOWN');
  if (new Date(row.expiresAt).getTime() <= now.getTime()) return fail('REFRESH_EXPIRED');

  if (!row.revokedAt) {
    if (!input.rotate) return { ok: true, rotated: false, familyId: row.familyId };
    const childId = crypto.randomUUID();
    let signed = '';
    const claimedNext = await db().$transaction(async (tx: any) => {
      const claimed = await tx.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now, revokedReason: 'rotated' } });
      if (claimed.count !== 1) return false;
      signed = (await createNext(tx, input, row.familyId, now, childId)).token;
      await tx.refreshToken.update({ where: { id: row.id }, data: { replacedById: childId } });
      return true;
    });
    if (claimedNext) return { ok: true, rotated: true, refreshToken: signed, familyId: row.familyId };
    // Lost the race for this token: someone consumed it between our read and our claim.
    return handleUsedRow(row, input, now);
  }
  return handleUsedRow(row, input, now);
}
