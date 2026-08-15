/**
 * platforms/index.ts — the platform registry.
 *
 * The engine and controller look up a PlatformPublisher by SocialPlatform here.
 * Adding YouTube/Meta/Pinterest = implement PlatformPublisher in a sibling file and
 * add one line to PUBLISHERS below. Nothing else in the engine changes. (ADR-077 §3)
 */

import type { SocialPlatform } from '@prisma/client';
import type { PlatformPublisher } from './types';
import { xPublisher } from './x';
import { youtubePublisher } from './youtube';
import { tiktokPublisher } from './tiktok';
import { blueskyPublisher } from './bluesky';
import { threadsPublisher } from './threads';
import { instagramPublisher } from './instagram';
import { facebookPagePublisher } from './facebookPage';

/**
 * Registered publishers. X (Phase 1a), YOUTUBE (Phase 1b), TIKTOK (added
 * 2026-08-10), BLUESKY (added 2026-08-12), and THREADS / INSTAGRAM /
 * FACEBOOK_PAGE (added 2026-08-15, ADR-105 / roadmap #625) are live modules.
 * PINTEREST remains absent until its module lands (later dispatch).
 *
 * TIKTOK note: the module is wired end-to-end, but every post it creates will be
 * forced SELF_ONLY by TikTok itself until Patrick's API client passes TikTok's
 * audit (see tiktok.ts header + STATE.md) -- registering it here does NOT mean
 * public TikTok posting is live yet.
 *
 * THREADS / INSTAGRAM / FACEBOOK_PAGE note: code-only as of 2026-08-15 -- no live
 * OAuth connect or live post has been run for any of the three (dispatch
 * constraint). Registering them here makes /connect + /oauth/callback reachable
 * for the first live-connect attempt; see each module's header comment for its
 * token lifecycle and any flagged assumptions.
 */
const PUBLISHERS: Partial<Record<SocialPlatform, PlatformPublisher>> = {
  X: xPublisher,
  YOUTUBE: youtubePublisher,          // Phase 1b — YouTube Shorts
  TIKTOK: tiktokPublisher,            // added 2026-08-10 — SELF_ONLY until audit clears
  BLUESKY: blueskyPublisher,          // added 2026-08-12 — ADR-105, app-password connect
  THREADS: threadsPublisher,          // added 2026-08-15 — ADR-105 / roadmap #625
  INSTAGRAM: instagramPublisher,      // added 2026-08-15 — ADR-105 / roadmap #625
  FACEBOOK_PAGE: facebookPagePublisher, // added 2026-08-15 — ADR-105 / roadmap #625
  // PINTEREST: pinterestPublisher,   // Phase 3
};

/** Returns the publisher for a platform, or null if not yet implemented. */
export function getPublisher(platform: SocialPlatform): PlatformPublisher | null {
  return PUBLISHERS[platform] ?? null;
}

/** True if a platform has a live publisher module. */
export function isPlatformSupported(platform: SocialPlatform): boolean {
  return getPublisher(platform) !== null;
}

/** List of platforms with a live publisher (for admin UI / connect gating). */
export function supportedPlatforms(): SocialPlatform[] {
  return (Object.keys(PUBLISHERS) as SocialPlatform[]).filter((p) => PUBLISHERS[p]);
}

export type { PlatformPublisher } from './types';
