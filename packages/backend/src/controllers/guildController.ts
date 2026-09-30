/**
 * Explorer's Guild Controller — Phase 2b
 * Handles Hall of Fame, rank info, and guild-related endpoints
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { RANK_THRESHOLDS } from '../services/xpService';
import { getSeasonXpLeaders, seasonStartFor } from '../services/seasonStandingsService';
import { opaqueUserId } from '../utils/opaqueUserId';

/**
 * Public-safe display name: first name plus last initial ("Jane Doe" becomes "Jane D.").
 * A single name is kept as is; a missing or blank name becomes "Explorer".
 * Idempotent: "Jane D." stays "Jane D.".
 */
export function toPublicName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Explorer';
  if (parts.length === 1) return parts[0];
  const lastInitial = Array.from(parts[parts.length - 1])[0]?.toUpperCase() ?? '';
  return lastInitial ? `${parts[0]} ${lastInitial}.` : parts[0];
}

/**
 * Opaque, stable, non-reversible stand-in for a user id. Used for members whose collector
 * profile is not public, so the real user id is never returned. The public profile route
 * (/collector-passport/users/:userId) will not resolve it, which matches what it does for a
 * private profile anyway ("not found or private").
 */
export function opaqueHallOfFameId(userId: string): string {
  // Same scheme as utils/opaqueUserId (single implementation, 2026-09-29).
  return opaqueUserId(userId);
}

/**
 * Earliest timestamp at which the user reached `rank`, from User.rankUpHistory
 * (array of { rank, timestamp, xpAtTime }). Returns null when the history has no such entry
 * (for example users seeded straight into a rank), so callers never present a guess as a date.
 */
export function findRankAchievedAt(history: unknown, rank: string): Date | null {
  if (!Array.isArray(history)) return null;
  let earliest: Date | null = null;
  for (const entry of history) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { rank?: unknown; timestamp?: unknown };
    if (e.rank !== rank || (typeof e.timestamp !== 'string' && typeof e.timestamp !== 'number')) continue;
    const d = new Date(e.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

/**
 * GET /api/guild/hall-of-fame
 * Public endpoint — no authentication required
 * Returns all-time Grandmasters and seasonal top 100 Sage+
 *
 * Seasonal board (2026-09-29 redesign): ranked by XP EARNED THIS SEASON (positive PointsTransaction
 * rows since Jan 1 00:00 UTC, chargeback clawbacks subtracted), not by lifetime guildXp, and rank is
 * never lowered at season rollover. Sage+ is the member's permanent rank. In each seasonal entry
 * `guildXp` (the field the page shows as "XP") and `seasonXp` both carry the season score so the
 * response shape and the existing page stay correct; `totalGuildXp` is the member's lifetime balance.
 *
 * Privacy: names are returned as first name plus last initial. The real user id (and profile
 * slug) is only returned for members whose collector profile is public, because that is the only
 * case where /shopper/profile/[userId] resolves and already shows the id publicly. Everyone else
 * gets an opaque id in the same `userId` field, so the response shape is unchanged.
 *
 * All-time Grandmasters are selected by rank OR by XP at the Grandmaster threshold (ranks are permanent,
 * and the OR keeps the board right for anyone whose stored rank lags their XP).
 *
 * achievedAt is the date the member first reached Grandmaster (from rankUpHistory), or null when
 * that history is not recorded. It is never approximated with the account creation date.
 */
export const getHallOfFame = async (req: Request, res: Response) => {
  try {
    // All-time Grandmasters
    const grandmasters = await prisma.user.findMany({
      where: {
        OR: [
          { explorerRank: 'GRANDMASTER' },
          { guildXp: { gte: RANK_THRESHOLDS.GRANDMASTER } },
        ],
      },
      select: {
        id: true,
        name: true,
        profileSlug: true,
        guildXp: true,
        explorerRank: true,
        rankUpHistory: true,
        createdAt: true,
      },
      orderBy: [
        { guildXp: 'desc' },
        { createdAt: 'asc' }, // Tiebreaker: longest-standing account first
      ],
      take: 100,
    });

    // Top 100 Sage+ this season
    const seasonStart = seasonStartFor(new Date()); // Jan 1 UTC of current year

    const seasonRows = await getSeasonXpLeaders({ start: seasonStart, limit: 100 });
    const seasonUsers = seasonRows.length
      ? await prisma.user.findMany({
          where: { id: { in: seasonRows.map((r) => r.userId) } },
          select: {
            id: true,
            name: true,
            profileSlug: true,
            guildXp: true,
            explorerRank: true,
          },
        })
      : [];
    const seasonUserById = new Map(seasonUsers.map((u) => [u.id, u]));
    // Keep the ledger order; drop a row whose user vanished between the two queries.
    const seasonalLeaders = seasonRows.flatMap((r) => {
      const u = seasonUserById.get(r.userId);
      return u ? [{ ...u, seasonXp: r.seasonXp }] : [];
    });

    // Which of these members have a public collector profile (link target exists)
    const allIds = Array.from(new Set([...grandmasters.map((u) => u.id), ...seasonalLeaders.map((u) => u.id)]));
    const publicPassports = allIds.length
      ? await prisma.collectorPassport.findMany({
          where: { userId: { in: allIds }, isPublic: true },
          select: { userId: true },
        })
      : [];
    const publicIds = new Set(publicPassports.map((p) => p.userId));

    const publicIdentity = (u: { id: string; name: string | null; profileSlug: string | null }) => {
      const isPublic = publicIds.has(u.id);
      return {
        userId: isPublic ? u.id : opaqueHallOfFameId(u.id),
        name: toPublicName(u.name),
        profileSlug: isPublic ? u.profileSlug : null,
        profilePublic: isPublic,
      };
    };

    res.json({
      allTimeGrandmasters: grandmasters.map((u, idx) => ({
        rank: idx + 1,
        ...publicIdentity(u),
        guildXp: u.guildXp,
        explorerRank: 'GRANDMASTER',
        achievedAt: findRankAchievedAt(u.rankUpHistory, 'GRANDMASTER')?.toISOString() ?? null,
      })),
      seasonalTop100: seasonalLeaders.map((u, idx) => ({
        rank: idx + 1,
        ...publicIdentity(u),
        guildXp: u.seasonXp, // the season score (see docblock); the page labels this column "XP"
        seasonXp: u.seasonXp,
        totalGuildXp: u.guildXp,
        explorerRank: u.explorerRank,
      })),
    });
  } catch (error) {
    console.error('Error fetching Hall of Fame:', error);
    res.status(500).json({ message: 'Failed to fetch Hall of Fame' });
  }
};
