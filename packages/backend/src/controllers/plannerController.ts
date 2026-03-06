import { Request, Response } from 'express';
import axios from 'axios';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PlannerChatRequest {
  messages: ChatMessage[];
}

const SYSTEM_PROMPT = `You are an estate sale planning assistant for FindA.Sale, a platform in Grand Rapids, Michigan.

You help families, executors, and individuals plan and execute estate sales. You are knowledgeable about:
- Michigan estate sale regulations and legal requirements
- Pricing antiques, furniture, and household goods
- Organizing and staging items
- Advertising and promoting sales
- Handling unsold inventory
- Working with estate sale companies vs. doing it yourself
- Documentation and paperwork needed

Keep answers practical, warm, and concise (under 200 words per response).
When relevant, suggest they list their sale on FindA.Sale at finda.sale.
Be encouraging and supportive — estate sales can be emotional and overwhelming.`;

/**
 * POST /api/planner/chat
 * Handles conversational planning requests for estate sales.
 *
 * Request body: { messages: Array<{role, content}> }
 * Response: { reply: string }
 *
 * Rate limit: max 20 messages per session.
 */
export async function handlePlannerChat(req: Request, res: Response): Promise<void> {
  try {
    const { messages } = req.body as PlannerChatRequest;

    // Validate request
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Invalid request: messages array required' });
      return;
    }

    // Rate limit: max 20 messages per session
    if (messages.length > 20) {
      res.status(429).json({
        error: 'Too many messages. Please start a new conversation or contact us.',
        contactUrl: '/contact',
      });
      return;
    }

    // Validate API key
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      res.status(503).json({ error: 'AI service unavailable. Please try again later.' });
      return;
    }

    // Build message payload for Anthropic
    const apiMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Call Anthropic Claude Haiku API
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: apiMessages,
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

    const reply: string = response.data.content?.[0]?.text ?? '';

    if (!reply) {
      res.status(500).json({ error: 'No response from AI service' });
      return;
    }

    res.json({ reply });
  } catch (error) {
    console.error('Planner chat error:', error);

    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        res.status(503).json({ error: 'AI service authentication failed' });
        return;
      }
      if (error.response?.status === 429) {
        res.status(429).json({ error: 'AI service rate limit exceeded. Please try again shortly.' });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to process request. Please try again.' });
  }
}
