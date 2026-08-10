/**
 * tiktok.ts — TikTok Content Posting API platform module. Implements PlatformPublisher.
 *
 * WIRED 2026-08-10 (Patrick-directed, "dispatch the fixes now... figure out how to
 * start wiring tik tok up"). Same drop-in shape as x.ts / youtube.ts (ADR-077 §3) --
 * no engine changes, just implement PlatformPublisher and register in index.ts.
 *
 * REAL, IMPORTANT CONSTRAINT (verified live against developers.tiktok.com this
 * session, not assumed): until Patrick's TikTok API client passes TikTok's audit,
 * EVERY post this module creates is forced to SELF_ONLY (private) by TikTok itself,
 * regardless of what privacy_level this code requests. Unaudited clients are also
 * capped at 5 posting users per 24h. This is TikTok's restriction, not a limitation
 * of this code -- see https://developers.tiktok.com/doc/content-posting-api-get-started.
 * `TIKTOK_AUDITED_CLIENT` env var (default unset/false) gates the requested privacy
 * level below; flip it once TikTok's audit actually clears (see STATE.md).
 *
 * Auth: TikTok OAuth 2.0 Authorization Code + PKCE (S256), same shape as x.ts/
 * youtube.ts. Client credentials come from env vars TIKTOK_CLIENT_KEY /
 * TIKTOK_CLIENT_SECRET (NEVER hardcoded). Token endpoint confirmed live against
 * TikTok's own docs this session: https://open.tiktokapis.com/v2/oauth/token/
 * (same endpoint for both initial exchange and refresh, differentiated by
 * grant_type). Access tokens expire in 24h; refresh tokens last 365 days and may
 * rotate on refresh -- always persist whatever refresh_token comes back, even if
 * it looks unchanged.
 *
 * NOT independently verified this session (flagging honestly, matching the
 * convention in youtube.ts's own header comment): the exact authorize-URL param
 * names below (client_key/scope/response_type/redirect_uri/state/code_challenge/
 * code_challenge_method) match TikTok's standard, well-documented OAuth pattern,
 * but the specific Login Kit Web page was not fetched live this session -- verify
 * against https://developers.tiktok.com/doc/login-kit-web before the first real
 * OAuth attempt. The Direct Post video.publish flow (init -> PUT bytes -> poll
 * status) at the bottom of this file WAS verified live against TikTok's Content
 * Posting API docs this session, including the exact request/response shapes.
 *
 * Publishing: Direct Post, FILE_UPLOAD source (chunked upload, mirrors youtube.ts's
 * two-step resumable-upload shape). Single-chunk for now (these are 30-45s clips,
 * well under typical size limits) -- if a future clip is large enough to need real
 * multi-chunk splitting, verify TikTok's exact per-chunk size limits against the
 * Media Transfer Guide before assuming this single-chunk path still works:
 * https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
 *
 * SECURITY (ADR-077 / ADR-077a — identical to x.ts/youtube.ts):
 *  - Tokens flow ONLY as plaintext in/out of this module; encryption lives in
 *    tokenStore.ts. This module never touches encrypted columns, never persists.
 *  - No token is ever logged, returned, or thrown in raw form.
 *  - PKCE (S256) + opaque `state` protect the OAuth flow against CSRF.
 *
 * Real credentials are NOT wired in this dispatch — the TikTok Developer app does
 * not exist yet (Patrick must create it; account creation is outside this agent's
 * scope). This builds the code path; a later session verifies live OAuth + a real
 * (SELF_ONLY, pre-audit) post once the app exists. (Same dispatch constraint
 * youtube.ts documents for its own history.)
 */

import crypto from 'crypto';
import axios from 'axios';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { PlatformPublisher, OAuthStart, PublishResult } from './types';
import type { RefreshedTokens } from '../tokenStore';

const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_CREATOR_INFO_URL = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';
const TIKTOK_VIDEO_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const TIKTOK_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

// video.publish = Direct Post; least privilege for this pipeline's job.
const TIKTOK_SCOPES = ['video.publish'];

// Poll the async publish status this many times, 2s apart, before giving up and
// returning the publish_id anyway (TikTok processes asynchronously -- a pending
// status at return time is not itself a failure).
const STATUS_POLL_ATTEMPTS = 5;
const STATUS_POLL_INTERVAL_MS = 2000;

function getClientCreds(): { clientKey: string; clientSecret: string } {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error('[tiktok] TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not set');
  }
  return { clientKey, clientSecret };
}

/** PKCE S256 code_verifier/code_challenge pair, same helper shape as x.ts. */
function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

