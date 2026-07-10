/**
 * x.ts — X (Twitter) platform module. Phase 1a: text-only publishing via X API v2.
 *
 * Auth: OAuth 2.0 Authorization Code with PKCE (user-context), the flow X requires
 * for posting as an account. Client credentials come from env vars X_CLIENT_ID /
 * X_CLIENT_SECRET (NEVER hardcoded), read with the bare process.env pattern used
 * across the backend (ebayHttp.ts, cloudAIService.ts).
 *
 * Direct HTTPS from Railway is fine here — only api.ebay.com is DNS-blocked on
 * Railway (ADR-077 §4); api.x.com / api.twitter.com resolve normally.
 *
 * Real credentials / real posting are NOT wired in this dispatch — the X app does
 * not exist yet. This builds the code path; a later session verifies live OAuth +
 * a real post after Patrick creates the account. (Dispatch constraint.)
 */

import crypto from 'crypto';
import axios from 'axios';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { PlatformPublisher, OAuthStart, PublishResult } from './types';
import type { RefreshedTokens } from '../tokenStore';

const X_OAUTH_AUTHORIZE = 'https://twitter.com/i/oauth2/authorize';
const X_OAUTH_TOKEN = 'https://api.twitter.com/2/oauth2/token';
const X_TWEETS_ENDPOINT = 'https://api.twitter.com/2/tweets';
const X_ME_ENDPOINT = 'https://api.twitter.com/2/users/me';

// Scopes needed to post + read own identity + keep a refresh token.
const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

const X_MAX_TWEET_CHARS = 280;

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      '[x] X_CLIENT_ID / X_CLIENT_SECRET not configured. Set them on the Railway backend service.'
    );
  }
  return { clientId, clientSecret };
}

/** HTTP Basic header for the confidential-client token endpoint. */
function basicAuthHeader(): string {
  const { clientId, clientSecret } = getClientCreds();
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

/** PKCE: base64url(SHA256(verifier)). */
function pkceChallengeFromVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/** Generate a PKCE code_verifier (43–128 chars, URL-safe). */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(48).toString('base64url'); // 64 url-safe chars
}

function buildAuthorizeUrl(params: { redirectUri: string; state: string }): OAuthStart {
  const { clientId } = getClientCreds();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = pkceChallengeFromVerifier(codeVerifier);

  const url = new URL(X_OAUTH_AUTHORIZE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', X_SCOPES.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return { authorizeUrl: url.toString(), state: params.state, codeVerifier };
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
  const { clientId } = getClientCreds();
  if (!params.codeVerifier) {
    throw new Error('[x] exchangeCode requires the PKCE code_verifier from the connect step');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: clientId,
    code_verifier: params.codeVerifier,
  });

  const tokenRes = await axios.post(X_OAUTH_TOKEN, body.toString(), {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15000,
  });

  const accessToken: string = tokenRes.data?.access_token;
  const refreshToken: string | null = tokenRes.data?.refresh_token ?? null;
  const expiresInSeconds: number | null = tokenRes.data?.expires_in ?? null;
  if (!accessToken) {
    throw new Error('[x] token exchange did not return an access_token');
  }

  // Fetch handle for admin display (best-effort; failure is non-fatal to the connect).
  let platformUserId: string | null = null;
  let platformUsername: string | null = null;
  try {
    const me = await axios.get(X_ME_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    });
    platformUserId = me.data?.data?.id ?? null;
    platformUsername = me.data?.data?.username ?? null;
  } catch {
    // non-fatal — identity is display sugar
  }

  return { accessToken, refreshToken, expiresInSeconds, platformUserId, platformUsername };
}

const refresh = async (
  account: SocialAccount,
  plaintextRefreshToken: string | null
): Promise<RefreshedTokens> => {
  const { clientId } = getClientCreds();
  if (!plaintextRefreshToken) {
    throw new Error('[x] no refresh token available — account must be reconnected');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: plaintextRefreshToken,
    client_id: clientId,
  });

  const res = await axios.post(X_OAUTH_TOKEN, body.toString(), {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15000,
  });

  const accessToken: string = res.data?.access_token;
  if (!accessToken) {
    throw new Error('[x] refresh did not return an access_token');
  }
  return {
    accessToken,
    // X rotates refresh tokens on use — persist the new one if returned.
    refreshToken: res.data?.refresh_token ?? plaintextRefreshToken,
    expiresInSeconds: res.data?.expires_in ?? null,
  };
};

/**
 * Post a text tweet (Phase 1a — text-only; media upload is a later phase).
 * Body is truncated defensively to X's char cap.
 */
