import { Response } from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

export const generateSocialPost = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, platform, highlights } = req.body;
    const userId = req.user?.id;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'AI service unavailable' });
    }

    if (!saleId || !platform) {
      return res.status(400).json({ error: 'saleId and platform are required' });
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizerId: userId },
      include: {
        items: {
          where: { status: 'AVAILABLE' },
          orderBy: { price: 'desc' },
          take: 5,
          select: { title: true, price: true, category: true },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const platformGuidelines: Record<string, string> = {
      instagram: 'Instagram: engaging, emoji-rich, 3-5 relevant hashtags at the end, max 220 words. Include call to action to visit link in bio.',
      facebook: 'Facebook: friendly and informative, 1-2 relevant hashtags, max 150 words. Include the sale dates and address. Encourage sharing.',
      nextdoor: 'Nextdoor: friendly neighborhood tone, no hashtags, mention specific neighborhood/city, max 100 words. Focus on community and local discovery.',
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
    res.json({ post: postText, platform });
  } catch (error) {
    console.error('generateSocialPost error:', error);
    res.status(500).json({ error: 'Failed to generate post' });
  }
};
