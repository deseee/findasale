/**
 * treasureHuntService.ts — CD2 Phase 2
 * 
 * Daily treasure hunt discovery challenge:
 * - Generate daily clues using Claude Haiku
 * - Match items against hunt keywords
 * - Award points when shoppers find matching items
 */

import axios from 'axios';
import { prisma } from '../lib/prisma';
import { isAICostCeilingExceeded, trackAITokens, estimateTokensForRequest, recordApiUsage, ANTHROPIC_COST_PER_M_TOKENS, recordAnthropicUsageOrEstimate, isAIDailyCallCapAvailable, trackAICall } from '../lib/aiCostTracker';
import { isAnthropicCreditError, alertAnthropicCreditExhausted } from '../lib/anthropicError';
import { awardXp, computeTreasureHuntScanXp } from './xpService'; // Daily hunt claim XP (2026-09-29)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const ITEM_CATEGORIES = [
  'furniture',
  'jewelry',
  'art',
  'clothing',
  'kitchenware',
  'tools',
  'collectibles',
  'electronics',
  'books',
  'linens',
];

interface GeneratedClue {
  clue: string;
  category: string;
  keywords: string[];
}

/**
 * Generate a daily treasure hunt clue using Claude Haiku.
 * Requests a cryptic, fun clue that hints at one of the standard categories.
 * Feature #104: Returns fallback clue if cost ceiling is exceeded.
 */
export async function generateDailyClue(date: string): Promise<GeneratedClue> {
  // Shared degraded-mode clue: returned whenever AI is unavailable (missing key,
  // cost ceiling tripped, API error, or Anthropic out of credit) so the treasure
  // hunt route always resolves a clue and never surfaces a 500 to shoppers.
  const FALLBACK_CLUE: GeneratedClue = {
    clue: 'Search for something colorful and decorative from a past era...',
    category: 'art',
    keywords: ['art', 'painting', 'decor', 'vintage', 'collectible'],
  };

  if (!ANTHROPIC_API_KEY) {
    console.warn('[treasure-hunt] ANTHROPIC_API_KEY not configured, returning fallback clue');
    return FALLBACK_CLUE;
  }

  // Feature #104: Cost ceiling check
  if (await isAICostCeilingExceeded()) {
    console.warn('[treasure-hunt] AI cost ceiling exceeded, returning fallback clue');
    return FALLBACK_CLUE;
  }

  // Fix B: absolute daily AI call-count cap
  if (!(await isAIDailyCallCapAvailable())) {
    console.warn('[treasure-hunt] AI daily call cap reached (AI_DAILY_CALL_CAP), returning fallback clue');
    return FALLBACK_CLUE;
  }

  const prompt = `Generate a fun, cryptic clue for a secondary-sale treasure hunt (estate sales, yard sales, auctions, flea markets, consignment).
The clue should hint at one of these item categories: ${ITEM_CATEGORIES.join(', ')}.

Format your response as ONLY valid JSON (no markdown, no explanation):
{
  "clue": "...",
  "category": "...",
  "keywords": ["...", "...", "..."]
}

Guidelines:
- Clue: 1-2 sentences, fun and mysterious, written for secondary-sale shoppers
- Category: one of the categories listed above
- Keywords: 3-5 matching terms/variations (e.g., for books: ["book", "novel", "paperback", "hardcover", "volume"])
- Do NOT use em dashes (—) or en dashes (–) anywhere in the clue. Use a period, comma, or "and" instead.

Example output:
{
  "clue": "Grandmother kept her treasures here, between spine and spine...",
  "category": "books",
  "keywords": ["book", "novel", "vintage paperback", "hardcover", "tome", "volume"]
}`;

  const estimatedTokens = estimateTokensForRequest(prompt, false);
  try {
    const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    },
    {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const content: string = response.data.content?.[0]?.text ?? '';
  const responseTokens = Math.ceil(content.length / 4) + 50; // estimate fallback only
  await recordAnthropicUsageOrEstimate('anthropic:treasure_hunt', ANTHROPIC_MODEL, response.data.usage, estimatedTokens + responseTokens);
  await trackAICall();
  const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as GeneratedClue;
    // D-011 safety net: strip em/en dashes even if the model ignores the prompt
    // instruction above (weekly-audit-2026-08-15 found a live em dash in production).
    if (parsed?.clue) {
      parsed.clue = parsed.clue.replace(/[—–]/g, ', ').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim();
    }
    return parsed;
  } catch (err: any) {
    // Anthropic call (or JSON parse) failed — e.g. out of credit (HTTP 400).
    // Degrade to the shared fallback clue so shoppers never see a 500.
    if (isAnthropicCreditError(err)) {
      await alertAnthropicCreditExhausted('treasure_hunt');
    }
    console.error('[treasure-hunt] Clue generation failed, returning fallback clue:', err?.message ?? err);
    return FALLBACK_CLUE;
  }
}