async function publish(params: {
  post: SocialPost;
  account: SocialAccount;
  accessToken: string;
}): Promise<PublishResult> {
  const { post, accessToken } = params;

  let text = post.body ?? '';
  // Append link if present and it still fits (X counts a URL as ~23 chars via t.co,
  // but we keep it simple for v1 and just guard the raw length).
  if (post.linkUrl && !text.includes(post.linkUrl)) {
    const candidate = `${text}\n${post.linkUrl}`;
    text = candidate;
  }
  if (text.length > X_MAX_TWEET_CHARS) {
    text = text.slice(0, X_MAX_TWEET_CHARS);
  }
  if (!text.trim()) {
    throw new Error('[x] refusing to publish an empty tweet');
  }

  const res = await axios.post(
    X_TWEETS_ENDPOINT,
    { text },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  const tweetId: string | undefined = res.data?.data?.id;
  if (!tweetId) {
    throw new Error('[x] tweet POST returned no id');
  }

  const username = params.account.platformUsername;
  const permalink = username
    ? `https://twitter.com/${username}/status/${tweetId}`
    : `https://twitter.com/i/web/status/${tweetId}`;

  return { remotePostId: tweetId, permalink };
}

/**
 * One mention item returned by listRecentMentions(), shaped for xEngagementMonitor.ts
 * to draft a reply against and stage. X scopes (tweet.read, users.read) already
 * requested at connect time cover this read — no scope change needed, unlike YouTube's
 * comment-monitoring addition.
 */
export interface XMentionItem {
  tweetId: string;
  authorUsername: string | null;
  authorId: string | null;
  text: string;
  createdAt: string;
}

/** Resolve the connected account's own X user id, using the cached value from OAuth
 *  connect if present (platformUserId) rather than an extra API call. */
export async function getOwnUserId(params: {
  accessToken: string;
  account: SocialAccount;
}): Promise<string> {
  if (params.account.platformUserId) return params.account.platformUserId;

  const me = await axios.get(X_ME_ENDPOINT, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    timeout: 15000,
  });
  const id: string | undefined = me.data?.data?.id;
  if (!id) {
    throw new Error('[x] could not resolve own user id (account.platformUserId missing and /users/me returned none)');
  }
  return id;
}

/**
 * List mentions of the connected account since `sinceIso` (X API v2
 * GET /2/users/:id/mentions, start_time filter). Read-only — never posts anything.
 * Gated entirely by the caller (xEngagementMonitor.ts checks
 * X_ENGAGEMENT_MONITORING_ENABLED before this is ever reached) — this function itself
 * has no gate, matching how youtube.ts's listRecentChannelComments has no gate either;
 * the kill switch lives one layer up, at the monitor-job entry point.
 */
export async function listRecentMentions(params: {
  accessToken: string;
  userId: string;
  sinceIso?: string;
  maxResults?: number;
}): Promise<XMentionItem[]> {
  const { accessToken, userId, sinceIso, maxResults = 50 } = params;

  const query: Record<string, string | number> = {
    max_results: Math.min(Math.max(maxResults, 5), 100), // X requires 5-100
    'tweet.fields': 'created_at,author_id',
    expansions: 'author_id',
    'user.fields': 'username',
  };
  if (sinceIso) {
    query.start_time = sinceIso;
  }

  const res = await axios.get(`https://api.twitter.com/2/users/${userId}/mentions`, {
    params: query,
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 20000,
  });

  const tweets: any[] = res.data?.data ?? [];
  const users: any[] = res.data?.includes?.users ?? [];
  const usernameById = new Map<string, string>(users.map((u) => [u.id, u.username]));

  return tweets.map((t) => ({
    tweetId: t.id,
    authorUsername: t.author_id ? usernameById.get(t.author_id) ?? null : null,
    authorId: t.author_id ?? null,
    text: t.text ?? '',
    createdAt: t.created_at,
  }));
}

/**
 * Post a reply to an existing tweet (POST /2/tweets with reply.in_reply_to_tweet_id).
 * This is the ONLY function in this module that posts a reply-shaped tweet — called
 * exclusively by engagementReplyStaging.ts's postApprovedReplies(), only for entries a
 * human has hand-marked STATUS: APPROVED. Never called from the polling/drafting path.
 */
export async function postReplyTweet(params: {
  accessToken: string;
  inReplyToTweetId: string;
  text: string;
  account: SocialAccount;
}): Promise<PublishResult> {
  const { accessToken, inReplyToTweetId, account } = params;

  let text = params.text ?? '';
  if (text.length > X_MAX_TWEET_CHARS) {
    text = text.slice(0, X_MAX_TWEET_CHARS);
  }
  if (!text.trim()) {
    throw new Error('[x] refusing to post an empty reply');
  }

  const res = await axios.post(
    X_TWEETS_ENDPOINT,
    { text, reply: { in_reply_to_tweet_id: inReplyToTweetId } },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  const tweetId: string | undefined = res.data?.data?.id;
  if (!tweetId) {
    throw new Error('[x] reply POST returned no id');
  }

  const username = account.platformUsername;
  const permalink = username
    ? `https://twitter.com/${username}/status/${tweetId}`
    : `https://twitter.com/i/web/status/${tweetId}`;

  return { remotePostId: tweetId, permalink };
}

export const xPublisher: PlatformPublisher = {
  platform: 'X',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
  publish,
};
