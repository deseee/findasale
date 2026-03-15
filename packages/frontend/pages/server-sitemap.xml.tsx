import { getServerSideSitemap } from 'next-sitemap';
import api from '../lib/api';

export async function getServerSideProps(ctx: any) {
  try {
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

    // Generate static URLs
    const staticUrls = [
      '/',
      '/about',
      '/contact',
      '/faq',
      '/terms',
      '/privacy',
    ].map((url) => ({
      loc: `${process.env.SITE_URL || 'https://finda.sale'}${url}`,
      lastmod: new Date().toISOString(),
      changefreq: 'daily',
      priority: 0.7,
    }));

    // Generate sale URLs
    const saleUrls = Array.isArray(sales) 
      ? sales.map((sale: any) => ({
          loc: `${process.env.SITE_URL || 'https://finda.sale'}/sales/${sale.id}`,
          lastmod: new Date(sale.updatedAt || sale.createdAt || new Date()).toISOString(),
          changefreq: 'hourly',
          priority: 0.8,
        }))
      : [];

    // Generate city URLs
    const cityUrls = cities.map((city: string) => ({
      loc: `${process.env.SITE_URL || 'https://finda.sale'}/city/${city}`,
      lastmod: new Date().toISOString(),
      changefreq: 'daily',
      priority: 0.6,
    }));

    // Generate zip URLs
    const zipUrls = zips.map((zip: string) => ({
      loc: `${process.env.SITE_URL || 'https://finda.sale'}/sales/zip/${zip}`,
      lastmod: new Date().toISOString(),
      changefreq: 'daily',
      priority: 0.6,
    }));

    // Generate tag URLs
    const tagUrls = tags.map((tag: any) => ({
      loc: `${process.env.SITE_URL || 'https://finda.sale'}/tags/${tag.slug}`,
      lastmod: new Date().toISOString(),
      changefreq: 'weekly',
      priority: 0.6,
    }));

    const fields = [...staticUrls, ...saleUrls, ...cityUrls, ...zipUrls, ...tagUrls];

    return getServerSideSitemap(ctx, fields);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    // Return empty sitemap if there's an error
    return getServerSideSitemap(ctx, []);
  }
}

// Default export to prevent next.js errors
export default function Sitemap() {}
