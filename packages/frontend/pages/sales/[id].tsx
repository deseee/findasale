import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { GetServerSidePropsContext } from 'next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { formatCategoryLabel } from '../../lib/itemConstants';
import { useAuth } from '../../components/AuthContext';
import CheckoutModal from '../../components/CheckoutModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../components/ToastContext';
import { format, parseISO } from 'date-fns';
import SaleSubscription from '../../components/SaleSubscription';
import FavoriteButton from '../../components/FavoriteButton';
import CSVImportModal from '../../components/CSVImportModal';
import SaleShareButton from '../../components/SaleShareButton';
import SaleShareCard from '../../components/SaleShareCard';
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
import { getThumbnailUrl, getOptimizedUrl, getLqipUrl, getSaleImageUrl, getItemImageUrl } from '../../lib/imageUtils';
import FlashDealBanner from '../../components/FlashDealBanner';
import PickupBookingCard from '../../components/PickupBookingCard';
import FollowOrganizerButton from '../../components/FollowOrganizerButton'; // Phase 17
import SaleOGMeta from '../../components/SaleOGMeta'; // Feature #43: OG Image Generator
import OrganizerReputation from '../../components/OrganizerReputation'; // #71: Organizer Reputation Score
import VerifiedBadge from '../../components/VerifiedBadge'; // Feature #16
import UGCPhotoGallery from '../../components/UGCPhotoGallery'; // Feature #47
import { RippleIndicator } from '../../components/RippleIndicator'; // Feature #51: Sale Ripples
import { LiveFeedTicker } from '../../components/LiveFeedTicker'; // Feature #70: Live Activity Ticker
import SaleLockCard from '../../components/SaleLockCard'; // Rank-Based Early Access
import MessageComposeModal from '../../components/MessageComposeModal'; // Feature #29: Message Organizer
import HuntSummary from '../../components/HuntSummary'; // Feature #85: Treasure Hunt QR
import { useArrivalAssistant } from '../../hooks/useArrivalAssistant'; // Feature #84: Approach Notes
import RemindMeButton from '../../components/RemindMeButton';
import LeaveSaleWarning from '../../components/LeaveSaleWarning'; // Feature #121: Warn on leave
import { useShopperCart } from '../../hooks/useShopperCart'; // Phase 1: Smart Cart
import ShopperCartFAB from '../../components/ShopperCartFAB'; // Phase 1: Smart Cart
import { useCart } from '../../context/CartContext';
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
import ColorKeyLegend from '../../components/ColorKeyLegend'; // Feature #310: Color-tagged discount rules
import useXpProfile from '../../hooks/useXpProfile'; // Rank-Based Early Access: fresh rank (explorerRank no longer on AuthContext User)
import ClaimListingModal from '../../components/ClaimListingModal'; // Feature #361: Claim-This-Listing


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
  status: string;
  photoUrls: string[];
  saleType?: string;
  buyersPremiumPct?: number | null;
  organizer: {
    id: string;
    userId: string;
    businessName: string;
    phone: string;
    address: string;
    tier?: 'BRONZE' | 'SILVER' | 'GOLD'; // Phase 31: Tier Rewards
    verificationStatus?: string; // Feature #16
    subscriptionTier?: string; // Feature #65: Subscription Tiers (SIMPLE, PRO, TEAMS, ENTERPRISE)
    removeWatermarkEnabled?: boolean; // Feature: OG watermark removal toggle (TEAMS only)
    isClaimed?: boolean; // Feature #361: Claim-This-Listing
    isUnmanagedListing?: boolean; // True for scraped/unverified listings
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
    effectivePrice?: number | null; // Feature #310: Price after discount rules applied
    auctionStartPrice: number;
    currentBid: number;
    bidIncrement: number;
    auctionEndTime: string;
    status: string;
    category?: string;
    condition?: string;
    photoUrls: string[];
    auctionClosed?: boolean;
    listingType?: string;
    organizerDiscountAmount?: number; // D-XP-003: Organizer-funded item discount
    organizerDiscountXp?: number; // D-XP-003: XP cost of discount
  }[];
  isAuctionSale: boolean;
  // Feature 35: Front Door Locator
  entranceLat?: number;
  entranceLng?: number;
  entranceNote?: string;
  // Rank-Based Early Access
  locked?: boolean;
  publishedAt?: string;
  unlocksAt?: string;
  minutesUntilUnlock?: number;
  userRank?: string;
  // Feature #85: Treasure Hunt QR
  treasureHuntEnabled?: boolean;
  treasureHuntQRClues?: Array<{
    id: string;
    clueText: string;
    category?: string;
  }>;
  // RETAIL scraper metadata (hours_display, website, phone, etc.)
  scrapedMetadata?: Record<string, unknown> | null;
  // Feature #24: Configurable hold duration per sale
  holdDurationHours?: number;
  returnWindowHours?: number | null;
  // Feature #84: Day-of approach notes
  notes?: string | null;
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

// SSR-fetched data for OG tags — avoids CSR hydration race with Facebook bot
interface OGSaleData {
  id: string;
  title: string;
  description: string | null;
  city: string;
  state: string;
  startDate: string;
  photoUrl: string | null;
  itemCount: number;
  organizer?: {
    subscriptionTier?: string;
    removeWatermarkEnabled?: boolean;
    businessName?: string;
  };
}

// Full sale and organizer data for JSON-LD structured data
interface InitialSaleData {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  startDate: string;
  endDate: string;
  photoUrls: string[];
  organizer: {
    businessName: string;
  };
}

interface SaleDetailPageProps {
  ogData?: OGSaleData | null;
  initialData?: InitialSaleData | null;
}

