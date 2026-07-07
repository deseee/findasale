/**
 * socialPublisherController.ts — admin-only controller for the in-house social publisher
 * (ADR-077 / ADR-077a). Mounted at /api/social-publisher.
 *
 * NOTE: distinct from the pre-existing socialController.ts (Sprint 2 social *template*
 * generator at /api/social). This is the OAuth-connect + publish-queue admin surface.
 *
 * EVERY route that mounts these handlers is guarded by `authenticate` + `requireAdmin`
 * in routes/socialPublisher.ts (ADR-077a invariant #3). NO organizer/shopper/anon access.
 *
 * Security invariants enforced here (ADR-077a §4):
 *  - #2 NO-TOKEN-IN-RESPONSE: account listings use a Prisma `select` whitelist that
 *    NEVER includes accessToken/refreshToken.
 *  - #5 NO-MASS-ASSIGNMENT: create/cancel accept only a whitelisted set of body fields;
 *    status/platform-mismatch/accountId-forgery/remotePostId/tokens can't be client-set.
 *  - #7 CROSS-ACCOUNT: createPost forces post.platform = account.platform (derived from
 *    the referenced account), never trusting a client platform value.
 */

import crypto from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import type { SocialPlatform } from '@prisma/client';
import { getPublisher, isPlatformSupported } from '../services/social/platforms';
import { upsertAccount, scrubTokens } from '../services/social/tokenStore';

// Account fields safe to return to an admin client — NEVER accessToken/refreshToken.
const ACCOUNT_PUBLIC_SELECT = {
  id: true,
  platform: true,
  platformUsername: true,
  platformUserId: true,
  pageId: true,
  isActive: true,
  connectedAt: true,
  lastRefreshedAt: true,
  lastErrorAt: true,
  lastErrorMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;

const VALID_PLATFORMS: SocialPlatform[] = [
  'X',
  'YOUTUBE',
  'INSTAGRAM',
  'FACEBOOK_PAGE',
  'PINTEREST',
];

function isValidPlatform(v: unknown): v is SocialPlatform {
  return typeof v === 'string' && (VALID_PLATFORMS as string[]).includes(v);
}

// ── Provider-callback URL slug ⇄ SocialPlatform enum (SINGLE source of truth). ───────
// Provider "Authorized redirect URI" fields require an EXACT string match and reject
// query strings, so the callback is path-based: /oauth/callback/<slug>. The slug is a
// lowercase, URL-safe segment; the authoritative platform is still resolved server-side
// from the pendingOAuth state (the slug only satisfies the provider's exact-URI match).
// Extensible: add INSTAGRAM/FACEBOOK_PAGE/PINTEREST here when their modules land.
const PLATFORM_SLUGS: Record<SocialPlatform, string> = {
  X: 'x',
  YOUTUBE: 'youtube',
  INSTAGRAM: 'instagram',
  FACEBOOK_PAGE: 'facebook-page',
  PINTEREST: 'pinterest',
};

const SLUG_TO_PLATFORM: Record<string, SocialPlatform> = Object.fromEntries(
  (Object.entries(PLATFORM_SLUGS) as [SocialPlatform, string][]).map(([p, slug]) => [slug, p])
) as Record<string, SocialPlatform>;

function platformSlug(platform: SocialPlatform): string {
  return PLATFORM_SLUGS[platform];
}

// ── Ephemeral OAuth state (PKCE verifier + platform), keyed by opaque `state`. ───────
// Admin-only, short-lived connect flow. Entries expire after 10 minutes. Kept in
// memory deliberately — a connect that spans a backend restart simply restarts.
interface PendingOAuth {
  platform: SocialPlatform;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: number;
}
const pendingOAuth = new Map<string, PendingOAuth>();
const OAUTH_TTL_MS = 10 * 60 * 1000;

function reapOAuth(): void {
  const cutoff = Date.now() - OAUTH_TTL_MS;
  for (const [state, v] of pendingOAuth.entries()) {
    if (v.createdAt < cutoff) pendingOAuth.delete(state);
  }
}

function callbackRedirectUri(platform: SocialPlatform): string {
  // QUERY-FREE, path-based — provider consoles require an exact-match redirect URI and
  // reject any query string. Shape: <base>/api/social-publisher/oauth/callback/<slug>.
  const base = process.env.SOCIAL_OAUTH_CALLBACK_BASE || process.env.BACKEND_URL || '';
  return `${base.replace(/\/$/, '')}/api/social-publisher/oauth/callback/${platformSlug(platform)}`;
}

// After the OAuth handshake the admin's browser is redirected back to the frontend
// admin page with a status query param (?connected=<slug> on success, ?error=<slug> on
// failure) — never a raw JSON body. Same FRONTEND_URL pattern used across controllers.
function adminSocialRedirect(params: string): string {
  const frontendUrl = (process.env.FRONTEND_URL || 'https://finda.sale').replace(/\/$/, '');
  return `${frontendUrl}/admin/social-accounts?${params}`;
}

/**
 * GET /api/social-publisher/accounts — list connected accounts (token fields excluded).
 */
export const listAccounts = async (_req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      select: ACCOUNT_PUBLIC_SELECT,
      orderBy: { platform: 'asc' },
    });
    return res.json({ accounts });
  } catch (err) {
    console.error('[socialPublisher] listAccounts error:', err instanceof Error ? scrubTokens(err.message) : err);
    return res.status(500).json({ message: 'Failed to list social accounts' });
  }
};

