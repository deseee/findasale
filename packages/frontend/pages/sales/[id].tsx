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
import { useArrivalAssistant } from '../../hooks/useArrivalAssistant'; // Feature #84: Approach Notes
import RemindMeButton from '../../components/RemindMeButton';
import LeaveSaleWarning from '../../components/LeaveSaleWarning'; // Feature #121: Warn on leave
import { useShopperCart } from '../../hooks/useShopperCart'; // Phase 1: Smart Cart
import ShopperCartDrawer from '../../components/ShopperCartDrawer'; // Phase 1: Smart Cart
import ShopperCartFAB from '../../components/ShopperCartFAB'; // Phase 1: Smart Cart
import ActivityFeed from '../../components/ActivityFeed'; // Feature #51: Activity Feed + HypeMeter
import HypeMeter from '../../components/HypeMeter'; // Feature #51: Hype Meter (viewer count)
import SaleRSVPButton from '../../components/SaleRSVPButton';
import RSVPBadge from '../../components/RSVPBadge';
import SaleWaitlistButton from '../../components/SaleWaitlistButton';
import SimilarItems from '../../components/SimilarItems';
import AddToCalendarButton from '../../components/AddToCalendarButton';
import LocationMap from '../../components/LocationMap';
import SocialProofBadge from '../../components/SocialProofBadge';
import { useSaleSocialProof } from '../../hooks/useSocialProof';
import BountyModal from '../../components/BountyModal';


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
  saleType?: string;
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
    auctionClosed?: boolean;
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
  const shopperCart = useShopperCart();

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
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [isShopperCartOpen, setIsShopperCartOpen] = useState(false);
  const [showSwitchSaleModal, setShowSwitchSaleModal] = useState(false);
  const [pendingCartItem, setPendingCartItem] = useState<any>(null);

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

  // Award 10 XP for visiting a sale (once per sale per day, auth required)
  useEffect(() => {
    if (!id || !user) return;
    api.post(`/api/sales/${id}/visit`).catch(() => { /* fire-and-forget */ });
  }, [id, user?.id]);

  // Feature #51: Record VIEW ripple for analytics
  useEffect(() => {
    if (!id) return;
    api.post(`/sales/${id}/ripples`, { type: 'VIEW' }).catch(() => { /* fire-and-forget */ });
  }, [id]);

  // Feature #121: Detect navigation away from sale with active holds
  useEffect(() => {
    if (!id || !user) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if user has active holds at this sale — if so, warn before leaving
      api.get('/reservations/shopper').then((res) => {
        const userHoldsAtSale = res.data.holds?.filter((h: any) => h.item.sale.id === id);
        if (userHoldsAtSale && userHoldsAtSale.length > 0) {
          e.preventDefault();
          e.returnValue = '';
        }
      }).catch(() => { /* non-fatal */ });
    };

    // Use Next.js router beforePopState for SPA navigation
    const handleRouteChange = (url: string) => {
      // Only warn if navigating to a different page
      if (!url.includes(`/sales/${id}`)) {
        api.get('/reservations/shopper').then((res) => {
          const userHoldsAtSale = res.data.holds?.filter((h: any) => h.item.sale.id === id);
          if (userHoldsAtSale && userHoldsAtSale.length > 0) {
            setShowLeaveWarning(true);
            setPendingNavigation(url);
            router.events.emit('routeChangeError');
            throw 'Navigation cancelled by leave warning';
          }
        }).catch(() => { /* non-fatal */ });
      }
    };

    router.events.on('beforeHistoryChange', handleRouteChange);

    return () => {
      router.events.off('beforeHistoryChange', handleRouteChange);
    };
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

  // Feature #84: Fetch approach notes for this sale (if user has saved it)
  const { data: approachNotes, isLoading: approachNotesLoading } = useArrivalAssistant(id as string);

  // Feature #67: Fetch social proof metrics for this sale
  const { data: saleSocialProof, isLoading: socialProofLoading } = useSaleSocialProof(id as string);

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

  const handleAddToCart = (item: any) => {
    // Phase 1: Smart Cart — add item to localStorage cart
    const newCartItem = {
      id: item.id,
      title: item.title,
      price: item.price ? Math.round(item.price * 100) : null, // Convert to cents
      photoUrl: item.photoUrls?.[0],
      saleId: id as string,
    };

    // Check if switching sales
    if (!shopperCart.canAddFromDifferentSale(id as string)) {
      setPendingCartItem(newCartItem);
      setShowSwitchSaleModal(true);
      return;
    }

    shopperCart.addItem(newCartItem);
    showToast('Added to cart', 'success');
  };

  const handleConfirmSwitchSale = () => {
    if (pendingCartItem) {
      shopperCart.switchSale(pendingCartItem.saleId);
      shopperCart.addItem(pendingCartItem);
      showToast('Cart cleared and item added', 'success');
    }
    setShowSwitchSaleModal(false);
    setPendingCartItem(null);
  };

  const handleImportComplete = () => {
    // Close the modal and refresh the sale data
    setIsImportModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['sale', id] });
  };

  const formatPrice = (amount: number | null | undefined) => {
    if (amount == null) return '—';
    return `$${amount.toFixed(2)}`;
  };

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

  const handleConfirmLeave = () => {
    setShowLeaveWarning(false);
    if (pendingNavigation) {
      router.push(pendingNavigation);
    }
  };

  const handleCloseLeaveWarning = () => {
    setShowLeaveWarning(false);
    setPendingNavigation(null);
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

      {/* Feature #121: Leave Sale Warning Modal */}
      <LeaveSaleWarning
        saleId={id as string}
        isOpen={showLeaveWarning}
        onClose={handleCloseLeaveWarning}
        onConfirmLeave={handleConfirmLeave}
      />

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
              <p className="text-sm text-warm-600 dark:text-gray-300 mb-4">
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
              <AddToCalendarButton
                saleId={sale.id}
                title={sale.title}
                startDate={sale.startDate}
                endDate={sale.endDate}
                address={sale.address}
                city={sale.city}
                state={sale.state}
                description={sale.description}
              />
              {user && (
                <SaleRSVPButton saleId={sale.id} />
              )}
              {user && sale.items.length > 0 && (
                <SaleWaitlistButton saleId={sale.id} />
              )}
              <RemindMeButton
                saleId={sale.id}
                saleName={sale.title}
                disabled={sale.status === 'ENDED'}
              />
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
              {sale.organizer.phone && (
                <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">{sale.organizer.phone}</p>
              )}
              {/* #71: Organizer Reputation Score */}
              <div className="mb-4">
                <OrganizerReputation organizerId={sale.organizer.id} />
              </div>
              {(sale.organizer.avgRating ?? 0) > 0 && (
                <div className="mb-4">
                  <Link href={`/organizers/${sale.organizer.id}`} className="flex items-center gap-2 text-sm hover:underline">
                    <span className="font-medium text-amber-600 dark:text-amber-400">⭐ {(sale.organizer.avgRating ?? 0).toFixed(1)}</span>
                    {(sale.organizer.reviewCount ?? 0) > 0 && (
                      <span className="text-warm-600 dark:text-gray-400">({sale.organizer.reviewCount} {sale.organizer.reviewCount === 1 ? 'review' : 'reviews'})</span>
                    )}
                  </Link>
                </div>
              )}
              <BadgeDisplay badges={sale.organizer.badges || []} />
              {/* RSVP Count Badge */}
              <div className="mt-4">
                <RSVPBadge saleId={sale.id} saleTitle={sale.title} />
              </div>
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

        {/* Feature #51: Hype Meter — Live Viewer Count */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
          <HypeMeter saleId={id as string} />
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
                    key={getThumbnailUrl(sale.photoUrls[currentPhotoIndex])}
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
            {/* Location Map */}
            {sale.lat && sale.lng && (
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-50 mb-4">Location</h2>
                <LocationMap
                  lat={sale.lat}
                  lng={sale.lng}
                  address={sale.address}
                  city={sale.city}
                  state={sale.state}
                  title={sale.title}
                  height="300px"
                />
              </div>
            )}

            {/* About This Sale */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mt-8">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-50 mb-4">About</h2>
              <p className="text-warm-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{sale.description}</p>
            </div>

            {/* Social Proof Badge */}
            {saleSocialProof && (
              <div className="mt-8">
                <SocialProofBadge socialProof={saleSocialProof} loading={socialProofLoading} variant="full" />
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            {/* Share Buttons */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
              <h2 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Share</h2>
              <div className="flex flex-col gap-2">
                {/* Primary Share Button using Web Share API */}
                <button
                  onClick={async () => {
                    const shareData = {
                      title: sale.title,
                      text: `Check out this sale: ${sale.title}`,
                      url: typeof window !== 'undefined' ? window.location.href : '',
                    };
                    if (navigator.share) {
                      try {
                        await navigator.share(shareData);
                      } catch (error) {
                        // User cancelled or error occurred; silently fail
                      }
                    } else {
                      // Fallback: open Facebook intent URL
                      const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`;
                      window.open(url, '_blank');
                    }
                  }}
                  className="flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  Share
                </button>

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

                {/* Twitter Share */}
                <button
                  onClick={() => {
                    const text = `Check out this sale: ${sale.title}`;
                    const url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}&text=${encodeURIComponent(text)}`;
                    window.open(url, '_blank');
                  }}
                  className="flex items-center bg-blue-400 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded"
                >
                  <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8.29 20c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                  </svg>
                  Twitter
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

            {/* CD2-P2: QR Code for print marketing — organizer only */}
            {isOrganizer && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
                <h2 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-2">QR Code</h2>
                <p className="text-xs text-warm-400 dark:text-gray-500 mb-4">Print on signs or flyers to drive foot traffic to this sale.</p>
                <SaleQRCode saleId={sale.id} saleTitle={sale.title} size={180} />
              </div>
            )}

            {/* Organizer Contact */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
              <h2 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Organized By</h2>
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

            {/* Reviews Section */}
            <div className="mb-8">
              <ReviewsSection
                mode="sale"
                saleId={sale.id}
                saleStatus={sale.status}
                avgRating={sale.organizer.avgRating}
                totalReviews={sale.organizer.reviewCount}
              />
            </div>

            {/* Feature #70: Live Feed Ticker — real-time sale events (SOLD, HOLD, PRICE_DROP) */}
            <div className="mb-8">
              <LiveFeedTicker saleId={sale.id} />
            </div>

            {/* Location Card */}
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
            const availableCount = sale.items.filter(i => i.status === 'AVAILABLE').length;
            const soldCount = sale.items.filter(i => i.status === 'SOLD').length;
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
                    ✓ {availableCount} available
                  </span>
                )}
                {soldCount > 0 && (
                  <span className="text-sm text-warm-500 dark:text-gray-300">
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
                {Array.from(new Set(sale.items.map((item) => item.category?.toLowerCase()).filter(Boolean))).map(
                  (normalizedCategory) => {
                    const count = sale.items.filter((item) => item.category?.toLowerCase() === normalizedCategory).length;
                    return (
                      <button
                        key={normalizedCategory}
                        onClick={() => setSelectedCategory(normalizedCategory as string)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          selectedCategory === normalizedCategory
                            ? 'bg-amber-600 text-white'
                            : 'bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-gray-300 hover:bg-warm-300 dark:hover:bg-gray-600'
                        }`}
                      >
                        {(normalizedCategory as string).charAt(0).toUpperCase() + (normalizedCategory as string).slice(1)} ({count})
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
                    selectedCategory === null || item.category?.toLowerCase() === selectedCategory
                )
                .map((item) => (
                <div key={item.id} className="border border-warm-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 h-full flex flex-col">
                  <div className="relative aspect-square overflow-hidden">
                    <Link href={`/items/${item.id}`} className="block h-full">
                      {item.photoUrls.length > 0 ? (
                        <img
                          key={getOptimizedUrl(item.photoUrls[0])}
                          src={getOptimizedUrl(item.photoUrls[0])}
                          alt={item.title}
                          className="w-full h-full object-cover hover:opacity-90 transition"
                         loading="lazy"/>
                      ) : (
                        <div className="bg-warm-200 dark:bg-gray-700 w-full h-full flex items-center justify-center">
                          <span className="text-warm-500 dark:text-gray-400 text-sm">No image</span>
                        </div>
                      )}
                    </Link>
                    <div className="absolute top-2 right-2">
                      <FavoriteButton itemId={item.id} saleId={id as string} variant="icon" size="md" />
                    </div>
                  </div>
                  <div className="p-4 flex flex-col flex-grow">
                    <h3 className="font-bold text-lg mb-2 text-warm-900 dark:text-gray-50">{item.title}</h3>
                    <p className="text-warm-600 dark:text-gray-300 text-sm mb-3 line-clamp-2 flex-grow">{item.description}</p>

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
                            ✓ Sold
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
                        <div className="flex gap-2">
                          <Link 
                            href={`/organizer/edit-item/${item.id}`}
                            className="text-amber-600 hover:text-amber-800 text-sm"
                          >
                            Edit
                          </Link>
                          {!!item.auctionEndTime && !item.auctionClosed && (
                            <button
                              onClick={() => {
                                const confirmed = window.confirm(`End auction for "${item.title}"? The highest bidder will receive a payment link.`);
                                if (confirmed) {
                                  api.post(`/items/${item.id}/close-auction`)
                                    .then(() => {
                                      showToast('Auction closed successfully', 'success');
                                      queryClient.invalidateQueries({ queryKey: ['sale', id] });
                                    })
                                    .catch((err: any) => {
                                      showToast(err.response?.data?.message || 'Failed to close auction', 'error');
                                    });
                                }
                              }}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              End Auction
                            </button>
                          )}
                        </div>
                      )}
                      {!isOrganizer && user && item.status === 'AVAILABLE' && (
                        <div className="flex gap-2">
                          {!sale.isAuctionSale && (
                            <>
                              <button
                                onClick={() => handleBuyNow(item.id, item.title)}
                                className="bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-1 rounded"
                              >
                                Buy Now
                              </button>
                              {item.price !== null && (
                                <button
                                  onClick={() => handleAddToCart(item)}
                                  className={`text-sm px-3 py-1 rounded font-medium transition-colors ${
                                    shopperCart.items.some((ci) => ci.id === item.id)
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 cursor-default'
                                      : 'border border-amber-600 dark:border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                  }`}
                                  disabled={shopperCart.items.some((ci) => ci.id === item.id)}
                                  title={shopperCart.items.some((ci) => ci.id === item.id) ? 'Item already in cart' : 'Add to shopping cart'}
                                >
                                  {shopperCart.items.some((ci) => ci.id === item.id) ? '✓ In Cart' : '+ Cart'}
                                </button>
                              )}
                            </>
                          )}
                          {sale.isAuctionSale && item.auctionEndTime && (
                            <button
                              onClick={() => setBiddingItemId(item.id)}
                              className="bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-1 rounded"
                            >
                              Place Bid
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bounty Modal — Request Missing Items */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
          <BountyModal saleId={sale.id} saleStatus={sale.status} />
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

        {/* Feature #84: Approach Notes — day-of info for shoppers */}
        {approachNotes && approachNotes.notes && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold mb-4 text-blue-900 dark:text-blue-100 flex items-center gap-2">
              <span>📍</span> Approach Notes
            </h2>
            <div className="bg-white dark:bg-gray-800 rounded p-4 mb-4">
              <p className="text-warm-700 dark:text-gray-300 whitespace-pre-wrap">
                {approachNotes.notes}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">Opens</p>
                <p className="text-warm-600 dark:text-gray-400">
                  {format(parseISO(approachNotes.startDate), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">Address</p>
                <p className="text-warm-600 dark:text-gray-400">{approachNotes.address}</p>
              </div>
            </div>
          </div>
        )}

        {/* Similar Items — Show other items in the same category */}
        {sale.items.length > 0 && sale.items[0] && (
          <div className="mt-12 bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6">
            <SimilarItems itemId={sale.items[0].id} category={sale.items[0].category || 'general'} />
          </div>
        )}

        {/* Feature #51: Activity Feed — Recent Activity + Social Proof */}
        <div className="mt-12">
          <ActivityFeed saleId={id as string} />
        </div>

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

      {/* Phase 1: Smart Cart — browsing cart drawer */}
      <ShopperCartDrawer
        isOpen={isShopperCartOpen}
        onClose={() => setIsShopperCartOpen(false)}
        saleName={sale?.title}
      />

      {/* Phase 1: Smart Cart — floating action button */}
      <ShopperCartFAB onClick={() => setIsShopperCartOpen(true)} />

      {/* Phase 1: Smart Cart — switch sale confirmation modal */}
      {showSwitchSaleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-sm p-6">
            <h3 className="text-lg font-bold text-warm-900 dark:text-gray-50 mb-4">
              Switch Sale?
            </h3>
            <p className="text-warm-700 dark:text-gray-300 mb-6">
              Your cart has items from a different sale. Would you like to clear your cart and start with this sale?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSwitchSaleModal(false)}
                className="px-4 py-2 rounded border border-warm-300 dark:border-gray-600 text-warm-900 dark:text-gray-50 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
              >
                Keep Current Cart
              </button>
              <button
                onClick={handleConfirmSwitchSale}
                className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
              >
                Start New Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaleDetailPage;
