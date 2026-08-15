/**
 * threads.ts — Threads (Meta) platform module. ADR-105 scope (roadmap #625).
 *
 * Auth: OAuth 2.0 Authorization Code (no PKCE — not part of the Threads API's
 * documented flow, unlike x.ts). Client credentials come from THREADS_APP_ID /
 * THREADS_APP_SECRET — a Threads-specific app id/secret Meta issues under the
 * "Threads" use case of the FindA.Sale Meta app, DISTINCT from FACEBOOK_APP_ID
 * (Meta's own docs: "there will be 2 app IDs and app secrets... use the Threads
 * app ID and its corresponding app secret").
 *
 * Token lifecycle (Meta's multi-step model, distinct from X's single refresh call):
 *   1. Authorization code -> short-lived user access token (1h)
 *      POST https://graph.threads.net/oauth/access_token
 *   2. Short-lived -> long-lived token (60 days) — done immediately inside
 *      exchangeCode() so tokenStore only ever sees a long-lived token
 *      GET https://graph.threads.net/access_token?grant_type=th_exchange_token
 *   3. Refresh a long-lived token (resets its own 60-day clock; must be >=24h old
 *      and not yet expired)
 *      GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token
 *
 * DEVIATION FROM THE ACCESS/REFRESH SPLIT (x.ts): Threads has no distinct OAuth
 * refresh_token grant — the long-lived ACCESS token itself is what gets refreshed.
 * tokenStore.ts is the ONLY module allowed to decrypt SocialAccount.accessToken, so
 * this module cannot read the current access token directly to refresh it. To fit
 * the PlatformRefreshFn contract without breaking that chokepoint rule, a COPY of
 * the current long-lived access token is also written into the refreshToken slot
 * (both in exchangeCode() and again in refresh()) — so `plaintextRefreshToken`
 * passed into refresh() below is really "the current still-valid access token",
 * not a separate credential. See instagram.ts for the identical pattern.
 *
 * Publish is a two-step container model (create, then publish) — same shape as
 * Instagram's media/media_publish; Meta unified this pattern across both APIs.
 * Docs recommend waiting ~30s between container creation and publish to give
 * Meta's servers time to finish processing the upload. This runs inside the
 * publisher cron job (not a live user-facing request), so a fixed delay is
 * acceptable for Phase 1a text-only posts.
 *
 * Real credentials exist (Railway backend service + packages/backend/.env,
 * confirmed present 2026-08-15) but NO live OAuth flow or live post has been run
 * in this dispatch — code-only, per dispatch constraint (roadmap #625). A later
 * session verifies live OAuth + a real post via Chrome QA.
 */

import axios from 'axios';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { PlatformPublisher, OAuthStart, PublishResult } from './types';
import type { RefreshedTokens } from '../tokenStore';

const THREADS_OAUTH_AUTHORIZE = 'https://threads.net/oauth/authorize';
const THREADS_OAUTH_TOKEN = 'https://graph.threads.net/oauth/access_token';
const THREADS_LONG_LIVED_EXCHANGE = 'https://graph.threads.net/access_token';
const THREADS_REFRESH = 'https://graph.threads.net/refresh_access_token';
const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

// threads_basic required for all endpoints; threads_content_publish required for
// publishing endpoints (per developers.facebook.com/docs/threads/get-started).
const THREADS_SCOPES = ['threads_basic', 'threads_content_publish'];

const THREADS_MAX_POST_CHARS = 500;

// Meta's docs recommend waiting ~30s after creating a media container before
// publishing it, to give their servers time to fully process the upload. This
// runs inside the (non-blocking) publisher cron, not a live request, so the
// fixed delay is acceptable for Phase 1a's one-post-at-a-time text publishing.
const THREADS_CONTAINER_PROCESS_DELAY_MS = 30000;

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.THREADS_APP_ID;
  const clientSecret = process.env.THREADS_APP_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      '[threads] THREADS_APP_ID / THREADS_APP_SECRET not configured. Set them on the Railway backend service.'
    );
  }
  return { clientId, clientSecret };
}

function buildAuthorizeUrl(params: { redirectUri: string; state: string }): OAuthStart {
  const { clientId } = getClientCreds();
  const url = new URL(THREADS_OAUTH_AUTHORIZE);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', THREADS_SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', params.state);
  // No PKCE — codeVerifier intentionally omitted from the returned OAuthStart.
  return { authorizeUrl: url.toString(), state: params.state };
}

