import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';

/**
 * Social Template Controller — Sprint 2
 *
 * Generates social media post templates for individual items.
 * Three tones (casual, professional, friendly) × two platforms (instagram, facebook).
 * Hashtags auto-generated from item tags + category + platform conventions.
 */

type Tone = 'casual' | 'professional' | 'friendly';
type Platform = 'instagram' | 'facebook';

const VALID_TONES: Tone[] = ['casual', 'professional', 'friendly'];
const VALID_PLATFORMS: Platform[] = ['instagram', 'facebook'];

// Platform character limits (approximate)
const PLATFORM_LIMITS: Record<Platform, number> = {
  instagram: 2200,
  facebook: 63206,
};

/**
 * Format a price for display
 */
function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return 'Price TBD';
  return `$${price.toFixed(0)}`;
}

/**
 * Format sale dates for display
 */
function formatSaleDates(startDate: Date | null, endDate: Date | null): string {
  if (!startDate) return 'upcoming';
  const start = new Date(startDate);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  if (!endDate) return startStr;
  const end = new Date(endDate);
  if (start.getMonth() === end.getMonth()) {
    return `${startStr}–${end.getDate()}`;
  }
  return `${startStr} – ${end.toLocaleDateString('en-US', opts)}`;
}

/**
 * Generate post text based on tone
 */
function generatePostText(
  tone: Tone,
  title: string,
  price: string,
  saleDates: string,
  city: string,
  condition: string | null,
): string {
  switch (tone) {
    case 'casual':
      return `Found this beauty — ${title} at our upcoming estate sale — ${saleDates}, ${city}! ${price} and it won't last. Link in bio to see more.`;
    case 'professional':
      return `Now available: ${title}${condition ? ` — ${condition} condition` : ''}, priced at ${price}. Browse the full collection at our upcoming estate sale ${saleDates} in ${city}.`;
    case 'friendly':
      return `Hey friends! This gorgeous ${title} is waiting for a new home at our sale ${saleDates} in ${city}. Stop by and say hi — it's ${price}!`;
  }
}

/**
 * Generate hashtags from item tags, category, and platform conventions
 */
function generateHashtags(
  tags: string[],
  category: string | null,
  city: string | null,
  platform: Platform,
): string[] {
  const hashtags: string[] = [];

  // Convert item tags to hashtags (remove hyphens for hashtag format)
  for (const tag of tags.slice(0, 5)) {
    const cleaned = tag.replace(/-/g, '');
    hashtags.push(`#${cleaned}`);
  }

  // Add category hashtag
  if (category) {
    hashtags.push(`#${category.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`);
  }

  // Platform-standard tags
  hashtags.push('#estatesale', '#thrifting');
  if (city) {
    const cityTag = city.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    hashtags.push(`#${cityTag}estatesale`);
  }

  // Platform-specific extras
  if (platform === 'instagram') {
    hashtags.push('#estatesalefinds', '#vintagefinds', '#shoplocal');
  } else {
    hashtags.push('#forsale', '#localfinds');
  }

  // Deduplicate
  return [...new Set(hashtags)];
}

/**
 * GET /api/social/:itemId/template?tone=casual&platform=instagram
 *
 * Generates a social media post template for a specific item.
 * Requires organizer auth + ownership of the item's sale.
 */
export const getSocialTemplate = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const { itemId } = req.params;
    const tone = (req.query.tone as string || 'casual') as Tone;
    const platform = (req.query.platform as string || 'instagram') as Platform;

    // Validate tone and platform
    if (!VALID_TONES.includes(tone)) {
      return res.status(400).json({
        message: `Invalid tone. Must be one of: ${VALID_TONES.join(', ')}`,
      });
    }
    if (!VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        message: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}`,
      });
    }

    // Fetch item with sale details
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        price: true,
        category: true,
        condition: true,
        tags: true,
        photoUrls: true,
        sale: {
          select: {
            title: true,
            city: true,
            state: true,
            startDate: true,
            endDate: true,
            organizer: {
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Verify organizer ownership
    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your item' });
    }

    const city = item.sale.city || 'your area';
    const saleDates = formatSaleDates(item.sale.startDate, item.sale.endDate);
    const price = formatPrice(item.price);

    // Generate post text
    const text = generatePostText(
      tone,
      item.title,
      price,
      saleDates,
      city,
      item.condition,
    );

    // Generate hashtags
    const hashtags = generateHashtags(
      item.tags || [],
      item.category,
      item.sale.city,
      platform,
    );

    // Calculate character count (text + hashtags joined)
    const fullPost = `${text}\n\n${hashtags.join(' ')}`;
    const charCount = fullPost.length;
    const platformLimit = PLATFORM_LIMITS[platform];

    res.json({
      text,
      hashtags,
      charCount,
      overLimit: charCount > platformLimit,
      platformLimit,
      photoUrl: item.photoUrls?.[0] || null,
    });
  } catch (error) {
    console.error('Social template error:', error);
    res.status(500).json({ message: 'Server error generating social template' });
  }
};
