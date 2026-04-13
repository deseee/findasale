import { prisma } from '../lib/prisma';
import crypto from 'crypto';

interface ClickParams {
  saleId: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  ipAddress?: string;
}

export async function recordClick(params: ClickParams): Promise<void> {
  const { saleId, utmSource, utmMedium, utmCampaign, utmContent, ipAddress } = params;

  // Hash IP for deduplication (salt optional but no secrets here)
  const ipHash = ipAddress
    ? crypto
        .createHash('sha256')
        .update(ipAddress + 'findasale-salt')
        .digest('hex')
        .slice(0, 16)
    : null;

  await prisma.linkClick.create({
    data: {
      saleId,
      utmSource: utmSource || null,
      utmMedium: utmMedium || null,
      utmCampaign: utmCampaign || null,
      utmContent: utmContent || null,
      ipHash,
    },
  });
}

export interface ClickStats {
  totalClicks: number;
  clicksByDay: Array<{ date: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
}

export async function getClickStats(saleId: string): Promise<ClickStats> {
  // Total clicks
  const totalClicks = await prisma.linkClick.count({
    where: { saleId },
  });

  // Last 7 days of clicks
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const clicksByDay: Array<{ date: string; count: number }> = [];
  const rawData = await prisma.linkClick.groupBy({
    by: ['clickedAt'],
    where: {
      saleId,
      clickedAt: { gte: sevenDaysAgo },
    },
    _count: true,
  });

  // Group by date (not timestamp) and aggregate
  const dayMap = new Map<string, number>();
  rawData.forEach((row) => {
    const dateStr = row.clickedAt.toISOString().split('T')[0]; // YYYY-MM-DD
    dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + row._count);
  });

  // Fill missing days with 0
  for (let i = 0; i < 7; i++) {
    const date = new Date(sevenDaysAgo);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    clicksByDay.push({ date: dateStr, count: dayMap.get(dateStr) || 0 });
  }

  // Top 5 sources
  const topSources: Array<{ source: string; count: number }> = [];
  const sourceData = await prisma.linkClick.groupBy({
    by: ['utmSource'],
    where: { saleId },
    _count: true,
    orderBy: { _count: { utmSource: 'desc' } },
    take: 5,
  });

  sourceData.forEach((row) => {
    topSources.push({
      source: row.utmSource || '(unknown)',
      count: row._count,
    });
  });

  return { totalClicks, clicksByDay, topSources };
}