/**
 * POST /api/social-publisher/connect — start an OAuth connect flow for a platform.
 */
export const startConnect = async (req: AuthRequest, res: Response) => {
  try {
    const platform = req.body?.platform;
    if (!isValidPlatform(platform)) {
      return res.status(400).json({ message: 'Invalid or missing platform' });
    }
    if (!isPlatformSupported(platform)) {
      return res.status(400).json({ message: `Platform ${platform} is not yet supported` });
    }

    const publisher = getPublisher(platform)!;
    const state = crypto.randomBytes(24).toString('hex');
    const redirectUri = callbackRedirectUri(platform);

    const { authorizeUrl, codeVerifier } = publisher.buildAuthorizeUrl({ redirectUri, state });

    reapOAuth();
    pendingOAuth.set(state, { platform, codeVerifier, redirectUri, createdAt: Date.now() });

    return res.json({ authorizeUrl });
  } catch (err) {
    console.error('[socialPublisher] startConnect error:', err instanceof Error ? scrubTokens(err.message) : err);
    return res.status(500).json({ message: 'Failed to start connect flow' });
  }
};

/**
 * GET /api/social-publisher/oauth/callback/:platform?code=&state= — OAuth redirect target.
 * Query-free PATH form so provider consoles (Google/X/Meta) can register an exact-match
 * redirect URI. Exchanges the code, stores the ENCRYPTED tokens via tokenStore.
 *
 * SECURITY (CSRF, unchanged): the AUTHORITATIVE platform is resolved server-side from
 * the pendingOAuth entry keyed by `state` — NOT from the URL. The `:platform` path
 * segment exists ONLY to satisfy the provider's exact-URI match; we assert it maps to
 * the state-bound platform and reject on any mismatch. State single-use + PKCE
 * (pending.codeVerifier) validation are preserved exactly as before.
 */
export const oauthCallback = async (req: AuthRequest, res: Response) => {
  // On BOTH success and failure this handler 302-REDIRECTS the admin's browser back to
  // the frontend admin page with a status query param — it never returns raw JSON.
  // (?connected=<slug> on success, ?error=<slug> on failure.) All security below —
  // state single-use, PKCE (pending.codeVerifier), slug⇄state platform match, encrypted
  // token persistence via tokenStore.upsertAccount — is preserved exactly as before.
  const slug = typeof req.params.platform === 'string' ? req.params.platform : 'unknown';
  try {
    const code = req.query.code;
    const state = req.query.state;

    if (typeof code !== 'string' || typeof state !== 'string') {
      return res.redirect(302, adminSocialRedirect(`error=missing_code_or_state`));
    }

    reapOAuth();
    const pending = pendingOAuth.get(state);
    if (!pending) {
      return res.redirect(302, adminSocialRedirect(`error=invalid_or_expired_state`));
    }

    // AUTHORITATIVE platform comes from the state-bound pending entry — never the URL.
    const platform = pending.platform;

    // The URL slug only satisfies the provider's exact-URI match; it MUST agree with the
    // state-bound platform or this is a tampered/mismatched callback — reject it.
    if (SLUG_TO_PLATFORM[slug] !== platform) {
      return res.redirect(302, adminSocialRedirect(`error=invalid_or_expired_state`));
    }

    pendingOAuth.delete(state); // single-use

    const publisher = getPublisher(platform);
    if (!publisher) {
      return res.redirect(
        302,
        adminSocialRedirect(`error=platform_not_supported`),
      );
    }

    const exchanged = await publisher.exchangeCode({
      code,
      redirectUri: pending.redirectUri,
      codeVerifier: pending.codeVerifier,
    });

    // tokenStore.upsertAccount ENCRYPTS accessToken/refreshToken before persisting.
    await upsertAccount({
      platform,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken ?? null,
      tokenExpiresAt:
        exchanged.expiresInSeconds != null
          ? new Date(Date.now() + exchanged.expiresInSeconds * 1000)
          : null,
      platformUserId: exchanged.platformUserId ?? null,
      platformUsername: exchanged.platformUsername ?? null,
    });

    // Success — redirect to the admin page with ?connected=<slug> (e.g. youtube / x).
    return res.redirect(302, adminSocialRedirect(`connected=${platformSlug(platform)}`));
  } catch (err) {
    console.error('[socialPublisher] oauthCallback error:', err instanceof Error ? scrubTokens(err.message) : err);
    return res.redirect(302, adminSocialRedirect(`error=callback_failed`));
  }
};

/**
 * POST /api/social-publisher/disconnect — deactivate + delete a connected account.
 */
