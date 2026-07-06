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

/**
 * Registered publishers. Phase 1a ships X only; YOUTUBE / INSTAGRAM / FACEBOOK_PAGE /
 * PINTEREST are intentionally absent until their modules land (later dispatches).
 */
const PUBLISHERS: Partial<Record<SocialPlatform, PlatformPublisher>> = {
  X: xPublisher,
  YOUTUBE: youtubePublisher,          // Phase 1b — YouTube Shorts
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