async function exchangeCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<{
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
  platformUserId?: string | null;
  platformUsername?: string | null;
}> {
  const { clientId, clientSecret } = getClientCreds();

  // Step 1: authorization code -> short-lived user access token (1h).
  const shortLivedForm = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri,
    code: params.code,
  });
  const shortLivedRes = await axios.post(THREADS_OAUTH_TOKEN, shortLivedForm.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  const shortLivedToken: string | undefined = shortLivedRes.data?.access_token;
  const shortLivedUserId: string | null =
    shortLivedRes.data?.user_id != null ? String(shortLivedRes.data.user_id) : null;
  if (!shortLivedToken) {
    throw new Error('[threads] authorization code exchange did not return an access_token');
  }

  // Step 2: short-lived -> long-lived token (60 days) — done immediately so
  // tokenStore never has to juggle two different token "kinds".
  const longLivedRes = await axios.get(THREADS_LONG_LIVED_EXCHANGE, {
    params: {
      grant_type: 'th_exchange_token',
      client_secret: clientSecret,
      access_token: shortLivedToken,
    },
    timeout: 15000,
  });
  const accessToken: string | undefined = longLivedRes.data?.access_token;
  const expiresInSeconds: number | null = longLivedRes.data?.expires_in ?? null;
  if (!accessToken) {
    throw new Error('[threads] long-lived token exchange did not return an access_token');
  }

  // Best-effort username fetch for admin display (non-fatal — matches x.ts's
  // /users/me pattern).
  let platformUserId: string | null = shortLivedUserId;
  let platformUsername: string | null = null;
  try {
    const me = await axios.get(`${THREADS_API_BASE}/me`, {
      params: { fields: 'id,username', access_token: accessToken },
      timeout: 15000,
    });
    platformUserId = me.data?.id != null ? String(me.data.id) : platformUserId;
    platformUsername = me.data?.username ?? null;
  } catch {
    // non-fatal — identity is display sugar
  }

  return {
    accessToken,
    refreshToken: accessToken, // duplicated copy — see header comment (no distinct refresh grant)
    expiresInSeconds,
    platformUserId,
    platformUsername,
  };
}

const refresh = async (
  _account: SocialAccount,
  plaintextRefreshToken: string | null
): Promise<RefreshedTokens> => {
  // plaintextRefreshToken here is really "the current still-valid long-lived
  // access token" — see header comment (Threads has no separate refresh grant).
  if (!plaintextRefreshToken) {
    throw new Error('[threads] no stored access-token copy to refresh -- account must be reconnected');
  }

  const res = await axios.get(THREADS_REFRESH, {
    params: { grant_type: 'th_refresh_token', access_token: plaintextRefreshToken },
    timeout: 15000,
  });

  const accessToken: string | undefined = res.data?.access_token;
  const expiresInSeconds: number | null = res.data?.expires_in ?? null;
  if (!accessToken) {
    throw new Error('[threads] refresh_access_token did not return an access_token');
  }

  return {
    accessToken,
    refreshToken: accessToken, // duplicate copy again — see header comment
    expiresInSeconds,
  };
};

/**
 * Post a text thread (Phase 1a — text-only; media is a later phase, same scope
 * as X/Bluesky). Two-step container model per Threads API docs.
 */
async function publish(params: {
  post: SocialPost;
  account: SocialAccount;
  accessToken: string;
}): Promise<PublishResult> {
  const { post, account, accessToken } = params;

  const threadsUserId = account.platformUserId;
  if (!threadsUserId) {
    throw new Error('[threads] account.platformUserId missing -- reconnect required');
  }

  let text = post.body ?? '';
  if (post.linkUrl && !text.includes(post.linkUrl)) {
    text = `${text}\n${post.linkUrl}`;
  }
  if (text.length > THREADS_MAX_POST_CHARS) {
    text = text.slice(0, THREADS_MAX_POST_CHARS);
  }
  if (!text.trim()) {
    throw new Error('[threads] refusing to publish an empty post');
  }

  // Step 1: create the media container.
  const createRes = await axios.post(`${THREADS_API_BASE}/${threadsUserId}/threads`, null, {
    params: { media_type: 'TEXT', text, access_token: accessToken },
    timeout: 20000,
  });
  const containerId: string | undefined = createRes.data?.id;
  if (!containerId) {
    throw new Error('[threads] media container creation returned no id');
  }

  // Give Meta's servers time to finish processing before publishing (see const doc).
  await new Promise((resolve) => setTimeout(resolve, THREADS_CONTAINER_PROCESS_DELAY_MS));

  // Step 2: publish the container.
  const publishRes = await axios.post(`${THREADS_API_BASE}/${threadsUserId}/threads_publish`, null, {
    params: { creation_id: containerId, access_token: accessToken },
    timeout: 20000,
  });
  const mediaId: string | undefined = publishRes.data?.id;
  if (!mediaId) {
    throw new Error('[threads] threads_publish returned no id');
  }

  // Best-effort permalink fetch (non-fatal — display sugar, matches x.ts pattern).
  let permalink: string | null = null;
  try {
    const media = await axios.get(`${THREADS_API_BASE}/${mediaId}`, {
      params: { fields: 'permalink', access_token: accessToken },
      timeout: 15000,
    });
    permalink = media.data?.permalink ?? null;
  } catch {
    // non-fatal
  }

  return { remotePostId: mediaId, permalink };
}

export const threadsPublisher: PlatformPublisher = {
  platform: 'THREADS',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
  publish,
};
