import { prisma } from '../lib/prisma';

/**
 * Badge Service — handles Local Legend and OG Buyer badge awarding
 * Uses the Badge / UserBadge models for scoped (per-ZIP, per-sale) badges.
 *
 * Feature #399: Local Legend — shopper visits 3+ sales in same ZIP code
 * Feature #404: OG Buyer — first 100 purchasers at a given sale
 */

const LOCAL_LEGEND_THRESHOLD = 3;
const OG_BUYER_LIMIT = 100;

// ─── Local Legend ─────────────────────────────────────────────────────────────

/**
 * Returns the Badge record for a given ZIP, creating it if necessary.
 */
async function getOrCreateLocalLegendBadge(zip: string) {
  const name = `LOCAL_LEGEND_${zip}`;
  return prisma.badge.upsert({
    where: { name },
    update: {},
    create: {
      name,
      description: `Attended 3+ sales in ${zip}`,
      criteria: { type: 'LOCAL_LEGEND', zip, threshold: LOCAL_LEGEND_THRESHOLD },
    },
  });
}

/**
 * Called after a shopper checks in to a sale.
 * Counts how many distinct sales the shopper has checked in to that share the same ZIP.
 * If count >= 3 and they don't already have the badge for that ZIP, awards it.
 *
 * Returns the badge name if newly awarded, null otherwise.
 */
export async function checkAndAwardLocalLegend(
  userId: string,
  saleId: string
): Promise<string | null> {
  try {
    // Get the ZIP code for this sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { zip: true },
    });

    if (!sale?.zip) return null;

    const zip = sale.zip.trim();

    // Count how many distinct sales in this ZIP the shopper has checked in to
    // SaleCheckin has unique([saleId, userId]) so each sale counts once.
    const visitCount = await prisma.saleCheckin.count({
      where: {
        userId,
        sale: { zip },
      },
    });

    if (visitCount < LOCAL_LEGEND_THRESHOLD) return null;

    const badge = await getOrCreateLocalLegendBadge(zip);

    // Check if already awarded
    const existing = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId: badge.id } },
    });

    if (existing) return null;

    await prisma.userBadge.create({
      data: { userId, badgeId: badge.id },
    });

    console.log(`[badgeService] Local Legend awarded to user ${userId} for ZIP ${zip}`);
    return badge.name;
  } catch (err) {
    console.error('[badgeService] checkAndAwardLocalLegend error:', err);
    return null;
  }
}

/**
 * Returns all Local Legend badges earned by a user, with ZIP code extracted.
 */
export async function getUserLocalLegendBadges(
  userId: string
): Promise<Array<{ zip: string; awardedAt: Date }>> {
  try {
    const userBadges = await prisma.userBadge.findMany({
      where: {
        userId,
        badge: { name: { startsWith: 'LOCAL_LEGEND_' } },
      },
      include: { badge: true },
      orderBy: { awardedAt: 'asc' },
    });

    return userBadges.map((ub) => ({
      zip: (ub.badge.criteria as { zip: string }).zip,
      awardedAt: ub.awardedAt,
    }));
  } catch (err) {
    console.error('[badgeService] getUserLocalLegendBadges error:', err);
    return [];
  }
}

// ─── OG Buyer ─────────────────────────────────────────────────────────────────

/**
 * Returns the Badge record for OG Buyer at a given sale, creating it if necessary.
 */
async function getOrCreateOgBuyerBadge(saleId: string, saleTitle: string) {
  const name = `OG_BUYER_${saleId}`;
  return prisma.badge.upsert({
    where: { name },
    update: {},
    create: {
      name,
      description: `One of the first 100 buyers at "${saleTitle}"`,
      criteria: { type: 'OG_BUYER', saleId, limit: OG_BUYER_LIMIT },
    },
  });
}

/**
 * Called after a purchase is confirmed (payment_intent.succeeded).
 * Counts completed purchases for the sale. If this buyer is in the first 100,
 * awards OG Buyer badge.
 *
 * Returns the purchase rank (1-100) if awarded, null otherwise.
 */
export async function checkAndAwardOgBuyer(
  userId: string,
  saleId: string,
  purchaseId: string
): Promise<number | null> {
  try {
    // Count PAID purchases for this sale (including the current one)
    const purchaseCount = await prisma.purchase.count({
      where: {
        saleId,
        status: 'PAID',
        userId: { not: null }, // Only registered users get the badge
      },
    });

    if (purchaseCount > OG_BUYER_LIMIT) return null;

    // Fetch sale title for badge description
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { title: true },
    });

    if (!sale) return null;

    const badge = await getOrCreateOgBuyerBadge(saleId, sale.title);

    // Check if already awarded to this user for this sale
    const existing = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId: badge.id } },
    });

    if (existing) return null;

    await prisma.userBadge.create({
      data: { userId, badgeId: badge.id },
    });

    console.log(
      `[badgeService] OG Buyer #${purchaseCount} awarded to user ${userId} for sale ${saleId}`
    );
    return purchaseCount;
  } catch (err) {
    console.error('[badgeService] checkAndAwardOgBuyer error:', err);
    return null;
  }
}

/**
 * Returns all OG Buyer badges earned by a user, with sale info.
 */
export async function getUserOgBuyerBadges(
  userId: string
): Promise<Array<{ saleId: string; saleTitle: string; awardedAt: Date }>> {
  try {
    const userBadges = await prisma.userBadge.findMany({
      where: {
        userId,
        badge: { name: { startsWith: 'OG_BUYER_' } },
      },
      include: { badge: true },
      orderBy: { awardedAt: 'asc' },
    });

    return userBadges.map((ub) => {
      const criteria = ub.badge.criteria as { saleId: string };
      const rawDescription = ub.badge.description; // e.g. One of the first 100 buyers at "..."
      // Extract sale title from description (between first " and last ")
      const match = rawDescription.match(/"(.+)"/);
      return {
        saleId: criteria.saleId,
        saleTitle: match ? match[1] : 'this sale',
        awardedAt: ub.awardedAt,
      };
    });
  } catch (err) {
    console.error('[badgeService] getUserOgBuyerBadges error:', err);
    return [];
  }
}

/**
 * Returns the current OG Buyer count for a sale (for organizer dashboard).
 * Count = number of PAID purchases by registered users, capped display at 100.
 */
export async function getSaleOgBuyerCount(saleId: string): Promise<number> {
  try {
    return prisma.purchase.count({
      where: {
        saleId,
        status: 'PAID',
        userId: { not: null },
      },
    });
  } catch (err) {
    console.error('[badgeService] getSaleOgBuyerCount error:', err);
    return 0;
  }
}
