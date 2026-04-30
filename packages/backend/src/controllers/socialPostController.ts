import { Response } from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isAICostCeilingExceeded } from '../lib/aiCostTracker';
import { getWatermarkedUrl } from '../utils/cloudinaryWatermark';
import { canRemoveWatermark } from '../utils/watermarkPolicy';

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

/**
 * Apply platform-specific Cloudinary crop transformation
 * @param url Original Cloudinary URL
 * @param platform Social platform
 * @returns URL with crop transformation appended (or original URL if not Cloudinary)
 */
function getPlatformSpecificPhotoUrl(url: string, platform: string): string {
  if (!url || !url.includes('res.cloudinary.com')) {
    return url;
  }

  // Find the /upload/ segment to insert transformation before /v
  const uploadMatch = url.match(/\/upload\//);
  if (!uploadMatch) {
    return url;
  }

  // Map platform to Cloudinary aspect ratio transformation
  const cropMap: Record<string, string> = {
    pinterest: 'c_fill,ar_2:3,w_600,h_900',  // 2:3 aspect ratio
    tiktok: 'c_fill,ar_9:16,w_1080,h_1920',  // 9:16 aspect ratio
    instagram: 'c_fill,ar_4:5,w_1080,h_1350', // 4:5 aspect ratio
    facebook: '',  // No crop needed
    nextdoor: '',  // No crop needed
    threads: '',  // No crop needed
  };

  const cropTransform = cropMap[platform];
  if (!cropTransform) {
    return url;
  }

  try {
    // Insert crop transformation after /upload/
    const uploadIndex = url.indexOf('/upload/');
    if (uploadIndex === -1) {
      return url;
    }

    return (
      url.slice(0, uploadIndex + '/upload/'.length) +
      cropTransform +
      '/' +
      url.slice(uploadIndex + '/upload/'.length)
    );
  } catch {
    return url;
  }
}

export const generateSocialPost = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, platform, highlights } = req.body;
    const userId = req.user?.id;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ message: 'AI service unavailable' });
    }

    // Feature #104: Check AI cost ceiling
    if (isAICostCeilingExceeded()) {
      return res.status(503).json({ message: 'AI service temporarily unavailable due to resource limits. Please try again later.' });
    }

    if (!saleId || !platform) {
      return res.status(400).json({ message: 'saleId and platform are required' });
    }

    // Fetch organizer subscription tier
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      select: { id: true, subscriptionTier: true },
    });

    if (!organizer) {
      return res.status(403).json({ message: 'Organizer not found' });
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizerId: organizer.id },
      include: {
        items: {
          where: { status: 'AVAILABLE' },
          orderBy: { price: 'desc' },
          take: 5,
          select: { title: true, price: true, category: true, photoUrls: true },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const platformGuidelines: Record<string, string> = {
      instagram: 'Instagram: engaging, emoji-rich, 3-5 relevant hashtags at the end, max 220 words. Include call to action to visit link in bio.',
      facebook: 'Facebook: friendly and informative, 1-2 relevant hashtags, max 150 words. Include the sale dates and address. Encourage sharing.',
      nextdoor: 'Nextdoor: friendly neighborhood tone, no hashtags, mention specific neighborhood/city, max 100 words. Focus on community and local discovery.',
      tiktok: 'TikTok: trendy and fun tone, use 3-5 popular hashtags (#findasale, #estatesale, etc.), max 150 words. Hook viewers in first sentence with benefit or intrigue.',
      pinterest: 'Pinterest: inspirational and lifestyle tone, emphasize treasure/finds/deals, use 5-10 relevant hashtags, max 300 words. Focus on visual appeal and discovery.',
      threads: 'Threads: conversational and authentic, max 500 words, include 2-3 relevant hashtags. Encourage replies and community discussion about the sale and items.',
    };

    const startDate = new Date(sale.startDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const endDate = new Date(sale.endDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const topItems = sale.items
      .map(i => `- ${i.title} ($${(i.price ?? 0).toFixed(2)})`)
      .join('\n');

    const prompt = `Generate a social media post for an estate sale. ${platformGuidelines[platform] || platformGuidelines.facebook}

Sale Details:
- Title: ${sale.title}
- Dates: ${startDate} through ${endDate}
- Location: ${sale.address || ''}, ${sale.city}, ${sale.state}
- Top items:
${topItems || 'Various household items, furniture, collectibles'}
${highlights ? `\nOrganizer notes: ${highlights}` : ''}

Write only the post text, no explanations.`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );

    const postText = (response.data.content[0] as { type: string; text: string }).text;

    // Generate watermarked photo URL (tier-aware)
    let photoUrl: string | null = null;
    const firstItemWithPhoto = sale.items.find((item: any) => item.photoUrls && item.photoUrls.length > 0);
    if (firstItemWithPhoto) {
      photoUrl = firstItemWithPhoto.photoUrls[0];
      // Apply platform-specific crop
      photoUrl = getPlatformSpecificPhotoUrl(photoUrl, platform);
      // Apply watermark based on tier
      if (!canRemoveWatermark(organizer)) {
        photoUrl = getWatermarkedUrl(photoUrl);
      }
    }

    res.json({ post: postText, platform, photoUrl });
  } catch (error) {
    console.error('generateSocialPost error:', error);
    res.status(500).json({ message: 'Failed to generate post' });
  }
};
