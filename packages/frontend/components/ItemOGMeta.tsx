/**
 * ItemOGMeta — Feature #33 Share Card Factory
 *
 * Renders OG and Twitter Card meta tags for item detail pages.
 * Uses Cloudinary-generated preview images.
 */

import Head from 'next/head';
import { generateItemOGImage } from '../lib/ogImage';

interface ItemPhoto {
  publicId?: string;
  url?: string;
}

interface Item {
  id: string;
  title: string;
  description?: string;
  price?: number;
  auctionStartPrice?: number;
  currentBid?: number;
  condition?: string;
  photos?: ItemPhoto[];
}

interface ItemOGMetaProps {
  item: Item;
  saleName: string;
  saleId: string;
  /**
   * Optional override for canonical URL.
   * Defaults to `https://finda.sale/sales/{saleId}/items/{itemId}`
   */
  canonicalUrl?: string;
  /**
   * Optional override for description.
   * Defaults to item.description or auto-generated summary.
   */
  description?: string;
}

export default function ItemOGMeta({
  item,
  saleName,
  saleId,
  canonicalUrl,
  description,
}: ItemOGMetaProps) {
  // Get Cloudinary cloud name from environment
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'db8yhzjdq';

  // Extract first photo's Cloudinary public ID if available
  let cloudinaryPublicId: string | undefined;
  if (item.photos && item.photos.length > 0) {
    // If photo has explicit publicId, use it; otherwise try to extract from URL
    if (item.photos[0].publicId) {
      cloudinaryPublicId = item.photos[0].publicId;
    } else if (
      item.photos[0].url &&
      item.photos[0].url.includes('res.cloudinary.com')
    ) {
      // Extract public ID from Cloudinary URL
      // Format: https://res.cloudinary.com/{cloud}/upload/{transforms}/{public_id}.jpg
      const matches = item.photos[0].url.match(
        /\/upload\/(?:[^/]*\/)*(.+?)(?:\.\w+)?$/
      );
      if (matches && matches[1]) {
        cloudinaryPublicId = matches[1];
      }
    }
  }

  // Determine display price
  let displayPrice: number | undefined;
  if (item.price && item.price > 0) {
    displayPrice = item.price;
  } else if (item.currentBid && item.currentBid > 0) {
    displayPrice = item.currentBid;
  } else if (item.auctionStartPrice && item.auctionStartPrice > 0) {
    displayPrice = item.auctionStartPrice;
  }

  // Generate OG image URL
  const ogImageUrl = generateItemOGImage({
    cloudName,
    itemTitle: item.title,
    saleTitle: saleName,
    price: displayPrice,
    condition: item.condition,
    cloudinaryPublicId,
  });

  // Default description
  const metaDescription =
    description ||
    item.description ||
    `${item.title} from ${saleName}${displayPrice ? ` - $${displayPrice.toFixed(2)}` : ''}`.trim();

  // Canonical URL - adjust to match actual routing
  const url =
    canonicalUrl ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/sales/${saleId}/items/${item.id}`
      : `https://finda.sale/sales/${saleId}/items/${item.id}`);

  return (
    <Head>
      {/* Standard meta tags */}
      <title>{item.title} – FindA.Sale</title>
      <meta name="description" content={metaDescription} />

      {/* Open Graph (Facebook, LinkedIn, etc.) */}
      <meta property="og:title" content={`${item.title} — FindA.Sale`} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={ogImageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="FindA.Sale" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={`${item.title} — FindA.Sale`} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={ogImageUrl} />

      {/* Canonical link */}
      <link rel="canonical" href={url} />
    </Head>
  );
}
