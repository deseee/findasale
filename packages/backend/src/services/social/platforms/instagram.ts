/**
 * instagram.ts — Instagram platform module. ADR-105 scope (roadmap #625).
 *
 * Auth: "Instagram API with Instagram Login" / Business Login for Instagram --
 * Meta's direct-login product (launched July 2024) that authenticates against the
 * connected account's OWN Instagram professional (Business/Creator) account, with
 * NO Facebook Page in the loop. Uses INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET, a
 * Meta app id/secret pair DISTINCT from FACEBOOK_APP_ID (same "one app id per
 * use case" pattern as threads.ts's THREADS_APP_ID).
 *
 * ASSUMPTION FLAGGED (per dispatch instructions): the two candidate integration
 * paths are (a) this direct api.instagram.com/graph.instagram.com Instagram-Login
 * flow, or (b) the older Facebook-Page-linked Instagram Graph API
 * (www.facebook.com/dialog/oauth + graph.facebook.com/{page-id}?fields=
 * instagram_business_account). This module implements (a) — the credential shape
 * (a dedicated INSTAGRAM_APP_ID separate from FACEBOOK_APP_ID, matching Meta's
 * "Instagram" use-case app id, not the Facebook Login app id) matches the newer
 * product. developers.facebook.com's own docs pages for this exact flow returned
 * empty content via automated fetch during this dispatch (JS-rendered SPA); this
 * decision is corroborated instead via Meta's public "Instagram Platform API"
 * integration guide (scopes instagram_business_basic / instagram_business_content_
 * publish, api.instagram.com/oauth/authorize, graph.instagram.com host for all
 * calls after auth) rather than the primary docs page directly. If FindA.Sale's
 * Instagram account turns out to be reachable ONLY via a linked Facebook Page (not
 * itself convertible to a standalone professional-account login), this module will
 * need to be re-pointed at the Page-linked flow instead -- flag this for the first
 * live-connect attempt to confirm which path actually works.
 *
 * DEVIATION FROM THE ACCESS/REFRESH SPLIT (x.ts): identical pattern to threads.ts
 * -- Instagram has no distinct OAuth refresh_token grant, only a "refresh this
 * long-lived access token in place" call. A copy of the current long-lived access
 * token is carried in the refreshToken slot so refresh() can use it without this
 * module ever touching the encrypted accessToken column (tokenStore.ts's sole
 * responsibility). See threads.ts's refresh() comment for the full rationale.
 *
 * Publishing: Instagram has NO text-only post type (unlike X/Bluesky/Threads) --
 * every post requires image_url or video_url. publish() throws a clear, actionable
 * error if the SocialPost has no mediaUrls, rather than silently posting nothing.
 *
 * Real credentials exist (Railway backend service + packages/backend/.env,
 * confirmed present 2026-08-15) but NO live OAuth flow or live post has been run
 * in this dispatch — code-only, per dispatch constraint (roadmap #625).
 */

import axios from 'axios';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { PlatformPublisher, OAuthStart, PublishResult } from './types';
import type { RefreshedTokens } from '../tokenStore';

const IG_OAUTH_AUTHORIZE = 'https://api.instagram.com/oauth/authorize';
const IG_OAUTH_TOKEN = 'https://api.instagram.com/oauth/access_token';
const IG_LONG_LIVED_EXCHANGE = 'https://graph.instagram.com/access_token';
const IG_REFRESH = 'https://graph.instagram.com/refresh_access_token';
const IG_API_BASE = 'https://graph.instagram.com';

const IG_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

const IG_MAX_CAPTION_CHARS = 2200;

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.INSTAGRAM_APP_ID;
  const clientSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      '[instagram] INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET not configured. Set them on the Railway backend service.'
    );
  }
  return { clientId, clientSecret };
}