/**
 * Get or create today's treasure hunt.
 * If today's hunt doesn't exist, generates a new one.
 */
export async function getTodayHunt(): Promise<any> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Check if today's hunt already exists before generating (avoid unnecessary AI call)
  let hunt = await prisma.treasureHunt.findUnique({ where: { date: dateStr } });
  if (hunt) return hunt;

  const generated = await generateDailyClue(dateStr);

  // upsert is atomic — handles concurrent requests hitting this simultaneously
  hunt = await prisma.treasureHunt.upsert({
    where: { date: dateStr },
    update: {},
    create: {
      date: dateStr,
      clue: generated.clue,
      category: generated.category,
      keywords: generated.keywords,
      pointReward: 3, // XP_AWARDS.TREASURE_HUNT_SCAN (D-XP-015)
    },
  });

  return hunt;
}

/**
 * Check if an item matches hunt keywords.
 * Matches against item title and item category (case-insensitive).
 */
export function checkIfItemMatchesHunt(item: any, hunt: any): boolean {
  const searchText = `${item.title} ${item.category || ''}`.toLowerCase();
  return (hunt.keywords as string[]).some((keyword: string) => {
    const k = String(keyword || '').trim().toLowerCase();
    if (!k) return false;
    // Word-start match (2026-09-29): "art" must not match "cart"/"party"/"smart", while "paint"
    // still matches "painting" and "vintage paperback" still matches as a phrase.
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}`, 'i').test(searchText);
  });
}

/**
 * Mark an item as found for a user in today's hunt.
 * Awards pointReward points and creates a TreasureHuntFind record.
 */
export async function markFound(userId: string, huntId: number, itemId: string): Promise<any> {
  // Check for duplicate — user can only find once per hunt
  const existing = await prisma.treasureHuntFind.findUnique({
    where: {
      userId_huntId: { userId, huntId },
    },
  });

  if (existing) {
    throw new Error("Item already found for today's hunt");
  }

  // Get hunt to retrieve pointReward
  const hunt = await prisma.treasureHunt.findUnique({
    where: { id: huntId },
  });

  if (!hunt) {
    throw new Error('Hunt not found');
  }

  // Create find record. The unique (userId, huntId) key makes a concurrent double-claim safe.
  let find;
  try {
    find = await prisma.treasureHuntFind.create({
      data: {
        userId,
        huntId,
        itemId,
        foundAt: new Date(),
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new Error("Item already found for today's hunt");
    }
    throw err;
  }

  // XP is awarded by claimDailyHunt() below (the single caller), which owns the rank +
  // Hunt Pass multiplier math. markFound only records the find.
  return find;
}

// ---------------------------------------------------------------------------
// Daily hunt claim (2026-09-29): the "Claim your XP" action on the item page.
// ---------------------------------------------------------------------------

export type HuntItemState =
  | 'NO_HUNT' // no hunt today (should not happen: getTodayHunt generates one)
  | 'NOT_FOUND' // item does not exist
  | 'NOT_A_MATCH' // item does not fit today's clue (UI shows nothing)
  | 'UNAVAILABLE' // item or its sale is not live
  | 'OWN_ITEM' // shopper is the organizer of this sale
  | 'HUNT_EXPIRED' // client is holding yesterday's hunt id
  | 'ALREADY_FOUND' // shopper already claimed today's hunt
  | 'ELIGIBLE'; // shopper can claim right now

export interface HuntItemStatus {
  state: HuntItemState;
  huntId?: number;
  clue?: string;
  category?: string;
  /** Base XP before rank / Hunt Pass multipliers (D-XP-015 constant). */
  pointReward?: number;
  /** Ends of the hunt's day, server clock (the hunt is "today only"). */
  expiresAt?: string;
}

function endOfHuntDayIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, (d || 1) + 1, 0, 0, 0, 0).toISOString();
}

async function loadHuntItem(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      isActive: true,
      draftStatus: true,
      saleId: true,
      sale: { select: { id: true, status: true, organizer: { select: { userId: true } } } },
    },
  });
}

function isLiveHuntItem(item: any): boolean {
  return (
    !!item &&
    item.isActive !== false &&
    item.draftStatus === 'PUBLISHED' &&
    item.status !== 'GRACE_LOCKED' &&
    item.status !== 'DONATED' &&
    item.sale?.status === 'PUBLISHED'
  );
}

/**
 * Non-mutating status for the item page. userId is optional (anonymous visitors get
 * ELIGIBLE and are sent to login by the UI when they try to claim). Never reveals keywords.
 */
export async function getHuntItemStatus(itemId: string, userId?: string): Promise<HuntItemStatus> {
  const hunt = await getTodayHunt();
  if (!hunt) return { state: 'NO_HUNT' };

  const base = {
    huntId: hunt.id as number,
    clue: hunt.clue as string,
    category: hunt.category as string,
    pointReward: 3, // XP_AWARDS.TREASURE_HUNT_SCAN (D-XP-015)
    expiresAt: endOfHuntDayIso(hunt.date as string),
  };

  const item: any = await loadHuntItem(itemId);
  if (!item) return { state: 'NOT_FOUND' };
  if (!checkIfItemMatchesHunt(item, hunt)) return { state: 'NOT_A_MATCH', huntId: base.huntId };
  if (!isLiveHuntItem(item)) return { state: 'UNAVAILABLE', ...base };

  if (userId) {
    if (item.sale?.organizer?.userId === userId) return { state: 'OWN_ITEM', ...base };
    const existing = await prisma.treasureHuntFind.findUnique({
      where: { userId_huntId: { userId, huntId: hunt.id } },
    });
    if (existing) return { state: 'ALREADY_FOUND', ...base };
  }
  return { state: 'ELIGIBLE', ...base };
}

export interface HuntClaimResult {
  state: 'CLAIMED' | HuntItemState;
  huntId?: number;
  xpEarned?: number;
  guildXp?: number;
  explorerRank?: string;
  rankIncreased?: boolean;
}

/**
 * Claim today's Daily Treasure Hunt with an item. Server-validated and idempotent:
 *  - the item must be live (published item in a published sale) and match today's clue;
 *  - an organizer cannot claim on their own sale;
 *  - one claim per shopper per hunt (unique key), so a repeat call returns ALREADY_FOUND
 *    and never awards twice, even under concurrent requests;
 *  - a client still holding a previous day's huntId gets HUNT_EXPIRED.
 * XP = the D-XP-015 base scaled by rank multiplier and the Hunt Pass +10% bonus.
 */
export async function claimDailyHunt(userId: string, itemId: string, clientHuntId?: number): Promise<HuntClaimResult> {
  const hunt = await getTodayHunt();
  if (!hunt) return { state: 'NO_HUNT' };
  if (typeof clientHuntId === 'number' && clientHuntId !== hunt.id) {
    return { state: 'HUNT_EXPIRED', huntId: hunt.id };
  }

  const item: any = await loadHuntItem(itemId);
  if (!item) return { state: 'NOT_FOUND', huntId: hunt.id };

  const existing = await prisma.treasureHuntFind.findUnique({
    where: { userId_huntId: { userId, huntId: hunt.id } },
  });
  if (existing) return { state: 'ALREADY_FOUND', huntId: hunt.id };

  if (!isLiveHuntItem(item)) return { state: 'UNAVAILABLE', huntId: hunt.id };
  if (item.sale?.organizer?.userId === userId) return { state: 'OWN_ITEM', huntId: hunt.id };
  if (!checkIfItemMatchesHunt(item, hunt)) return { state: 'NOT_A_MATCH', huntId: hunt.id };

  try {
    await markFound(userId, hunt.id, itemId);
  } catch (err: any) {
    if (String(err?.message || '').includes('already found')) {
      return { state: 'ALREADY_FOUND', huntId: hunt.id };
    }
    throw err;
  }

  let xpEarned = 0;
  let guildXp: number | undefined;
  let explorerRank: string | undefined;
  let rankIncreased = false;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { explorerRank: true } });
    const xp = await computeTreasureHuntScanXp(userId, (user?.explorerRank ?? 'INITIATE') as any);
    const result = await awardXp(userId, 'TREASURE_HUNT_DAILY', xp, {
      itemId,
      saleId: item.saleId ?? undefined,
      description: `Daily Treasure Hunt found: ${item.title}`,
      preMultipliedHuntPassXp: true,
    });
    if (result) {
      xpEarned = result.xpAwarded;
      guildXp = result.newXp;
      explorerRank = result.newRank;
      rankIncreased = result.rankIncreased;
    }
  } catch (err) {
    // The find is recorded; an XP failure must not turn a valid claim into an error.
    console.error('[treasure-hunt] Failed to award daily hunt XP:', err);
  }

  return { state: 'CLAIMED', huntId: hunt.id, xpEarned, guildXp, explorerRank, rankIncreased };
}
