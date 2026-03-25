import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { isAICostCeilingExceeded } from '../lib/aiCostTracker';

// In-memory rate limiting map: userId -> { count, resetTime }
const chatRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const DAILY_LIMIT = 20;
const RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

interface ChatRequest {
  message: string;
  context?: string; // optional user context (e.g. sale ID, item ID)
}

interface ChatResponse {
  response: string;
  timestamp: string;
  canChat: boolean;
  remainingRequests?: number;
}

export const postSupportChat = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { message, context } = req.body as ChatRequest;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Fetch user with subscription info
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        roleSubscriptions: {
          select: {
            role: true,
            subscriptionTier: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check subscription tier — only PRO/TEAMS can use chat
    const hasProOrTeams = user.roleSubscriptions.some(
      (sub) => sub.subscriptionTier === 'PRO' || sub.subscriptionTier === 'TEAMS'
    );

    if (!hasProOrTeams) {
      return res.status(403).json({
        message: 'Chat support is available for PRO and TEAMS tiers only',
        upgrade: true,
      });
    }

    // Rate limiting: 20 requests per 24 hours per user
    const now = Date.now();
    const rateLimitEntry = chatRateLimitMap.get(user.id);

    if (rateLimitEntry && rateLimitEntry.resetTime > now) {
      if (rateLimitEntry.count >= DAILY_LIMIT) {
        return res.status(429).json({
          message: 'Chat limit reached (20 per day). Please try again tomorrow.',
          remaining: 0,
        });
      }
      rateLimitEntry.count++;
    } else {
      // Reset the counter
      chatRateLimitMap.set(user.id, {
        count: 1,
        resetTime: now + RESET_INTERVAL,
      });
    }

    const remaining = DAILY_LIMIT - (chatRateLimitMap.get(user.id)?.count || 0);

    // Feature #104: Check AI cost ceiling before proceeding
    if (isAICostCeilingExceeded()) {
      console.warn('[support-chat] AI cost ceiling exceeded, returning fallback response');
      return res.status(503).json({
        message: 'Support chat is temporarily unavailable due to service maintenance. Please try again later.',
        canChat: false,
      });
    }

    // Check if Anthropic API key is configured
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        message: 'Support chat is temporarily unavailable',
      });
    }

    // Initialize Anthropic client
    const client = new Anthropic({ apiKey });

    // Build system prompt for support assistant
    const systemPrompt = `You are a helpful customer support assistant for FindA.Sale, a platform for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment).

You help both Organizers (who list sales) and Shoppers (who attend sales).

Respond concisely and helpfully. If you don't know the answer, suggest contacting Patrick directly at support@finda.sale.

Context about the user:
- Name: ${user.name}
- Email: ${user.email}
- Tier: ${hasProOrTeams ? 'PRO/TEAMS' : 'SIMPLE'}
${context ? `- User context: ${context}` : ''}

Focus on helping with:
1. Billing & subscription questions
2. Sales management & item listing issues
3. Shopper features & browsing help
4. Technical support & account issues`;

    // Call Anthropic API
    const message_obj = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
    });

    // Extract response text
    const responseText =
      message_obj.content[0].type === 'text' ? message_obj.content[0].text : 'Unable to generate response';

    const response: ChatResponse = {
      response: responseText,
      timestamp: new Date().toISOString(),
      canChat: true,
      remainingRequests: remaining,
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('Support chat error:', error);
    return res.status(500).json({
      message: error.message || 'Internal server error',
    });
  }
};

export const getFAQCategory = async (req: Request, res: Response) => {
  const { category } = req.params;

  if (!category) {
    return res.status(400).json({ message: 'Category is required' });
  }

  // Return empty for now — FAQ data is served from frontend
  return res.status(200).json({ message: 'Use frontend FAQ search' });
};
