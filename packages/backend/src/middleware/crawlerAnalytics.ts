import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { emailService } from '../lib/emailService';

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

// Only log visits to legitimate page prefixes — drop attack probes and API calls
const ALLOWED_PATH_PREFIXES = ['/sales/', '/city/', '/this-weekend/', '/organizers/'];

function isAllowedPath(path: string): boolean {
  return ALLOWED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function extractSaleId(path: string): string | null {
  const match = path.match(/^\/sales\/([^/?]+)/);
  if (!match) return null;
  const candidate = match[1];
  // Only accept CUID-shaped IDs (starts with 'cm', length > 10) to filter junk
  return candidate.startsWith('cm') && candidate.length > 10 ? candidate : null;
}

async function sendFirstCrawlNotification(saleId: string): Promise<void> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: {
          include: { user: { select: { email: true, name: true } } },
        },
      },
    });
    const email = sale?.organizer?.user?.email;
    if (!sale || !email) return;

    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
    const saleUrl = 'https://finda.sale/sales/' + saleId;
    const saleTitle = sale.title || 'Your sale';
    const recipientName = sale.organizer.user?.name ?? 'there';

    await emailService.emails.send({
      from: 'FindA.Sale <' + fromEmail + '>',
      to: email,
      subject: 'Your listing was found by search engines',
      html:
        '<p>Hi ' + recipientName + ',</p>' +
        '<p>Your sale <strong>' + saleTitle + '</strong> on FindA.Sale was just discovered by a search engine.</p>' +
        '<p>This means it may start appearing in search results — including smart search assistants that help shoppers find local sales.</p>' +
        '<p>To rank higher in results, make sure your listing has:</p>' +
        '<ul>' +
        '<li>Clear, descriptive photos</li>' +
        '<li>A detailed description</li>' +
        '<li>Accurate dates and location</li>' +
        '</ul>' +
        '<p><a href="' + saleUrl + '">View your listing &rarr;</a></p>' +
        '<p>&mdash; The FindA.Sale Team</p>',
    });
  } catch (err) {
    // Never let email failures surface — log only
    console.error('[crawlerAnalytics] First-crawl notification failed:', err);
  }
}

export function crawlerAnalyticsMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const userAgent = req.headers['user-agent'] || '';
  const crawlerName = detectCrawler(userAgent);

  if (crawlerName) {
    const path = req.path;

    // Drop attack probes (/.env, /.git, /api/*, etc.) and non-page visits
    if (!isAllowedPath(path)) {
      next();
      return;
    }

    const saleId = extractSaleId(path);
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;

    // Fire-and-forget — never block request
    prisma.crawlerVisit.create({
      data: { userAgent, crawlerName, path, saleId, ip },
    }).then(() => {
      // Check if this is the first ever crawler visit for this sale — if so, notify the organizer
      if (saleId) {
        prisma.crawlerVisit.count({ where: { saleId } }).then((count) => {
          if (count === 1) {
            sendFirstCrawlNotification(saleId).catch(() => {});
          }
        }).catch(() => {});
      }
    }).catch(() => {}); // silently ignore DB errors
  }

  next();
}
