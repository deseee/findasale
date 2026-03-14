import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import CheckoutModal from '../../components/CheckoutModal';
import { useToast } from '../../components/ToastContext';
import { format, parseISO } from 'date-fns';
import SaleSubscription from '../../components/SaleSubscription';
import CSVImportModal from '../../components/CSVImportModal';
import SaleShareButton from '../../components/SaleShareButton';
import SaleQRCode from '../../components/SaleQRCode';
import SaleMap from '../../components/SaleMap';
import Skeleton from '../../components/Skeleton';
import BadgeDisplay from '../../components/BadgeDisplay';
import OrganizerTierBadge from '../../components/OrganizerTierBadge'; // Phase 31: Tier Rewards
import AuctionCountdown from '../../components/AuctionCountdown';
import PhotoLightbox from '../../components/PhotoLightbox';
import SaleTourGallery from '../../components/SaleTourGallery';
import { getThumbnailUrl, getOptimizedUrl, getLqipUrl } from '../../lib/imageUtils';
import ReviewsSection from '../../components/ReviewsSection';
import FlashDealBanner from '../../components/FlashDealBanner';
import PickupBookingCard from '../../components/PickupBookingCard';
import ActivityFeed from '../../components/ActivityFeed';
import FollowOrganizerButton from '../../components/FollowOrganizerButton'; // Phase 17
import HypeMeter from '../../components/HypeMeter'; // Feature 34: Hype Meter

interface Sale {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  status?: string;
  photoUrls: string[];
  organizer: {
    id: string;
    userId: string;
    businessName: string;
    phone: string;
    address: string;
    tier?: 'BRONZE' | 'SILVER' | 'GOLD'; // Phase 31: Tier Rewards
    badges?: Array<{
      id: string;
      name: string;
      description: string;
      iconUrl?: string;
    }>;
    avgRating?: number;
    reviewCount?: number;
  };
  items: {
    id: string;
    title: string;
    description: string;
    price: number;
    auctionStartPrice: number;
    currentBid: number;
    bidIncrement: number;
    auctionEndTime: string;
    status: string;
    category?: string;
    condition?: string;
    photoUrls: string[];
  }[];
  isAuctionSale: boolean;
  // Feature 35: Front Door Locator
  entranceLat?: number;
  entranceLng?: number;
  entranceNote?: string;
}

interface Bid {
  id: string;
  amount: number;
  user: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
}

const SaleDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [checkoutItem, setCheckoutItem] = useState<{ id: string; title: string } | null>(null);
  const [bidAmounts, setBidAmounts] = useState<{ [itemId: string]: string }>({});
  const [biddingItemId, setBiddingItemId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [downloadingKit, setDownloadingKit] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Refresh sale data every 5 seconds to pick up new bids and inventory changes
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(
      () => queryClient.invalidateQueries({ queryKey: ['sale', id] }),
      5000
    );
    return () => clearInterval(interval);
  }, [id, queryClient]);

  // Track QR scan — fires once when utm_source=qr_sign is in the URL
  useEffect(() => {
    if (!id || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('utm_source') === 'qr_sign') {
      api.post(`/sales/${id}/track-scan`).catch(() => { /* non-fatal */ });
    }
  }, [id]);

  // Phase 19: Award 1 point for visiting a sale page (once per sale per day, auth required)
  // Phase 27: Show amber toast when points are awarded
  useEffect(() => {
    if (!id || !user) return;
    api.post('/points/track-visit', { saleId: id })
      .then((res) => { if (res.data?.awarded === true) showToast('🏆 +1 pt earned!', 'points'); })
      .catch(() => { /* non-fatal */ });
  }, [id, user]);

  const { data: sale, isLoading, isError } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      if (!id) throw new Error('No sale ID provided');
      const response = await api.get(`/sales/${id}`);
      return response.data as Sale;
    },
    enabled: !!id,
  });

  const handleBuyNow = (itemId: string, itemTitle: string) => {
    setCheckoutItem({ id: itemId, title: itemTitle });
  };

  const handleCheckoutClose = () => {
    setCheckoutItem(null);
  };

  const handleCheckoutSuccess = () => {
    setCheckoutItem(null);
    queryClient.invalidateQueries({ queryKey: ['sale', id] });
  };

  const handlePlaceBid = async (itemId: string) => {
    const amount = parseFloat(bidAmounts[itemId]);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid bid amount', 'error');
      return;
    }

    setBiddingItemId(itemId);
    try {
      await api.post(`/items/${itemId}/bid`, { amount });
      showToast('Bid placed successfully!', 'success');
      setBidAmounts(prev => ({ ...prev, [itemId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
    } catch (err: any) {
      console.error('Bid error:', err);
      showToast(err.response?.data?.message || 'Failed to place bid. Please try again.', 'error');
    } finally {
      setBiddingItemId(null);
    }
  };

  const handleBidAmountChange = (itemId: string, value: string) => {
    setBidAmounts(prev => ({ ...prev, [itemId]: value }));
  };

  const handleImportComplete = () => {
    // Close the modal and refresh the sale data
    setIsImportModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['sale', id] });
  };

  const formatPrice = (amount: number) => `$${amount.toFixed(2)}`;

  const handleDownloadMarketingKit = async () => {
    if (!sale || typeof window === 'undefined') return;
    setDownloadingKit(true);
    try {
      const response = await api.post(
        `/sales/${sale.id}/generate-marketing-kit`,
        {},
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `marketing-kit-${sale.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('Marketing kit downloaded!', 'success');
    } catch {
      showToast('Failed to generate marketing kit. Please try again.', 'error');
    } finally {
      setDownloadingKit(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50">
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-5 w-28 mb-6" />
          <div className="bg-white rounded-lg shadow-md p-6 mb-8"></div>
          <Skeleton className="h-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <Skeleton className="h-96" />
            </div>
            <div>
              <Skeleton className="h-40" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (isError || !sale) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-warm-900 mb-2">Sale not found</h1>
          <p className="text-warm-600 mb-6">The sale you're looking for doesn't exist.</p>
          <Link href="/" className="text-amber-600 hover:text-amber-700 font-medium">
            Back to browse sales
          </Link>
        </div>
      </div>
    );
  }

  const isOrganizer = user?.id === sale.organizer.userId;
  const saleStartDate = parseISO(sale.startDate);
  const saleEndDate = parseISO(sale.endDate);
  const now = new Date();
  const saleHasStarted = now >= saleStartDate;
  const saleHasEnded = now >= saleEndDate;

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || 'https://findasale.com');
  const ogImageUrl = `${siteUrl}/api/og?${new URLSearchParams({
    type: 'sale',
    title: sale.title,
    date: `${format(saleStartDate, 'MMM d')}–${format(saleEndDate, 'MMM d, yyyy')}`,
    location: `${sale.city}, ${sale.state}`,
    itemCount: sale.items?.length?.toString() || '0',
    organizer: sale.organizer?.businessName || '',
  }).toString()}`;

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>{sale.title} - FindA.Sale</title>
        <meta name="description" content={`${sale.title} in ${sale.city}, ${sale.state}. ${sale.items?.length || 0} items. ${format(saleStartDate, 'MMM d')}–${format(saleEndDate, 'MMM d, yyyy')}.`} />
        <meta property="og:title" content={`${sale.title} — FindA.Sale`} />
        <meta property="og:description" content={`Estate sale in ${sale.city}, ${sale.state}. ${sale.items?.length || 0} items. ${format(saleStartDate, 'MMM d')}–${format(saleEndDate, 'MMM d, yyyy')}`} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:url" content={`${siteUrl}/sales/${sale.id}`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${sale.title} — FindA.Sale`} />
        <meta name="twitter:description" content={`Estate sale in ${sale.city}, ${sale.state}. ${sale.items?.length || 0} items. ${format(saleStartDate, 'MMM d')}–${format(saleEndDate, 'MMM d, yyyy')}`} />
        <meta name="twitter:image" content={ogImageUrl} />
        {/* Structured data — Event schema for Google rich results */}
        {sale && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'Event',
                name: sale.title || '',
                description: sale.description || '',
                startDate: sale.startDate || '',
                endDate: sale.endDate || '',
                eventStatus: 'https://schema.org/EventScheduled',
                eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
                location: {
                  '@type': 'Place',
                  name: sale.title || '',
                  address: {
                    '@type': 'PostalAddress',
                    streetAddress: sale.address || '',
                    addressLocality: sale.city || '',
                    addressRegion: sale.state || '',
                    addressCountry: 'US',
                  },
                },
                organizer: {
                  '@type': 'Organization',
                  name: sale.organizer?.businessName || 'Estate Sale Organizer',
                },
                url: `https://finda.sale/sales/${sale.id}`,
                image: sale.photoUrls?.[0] || '',
              }),
            }}
          />
        )}
      </Head>

      <main className="container mx-auto px-4 py-8">
        <Link href="/" className="text-amber-600 hover:text-amber-700 font-medium mb-6 inline-block">
          ← Back to browse sales
        </Link>

        {/* Sale Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-warm-900 mb-2">{sale.title}</h1>
              <p className="text-lg text-warm-700 mb-4">
                {sale.address}, {sale.city}, {sale.state} {sale.zip}
              </p>
              <p className="text-sm text-warm-600 mb-4">
                {format(saleStartDate, 'MMM d, yyyy h:mm a')} - {format(saleEndDate, 'MMM d, yyyy h:mm a')}
              </p>
              {sale.status && (
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  sale.status === 'active' ? 'bg-green-100 text-green-800' :
                  sale.status === 'upcoming' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <SaleShareButton saleId={sale.id} saleTitle={sale.title} saleLocation={`${sale.city}, ${sale.state}`} saleDate={sale.startDate} userId={user?.id} />
            </div>
          </div>
        </div>

        {/* Feature 34: Hype Meter — live viewer count */}
        <HypeMeter saleId={sale.id} />

        {/* Organizer Info Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-warm-900 mb-2">Organized by</h2>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-lg font-semibold text-warm-800">{sale.organizer.businessName}</p>
                {/* Phase 31: Show tier badge if SILVER or GOLD */}
                {sale.organizer.tier && (sale.organizer.tier === 'SILVER' || sale.organizer.tier === 'GOLD') && (
                  <OrganizerTierBadge tier={sale.organizer.tier} />
                )}
              </div>
              <p className="text-sm text-warm-600 mb-4">{sale.organizer.phone}</p>
              {sale.organizer.avgRating && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-medium text-warm-700">Rating:</span>
                  <span className="text-sm text-warm-600">{sale.organizer.avgRating.toFixed(1)}/5.0</span>
                  <span className="text-sm text-warm-500">({sale.organizer.reviewCount || 0} reviews)</span>
                </div>
              )}
              <BadgeDisplay badges={sale.organizer.badges || []} />
            </div>
            {!isOrganizer && (
              <div className="ml-4 flex-shrink-0">
                <FollowOrganizerButton
                  organizerId={sale.organizer.userId}
                  organizerName={sale.organizer.businessName}
                />
              </div>
            )}
            {isOrganizer && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => router.push(`/organizer/edit-sale/${sale.id}`)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium"
                >
                  Edit Sale
                </button>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
                >
                  Import Items
                </button>
                <button
                  onClick={handleDownloadMarketingKit}
                  disabled={downloadingKit}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium disabled:opacity-50"
                >
                  {downloadingKit ? 'Generating...' : 'Download Kit'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Flash Deal Banner */}
        <FlashDealBanner saleId={sale.id} itemIds={sale.items.map((item) => item.id)} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Photos & Map */}
          <div className="lg:col-span-2">
            {/* Main Photo Gallery */}
            {sale.photoUrls.length > 0 && (
              <div className="mb-8">
                <div
                  className="relative bg-warm-200 rounded-lg shadow-md overflow-hidden cursor-pointer h-96"
                  onClick={() => setLightboxOpen(true)}
                >
                  <img
                    src={getThumbnailUrl(sale.photoUrls[currentPhotoIndex])}
                    alt={`Sale photo ${currentPhotoIndex + 1}`}
                    className="w-full h-full object-cover hover:opacity-90 transition"
                  />
                  {sale.photoUrls.length > 1 && (
                    <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm">
                      {currentPhotoIndex + 1} / {sale.photoUrls.length}
                    </div>
                  )}
                </div>
                {sale.photoUrls.length > 1 && (
                  <div className="flex gap-2 mt-4 overflow-x-auto">
                    {sale.photoUrls.map((url, idx) => (
                      <img
                        key={idx}
                        src={getThumbnailUrl(url)}
                        alt={`Thumbnail ${idx + 1}`}
                        className={`h-20 w-20 object-cover rounded cursor-pointer transition ${
                          idx === currentPhotoIndex ? 'ring-2 ring-amber-600' : ''
                        }`}
                        onClick={() => setCurrentPhotoIndex(idx)}
                      />
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setTourOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                  aria-label={`Take a tour of ${sale.title}`}
                >
                  <span>🎬</span>
                  <span>Take a Tour</span>
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            {/* Share Buttons */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-lg font-bold text-warm-900 mb-4">Share</h2>
              <div className="flex flex-col gap-2">
                {/* Facebook Share */}
                <button
                  onClick={() => {
                    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`;
                    window.open(url, '_blank');
                  }}
                  className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                  <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Facebook
                </button>

                {/* Post to Nextdoor Button */}
                <button 
                  onClick={() => {
                    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.clipboard) {
                      const postText = `Check out this estate sale on FindA.Sale!\n\n${sale.title}\n${sale.address}, ${sale.city}, ${sale.state}\n${format(new Date(sale.startDate), 'MMM d, yyyy h:mm a')} - ${format(new Date(sale.endDate), 'MMM d, yyyy h:mm a')}\n\n${window.location.origin}/sales/${sale.id}`;
                      navigator.clipboard.writeText(postText);
                      showToast('Post text copied to clipboard! Paste it into Nextdoor.', 'success');
                    } else {
                      showToast('Clipboard not available', 'error');
                    }
                  }}
                  className="flex items-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 3 3 0 004.242 0l3-3a3 3 0 00-4.242-4.242l-3 3a3 3 0 000 4.242 1 1 0 101.414-1.414 1 1 0 010-1.414l3-3z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M14.586 10.586a2 2 0 012.828 0 3 3 0 010 4.242l-3 3a3 3 0 01-4.242 0 1 1 0 101.414 1.414 1 1 0 001.414 0l3-3a1 1 0 000-1.414 1 1 0 00-1.414 0l-3 3a1 1 0 101.414 1.414 3 3 0 010-4.242 1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                  Nextdoor
                </button>
              </div>
            </div>

            {/* CD2-P2: QR Code for print marketing */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-lg font-bold text-warm-900 mb-2">QR Code</h2>
              <p className="text-xs text-warm-400 mb-4">Print on signs or flyers to drive foot traffic to this sale.</p>
              <SaleQRCode saleId={sale.id} saleTitle={sale.title} size={180} />
            </div>

            {/* Organizer Contact */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-lg font-bold text-warm-900 mb-4">Contact Info</h2>
              <p className="text-sm text-warm-600 mb-2">
                <span className="font-medium text-warm-900">Phone:</span> {sale.organizer.phone}
              </p>
              <p className="text-sm text-warm-600 mb-4">
                <span className="font-medium text-warm-900">Address:</span> {sale.organizer.address}
              </p>

              {/* Route Planning Button */}
              {sale.address && sale.city && sale.state && (
                <button
                  onClick={() => {
                    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      `${sale.address}, ${sale.city}, ${sale.state}`
                    )}`;
                    window.open(mapsUrl, '_blank');
                  }}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v6m-6-10l3-3m0 0l3 3m-3-3v10"
                    />
                  </svg>
                  Plan My Route in Maps
                </button>
              )}
            </div>

            {/* Live Activity Feed */}
            <ActivityFeed saleId={sale.id} />

            {/* Pickup Scheduling */}
            {user && <PickupBookingCard saleId={sale.id} />}

            {/* Reviews Section */}
            <ReviewsSection mode="sale" saleId={sale.id} />
          </div>
        </div>

        {/* Photo Gallery — Phase 18: click to open lightbox */}
        {sale.photoUrls && sale.photoUrls.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4 text-warm-900">
              Photos
              <span className="ml-2 text-sm font-normal text-warm-400">
                ({sale.photoUrls.length})
              </span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {sale.photoUrls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => { setCurrentPhotoIndex(i); setLightboxOpen(true); }}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-warm-200 bg-warm-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  aria-label={`View photo ${i + 1} of ${sale.photoUrls.length}`}
                >
                  <img
                    src={getThumbnailUrl(url) || url}
                    alt={`${sale.title} photo ${i + 1}`}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-warm-900 mb-4">About</h2>
          <p className="text-warm-700 whitespace-pre-wrap leading-relaxed">{sale.description}</p>
        </div>

        {/* Map Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-warm-900">Location</h2>
          {sale.lat && sale.lng ? (
            <SaleMap
              singlePin={{
                lat: sale.lat,
                lng: sale.lng,
                label: `${sale.title} — ${sale.address}, ${sale.city}, ${sale.state}`,
              }}
              entrancePin={sale.entranceLat && sale.entranceLng ? {
                lat: sale.entranceLat,
                lng: sale.entranceLng,
                note: sale.entranceNote,
              } : undefined}
              height="360px"
            />
          ) : (
            <div className="h-72 bg-warm-100 rounded-lg flex items-center justify-center">
              <p className="text-warm-500">Location not available</p>
            </div>
          )}
          <p className="mt-3 text-sm text-warm-500">
            {sale.address}, {sale.city}, {sale.state} {sale.zip}
          </p>
        </div>

        {/* Items Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-warm-900">
              {sale.isAuctionSale ? 'Auction Items' : 'Items for Sale'}
            </h2>
            {isOrganizer && sale.items.length > 0 && (
              <div className="flex space-x-2">
                <Link 
                  href={`/organizer/add-items/${sale.id}`}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add More Items
                </Link>
              </div>
            )}
          </div>

          {/* CD2 Phase 1: Scarcity + Social Proof Stats Bar */}
          {sale.items.length > 0 && (() => {
            const availableCount = sale.items.filter(i => i.status === 'ACTIVE').length;
            const soldCount = sale.items.filter(i => i.status === 'SOLD' || i.status === 'PENDING').length;
            const reservedCount = sale.items.filter(i => i.status === 'RESERVED').length;
            const isLowStock = availableCount > 0 && availableCount <= Math.max(3, Math.floor(sale.items.length * 0.2));
            const isSoldOut = availableCount === 0;
            return (
              <div className="mb-5 flex flex-wrap items-center gap-3">
                {isSoldOut ? (
                  <span className="inline-flex items-center gap-1 bg-warm-100 text-warm-600 text-sm font-semibold px-3 py-1.5 rounded-full">
                    All items sold or reserved
                  </span>
                ) : isLowStock ? (
                  <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-sm font-bold px-3 py-1.5 rounded-full ring-1 ring-red-200 animate-pulse">
                    🔥 Only {availableCount} left!
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-sm font-semibold px-3 py-1.5 rounded-full">
                    ✓ {availableCount} available
                  </span>
                )}
                {soldCount > 0 && (
                  <span className="text-sm text-warm-500">
                    {soldCount} sold
                  </span>
                )}
                {reservedCount > 0 && (
                  <span className="text-sm text-amber-600 font-medium">
                    {reservedCount} on hold
                  </span>
                )}
              </div>
            );
          })()}

          {/* Category Filter */}
          {sale.items && sale.items.some((item) => item.category) && (
            <div className="mb-6">
              <p className="text-sm font-medium text-warm-700 mb-2">Filter by category:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === null
                      ? 'bg-amber-600 text-white'
                      : 'bg-warm-200 text-warm-700 hover:bg-warm-300'
                  }`}
                >
                  All ({sale.items.length})
                </button>
                {Array.from(new Set(sale.items.map((item) => item.category).filter(Boolean))).map(
                  (category) => {
                    const count = sale.items.filter((item) => item.category === category).length;
                    return (
                      <button
                        key={category}
                        onClick={() => setSelectedCategory(category as string)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          selectedCategory === category
                            ? 'bg-amber-600 text-white'
                            : 'bg-warm-200 text-warm-700 hover:bg-warm-300'
                        }`}
                      >
                        {(category as string).charAt(0).toUpperCase() + (category as string).slice(1)} ({count})
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          )}

          {sale.items.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-warm-600 mb-4">No items listed for this sale yet.</p>
              {isOrganizer && (
                <Link 
                  href={`/organizer/add-items/${sale.id}`}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add Your First Item
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sale.items
                .filter(
                  (item) =>
                    selectedCategory === null || item.category === selectedCategory
                )
                .map((item) => (
                <div key={item.id} className="border rounded-lg overflow-hidden bg-white">
                  <Link href={`/items/${item.id}`} className="block">
                    {item.photoUrls.length > 0 ? (
                      <img
                        src={getOptimizedUrl(item.photoUrls[0])}
                        alt={item.title}
                        className="w-full h-48 object-cover"
                       loading="lazy"/>
                    ) : (
                      <div className="bg-warm-200 h-48 flex items-center justify-center">
                        <span className="text-warm-500">No image</span>
                      </div>
                    )}
                  </Link>
                  <div className="p-4">
                    <h3 className="font-bold text-lg mb-2 text-warm-900">{item.title}</h3>
                    <p className="text-warm-600 text-sm mb-3 line-clamp-2">{item.description}</p>

                    {/* Category, Condition, Auction, and Status badges */}
                    {(item.category || item.condition || item.auctionEndTime || item.status === 'RESERVED' || item.status === 'SOLD' || item.status === 'PENDING') && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {/* CD2: Status social-proof badges */}
                        {item.status === 'RESERVED' && (
                          <span className="inline-block bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide">
                            🔒 On Hold
                          </span>
                        )}
                        {(item.status === 'SOLD' || item.status === 'PENDING') && (
                          <span className="inline-block bg-warm-700 text-white px-2 py-1 rounded text-xs font-bold uppercase tracking-wide">
                            ✓ Sold
                          </span>
                        )}
                        {item.auctionEndTime && (
                          <span className="inline-block bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide">
                            🔨 Auction
                          </span>
                        )}
                        {item.category && (
                          <span className="inline-block bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-medium">
                            {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                          </span>
                        )}
                        {item.condition && (
                          <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                            {item.condition.charAt(0).toUpperCase() + item.condition.slice(1)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Auction-specific UI */}
                    {sale.isAuctionSale && item.auctionStartPrice ? (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <div>
                            <span className="text-sm text-warm-600">Current Bid:</span>
                            <span className="font-bold text-amber-600 ml-1">
                              {formatPrice(item.currentBid || item.auctionStartPrice)}
                            </span>
                          </div>
                          {item.auctionEndTime && (
                            <AuctionCountdown
                              endTime={item.auctionEndTime}
                              onExpired={() => queryClient.invalidateQueries({ queryKey: ['sale', id] })}
                            />
                          )}
                        </div>
                        
                        <div className="mb-2">
                          <span className="text-sm text-warm-600">
                            Minimum bid: {formatPrice((item.currentBid || item.auctionStartPrice) + (item.bidIncrement || 1))}
                          </span>
                        </div>
                        
                        {!isOrganizer && user && item.status === 'AVAILABLE' && item.auctionEndTime && new Date(item.auctionEndTime) > new Date() && (
                          <div className="flex mb-2">
                            <input
                              type="number"
                              step="0.01"
                              min={(item.currentBid || item.auctionStartPrice) + (item.bidIncrement || 1)}
                              value={bidAmounts[item.id] || ''}
                              onChange={(e) => handleBidAmountChange(item.id, e.target.value)}
                              className="flex-grow px-2 py-1 border border-warm-300 rounded-l text-sm text-warm-900"
                              placeholder="Enter bid amount"
                            />
                            <button
                              onClick={() => handlePlaceBid(item.id)}
                              disabled={biddingItemId === item.id}
                              className="bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-1 rounded-r disabled:opacity-50"
                            >
                              {biddingItemId === item.id ? '...' : 'Bid'}
                            </button>
                          </div>
                        )}
                        
                        {item.status === 'AUCTION_ENDED' && (
                          <div className="text-sm text-center py-2 bg-warm-100 rounded text-warm-600">
                            Auction ended
                          </div>
                        )}
                        
                        {item.status === 'SOLD' && (
                          <div className="text-sm text-center py-2 bg-green-100 text-green-800 rounded">
                            Item sold
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Regular sale item */
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-amber-600">
                          {formatPrice(item.price)}
                        </span>
                        {item.currentBid && (
                          <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                            Current bid: {formatPrice(item.currentBid)}
                          </span>
                        )}
                      </div>
                    )}
                    
                    <div className="mt-2 flex justify-between items-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        item.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                        item.status === 'SOLD' ? 'bg-red-100 text-red-800' :
                        item.status === 'AUCTION_ENDED' ? 'bg-warm-100 text-warm-800' :
                        'bg-warm-100 text-warm-800'
                      }`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                      {isOrganizer && (
                        <Link 
                          href={`/organizer/edit-item/${item.id}`}
                          className="text-amber-600 hover:text-amber-800 text-sm"
                        >
                          Edit
                        </Link>
                      )}
                      {!isOrganizer && user && !sale.isAuctionSale && item.status === 'AVAILABLE' && (
                        <button
                          onClick={() => handleBuyNow(item.id, item.title)}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-1 rounded"
                        >
                          Buy Now
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Phase 15: Reviews section */}
        <ReviewsSection
          mode="sale"
          saleId={sale.id}
          saleStatus={sale.status}
          avgRating={sale.organizer.avgRating}
          totalReviews={sale.organizer.reviewCount}
        />
      </main>

      {/* Modals */}
      {checkoutItem && (
        <CheckoutModal
          itemId={checkoutItem.id}
          itemTitle={checkoutItem.title}
          onClose={handleCheckoutClose}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {isImportModalOpen && isOrganizer && (
        <CSVImportModal isOpen={isImportModalOpen} saleId={sale.id} onClose={() => setIsImportModalOpen(false)} onImportComplete={handleImportComplete} />
      )}

      {lightboxOpen && sale.photoUrls.length > 0 && (
        <PhotoLightbox photos={sale.photoUrls} initialIndex={currentPhotoIndex} onClose={() => setLightboxOpen(false)} />
      )}

      {sale.photoUrls.length > 0 && (
        <SaleTourGallery photos={sale.photoUrls} saleTitle={sale.title} isOpen={tourOpen} onClose={() => setTourOpen(false)} initialIndex={currentPhotoIndex} />
      )}
    </div>
  );
};

export default SaleDetailPage;
