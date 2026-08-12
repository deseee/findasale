/**
 * bluesky.ts — Bluesky (AT Protocol) platform module. ADR-105.
 *
 * DEVIATION FROM THE OAUTH-REDIRECT PATTERN (x.ts / youtube.ts / tiktok.ts):
 * Bluesky's simplest, officially-documented auth for this kind of use case is an
 * account "app password" (created at bsky.app/settings/app-passwords), exchanged
 * directly for a session via com.atproto.server.createSession -- there is no
 * provider-hosted OAuth consent screen involved, so buildAuthorizeUrl/exchangeCode
 * below are intentionally UNREACHABLE stubs that throw. The real connect path is
 * `loginWithAppPassword()`, called by the controller's dedicated
 * POST /api/social-publisher/connect-bluesky endpoint (handle + app password in the
 * request body, admin-gated same as every other route on this router) instead of the
 * shared /connect -> redirect -> /oauth/callback/:platform flow the other platforms use.
 *
 * Full AT Protocol OAuth (DPoP-bound tokens) exists and is the "purer" fit for the
 * PlatformPublisher interface, but is materially more moving parts for a single brand
 * account with no material benefit -- not used here (see ADR-105).
 *
 * Auth: com.atproto.server.createSession (login) / refreshSession (refresh) /
 * repo.createRecord (publish). Credentials are the account handle + app password,
 * entered once at connect time -- never stored; only the resulting accessJwt/
 * refreshJwt are persisted (via tokenStore, encrypted at rest same as every other
 * platform).
 */

import axios from 'axios';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { PlatformPublisher, OAuthStart, PublishResult } from './types';
import type { RefreshedTokens } from '../tokenStore';

const BSKY_SERVICE = 'https://bsky.social';
const BSKY_CREATE_SESSION = `${BSKY_SERVICE}/xrpc/com.atproto.server.createSession`;
const BSKY_REFRESH_SESSION = `${BSKY_SERVICE}/xrpc/com.atproto.server.refreshSession`;
const BSKY_CREATE_RECORD = `${BSKY_SERVICE}/xrpc/com.atproto.repo.createRecord`;

// Bluesky's own client-side post length limit is 300 graphemes. Defensive truncate,
// same pattern as X_MAX_TWEET_CHARS in x.ts.
const BSKY_MAX_POST_CHARS = 300;

function unreachable(name: string): never {
  throw new Error(
    `[bluesky] ${name} is not used for this platform -- Bluesky connects via ` +
      `loginWithAppPassword() (POST /api/social-publisher/connect-bluesky), not the ` +
      `OAuth-redirect flow. See ADR-105.`
  );
}

function buildAuthorizeUrl(_params: { redirectUri: string; state: string }): OAuthStart {
  unreachable('buildAuthorizeUrl');
}

async function exchangeCode(_params: {
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
  unreachable('exchangeCode');
}

/**
 * The REAL connect path for Bluesky. Called directly by the controller's
 * connectBluesky handler -- not part of the PlatformPublisher interface, since
 * Bluesky's connect flow isn't a redirect/callback round trip.
 *
 * Bluesky access sessions are short-lived (~2h, mirrors most AT Protocol PDS
 * defaults) -- expiresInSeconds is a conservative estimate since createSession
 * doesn't return an explicit TTL; tokenStore's 5-minute refresh skew means a stale
 * guess here just triggers an extra refresh call, never a failed publish.
 */
export async function loginWithAppPassword(params: {
  handle: string;
  appPassword: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  platformUserId: string;
  platformUsername: string;
}> {
  const res = await axios.post(
    BSKY_CREATE_SESSION,
    { identifier: params.handle, password: params.appPassword },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  const accessJwt: string | undefined = res.data?.accessJwt;
  const refreshJwt: string | undefined = res.data?.refreshJwt;
  const did: string | undefined = res.data?.did;
  const handle: string | undefined = res.data?.handle;

  if (!accessJwt || !refreshJwt || !did) {
    throw new Error('[bluesky] createSession did not return accessJwt/refreshJwt/did');
  }

  return {
    accessToken: accessJwt,
    refreshToken: refreshJwt,
    expiresInSeconds: 2 * 60 * 60, // conservative estimate -- see doc comment above
    platformUserId: did,
    platformUsername: handle ?? params.handle,
  };
}

const refresh = async (
  account: SocialAccount,
  plaintextRefreshToken: string | null
): Promise<RefreshedTokens> => {
  if (!plaintextRefreshToken) {
    throw new Error('[bluesky] no refresh token available -- account must be reconnected');
  }

  const res = await axios.post(
    BSKY_REFRESH_SESSION,
    {},
    {
      headers: { Authorization: `Bearer ${plaintextRefreshToken}` },
      timeout: 15000,
    }
  );

  const accessJwt: string | undefined = res.data?.accessJwt;
  const refreshJwt: string | undefined = res.data?.refreshJwt;
  if (!accessJwt) {
    throw new Error('[bluesky] refreshSession did not return an accessJwt');
  }

  return {
    accessToken: accessJwt,
    refreshToken: refreshJwt ?? plaintextRefreshToken,
    expiresInSeconds: 2 * 60 * 60,
  };
};

/**
 * Post a single record to the account's own repo (collection app.bsky.feed.post).
 * Text-only for v1, matching X's Phase 1a scope -- media (images) is a later phase,
 * same as every other platform module at launch.
 */
async function publish(params: {
  post: SocialPost;
  account: SocialAccount;
  accessToken: string;
}): Promise<PublishResult> {
  const { post, account, accessToken } = params;

  let text = post.body ?? '';
  if (post.linkUrl && !text.includes(post.linkUrl)) {
    text = `${text}\n${post.linkUrl}`;
  }
  if (text.length > BSKY_MAX_POST_CHARS) {
    text = text.slice(0, BSKY_MAX_POST_CHARS);
  }
  if (!text.trim()) {
    throw new Error('[bluesky] refusing to publish an empty post');
  }

  const did = account.platformUserId;
  if (!did) {
    throw new Error('[bluesky] account.platformUserId (DID) missing -- reconnect required');
  }

  const res = await axios.post(
    BSKY_CREATE_RECORD,
    {
      repo: did,
      collection: 'app.bsky.feed.post',
      record: {
        text,
        createdAt: new Date().toISOString(),
        $type: 'app.bsky.feed.post',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  const uri: string | undefined = res.data?.uri; // at://did/app.bsky.feed.post/<rkey>
  if (!uri) {
    throw new Error('[bluesky] createRecord returned no uri');
  }
  const rkey = uri.split('/').pop();
  const username = account.platformUsername;
  const permalink = username && rkey ? `https://bsky.app/profile/${username}/post/${rkey}` : null;

  return { remotePostId: uri, permalink };
}

export const blueskyPublisher: PlatformPublisher = {
  platform: 'BLUESKY',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
  publish,
};
