/**
 * youtube.ts — YouTube Shorts platform module (Phase 1b). Implements PlatformPublisher.
 *
 * Auth: Google OAuth 2.0 Authorization Code with PKCE (S256), scope
 * `https://www.googleapis.com/auth/youtube.upload` (upload-only — least privilege).
 * Client credentials come from env vars YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET
 * (NEVER hardcoded; a SEPARATE Google OAuth client from the Gmail app — do NOT reuse
 * GMAIL_CLIENT_ID/SECRET). Read with the bare process.env pattern used across the
 * backend (x.ts, ebayHttp.ts, gmailHealthCron.ts).
 *
 * Publishing uses the YouTube Data API v3 RESUMABLE upload protocol (two-step):
 *   1. POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status with the
 *      snippet (title/description from post.body) + status (privacyStatus=public) as JSON
 *      metadata. Google returns a one-time session URL in the `Location` response header.
 *   2. PUT the raw video bytes (fetched from post.mediaUrls[0]) to that session URL.
 *      Google returns the created resource whose `id` is the videoId → remotePostId.
 *
 * Short designation: YouTube auto-classifies a vertical video <= 3 min as a Short; the
 * `#Shorts` convention in the title/description is the documented reinforcement. We append
 * `#Shorts` to the description (never silently overwriting organizer-authored body text)
 * and rely on the vertical source video for the Short treatment.
 *
 * Google OAuth token refresh mirrors the Gmail refresh-token approach (both are Google
 * OAuth): grant_type=refresh_token against oauth2.googleapis.com/token. Google returns a
 * NEW access_token but does NOT rotate the refresh_token, so we retain the existing one.
 *
 * SECURITY (ADR-077 / ADR-077a — identical to x.ts):
 *  - Tokens flow ONLY as plaintext in/out of this module; encryption lives in tokenStore.
 *    This module never touches the encrypted columns and never persists anything itself.
 *  - No token is ever logged, returned, or thrown in a raw form; token-shaped error bodies
 *    are surfaced through tokenStore.scrubTokens upstream (getValidToken / the engine).
 *  - PKCE (S256) + opaque `state` protect the OAuth flow against CSRF, exactly like x.ts.
 *
 * Real credentials / real uploads are NOT wired in this dispatch — the YouTube OAuth app
 * and brand channel do not exist yet. This builds the code path; a later session verifies
 * live OAuth + a real Short upload after Patrick creates the account. (Dispatch constraint.)
 */

import crypto from 'crypto';
import axios from 'axios';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { PlatformPublisher, OAuthStart, PublishResult } from './types';
import type { RefreshedTokens } from '../tokenStore';

// Google OAuth 2.0 endpoints (shared across all Google APIs, incl. Gmail).
const GOOGLE_OAUTH_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';

// YouTube Data API v3.
const YT_RESUMABLE_UPLOAD =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const YT_CHANNELS_ENDPOINT =
  'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';

// Upload-only scope (least privilege — cannot read/delete other videos).
const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];

// YouTube snippet limits: title <= 100 chars, description <= 5000 chars.
const YT_TITLE_MAX = 100;
const YT_DESCRIPTION_MAX = 5000;
const SHORTS_TAG = '#Shorts';

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      '[youtube] YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET not configured. Set them on the Railway backend service (a SEPARATE Google OAuth client from the Gmail app).'
    );
  }
  return { clientId, clientSecret };
}

/** PKCE: base64url(SHA256(verifier)). */
function pkceChallengeFromVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/** Generate a PKCE code_verifier (43-128 chars, URL-safe). */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(48).toString('base64url'); // 64 url-safe chars
}

/**
 * Derive a Short title + description from the single `body` field (no separate title
 * column exists — ADR-077 schema reuse). First non-empty line (trimmed to 100 chars)
 * becomes the title; the full body becomes the description. `#Shorts` is appended to the
 * description if the organizer did not already include it.
 */
function deriveTitleAndDescription(body: string): { title: string; description: string } {
  const text = (body ?? '').trim();
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() || text;

  let title = firstLine.slice(0, YT_TITLE_MAX).trim();
  if (!title) title = 'FindA.Sale'; // never send an empty title

  let description = text;
  if (!/#shorts\b/i.test(description)) {
    const withTag = description ? `${description}\n\n${SHORTS_TAG}` : SHORTS_TAG;
    description = withTag;
  }
  if (description.length > YT_DESCRIPTION_MAX) {
    description = description.slice(0, YT_DESCRIPTION_MAX);
  }
  return { title, description };
}

