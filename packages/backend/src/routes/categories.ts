import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/categories/:slug/top-finds
router.get('/:slug/top-finds', async (req, res) => {
  const { slug } = req.params;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid category slug' });
  }
  try {
    const finds = await prisma.categoryTopFinds.findMany({
      where: { categorySlug: slug },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    const lastUpdated = finds[0]?.updatedAt?.toISOString() ?? null;
    return res.json({
      slug,
      finds: finds.map(f => ({
        ...f,
        listingPrice: Number(f.listingPrice),
      })),
      count: finds.length,
      lastUpdated,
    });
  } catch (err) {
    console.error('[categories] top-finds error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
