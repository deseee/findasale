import { GetServerSideProps } from 'next';

interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  // Static pages
  const staticPages: SitemapEntry[] = [
    { url: '/', changefreq: 'yearly', priority: 1.0 },
    { url: '/map', changefreq: 'daily', priority: 0.8 },
    { url: '/trending', changefreq: 'daily', priority: 0.8 },
    { url: '/search', changefreq: 'yearly', priority: 0.7 },
    { url: '/pricing', changefreq: 'yearly', priority: 0.7 },
    { url: '/about', changefreq: 'yearly', priority: 0.5 },
    { url: '/faq', changefreq: 'yearly', priority: 0.5 },
    { url: '/leaderboard', changefreq: 'weekly', priority: 0.6 },
    { url: '/contact', changefreq: 'yearly', priority: 0.5 },
    { url: '/support', changefreq: 'yearly', priority: 0.5 },
  ];

  let entries: SitemapEntry[] = [...staticPages];

  try {
    const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error('API URL not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      // Fetch published sales — use status PUBLISHED, not isPublished (field doesn't exist)
      const salesRes = await fetch(`${apiUrl}/search/public?type=sales&limit=50000`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (salesRes.ok) {
        const salesData = await salesRes.json();
        const sales = Array.isArray(salesData) ? salesData : salesData.sales || [];

        sales.forEach((sale: any) => {
          if (sale.id && sale.status === 'PUBLISHED') {
            entries.push({
              url: `/sales/${sale.id}`,
              lastmod: sale.updatedAt ? new Date(sale.updatedAt).toISOString().split('T')[0] : undefined,
              changefreq: 'daily',
              priority: 0.8,
            });
          }
        });
      }
    } catch (err) {
      console.warn('[sitemap] Failed to fetch sales:', err);
    }

    try {
      // Fetch available items
      const itemsRes = await fetch(`${apiUrl}/items/search?status=AVAILABLE,SOLD&limit=50000`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        const items = Array.isArray(itemsData) ? itemsData : itemsData.items || [];

        items.forEach((item: any) => {
          if (item.id && item.saleId) {
            entries.push({
              url: `/sales/${item.saleId}/items/${item.id}`,
              lastmod: item.updatedAt ? new Date(item.updatedAt).toISOString().split('T')[0] : undefined,
              changefreq: 'weekly',
              priority: 0.8,
            });
          }
        });
      }
    } catch (err) {
      console.warn('[sitemap] Failed to fetch items:', err);
    }

    try {
      // Fetch claimed organizers with storefronts
      const orgRes = await fetch(`${apiUrl}/organizers?claimed=true&limit=10000`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (orgRes.ok) {
        const orgData = await orgRes.json();
        const organizers = Array.isArray(orgData) ? orgData : orgData.organizers || [];

        organizers.forEach((org: any) => {
          if (org.customStorefrontSlug) {
            entries.push({
              url: `/organizer/${org.customStorefrontSlug}`,
              lastmod: org.updatedAt ? new Date(org.updatedAt).toISOString().split('T')[0] : undefined,
              changefreq: 'weekly',
              priority: 0.7,
            });
          }
        });
      }
    } catch (err) {
      console.warn('[sitemap] Failed to fetch organizers:', err);
    }

    // City pages will be added here once city-slugs.ts is available in Phase 1.2
    // For now, leave a placeholder
    // TODO: Add city pages from city-slugs.ts after Phase 1.2 merges
  } catch (err) {
    console.error('[sitemap] Error building sitemap:', err);
    // Fail open — return static pages only
  }

  // Limit to 50K URLs (Google limit)
  if (entries.length > 50000) {
    entries = entries.slice(0, 50000);
  }

  // Generate XML
  const baseUrl = 'https://finda.sale';
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(entry => `  <url>
    <loc>${baseUrl}${entry.url}</loc>${
      entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''
    }${
      entry.changefreq ? `\n    <changefreq>${entry.changefreq}</changefreq>` : ''
    }${
      entry.priority !== undefined ? `\n    <priority>${entry.priority}</priority>` : ''
    }
  </url>`).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.write(xmlContent);
  res.end();

  return {
    props: {},
  };
};

// Dummy component — not rendered (getServerSideProps handles response)
export default function Sitemap() {
  return null;
}