function buildAuthorizeUrl(params: { redirectUri: string; state: string }): OAuthStart {
  const { clientId } = getClientCreds();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = pkceChallengeFromVerifier(codeVerifier);

  const url = new URL(GOOGLE_OAUTH_AUTHORIZE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', YOUTUBE_SCOPES.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Force a refresh_token on first consent — Google only returns one with these.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

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
  const { clientId, clientSecret } = getClientCreds();
  if (!params.codeVerifier) {
    throw new Error('[youtube] exchangeCode requires the PKCE code_verifier from the connect step');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: params.codeVerifier,
  });

  const tokenRes = await axios.post(GOOGLE_OAUTH_TOKEN, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  const accessToken: string = tokenRes.data?.access_token;
  const refreshToken: string | null = tokenRes.data?.refresh_token ?? null;
  const expiresInSeconds: number | null = tokenRes.data?.expires_in ?? null;
  if (!accessToken) {
    throw new Error('[youtube] token exchange did not return an access_token');
  }

  // Fetch channel identity for admin display (best-effort; failure is non-fatal).
  let platformUserId: string | null = null;
  let platformUsername: string | null = null;
  try {
    const ch = await axios.get(YT_CHANNELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    });
    const item = ch.data?.items?.[0];
    platformUserId = item?.id ?? null;
    platformUsername = item?.snippet?.title ?? null;
  } catch {
    // non-fatal — identity is display sugar
  }

  return { accessToken, refreshToken, expiresInSeconds, platformUserId, platformUsername };
}

const refresh = async (
  _account: SocialAccount,
  plaintextRefreshToken: string | null
): Promise<RefreshedTokens> => {
  const { clientId, clientSecret } = getClientCreds();
  if (!plaintextRefreshToken) {
    throw new Error('[youtube] no refresh token available — account must be reconnected');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: plaintextRefreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await axios.post(GOOGLE_OAUTH_TOKEN, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  const accessToken: string = res.data?.access_token;
  if (!accessToken) {
    throw new Error('[youtube] refresh did not return an access_token');
  }
  return {
    accessToken,
    // Google does NOT rotate the refresh token on refresh — retain the existing one.
    refreshToken: res.data?.refresh_token ?? plaintextRefreshToken,
    expiresInSeconds: res.data?.expires_in ?? null,
  };
};

/**
 * Publish a YouTube Short via the Data API v3 resumable-upload protocol.
 *
 * Step 1: initiate a resumable session with the snippet/status metadata as JSON. Google
 *         returns a one-time upload session URL in the `Location` response header.
 * Step 2: fetch the source video from post.mediaUrls[0] and PUT the bytes to that session
 *         URL. Google returns the created video resource; its `id` is the videoId.
 */
async function publish(params: {
  post: SocialPost;
  account: SocialAccount;
  accessToken: string;
}): Promise<PublishResult> {
  const { post, accessToken } = params;

  const videoUrl = Array.isArray(post.mediaUrls) ? post.mediaUrls[0] : undefined;
  if (!videoUrl || typeof videoUrl !== 'string') {
    throw new Error('[youtube] no video URL in mediaUrls[0] — a Short requires a source video');
  }

  const { title, description } = deriveTitleAndDescription(post.body ?? '');

  // Step 1 — initiate the resumable session (metadata only).
  const metadata = {
    snippet: {
      title,
      description,
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await axios.post(YT_RESUMABLE_UPLOAD, metadata, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      // Advisory hint to Google's resumable endpoint about the eventual payload type.
      'X-Upload-Content-Type': 'video/*',
    },
    timeout: 30000,
    // 2xx only; a non-2xx here means the session was not created.
    validateStatus: (s) => s >= 200 && s < 300,
  });

  const sessionUrl: string | undefined =
    initRes.headers?.location || initRes.headers?.Location;
  if (!sessionUrl) {
    throw new Error('[youtube] resumable session initiation returned no upload Location header');
  }

  // Fetch the source video bytes (Cloudinary or other media URL) as a binary buffer.
  const videoResp = await axios.get<ArrayBuffer>(videoUrl, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: 512 * 1024 * 1024, // 512MB ceiling — Shorts are small
    maxBodyLength: 512 * 1024 * 1024,
  });
  const videoBytes = Buffer.from(videoResp.data);
  if (videoBytes.length === 0) {
    throw new Error('[youtube] fetched source video is empty (0 bytes)');
  }
  const contentType =
    (videoResp.headers?.['content-type'] as string | undefined) || 'video/*';

  // Step 2 — PUT the raw bytes to the one-time session URL. Single-request upload (the
  // resumable protocol also supports chunked continuation; a single PUT is valid for the
  // small vertical clips used for Shorts).
  const putRes = await axios.put(sessionUrl, videoBytes, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
      'Content-Length': String(videoBytes.length),
    },
    timeout: 300000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: (s) => s >= 200 && s < 300,
  });

  const videoId: string | undefined = putRes.data?.id;
  if (!videoId) {
    throw new Error('[youtube] resumable upload completed but returned no video id');
  }

  return {
    remotePostId: videoId,
    permalink: `https://www.youtube.com/shorts/${videoId}`,
  };
}

export const youtubePublisher: PlatformPublisher = {
  platform: 'YOUTUBE',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
  publish,
};
