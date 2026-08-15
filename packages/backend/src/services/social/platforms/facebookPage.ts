/**
 * facebookPage.ts — Facebook Page platform module. ADR-105 scope (roadmap #625).
 *
 * Auth: standard Facebook Login OAuth 2.0 (www.facebook.com/{v}/dialog/oauth),
 * using FACEBOOK_APP_ID / FACEBOOK_APP_SECRET. Publishing to a Page requires a
 * PAGE access token, not the connecting admin's personal user token, so
 * exchangeCode() performs the full chain in one pass:
 *   1. code -> short-lived USER token (graph.facebook.com/{v}/oauth/access_token)
 *   2. short-lived -> long-lived USER token (grant_type=fb_exchange_token, ~60 days)
 *   3. GET /me/accounts (with the long-lived user token) -> the FindA.Sale Page's
 *      own PAGE access token. Page tokens minted this way are effectively
 *      non-expiring as long as the underlying user token/permission stays valid
 *      -- Meta does not return an expires_in for them, which is why this module
 *      still tracks an expiry (inherited from the long-lived user token) so
 *      tokenStore's refresh-skew check has something to compare against.
 *
 * DEVIATION FROM THE ACCESS/REFRESH SPLIT (x.ts): the credential this module
 * actually publishes with (the PAGE token) has no refresh grant of its own, so
 * the REFRESH-TOKEN slot is repurposed to carry the long-lived USER token instead
 * -- refresh() re-runs the fb_exchange_token + /me/accounts chain to mint a fresh
 * Page token when tokenStore decides the stored one is stale. Same "refresh the
 * underlying credential, not a distinct token" family as threads.ts/instagram.ts,
 * just with an extra hop (the Page token is DERIVED FROM the user token, rather
 * than being refreshed directly).
 *
 * account.platformUserId stores the Facebook PAGE id (not the connecting admin's
 * personal user id) -- publish() uses it directly as the POST /{page-id}/feed (or
 * /{page-id}/photos, if an image is attached) target. This matches the field's
 * documented purpose ("channel id / page id / account id" — SocialAccount.
 * platformUserId in schema.prisma).
 *
 * FindA.Sale is expected to have exactly one Page behind this Meta app (brand
 * account, ADR-077's "one connected brand account per platform" invariant) -- if
 * /me/accounts ever returns more than one Page, the FIRST is used and this is NOT
 * validated against Patrick's intent; a later session should add a page-picker to
 * the admin UI if that assumption ever breaks.
 *
 * Real credentials exist (Railway backend service + packages/backend/.env,
 * confirmed present 2026-08-15) but NO live OAuth flow or live post has been run
 * in this dispatch — code-only, per dispatch constraint (roadmap #625).
 */

import axios from 'axios';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { PlatformPublisher, OAuthStart, PublishResult } from './types';
import type { RefreshedTokens } from '../tokenStore';

const FB_GRAPH_VERSION = 'v23.0';
const FB_OAUTH_AUTHORIZE = `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth`;
const FB_GRAPH_BASE = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;

// Minimum viable scope set for posting to a Page + reading back engagement,
// confirmed "Ready for testing" on the Meta app (dispatch note).
const FB_SCOPES = ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list', 'public_profile'];

// Conservative fallback for a long-lived user token's lifetime when Meta's
// fb_exchange_token response omits expires_in — matches bluesky.ts's
// "conservative estimate" pattern for a platform that doesn't hand back a TTL.
const FB_LONG_LIVED_FALLBACK_SECONDS = 60 * 24 * 60 * 60; // 60 days

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.FACEBOOK_APP_ID;
  const clientSecret = process.env.FACEBOOK_APP_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      '[facebookPage] FACEBOOK_APP_ID / FACEBOOK_APP_SECRET not configured. Set them on the Railway backend service.'
    );
  }
  return { clientId, clientSecret };
}

function buildAuthorizeUrl(params: { redirectUri: string; state: string }): OAuthStart {
  const { clientId } = getClientCreds();
  const url = new URL(FB_OAUTH_AUTHORIZE);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', FB_SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', params.state);
  // No PKCE — standard Facebook Login OAuth doesn't use it.
  return { authorizeUrl: url.toString(), state: params.state };
}

/** Exchange a short-lived user token for a long-lived one (fb_exchange_token). */
async function exchangeForLongLivedUserToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const { clientId, clientSecret } = getClientCreds();
  const res = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: shortLivedToken,
    },
    timeout: 15000,
  });
  const accessToken: string | undefined = res.data?.access_token;
  if (!accessToken) {
    throw new Error('[facebookPage] fb_exchange_token did not return an access_token');
  }
  return { accessToken, expiresInSeconds: res.data?.expires_in ?? FB_LONG_LIVED_FALLBACK_SECONDS };
}

