import { Request, Response } from 'express';
import { getClientIp } from '../lib/ipUtils';
import { recordClick, getClickStats } from '../services/linkClickService';
import { AuthRequest } from '../middleware/auth';

/**
 * GET /api/link-clicks/record?saleId=xxx&utm_source=yyy&utm_medium=zzz&utm_campaign=aaa&utm_content=bbb
 * Public endpoint (no auth required) — fire-and-forget pixel call
 * Client calls on page load if referred via UTM
 */
export async function recordClickHandler(req: Request, res: Response): Promise<void> {
  try {
    const { saleId, utm_source, utm_medium, utm_campaign, utm_content } = req.query;

    if (!saleId || typeof saleId !== 'string') {
      res.status(400).json({ error: 'saleId required' });
      return;
    }

    const ipAddress = getClientIp(req);

    // Fire and forget — don't wait, respond immediately
    recordClick({
      saleId,
      utmSource: utm_source as string | undefined,
      utmMedium: utm_medium as string | undefined,
      utmCampaign: utm_campaign as string | undefined,
      utmContent: utm_content as string | undefined,
      ipAddress,
    }).catch((err) => console.error('Error recording click:', err));

    // Always respond 200 (pixel style)
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('recordClickHandler error:', err);
    res.status(200).json({ success: true }); // Silently fail on pixel endpoint
  }
}

/**
 * GET /api/link-clicks/stats/:saleId
 * Protected (organizer auth) + PRO tier gated
 * Returns click analytics for a specific sale
 */
export async function getStatsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { saleId } = req.params;

    if (!saleId) {
      res.status(400).json({ error: 'saleId required' });
      return;
    }

    const stats = await getClickStats(saleId);

    res.status(200).json({
      success: true,
      saleId,
      stats,
    });
  } catch (err) {
    console.error('getStatsHandler error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
