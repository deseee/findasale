/**
 * pinterest.ts — Pinterest platform module. ADR-105 scope (roadmap #625, Phase 3).
 *
 * Auth: standard OAuth 2.0 Authorization Code (api.pinterest.com/v5), confidential
 * client via HTTP Basic auth at the token endpoint (same shape as x.ts's
 * basicAuthHeader — no PKCE, not required by Pinterest's documented v5 flow).
 * Client credentials come from PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET
 * (Railway backend env vars, set 2026-08-15 alongside app registration — App id
 * 1601330, "FindA.Sale Marketplace", Trial access).
 *
 * Pins REQUIRE an image (media_source) and a target board_id — there is no
 * text-only post type, matching Instagram's constraint (see instagram.ts).
 * SocialAccount has no dedicated boardId column, so this module follows the same
 * field-reuse pattern already established by facebookPage.ts (which stores the
 * Facebook Page id, not literally a "user" id, in platformUserId): the connecting
 * account's PRIMARY board id is resolved once at connect time (first existing
 * board, or a newly-created "FindA.Sale Marketplace" board if none exist) and
 * stored in platformUserId. publish() uses it directly as the pin's board_id.
 * platformUsername stores the real Pinterest username.
 *
 * Token lifecycle: access tokens last ~30 days, refresh tokens ~1 year. Pinterest
 * does not rotate the refresh token by default — refresh() keeps the existing one
 * unless Pinterest explicitly returns a new one in the response.
 *
 * Real credentials exist (Railway backend service, set 2026-08-15) but NO live
 * OAuth flow or live pin has been run in this dispatch — code-only, per dispatch
 * constraint. A later session verifies live OAuth + a real pin via Chrome QA.
 */

import axios from 'axios';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { PlatformPublisher, OAuthStart, PublishResult } from './types';
import type { RefreshedTokens } from '../tokenStore';

const PINTEREST_OAUTH_AUTHORIZE = 'https://www.pinterest.com/oauth/';
const PINTEREST_OAUTH_TOKEN = 'https://api.pinterest.com/v5/oauth/token';
const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

// Minimum viable scope set: read boards, write pins, read basic profile for display.
const PINTEREST_SCOPES = ['boards:read', 'pins:write', 'user_accounts:read'];

const PINTEREST_MAX_TITLE_CHARS = 100;
const PINTEREST_MAX_DESCRIPTION_CHARS = 500;

const DEFAULT_BOARD_NAME = 'FindA.Sale Marketplace';

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      '[pinterest] PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET not configured. Set them on the Railway backend service.'
    );
  }
  return { clientId, clientSecret };
}

