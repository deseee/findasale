/**
 * Utility to generate social share URLs with UTM tracking parameters
 * Used when creating shareable links for social media, email, etc.
 */
export function generateShareUrl(
  baseUrl: string,
  saleId: string,
  source: string = 'findasale',
  medium: string = 'share',
  campaign: string = 'listing'
): string {
  const url = new URL(baseUrl);
  url.searchParams.append('utm_source', source);
  url.searchParams.append('utm_medium', medium);
  url.searchParams.append('utm_campaign', campaign);
  url.searchParams.append('utm_content', saleId);
  url.searchParams.append('saleId', saleId);
  return url.toString();
}
