/**
 * OG Image URL Generator — Feature #33
 *
 * Generates Cloudinary-based OG preview images (1200×630) for social sharing.
 * Falls back to solid color background with text overlay if no photo available.
 *
 * Example Cloudinary URL structure:
 * https://res.cloudinary.com/{cloud_name}/image/fetch/
 *   w_1200,h_630,c_fill,g_auto,f_jpg,q_auto/
 *   l_text:Arial_60_bold:Sale%20Title,co_rgb:fff,x_-550,y_-200/
 *   l_text:Arial_40:finda.sale,co_rgb:D97706,x_550,y_280/
 *   {base_image_url}
 */

/**
 * Encode text for Cloudinary text overlays.
 * Safe for use in URLs.
 */
const encodeCloudinaryText = (text: string, maxLength: number = 60): string => {
  const truncated = text.substring(0, maxLength);
  return encodeURIComponent(truncated);
};

/**
 * Generate a Cloudinary URL for a sale OG preview card.
 *
 * @param params Sale data for the OG image
 * @returns Full Cloudinary URL ready for og:image meta tag
 *
 * @example
 * generateSaleOGImage({
 *   cloudName: 'db8yhzjdq',
 *   saleTitle: 'Vintage Estate Sale',
 *   saleDate: 'Mar 15–17, 2026',
 *   location: 'Grand Rapids, MI',
 *   cloudinaryPublicId: 'sales/abc123/photo_1',
 * })
 * // => 'https://res.cloudinary.com/db8yhzjdq/image/fetch/w_1200,h_630,c_fill,...'
 */
export function generateSaleOGImage(params: {
  cloudName: string;
  saleTitle: string;
  saleDate?: string;
  location?: string;
  cloudinaryPublicId?: string;
  itemCount?: number;
  organizerName?: string;
}): string {
  const {
    cloudName,
    saleTitle,
    saleDate,
    location,
    cloudinaryPublicId,
    itemCount,
    organizerName,
  } = params;

  // Base transformations: size, quality, format
  const baseTransform = [
    'w_1200',
    'h_630',
    'c_fill',
    'g_auto',
    'f_jpg',
    'q_auto',
  ].join(',');

  // Text overlay: sale title (main)
  const titleText = encodeCloudinaryText(saleTitle, 50);
  const titleOverlay = `l_text:Arial_60_bold:${titleText},co_rgb:1a1a1a,x_0,y_-150`;

  // Text overlay: date + location
  let dateLocationText = '';
  if (saleDate && location) {
    const combined = `${saleDate.substring(0, 25)} • ${location.substring(0, 25)}`;
    dateLocationText = `l_text:Arial_36:${encodeCloudinaryText(combined)},co_rgb:6B5A42,x_0,y_50`;
  } else if (saleDate) {
    dateLocationText = `l_text:Arial_36:${encodeCloudinaryText(saleDate)},co_rgb:6B5A42,x_0,y_50`;
  } else if (location) {
    dateLocationText = `l_text:Arial_36:${encodeCloudinaryText(location)},co_rgb:6B5A42,x_0,y_50`;
  }

  // Text overlay: watermark (bottom)
  const watermarkOverlay = `l_text:Arial_32_bold:finda.sale,co_rgb:D97706,x_0,y_270`;

  // If a photo is provided, use it as the base; otherwise use a solid color background
  let baseImage: string;
  if (cloudinaryPublicId) {
    // Assume cloudinaryPublicId is just the public_id without .jpg extension
    baseImage = `${cloudinaryPublicId}.jpg`;
  } else {
    // Solid color background: warm amber
    baseImage = `data:image/svg+xml,%3Csvg%20width%3D%271200%27%20height%3D%27630%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Crect%20fill%3D%27%23fef3c7%27%20width%3D%271200%27%20height%3D%27630%27%2F%3E%3C%2Fsvg%3E`;
  }

  // Build the full Cloudinary URL
  const overlays = [titleOverlay, dateLocationText, watermarkOverlay]
    .filter(Boolean)
    .join('/');

  // Construct URL with fetch endpoint for external images or direct public_id for Cloudinary assets
  if (cloudinaryPublicId) {
    return `https://res.cloudinary.com/${cloudName}/image/upload/${baseTransform}/${overlays}/${cloudinaryPublicId}.jpg`;
  } else {
    // Fallback to simple URL without photo
    return `https://res.cloudinary.com/${cloudName}/image/upload/${baseTransform}/${overlays}/b_rgb:fef3c7,w_1200,h_630`;
  }
}

/**
 * Generate a Cloudinary URL for an item OG preview card.
 *
 * @param params Item data for the OG image
 * @returns Full Cloudinary URL ready for og:image meta tag
 *
 * @example
 * generateItemOGImage({
 *   cloudName: 'db8yhzjdq',
 *   itemTitle: 'Vintage Mahogany Dresser',
 *   saleTitle: 'Estate Sale',
 *   price: 45.99,
 *   cloudinaryPublicId: 'items/xyz789/item_photo',
 * })
 * // => 'https://res.cloudinary.com/db8yhzjdq/image/upload/...'
 */
export function generateItemOGImage(params: {
  cloudName: string;
  itemTitle: string;
  saleTitle: string;
  price?: number;
  condition?: string;
  cloudinaryPublicId?: string;
}): string {
  const {
    cloudName,
    itemTitle,
    saleTitle,
    price,
    condition,
    cloudinaryPublicId,
  } = params;

  // Base transformations: size, quality, format
  const baseTransform = [
    'w_1200',
    'h_630',
    'c_fill',
    'g_auto',
    'f_jpg',
    'q_auto',
  ].join(',');

  // Text overlay: item title (main)
  const titleText = encodeCloudinaryText(itemTitle, 50);
  const titleOverlay = `l_text:Arial_60_bold:${titleText},co_rgb:1a1a1a,x_0,y_-100`;

  // Text overlay: sale name (secondary)
  const saleText = encodeCloudinaryText(`from ${saleTitle}`, 40);
  const saleOverlay = `l_text:Arial_32:${saleText},co_rgb:6B5A42,x_0,y_20`;

  // Price badge if available
  let priceOverlay = '';
  if (price !== undefined && price > 0) {
    const priceText = `$${price.toFixed(2)}`;
    priceOverlay = `l_text:Arial_48_bold:${encodeCloudinaryText(priceText)},co_rgb:D97706,x_0,y_100`;
  }

  // Condition tag if available
  let conditionOverlay = '';
  if (condition) {
    conditionOverlay = `l_text:Arial_28:${encodeCloudinaryText(condition)},co_rgb:6B5A42,x_0,y_180`;
  }

  // Watermark
  const watermarkOverlay = `l_text:Arial_28_bold:finda.sale,co_rgb:D97706,x_0,y_280`;

  // Build overlay string
  const overlays = [
    titleOverlay,
    saleOverlay,
    priceOverlay,
    conditionOverlay,
    watermarkOverlay,
  ]
    .filter(Boolean)
    .join('/');

  // Build the full Cloudinary URL
  if (cloudinaryPublicId) {
    return `https://res.cloudinary.com/${cloudName}/image/upload/${baseTransform}/${overlays}/${cloudinaryPublicId}.jpg`;
  } else {
    // Fallback without photo
    return `https://res.cloudinary.com/${cloudName}/image/upload/${baseTransform}/${overlays}/b_rgb:fef3c7,w_1200,h_630`;
  }
}
