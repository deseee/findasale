/**
 * Organizer Storefront Page — v0.2 redesign
 *
 * Public page displaying organizer's branded storefront:
 * - Brand identity (logo, colors, banner, fonts)
 * - Organizer info (bio, contact links)
 * - Active sales listings
 * - Accessible via custom slug: findasale.local/organizer/storefront/[slug]
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../lib/api';
import ClaimListingModal from '../../../components/ClaimListingModal';

interface Shopper {
  id: string;
  name: string;
  introducedAt: string;
}

interface BrandKitData {
  id: string;
  businessName: string;
  bio: string | null;
  profilePhoto: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  etsy: string | null;
  tagline: string | null;
  yearFounded: number | null;
  twitterUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  pinterestUrl: string | null;
  pickupWindows: string | null;
  timezone: string | null;
  byAppointment: boolean;
  organizerTypes: string[];
  hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  brandFontFamily: string | null;
  brandBannerImageUrl: string | null;
  brandAccentColor: string | null;
  customStorefrontSlug: string | null;
  subscriptionTier: string;
  latestBroadcast?: { message: string; sentAt: string } | null;
  foundingShoppers?: Shopper[];
}

interface Sale {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  saleType?: string;
  photoUrls: string[];
  isPinned?: boolean;
  attendanceCount?: number | null;
  buyersPremiumPct?: number | null;
}

// Keys are lowercase to match settings UI values; normalize DB values before lookup.
const ORGANIZER_TYPE_LABELS: Record<string, string> = {
  estate_sale: 'Estate Sales',
  yard_sale: 'Yard Sales',
  auction: 'Auctions',
  flea_market: 'Flea Markets',
  consignment: 'Consignment',
  antique_shop: 'Antique Shops',
  thrift_store: 'Thrift Stores',
  liquidation: 'Liquidation',
};

// Normalize organizer type to label — handles both 'estate_sale' and 'ESTATE_SALE'.
const getOrgTypeLabel = (type: string): string =>
  ORGANIZER_TYPE_LABELS[type.toLowerCase()] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Format relative time (e.g., "3 days ago")
const getRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  return 'just now';
};

// Feature #361: US state names for deduplication
const US_STATE_NAMES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia'
];

// Format location, deduplicating when city is actually a state name
const formatLocation = (city: string | null | undefined, state: string | null | undefined): string | null => {
  if (!city && !state) return null;
  if (!city) return state || null;
  if (!state) return city;
  if (US_STATE_NAMES.includes(city)) return state;
  return `${city}, ${state}`;
};

// Minimal inline icon helper — no external dep
const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const paths: Record<string, React.ReactNode> = {
    map: <><circle cx="12" cy="10" r="3" /><path d="M12 21s-7-7.5-7-12a7 7 0 0114 0c0 4.5-7 12-7 12z" /></>,
    phone: <path d="M5 4h3l2 5-2 1c1 2 2.5 3.5 4.5 4.5l1-2 5 2v3c0-1.2-1-2-2-2C9.5 19.5 4.5 14.5 4.5 6c0-1.2 1-2 2-2H5z" fill="currentColor" stroke="none" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
    web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></>,
    star: <path d="M12 3l2.6 5.8 6.4.7-4.8 4.4 1.4 6.3L12 17l-5.6 3.2 1.4-6.3L3 9.5l6.4-.7L12 3z" />,
    heart: <path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z" />,
    share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8 11l8-4M8 13l8 4" /></>,
    instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></>,
    facebook: <path d="M14 8.5h2.5V5h-3C12 5 11 6.5 11 8v2.5H8.5V14H11v6h3v-6h2.3l.5-3.5H14V8.5z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    verified: <><path d="M12 3l2 2 3-.3.3 3 2 2-2 2-.3 3-3-.3-2 2-2-2-3 .3-.3-3-2-2 2-2 .3-3 3 .3 2-2z" /><path d="M9 12l2 2 4-4" /></>,
    external: <><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6M10 14L21 3" /></>,
    tiktok: <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.22 8.22 0 004.83 1.56V6.79a4.85 4.85 0 01-1.06-.1z" fill="currentColor" stroke="none" />,
    youtube: <><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z" /><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white" stroke="none" /></>,
    pinterest: <path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.65 7.86 6.39 9.29-.09-.78-.17-1.98.04-2.83.18-.77 1.22-5.17 1.22-5.17s-.31-.62-.31-1.54c0-1.45.84-2.53 1.88-2.53.89 0 1.32.67 1.32 1.47 0 .9-.57 2.24-.87 3.48-.25 1.04.52 1.88 1.54 1.88 1.84 0 3.09-2.35 3.09-5.13 0-2.12-1.43-3.61-3.47-3.61-2.36 0-3.75 1.77-3.75 3.6 0 .71.27 1.48.62 1.9.07.08.08.15.06.23-.06.26-.2.83-.23.95-.04.15-.13.18-.3.11-1.11-.52-1.8-2.14-1.8-3.45 0-2.8 2.03-5.37 5.86-5.37 3.07 0 5.46 2.19 5.46 5.11 0 3.05-1.92 5.5-4.58 5.5-.9 0-1.74-.47-2.03-1.02l-.55 2.07c-.2.77-.74 1.73-1.1 2.32.83.26 1.7.4 2.61.4 5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" stroke="none" />,
    twitter: <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z" />,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}>
      {paths[name]}
    </svg>
  );
};

const OrganizerStorefront = () => {
  const router = useRouter();
  const { slug } = router.query;

  const [brandKit, setBrandKit] = useState<BrandKitData | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClaimed, setIsClaimed] = useState<boolean>(true);
  const [showClaimModal, setShowClaimModal] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;

      try {
        setIsLoading(true);
        setError(null);

        // Fetch organizer profile by customStorefrontSlug or ID
        const orgResponse = await api.get(`/organizers/${slug}`);
        const orgData = orgResponse.data;

        // Map organizer data to BrandKitData format
        const brandData: BrandKitData = {
          id: orgData.id,
          businessName: orgData.businessName,
          bio: orgData.bio,
          profilePhoto: orgData.profilePhoto,
          phone: orgData.phone,
          address: orgData.address,
          website: orgData.website,
          facebook: orgData.facebook,
          instagram: orgData.instagram,
          etsy: orgData.etsy,
          tagline: orgData.tagline,
          yearFounded: orgData.yearFounded,
          twitterUrl: orgData.twitterUrl,
          tiktokUrl: orgData.tiktokUrl,
          youtubeUrl: orgData.youtubeUrl,
          pinterestUrl: orgData.pinterestUrl,
          pickupWindows: orgData.pickupWindows,
          timezone: orgData.timezone,
          byAppointment: orgData.byAppointment || false,
          organizerTypes: orgData.organizerTypes || [],
          hours: orgData.hours || [],
          brandLogoUrl: orgData.brandLogoUrl,
          brandPrimaryColor: orgData.brandPrimaryColor,
          brandSecondaryColor: orgData.brandSecondaryColor,
          brandFontFamily: orgData.brandFontFamily,
          brandBannerImageUrl: orgData.brandBannerImageUrl,
          brandAccentColor: orgData.brandAccentColor,
          customStorefrontSlug: orgData.customStorefrontSlug,
          subscriptionTier: orgData.subscriptionTier || 'SIMPLE',
          latestBroadcast: orgData.latestBroadcast || null,
          foundingShoppers: orgData.foundingShoppers || [],
        };

        setBrandKit(brandData);
        setSales(orgData.sales || []);
        setIsClaimed(orgData.isClaimed !== false); // default true; only show claim banner when explicitly false
      } catch (err: unknown) {
        console.error('Failed to fetch storefront data:', err);
        const apiErr = err as { response?: { data?: { message?: string } } };
        setError(apiErr.response?.data?.message || 'Storefront not found');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  // — Loading state —
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4EFE7] dark:bg-[#0B0F17] flex items-center justify-center">
        <div className="font-mono text-sm tracking-widest uppercase text-[rgba(26,24,20,0.4)]">Loading…</div>
      </div>
    );
  }

  // — Error / not found state —
  if (error || !brandKit) {
    return (
      <div className="min-h-screen bg-[#F4EFE7] dark:bg-[#0B0F17] flex items-center justify-center px-5">
        <div className="text-center">
          <h1
            className="text-3xl font-semibold mb-3 text-[#1A1814] dark:text-[#F2F0EA]"
            style={{ fontFamily: "'Inter Tight', sans-serif", letterSpacing: '-0.02em' }}
          >
            Storefront Not Found
          </h1>
          <p className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mb-6 text-sm">
            {error || 'This organizer storefront does not exist.'}
          </p>
          <Link href="/" className="text-[#C8552B] dark:text-[#E97C4D] hover:underline font-medium text-sm">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  // — Status pill computation —
  const now = new Date();
  const activeSale = sales.find(
    s => s.status === 'PUBLISHED' && new Date(s.startDate) <= now && new Date(s.endDate) >= now
  );
  const upcomingSale = sales.find(
    s => s.status === 'PUBLISHED' && new Date(s.startDate) > now
  );
  const storefrontStatus = activeSale ? 'open' : upcomingSale ? 'upcoming' : 'closed';
  const statusLabel =
    storefrontStatus === 'open' ? 'Sale live now' :
    storefrontStatus === 'upcoming' ? 'Next sale upcoming' :
    'Between sales';
  const statusColor =
    storefrontStatus === 'open' ? '#3F7A4B' :
    storefrontStatus === 'upcoming' ? '#C8552B' :
    'rgba(26,24,20,0.4)';

  // Initials for logo placeholder
  const initials = brandKit.businessName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  // Location string from address field (first line) or null
  const locationDisplay: string | null = (() => {
    if (!brandKit.address) return null;
    const parts = brandKit.address.split(',');
    if (parts.length >= 2) {
      // last two parts are likely city, state
      return parts.slice(-2).join(',').trim();
    }
    return brandKit.address;
  })();

  // Has hours info
  const hasHours =
    brandKit.byAppointment ||
    (brandKit.hours && brandKit.hours.length > 0) ||
    !!brandKit.pickupWindows;

  // Has any contact info
  const hasContact =
    !!brandKit.phone ||
    !!brandKit.website ||
    !!brandKit.facebook ||
    !!brandKit.instagram ||
    !!brandKit.etsy ||
    !!brandKit.twitterUrl ||
    !!brandKit.tiktokUrl ||
    !!brandKit.youtubeUrl ||
    !!brandKit.pinterestUrl;

  // Has brand colors (PRO/TEAMS)
  const hasBrandColors =
    (brandKit.subscriptionTier === 'PRO' || brandKit.subscriptionTier === 'TEAMS') &&
    (!!brandKit.brandPrimaryColor || !!brandKit.brandSecondaryColor || !!brandKit.brandAccentColor);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // — "Open now" check for hours block —
  const isOpenNow = (() => {
    if (brandKit.byAppointment) return null; // indeterminate
    if (!brandKit.hours || brandKit.hours.length === 0) return null;
    const day = now.getDay();
    const todayHours = brandKit.hours.find(h => h.dayOfWeek === day);
    if (!todayHours || !todayHours.openTime || !todayHours.closeTime) return false;
    const [oh, om] = todayHours.openTime.split(':').map(Number);
    const [ch, cm] = todayHours.closeTime.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return nowMins >= oh * 60 + om && nowMins <= ch * 60 + cm;
  })();

  return (
    <>
      <Head>
        <title>{brandKit.businessName} - FindA.Sale</title>
        <meta name="description" content={brandKit.bio || `Shop sales from ${brandKit.businessName}`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;600&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="min-h-screen bg-[#F4EFE7] dark:bg-[#0B0F17]" style={{ fontFamily: "'Inter', sans-serif" }}>

        {/* ── Claim-This-Listing Banner (Feature #361) ── */}
        {!isClaimed && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 py-3 px-4">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Is this your business? Claim this listing to manage your storefront, add photos, and connect with shoppers.
              </p>
              <button
                onClick={() => setShowClaimModal(true)}
                className="shrink-0 text-xs font-semibold px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-full transition-colors"
              >
                Claim Listing
              </button>
            </div>
          </div>
        )}

        {/* Claim Listing Modal */}
        {showClaimModal && brandKit && (
          <ClaimListingModal organizerId={brandKit.id} onClose={() => setShowClaimModal(false)} />
        )}

        {/* ── HERO ── */}
        <div className="relative">
          {/* Cover area */}
          <div
            className="h-[280px] w-full overflow-hidden relative"
            style={
              brandKit.brandBannerImageUrl
                ? undefined
                : { background: 'repeating-linear-gradient(135deg, #E8E2D6 0 14px, #EFEAE0 14px 28px)' }
            }
          >
            {brandKit.brandBannerImageUrl && (
              <img
                src={brandKit.brandBannerImageUrl}
                alt="Banner"
                className="w-full h-full object-cover"
              />
            )}
            {/* Gradient fade to page bg */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, transparent 30%, #F4EFE7 100%)',
              }}
            />
            <div
              className="absolute inset-0 pointer-events-none hidden dark:block"
              style={{
                background: 'linear-gradient(180deg, transparent 30%, #0B0F17 100%)',
              }}
            />
          </div>

          {/* Identity row — overlapping cover */}
          <div className="max-w-5xl mx-auto px-5">
            <div className="relative -mt-14 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              {/* Logo + info */}
              <div className="flex items-end gap-4">
                {/* Logo mark */}
                <div
                  className="h-28 w-28 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center border-2 border-[rgba(20,18,14,0.18)] dark:border-[rgba(255,255,255,0.14)]"
                  style={{
                    background: '#FFFFFF',
                    boxShadow: '0 4px 16px rgba(20,18,14,0.12)',
                  }}
                >
                  {brandKit.brandLogoUrl ? (
                    <img
                      src={brandKit.brandLogoUrl}
                      alt={brandKit.businessName}
                      className="w-full h-full object-contain p-2"
                    />
                  ) : brandKit.profilePhoto ? (
                    <img
                      src={brandKit.profilePhoto}
                      alt={brandKit.businessName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span
                      className="text-3xl font-semibold text-[#C8552B] dark:text-[#E97C4D]"
                      style={{ fontFamily: "'Inter Tight', sans-serif" }}
                    >
                      {initials}
                    </span>
                  )}
                </div>

                {/* Name + meta */}
                <div className="pb-1">
                  {/* Type pill */}
                  {brandKit.organizerTypes && brandKit.organizerTypes.length > 0 && (
                    <div
                      className="inline-flex items-center gap-1.5 text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mb-1"
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                    >
                      {brandKit.organizerTypes.slice(0, 2).map(getOrgTypeLabel).join(' · ')}
                    </div>
                  )}
                  {/* Business name */}
                  <h1
                    className="text-[#1A1814] dark:text-[#F2F0EA] leading-none mb-2"
                    style={{
                      fontFamily: "'Inter Tight', sans-serif",
                      fontSize: 'clamp(26px, 5vw, 44px)',
                      fontWeight: 600,
                      letterSpacing: '-0.025em',
                    }}
                  >
                    {brandKit.businessName}
                  </h1>
                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {/* Status dot */}
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: statusColor }}
                      />
                      <span
                        className="text-xs"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color: statusColor,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {statusLabel}
                      </span>
                    </span>
                    {/* Location */}
                    {locationDisplay && (
                      <span className="inline-flex items-center gap-1 text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] text-xs">
                        <Icon name="map" size={12} />
                        {locationDisplay}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* CTA stack */}
              <div className="flex items-center gap-2 pb-1 self-end sm:self-auto">
                <button
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: brandKit.businessName, url: window.location.href }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(window.location.href).catch(() => {});
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[rgba(20,18,14,0.18)] dark:border-[rgba(255,255,255,0.14)] text-[#1A1814] dark:text-[#F2F0EA] bg-transparent hover:bg-[rgba(20,18,14,0.04)] dark:hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                >
                  <Icon name="share" size={14} />
                  Share
                </button>
                <button
                  onClick={() => {}}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[#C8552B] dark:bg-[#E97C4D] text-white hover:opacity-90 transition-opacity"
                >
                  <Icon name="heart" size={14} />
                  Follow
                </button>
              </div>
            </div>

            {/* Tagline */}
            {brandKit.tagline && (
              <p
                className="mt-3 text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)]"
                style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 18 }}
              >
                {brandKit.tagline}
              </p>
            )}
          </div>
        </div>

        {/* ── STATS STRIP ── */}
        {(sales.length > 0 || brandKit.yearFounded || brandKit.organizerTypes.length > 0) && (
          <div
            className="mt-6 border-t border-b border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)] bg-[#FBF8F2] dark:bg-[#121826]"
          >
            <div className="max-w-5xl mx-auto px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Sales count */}
              <div className="text-center">
                <div
                  className="text-[#1A1814] dark:text-[#F2F0EA] text-2xl font-semibold"
                  style={{ fontFamily: "'Inter Tight', sans-serif", letterSpacing: '-0.02em' }}
                >
                  {sales.length}
                </div>
                <div
                  className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mt-0.5"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                >
                  Sales
                </div>
              </div>
              {/* Est. */}
              {brandKit.yearFounded && (
                <div className="text-center">
                  <div
                    className="text-[#1A1814] dark:text-[#F2F0EA] text-2xl font-semibold"
                    style={{ fontFamily: "'Inter Tight', sans-serif", letterSpacing: '-0.02em' }}
                  >
                    {brandKit.yearFounded}
                  </div>
                  <div
                    className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mt-0.5"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                  >
                    Est.
                  </div>
                </div>
              )}
              {/* Types */}
              {brandKit.organizerTypes.length > 0 && (
                <div className="text-center col-span-2 sm:col-span-1">
                  <div
                    className="text-[#1A1814] dark:text-[#F2F0EA] text-sm font-semibold truncate"
                    style={{ fontFamily: "'Inter Tight', sans-serif" }}
                  >
                    {brandKit.organizerTypes.map(getOrgTypeLabel).join(', ')}
                  </div>
                  <div
                    className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mt-0.5"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                  >
                    Types
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MAIN CONTENT GRID ── */}
        <div className="max-w-5xl mx-auto px-5 py-8 lg:grid lg:grid-cols-[1fr_300px] lg:gap-8">

          {/* LEFT COLUMN */}
          <div className="min-w-0">

            {/* Bio (if present) */}
            {brandKit.bio && (
              <p
                className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mb-6 text-base leading-relaxed"
              >
                {brandKit.bio}
              </p>
            )}

            {/* ── Sale cards grid ── */}
            <div className="mb-8">
              <h2
                className="text-[#1A1814] dark:text-[#F2F0EA] mb-4 text-lg font-semibold"
                style={{ fontFamily: "'Inter Tight', sans-serif", letterSpacing: '-0.02em' }}
              >
                Sales
                <span
                  className="ml-2 text-sm font-normal text-[rgba(26,24,20,0.4)] dark:text-[rgba(242,240,234,0.4)]"
                  style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.02em' }}
                >
                  ({sales.length})
                </span>
              </h2>

              {sales.length === 0 ? (
                <div
                  className="rounded-xl overflow-hidden flex items-center justify-center h-40 text-center px-6"
                  style={{ background: 'repeating-linear-gradient(135deg, #E8E2D6 0 14px, #EFEAE0 14px 28px)' }}
                >
                  <p className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] text-sm">
                    No sales right now — follow to get notified
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {sales.map((sale) => {
                    const featuredImage = sale.photoUrls?.[0];
                    const saleStart = new Date(sale.startDate);
                    const saleEnd = new Date(sale.endDate);
                    const isLive = sale.status === 'PUBLISHED' && saleStart <= now && saleEnd >= now;
                    const isArchived = sale.status !== 'PUBLISHED' || saleEnd < now;
                    const dateStr = saleStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                    return (
                      <Link
                        key={sale.id}
                        href={`/sales/${sale.id}`}
                        className="block rounded-xl overflow-hidden bg-[#FBF8F2] dark:bg-[#121826] border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)] hover:border-[rgba(20,18,14,0.18)] dark:hover:border-[rgba(255,255,255,0.14)] transition-colors relative"
                      >
                        {/* Pinned badge */}
                        {sale.isPinned && (
                          <div
                            className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded text-white text-[10px] font-medium"
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              background: '#C8552B',
                            }}
                          >
                            Pinned
                          </div>
                        )}

                        {/* Photo area */}
                        <div className="h-44 overflow-hidden relative">
                          {featuredImage ? (
                            <img
                              src={featuredImage}
                              alt={sale.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full"
                              style={{ background: 'repeating-linear-gradient(135deg, #E8E2D6 0 14px, #EFEAE0 14px 28px)' }}
                            />
                          )}
                          {/* Status pill overlay */}
                          <div className="absolute top-2 left-2">
                            {isLive ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-white text-[10px] font-medium"
                                style={{ background: '#3F7A4B', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}
                              >
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
                                Live
                              </span>
                            ) : isArchived ? (
                              <span
                                className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium"
                                style={{
                                  background: 'rgba(20,18,14,0.4)',
                                  color: 'white',
                                  fontFamily: "'JetBrains Mono', monospace",
                                  letterSpacing: '0.05em',
                                }}
                              >
                                Archived
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium"
                                style={{
                                  background: 'rgba(200,85,43,0.10)',
                                  color: '#C8552B',
                                  fontFamily: "'JetBrains Mono', monospace",
                                  letterSpacing: '0.05em',
                                }}
                              >
                                {dateStr}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Card body */}
                        <div className="p-4">
                          <h3
                            className="text-[#1A1814] dark:text-[#F2F0EA] font-semibold mb-1 line-clamp-2 leading-snug"
                            style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 15 }}
                          >
                            {sale.title}
                          </h3>
                          <p
                            className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mb-2"
                            style={{ fontSize: 12 }}
                          >
                            {formatLocation(sale.city, sale.state)}
                          </p>

                          {/* Attendance count (#362) */}
                          {sale.attendanceCount != null && sale.attendanceCount > 0 && (
                            <p
                              className="text-[rgba(26,24,20,0.4)] dark:text-[rgba(242,240,234,0.4)] mb-2"
                              style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                            >
                              {sale.attendanceCount.toLocaleString()} attended
                            </p>
                          )}

                          {/* Buyer's Premium badge (#363) */}
                          {sale.saleType === 'AUCTION' && sale.buyersPremiumPct != null && (
                            <div
                              className="inline-block text-xs font-medium px-2 py-0.5 rounded mb-2"
                              style={{
                                background: 'rgba(200,85,43,0.10)',
                                color: '#C8552B',
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 11,
                              }}
                            >
                              Buyer&apos;s Premium: {sale.buyersPremiumPct}%
                            </div>
                          )}

                          {/* Date chip / Retail */}
                          {sale.saleType === 'RETAIL' ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[#3F7A4B] text-xs font-medium"
                              style={{
                                background: 'rgba(63,122,75,0.10)',
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 11,
                                letterSpacing: '0.03em',
                              }}
                            >
                              Always Open
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{
                                background: 'rgba(200,85,43,0.10)',
                                color: '#C8552B',
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 11,
                                letterSpacing: '0.03em',
                              }}
                            >
                              {saleStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Latest broadcast ── */}
            {brandKit.latestBroadcast && (
              <div
                className="rounded-xl bg-[#FBF8F2] dark:bg-[#121826] border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)] overflow-hidden mb-6 flex"
              >
                {/* Left accent stripe */}
                <div className="w-1 flex-shrink-0 bg-[#C8552B]" />
                <div className="p-5 flex-1">
                  <div
                    className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mb-2"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase' }}
                  >
                    Latest update
                  </div>
                  <p className="text-[#1A1814] dark:text-[#F2F0EA] text-sm leading-relaxed mb-3">
                    {brandKit.latestBroadcast.message}
                  </p>
                  <p
                    className="text-[rgba(26,24,20,0.4)] dark:text-[rgba(242,240,234,0.4)]"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                  >
                    {getRelativeTime(brandKit.latestBroadcast.sentAt)}
                  </p>
                </div>
              </div>
            )}

            {/* ── Founding shoppers ── */}
            {brandKit.foundingShoppers && brandKit.foundingShoppers.length > 0 && (
              <div className="rounded-xl bg-[#FBF8F2] dark:bg-[#121826] border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)] p-5 mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2.5">
                    {brandKit.foundingShoppers.slice(0, 3).map((shopper) => (
                      <div
                        key={shopper.id}
                        className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-semibold border-2 border-[#FBF8F2] dark:border-[#121826]"
                        style={{ background: '#C8552B' }}
                        title={shopper.name}
                      >
                        {shopper.name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)]">
                    Discovered by{' '}
                    <span className="font-medium text-[#1A1814] dark:text-[#F2F0EA]">
                      {brandKit.foundingShoppers[0]?.name}
                    </span>
                    {brandKit.foundingShoppers.length > 1 && (
                      <span>
                        {' '}and {brandKit.foundingShoppers.length - 1} other{brandKit.foundingShoppers.length > 2 ? 's' : ''}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT RAIL */}
          <div className="mt-8 lg:mt-0 space-y-4">

            {/* Follow CTA card */}
            <div className="rounded-xl bg-[#FBF8F2] dark:bg-[#121826] border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)] p-5">
              <button
                onClick={() => {}}
                className="w-full py-2.5 rounded-lg bg-[#C8552B] dark:bg-[#E97C4D] text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Follow {brandKit.businessName}
              </button>
              <p
                className="mt-3 text-center text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)]"
                style={{ fontSize: 12 }}
              >
                Get notified of upcoming sales
              </p>
            </div>

            {/* Hours */}
            {hasHours && (
              <div className="rounded-xl bg-[#FBF8F2] dark:bg-[#121826] border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)] p-5">
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)]"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                  >
                    Hours
                  </span>
                  {isOpenNow !== null && (
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: '0.05em',
                        background: isOpenNow ? 'rgba(63,122,75,0.10)' : 'rgba(20,18,14,0.06)',
                        color: isOpenNow ? '#3F7A4B' : 'rgba(26,24,20,0.4)',
                      }}
                    >
                      {isOpenNow ? 'Open now' : 'Closed'}
                    </span>
                  )}
                </div>

                {brandKit.byAppointment ? (
                  <p className="text-sm text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)]">By Appointment</p>
                ) : brandKit.hours && brandKit.hours.length > 0 ? (
                  <div className="space-y-1.5">
                    {[...brandKit.hours].sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((hour) => {
                      const isClosed = !hour.openTime || !hour.closeTime;
                      const isToday = hour.dayOfWeek === now.getDay();
                      return (
                        <div
                          key={hour.dayOfWeek}
                          className="flex justify-between text-xs"
                          style={{ fontWeight: isToday ? 600 : 400 }}
                        >
                          <span className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)]">
                            {dayNames[hour.dayOfWeek]}
                          </span>
                          <span
                            className={isClosed
                              ? 'text-[rgba(26,24,20,0.4)] dark:text-[rgba(242,240,234,0.4)]'
                              : 'text-[#1A1814] dark:text-[#F2F0EA]'}
                          >
                            {isClosed ? 'Closed' : `${hour.openTime} – ${hour.closeTime}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : brandKit.pickupWindows ? (
                  <p className="text-xs text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] whitespace-pre-line">
                    {brandKit.pickupWindows}
                  </p>
                ) : null}
              </div>
            )}

            {/* Contact */}
            {hasContact && (
              <div className="rounded-xl bg-[#FBF8F2] dark:bg-[#121826] border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)] p-5">
                <div
                  className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mb-3"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                  Contact
                </div>
                <div className="space-y-2.5">
                  {brandKit.phone && (
                    <a
                      href={`tel:${brandKit.phone}`}
                      className="flex items-center gap-2.5 text-sm text-[#C8552B] dark:text-[#E97C4D] hover:underline"
                    >
                      <Icon name="phone" size={14} />
                      {brandKit.phone}
                    </a>
                  )}
                  {brandKit.website && (
                    <a
                      href={brandKit.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-sm text-[#C8552B] dark:text-[#E97C4D] hover:underline"
                    >
                      <Icon name="web" size={14} />
                      Website
                      <Icon name="external" size={12} />
                    </a>
                  )}
                  {brandKit.instagram && (
                    <a
                      href={brandKit.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-sm text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] hover:text-[#C8552B] dark:hover:text-[#E97C4D] transition-colors"
                    >
                      <Icon name="instagram" size={14} />
                      Instagram
                    </a>
                  )}
                  {brandKit.facebook && (
                    <a
                      href={brandKit.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-sm text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] hover:text-[#C8552B] dark:hover:text-[#E97C4D] transition-colors"
                    >
                      <Icon name="facebook" size={14} />
                      Facebook
                    </a>
                  )}
                  {brandKit.tiktokUrl && (
                    <a
                      href={brandKit.tiktokUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-sm text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] hover:text-[#C8552B] dark:hover:text-[#E97C4D] transition-colors"
                    >
                      <Icon name="tiktok" size={14} />
                      TikTok
                    </a>
                  )}
                  {brandKit.youtubeUrl && (
                    <a
                      href={brandKit.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-sm text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] hover:text-[#C8552B] dark:hover:text-[#E97C4D] transition-colors"
                    >
                      <Icon name="youtube" size={14} />
                      YouTube
                    </a>
                  )}
                  {brandKit.pinterestUrl && (
                    <a
                      href={brandKit.pinterestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-sm text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] hover:text-[#C8552B] dark:hover:text-[#E97C4D] transition-colors"
                    >
                      <Icon name="pinterest" size={14} />
                      Pinterest
                    </a>
                  )}
                  {brandKit.twitterUrl && (
                    <a
                      href={brandKit.twitterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-sm text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] hover:text-[#C8552B] dark:hover:text-[#E97C4D] transition-colors"
                    >
                      <Icon name="twitter" size={14} />
                      Twitter / X
                    </a>
                  )}
                  {brandKit.etsy && (
                    <a
                      href={brandKit.etsy}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-sm text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] hover:text-[#C8552B] dark:hover:text-[#E97C4D] transition-colors"
                    >
                      <Icon name="external" size={14} />
                      Etsy Shop
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Organizer types chips */}
            {brandKit.organizerTypes.length > 0 && (
              <div className="rounded-xl bg-[#FBF8F2] dark:bg-[#121826] border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)] p-5">
                <div
                  className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mb-3"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                  Sale Types
                </div>
                <div className="flex flex-wrap gap-2">
                  {brandKit.organizerTypes.map((type) => (
                    <span
                      key={type}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)]"
                      style={{ background: 'rgba(20,18,14,0.05)', fontSize: 12 }}
                    >
                      {getOrgTypeLabel(type)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Brand identity swatches (PRO/TEAMS) */}
            {hasBrandColors && (
              <div className="rounded-xl bg-[#FBF8F2] dark:bg-[#121826] border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)] p-5">
                <div
                  className="text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] mb-3"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                  Brand
                </div>
                <div className="flex gap-3">
                  {brandKit.brandPrimaryColor && (
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="h-8 w-8 rounded-lg border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)]"
                        style={{ background: brandKit.brandPrimaryColor }}
                        title={`Primary: ${brandKit.brandPrimaryColor}`}
                      />
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(26,24,20,0.4)' }}>
                        Primary
                      </span>
                    </div>
                  )}
                  {brandKit.brandSecondaryColor && (
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="h-8 w-8 rounded-lg border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)]"
                        style={{ background: brandKit.brandSecondaryColor }}
                        title={`Secondary: ${brandKit.brandSecondaryColor}`}
                      />
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(26,24,20,0.4)' }}>
                        Second
                      </span>
                    </div>
                  )}
                  {brandKit.brandAccentColor && (
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="h-8 w-8 rounded-lg border border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)]"
                        style={{ background: brandKit.brandAccentColor }}
                        title={`Accent: ${brandKit.brandAccentColor}`}
                      />
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(26,24,20,0.4)' }}>
                        Accent
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <footer className="bg-[#FBF8F2] dark:bg-[#121826] border-t border-[rgba(20,18,14,0.10)] dark:border-[rgba(255,255,255,0.08)] py-6 mt-8">
          <div className="max-w-5xl mx-auto px-5 flex items-center justify-between gap-4">
            <span
              className="text-[#1A1814] dark:text-[#F2F0EA] font-semibold text-sm"
              style={{ fontFamily: "'Inter Tight', sans-serif", letterSpacing: '-0.01em' }}
            >
              FindA.Sale
            </span>
            <Link
              href="/"
              className="text-sm text-[rgba(26,24,20,0.62)] dark:text-[rgba(242,240,234,0.62)] hover:text-[#C8552B] dark:hover:text-[#E97C4D] transition-colors"
            >
              Back to home
            </Link>
          </div>
        </footer>
      </div>
    </>
  );
};

export default OrganizerStorefront;
