import { getServerSideSitemapLegacy as getServerSideSitemap } from 'next-sitemap';
import api from '../lib/api';

export async function getServerSideProps(ctx: any) {
  try {
    const baseUrl = process.env.SITE_URL || 'https://finda.sale';

    // Fetch all sales and tags to generate URLs
    const salesResponse = await api.get('/sales');
    const sales = salesResponse.data.sales || salesResponse.data;

    const tagsResponse = await api.get('/tags/popular');
    const tags = tagsResponse.data.tags || [];

    // Extract unique cities and zips for landing pages
    const cities = Array.from(new Set<string>(sales.map((sale: any) =>
      sale.city.toLowerCase().replace(/\s+/g, '-')
    )));
    const zips = Array.from(new Set<string>(
      sales.map((sale: any) => sale.zip).filter(Boolean)
    ));

    // Extract unique neighborhoods from sales
    const neighborhoods = Array.from(new Set<string>(
      sales
        .map((sale: any) => sale.neighborhood)
        .filter(Boolean)
        .map((n: string) => n.toLowerCase().replace(/\s+/g, '-'))
    ));

    // Generate priority discovery pages
    const discoveryPages = [
      { path: '/', priority: 1.0, changefreq: 'daily' },
      { path: '/map', priority: 0.9, changefreq: 'daily' },
      { path: '/trending', priority: 0.8, changefreq: 'daily' },
      { path: '/search', priority: 0.8, changefreq: 'daily' },
      { path: '/cities', priority: 0.8, changefreq: 'weekly' },
      { path: '/categories', priority: 0.8, changefreq: 'weekly' },
      { path: '/encyclopedia', priority: 0.7, changefreq: 'weekly' },
      { path: '/city-heat-index', priority: 0.7, changefreq: 'weekly' },
      { path: '/about', priority: 0.6, changefreq: 'monthly' },
      { path: '/contact', priority: 0.5, changefreq: 'monthly' },
      { path: '/faq', priority: 0.5, changefreq: 'monthly' },
      { path: '/leaderboard', priority: 0.6, changefreq: 'weekly' },
      { path: '/pricing', priority: 0.7, changefreq: 'monthly' },
      { path: '/terms', priority: 0.4, changefreq: 'monthly' },
      { path: '/privacy', priority: 0.4, changefreq: 'monthly' },
      { path: '/support', priority: 0.5, changefreq: 'monthly' },
    ];

    const staticUrls = discoveryPages.map((page) => ({
      loc: `${baseUrl}${page.path}`,
      lastmod: new Date().toISOString(),
      changefreq: page.changefreq,
      priority: page.priority,
    }));

    // Generate sale URLs (only active/upcoming sales for SEO)
    const saleUrls = Array.isArray(sales)
      ? sales
          .filter((sale: any) => sale.status === 'ACTIVE' || sale.status === 'UPCOMING')
          .map((sale: any) => ({
            loc: `${baseUrl}/sales/${sale.id}`,
            lastmod: sale.updatedAt
              ? new Date(sale.updatedAt).toISOString()
              : sale.createdAt
              ? new Date(sale.createdAt).toISOString()
              : new Date().toISOString(),
            changefreq: 'hourly',
            priority: 0.9,
          }))
      : [];

    // Fetch organizer profile pages for sitemap
    let organizerUrls: any[] = [];
    try {
      const organizersResponse = await api.get('/leaderboard/organizers');
      const organizers = organizersResponse.data.leaderboard || organizersResponse.data || [];
      organizerUrls = organizers
        .filter((org: any) => org.organizerId)
        .map((org: any) => ({
          loc: `${baseUrl}/organizers/${org.organizerId}`,
          lastmod: new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.7,
        }));
    } catch {
      // Endpoint may fail gracefully — organizer URLs are optional
    }

    // Fetch canonical city slugs (e.g. "grand-rapids-mi") from dedicated endpoint.
    // Falls back to empty array if the endpoint isn't available yet.
    let canonicalCitySlugs: string[] = [];
    try {
      const citySlugsResponse = await api.get('/sales/city-slugs');
      const raw = citySlugsResponse.data.slugs || citySlugsResponse.data || [];
      canonicalCitySlugs = raw.map((item: any) => typeof item === 'string' ? item : item.slug).filter(Boolean);
    } catch {
      // Endpoint may not exist yet — skip canonical city+category URLs gracefully
    }

    const SALE_CATEGORIES = [
      'estate-sales',
      'yard-sales',
      'auctions',
      'flea-markets',
      'consignment',
    ];

    // City+category URLs from canonical slugs (proper city-state format)
    const cityCategoryUrls: any[] = [];
    for (const slug of canonicalCitySlugs) {
      cityCategoryUrls.push({
        loc: `${baseUrl}/city/${slug}`,
        lastmod: new Date().toISOString(),
        changefreq: 'daily',
        priority: 0.8,
      });
      for (const category of SALE_CATEGORIES) {
        cityCategoryUrls.push({
          loc: `${baseUrl}/city/${slug}/${category}`,
          lastmod: new Date().toISOString(),
          changefreq: 'daily',
          priority: 0.7,
        });
      }
    }

    // /this-weekend/{city-slug} — high-intent "this weekend" discovery pages
    const thisWeekendUrls = canonicalCitySlugs.map((slug: string) => ({
      loc: `${baseUrl}/this-weekend/${slug}`,
      lastmod: new Date().toISOString(),
      changefreq: 'daily',
      priority: 0.8,
    }));

    // Generate neighborhood URLs
    const neighborhoodUrls = neighborhoods.map((neighborhood: string) => ({
      loc: `${baseUrl}/neighborhoods/${neighborhood}`,
      lastmod: new Date().toISOString(),
      changefreq: 'daily',
      priority: 0.7,
    }));

    // Generate zip URLs
    const zipUrls = zips.map((zip: string) => ({
      loc: `${baseUrl}/sales/zip/${zip}`,
      lastmod: new Date().toISOString(),
      changefreq: 'daily',
      priority: 0.6,
    }));

    // Generate tag/category URLs
    const tagUrls = tags.map((tag: any) => ({
      loc: `${baseUrl}/tags/${tag.slug}`,
      lastmod: new Date().toISOString(),
      changefreq: 'weekly',
      priority: 0.7,
    }));

    // Generate guide URLs (ADR-075 SEO Content Moat)
    let guideUrls: any[] = [];
    try {
      const slugs = require('../data/seo-pages/slugs.json') as string[];
      guideUrls = slugs.map((slug: string) => ({
        loc: `${baseUrl}/guide/${slug}`,
        lastmod: '2026-05-01',
        changefreq: 'weekly',
        priority: 0.7,
      }));
    } catch (err) {
      console.error('[sitemap] Could not load guide slugs:', err);
    }

    // Category pages (hardcoded item categories)
    const ITEM_CATEGORIES = [
      'furniture', 'clothing', 'electronics', 'books', 'antiques',
      'tools', 'kitchen', 'art', 'jewelry', 'other',
    ];
    const categoryUrls = ITEM_CATEGORIES.map((cat) => ({
      loc: `${baseUrl}/categories/${cat}`,
      lastmod: new Date().toISOString(),
      changefreq: 'daily',
      priority: 0.8,
    }));

    // Encyclopedia entries
    let encyclopediaUrls: any[] = [];
    try {
      const encyclopediaResponse = await api.get('/encyclopedia/entries');
      const entries = encyclopediaResponse.data.entries || encyclopediaResponse.data || [];
      encyclopediaUrls = entries
        .filter((entry: any) => entry.slug)
        .map((entry: any) => ({
          loc: `${baseUrl}/encyclopedia/${entry.slug}`,
          lastmod: new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.7,
        }));
    } catch {
      // Graceful fallback — encyclopedia URLs are optional
    }

    // Individual item pages
    let itemUrls: any[] = [];
    try {
      const itemsResponse = await api.get('/items/sitemap');
      const items = itemsResponse.data.items || itemsResponse.data || [];
      itemUrls = items.map((item: any) => ({
        loc: `${baseUrl}/items/${item.id}`,
        lastmod: item.updatedAt ? new Date(item.updatedAt).toISOString() : new Date().toISOString(),
        changefreq: 'daily',
        priority: 0.8,
      }));
    } catch {
      // Graceful fallback — item URLs are optional
    }

    // Combine all URL sets
    const fields = [
      ...staticUrls,
      ...saleUrls,
      ...organizerUrls,
      ...cityCategoryUrls,
      ...thisWeekendUrls,
      ...neighborhoodUrls,
      ...zipUrls,
      ...tagUrls,
      ...guideUrls,
      ...categoryUrls,
      ...encyclopediaUrls,
      ...itemUrls,
    ];

    return getServerSideSitemap(ctx, fields);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    // Return empty sitemap if there's an error
    return getServerSideSitemap(ctx, []);
  }
}

// Default export to prevent next.js errors
export default function Sitemap() {}