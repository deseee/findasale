/**
 * SaleOGMeta — Feature #33 Share Card Factory
 *
 * Renders OG and Twitter Card meta tags for sale detail pages.
 * Uses Cloudinary-generated preview images.
 */

import Head from 'next/head';
import { generateSaleOGImage } from '../lib/ogImage';

interface Sale {
  id: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  state?: string;
  photos?: Array<{ publicId?: string; url?: string }>;
  address?: string;
  organizer?: {
    businessName?: string;
  };
  items?: Array<{ id: string }>;
}

interface SaleOGMetaProps {
  sale: Sale;
  /**
   * Optional override for canonical URL.
   * Defaults to `https://finda.sale/sales/{id}`
   */
  canonicalUrl?: string;
  /**
   * Optional override for description.
   * Defaults to sale.description or auto-generated summary.
   */
  description?: string;
}

export default function SaleOGMeta({
  sale,
  canonicalUrl,
  description,
}: SaleOGMetaProps) {
  // Get Cloudinary cloud name from environment
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'db8yhzjdq';

  // Extract first photo's Cloudinary public ID if available
  let cloudinaryPublicId: string | undefined;
  if (sale.photos && sale.photos.length > 0) {
    // If photo has explicit publicId, use it; otherwise try to extract from URL
    if (sale.photos[0].publicId) {
      cloudinaryPublicId = sale.photos[0].publicId;
    } else if (
      sale.photos[0].url &&
      sale.photos[0].url.includes('res.cloudinary.com')
    ) {
      // Extract public ID from Cloudinary URL
      // Format: https://res.cloudinary.com/{cloud}/upload/{transforms}/{public_id}.jpg
      const matches = sale.photos[0].url.match(
        /\/upload\/(?:[^/]*\/)*(.+?)(?:\.\w+)?$/
      );
      if (matches && matches[1]) {
        cloudinaryPublicId = matches[1];
      }
    }
  }

  // Format dates for display
  let dateRange = '';
  if (sale.startDate && sale.endDate) {
    const start = new Date(sale.startDate);
    const end = new Date(sale.endDate);
    const startStr = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const endStr = end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    dateRange = `${startStr}–${endStr}`;
  }

  // Build location string
  const location = sale.city && sale.state ? `${sale.city}, ${sale.state}` : '';

  // Generate OG image URL
  const ogImageUrl = generateSaleOGImage({
    cloudName,
    saleTitle: sale.title,
    saleDate: dateRange,
    location,
    cloudinaryPublicId,
    itemCount: sale.items?.length,
    organizerName: sale.organizer?.businessName,
  });

  // Default description
  const metaDescription =
    description ||
    sale.description ||
    `Estate sale in ${location} with ${sale.items?.length || 0} items. ${dateRange}`.trim();

  // Canonical URL
  const url =
    canonicalUrl ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/sales/${sale.id}`
      : `https://finda.sale/sales/${sale.id}`);

  return (
    <Head>
      {/* Standard meta tags */}
      <title>{sale.title} – FindA.Sale</title>
      <meta name="description" content={metaDescription} />

      {/* Open Graph (Facebook, LinkedIn, etc.) */}
      <meta property="og:title" content={`${sale.title} — FindA.Sale`} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={ogImageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="FindA.Sale" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={`${sale.title} — FindA.Sale`} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={ogImageUrl} />

      {/* Canonical link */}
      <link rel="canonical" href={url} />
    </Head>
  );
}
