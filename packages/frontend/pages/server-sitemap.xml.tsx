import { getServerSideSitemapLegacy as getServerSideSitemap } from 'next-sitemap';
import api from '../lib/api';
import { posts as blogPosts } from '../data/blog/index';

export async function getServerSideProps(ctx: any) {
  try {
    const baseUrl = process.env.SITE_URL || 'https://finda.sale';

    // STATIC_LASTMOD: stable date for pages whose content doesn't change every request.
    // Google June 2024 policy: always-"now" lastmod is treated as inaccurate and ignored sitewide.
    // Bump this string only when the template/structure of static/city/category pages meaningfully changes.
    const STATIC_LASTMOD = '2026-06-22';

    // Fetch all sales and tags to generate URLs
    const salesResponse = await api.get('/sales/sitemap');
    const sales = salesResponse.data.sales || salesResponse.data;

    const tagsResponse = await api.get('/tags/popular');
    const tags = tagsResponse.data.tags || [];

    // Note: /sales/sitemap returns only id+updatedAt for performance.
    // City slugs come from the dedicated /sales/city-slugs endpoint below.
    // Zip and neighborhood URLs derived from sales are intentionally empty here
    // (those were never the canonical source anyway).
    const cities: string[] = [];
    const zips: string[] = [];
    const neighborhoods: string[] = [];

    // Generate priority discovery pages
    const discoveryPages = [
      { path: '/', priority: 1.0, changefreq: 'daily' },
      { path: '/map', priority: 0.9, changefreq: 'daily' },
      { path: '/trending', priority: 0.8, changefreq: 'daily' },
      { path: '/search', priority: 0.8, changefreq: 'daily' },
      { path: '/cities', priority: 0.8, changefreq: 'weekly' },
      { path: '/categories', priority: 0.8, changefreq: 'weekly' },
      { path: '/encyclopedia', priority: 0.7, changefreq: 'weekly' },
      { path: '/about', priority: 0.6, changefreq: 'monthly' },
      { path: '/contact', priority: 0.5, changefreq: 'monthly' },
      { path: '/faq', priority: 0.5, changefreq: 'monthly' },
      { path: '/leaderboard', priority: 0.6, changefreq: 'weekly' },
      { path: '/blog', priority: 0.7, changefreq: 'daily' },
      { path: '/pricing', priority: 0.7, changefreq: 'monthly' },
      { path: '/terms', priority: 0.4, changefreq: 'monthly' },
      { path: '/privacy', priority: 0.4, changefreq: 'monthly' },
      { path: '/support', priority: 0.5, changefreq: 'monthly' },
    ];

    const staticUrls = discoveryPages.map((page) => ({
      loc: `${baseUrl}${page.path}`,
      lastmod: STATIC_LASTMOD,
      changefreq: page.changefreq,
      priority: page.priority,
    }));

    // Generate sale URLs (only published sales for SEO)
    // /sales/sitemap pre-filters to PUBLISHED in SQL and returns only { id, updatedAt }.
    // There is NO `status` field on the response — filtering on it here silently excluded
    // all 5,000 published sales (root cause: 0 sale URLs in sitemap). Do not re-add the filter.
    const saleUrls = Array.isArray(sales)
      ? sales.map((sale: any) => ({
          loc: `${baseUrl}/sales/${sale.id}`,
          lastmod: sale.updatedAt
            ? new Date(sale.updatedAt).toISOString()
            : new Date().toISOString(),
          changefreq: 'daily',
          priority: 0.8,
        }))
      : [];

    // S1071 policy: /organizers/[id] profile stubs REMOVED from the sitemap.
    // They were the single largest GSC crawled-not-indexed class (~60 of 226) —
    // thin leaderboard-derived pages. Do not re-add without board sign-off.

    // Fetch canonical city slugs (e.g. "grand-rapids-mi") + per-type ACTIVE sale counts.
    // S1071 crawl-budget policy: bare /city/[slug] hubs are ALWAYS included (all 200), but
    // every city×type variant (/city/[slug]/[category], /this-weekend/, /estate-sales/,
    // /yard-sales/, /auctions/, /flea-markets/) is emitted ONLY when that city has >= 3
    // ACTIVE sales of the relevant type (this-weekend gate: >= 3 active of ANY type).
    // Rationale: 200 cities × 11 variants = 2,200 mostly-empty URLs were the dominant
    // GSC discovered-never-crawled class. Do not re-emit ungated variants.
    type CityRow = { slug: string; activeCount: number; activeByType: Record<string, number> };
    let cityRows: CityRow[] = [];
    try {
      const citySlugsResponse = await api.get('/sales/city-slugs');
      const raw = citySlugsResponse.data.slugs || citySlugsResponse.data || [];
      cityRows = raw
        .map((item: any) =>
          typeof item === 'string'
            ? { slug: item, activeCount: 0, activeByType: {} }
            : {
                slug: item.slug,
                activeCount: Number(item.activeCount) || 0,
                activeByType: item.activeByType || {},
              }
        )
        .filter((row: CityRow) => Boolean(row.slug));
    } catch {
      // Endpoint may not exist yet — skip city URLs gracefully
    }

    const MIN_ACTIVE_SALES_FOR_TYPE_PAGE = 3;
    // Category slug → Sale.saleType enum (must match backend /sales/by-city categoryMap)
    const SALE_CATEGORY_TYPE_MAP: Record<string, string> = {
      'estate-sales': 'ESTATE',
      'yard-sales': 'YARD',
      'auctions': 'AUCTION',
      'flea-markets': 'FLEA_MARKET',
      'consignment': 'RETAIL',
    };
    const hasActiveOfType = (row: CityRow, saleType: string): boolean =>
      (Number(row.activeByType?.[saleType]) || 0) >= MIN_ACTIVE_SALES_FOR_TYPE_PAGE;

    // Bare city hubs (all) + gated city+category URLs
    const cityCategoryUrls: any[] = [];
    for (const row of cityRows) {
      cityCategoryUrls.push({
        loc: `${baseUrl}/city/${row.slug}`,
        lastmod: STATIC_LASTMOD,
        changefreq: 'daily',
        priority: 0.75, // lowered from 0.8 — preserve crawl budget for core nav pages
      });
      for (const [category, saleType] of Object.entries(SALE_CATEGORY_TYPE_MAP)) {
        if (!hasActiveOfType(row, saleType)) continue;
        cityCategoryUrls.push({
          loc: `${baseUrl}/city/${row.slug}/${category}`,
          lastmod: STATIC_LASTMOD,
          changefreq: 'daily',
          priority: 0.7,
        });
      }
    }

    // /this-weekend/{city-slug} — gated on >= 3 active sales of ANY type
    const thisWeekendUrls = cityRows
      .filter((row) => row.activeCount >= MIN_ACTIVE_SALES_FOR_TYPE_PAGE)
      .map((row) => ({
        loc: `${baseUrl}/this-weekend/${row.slug}`,
        lastmod: STATIC_LASTMOD,
        changefreq: 'daily',
        priority: 0.7, // lowered from 0.8 — reduce crawl budget drain on GEO variants
      }));

    // /estate-sales/{city-slug} — gated on >= 3 active ESTATE sales (SEO3)
    const estateSalesUrls = cityRows
      .filter((row) => hasActiveOfType(row, 'ESTATE'))
      .map((row) => ({
        loc: `${baseUrl}/estate-sales/${row.slug}`,
        lastmod: STATIC_LASTMOD,
        changefreq: 'daily',
        priority: 0.75, // lower from 0.85 — was outcompeting core nav pages for crawl budget
      }));

    // /yard-sales/{city-slug} — gated on >= 3 active YARD sales
    const yardSalesUrls = cityRows
      .filter((row) => hasActiveOfType(row, 'YARD'))
      .map((row) => ({
        loc: `${baseUrl}/yard-sales/${row.slug}`,
        lastmod: STATIC_LASTMOD,
        changefreq: 'daily',
        priority: 0.70,
      }));

    // /auctions/{city-slug} — gated on >= 3 active AUCTION sales
    const auctionsUrls = cityRows
      .filter((row) => hasActiveOfType(row, 'AUCTION'))
      .map((row) => ({
        loc: `${baseUrl}/auctions/${row.slug}`,
        lastmod: STATIC_LASTMOD,
        changefreq: 'daily',
        priority: 0.70,
      }));

    // /flea-markets/{city-slug} — gated on >= 3 active FLEA_MARKET sales
    const fleaMarketsUrls = cityRows
      .filter((row) => hasActiveOfType(row, 'FLEA_MARKET'))
      .map((row) => ({
        loc: `${baseUrl}/flea-markets/${row.slug}`,
        lastmod: STATIC_LASTMOD,
        changefreq: 'daily',
        priority: 0.70,
      }));

    // Generate neighborhood URLs
    const neighborhoodUrls = neighborhoods.map((neighborhood: string) => ({
      loc: `${baseUrl}/neighborhoods/${neighborhood}`,
      lastmod: STATIC_LASTMOD,
      changefreq: 'daily',
      priority: 0.7,
    }));

    // Generate zip URLs
    const zipUrls = zips.map((zip: string) => ({
      loc: `${baseUrl}/sales/zip/${zip}`,
      lastmod: STATIC_LASTMOD,
      changefreq: 'daily',
      priority: 0.6,
    }));

    // Generate tag/category URLs
    const tagUrls = tags.map((tag: any) => ({
      loc: `${baseUrl}/tags/${tag.slug}`,
      lastmod: STATIC_LASTMOD,
      changefreq: 'weekly',
      priority: 0.7,
    }));

    // Generate guide URLs (ADR-075 SEO Content Moat)
    // S1071 quality gate: include only (a) all 50 pricing-guides (median 422 words) and
    // (b) how-to guides with >= 350 words of real content. The other ~350 how-to entries
    // are ~160-word city-template stubs — the GSC crawled-rejected /guide/ class.
    // Word count is computed deterministically from data/seo-pages/index.json at
    // request time (module require is cached), so regenerating guides updates the gate.
    let guideUrls: any[] = [];
    try {
      const guideIndex = require('../data/seo-pages/index.json') as Array<{
        slug: string;
        type?: string;
        content?: unknown;
      }>;
      const countWords = (node: unknown): number => {
        if (typeof node === 'string') return node.split(/\s+/).filter(Boolean).length;
        if (Array.isArray(node)) return node.reduce((sum: number, child) => sum + countWords(child), 0);
        if (node && typeof node === 'object') {
          return Object.values(node as Record<string, unknown>).reduce(
            (sum: number, child) => sum + countWords(child),
            0
          );
        }
        return 0;
      };
      const MIN_HOWTO_WORDS = 350;
      guideUrls = guideIndex
        .filter(
          (guide) =>
            guide.type === 'pricing-guide' ||
            (guide.type === 'how-to' && countWords(guide.content) >= MIN_HOWTO_WORDS)
        )
        .map((guide) => ({
          loc: `${baseUrl}/guide/${guide.slug}`,
          lastmod: '2026-05-01',
          changefreq: 'weekly',
          priority: 0.7,
        }));
    } catch (err) {
      console.error('[sitemap] Could not load guide index:', err);
    }

    // Category pages (hardcoded item categories)
    const ITEM_CATEGORIES = [
      'furniture', 'clothing', 'electronics', 'books', 'antiques',
      'tools', 'kitchen', 'art', 'jewelry', 'other',
    ];
    const categoryUrls = ITEM_CATEGORIES.map((cat) => ({
      loc: `${baseUrl}/categories/${cat}`,
      lastmod: STATIC_LASTMOD,
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
          lastmod: STATIC_LASTMOD,
          changefreq: 'weekly',
          priority: 0.7,
        }));
    } catch {
      // Graceful fallback — encyclopedia URLs are optional
    }

    // Blog post URLs (data/blog/index.ts is a local static module — no API call needed)
    const blogUrls = blogPosts.map((post) => ({
      loc: `${baseUrl}/blog/${post.slug}`,
      lastmod: post.updatedDate ?? post.publishDate,
      changefreq: 'weekly',
      priority: 0.6,
    }));

    // Combine all URL sets
    // Note: /items/{id} URLs intentionally excluded — ~10k SSR leaf pages
    // exhaust crawl budget, crowding out city/sale/guide pages. ISR conversion pending.
    const fields = [
      ...staticUrls,
      ...saleUrls,
      ...cityCategoryUrls,
      ...thisWeekendUrls,
      ...estateSalesUrls,
      ...yardSalesUrls,
      ...auctionsUrls,
      ...fleaMarketsUrls,
      ...neighborhoodUrls,
      ...zipUrls,
      ...tagUrls,
      ...guideUrls,
      ...categoryUrls,
      ...encyclopediaUrls,
      ...blogUrls,
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