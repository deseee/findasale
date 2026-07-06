/**
 * types.ts — the platform-layer contract for the social publisher.
 *
 * Each platform (X, YouTube, Meta, Pinterest) implements a PlatformPublisher.
 * The engine (socialPublisherService.ts) and the registry (index.ts) depend ONLY
 * on this interface, so adding a sibling platform is a drop-in: implement this
 * interface and register it. (ADR-077 §3)
 */

import type { SocialAccount, SocialPost, SocialPlatform } from '@prisma/client';
import type { PlatformRefreshFn } from '../tokenStore';

/** Result of publishing one post to one platform. */
export interface PublishResult {
  remotePostId: string; // platform's id for the created post (idempotency anchor)
  permalink?: string | null; // public URL, if the platform returns one
}

/** OAuth authorize-URL payload returned to the admin to start a connect flow. */
export interface OAuthStart {
  authorizeUrl: string;
  /** Opaque state the callback must echo back (CSRF). Stored server-side. */
  state: string;
  /** PKCE code_verifier the callback needs to complete the exchange (if applicable). */
  codeVerifier?: string;
}

/**
 * A platform leaf module. The engine calls `publish`; tokenStore calls `refresh`.
 * Platform modules receive/return PLAINTEXT tokens only — encryption lives in
 * tokenStore.ts and is invisible here.
 */
export interface PlatformPublisher {
  readonly platform: SocialPlatform;

  /**
   * Build the OAuth authorize URL (PKCE where the platform supports it).
   * `redirectUri` and `state` are provided by the controller.
   */
  buildAuthorizeUrl(params: { redirectUri: string; state: string }): OAuthStart;

  /**
   * Exchange an OAuth callback code for tokens. Returns PLAINTEXT tokens +
   * platform identity; the controller passes these to tokenStore.upsertAccount
   * (which encrypts). Never persists anything itself.
   */
  exchangeCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<{
    accessToken: string;
    refreshToken?: string | null;
    expiresInSeconds?: number | null;
    platformUserId?: string | null;
    platformUsername?: string | null;
  }>;

  /** Refresh an access token. Wired into tokenStore.getValidToken. */
  refresh: PlatformRefreshFn;

  /**
   * Publish a single post. `accessToken` is plaintext, already validated/refreshed
   * by tokenStore. `account` is provided for platform ids (page id, etc.).
   * Text-only is sufficient for Phase 1a (X). Media handling is per-platform.
   */
  publish(params: {
    post: SocialPost;
    account: SocialAccount;
    accessToken: string;
  }): Promise<PublishResult>;
}