const SaleDetailPage: React.FC<SaleDetailPageProps> = ({ ogData, initialData }) => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const { data: xpProfile } = useXpProfile(!!user?.id); // Rank-Based Early Access: fresh rank from /api/xp/profile
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const shopperCart = useShopperCart(user?.id);

  const [checkoutItem, setCheckoutItem] = useState<{ id: string; title: string } | null>(null);
  const [bidAmounts, setBidAmounts] = useState<{ [itemId: string]: string }>({});
  const [biddingItemId, setBiddingItemId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [downloadingKit, setDownloadingKit] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState<number>(24);
  const [currentItemPage, setCurrentItemPage] = useState(1);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const { openCart } = useCart();
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [showSwitchSaleModal, setShowSwitchSaleModal] = useState(false);
  const [pendingCartItem, setPendingCartItem] = useState<any>(null);
  const [photoUploadError, setPhotoUploadError] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const [mounted, setMounted] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false); // Feature #361: Claim-This-Listing

  // Set mounted flag to enable client-side-only date comparisons
  useEffect(() => {
    setMounted(true);
  }, []);

  // Refresh sale data every 5 seconds to pick up new bids and inventory changes.
  // Skip invalidation when the query is in an error state (e.g. deleted sale 404) —
  // otherwise this drives an infinite refetch loop that bypasses the useQuery's own retry/refetchInterval guards.
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      const queryState = queryClient.getQueryState(['sale', id]);
      if (queryState?.status === 'error' || queryState?.error) return;
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
    }, 5000);
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
    api.post('/api/points/track-visit', { saleId: id })
      .then((res) => { if (res.data?.awarded === true) showToast('\ud83c\udfc6 +1 pt earned!', 'points'); })
      .catch(() => { /* non-fatal */ });
  }, [id, user]);

  // Award 2 XP for walk-in visit (check-in) at a sale (once per sale per day, auth required)
  useEffect(() => {
    if (!id || !user) return;
    api.post(`/sales/${id}/visit`).then((res) => {
      if (res.data?.xpAwarded > 0) {
        showToast('📸 Photo Station is live — snap a pic to earn XP!', 'info');
      }
    }).catch(() => { /* fire-and-forget */ });
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
        const userHoldsAtSale = (res.data || []).filter((h: any) => h.item?.sale?.id === id);
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
          const userHoldsAtSale = (res.data || []).filter((h: any) => h.item?.sale?.id === id);
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
    retry: (failureCount, error: any) => error?.response?.status === 404 ? false : failureCount < 3,
    refetchInterval: (query: any) => (query.state.error || query.state.status === 'error') ? false : 5000, // Stop polling if error (status stays 'success' when cached data exists)
    refetchOnWindowFocus: (query: any) => !query.state.error && query.state.status !== 'error', // Don't refetch 404s on tab focus
  });

  // Gate secondary hooks on primary sale query success (prevent infinite loop on deleted sales)
  const saleExists = !isError && !!sale;

  // Feature #39: Fetch photo op stations for this sale
  const { data: photoOpStations = [] } = usePhotoOpStations(id as string, saleExists);

  // Feature #47: Fetch UGC photos for this sale
  const { data: ugcPhotos = [], isLoading: ugcLoading } = useUGCPhotos(id as string, saleExists);

  // Feature #84: Fetch approach notes for this sale (if user has saved it)
  const { data: approachNotes, isLoading: approachNotesLoading } = useArrivalAssistant(id as string, saleExists);

  // Feature #67: Fetch social proof metrics for this sale
  const { data: saleSocialProof, isLoading: socialProofLoading } = useSaleSocialProof(id as string, saleExists);

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
      await api.post(`/items/${itemId}/bids`, { maxBidAmount: amount });
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

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !sale) return;

    const MAX_FILE_SIZE_MB = 5;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    // Validate file sizes
    const invalidFiles = Array.from(files).filter(f => f.size > MAX_FILE_SIZE_BYTES);
    if (invalidFiles.length > 0) {
      setPhotoUploadError(`Photos must be under ${MAX_FILE_SIZE_MB}MB. ${invalidFiles.length} file(s) too large.`);
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }

    // Check max photos constraint
    if (sale.photoUrls.length >= 6) {
      setPhotoUploadError('Maximum 6 photos allowed per sale.');
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }

    const remainingSlots = 6 - sale.photoUrls.length;
    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    setPhotoUploading(true);
    setPhotoUploadError('');
    try {
      // Upload photos to Cloudinary
      const formData = new FormData();
      filesToUpload.forEach(file => formData.append('photos', file));

      const uploadRes = await api.post('/upload/sale-photos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newUrls: string[] = uploadRes.data.urls || [];
      if (!newUrls.length) {
        setPhotoUploadError('Upload failed: no URLs returned.');
        return;
      }

      // Update sale with new photo URLs
      const updatedPhotoUrls = [...sale.photoUrls, ...newUrls];
      await api.put(`/sales/${sale.id}`, { photoUrls: updatedPhotoUrls });

      // Refetch sale data
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
      showToast(`Added ${newUrls.length} photo${newUrls.length !== 1 ? 's' : ''}!`, 'success');
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      setPhotoUploadError(serverMsg ? `Upload failed: ${serverMsg}` : 'Upload failed. Please try again.');
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    if (!sale) return;
    setConfirmState({
      open: true,
      title: 'Remove Photo',
      message: 'Remove this photo?',
      onConfirm: async () => {
        try {
          const updatedPhotoUrls = sale.photoUrls.filter((_, idx) => idx !== indexToRemove);
          await api.put(`/sales/${sale.id}`, { photoUrls: updatedPhotoUrls });
          queryClient.invalidateQueries({ queryKey: ['sale', id] });
          showToast('Photo removed.', 'success');
          // Reset main photo index if viewing deleted photo
          if (currentPhotoIndex >= updatedPhotoUrls.length) {
            setCurrentPhotoIndex(Math.max(0, updatedPhotoUrls.length - 1));
          }
        } catch {
          showToast('Failed to remove photo. Please try again.', 'error');
        }
        setConfirmState(s => ({ ...s, open: false }));
      },
    });
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
  const saleForOGMeta = sale ? {
    ...sale,
    photos: sale.photoUrls.map(url => ({ url })),
  } : null;

  // Rank-Based Early Access: Check if sale is locked for this user
  const isSaleLocked = sale?.locked === true;
  const showRankUpCta = xpProfile?.explorerRank === 'INITIATE' && isSaleLocked;

  // Build SSR OG head once — rendered in all return paths so FB bot sees it immediately
  const ogHead = ogData ? (
    <SaleOGMeta
      sale={{
        id: ogData.id,
        title: ogData.title,
        description: ogData.description || undefined,
        city: ogData.city,
        state: ogData.state,
        startDate: ogData.startDate,
        photos: ogData.photoUrl ? [{ url: ogData.photoUrl }] : [],
      }}
      canonicalUrl={`https://finda.sale/sales/${ogData.id}`}
      organizer={ogData.organizer}
    />
  ) : null;

  // Server-side and pre-mount: render only OG meta + skeleton so FB/Twitter bots
  // get the correct OG tags without any browser-specific code running server-side.
  if (!mounted || isLoading) {
    return (
      <>
        {ogHead}
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
      </>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      {ogHead ? (
        // SSR version — full OG image with watermark policy applied
        saleForOGMeta && <SaleOGMeta sale={saleForOGMeta} organizer={sale?.organizer} />
      ) : (
        // CSR fallback — used only when getServerSideProps didn't return ogData
        sale ? (
          <Head>
            <title>{sale.title} – FindA.Sale</title>
            <link rel="canonical" href={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://finda.sale'}/sales/${sale.id}`} />
            <meta name="description" content={`${sale.saleType || 'Sale'} in ${sale.city}, ${sale.state} — browse items and get directions on FindA.Sale.`} />
            <meta property="og:title" content={`${sale.title} — FindA.Sale`} />
            <meta property="og:description" content={sale.description} />
            <meta property="og:image" content={sale.photoUrls[0] || ''} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:url" content={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://finda.sale'}/sales/${sale.id}`} />
            <meta property="og:type" content="website" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={`${sale.title} — FindA.Sale`} />
            <meta name="twitter:description" content={sale.description} />
          <meta name="twitter:image" content={sale.photoUrls[0] || ''} />
          </Head>
        ) : null
      )}

      {/* Event schema.org + Breadcrumb JSON-LD */}
      {sale && (
        <Head>
          <script type="application/ld+json" dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Event',
              'name': sale.title,
              'description': sale.description || undefined,
              'startDate': sale.startDate,
              'endDate': sale.endDate,
              'eventStatus': 'https://schema.org/EventScheduled',
              'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
              'location': {
                '@type': 'Place',
                'name': sale.title,
                'address': {
                  '@type': 'PostalAddress',
                  'streetAddress': sale.address || undefined,
                  'addressLocality': sale.city,
                  'addressRegion': sale.state,
                  'addressCountry': 'US',
                  'postalCode': sale.zip || undefined,
                }
              },
              ...(sale.organizer && sale.organizer.businessName ? {
                'organizer': {
                  '@type': 'Organization',
                  'name': sale.organizer.businessName,
                  'url': `https://finda.sale/organizers/${sale.organizer.id}`
                }
              } : {}),
              'url': `https://finda.sale/sales/${sale.id}`,
              ...(sale.photoUrls && sale.photoUrls[0] ? {
                'image': sale.photoUrls[0]
              } : {}),
              ...(sale.items ? {
                'offers': {
                  '@type': 'AggregateOffer',
                  'url': `https://finda.sale/sales/${sale.id}`,
                  'priceCurrency': 'USD',
                  'lowPrice': '0',
                  'offerCount': (sale as any)._count?.items || sale.items.length || 0
                }
              } : {})
            })
          }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              'itemListElement': [
                {
                  '@type': 'ListItem',
                  'position': 1,
                  'name': 'Home',
                  'item': 'https://finda.sale'
                },
                {
                  '@type': 'ListItem',
                  'position': 2,
                  'name': 'Sales',
                  'item': 'https://finda.sale/trending'
                },
                {
                  '@type': 'ListItem',
                  'position': 3,
                  'name': sale.title,
                  'item': `https://finda.sale/sales/${sale.id}`
                }
              ]
            })
          }} />
        </Head>
      )}

      {/* Feature #121: Leave Sale Warning Modal */}
      <LeaveSaleWarning
        saleId={id as string}
        isOpen={showLeaveWarning}
        onClose={handleCloseLeaveWarning}
        onConfirmLeave={handleConfirmLeave}
      />

      {/* Rank-Based Early Access: Lock Card */}
      {isSaleLocked && (
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="container mx-auto px-4 py-8 max-w-2xl">
            <SaleLockCard
              saleTitle={sale.title}
              saleCity={sale.city}
              minutesUntilUnlock={sale.minutesUntilUnlock || 0}
              userRank={xpProfile?.explorerRank || 'INITIATE'}
              showRankUpCta={showRankUpCta}
              organizerName={sale.organizer.businessName}
              photoUrl={sale.photoUrls[0]}
            />
          </div>
        </div>
      )}

      {!isSaleLocked && sale && (
      <main className="min-h-screen bg-[#F4EFE7] dark:bg-[#0B0F17] text-[#1A1814] dark:text-[#F2F0EA]">

        {/* ── HERO ── full-bleed photo with gradient overlay */}
        <div className="relative">
          <div className="relative overflow-hidden" style={{ height: '460px' }}>
            {sale.photoUrls.length > 0 ? (
              <img
                src={getSaleImageUrl(sale.photoUrls[currentPhotoIndex]) || sale.photoUrls[currentPhotoIndex]}
                alt={sale.title}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightboxOpen(true)}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{
                  background: 'repeating-linear-gradient(135deg, #E8E2D6 0 14px, #EFEAE0 14px 28px)',
                }}
              >
                <span className="text-sm uppercase tracking-widest" style={{ color: 'rgba(26,24,20,0.4)', fontFamily: 'ui-monospace, monospace' }}>
                  Photos coming soon
                </span>
              </div>
            )}
            {/* Gradient overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(180deg, rgba(20,18,14,0.0) 30%, rgba(20,18,14,0.72) 100%)' }}
            />
            {/* Dark mode gradient */}
            <div
              className="absolute inset-0 pointer-events-none hidden dark:block"
              style={{ background: 'linear-gradient(180deg, rgba(11,15,23,0.0) 30%, rgba(11,15,23,0.85) 100%)' }}
            />

            {/* Status + type pills — top left */}
            <div className="absolute top-5 left-6 flex gap-2 flex-wrap">
              {/* Status pill */}
              {(() => {
                const s = sale.status?.toUpperCase();
                const isLive = s === 'ACTIVE' || s === 'PUBLISHED' || (saleHasStarted && !saleHasEnded);
                const isEnded = s === 'ENDED' || saleHasEnded;
                if (isLive && !isEnded) return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono tracking-wide" style={{ background: 'rgba(123,176,123,0.22)', color: '#7BB07B', border: '1px solid rgba(123,176,123,0.3)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7BB07B] inline-block" />
                    Live now
                  </span>
                );
                if (isEnded) return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono tracking-wide" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(242,240,234,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'rgba(242,240,234,0.4)' }} />
                    Ended
                  </span>
                );
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono tracking-wide" style={{ background: 'rgba(233,124,77,0.2)', color: '#E97C4D', border: '1px solid rgba(233,124,77,0.3)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E97C4D] inline-block" />
                    Upcoming
                  </span>
                );
              })()}
              {/* Sale type pill */}
              {sale.saleType && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono tracking-wide" style={{ background: 'rgba(255,255,255,0.12)', color: '#F2F0EA', border: '1px solid rgba(255,255,255,0.18)' }}>
                  {sale.saleType.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            {/* Photo counter — top right */}
            {sale.photoUrls.length > 1 && (
              <div
                className="absolute top-5 right-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs cursor-pointer"
                style={{ background: 'rgba(11,15,23,0.55)', backdropFilter: 'blur(8px)', color: '#F2F0EA', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em' }}
                onClick={() => setLightboxOpen(true)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M3 17l5-5 5 5 3-3 5 5"/></svg>
                {currentPhotoIndex + 1} / {sale.photoUrls.length}
              </div>
            )}

            {/* Title block — bottom of hero */}
            <div className="absolute bottom-7 left-6 right-6 text-[#F2F0EA]">
              <h1 style={{ fontFamily: '"Inter Tight", "Inter", sans-serif', fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.05, margin: 0, maxWidth: 820 }}>
                {sale.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm" style={{ color: 'rgba(242,240,234,0.85)' }}>
                <span className="flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
                  {sale.saleType === 'RETAIL' ? 'Permanent storefront' : `${format(parseISO(sale.startDate), 'MMM d')}–${format(parseISO(sale.endDate), 'MMM d, yyyy')}`}
                </span>
                <span className="w-px h-3 bg-white/20" />
                <span className="flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-7.5-7-12a7 7 0 0114 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>
                  {sale.city}, {sale.state}
                </span>
              </div>
            </div>
          </div>

          {/* Thumbnail strip */}
          {sale.photoUrls.length > 1 && (
            <div className="flex gap-2 px-6 py-3 overflow-x-auto bg-[#F4EFE7] dark:bg-[#0B0F17] border-b border-black/10 dark:border-white/8">
              {sale.photoUrls.map((url, idx) => (
                <div
                  key={idx}
                  className="relative flex-shrink-0 rounded-md overflow-hidden cursor-pointer"
                  style={{ width: 88, height: 60, outline: idx === currentPhotoIndex ? '2px solid #C8552B' : '1px solid rgba(20,18,14,0.12)', outlineOffset: idx === currentPhotoIndex ? -2 : 0 }}
                  onClick={() => setCurrentPhotoIndex(idx)}
                >
                  <img src={getSaleImageUrl(url) || url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                  {isOrganizer && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemovePhoto(idx); }}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove photo"
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Organizer photo upload controls (organizer only) */}
          {isOrganizer && (
            <div className="px-6 py-2 bg-[#F4EFE7] dark:bg-[#0B0F17] border-b border-black/10 dark:border-white/8 flex flex-wrap items-center gap-3">
              {photoUploadError && <p className="w-full text-red-500 text-sm">{photoUploadError}</p>}
              {sale.photoUrls.length < 6 ? (
                <>
                  <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading} className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm disabled:opacity-50 transition-colors">
                    {photoUploading ? 'Uploading…' : '+ Add Photos'}
                  </button>
                  <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handlePhotoUpload(e.target.files)} />
                </>
              ) : (
                <span className="text-sm text-warm-500 dark:text-gray-400">Max 6 photos reached</span>
              )}
              <button onClick={() => setTourOpen(true)} className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors">
                🎬 Take a Tour
              </button>
            </div>
          )}
        </div>

        {/* ── BREADCRUMB ── */}
        <div className="px-6 py-2.5 text-xs border-b border-black/8 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826]" style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.02em', color: 'rgba(26,24,20,0.5)' }}>
          <Link href="/" className="hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <span>{sale.city}, {sale.state}</span>
          <span className="mx-2">/</span>
          <span style={{ color: '#1A1814' }} className="dark:text-[#F2F0EA]">{sale.organizer.businessName}</span>
        </div>

        {/* ── STICKY ACTION STRIP (mobile bottom-pinned, desktop inline below hero) ── */}
        {/* Mobile: fixed bottom bar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-3 border-t border-black/10 dark:border-white/8" style={{ background: saleHasEnded ? undefined : 'rgba(251,248,242,0.95)', backdropFilter: 'blur(12px)' }}>
          <div className="dark:bg-[rgba(11,15,23,0.92)] dark:backdrop-blur-md rounded-none" style={saleHasEnded ? { background: 'rgba(251,248,242,0.95)', backdropFilter: 'blur(12px)' } : {}}>
            {saleHasEnded ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 text-sm text-[#1A1814] dark:text-[#F2F0EA]">This sale has ended. Follow for next time.</div>
                <FollowOrganizerButton organizerId={sale.organizer.id} organizerName={sale.organizer.businessName} />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <FavoriteButton itemId={undefined as any} saleId={sale.id} variant="icon" size="md" />
                <RemindMeButton saleId={sale.id} saleName={sale.title} disabled={saleHasEnded} />
                <SaleShareButton saleId={sale.id} saleTitle={sale.title} saleLocation={`${sale.city}, ${sale.state}`} saleDate={sale.startDate} userId={user?.id} />
                {sale.items.length > 0 && (
                  <a href="#items" className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: '#C8552B' }}>
                    View {sale.items.length} items
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── TWO-COLUMN BODY ── */}
        <div className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 pb-24 lg:pb-12 lg:grid lg:grid-cols-[1fr_360px] lg:gap-7">

          {/* ── MAIN COLUMN ── */}
          <div className="flex flex-col gap-6 min-w-0">

            {/* Desktop action strip (inline, not sticky on mobile) */}
            <div className="hidden lg:block">
              <div className="rounded-xl p-4 border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] flex items-center gap-3">
                {saleHasEnded ? (
                  <>
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-black/5 dark:bg-white/6 text-[#1A1814] dark:text-[#F2F0EA]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2H4.5L6 16z"/><path d="M10 20a2 2 0 004 0"/></svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[#1A1814] dark:text-[#F2F0EA]">This sale has ended.</div>
                        <div className="text-xs" style={{ color: 'rgba(26,24,20,0.62)' }}>Follow {sale.organizer.businessName} so you don't miss the next one.</div>
                      </div>
                    </div>
                    <SaleShareButton saleId={sale.id} saleTitle={sale.title} saleLocation={`${sale.city}, ${sale.state}`} saleDate={sale.startDate} userId={user?.id} />
                    <FollowOrganizerButton organizerId={sale.organizer.id} organizerName={sale.organizer.businessName} />
                  </>
                ) : (
                  <>
                    <FavoriteButton itemId={undefined as any} saleId={sale.id} variant="icon" size="md" />
                    <RemindMeButton saleId={sale.id} saleName={sale.title} disabled={saleHasEnded} />
                    <SaleShareButton saleId={sale.id} saleTitle={sale.title} saleLocation={`${sale.city}, ${sale.state}`} saleDate={sale.startDate} userId={user?.id} />
                    <div className="flex-1" />
                    {user && <SaleRSVPButton saleId={sale.id} />}
                    {user && sale.items.length > 0 && <SaleWaitlistButton saleId={sale.id} />}
                    {sale.items.length > 0 && (
                      <a href="#items" className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: '#C8552B' }}>
                        View {sale.items.length} items
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Flash Deal Banner */}
            <FlashDealBanner saleId={sale.id} itemIds={sale.items.map((item) => item.id)} />

            {/* Live activity */}
            <div className="space-y-2">
              <HypeMeter saleId={sale.id} />
              <LiveFeedTicker saleId={sale.id} />
              <RippleIndicator saleId={sale.id} size="md" />
            </div>

            {/* Buyer's premium disclosure */}
            {sale.buyersPremiumPct && sale.buyersPremiumPct > 0 && (
              <div className="rounded-xl p-4 border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  Buyer's Premium: {sale.buyersPremiumPct}% added to final bid price at checkout.
                </p>
              </div>
            )}

            {/* D-XP-003: Organizer Special Discount Callout */}
            {sale.items.some((item) => item.organizerDiscountAmount && item.organizerDiscountAmount > 0) && (
              <div className="rounded-xl p-4 border-l-4 border-sage-600 dark:border-sage-500 bg-sage-50 dark:bg-sage-950/30 flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">🎁</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-sage-900 dark:text-sage-100">Organizer Special</h3>
                  <p className="text-sage-700 dark:text-sage-300 text-sm mt-1">
                    Save {(() => {
                      const discounts = sale.items.filter((item) => item.organizerDiscountAmount && item.organizerDiscountAmount > 0).map((item) => item.organizerDiscountAmount as number);
                      return `up to $${Math.max(...discounts).toFixed(2)}`;
                    })()} on select items at this sale!
                  </p>
                </div>
              </div>
            )}

            {/* ── ABOUT / DESCRIPTION ── */}
            <section className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-5">
              <div className="text-xs uppercase tracking-widest mb-1" style={{ fontFamily: 'ui-monospace, monospace', color: '#C8552B', letterSpacing: '0.1em' }}>About this sale</div>
              <h2 style={{ fontFamily: '"Inter Tight", "Inter", sans-serif', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 12px', color: 'inherit' }}>
                What's inside
              </h2>
              {sale.description ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(26,24,20,0.85)' }}>{sale.description}</p>
              ) : (
                <p className="text-sm italic" style={{ color: 'rgba(26,24,20,0.4)' }}>Description coming soon.</p>
              )}
              <div className="mt-4 pt-4 border-t border-black/8 dark:border-white/8 text-xs" style={{ color: 'rgba(26,24,20,0.5)', fontFamily: 'ui-monospace, monospace' }}>
                <span className="dark:text-[rgba(242,240,234,0.5)]">
                  Hold duration: {sale.holdDurationHours || 48}h after yellow tag
                </span>
              </div>
            </section>

            {/* ── SALE INFO: dates + address + entrance note + day-of notes ── */}
            <section className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* When */}
                <div>
                  <div className="text-xs uppercase tracking-widest mb-2.5" style={{ fontFamily: 'ui-monospace, monospace', color: 'rgba(26,24,20,0.4)', letterSpacing: '0.1em' }}>When</div>
                  {sale.saleType === 'RETAIL' ? (
                    <>
                      <div className="font-medium text-base" style={{ fontFamily: '"Inter Tight", "Inter", sans-serif' }}>Permanent Storefront</div>
                      {(sale.scrapedMetadata as any)?.hours_display && (
                        <p className="text-sm mt-1" style={{ color: 'rgba(26,24,20,0.62)' }}>🕐 {(sale.scrapedMetadata as any).hours_display}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-base mb-2" style={{ fontFamily: '"Inter Tight", "Inter", sans-serif' }}>
                        {format(parseISO(sale.startDate), 'EEE MMM d')} → {format(parseISO(sale.endDate), 'EEE MMM d, yyyy')}
                      </div>
                      <div className="flex flex-col gap-1 text-sm">
                        {[{ date: sale.startDate, label: format(parseISO(sale.startDate), 'EEEE, MMMM d') },
                          ...(sale.startDate !== sale.endDate ? [{ date: sale.endDate, label: format(parseISO(sale.endDate), 'EEEE, MMMM d') }] : [])
                        ].map((day, i) => {
                          const dayDate = parseISO(day.date);
                          const isToday = mounted && dayDate >= new Date(new Date().setHours(0,0,0,0)) && dayDate < new Date(new Date().setHours(24,0,0,0));
                          return (
                            <div key={i} className="flex items-center justify-between px-2.5 py-1.5 rounded-md" style={{ background: isToday ? 'rgba(200,85,43,0.10)' : 'transparent', border: isToday ? '1px solid rgba(200,85,43,0.18)' : '1px solid transparent' }}>
                              <span className="flex items-center gap-2" style={{ color: isToday ? '#C8552B' : 'inherit', fontWeight: isToday ? 500 : 400 }}>
                                {isToday && <span className="w-1.5 h-1.5 rounded-full bg-[#C8552B] inline-block" />}
                                {day.label}
                              </span>
                              <span className="text-xs" style={{ fontFamily: 'ui-monospace, monospace', color: isToday ? '#C8552B' : 'rgba(26,24,20,0.5)' }}>
                                {format(parseISO(day.date), 'h:mm a')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <AddToCalendarButton saleId={sale.id} title={sale.title} startDate={sale.startDate} endDate={sale.endDate} address={sale.address} city={sale.city} state={sale.state} description={sale.description} />
                        {user && <SaleRSVPButton saleId={sale.id} />}
                        <RSVPBadge saleId={sale.id} saleTitle={sale.title} />
                      </div>
                    </>
                  )}
                </div>

                {/* Where */}
                <div>
                  <div className="text-xs uppercase tracking-widest mb-2.5" style={{ fontFamily: 'ui-monospace, monospace', color: 'rgba(26,24,20,0.4)', letterSpacing: '0.1em' }}>Where</div>
                  <div className="flex gap-3">
                    {/* Map thumbnail */}
                    {sale.lat && sale.lng ? (
                      <button
                        className="flex-shrink-0 rounded-lg overflow-hidden border border-black/10 dark:border-white/8"
                        style={{ width: 96, height: 96 }}
                        onClick={() => {
                          const dest = sale.address ? `${sale.address}, ${sale.city}, ${sale.state}` : `${sale.city}, ${sale.state}`;
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
                        }}
                        aria-label="Open in Maps"
                      >
                        <SaleMap singlePin={{ lat: sale.lat, lng: sale.lng, label: sale.title }} height="96px" />
                      </button>
                    ) : (
                      <div className="flex-shrink-0 w-24 h-24 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/8 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(26,24,20,0.3)' }}><path d="M12 21s-7-7.5-7-12a7 7 0 0114 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>
                      </div>
                    )}
                    <div className="flex-1 text-sm leading-relaxed">
                      {sale.address && <div className="font-medium">{sale.address}</div>}
                      <div style={{ color: 'rgba(26,24,20,0.62)' }}>{sale.city}, {sale.state} {sale.zip}</div>
                      <button
                        className="mt-2 text-xs font-medium flex items-center gap-1 hover:underline"
                        style={{ color: '#C8552B' }}
                        onClick={() => {
                          const dest = sale.address ? `${sale.address}, ${sale.city}, ${sale.state}` : `${sale.city}, ${sale.state}`;
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
                        }}
                      >
                        Open in Maps
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Entrance / parking tip */}
              {sale.entranceNote && (
                <div className="mt-4 p-4 rounded-lg flex items-start gap-3" style={{ background: 'rgba(168,116,32,0.08)', border: '1px solid rgba(168,116,32,0.18)' }}>
                  <div className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(168,116,32,0.14)', color: '#A87420' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v5h1"/></svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-wider mb-1 font-medium" style={{ fontFamily: 'ui-monospace, monospace', color: '#A87420', letterSpacing: '0.06em' }}>Day-of tip from organizer</div>
                    <div className="text-sm leading-relaxed">{sale.entranceNote}</div>
                  </div>
                </div>
              )}

              {/* Day-of notes */}
              {sale.notes && (
                <div className="mt-4 pt-4 border-t border-black/8 dark:border-white/8">
                  <div className="text-xs uppercase tracking-widest mb-2" style={{ fontFamily: 'ui-monospace, monospace', color: 'rgba(26,24,20,0.4)', letterSpacing: '0.1em' }}>House rules</div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{sale.notes}</p>
                </div>
              )}

              {/* Feature #84: Approach Notes */}
              {approachNotes && approachNotes.notes && (
                <div className="mt-4 pt-4 border-t border-black/8 dark:border-white/8">
                  <div className="text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ fontFamily: 'ui-monospace, monospace', color: 'rgba(26,24,20,0.4)', letterSpacing: '0.1em' }}>
                    📍 Your approach notes
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{approachNotes.notes}</p>
                </div>
              )}
            </section>

            {/* ── FULL MAP (large) ── */}
            {sale.lat && sale.lng && (
              <section className="rounded-xl overflow-hidden border border-black/10 dark:border-white/8">
                <SaleMap
                  singlePin={{ lat: sale.lat, lng: sale.lng, label: `${sale.title} — ${sale.address ? `${sale.address}, ` : ''}${sale.city}, ${sale.state}` }}
                  entrancePin={sale.entranceLat && sale.entranceLng ? { lat: sale.entranceLat, lng: sale.entranceLng, note: sale.entranceNote } : undefined}
                  photoOpStations={photoOpStations}
                  height="320px"
                />
              </section>
            )}

            {/* ── ITEMS GRID ── */}
            <section id="items" className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-5">
              {/* Section header */}
              <div className="flex items-end justify-between gap-6 pb-4 mb-4 border-b border-black/8 dark:border-white/8">
                <div>
                  <div className="text-xs uppercase tracking-widest mb-1.5" style={{ fontFamily: 'ui-monospace, monospace', color: '#C8552B', letterSpacing: '0.1em' }}>
                    {sale.isAuctionSale ? 'Lot catalog' : 'Inventory'}
                  </div>
                  <h2 style={{ fontFamily: '"Inter Tight", "Inter", sans-serif', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
                    {sale.items.length > 0 ? `${sale.items.length} items` : 'Items for Sale'}
                    {saleHasEnded && <span className="text-sm font-normal ml-2" style={{ color: 'rgba(26,24,20,0.5)' }}>Archive — most items claimed.</span>}
                  </h2>
                </div>
                {isOrganizer && sale.items.length > 0 && (
                  <Link href={`/organizer/add-items/${sale.id}`} className="bg-amber-600 hover:bg-amber-700 text-white font-medium py-1.5 px-3 rounded-lg inline-flex items-center text-sm shrink-0 transition-colors">
                    + Add Items
                  </Link>
                )}
              </div>

              {/* Tags / category chip strip */}
              {sale.tags && sale.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4 items-center">
                  <span className="text-xs uppercase tracking-widest mr-1" style={{ fontFamily: 'ui-monospace, monospace', color: 'rgba(26,24,20,0.4)' }}>What's there</span>
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="px-3 py-1.5 rounded-full text-xs border transition-colors"
                    style={{ background: selectedCategory === null ? '#1A1814' : 'transparent', color: selectedCategory === null ? '#F4EFE7' : '#1A1814', borderColor: selectedCategory === null ? '#1A1814' : 'rgba(20,18,14,0.18)' }}
                  >
                    All
                  </button>
                  {sale.tags.map((tag, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedCategory(tag.toLowerCase())}
                      className="px-3 py-1.5 rounded-full text-xs border transition-colors dark:border-white/14"
                      style={{ background: selectedCategory === tag.toLowerCase() ? '#1A1814' : 'transparent', color: selectedCategory === tag.toLowerCase() ? '#F4EFE7' : '#1A1814', borderColor: selectedCategory === tag.toLowerCase() ? '#1A1814' : 'rgba(20,18,14,0.18)' }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Category filter + per-page (if no tags) */}
              {(!sale.tags || sale.tags.length === 0) && sale.items.some((item) => item.category) && (
                <div className="flex items-center gap-3 mb-4 relative">
                  <button onClick={() => setCategoryDropdownOpen(o => !o)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-warm-700 dark:text-gray-200 hover:bg-warm-50 transition-colors">
                    {selectedCategory ? formatCategoryLabel(selectedCategory) : 'Filter by category'}
                    {selectedCategory && <span onClick={(e) => { e.stopPropagation(); setSelectedCategory(null); setCurrentItemPage(1); }} className="ml-1 font-bold">×</span>}
                    <svg className={`w-4 h-4 ml-1 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  {categoryDropdownOpen && (
                    <div className="absolute z-20 mt-2 top-full left-0 w-72 max-h-72 overflow-y-auto bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-600 rounded-lg shadow-lg py-1">
                      <button onClick={() => { setSelectedCategory(null); setCurrentItemPage(1); setCategoryDropdownOpen(false); }} className={`w-full text-left px-4 py-2 text-sm ${selectedCategory === null ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 font-semibold' : 'text-warm-700 dark:text-gray-200 hover:bg-warm-50 dark:hover:bg-gray-700'}`}>All categories</button>
                      {Array.from(new Set(sale.items.map((item) => item.category?.toLowerCase()).filter(Boolean))).map((cat) => (
                        <button key={cat} onClick={() => { setSelectedCategory(cat as string); setCurrentItemPage(1); setCategoryDropdownOpen(false); }} className={`w-full text-left px-4 py-2 text-sm ${selectedCategory === cat ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 font-semibold' : 'text-warm-700 dark:text-gray-200 hover:bg-warm-50 dark:hover:bg-gray-700'}`}>
                          {formatCategoryLabel(cat as string)} <span className="ml-1 text-warm-400">({sale.items.filter(i => i.category?.toLowerCase() === cat).length})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {sale.items.length > 12 && (
                    <div className="flex items-center gap-2 ml-auto">
                      <label className="text-sm text-warm-500 dark:text-gray-400 whitespace-nowrap">Show:</label>
                      <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentItemPage(1); }} className="text-sm border border-warm-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-warm-900 dark:text-gray-100">
                        <option value={12}>12</option><option value={24}>24</option><option value={48}>48</option><option value={0}>All</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Scarcity bar */}
              {sale.items.length > 0 && (() => {
                const availableCount = sale.items.filter(i => i.status === 'AVAILABLE').length;
                const soldCount = sale.items.filter(i => i.status === 'SOLD').length;
                const reservedCount = sale.items.filter(i => i.status === 'RESERVED').length;
                const isLowStock = availableCount > 0 && availableCount <= Math.max(3, Math.floor(sale.items.length * 0.2));
                const isSoldOut = availableCount === 0;
                return (
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    {isSoldOut ? <span className="inline-flex items-center gap-1 bg-warm-100 text-warm-600 text-xs font-semibold px-3 py-1.5 rounded-full">All items sold or reserved</span>
                      : isLowStock ? <span className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 text-xs font-bold px-3 py-1.5 rounded-full ring-1 ring-red-200 animate-pulse">🔥 Only {availableCount} left!</span>
                      : <span className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-200 text-xs font-semibold px-3 py-1.5 rounded-full">✓ {availableCount} available</span>}
                    {soldCount > 0 && <span className="text-xs text-warm-500 dark:text-gray-300">{soldCount} sold</span>}
                    {reservedCount > 0 && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{reservedCount} on hold</span>}
                  </div>
                );
              })()}

              {/* Feature #85: Treasure Hunt Summary */}
              {sale.items.length > 0 && <HuntSummary saleId={sale.id} />}

              {/* Feature #310: Color Key Legend */}
              <ColorKeyLegend saleId={id as string} itemsExist={sale.items.length > 0} isOrganizerView={isOrganizer} />

              {sale.items.length === 0 ? (
                <div className="py-12 text-center flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(26,24,20,0.3)' }}><path d="M5 8h14l-1 13H6L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Inventory being added — check back soon.</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(26,24,20,0.5)' }}>Get a reminder when items are posted.</p>
                  </div>
                  {isOrganizer ? (
                    <Link href={`/organizer/add-items/${sale.id}`} className="bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-lg inline-flex items-center text-sm transition-colors">
                      Add Your First Item
                    </Link>
                  ) : (
                    <RemindMeButton saleId={sale.id} saleName={sale.title} disabled={false} />
                  )}
                </div>
              ) : (() => {
                const filteredSorted = sale.items
                  .filter((item) => selectedCategory === null || item.category?.toLowerCase() === selectedCategory)
                  .sort((a, b) => {
                    if (a.status === 'SOLD' && b.status !== 'SOLD') return 1;
                    if (a.status !== 'SOLD' && b.status === 'SOLD') return -1;
                    return 0;
                  });
                const effectivePerPage = itemsPerPage === 0 ? filteredSorted.length : itemsPerPage;
                const totalPages = effectivePerPage > 0 ? Math.ceil(filteredSorted.length / effectivePerPage) : 1;
                const pagedItems = filteredSorted.slice((currentItemPage - 1) * effectivePerPage, currentItemPage * effectivePerPage);
                return (
                  <>
                    {filteredSorted.length > 12 && (
                      <p className="text-xs mb-4" style={{ color: 'rgba(26,24,20,0.5)' }}>
                        Showing {Math.min(currentItemPage * effectivePerPage, filteredSorted.length) - (currentItemPage - 1) * effectivePerPage} of {filteredSorted.length} items
                      </p>
                    )}
                    {/* Photo-first item grid — 2 col mobile, 3 col md, 4 col lg */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {pagedItems.map((item) => (
                        <div key={item.id} className="rounded-xl overflow-hidden border border-black/10 dark:border-white/8 bg-[#FFFFFF] dark:bg-[#19202F] flex flex-col">
                          {/* Photo */}
                          <div className="relative overflow-hidden" style={{ aspectRatio: '1/1' }}>
                            <Link href={`/items/${item.id}`} className="block h-full">
                              {item.photoUrls.length > 0 ? (
                                <img src={getItemImageUrl(item.photoUrls[0]) || item.photoUrls[0]} alt={item.title} className="w-full h-full object-cover hover:opacity-90 transition" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center" style={{ background: 'repeating-linear-gradient(135deg, #E8E2D6 0 14px, #EFEAE0 14px 28px)' }}>
                                  <span className="text-xs" style={{ color: 'rgba(26,24,20,0.3)', fontFamily: 'ui-monospace, monospace' }}>no photo</span>
                                </div>
                              )}
                            </Link>
                            {/* Rarity badge */}
                            {item.listingType && ['RARE','ULTRA_RARE','LEGENDARY'].includes((item as any).rarity) && (
                              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wide" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, backdropFilter: 'blur(4px)', background: (item as any).rarity === 'LEGENDARY' ? 'rgba(224,168,91,0.18)' : (item as any).rarity === 'ULTRA_RARE' ? 'rgba(196,154,224,0.16)' : 'rgba(157,183,232,0.14)', color: (item as any).rarity === 'LEGENDARY' ? '#E0A85B' : (item as any).rarity === 'ULTRA_RARE' ? '#C49AE0' : '#9DB7E8' }}>
                                {(item as any).rarity === 'LEGENDARY' ? 'Legendary' : (item as any).rarity === 'ULTRA_RARE' ? 'Ultra rare' : 'Rare'}
                              </div>
                            )}
                            {/* Listing type badge (non-fixed) */}
                            {item.listingType && item.listingType !== 'FIXED' && (
                              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, background: 'rgba(11,15,23,0.7)', backdropFilter: 'blur(6px)', color: '#F2F0EA', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {item.listingType === 'AUCTION' ? '⚖ Auction' : item.listingType === 'REVERSE_AUCTION' ? '↓ Drops daily' : item.listingType === 'LIVE_DROP' ? '⚡ Live drop' : 'In-person'}
                              </div>
                            )}
                            {/* Favorite button */}
                            <div className="absolute top-2 right-2">
                              <FavoriteButton itemId={item.id} saleId={id as string} variant="icon" size="md" />
                            </div>
                            {/* Sold overlay */}
                            {(item.status === 'SOLD' || item.status === 'PENDING') && (
                              <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(11,15,23,0.55)' }}>
                                <span style={{ fontFamily: '"Inter Tight","Inter",sans-serif', fontSize: 20, fontWeight: 600, color: '#F2F0EA', letterSpacing: '0.08em', padding: '4px 12px', border: '2px solid #F2F0EA', transform: 'rotate(-6deg)', display: 'inline-block' }}>SOLD</span>
                              </div>
                            )}
                            {item.status === 'RESERVED' && (
                              <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(200,85,43,0.25)' }}>
                                <span style={{ fontFamily: '"Inter Tight","Inter",sans-serif', fontSize: 13, fontWeight: 600, color: '#F2F0EA', letterSpacing: '0.04em', padding: '3px 10px', border: '1.5px solid rgba(242,240,234,0.7)', borderRadius: 4 }}>ON HOLD</span>
                              </div>
                            )}
                          </div>

                          {/* Card body */}
                          <div className="p-3 flex flex-col gap-2 flex-1">
                            <h3 className="text-xs font-medium leading-tight line-clamp-2">{item.title}</h3>

                            {/* Status badges */}
                            {(item.category || item.condition) && (
                              <div className="flex flex-wrap gap-1">
                                {item.category && <span className="px-1.5 py-0.5 rounded text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">{formatCategoryLabel(item.category)}</span>}
                                {item.condition && <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-100">{item.condition.charAt(0).toUpperCase() + item.condition.slice(1)}</span>}
                                {item.organizerDiscountAmount && item.organizerDiscountAmount > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 font-bold">${item.organizerDiscountAmount.toFixed(2)} off</span>}
                              </div>
                            )}

                            {/* Price / auction UI */}
                            {(sale.isAuctionSale || item.listingType === 'AUCTION') ? (
                              <div>
                                <div className="flex justify-between items-baseline mb-1">
                                  <div>
                                    <div className="text-xs font-mono" style={{ color: 'rgba(26,24,20,0.4)', fontSize: 10 }}>BID</div>
                                    <div className="font-semibold text-amber-600 dark:text-amber-400">{formatPrice(item.currentBid || item.auctionStartPrice)}</div>
                                  </div>
                                  {item.auctionEndTime && (
                                    <AuctionCountdown endTime={item.auctionEndTime} onExpired={() => queryClient.invalidateQueries({ queryKey: ['sale', id] })} />
                                  )}
                                </div>
                                {!isOrganizer && user && item.status === 'AVAILABLE' && item.auctionEndTime && mounted && new Date(item.auctionEndTime) > new Date() && (
                                  <div className="flex">
                                    <input type="number" step="0.01" min={(item.currentBid || item.auctionStartPrice) + (item.bidIncrement || 1)} value={bidAmounts[item.id] || ''} onChange={(e) => handleBidAmountChange(item.id, e.target.value)} className="flex-grow px-2 py-1 border border-warm-300 dark:border-gray-600 rounded-l text-xs dark:bg-gray-700 dark:text-warm-100" placeholder="Bid amount" aria-label="Enter bid amount" />
                                    <button onClick={() => handlePlaceBid(item.id)} disabled={biddingItemId === item.id} className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-2 py-1 rounded-r disabled:opacity-50">
                                      {biddingItemId === item.id ? '...' : 'Bid'}
                                    </button>
                                  </div>
                                )}
                                {item.status === 'AUCTION_ENDED' && <div className="text-xs text-center py-1.5 bg-warm-100 dark:bg-gray-700 rounded text-warm-600 dark:text-gray-400">Auction ended</div>}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div>
                                  {item.effectivePrice && item.effectivePrice !== item.price ? (
                                    <>
                                      <div className="text-xs line-through text-gray-400">{formatPrice(item.price)}</div>
                                      <div className="font-semibold text-green-600 dark:text-green-400">{formatPrice(item.effectivePrice)}</div>
                                    </>
                                  ) : (
                                    <div className="font-semibold text-amber-600 dark:text-amber-400">{formatPrice(item.price)}</div>
                                  )}
                                </div>
                                {!isOrganizer && user && item.status === 'AVAILABLE' && !item.auctionStartPrice && (
                                  <div className="flex gap-1">
                                    <button onClick={() => handleBuyNow(item.id, item.title)} className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-2 py-1.5 rounded-lg transition-colors">Buy</button>
                                    {item.price !== null && (
                                      <button onClick={() => handleAddToCart(item)} className={`text-xs px-2 py-1.5 rounded-lg font-medium transition-colors ${shopperCart.items.some((ci) => ci.id === item.id) ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 cursor-default' : 'border border-amber-600 dark:border-amber-500 text-amber-600 dark:text-amber-400'}`} disabled={shopperCart.items.some((ci) => ci.id === item.id)}>
                                        {shopperCart.items.some((ci) => ci.id === item.id) ? '✓' : '+'}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Organizer actions */}
                            {isOrganizer && (
                              <div className="flex gap-2 mt-auto pt-1">
                                <Link href={`/organizer/edit-item/${item.id}`} className="text-amber-600 hover:text-amber-800 text-xs">Edit</Link>
                                {!!item.auctionEndTime && !item.auctionClosed && (
                                  <button onClick={() => setConfirmState({ open: true, title: 'End Auction', message: `End auction for "${item.title}"?`, onConfirm: () => { api.post(`/items/${item.id}/close-auction`).then(() => { showToast('Auction closed', 'success'); queryClient.invalidateQueries({ queryKey: ['sale', id] }); }).catch((err: any) => showToast(err.response?.data?.message || 'Failed', 'error')).finally(() => setConfirmState(s => ({ ...s, open: false }))); } })} className="text-red-600 hover:text-red-800 text-xs">End Auction</button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
                        <button onClick={() => setCurrentItemPage(p => Math.max(1, p - 1))} disabled={currentItemPage === 1} className="px-3 py-1.5 rounded-lg border border-warm-300 dark:border-gray-600 text-sm font-medium disabled:opacity-40 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors">← Prev</button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - currentItemPage) <= 1).map((p, idx, arr) => (
                          <React.Fragment key={p}>
                            {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-warm-400 px-1">…</span>}
                            <button onClick={() => setCurrentItemPage(p)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${p === currentItemPage ? 'bg-amber-600 text-white' : 'border border-warm-300 dark:border-gray-600 hover:bg-warm-100 dark:hover:bg-gray-700'}`}>{p}</button>
                          </React.Fragment>
                        ))}
                        <button onClick={() => setCurrentItemPage(p => Math.min(totalPages, p + 1))} disabled={currentItemPage === totalPages} className="px-3 py-1.5 rounded-lg border border-warm-300 dark:border-gray-600 text-sm font-medium disabled:opacity-40 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors">Next →</button>
                      </div>
                    )}
                  </>
                );
              })()}
            </section>

            {/* ── UGC PHOTO GALLERY ── */}
            {ugcPhotos.length > 0 && (
              <section className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-5">
                <h2 style={{ fontFamily: '"Inter Tight","Inter",sans-serif', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 16px' }}>
                  Community Photos <span className="text-sm font-normal" style={{ color: 'rgba(26,24,20,0.5)' }}>({ugcPhotos.length})</span>
                </h2>
                <UGCPhotoGallery photos={ugcPhotos} loading={ugcLoading} />
              </section>
            )}

            {/* ── REVIEWS ── */}
            {(sale.organizer.avgRating ?? 0) > 0 && (
              <section className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-5">
                <div className="text-xs uppercase tracking-widest mb-1.5" style={{ fontFamily: 'ui-monospace, monospace', color: '#C8552B', letterSpacing: '0.1em' }}>
                  From {sale.organizer.businessName}'s past sales
                </div>
                <div className="flex items-end justify-between gap-4 pb-4 mb-4 border-b border-black/8 dark:border-white/8">
                  <div className="flex items-baseline gap-4">
                    <div style={{ fontFamily: '"Inter Tight","Inter",sans-serif', fontSize: 48, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1 }}>
                      {(sale.organizer.avgRating ?? 0).toFixed(1)}
                    </div>
                    <div>
                      <div className="flex gap-0.5 mb-1" style={{ color: '#C8552B' }}>
                        {[1,2,3,4,5].map(i => <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6"><path d="M12 3l2.6 5.8 6.4.7-4.8 4.4 1.4 6.3L12 17l-5.6 3.2 1.4-6.3L3 9.5l6.4-.7L12 3z"/></svg>)}
                      </div>
                      <div className="text-xs" style={{ color: 'rgba(26,24,20,0.62)' }}>
                        {sale.organizer.reviewCount || 0} reviews
                      </div>
                    </div>
                  </div>
                  <Link href={`/organizers/${sale.organizer.id}`} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: '#C8552B' }}>
                    See all reviews
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </Link>
                </div>
                <OrganizerReputation organizerId={sale.organizer.id} />
              </section>
            )}

            {/* ── ORGANIZER CARD (bottom of main, inline layout) ── */}
            <section className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-5">
              <div className="flex items-center gap-4">
                {/* Logo / initials */}
                <div className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center border border-black/10 dark:border-white/8 bg-[#FFFFFF] dark:bg-[#19202F]" style={{ fontFamily: '"Inter Tight","Inter",sans-serif', fontWeight: 700, fontSize: 20, color: '#C8552B', letterSpacing: '-0.02em' }}>
                  {sale.organizer.businessName.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-mono uppercase tracking-wider" style={{ color: 'rgba(26,24,20,0.4)', letterSpacing: '0.08em' }}>Organized by</span>
                    <VerifiedBadge status={sale.organizer.verificationStatus} size="sm" />
                    {sale.organizer.tier && (sale.organizer.tier === 'SILVER' || sale.organizer.tier === 'GOLD') && <OrganizerTierBadge tier={sale.organizer.tier} />}
                  </div>
                  <div style={{ fontFamily: '"Inter Tight","Inter",sans-serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
                    {sale.organizer.businessName}
                  </div>
                  {(sale.organizer.avgRating ?? 0) > 0 && (
                    <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'rgba(26,24,20,0.62)' }}>
                      <span className="flex items-center gap-1 font-medium" style={{ color: '#C8552B' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6"><path d="M12 3l2.6 5.8 6.4.7-4.8 4.4 1.4 6.3L12 17l-5.6 3.2 1.4-6.3L3 9.5l6.4-.7L12 3z"/></svg>
                        {(sale.organizer.avgRating ?? 0).toFixed(1)}
                      </span>
                      <span className="w-px h-2.5 bg-black/10 dark:bg-white/10" />
                      <span>({sale.organizer.reviewCount} reviews)</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Link href={`/organizers/${sale.organizer.id}`} className="text-xs px-3 py-1.5 rounded-lg border border-black/18 dark:border-white/14 hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium text-center">Storefront</Link>
                  {!isOrganizer && <FollowOrganizerButton organizerId={sale.organizer.id} organizerName={sale.organizer.businessName} />}
                </div>
              </div>
              <BadgeDisplay badges={sale.organizer.badges || []} />

              {/* Feature #361: Claim-This-Listing Banner */}
              {!sale.organizer.isClaimed && (
                <div className="mt-4 pt-4 border-t border-black/8 dark:border-white/8 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Is this your sale?</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Claim this listing to manage photos, reply to reviews, and connect with shoppers.</p>
                  </div>
                  <button onClick={() => setShowClaimModal(true)} className="text-xs bg-amber-600 dark:bg-amber-700 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors flex-shrink-0">
                    Claim
                  </button>
                </div>
              )}

              {/* Organizer message + organizer tools */}
              {!isOrganizer && (
                <div className="mt-3 pt-3 border-t border-black/8 dark:border-white/8">
                  {user ? (
                    <button onClick={() => setMessageModalOpen(true)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 text-white font-medium transition-colors">Message Organizer</button>
                  ) : (
                    <Link href="/login" className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 text-white font-medium transition-colors">Sign in to Message</Link>
                  )}
                </div>
              )}
              {isOrganizer && (
                <div className="mt-3 pt-3 border-t border-black/8 dark:border-white/8 flex flex-wrap gap-2">
                  <button onClick={() => router.push(`/organizer/edit-sale/${sale.id}`)} className="px-3 py-1.5 bg-amber-600 dark:bg-amber-700 hover:bg-amber-700 text-white rounded-lg font-medium text-xs transition-colors">Edit Sale</button>
                  <button onClick={() => setIsImportModalOpen(true)} className="px-3 py-1.5 bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 text-white rounded-lg text-xs transition-colors">Import Items</button>
                  <button onClick={handleDownloadMarketingKit} disabled={downloadingKit} className="px-3 py-1.5 bg-purple-600 dark:bg-purple-700 hover:bg-purple-700 text-white rounded-lg text-xs disabled:opacity-50 transition-colors">{downloadingKit ? 'Generating...' : 'Download Kit'}</button>
                </div>
              )}
            </section>

            {/* ── SIMILAR ITEMS ── */}
            {sale.items.length > 0 && sale.items[0] && (
              <section className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-5">
                <SimilarItems itemId={sale.items[0].id} category={sale.items[0].category || 'general'} />
              </section>
            )}

          </div>{/* end MAIN COLUMN */}

          {/* ── SIDE RAIL (desktop only, sticky) ── */}
          <aside className="hidden lg:flex flex-col gap-4 self-start sticky top-6">

            {/* Save / Remind / Share rail card */}
            {!saleHasEnded ? (
              <div className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-4">
                <div className="text-xs uppercase tracking-widest mb-3" style={{ fontFamily: 'ui-monospace, monospace', color: 'rgba(26,24,20,0.4)', letterSpacing: '0.1em' }}>Don't lose it</div>
                <div className="flex flex-col gap-2">
                  <RemindMeButton saleId={sale.id} saleName={sale.title} disabled={false} />
                  <FavoriteButton itemId={undefined as any} saleId={sale.id} variant="full" size="md" />
                  <SaleShareButton saleId={sale.id} saleTitle={sale.title} saleLocation={`${sale.city}, ${sale.state}`} saleDate={sale.startDate} userId={user?.id} />
                </div>
                <div className="mt-3 pt-3 border-t border-black/8 dark:border-white/8 text-xs leading-relaxed" style={{ color: 'rgba(26,24,20,0.4)' }}>
                  No account needed for reminders — drop a phone or email and we'll text the day before.
                </div>
                {user && (
                  <div className="mt-3 flex flex-col gap-2">
                    <SaleRSVPButton saleId={sale.id} />
                    {sale.items.length > 0 && <SaleWaitlistButton saleId={sale.id} />}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-4">
                <p className="text-sm font-medium mb-3">This sale has ended.</p>
                <p className="text-xs mb-3" style={{ color: 'rgba(26,24,20,0.62)' }}>Follow {sale.organizer.businessName} so you don't miss the next one.</p>
                <FollowOrganizerButton organizerId={sale.organizer.id} organizerName={sale.organizer.businessName} />
              </div>
            )}

            {/* Map rail block */}
            <div className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <div className="text-xs uppercase tracking-widest mb-1.5" style={{ fontFamily: 'ui-monospace, monospace', color: 'rgba(26,24,20,0.4)', letterSpacing: '0.1em' }}>Where to go</div>
                {sale.address && <div className="text-sm font-medium">{sale.address}</div>}
                <div className="text-xs mb-2" style={{ color: 'rgba(26,24,20,0.62)' }}>{sale.city}, {sale.state} {sale.zip}</div>
              </div>
              {sale.lat && sale.lng ? (
                <SaleMap
                  singlePin={{ lat: sale.lat, lng: sale.lng, label: sale.title }}
                  entrancePin={sale.entranceLat && sale.entranceLng ? { lat: sale.entranceLat, lng: sale.entranceLng, note: sale.entranceNote } : undefined}
                  height="160px"
                />
              ) : (
                <div className="h-32 bg-black/5 dark:bg-white/5 flex items-center justify-center">
                  <span className="text-xs" style={{ color: 'rgba(26,24,20,0.3)' }}>Location not available</span>
                </div>
              )}
              <div className="px-4 py-3 flex gap-2">
                <button onClick={() => { const dest = sale.address ? `${sale.address}, ${sale.city}, ${sale.state}` : `${sale.city}, ${sale.state}`; window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank'); }} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/18 dark:border-white/14 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-7.5-7-12a7 7 0 0114 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>
                  Directions
                </button>
              </div>
            </div>

            {/* Organizer rail card */}
            <div className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center border border-black/10 dark:border-white/8 bg-white dark:bg-[#19202F]" style={{ fontFamily: '"Inter Tight","Inter",sans-serif', fontWeight: 700, fontSize: 16, color: '#C8552B' }}>
                  {sale.organizer.businessName.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs mb-0.5 flex items-center gap-1" style={{ color: 'rgba(26,24,20,0.4)', fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10 }}>
                    Organized by
                    <VerifiedBadge status={sale.organizer.verificationStatus} size="sm" />
                  </div>
                  <div className="font-semibold text-sm leading-tight truncate" style={{ fontFamily: '"Inter Tight","Inter",sans-serif' }}>{sale.organizer.businessName}</div>
                  {(sale.organizer.avgRating ?? 0) > 0 && (
                    <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'rgba(26,24,20,0.62)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" style={{ color: '#C8552B' }}><path d="M12 3l2.6 5.8 6.4.7-4.8 4.4 1.4 6.3L12 17l-5.6 3.2 1.4-6.3L3 9.5l6.4-.7L12 3z"/></svg>
                      {(sale.organizer.avgRating ?? 0).toFixed(1)} · {sale.organizer.reviewCount} reviews
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/organizers/${sale.organizer.id}`} className="flex-1 text-center text-xs px-3 py-1.5 rounded-lg border border-black/18 dark:border-white/14 font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors">Storefront</Link>
                {!isOrganizer && <FollowOrganizerButton organizerId={sale.organizer.id} organizerName={sale.organizer.businessName} />}
              </div>
            </div>

            {/* Holds & shipping info */}
            <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: 'rgba(20,18,14,0.05)', color: 'rgba(26,24,20,0.5)' }}>
              <div className="font-medium mb-1.5 uppercase tracking-wider text-[10px]" style={{ fontFamily: 'ui-monospace, monospace', color: 'rgba(26,24,20,0.62)', letterSpacing: '0.08em' }}>Holds & shipping</div>
              Holds last <strong style={{ color: '#1A1814' }}>{sale.holdDurationHours || 48} hours</strong> after a yellow tag. Items marked "ships" are paid via Stripe and sent within 3 business days.
              {sale.returnWindowHours && <div className="mt-1">Returns accepted within {sale.returnWindowHours}h of pickup.</div>}
            </div>

            {/* QR Code (organizer only) */}
            {isOrganizer && (
              <div className="rounded-xl border border-black/10 dark:border-white/8 bg-[#FBF8F2] dark:bg-[#121826] p-4">
                <div className="text-xs font-medium mb-1" style={{ fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(26,24,20,0.4)' }}>QR Code</div>
                <p className="text-xs mb-3" style={{ color: 'rgba(26,24,20,0.5)' }}>Print on signs or flyers to drive foot traffic.</p>
                <SaleQRCode saleId={sale.id} saleTitle={sale.title} size={140} />
              </div>
            )}

            {/* Photo Station + Treasure Hunt (non-organizer, non-unmanaged) */}
            {!isOrganizer && !sale.organizer.isUnmanagedListing && (
              <>
                <Link href={`/sales/${sale.id}/photo-station`} className="block rounded-xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-3 hover:shadow-md transition">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📸</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">Photo Station</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">Snap a pic · earn 5 XP</p>
                    </div>
                    <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                  </div>
                </Link>
                {sale.treasureHuntEnabled && (
                  <Link href={`/sales/${sale.id}/treasure-hunt-qr/progress`} className="block rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-3 hover:shadow-md transition">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🎯</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Treasure Hunt</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">Clues hidden around the sale</p>
                      </div>
                      <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                    </div>
                  </Link>
                )}
              </>
            )}

            {/* SaleShareCard (always visible) */}
            <SaleShareCard saleId={sale.id} saleTitle={sale.title} userId={user?.id} />

          </aside>
        </div>{/* end two-col grid */}

      </main>
      )}{/* end !isSaleLocked */}

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

      {/* Feature #361: Claim-This-Listing Modal */}
      {showClaimModal && (
        <ClaimListingModal
          organizerId={sale.organizer.id}
          onClose={() => setShowClaimModal(false)}
        />
      )}

      {/* Phase 1: Smart Cart — floating action button */}
      <ShopperCartFAB onClick={openCart} />

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
                className="px-4 py-2 rounded-lg border border-warm-300 dark:border-gray-600 text-warm-900 dark:text-gray-50 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
              >
                Keep Current Cart
              </button>
              <button
                onClick={handleConfirmSwitchSale}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
              >
                Start New Cart
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={() => confirmState.onConfirm()}
        onCancel={() => setConfirmState(s => ({ ...s, open: false }))}
      />
    </div>
  );
};

export default SaleDetailPage;

/**
 * Feature #33 — Share Card Factory
 * Fetch sale data server-side so OG meta tags are present in the initial HTML
 * before client-side React hydration. This is required for Facebook/Twitter bots
 * which do not execute JavaScript when scraping pages.
 */
export async function getServerSideProps(context: GetServerSidePropsContext) {
  const { id } = context.params as { id: string };
  // Use INTERNAL_API_URL (server-only) if set; fall back to NEXT_PUBLIC_API_URL.
  // Never falls back to localhost — that hangs and kills the Vercel function timeout.
  const apiUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    null;

  if (!apiUrl) {
    return { props: { ogData: null, initialData: null } };
  }

  try {
    // 3s timeout — fail fast so Vercel function never hangs waiting for localhost
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${apiUrl}/sales/${id}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      // Return proper 404 so Google doesn't flag as Soft 404
      if (res.status === 404) {
        return { notFound: true };
      }
      return { props: { ogData: null, initialData: null } };
    }
    const sale = await res.json();

    // Safeguard: check that sale has required fields for OG data
    if (!sale?.id || !sale?.title) {
      return { props: { ogData: null, initialData: null } };
    }

    const ogData: OGSaleData = {
      id: sale.id,
      title: sale.title || '',
      description: sale.description || null,
      city: sale.city || '',
      state: sale.state || '',
      startDate: sale.startDate || '',
      photoUrl: sale.photoUrls?.[0] || null,
      itemCount: sale.items?.length || 0,
      organizer: sale.organizer ? {
        subscriptionTier: sale.organizer.subscriptionTier,
        removeWatermarkEnabled: sale.organizer.removeWatermarkEnabled,
        businessName: sale.organizer.businessName,
      } : undefined,
    };

    // JSON-LD: Extract full sale data for structured data injection
    const initialData: InitialSaleData = {
      id: sale.id,
      title: sale.title || '',
      description: sale.description || '',
      address: sale.address || '',
      city: sale.city || '',
      state: sale.state || '',
      zip: sale.zip || '',
      startDate: sale.startDate || '',
      endDate: sale.endDate || '',
      photoUrls: sale.photoUrls || [],
      organizer: {
        businessName: sale.organizer?.businessName || '',
      },
    };

    return { props: { ogData, initialData } };
  } catch {
    return { props: { ogData: null, initialData: null } };
  }
}
