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
import { awardPoints } from './pointsService';

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
 */
export async function generateDailyClue(date: string): Promise<GeneratedClue> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = `Generate a fun, cryptic clue for an estate sale treasure hunt.
The clue should hint at one of these item categories: ${ITEM_CATEGORIES.join(', ')}.

Format your response as ONLY valid JSON (no markdown, no explanation):
{
  "clue": "...",
  "category": "...",
  "keywords": ["...", "...", "..."]
}

Guidelines:
- Clue: 1-2 sentences, fun and mysterious, written for estate sale shoppers
- Category: one of the categories listed above
- Keywords: 3-5 matching terms/variations (e.g., for books: ["book", "novel", "paperback", "hardcover", "volume"])

Example output:
{
  "clue": "Grandmother kept her treasures here, between spine and spine...",
  "category": "books",
  "keywords": ["book", "novel", "vintage paperback", "hardcover", "tome", "volume"]
}`;

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
  const raw = content.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(raw) as GeneratedClue;
}

/**
 * Get or create today's treasure hunt.
 * If today's hunt doesn't exist, generates a new one.
 */
export async function getTodayHunt(): Promise<any> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  let hunt = await prisma.treasureHunt.findUnique({
    where: { date: dateStr },
  });

  if (!hunt) {
    const generated = await generateDailyClue(dateStr);
    hunt = await prisma.treasureHunt.create({
      data: {
        date: dateStr,
        clue: generated.clue,
        category: generated.category,
        keywords: generated.keywords,
        pointReward: 50,
      },
    });
  }

  return hunt;
}

/**
 * Check if an item matches hunt keywords.
 * Matches against item title and item category (case-insensitive).
 */
export function checkIfItemMatchesHunt(item: any, hunt: any): boolean {
  const searchText = `${item.title} ${item.category || ''}`.toLowerCase();
  return hunt.keywords.some((keyword: string) =>
    searchText.includes(keyword.toLowerCase())
  );
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

  // Create find record and award points in transaction
  const find = await prisma.treasureHuntFind.create({
    data: {
      userId,
      huntId,
      itemId,
      foundAt: new Date(),
    },
  });

  // Award points (fire-and-forget)
  awardPoints(userId, 'TREASURE_HUNT_FIND', hunt.pointReward, undefined, itemId, `Found treasure hunt item`).catch((err) => {
    console.error('Error awarding treasure hunt points:', err);
  });

  return find;
}
