/**
 * Organizer Storefront Page
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

  // If city is a full US state name, show only state abbreviation to avoid "California, CA"
  if (US_STATE_NAMES.includes(city)) {
    return state;
  }

  return `${city}, ${state}`;
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
      } catch (err: any) {
        console.error('Failed to fetch storefront data:', err);
        setError(err.response?.data?.message || 'Storefront not found');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-warm-700 dark:text-gray-300">Loading storefront...</p>
        </div>
      </div>
    );
  }

  if (error || !brandKit) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-2">Storefront Not Found</h1>
          <p className="text-warm-600 dark:text-gray-400 mb-6">{error || 'This organizer storefront does not exist.'}</p>
          <Link href="/" className="text-amber-600 hover:underline font-medium">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const bannerStyle = {
    backgroundColor: brandKit.brandPrimaryColor || '#8FB897',
    fontFamily: brandKit.brandFontFamily || 'system-ui, -apple-system, sans-serif',
  };

  const accentStyle = {
    color: brandKit.brandAccentColor || brandKit.brandSecondaryColor || '#1E40AF',
  };

  return (
    <>
      <Head>
        <title>{brandKit.businessName} - FindA.Sale</title>
        <meta name="description" content={brandKit.bio || `Shop sales from ${brandKit.businessName}`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Banner with Brand Colors */}
        <div style={bannerStyle} className="py-12 text-white shadow-sm">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center gap-6">
              {/* Profile Photo or Logo */}
              {brandKit.profilePhoto ? (
                <img
                  src={brandKit.profilePhoto}
                  alt={brandKit.businessName}
                  className="h-24 w-24 object-cover bg-white dark:bg-gray-800 rounded-full border-2 border-white shadow-lg flex-shrink-0"
                />
              ) : brandKit.brandLogoUrl ? (
                <img
                  src={brandKit.brandLogoUrl}
                  alt={brandKit.businessName}
                  className="h-24 w-24 object-contain bg-white dark:bg-gray-800 rounded-lg p-2 flex-shrink-0"
                />
              ) : (
                <div className="h-24 w-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0 border-2 border-white/40">
                  <span className="text-3xl font-bold text-white/60">
                    {brandKit.businessName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Header Info */}
              <div className="flex-1">
                <h1 className="text-4xl font-bold mb-2">{brandKit.businessName}</h1>
                {brandKit.tagline && <p className="text-lg opacity-80 italic mb-3">{brandKit.tagline}</p>}
                {brandKit.bio && <p className="text-lg opacity-90 max-w-lg">{brandKit.bio}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Banner Image (PRO) */}
        {brandKit.brandBannerImageUrl && (
          <div className="h-40 overflow-hidden">
            <img
              src={brandKit.brandBannerImageUrl}
              alt="Banner"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Feature #361: Claim-This-Listing Banner */}
        {!isClaimed && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 py-3 px-4">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                🏷️ Is this your business? Claim this listing to manage your storefront, add photos, and connect with shoppers.
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

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Organizer Info Card - Show if bio exists or has branding info */}
          {(brandKit.bio || brandKit.phone || brandKit.address || brandKit.yearFounded || brandKit.website || Object.values({facebook: brandKit.facebook, instagram: brandKit.instagram, etsy: brandKit.etsy, twitterUrl: brandKit.twitterUrl, tiktokUrl: brandKit.tiktokUrl, youtubeUrl: brandKit.youtubeUrl, pinterestUrl: brandKit.pinterestUrl}).some(link => link)) && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 mb-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Contact & Links */}
              <div>
                <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-4">About This Organizer</h2>
                {brandKit.bio ? (
                  <p className="text-warm-700 dark:text-gray-300 mb-6">{brandKit.bio}</p>
                ) : (
                  <div className="h-0" />
                )}

                {/* Phone */}
                {brandKit.phone && (
                  <p className="text-warm-700 dark:text-gray-300 mb-3">
                    <a
                      href={`tel:${brandKit.phone}`}
                      className="text-amber-600 hover:underline font-medium"
                    >
                      {brandKit.phone}
                    </a>
                  </p>
                )}

                {/* Address */}
                {brandKit.address && (
                  <p className="text-sm text-warm-600 dark:text-gray-400 mb-6">
                    {brandKit.address}
                  </p>
                )}

                {brandKit.yearFounded && (
                  <p className="text-sm text-warm-500 dark:text-gray-400 mb-6">
                    Est. {brandKit.yearFounded}
                  </p>
                )}

                {/* Organizer Types */}
                {brandKit.organizerTypes && brandKit.organizerTypes.length > 0 && (
                  <div className="mb-6 flex flex-wrap gap-2">
                    {brandKit.organizerTypes.map((type) => (
                      <span
                        key={type}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                      >
                        {getOrgTypeLabel(type)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Business Hours */}
                {brandKit.byAppointment ? (
                  <div className="mb-6 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg">
                    <h3 className="font-semibold text-warm-900 dark:text-gray-100 mb-2">Hours</h3>
                    <p className="text-sm text-warm-700 dark:text-gray-300">By Appointment</p>
                  </div>
                ) : brandKit.hours && brandKit.hours.length > 0 ? (
                  <div className="mb-6 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg">
                    <h3 className="font-semibold text-warm-900 dark:text-gray-100 mb-3">Hours</h3>
                    <div className="space-y-1">
                      {[...brandKit.hours].sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((hour) => {
                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const isClosed = !hour.openTime || !hour.closeTime;
                        return (
                          <p key={hour.dayOfWeek} className="text-sm text-warm-700 dark:text-gray-300">
                            {dayNames[hour.dayOfWeek]}{' '}
                            {isClosed ? (
                              <span className="text-warm-500 dark:text-gray-400">Closed</span>
                            ) : (
                              <span>{hour.openTime} – {hour.closeTime}</span>
                            )}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ) : brandKit.pickupWindows ? (
                  <div className="mb-6 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg">
                    <h3 className="font-semibold text-warm-900 dark:text-gray-100 mb-2">Hours</h3>
                    <p className="text-sm text-warm-700 dark:text-gray-300 whitespace-pre-line">
                      {brandKit.pickupWindows}
                    </p>
                  </div>
                ) : null}

                {/* Social Links */}
                <div className="space-y-3">
                  {brandKit.website && (
                    <a
                      href={brandKit.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      Visit Website
                    </a>
                  )}
                  {brandKit.facebook && (
                    <a
                      href={brandKit.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      Facebook
                    </a>
                  )}
                  {brandKit.instagram && (
                    <a
                      href={brandKit.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      Instagram
                    </a>
                  )}
                  {brandKit.etsy && (
                    <a
                      href={brandKit.etsy}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      Etsy Shop
                    </a>
                  )}
                  {brandKit.twitterUrl && (
                    <a
                      href={brandKit.twitterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      Twitter/X
                    </a>
                  )}
                  {brandKit.tiktokUrl && (
                    <a
                      href={brandKit.tiktokUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      TikTok
                    </a>
                  )}
                  {brandKit.youtubeUrl && (
                    <a
                      href={brandKit.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      YouTube
                    </a>
                  )}
                  {brandKit.pinterestUrl && (
                    <a
                      href={brandKit.pinterestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-amber-600 hover:underline font-medium"
                    >
                      Pinterest
                    </a>
                  )}
                </div>
              </div>

              {/* Brand Colors Preview (PRO) */}
              {(brandKit.subscriptionTier === 'PRO' || brandKit.subscriptionTier === 'TEAMS') && (
                <div>
                  <h3 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Brand Identity</h3>
                  <div className="space-y-3">
                    {brandKit.brandPrimaryColor && (
                      <div className="flex items-center gap-3">
                        <div
                          className="h-12 w-12 rounded-lg border-2 border-warm-300 dark:border-gray-600"
                          style={{ backgroundColor: brandKit.brandPrimaryColor }}
                          title={brandKit.brandPrimaryColor}
                        />
                        <span className="text-warm-700 dark:text-gray-300">
                          Primary: {brandKit.brandPrimaryColor}
                        </span>
                      </div>
                    )}
                    {brandKit.brandSecondaryColor && (
                      <div className="flex items-center gap-3">
                        <div
                          className="h-12 w-12 rounded-lg border-2 border-warm-300 dark:border-gray-600"
                          style={{ backgroundColor: brandKit.brandSecondaryColor }}
                          title={brandKit.brandSecondaryColor}
                        />
                        <span className="text-warm-700 dark:text-gray-300">
                          Secondary: {brandKit.brandSecondaryColor}
                        </span>
                      </div>
                    )}
                    {brandKit.brandAccentColor && (
                      <div className="flex items-center gap-3">
                        <div
                          className="h-12 w-12 rounded-lg border-2 border-warm-300 dark:border-gray-600"
                          style={{ backgroundColor: brandKit.brandAccentColor }}
                          title={brandKit.brandAccentColor}
                        />
                        <span className="text-warm-700 dark:text-gray-300">
                          Accent: {brandKit.brandAccentColor}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Feature #356: Latest Broadcast */}
          {brandKit.latestBroadcast && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-12 border-l-4 border-amber-500">
              <h2 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-3">Latest Update</h2>
              <p className="text-warm-700 dark:text-gray-300 mb-3">{brandKit.latestBroadcast.message}</p>
              <p className="text-xs text-warm-500 dark:text-gray-400">
                {getRelativeTime(brandKit.latestBroadcast.sentAt)}
              </p>
            </div>
          )}

          {/* Founding Shoppers */}
          {brandKit.foundingShoppers && brandKit.foundingShoppers.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-12">
              <h2 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Discovered By</h2>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3">
                  {brandKit.foundingShoppers.slice(0, 3).map((shopper) => (
                    <div
                      key={shopper.id}
                      className="h-10 w-10 rounded-full bg-gradient-to-br from-sage-400 to-sage-600 flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-800"
                      title={shopper.name}
                    >
                      {shopper.name.charAt(0).toUpperCase()}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-warm-700 dark:text-gray-300">
                  Discovered by <span className="font-semibold">{brandKit.foundingShoppers[0]?.name}</span>
                  {brandKit.foundingShoppers.length > 1 && (
                    <span> and {brandKit.foundingShoppers.length - 1} other{brandKit.foundingShoppers.length > 2 ? 's' : ''}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Active Sales */}
          <div>
            <h2 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-8">
              Active Sales ({sales.length})
            </h2>

            {sales.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
                <p className="text-warm-600 dark:text-gray-400 text-lg">
                  No active sales at the moment. Check back soon!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sales.map((sale) => {
                  const featuredImage = sale.photoUrls?.[0];
                  const saleDate = new Date(sale.startDate);
                  const dateStr = saleDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <Link
                      key={sale.id}
                      href={`/sales/${sale.id}`}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow relative"
                    >
                      {/* Featured Badge */}
                      {sale.isPinned && (
                        <div className="absolute top-2 right-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1 rounded text-xs font-semibold border border-amber-200 dark:border-amber-700 z-10">
                          Featured
                        </div>
                      )}

                      {/* Sale Image */}
                      <div className="h-40 overflow-hidden bg-gradient-to-br from-warm-100 to-warm-200 dark:from-gray-600 dark:to-gray-700 relative">
                        {featuredImage ? (
                          <img
                            src={featuredImage}
                            alt={sale.title}
                            className="w-full h-full object-cover hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-warm-400 dark:text-gray-400">
                            <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                            </svg>
                            <p className="text-xs font-medium text-center px-2">{sale.title}</p>
                          </div>
                        )}
                      </div>

                      {/* Sale Info */}
                      <div className="p-4">
                        <h3 className="font-bold text-warm-900 dark:text-gray-100 mb-2 line-clamp-2">
                          {sale.title}
                        </h3>
                        <p className="text-sm text-warm-600 dark:text-gray-400 mb-2">
                          {formatLocation(sale.city, sale.state)}
                        </p>
                        {/* Attendance count (#362) */}
                        {sale.attendanceCount != null && sale.attendanceCount > 0 && (
                          <p className="text-xs text-warm-500 dark:text-gray-400 mb-2">
                            👥 {sale.attendanceCount.toLocaleString()} attended
                          </p>
                        )}
                        {/* Buyer's Premium badge (#363) */}
                        {sale.saleType === 'AUCTION' && sale.buyersPremiumPct != null && (
                          <div className="inline-block text-xs font-semibold px-2 py-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 mb-3">
                            Buyer's Premium: {sale.buyersPremiumPct}%
                          </div>
                        )}
                        {sale.saleType === 'RETAIL' ? (
                          <div className="flex flex-col gap-2">
                            <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 w-fit">
                              🟢 Always Open
                            </div>
                            {brandKit.pickupWindows && (
                              <p className="text-xs text-warm-600 dark:text-gray-400 whitespace-pre-line">
                                {brandKit.pickupWindows}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div
                            className="inline-block text-xs font-semibold px-3 py-1 rounded-full"
                            style={{
                              backgroundColor: brandKit.brandPrimaryColor || '#8FB897',
                              color: 'white',
                            }}
                          >
                            {dateStr}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Back to Home */}
      <div className="bg-white dark:bg-gray-800 border-t border-warm-200 dark:border-gray-700 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <Link href="/" className="text-amber-600 hover:underline font-medium">
            Back to FindA.Sale Home
          </Link>
        </div>
      </div>
    </>
  );
};

export default OrganizerStorefront;
