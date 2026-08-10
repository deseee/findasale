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

/**
 * Registered publishers. X (Phase 1a), YOUTUBE (Phase 1b), TIKTOK (added
 * 2026-08-10) are live modules. INSTAGRAM / FACEBOOK_PAGE / PINTEREST are
 * intentionally absent until their modules land (later dispatches).
 *
 * TIKTOK note: the module is wired end-to-end, but every post it creates will be
 * forced SELF_ONLY by TikTok itself until Patrick's API client passes TikTok's
 * audit (see tiktok.ts header + STATE.md) -- registering it here does NOT mean
 * public TikTok posting is live yet.
 */
const PUBLISHERS: Partial<Record<SocialPlatform, PlatformPublisher>> = {
  X: xPublisher,
  YOUTUBE: youtubePublisher,          // Phase 1b — YouTube Shorts
  TIKTOK: tiktokPublisher,            // added 2026-08-10 — SELF_ONLY until audit clears
  // INSTAGRAM: metaPublisher,        // Phase 2
  // FACEBOOK_PAGE: metaPublisher,    // Phase 2
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