export const disconnectAccount = async (req: AuthRequest, res: Response) => {
  try {
    const platform = req.body?.platform;
    if (!isValidPlatform(platform)) {
      return res.status(400).json({ message: 'Invalid or missing platform' });
    }
    const existing = await prisma.socialAccount.findUnique({ where: { platform } });
    if (!existing) {
      return res.status(404).json({ message: 'No connected account for that platform' });
    }
    await prisma.socialAccount.delete({ where: { platform } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[socialPublisher] disconnectAccount error:', err instanceof Error ? scrubTokens(err.message) : err);
    return res.status(500).json({ message: 'Failed to disconnect account' });
  }
};

/**
 * GET /api/social-publisher/posts — list the publish queue (filterable by status/platform).
 */
export const listPosts = async (req: AuthRequest, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const platform = typeof req.query.platform === 'string' ? req.query.platform : undefined;

    const where: Record<string, unknown> = {};
    if (
      status &&
      ['DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'SKIPPED'].includes(status)
    ) {
      where.status = status;
    }
    if (platform && isValidPlatform(platform)) {
      where.platform = platform;
    }

    const posts = await prisma.socialPost.findMany({
      where,
      orderBy: { scheduledFor: 'desc' },
      take: 200,
      select: {
        id: true,
        platform: true,
        accountId: true,
        sourceFile: true,
        body: true,
        mediaUrls: true,
        linkUrl: true,
        status: true,
        scheduledFor: true,
        publishedAt: true,
        remotePostId: true,
        permalink: true,
        attemptCount: true,
        lastAttemptAt: true,
        lastErrorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return res.json({ posts });
  } catch (err) {
    console.error('[socialPublisher] listPosts error:', err instanceof Error ? scrubTokens(err.message) : err);
    return res.status(500).json({ message: 'Failed to list posts' });
  }
};

/**
 * POST /api/social-publisher/posts — admin-create a scheduled post.
 * Body whitelist ONLY: { platform, body, scheduledFor, mediaUrls?, linkUrl?, sourceFile? }.
 * The server DERIVES accountId from the platform, forces status=SCHEDULED, and NEVER
 * accepts client-supplied status/accountId/remotePostId/tokens (NO-MASS-ASSIGNMENT).
 */
export const createPost = async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body ?? {};
    const platform = body.platform;
    const text = body.body;
    const scheduledForRaw = body.scheduledFor;

    if (!isValidPlatform(platform)) {
      return res.status(400).json({ message: 'Invalid or missing platform' });
    }
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: 'body (post text) is required' });
    }
    const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : new Date();
    if (Number.isNaN(scheduledFor.getTime())) {
      return res.status(400).json({ message: 'scheduledFor is not a valid date' });
    }

    // Derive the account from the platform — do NOT trust a client accountId.
    const account = await prisma.socialAccount.findUnique({ where: { platform } });
    if (!account) {
      return res.status(400).json({ message: `No connected ${platform} account` });
    }

    const mediaUrls = Array.isArray(body.mediaUrls)
      ? body.mediaUrls.filter((u: unknown) => typeof u === 'string')
      : [];
    const linkUrl = typeof body.linkUrl === 'string' ? body.linkUrl : null;
    const sourceFile = typeof body.sourceFile === 'string' ? body.sourceFile : 'admin-manual';

    // sourceHash over the exact body we store — the engine re-verifies at send time.
    const sourceHash = crypto.createHash('sha256').update(text).digest('hex');

    const created = await prisma.socialPost.create({
      data: {
        accountId: account.id,
        platform: account.platform, // === platform, server-derived
        sourceFile,
        sourceHash,
        body: text,
        mediaUrls,
        linkUrl,
        status: 'SCHEDULED', // forced — never client-set
        scheduledFor,
      },
      select: { id: true, platform: true, status: true, scheduledFor: true },
    });

    return res.status(201).json({ post: created });
  } catch (err) {
    console.error('[socialPublisher] createPost error:', err instanceof Error ? scrubTokens(err.message) : err);
    return res.status(500).json({ message: 'Failed to create post' });
  }
};

/**
 * POST /api/social-publisher/posts/:id/cancel — cancel a not-yet-published post.
 * Server accepts ONLY the :id (no body fields). Only DRAFT/SCHEDULED/SKIPPED/FAILED
 * rows can be cancelled; a PUBLISHED or in-flight PUBLISHING row cannot.
 */
export const cancelPost = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Missing post id' });
    }
    const existing = await prisma.socialPost.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Post not found' });
    }
    if (!['DRAFT', 'SCHEDULED', 'SKIPPED', 'FAILED'].includes(existing.status)) {
      return res
        .status(409)
        .json({ message: `Cannot cancel a post in status ${existing.status}` });
    }
    const updated = await prisma.socialPost.update({
      where: { id },
      data: { status: 'FAILED', lastErrorMessage: 'Cancelled by admin' },
      select: { id: true, status: true },
    });
    return res.json({ post: updated });
  } catch (err) {
    console.error('[socialPublisher] cancelPost error:', err instanceof Error ? scrubTokens(err.message) : err);
    return res.status(500).json({ message: 'Failed to cancel post' });
  }
};
