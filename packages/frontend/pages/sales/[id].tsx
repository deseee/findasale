import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import CheckoutModal from '../../components/CheckoutModal';
import { useToast } from '../../components/ToastContext';
import { format, parseISO } from 'date-fns';
import SaleSubscription from '../../components/SaleSubscription';
import FavoriteButton from '../../components/FavoriteButton';
import CSVImportModal from '../../components/CSVImportModal';
import SaleShareButton from '../../components/SaleShareButton';
import SaleQRCode from '../../components/SaleQRCode';
import SaleMap from '../../components/SaleMap';
import Skeleton from '../../components/Skeleton';
import { usePhotoOpStations } from '../../hooks/usePhotoOps';
import { useUGCPhotos } from '../../hooks/useUGCPhotos';
import BadgeDisplay from '../../components/BadgeDisplay';
import OrganizerTierBadge from '../../components/OrganizerTierBadge'; // Phase 31: Tier Rewards
import AuctionCountdown from '../../components/AuctionCountdown';
import PhotoLightbox from '../../components/PhotoLightbox';
import SaleTourGallery from '../../components/SaleTourGallery';
import { getThumbnailUrl, getOptimizedUrl, getLqipUrl } from '../../lib/imageUtils';
import ReviewsSection from '../../components/ReviewsSection';
import FlashDealBanner from '../../components/FlashDealBanner';
import PickupBookingCard from '../../components/PickupBookingCard';
import FollowOrganizerButton from '../../components/FollowOrganizerButton'; // Phase 17
import SaleOGMeta from '../../components/SaleOGMeta'; // Feature #43: OG Image Generator
import OrganizerReputation from '../../components/OrganizerReputation'; // #71: Organizer Reputation Score
import VerifiedBadge from '../../components/VerifiedBadge'; // Feature #16
import UGCPhotoGallery from '../../components/UGCPhotoGallery'; // Feature #47
import { RippleIndicator } from '../../components/RippleIndicator'; // Feature #51: Sale Ripples
import { LiveFeedTicker } from '../../components/LiveFeedTicker'; // Feature #70: Live Activity Ticker
import MessageComposeModal from '../../components/MessageComposeModal'; // Feature #29: Message Organizer
import HuntSummary from '../../components/HuntSummary'; // Feature #85: Treasure Hunt QR

