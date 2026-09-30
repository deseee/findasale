/**
 * Season standings (2026-09-29): who earned the most XP THIS season.
 *
 * WHY: the old seasonal board listed users stamped by an annual "reset" that lowered the stored
 * explorerRank but never guildXp. Every later XP award recomputes rank from guildXp (awardXp), so
 * demoted members snapped straight back and the board meant nothing. Industry standard for season
 * leaderboards (and this project's own rule, gamedesign S417 decision #14 and the guild primer line
 * "Your rank never resets. Your competition does.") is: rank is permanent, the SEASON BOARD is a
 * separate score that starts at zero. That score is XP EARNED since the season began, taken from the
 * PointsTransaction ledger.
 *
 * WHAT COUNTS: positive ledger rows created on or after the season start (Jan 1 00:00 UTC).
 * Spends are negative rows and are ignored (spending never lowers a season score). Chargeback
 * clawbacks (type CHARGEBACK_XP_CLAWBACK) ARE subtracted so a disputed purchase does not keep a
 * place. Members flagged fraudSuspect never appear.
 *
 * QUERY SHAPE: one grouped query (GROUP BY userId, SUM(points), ORDER BY sum DESC, LIMIT) plus one
 * grouped query for clawbacks over that bounded candidate set. No full-table load.
 */
import { prisma } from '../lib/prisma';

/** Members eligible for the seasonal board (documented as "Sage+" in ADR-EXPLORER_GUILD_RANK_ARCHITECTURE s8.2). */
export const SEASON_BOARD_RANKS = ['SAGE', 'GRANDMASTER'] as const;

/** Extra candidates fetched so clawbacks can not push a full page below the cut. */
const CLAWBACK_BUFFER = 50;

/** Jan 1 00:00 UTC of the given date's year. */
export function seasonStartFor(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

export interface SeasonLeader {
  userId: string;
  seasonXp: number;
}

/**
 * Top members by XP earned in [start, end). `end` omitted means "through now".
 * Returns at most `limit` rows with seasonXp > 0, best first (ties broken by user id so the order is stable).
 */
export async function getSeasonXpLeaders(opts: {
  start: Date;
  end?: Date;
  limit?: number;
  ranks?: readonly string[];
}): Promise<SeasonLeader[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 500));
  const ranks = opts.ranks ?? SEASON_BOARD_RANKS;
  const createdAt = opts.end ? { gte: opts.start, lt: opts.end } : { gte: opts.start };

  const grouped: any[] = await (prisma.pointsTransaction as any).groupBy({
    by: ['userId'],
    where: {
      createdAt,
      points: { gt: 0 },
      user: { explorerRank: { in: [...ranks] }, fraudSuspect: false },
    },
    _sum: { points: true },
    orderBy: { _sum: { points: 'desc' } },
    take: limit + CLAWBACK_BUFFER,
  });
  if (!grouped || grouped.length === 0) return [];

  const ids: string[] = grouped.map((g) => g.userId);
  const clawGroups: any[] = await (prisma.pointsTransaction as any).groupBy({
    by: ['userId'],
    where: { userId: { in: ids }, createdAt, type: 'CHARGEBACK_XP_CLAWBACK' },
    _sum: { points: true },
  });
  const clawed = new Map<string, number>(
    (clawGroups || []).map((c) => [c.userId as string, Math.abs(c._sum?.points ?? 0)])
  );

  return grouped
    .map((g) => ({
      userId: g.userId as string,
      seasonXp: Math.max(0, (g._sum?.points ?? 0) - (clawed.get(g.userId) ?? 0)),
    }))
    .filter((l) => l.seasonXp > 0)
    .sort((a, b) => b.seasonXp - a.seasonXp || a.userId.localeCompare(b.userId))
    .slice(0, limit);
}