function buildAuthorizeUrl(params: { redirectUri: string; state: string }): OAuthStart {
  const { clientId } = getClientCreds();
  const url = new URL(IG_OAUTH_AUTHORIZE);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', IG_SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', params.state);
  // No PKCE — not part of Instagram's documented direct-login flow.
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

  // Step 1: code -> short-lived token (1h).
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri,
    code: params.code,
  });
  const shortRes = await axios.post(IG_OAUTH_TOKEN, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  const shortLivedToken: string | undefined = shortRes.data?.access_token;
  const shortLivedUserId: string | null = shortRes.data?.user_id != null ? String(shortRes.data.user_id) : null;
  if (!shortLivedToken) {
    throw new Error('[instagram] authorization code exchange did not return an access_token');
  }

  // Step 2: short-lived -> long-lived (60 days), same pattern as threads.ts.
  const longRes = await axios.get(IG_LONG_LIVED_EXCHANGE, {
    params: { grant_type: 'ig_exchange_token', client_secret: clientSecret, access_token: shortLivedToken },
    timeout: 15000,
  });
  const accessToken: string | undefined = longRes.data?.access_token;
  const expiresInSeconds: number | null = longRes.data?.expires_in ?? null;
  if (!accessToken) {
    throw new Error('[instagram] long-lived token exchange did not return an access_token');
  }

  // Best-effort identity fetch for admin display (non-fatal).
  let platformUserId: string | null = shortLivedUserId;
  let platformUsername: string | null = null;
  try {
    const me = await axios.get(`${IG_API_BASE}/me`, {
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
  // Same "refresh the access token itself" model as threads.ts — see that file's
  // refresh() comment for why plaintextRefreshToken here is really a duplicated
  // copy of the current long-lived access token, not a separate refresh token.
  if (!plaintextRefreshToken) {
    throw new Error('[instagram] no stored access-token copy to refresh -- account must be reconnected');
  }
  const res = await axios.get(IG_REFRESH, {
    params: { grant_type: 'ig_refresh_token', access_token: plaintextRefreshToken },
    timeout: 15000,
  });
  const accessToken: string | undefined = res.data?.access_token;
  const expiresInSeconds: number | null = res.data?.expires_in ?? null;
  if (!accessToken) {
    throw new Error('[instagram] refresh_access_token did not return an access_token');
  }
  return { accessToken, refreshToken: accessToken, expiresInSeconds };
};

/**
 * Publish a single image post (Instagram has no text-only post type, so this is
 * NOT Phase-1a-text-only like X/Bluesky/Threads — media is required). Two-step
 * container model per Instagram Graph API convention.
 */
async function publish(params: {
  post: SocialPost;
  account: SocialAccount;
  accessToken: string;
}): Promise<PublishResult> {
  const { post, account, accessToken } = params;

  const igUserId = account.platformUserId;
  if (!igUserId) {
    throw new Error('[instagram] account.platformUserId missing -- reconnect required');
  }

  const imageUrl = post.mediaUrls?.[0];
  if (!imageUrl) {
    throw new Error(
      '[instagram] refusing to publish -- Instagram has no text-only post type; post.mediaUrls must include at least one image URL'
    );
  }

  let caption = post.body ?? '';
  if (post.linkUrl && !caption.includes(post.linkUrl)) {
    caption = `${caption}\n${post.linkUrl}`;
  }
  if (caption.length > IG_MAX_CAPTION_CHARS) {
    caption = caption.slice(0, IG_MAX_CAPTION_CHARS);
  }

  // Step 1: create the media container.
  const createRes = await axios.post(`${IG_API_BASE}/${igUserId}/media`, null, {
    params: { image_url: imageUrl, caption, access_token: accessToken },
    timeout: 20000,
  });
  const containerId: string | undefined = createRes.data?.id;
  if (!containerId) {
    throw new Error('[instagram] media container creation returned no id');
  }

  // Unlike Threads, Instagram's docs don't state a fixed recommended wait for a
  // single image; a short delay avoids racing Meta's async processing.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Step 2: publish the container.
  const publishRes = await axios.post(`${IG_API_BASE}/${igUserId}/media_publish`, null, {
    params: { creation_id: containerId, access_token: accessToken },
    timeout: 20000,
  });
  const mediaId: string | undefined = publishRes.data?.id;
  if (!mediaId) {
    throw new Error('[instagram] media_publish returned no id');
  }

  // Best-effort permalink fetch (non-fatal — display sugar).
  let permalink: string | null = null;
  try {
    const media = await axios.get(`${IG_API_BASE}/${mediaId}`, {
      params: { fields: 'permalink', access_token: accessToken },
      timeout: 15000,
    });
    permalink = media.data?.permalink ?? null;
  } catch {
    // non-fatal
  }

  return { remotePostId: mediaId, permalink };
}

export const instagramPublisher: PlatformPublisher = {
  platform: 'INSTAGRAM',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
  publish,
};