// Feature #90: Sale Soundtrack — Spotify playlist mapping by sale type
const SALE_TYPE_PLAYLISTS: Record<string, { name: string; url: string }> = {
  ESTATE: {
    name: 'Vintage Jazz & Blues',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DX4o1sPP7cqVH',
  },
  YARD: {
    name: 'Feel Good Summer',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DX1s9tkWNPPpG',
  },
  AUCTION: {
    name: 'Exciting Auction Energy',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DXcF1ycsuFScY',
  },
  FLEA_MARKET: {
    name: 'Indie & Eclectic Mix',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe',
  },
  CONSIGNMENT: {
    name: 'Sophisticated Shopping',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DX2L0iB23Enbj',
  },
};

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
  saleType?: string; // Feature #90: Sale Soundtrack — ESTATE | YARD | AUCTION | FLEA_MARKET | CONSIGNMENT
  organizer: {
    id: string;
    userId: string;
    businessName: string;
    phone: string;
    address: string;
    tier?: 'BRONZE' | 'SILVER' | 'GOLD'; // Phase 31: Tier Rewards
    verificationStatus?: string; // Feature #16
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
  const [messageModalOpen, setMessageModalOpen] = useState(false);

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
      .then((res) => { if (res.data?.awarded === true) showToast('\ud83c\udfc6 +1 pt earned!', 'points'); })
      .catch(() => { /* non-fatal */ });
  }, [id, user]);

  const { data: sale, isLoading, isError, error: queryError } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      if (!id) throw new Error('No sale ID provided');
      const response = await api.get(`/sales/${id}`);
      return response.data as Sale;
    },
    enabled: !!id,
    staleTime: 3000, // BUG-11: Cache for 3s to avoid repeated fetches from child components/effects
    refetchInterval: 5000, // Refresh for live bid updates
  });

  // Feature #39: Fetch photo op stations for this sale
  const { data: photoOpStations = [] } = usePhotoOpStations(id as string);

  // Feature #47: Fetch UGC photos for this sale
  const { data: ugcPhotos = [], isLoading: ugcLoading } = useUGCPhotos(id as string);

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

  const handleMessageSuccess = (conversationId: string) => {
    setMessageModalOpen(false);
    router.push(`/messages/${conversationId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-5 w-28 mb-6" />
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8"></div>
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
    // Bug #19: Check for 429 rate limit vs 404 not found
    const status = (queryError as any)?.response?.status;
    const is429 = status === 429;

    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-2">
            {is429 ? 'Too many requests' : 'Sale not found'}
          </h1>
          <p className="text-warm-600 dark:text-gray-400 mb-6">
            {is429
              ? 'You\'re browsing too fast. Please wait a moment and refresh.'
              : 'The sale you\'re looking for doesn\'t exist.'}
          </p>
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

  // Feature #43: OG Image Generator — transform photoUrls to photos format for SaleOGMeta
  const saleForOGMeta = {
    ...sale,
    photos: sale.photoUrls.map(url => ({ url })),
  };

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <SaleOGMeta sale={saleForOGMeta} />

      <main className="container mx-auto px-4 py-8">
        <Link href="/" className="text-amber-600 hover:text-amber-700 font-medium mb-6 inline-block">
          ← Back to home
        </Link>

        {/* Sale Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-warm-900 dark:text-gray-50 mb-2">{sale.title}</h1>
              <div className="mb-4">
                <RippleIndicator saleId={sale.id} size="md" />
              </div>
              <p className="text-lg text-warm-700 dark:text-gray-300 mb-4">
                {sale.address}, {sale.city}, {sale.state} {sale.zip}
              </p>
              <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">
                {format(saleStartDate, 'MMM d, yyyy h:mm a')} - {format(saleEndDate, 'MMM d, yyyy h:mm a')}
              </p>
              {sale.status && (
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  sale.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' :
                  sale.status === 'upcoming' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' :
                  'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
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

        {/* Organizer Info Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-warm-900 dark:text-gray-50 mb-2">Organized by</h2>
              <div className="flex items-center gap-2 mb-2">
                <Link href={`/organizers/${sale.organizer.id}`} className="text-lg font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline transition-colors">
                  {sale.organizer.businessName}
                </Link>
                <VerifiedBadge status={sale.organizer.verificationStatus} size="md" />
                {/* Phase 31: Show tier badge if SILVER or GOLD */}
                {sale.organizer.tier && (sale.organizer.tier === 'SILVER' || sale.organizer.tier === 'GOLD') && (
                  <OrganizerTierBadge tier={sale.organizer.tier} />
                )}
              </div>
              <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">{sale.organizer.phone}</p>
              {/* #71: Organizer Reputation Score */}
              <div className="mb-4">
                <OrganizerReputation organizerId={sale.organizer.id} />
              </div>
              {sale.organizer.avgRating && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-medium text-warm-700 dark:text-gray-300">Rating:</span>
                  <span className="text-sm text-warm-600 dark:text-gray-400">{sale.organizer.avgRating.toFixed(1)}/5.0</span>
                  {(sale.organizer.reviewCount ?? 0) > 0 && (
                    <span className="text-sm text-warm-500 dark:text-gray-400">({sale.organizer.reviewCount} reviews)</span>
                  )}
                </div>
              )}
              <BadgeDisplay badges={sale.organizer.badges || []} />
            </div>
            {!isOrganizer && (
              <div className="ml-4 flex-shrink-0 flex flex-col gap-2">
                {user ? (
                  <button
                    onClick={() => setMessageModalOpen(true)}
                    className="px-4 py-2 bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded font-medium transition-colors"
                  >
                    Message Organizer
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="px-4 py-2 bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded font-medium text-center transition-colors"
                  >
                    Sign in to Message
                  </Link>
                )}
                <FollowOrganizerButton
                  organizerId={sale.organizer.id}
                  organizerName={sale.organizer.businessName}
                />
              </div>
            )}
            {isOrganizer && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => router.push(`/organizer/edit-sale/${sale.id}`)}
                  className="px-4 py-2 bg-amber-600 dark:bg-amber-700 hover:bg-amber-700 dark:hover:bg-amber-600 text-white rounded font-medium transition-colors"
                >
                  Edit Sale
                </button>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded font-medium transition-colors"
                >
                  Import Items
                </button>
                <button
                  onClick={handleDownloadMarketingKit}
                  disabled={downloadingKit}
                  className="px-4 py-2 bg-purple-600 dark:bg-purple-700 hover:bg-purple-700 dark:hover:bg-purple-600 text-white rounded font-medium disabled:opacity-50 transition-colors"
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
                  <span>\ud83c\udfac</span>
                  <span>Take a Tour</span>
                </button>
              </div>
            )}
            {/* About This Sale */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mt-8">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-50 mb-4">About</h2>
              <p className="text-warm-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{sale.description}</p>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            {/* Share Buttons */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
              <h2 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Share</h2>
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
              <h2 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-2">QR Code</h2>
              <p className="text-xs text-warm-400 dark:text-gray-500 mb-4">Print on signs or flyers to drive foot traffic to this sale.</p>
              <SaleQRCode saleId={sale.id} saleTitle={sale.title} size={180} />
            </div>

            {/* Feature #90: Sale Soundtrack — Vibe Check */}
            {sale.saleType && SALE_TYPE_PLAYLISTS[sale.saleType] && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
                <h2 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <span>🎵</span>
                  Vibe Check
                </h2>
                <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">
                  Set the mood for this {sale.saleType === 'FLEA_MARKET' ? 'flea market' : sale.saleType === 'CONSIGNMENT' ? 'consignment shop' : sale.saleType?.toLowerCase()}.
                </p>
                <a
                  href={SALE_TYPE_PLAYLISTS[sale.saleType].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 w-full justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0m5.521 17.34c-.24.315-.74.42-1.14.175-3.12-1.92-7.02-2.357-11.64-1.29-.42.12-.84-.12-.96-.51-.12-.41.12-.84.51-.96 5.04-1.137 9.46-.676 12.98 1.498.41.25.48.75.25 1.14m1.44-3.3c-.301.39-.921.54-1.44.42-3.3-.602-8.34-.755-12.33.298-.525.15-1.076-.165-1.227-.66-.15-.498.165-1.045.66-1.2 4.513-1.112 9.938-.935 13.61.644.529.277.667.94.385 1.456m.126-3.403c-3.96-.7-10.717-.777-15.02.298-.533.111-1.053-.26-1.16-.795-.105-.527.26-1.067.795-1.157 4.763-.981 12.022-.899 16.22.589.524.161.853.688.692 1.226-.161.537-.688.865-1.226.705z" />
                  </svg>
                  Listen on Spotify: {SALE_TYPE_PLAYLISTS[sale.saleType].name}
                </a>
              </div>
            )}

            {/* Organizer Contact */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
              <h2 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Contact Info</h2>
              <p className="text-sm text-warm-600 dark:text-gray-400 mb-2">
                <span className="font-medium text-warm-900 dark:text-gray-200">Phone:</span> {sale.organizer.phone}
              </p>
              <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">
                <span className="font-medium text-warm-900 dark:text-gray-200">Address:</span> {sale.organizer.address}
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

            {/* Feature #70: Live Feed Ticker — real-time sale events (SOLD, HOLD, PRICE_DROP) */}
            <div className="mb-8">
              <LiveFeedTicker saleId={sale.id} />
            </div>

            {/* Pickup Scheduling */}
            {user && <PickupBookingCard saleId={sale.id} />}
          </div>
        </div>

        {/* Items Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-50">
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
                  <span className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 text-sm font-bold px-3 py-1.5 rounded-full ring-1 ring-red-200 dark:ring-red-800 animate-pulse">
                    \ud83d\udd25 Only {availableCount} left!
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-200 text-sm font-semibold px-3 py-1.5 rounded-full">
                    \u2713 {availableCount} available
                  </span>
                )}
                {soldCount > 0 && (
                  <span className="text-sm text-warm-500 dark:text-gray-400">
                    {soldCount} sold
                  </span>
                )}
                {reservedCount > 0 && (
                  <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                    {reservedCount} on hold
                  </span>
                )}
              </div>
            );
          })()}

          {/* Category Filter */}
          {sale.items && sale.items.some((item) => item.category) && (
            <div className="mb-6">
              <p className="text-sm font-medium text-warm-700 dark:text-gray-200 mb-2">Filter by category:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === null
                      ? 'bg-amber-600 text-white'
                      : 'bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-gray-300 hover:bg-warm-300 dark:hover:bg-gray-600'
                  }`}
                >
                  Show: All
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
                            : 'bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-gray-300 hover:bg-warm-300 dark:hover:bg-gray-600'
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

          {/* Feature #85: Treasure Hunt QR Summary */}
          {sale.items.length > 0 && <HuntSummary saleId={sale.id} />}

          {sale.items.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-warm-600 dark:text-gray-400 mb-4">No items listed for this sale yet.</p>
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
                <div key={item.id} className="border border-warm-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                  <div className="relative">
                    <Link href={`/items/${item.id}`} className="block">
                      {item.photoUrls.length > 0 ? (
                        <img
                          src={getOptimizedUrl(item.photoUrls[0])}
                          alt={item.title}
                          className="w-full h-48 object-cover"
                         loading="lazy"/>
                      ) : (
                        <div className="bg-warm-200 dark:bg-gray-700 h-48 flex items-center justify-center">
                          <span className="text-warm-500 dark:text-gray-400 text-sm">No image</span>
                        </div>
                      )}
                    </Link>
                    <div className="absolute top-2 right-2">
                      <FavoriteButton itemId={item.id} variant="icon" size="md" />
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-lg mb-2 text-warm-900 dark:text-gray-50">{item.title}</h3>
                    <p className="text-warm-600 dark:text-gray-300 text-sm mb-3 line-clamp-2">{item.description}</p>

                    {/* Category, Condition, Auction, and Status badges */}
                    {(item.category || item.condition || item.auctionEndTime || item.status === 'RESERVED' || item.status === 'SOLD' || item.status === 'PENDING') && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {/* CD2: Status social-proof badges */}
                        {item.status === 'RESERVED' && (
                          <span className="inline-block bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide">
                            \ud83d\udd12 On Hold
                          </span>
                        )}
                        {(item.status === 'SOLD' || item.status === 'PENDING') && (
                          <span className="inline-block bg-warm-700 dark:bg-gray-700 text-white dark:text-gray-200 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide">
                            \u2713 Sold
                          </span>
                        )}
                        {item.auctionEndTime && (
                          <span className="inline-block bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide">
                            \ud83d\udd28 Auction
                          </span>
                        )}
                        {item.category && (
                          <span className="inline-block bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-2 py-1 rounded text-xs font-medium">
                            {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                          </span>
                        )}
                        {item.condition && (
                          <span className="inline-block bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-100 px-2 py-1 rounded text-xs font-medium">
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
                            <span className="text-sm text-warm-600 dark:text-gray-300">Current Bid:</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400 ml-1">
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
                          <span className="text-sm text-warm-600 dark:text-gray-300">
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
                              className="flex-grow px-2 py-1 border border-warm-300 dark:border-gray-600 rounded-l text-sm text-warm-900 dark:bg-gray-700 dark:text-warm-100"
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
                          <div className="text-sm text-center py-2 bg-warm-100 dark:bg-gray-700 rounded text-warm-600 dark:text-gray-400">
                            Auction ended
                          </div>
                        )}

                        {item.status === 'SOLD' && (
                          <div className="text-sm text-center py-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded">
                            Item sold
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Regular sale item */
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {formatPrice(item.price)}
                        </span>
                        {item.currentBid && (
                          <span className="text-sm bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded">
                            Current bid: {formatPrice(item.currentBid)}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-2 flex justify-between items-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        item.status === 'AVAILABLE' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' :
                        item.status === 'SOLD' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200' :
                        item.status === 'AUCTION_ENDED' ? 'bg-warm-100 dark:bg-gray-700 text-warm-800 dark:text-gray-300' :
                        'bg-warm-100 dark:bg-gray-700 text-warm-800 dark:text-gray-300'
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

        {/* Feature #47: UGC Photo Gallery */}
        {ugcPhotos.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4 text-warm-900 dark:text-gray-100">
              Community Photos
              <span className="ml-2 text-sm font-normal text-warm-400 dark:text-gray-500">
                ({ugcPhotos.length})
              </span>
            </h2>
            <UGCPhotoGallery photos={ugcPhotos} loading={ugcLoading} />
          </div>
        )}

        {/* Map Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-warm-900 dark:text-gray-50">Location</h2>
          {sale.lat && sale.lng ? (
            <SaleMap
              singlePin={{
                lat: sale.lat,
                lng: sale.lng,
                label: `${sale.title} \u2014 ${sale.address}, ${sale.city}, ${sale.state}`,
              }}
              entrancePin={sale.entranceLat && sale.entranceLng ? {
                lat: sale.entranceLat,
                lng: sale.entranceLng,
                note: sale.entranceNote,
              } : undefined}
              photoOpStations={photoOpStations}
              height="360px"
            />
          ) : (
            <div className="h-72 bg-warm-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <p className="text-warm-500 dark:text-gray-400">Location not available</p>
            </div>
          )}
          <p className="mt-3 text-sm text-warm-500 dark:text-gray-400">
            {sale.address}, {sale.city}, {sale.state} {sale.zip}
          </p>
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

      <MessageComposeModal
        open={messageModalOpen}
        onClose={() => setMessageModalOpen(false)}
        organizerId={sale.organizer.id}
        saleId={sale.id}
        onSuccess={handleMessageSuccess}
      />
    </div>
  );
};

export default SaleDetailPage;