/** HTTP Basic header for the confidential-client token endpoint (Pinterest v5 spec). */
function basicAuthHeader(): string {
  const { clientId, clientSecret } = getClientCreds();
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

function buildAuthorizeUrl(params: { redirectUri: string; state: string }): OAuthStart {
  const { clientId } = getClientCreds();
  const url = new URL(PINTEREST_OAUTH_AUTHORIZE);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', PINTEREST_SCOPES.join(','));
  url.searchParams.set('state', params.state);
  // No PKCE — not required by Pinterest v5's documented confidential-client flow.
  return { authorizeUrl: url.toString(), state: params.state };
}

/** Resolve (or create) the account's primary board — see header comment. */
async function resolvePrimaryBoardId(accessToken: string): Promise<string> {
  const listRes = await axios.get(`${PINTEREST_API_BASE}/boards`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { page_size: 1 },
    timeout: 15000,
  });
  const existing: string | undefined = listRes.data?.items?.[0]?.id;
  if (existing) return existing;

  // No boards yet — create a default one so publish() always has a target.
  const createRes = await axios.post(
    `${PINTEREST_API_BASE}/boards`,
    { name: DEFAULT_BOARD_NAME, description: 'Items from FindA.Sale organizer sales.' },
    {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );
  const createdId: string | undefined = createRes.data?.id;
  if (!createdId) {
    throw new Error('[pinterest] failed to resolve or create a board for this account');
  }
  return createdId;
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
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  const tokenRes = await axios.post(PINTEREST_OAUTH_TOKEN, body.toString(), {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15000,
  });

  const accessToken: string | undefined = tokenRes.data?.access_token;
  const refreshToken: string | null = tokenRes.data?.refresh_token ?? null;
  const expiresInSeconds: number | null = tokenRes.data?.expires_in ?? null;
  if (!accessToken) {
    throw new Error('[pinterest] token exchange did not return an access_token');
  }

  // Best-effort identity fetch (non-fatal — display sugar, matches x.ts's pattern).
  let platformUsername: string | null = null;
  try {
    const me = await axios.get(`${PINTEREST_API_BASE}/user_account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    });
    platformUsername = me.data?.username ?? null;
  } catch {
    // non-fatal — identity is display sugar
  }

  // Board resolution IS required for publish() to ever work — attempt it here so a
  // freshly-connected account is immediately postable, but don't fail the whole
  // connect if it errors (surfaced instead as a clear publish()-time error below).
  let platformUserId: string | null = null;
  try {
    platformUserId = await resolvePrimaryBoardId(accessToken);
  } catch (err) {
    console.error(
      '[pinterest] board resolution failed at connect time — publish() will fail until reconnected:',
      err instanceof Error ? err.message : err
    );
  }

  return { accessToken, refreshToken, expiresInSeconds, platformUserId, platformUsername };
}

const refresh = async (
  _account: SocialAccount,
  plaintextRefreshToken: string | null
): Promise<RefreshedTokens> => {
  if (!plaintextRefreshToken) {
    throw new Error('[pinterest] no refresh token available — account must be reconnected');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: plaintextRefreshToken,
  });

  const res = await axios.post(PINTEREST_OAUTH_TOKEN, body.toString(), {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15000,
  });

  const accessToken: string | undefined = res.data?.access_token;
  if (!accessToken) {
    throw new Error('[pinterest] refresh did not return an access_token');
  }
  return {
    accessToken,
    // Pinterest does not rotate the refresh token by default — keep the existing
    // one unless a new one is explicitly returned.
    refreshToken: res.data?.refresh_token ?? plaintextRefreshToken,
    expiresInSeconds: res.data?.expires_in ?? null,
  };
};

/**
 * Create a Pin (Pinterest has no text-only post type, same constraint as
 * instagram.ts — media is required). Uses the board id resolved at connect time
 * (account.platformUserId — see header comment for why this field is repurposed).
 */
async function publish(params: {
  post: SocialPost;
  account: SocialAccount;
  accessToken: string;
}): Promise<PublishResult> {
  const { post, account, accessToken } = params;

  const boardId = account.platformUserId;
  if (!boardId) {
    throw new Error('[pinterest] account.platformUserId (board id) missing -- reconnect required');
  }

  const imageUrl = post.mediaUrls?.[0];
  if (!imageUrl) {
    throw new Error(
      '[pinterest] refusing to publish -- Pinterest has no text-only post type; post.mediaUrls must include at least one image URL'
    );
  }

  let description = post.body ?? '';
  if (description.length > PINTEREST_MAX_DESCRIPTION_CHARS) {
    description = description.slice(0, PINTEREST_MAX_DESCRIPTION_CHARS);
  }
  let title = description.split('\n')[0] ?? '';
  if (title.length > PINTEREST_MAX_TITLE_CHARS) {
    title = title.slice(0, PINTEREST_MAX_TITLE_CHARS);
  }
  if (!title.trim()) {
    throw new Error('[pinterest] refusing to publish an empty pin');
  }

  const body: Record<string, unknown> = {
    board_id: boardId,
    title,
    description,
    media_source: { source_type: 'image_url', url: imageUrl },
  };
  if (post.linkUrl) {
    body.link = post.linkUrl;
  }

  const res = await axios.post(`${PINTEREST_API_BASE}/pins`, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 20000,
  });

  const pinId: string | undefined = res.data?.id;
  if (!pinId) {
    throw new Error('[pinterest] pin creation returned no id');
  }

  const permalink = `https://www.pinterest.com/pin/${pinId}/`;
  return { remotePostId: pinId, permalink };
}

export const pinterestPublisher: PlatformPublisher = {
  platform: 'PINTEREST',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
  publish,
};