/** Look up the FindA.Sale Page + its Page access token via a long-lived user token. */
async function fetchPageToken(
  longLivedUserToken: string
): Promise<{ pageId: string; pageName: string | null; pageAccessToken: string }> {
  const res = await axios.get(`${FB_GRAPH_BASE}/me/accounts`, {
    params: { access_token: longLivedUserToken },
    timeout: 15000,
  });
  const pages: Array<{ id?: string; name?: string; access_token?: string }> = res.data?.data ?? [];
  const page = pages[0];
  if (!page?.id || !page?.access_token) {
    throw new Error('[facebookPage] /me/accounts returned no connected Page -- grant Page access during connect');
  }
  return { pageId: page.id, pageName: page.name ?? null, pageAccessToken: page.access_token };
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

  // Step 1: code -> short-lived user token.
  const shortRes = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
    params: {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      code: params.code,
    },
    timeout: 15000,
  });
  const shortLivedToken: string | undefined = shortRes.data?.access_token;
  if (!shortLivedToken) {
    throw new Error('[facebookPage] authorization code exchange did not return an access_token');
  }

  // Step 2: short-lived -> long-lived user token.
  const { accessToken: longLivedUserToken, expiresInSeconds } = await exchangeForLongLivedUserToken(shortLivedToken);

  // Step 3: derive the Page access token — this is what publish() actually uses.
  const { pageId, pageName, pageAccessToken } = await fetchPageToken(longLivedUserToken);

  return {
    accessToken: pageAccessToken,
    refreshToken: longLivedUserToken, // repurposed slot — see header comment
    expiresInSeconds,
    platformUserId: pageId, // Page id, not the admin's personal FB user id
    platformUsername: pageName,
  };
}

const refresh = async (
  _account: SocialAccount,
  plaintextRefreshToken: string | null
): Promise<RefreshedTokens> => {
  if (!plaintextRefreshToken) {
    throw new Error('[facebookPage] no stored long-lived user token -- account must be reconnected');
  }
  // Re-extend the long-lived user token, then re-derive a fresh Page token from it.
  const { accessToken: refreshedUserToken, expiresInSeconds } = await exchangeForLongLivedUserToken(
    plaintextRefreshToken
  );
  const { pageAccessToken } = await fetchPageToken(refreshedUserToken);
  return {
    accessToken: pageAccessToken,
    refreshToken: refreshedUserToken,
    expiresInSeconds,
  };
};

/**
 * Post to the Page feed (text) or as a Page photo (image attached) — Facebook
 * supports text-only posts, unlike Instagram, so this matches X/Bluesky/Threads'
 * Phase 1a text-first scope while still handling the common image case.
 */
async function publish(params: {
  post: SocialPost;
  account: SocialAccount;
  accessToken: string;
}): Promise<PublishResult> {
  const { post, account, accessToken } = params;

  const pageId = account.platformUserId;
  if (!pageId) {
    throw new Error('[facebookPage] account.platformUserId (Page id) missing -- reconnect required');
  }

  let message = post.body ?? '';
  if (post.linkUrl && !message.includes(post.linkUrl)) {
    message = `${message}\n${post.linkUrl}`;
  }
  if (!message.trim()) {
    throw new Error('[facebookPage] refusing to publish an empty post');
  }

  const imageUrl = post.mediaUrls?.[0];
  const endpoint = imageUrl ? `${FB_GRAPH_BASE}/${pageId}/photos` : `${FB_GRAPH_BASE}/${pageId}/feed`;
  const body: Record<string, string> = imageUrl
    ? { url: imageUrl, caption: message, access_token: accessToken }
    : { message, access_token: accessToken };

  const res = await axios.post(endpoint, null, { params: body, timeout: 20000 });
  // /feed returns { id }; /photos returns { id, post_id } — post_id is the Page
  // feed post id when a photo is attached, so prefer it when present.
  const postId: string | undefined = res.data?.post_id ?? res.data?.id;
  if (!postId) {
    throw new Error('[facebookPage] publish call returned no post id');
  }

  const permalink = `https://www.facebook.com/${postId}`;
  return { remotePostId: postId, permalink };
}

export const facebookPagePublisher: PlatformPublisher = {
  platform: 'FACEBOOK_PAGE',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
  publish,
};
