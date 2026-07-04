import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { RETAIL_JUNK_KEYWORDS } from '../routes/sales';

// ---------------------------------------------------------------------------
// #567 Hire-intent company directory
// Powers /companies/[city-slug] pages targeting "estate sale companies [city]"
// and "estate liquidation companies [city]" GSC queries.
//
// A "company" is an Organizer with at least one PUBLISHED, non-deleted ESTATE
// or AUCTION sale in the city and a real business name. RETAIL scraped rows
// are excluded entirely (S934 audit: ~55% junk). The S934 non-resale keyword
// blocklist (RETAIL_JUNK_KEYWORDS, exported from routes/sales.ts) is reused
// against business names as a final junk gate.
// Public data only: name, city, sale activity, website. No emails or phones.
// ---------------------------------------------------------------------------

// Sale types that qualify an organizer as a hireable estate sale company
const HIRE_SALE_TYPES = new Set(['ESTATE', 'AUCTION']);
// Sale types shown on company cards (RETAIL intentionally excluded)
const DISPLAY_SALE_TYPES = ['ESTATE', 'AUCTION', 'YARD', 'FLEA_MARKET'];
const MAX_COMPANIES = 50;
const MIN_COMPANIES_FOR_PAGE = 3;

// Keep in sync with the alias map in routes/sales.ts /by-city/:citySlug
const CITY_ALIASES: Record<string, string[]> = {
  'New York': ['New York City', 'NYC', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Manhattan'],
  'Los Angeles': ['LA', 'Los Angeles City'],
  'Chicago': ['Chicago City'],
};

function isJunkBusinessName(businessName: string): boolean {
  const lower = businessName.toLowerCase();
  return RETAIL_JUNK_KEYWORDS.some((kw: string) => lower.includes(kw));
}

function normalizeWebsite(website: string | null): string | null {
  if (!website) return null;
  const trimmed = website.trim();
  if (trimmed.length < 4 || !trimmed.includes('.')) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

interface CompanyAccumulator {
  id: string;
  businessName: string;
  website: string | null;
  avgRating: number | null;
  totalReviews: number;
  saleTypes: Set<string>;
  totalSaleCount: number;
  activeSaleCount: number;
}

// GET /companies/by-city/:citySlug
// Returns qualifying companies for a city slug like "denver-co".
export async function getCompaniesByCity(req: Request, res: Response) {
  try {
    const { citySlug } = req.params;

    if (!/^[a-z0-9-]+-[a-z]{2}$/.test(citySlug)) {
      return res.status(400).json({ error: 'Invalid city slug format' });
    }

    const parts = citySlug.split('-');
    const stateCode = parts[parts.length - 1].toUpperCase();
    const cityName = parts
      .slice(0, -1)
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const aliases = CITY_ALIASES[cityName] ?? [];
    const cityWhere =
      aliases.length > 0
        ? { in: [cityName, ...aliases], mode: 'insensitive' as const }
        : { equals: cityName, mode: 'insensitive' as const };

    const sales = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        saleType: { in: DISPLAY_SALE_TYPES },
        city: cityWhere,
        state: { equals: stateCode, mode: 'insensitive' },
      },
      select: {
        id: true,
        saleType: true,
        endDate: true,
        organizer: {
          select: {
            id: true,
            businessName: true,
            website: true,
            avgRating: true,
            totalReviews: true,
          },
        },
      },
    });

    const now = new Date();
    const byOrganizer = new Map<string, CompanyAccumulator>();

    for (const sale of sales) {
      const org = sale.organizer;
      if (!org) continue;
      const name = (org.businessName ?? '').trim();
      if (name.length <= 2) continue;
      if (isJunkBusinessName(name)) continue;

      let acc = byOrganizer.get(org.id);
      if (!acc) {
        acc = {
          id: org.id,
          businessName: name,
          website: normalizeWebsite(org.website),
          avgRating: org.avgRating ?? null,
          totalReviews: org.totalReviews ?? 0,
          saleTypes: new Set<string>(),
          totalSaleCount: 0,
          activeSaleCount: 0,
        };
        byOrganizer.set(org.id, acc);
      }
      acc.saleTypes.add(sale.saleType);
      acc.totalSaleCount += 1;
      if (sale.endDate >= now) acc.activeSaleCount += 1;
    }

    const companies = Array.from(byOrganizer.values())
      // Hire-intent gate: must run at least one estate sale or auction here
      .filter((c) => Array.from(c.saleTypes).some((t) => HIRE_SALE_TYPES.has(t)))
      .sort(
        (a, b) =>
          b.activeSaleCount - a.activeSaleCount ||
          b.totalSaleCount - a.totalSaleCount ||
          a.businessName.localeCompare(b.businessName)
      )
      .slice(0, MAX_COMPANIES)
      .map((c) => ({
        id: c.id,
        businessName: c.businessName,
        website: c.website,
        avgRating: c.avgRating,
        totalReviews: c.totalReviews,
        saleTypes: Array.from(c.saleTypes),
        totalSaleCount: c.totalSaleCount,
        activeSaleCount: c.activeSaleCount,
      }));

    return res.json({
      city: cityName,
      state: stateCode,
      slug: citySlug,
      companies,
      totalCount: companies.length,
      minCompaniesForPage: MIN_COMPANIES_FOR_PAGE,
    });
  } catch (err) {
    console.error('[companies/by-city] error:', err);
    return res.status(500).json({ error: 'Failed to fetch companies' });
  }
}

// GET /companies/city-slugs
// City slugs with >= 3 qualifying companies, for sitemaps and getStaticPaths.
// Mirrors the gate above at the SQL level (junk-keyword filter applies at
// render time, so counts here are an upper bound; the page itself re-gates).
export async function getCompanyCitySlugs(req: Request, res: Response) {
  try {
    const rows = await prisma.$queryRaw<
      Array<{ slug: string; city: string; state: string; count: bigint }>
    >`
      SELECT
        LOWER(REPLACE(s.city, ' ', '-')) || '-' || LOWER(s.state) AS slug,
        s.city,
        s.state,
        COUNT(DISTINCT s."organizerId") AS count
      FROM "Sale" s
      JOIN "Organizer" o ON o.id = s."organizerId"
      WHERE s.status = 'PUBLISHED'
        AND s."deletedAt" IS NULL
        AND s."saleType" IN ('ESTATE', 'AUCTION')
        AND s.city IS NOT NULL
        AND s.state IS NOT NULL
        AND length(trim(o."businessName")) > 2
      GROUP BY s.city, s.state
      HAVING COUNT(DISTINCT s."organizerId") >= 3
      ORDER BY count DESC
      LIMIT 200
    `;

    const slugs = rows.map((r) => ({
      slug: r.slug.replace(/\./g, ''),
      city: r.city,
      state: r.state,
      companyCount: Number(r.count),
    }));

    return res.json({ slugs, total: slugs.length });
  } catch (err) {
    console.error('[companies/city-slugs] error:', err);
    return res.status(500).json({ error: 'Failed to fetch company city slugs' });
  }
}