function buildAuthorizeUrl(params: { redirectUri: string; state: string }): OAuthStart {
  const { clientKey } = getClientCreds();
  const { codeVerifier, codeChallenge } = generatePkce();
  const qs = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPES.join(','),
    response_type: 'code',
    redirect_uri: params.redirectUri,
    state: params.state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return {
    authorizeUrl: `${TIKTOK_AUTHORIZE_URL}?${qs.toString()}`,
    state: params.state,
    codeVerifier,
  };
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
  const { clientKey, clientSecret } = getClientCreds();
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code: params.code,
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri,
  });
  if (params.codeVerifier) body.set('code_verifier', params.codeVerifier);

  const resp = await axios.post(TIKTOK_TOKEN_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const data = resp.data;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresInSeconds: data.expires_in ?? null,
    platformUserId: data.open_id ?? null,
    // TikTok's token response doesn't include a display username -- creator_info
    // query (used at publish time) is the source for that; leave null here rather
    // than guess.
    platformUsername: null,
  };
}

async function refresh(
  _account: SocialAccount,
  plaintextRefreshToken: string | null
): Promise<RefreshedTokens> {
  if (!plaintextRefreshToken) {
    throw new Error('[tiktok] refresh() called with no refresh token stored');
  }
  const { clientKey, clientSecret } = getClientCreds();
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: plaintextRefreshToken,
  });
  const resp = await axios.post(TIKTOK_TOKEN_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const data = resp.data;
  return {
    accessToken: data.access_token,
    // TikTok may rotate the refresh token on refresh -- always use whatever comes
    // back, per TikTok's own docs ("must use the newly-returned token if the value
    // is different than the previous one").
    refreshToken: data.refresh_token ?? null,
    expiresInSeconds: data.expires_in ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publish(params: {
  post: SocialPost;
  account: SocialAccount;
  accessToken: string;
}): Promise<PublishResult> {
  const { post, accessToken } = params;
  const videoUrl = post.mediaUrls?.[0];
  if (!videoUrl) {
    throw new Error('[tiktok] publish() called with no mediaUrls[0] (video URL) on the post');
  }

  // Query creator info first -- required by TikTok before a direct post (also
  // surfaces the real privacy_level_options for this creator/account).
  await axios.post(
    TIKTOK_CREATOR_INFO_URL,
    {},
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' } }
  );

  // Download the rendered clip so we know its real byte size for the FILE_UPLOAD
  // init call (same reason youtube.ts downloads before its resumable upload).
  const videoResp = await axios.get<ArrayBuffer>(videoUrl, { responseType: 'arraybuffer' });
  const videoBuffer = Buffer.from(videoResp.data);
  const videoSize = videoBuffer.length;

  // Forced SELF_ONLY until TIKTOK_AUDITED_CLIENT is explicitly set true post-audit
  // -- see file header. Even if this requests something else, TikTok itself will
  // still force SELF_ONLY on an unaudited client; this just keeps our own request
  // honest about what will actually happen.
  const privacyLevel = process.env.TIKTOK_AUDITED_CLIENT === 'true' ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY';

  const initResp = await axios.post(
    TIKTOK_VIDEO_INIT_URL,
    {
      post_info: {
        title: post.body?.slice(0, 150) || 'FindA.Sale',
        privacy_level: privacyLevel,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' } }
  );

  const { publish_id: publishId, upload_url: uploadUrl } = initResp.data.data;
  if (!uploadUrl) {
    throw new Error('[tiktok] video/init response had no upload_url');
  }

  await axios.put(uploadUrl, videoBuffer, {
    headers: {
      'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
      'Content-Type': 'video/mp4',
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  // Best-effort status poll -- TikTok processes asynchronously. A still-pending
  // status here is not a failure; we return the publish_id either way so the
  // engine has an idempotency anchor and a human can check status later if needed.
  for (let i = 0; i < STATUS_POLL_ATTEMPTS; i++) {
    await sleep(STATUS_POLL_INTERVAL_MS);
    try {
      const statusResp = await axios.post(
        TIKTOK_STATUS_URL,
        { publish_id: publishId },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' } }
      );
      const status = statusResp.data?.data?.status;
      if (status === 'PUBLISH_COMPLETE') break;
      if (status === 'FAILED') {
        console.warn(`[tiktok] publish_id ${publishId} reported FAILED status`);
        break;
      }
    } catch (err: any) {
      console.warn('[tiktok] status poll failed (non-fatal):', err?.message ?? err);
      break;
    }
  }

  return { remotePostId: publishId, permalink: null };
}

export const tiktokPublisher: PlatformPublisher = {
  platform: 'TIKTOK',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
  publish,
};
