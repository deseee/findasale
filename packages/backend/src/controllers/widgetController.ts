import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const BASE_URL = 'https://finda.sale';

/**
 * GET /api/widget/inventory
 * Public, unauthenticated endpoint.
 * Returns whitelisted inventory data for the embeddable organizer widget.
 *
 * Query params:
 *   organizer (required) — CUID or customStorefrontSlug
 *   limit     (optional) — default 24, max 48
 *   category  (optional) — filter by category string
 *   status    (optional) — default AVAILABLE
 */
export async function getWidgetInventory(req: Request, res: Response): Promise<void> {
  const { organizer: organizerParam, limit: limitParam, category, status } = req.query;

  if (!organizerParam || typeof organizerParam !== 'string') {
    res.status(400).json({ error: 'organizer query param is required' });
    return;
  }

  const rawLimit = parseInt((limitParam as string) || '24', 10);
  const limit = isNaN(rawLimit) ? 24 : Math.min(Math.max(rawLimit, 1), 48);
  const itemStatus = typeof status === 'string' ? status : 'AVAILABLE';

  // Resolve organizer — try CUID first, then customStorefrontSlug
  let organizerRecord: {
    id: string;
    customStorefrontSlug: string | null;
    businessName: string;
    profilePhoto: string | null;
    verificationStatus: string;
  } | null = null;

  // cuid() output starts with 'c' and is ~25 chars — use a loose heuristic
  const looksLikeCuid = /^c[a-z0-9]{20,30}$/.test(organizerParam);

  if (looksLikeCuid) {
    organizerRecord = await prisma.organizer.findUnique({
      where: { id: organizerParam },
      select: {
        id: true,
        customStorefrontSlug: true,
        businessName: true,
        profilePhoto: true,
        verificationStatus: true,
      },
    });
  }

  // Fallback: treat param as customStorefrontSlug
  if (!organizerRecord) {
    organizerRecord = await prisma.organizer.findUnique({
      where: { customStorefrontSlug: organizerParam },
      select: {
        id: true,
        customStorefrontSlug: true,
        businessName: true,
        profilePhoto: true,
        verificationStatus: true,
      },
    });
  }

  // 404 for both unknown ID and unknown slug — no info leakage
  if (!organizerRecord) {
    res.status(404).json({ error: 'Organizer not found' });
    return;
  }

  // Get all PUBLISHED active sales for this organizer
  const activeSales = await prisma.sale.findMany({
    where: {
      organizerId: organizerRecord.id,
      status: 'PUBLISHED',
    },
    select: { id: true, title: true },
  });

  const saleIds = activeSales.map((s) => s.id);
  const saleTitleMap: Record<string, string> = {};
  for (const s of activeSales) {
    saleTitleMap[s.id] = s.title ?? '';
  }

  if (saleIds.length === 0) {
    res.json({
      organizer: {
        id: organizerRecord.id,
        slug: organizerRecord.customStorefrontSlug,
        businessName: organizerRecord.businessName,
        profilePhoto: organizerRecord.profilePhoto,
        verificationStatus: organizerRecord.verificationStatus,
      },
      items: [],
      total: 0,
      limit,
      hasMore: false,
    });
    return;
  }

  // Build item where clause
  const itemWhere: Parameters<typeof prisma.item.findMany>[0]['where'] = {
    saleId: { in: saleIds },
    isActive: true,
    draftStatus: 'PUBLISHED',
    status: itemStatus,
  };

  if (category && typeof category === 'string') {
    itemWhere.category = category;
  }

  // Fetch limit + 1 to detect hasMore
  const rawItems = await prisma.item.findMany({
    where: itemWhere,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      title: true,
      price: true,
      status: true,
      category: true,
      condition: true,
      photoUrls: true,
      saleId: true,
      tags: true,
    },
  });

  const hasMore = rawItems.length > limit;
  const items = rawItems.slice(0, limit);

  const responseItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    price: item.price,
    status: item.status,
    category: item.category,
    condition: item.condition,
    photoUrl: item.photoUrls[0] ?? null,
    saleTitle: item.saleId ? (saleTitleMap[item.saleId] ?? '') : '',
    saleId: item.saleId,
    detailUrl: item.saleId
      ? `${BASE_URL}/sales/${item.saleId}/items/${item.id}`
      : `${BASE_URL}/items/${item.id}`,
    tags: item.tags,
  }));

  res.json({
    organizer: {
      id: organizerRecord.id,
      slug: organizerRecord.customStorefrontSlug,
      businessName: organizerRecord.businessName,
      profilePhoto: organizerRecord.profilePhoto,
      verificationStatus: organizerRecord.verificationStatus,
    },
    items: responseItems,
    total: responseItems.length,
    limit,
    hasMore,
  });
}
