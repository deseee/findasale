import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

const CRAWLER_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /GPTBot/i, name: 'GPTBot' },
  { pattern: /OAI-SearchBot/i, name: 'OAI-SearchBot' },
  { pattern: /Claude-Web|ClaudeBot/i, name: 'ClaudeBot' },
  { pattern: /PerplexityBot/i, name: 'PerplexityBot' },
  { pattern: /Bytespider/i, name: 'Bytespider' },
  { pattern: /Googlebot/i, name: 'GoogleBot' },
  { pattern: /bingbot/i, name: 'BingBot' },
];

function detectCrawler(userAgent: string): string | null {
  for (const { pattern, name } of CRAWLER_PATTERNS) {
    if (pattern.test(userAgent)) return name;
  }
  return null;
}

function extractSaleId(path: string): string | null {
  const match = path.match(/^\/sales\/([^/?]+)/);
  if (!match) return null;
  const candidate = match[1];
  return candidate.startsWith('cm') && candidate.length > 10 ? candidate : null;
}

/**
 * POST /api/crawler-log
 *
 * Called by Vercel Next.js middleware on every bot request to a page path.
 * The SSR layer (getStaticProps / middleware) has access to the real request
 * user-agent; Express crawlerAnalyticsMiddleware never sees these because
 * Vercel serves ISR pages directly without proxying through Express.
 *
 * Body: { userAgent: string, path: string, ip: string }
 * Response: 202 immediately — DB write is fire-and-forget.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { userAgent, path, ip } = req.body as {
    userAgent?: string;
    path?: string;
    ip?: string;
  };

  if (!userAgent || !path) {
    res.status(400).json({ error: 'missing fields' });
    return;
  }

  const crawlerName = detectCrawler(userAgent);
  if (!crawlerName) {
    res.status(400).json({ error: 'not a known crawler' });
    return;
  }

  const saleId = extractSaleId(path);

  // Respond immediately — never make the SSR layer wait for DB
  res.status(202).json({ ok: true });

  prisma.crawlerVisit
    .create({
      data: {
        userAgent,
        crawlerName,
        path,
        saleId: saleId ?? null,
        ip: ip ?? null,
      },
    })
    .catch(() => {
      // Silently ignore DB errors — crawler analytics is non-critical
    });
});

export default router;
