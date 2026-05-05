import { getServerSideSitemap } from 'next-sitemap';
import api from '../lib/api';

export async function getServerSideProps() {
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

    // Generate city URLs
    const cityUrls = cities.map((city: string) => ({
      loc: `${baseUrl}/city/${city}`,
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
      const indexData = require('../data/seo-pages/index.json') as Array<{ slug: string }>;
      guideUrls = indexData.map((entry: any) => ({
        loc: `${baseUrl}/guide/${entry.slug}`,
        lastmod: '2026-05-01',
        changefreq: 'weekly',
        priority: 0.7,
      }));
    } catch (err) {
      console.warn('Could not load guide entries for sitemap:', err);
    }

    // Combine all URL sets
    const fields = [
      ...staticUrls,
      ...saleUrls,
      ...cityUrls,
      ...neighborhoodUrls,
      ...zipUrls,
      ...tagUrls,
      ...guideUrls,
    ];

    return getServerSideSitemap(fields);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    // Return empty sitemap if there's an error
    return getServerSideSitemap([]);
  }
}

// Default export to prevent next.js errors
export default function Sitemap() {}
