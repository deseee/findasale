import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { GetServerSidePropsContext } from 'next';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client'; // type-only — prevents SSR module crash
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import CheckoutModal from '../../components/CheckoutModal';
import PhotoLightbox from '../../components/PhotoLightbox';
import CountdownTimer from '../../components/CountdownTimer'; // CD2: Live Drop
import ReverseAuctionBadge from '../../components/ReverseAuctionBadge'; // CD2 Phase 4
import BuyingPoolCard from '../../components/BuyingPoolCard';
import { useToast } from '../../components/ToastContext';
import ItemShareButton from '../../components/ItemShareButton';
import SocialProofMessage from '../../components/SocialProofMessage'; // Feature #54
import RarityBadge from '../../components/RarityBadge'; // Feature #57
import { getThumbnailUrl, getOptimizedUrl, getPortrait3x4Url } from '../../lib/imageUtils';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useHeartAnimation } from '../../hooks/useHeartAnimation';
import Skeleton from '../../components/Skeleton';
import ItemOGMeta from '../../components/ItemOGMeta';
import QrCodeModal from '../../components/QrCodeModal'; // Feature #85: Treasure Hunt QR
import HoldButton from '../../components/HoldButton'; // Feature #121: Hold Button
import HoldTimer from '../../components/HoldTimer'; // Feature #121: Hold Timer
import HoldToPayModal from '../../components/HoldToPayModal'; // Hold-to-Pay: Organizer invoice modal
import HoldInvoiceStatusCard from '../../components/HoldInvoiceStatusCard'; // Hold-to-Pay: Shopper payment status
import { useShopperCart } from '../../hooks/useShopperCart'; // Phase 1: Smart Cart
import ShopperCartDrawer from '../../components/ShopperCartDrawer'; // Phase 1: Smart Cart
import ShopperCartFAB from '../../components/ShopperCartFAB'; // Phase 1: Smart Cart

interface Item {
  id: string;
  title: string;
  description: string;
  price: number;
  auctionStartPrice: number;
  currentBid: number;
  bidIncrement: number;
  auctionEndTime: string;
  status: string;
  photoUrls: string[];
  isLiveDrop: boolean; // CD2
  liveDropAt: string | null; // CD2
  reverseAuction: boolean; // CD2 Phase 4 (deprecated — use listingType)
  listingType?: string; // P2 #6: canonical field (FIXED | AUCTION | REVERSE_AUCTION | FLASH_DEAL)
  reverseDailyDrop?: number; // CD2 Phase 4
  reverseFloorPrice?: number; // CD2 Phase 4
  reverseStartDate?: string; // CD2 Phase 4
  isAiTagged?: boolean; // B2: AI tagging disclosure
  rarity?: string; // Feature #57: Item rarity badge (COMMON | UNCOMMON | RARE | ULTRA_RARE | LEGENDARY)
  sale: {
    id: string;
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    zipCode: string;
    organizer?: {
      name?: string;
      businessName?: string;
      rating?: number;
    } | null;
    location?: string;
  };
  category: string;
  tags: string[];
  condition: string;
  soldAt: string | null;
  views: number;
  sharedBy: Array<{
    id: string;
    name: string;
  }>;
  likedBy: Array<{
    id: string;
    name: string;
  }>;
  cartCount: number;
  auctionType?: string;
  buyingPool?: {
    id: string;
    name: string;
    currentMembers: number;
    maxMembers: number;
  };
  itemPosition?: number; // V3: Physical position in multi-item layout
  isReserved?: boolean;
  reservedBy?: string;
  reservedByName?: string;
  reservedByEmail?: string;
  invoiceCheckoutUrl?: string;
  invoiceExpiresAt?: string;
  variantSku?: string; // V4: Multi-variant support
}

interface BidHistory {
  id: string;
  bidAmount: number;
  timestamp: string;
  bidder: {
    id: string;
    name: string;
  };
}

// SSR-fetched data for OG tags — avoids CSR hydration race with Facebook bot
interface OGItemData {
  id: string;
  title: string;
  description: string;
  price: number | null;
  condition: string | null;
  photoUrl: string | null;
  saleId: string;
  saleName: string;
}

const ItemDetail: React.FC<{ ogData?: OGItemData | null }> = ({ ogData }) => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const shopperCart = useShopperCart(); // Phase 1: Smart Cart

  // State
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showPhotosModal, setShowPhotosModal] = useState(false);
  const [bidAmount, setBidAmount] = useState<number | null>(null);
  const [bidError, setBidError] = useState('');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [currentLightboxIndex, setCurrentLightboxIndex] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [bidHistory, setBidHistory] = useState<BidHistory[]>([]);
  const [showBidHistory, setShowBidHistory] = useState(false);
  const [estimatedTax, setEstimatedTax] = useState(0);
  const [buyersPremium, setBuyersPremium] = useState(0);
  const [showQrModal, setShowQrModal] = useState(false); // Feature #85: Treasure Hunt QR
  const [showHoldToPayModal, setShowHoldToPayModal] = useState(false); // Hold-to-Pay: organizer invoice
  const [isShopperCartOpen, setIsShopperCartOpen] = useState(false); // Phase 1: Smart Cart
  const [showSwitchSaleModal, setShowSwitchSaleModal] = useState(false); // Phase 1: Smart Cart — cross-sale confirmation
  const [pendingCartItem, setPendingCartItem] = useState<any>(null); // Phase 1: Smart Cart
  const socketRef = useRef<Socket | null>(null);

  // Queries
  const {
    data: item,
    isLoading: isItemLoading,
    error: itemError,
    refetch: refetchItem,
  } = useQuery<Item>({
    queryKey: ['item', id],
    queryFn: async () => {
      const response = await api.get(`/items/${id}`);
      return response.data;
    },
    enabled: !!id,
    staleTime: 30000,
  });

  const { data: bids = [], refetch: refetchBids } = useQuery<BidHistory[]>({
    queryKey: ['bids', id],
    queryFn: async () => {
      const response = await api.get(`/items/${id}/bids`);
      return response.data;
    },
    enabled: !!id,
  });

  // Favorite status query
  const { data: favoriteStatus, refetch: refetchFavoriteStatus } = useQuery({
    queryKey: ['favorite', id],
    enabled: !!id && !!user,
    queryFn: async () => {
      const response = await api.get(`/favorites/item/${id}`);
      return response.data;
    },
  });

  // Purchase status query — check if user has purchased this item
  const { data: purchaseStatus } = useQuery({
    queryKey: ['purchase-status', id, user?.id],
    enabled: !!id && !!user?.id,
    queryFn: async () => {
      try {
        const response = await api.get(`/users/purchases/${id}`);
        return response.data;
      } catch (err) {
        return null;
      }
    },
  });

  // Mutations
  const placeBidMutation = useMutation({
    mutationFn: async (amount: number) => {
      const response = await api.post(`/items/${id}/bids`, { bidAmount: amount });
      return response.data;
    },
    onSuccess: (data) => {
      showToast('Bid placed successfully!', 'success');
      refetchItem();
      refetchBids();
      setBidAmount(null);
      setBidError('');
      setIsSubmittingBid(false);
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message || 'Failed to place bid. Please try again.';
      setBidError(message);
      setIsSubmittingBid(false);
    },
  });

  const updateFavoriteMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/favorites/item/${id}`, {});
      return response.data;
    },
    onSuccess: () => {
      refetchFavoriteStatus();
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });


  // Animation hook
  const { triggerAnimation: triggerHeartAnimation } = useHeartAnimation();

  // SSR guard — prevents browser-only code from executing during server-side render.
  // React Query v5 isLoading = isPending && isFetching; during SSR isFetching=false so
  // isLoading=false, which bypasses the skeleton guard and crashes on undefined `item`.
  // The mounted flag ensures we only render the full component tree client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Setup socket for live bidding
  // Dynamic import prevents socket.io-client from loading during SSR (fixes #33 500 error)
  useEffect(() => {
    if (!id) return;

    let newSocket: Socket | null = null;

    import('socket.io-client').then(({ io }) => {
      newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      newSocket.on('connect', () => {
        newSocket!.emit('join:item', id);
      });

      newSocket.on('bid-placed', (_data: unknown) => {
        refetchItem();
        refetchBids();
      });

      newSocket.on('item-sold', (_data: unknown) => {
        refetchItem();
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    });

    return () => {
      if (newSocket) newSocket.disconnect();
      else if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    };
  }, [id, refetchItem, refetchBids]);

  const handlePlaceBid = async () => {
    if (!user) {
      showToast('Please sign in to place a bid', 'warning');
      router.push('/login');
      return;
    }

    if (!bidAmount || bidAmount <= 0) {
      setBidError('Please enter a valid bid amount.');
      return;
    }

    if (!item) {
      setBidError('Item data not loaded.');
      return;
    }

    if (bidAmount <= item.currentBid) {
      setBidError(`Bid must be higher than ${item.currentBid}.`);
      return;
    }

    setIsSubmittingBid(true);
    placeBidMutation.mutate(bidAmount);
  };

  const handleBuyNow = async () => {
    if (!user) {
      showToast('Please log in to purchase items', 'warning');
      router.push('/login');
      return;
    }
    // Open checkout directly (no cart endpoint needed)
    setShowCheckoutModal(true);
  };

  // Phase 1: Smart Cart — add to browsing cart
  const handleAddToSmartCart = (item: Item) => {
    if (!user) {
      showToast('Please log in to add items to cart', 'warning');
      router.push('/login');
      return;
    }

    const newCartItem = {
      id: item.id,
      title: item.title,
      price: item.price ? Math.round(item.price * 100) : null, // Convert to cents
      photoUrl: item.photoUrls?.[0],
      saleId: item.sale.id,
    };

    // Check if switching sales
    if (!shopperCart.canAddFromDifferentSale(item.sale.id)) {
      setPendingCartItem(newCartItem);
      setShowSwitchSaleModal(true);
      return;
    }

    shopperCart.addItem(newCartItem);
    showToast('Added to cart', 'success');
  };

  // Phase 1: Smart Cart — confirm sale switch
  const handleConfirmSwitchSale = () => {
    if (pendingCartItem) {
      shopperCart.switchSale(pendingCartItem.saleId);
      shopperCart.addItem(pendingCartItem);
      showToast('Cart cleared and item added', 'success');
    }
    setShowSwitchSaleModal(false);
    setPendingCartItem(null);
  };

  const handleLike = () => {
    if (!user) {
      showToast('Please log in to save items', 'warning');
      router.push('/login');
      return;
    }

    triggerHeartAnimation();
    updateFavoriteMutation.mutate();
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: item?.title,
        text: `Check out this item: ${item?.title}`,
        url: window.location.href,
      });
    }
  };

  // Build SSR OG head once — rendered in all return paths so FB bot sees it immediately
  const ogHead = ogData ? (
    <ItemOGMeta
      item={{
        id: ogData.id,
        title: ogData.title,
        description: ogData.description,
        price: ogData.price ?? undefined,
        condition: ogData.condition ?? undefined,
        photos: ogData.photoUrl ? [{ url: ogData.photoUrl }] : [],
      }}
      saleName={ogData.saleName}
      saleId={ogData.saleId}
      canonicalUrl={`https://finda.sale/items/${ogData.id}`}
    />
  ) : null;

  // Server-side and pre-mount: render only OG meta + skeleton so FB/Twitter bots
  // get the correct OG tags without any browser-specific code running server-side.
  if (!mounted || isItemLoading) {
    return (
      <>
        {ogHead}
        <div className="p-6">
          <Skeleton className="h-96 mb-6" />
          <Skeleton className="h-12 mb-4" />
          <Skeleton className="h-8 w-1/3" />
        </div>
      </>
    );
  }

  if (itemError || !item) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="text-center px-4 max-w-md">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-2">Item not found</h1>
          <p className="text-warm-500 dark:text-gray-400 mb-6">This item may have sold or the link may have changed.</p>
          <Link href="/" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">Find More Treasures</Link>
        </div>
      </div>
    );
  }

  const isAuction = !!item.auctionStartPrice;
  const isSold = item.status === 'SOLD';
  const currentPrice = isAuction ? item.currentBid ?? 0 : (item.price ?? 0);
  const isUserLiked = user && favoriteStatus?.isFavorited === true;

  return (
    <>
      {ogHead ?? (
        // CSR fallback — used only when getServerSideProps didn't return ogData
        <Head>
          <title>{item.title} - FindA.Sale</title>
          <meta name="description" content={item.description} />
          <meta property="og:title" content={`${item.title} — ${item.sale?.title || 'FindA.Sale'}`} />
          <meta property="og:description" content={item.description} />
          <meta property="og:image" content={item.photoUrls[0] || ''} />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:url" content={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://finda.sale'}/items/${item.id}`} />
          <meta property="og:type" content="product" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={`${item.title} — ${item.sale?.title || 'FindA.Sale'}`} />
          <meta name="twitter:description" content={item.description} />
          <meta name="twitter:image" content={item.photoUrls[0] || ''} />
        </Head>
      )}

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href={`/sales/${item.sale.id}`}>
            <a className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mb-4 inline-block">
              ← Back to {item.sale.title}
            </a>
          </Link>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            {/* Photo Section */}
            <div className="flex flex-col gap-4">
              {/* Main Photo */}
              <div
                onClick={() => setIsLightboxOpen(true)}
                className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden cursor-pointer group"
              >
                <img
                  key={getPortrait3x4Url(item.photoUrls[selectedPhotoIndex])}
                  src={getPortrait3x4Url(item.photoUrls[selectedPhotoIndex])}
                  alt={item.title}
                  className="w-full h-96 object-cover group-hover:opacity-90 transition"
                />
                {isSold && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">SOLD</span>
                  </div>
                )}
                {item.isLiveDrop && item.liveDropAt && <CountdownTimer targetDate={item.liveDropAt} />}
              </div>

              {/* Photo Thumbnails */}
              <div className="flex gap-2 overflow-x-auto">
                {item.photoUrls.map((url, index) => (
                  <img
                    key={index}
                    src={getThumbnailUrl(url)}
                    alt={`Photo ${index + 1}`}
                    onClick={() => setSelectedPhotoIndex(index)}
                    className={`w-16 h-16 object-cover rounded cursor-pointer border-2 transition ${
                      selectedPhotoIndex === index ? 'border-blue-600' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Item Details */}
            <div className="flex flex-col gap-6">
              {/* Header */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  {/* P2 #6: Check listingType instead of deprecated reverseAuction */}
                  {item.listingType === 'REVERSE_AUCTION' && <ReverseAuctionBadge item={item} />}
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{item.title}</h1>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  <span>{item.cartCount} in cart</span> • <span>{item.views} views</span> •
                  Sale by {item.sale.organizer?.businessName ?? item.sale.organizer?.name ?? 'Organizer'}
                </div>
              </div>

              {/* B2: AI Tagging Disclosure */}
              {item.isAiTagged && (
                <p className="text-xs text-warm-500 mt-1">
                  ✨ Some of this item&apos;s details were auto-suggested — check with the seller if you have questions.
                </p>
              )}

              {/* Price Section */}
              <div className="border-t border-b border-gray-200 dark:border-gray-700 py-4">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  {isAuction ? 'Current Bid' : 'Price'}
                </div>
                <div className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  ${currentPrice.toFixed(2)}
                </div>
                {isAuction && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <div>+ ${(currentPrice * 0.05).toFixed(2)} buyer premium (5%)</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">
                      ${(currentPrice + currentPrice * 0.05).toFixed(2)} total
                    </div>
                  </div>
                )}
                {isAuction && item.auctionStartPrice && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Starting Price: ${item.auctionStartPrice.toFixed(2)}
                  </div>
                )}
                {/* P2 #6: Check listingType instead of deprecated reverseAuction */}
                {item.listingType === 'REVERSE_AUCTION' && (item.reverseFloorPrice ?? 0) > 0 && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Floor Price: ${(item.reverseFloorPrice ?? 0).toFixed(2)}
                  </div>
                )}
              </div>

              {/* Feature #54: Social Proof Messaging */}
              <SocialProofMessage itemId={item.id} className="mb-2" />

              {/* Condition & Category */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Condition:</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{item.condition}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Category:</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{item.category}</p>
                </div>
              </div>

              {/* Feature #57: Rarity Badge */}
              {item.rarity && (
                <div>
                  <RarityBadge rarity={item.rarity} size="md" />
                </div>
              )}

              {/* Description */}
              <div className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                <p>{item.description}</p>
              </div>

              {/* Tags */}
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleLike}
                  disabled={updateFavoriteMutation.isPending || !user}
                  title={!user ? 'Sign in to save items' : ''}
                  className={`flex-1 py-2 px-4 rounded-lg font-semibold transition ${
                    isUserLiked
                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300'
                      : user
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      : 'bg-gray-100 dark:bg-gray-750 text-gray-500 dark:text-gray-500 cursor-not-allowed'
                  } disabled:opacity-50`}
                >
                  {isUserLiked ? '❤️ Saved' : user ? '🧡 Save' : '🧡 Sign in to save'}
                </button>
                <ItemShareButton
                  itemId={item.id}
                  itemTitle={item.title}
                  itemPrice={currentPrice}
                  userId={user?.id}
                />
                {user?.roles?.includes('ORGANIZER') && (
                  <button
                    onClick={() => setShowQrModal(true)}
                    title="Generate QR code for this item"
                    className="flex items-center justify-center px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                  >
                    📱 QR
                  </button>
                )}
                {/* Hold-to-Pay: Organizer "Mark Sold" button for RESERVED items */}
                {user?.roles?.includes('ORGANIZER') && item.status === 'RESERVED' && (
                  <button
                    onClick={() => setShowHoldToPayModal(true)}
                    title="Mark as sold and send payment request to shopper"
                    className="flex items-center justify-center px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition font-semibold"
                  >
                    ✓ Mark Sold
                  </button>
                )}
              </div>

              {/* Hold-to-Pay: Show payment status card if item is INVOICE_ISSUED */}
              {item.status === 'INVOICE_ISSUED' && user?.id === item.reservedBy && (
                <HoldInvoiceStatusCard
                  itemId={item.id}
                  itemPrice={item.price}
                  checkoutUrl={item.invoiceCheckoutUrl || ''}
                  expiresAt={item.invoiceExpiresAt || ''}
                  organizerName={item.sale.organizer?.businessName ?? item.sale.organizer?.name ?? 'Organizer'}
                />
              )}

              {/* Bid/Cart Section */}
              {!isSold && !purchaseStatus?.hasPurchased && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  {isAuction ? (
                    <div className="space-y-3">
                      {!user && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-blue-700 dark:text-blue-300 text-sm">
                          Sign in to place a bid on this item.
                        </div>
                      )}
                      <input
                        type="number"
                        placeholder="Enter bid amount"
                        value={bidAmount || ''}
                        onChange={(e) => {
                          setBidAmount(e.target.value ? parseFloat(e.target.value) : null);
                          setBidError('');
                        }}
                        disabled={!user}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500"
                      />
                      {bidError && <p className="text-red-600 text-sm">{bidError}</p>}
                      <button
                        onClick={handlePlaceBid}
                        disabled={isSubmittingBid || placeBidMutation.isPending || !user}
                        title={!user ? 'Sign in to place a bid' : ''}
                        className={`w-full py-2 px-4 rounded-lg font-semibold transition ${
                          user
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 cursor-not-allowed'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {user ? (
                          isSubmittingBid || placeBidMutation.isPending ? 'Placing Bid...' : 'Place Bid'
                        ) : (
                          'Sign in to bid'
                        )}
                      </button>
                      <button
                        onClick={() => setShowBidHistory(!showBidHistory)}
                        className="w-full text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 py-2 px-4 text-sm font-semibold"
                      >
                        {showBidHistory ? 'Hide' : 'View'} Bid History
                      </button>
                    </div>
                  ) : item.status === 'RESERVED' ? (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-center">
                      <p className="text-amber-800 dark:text-amber-300 font-semibold text-sm">🔒 This item is currently on hold</p>
                      <div className="mt-2">
                        <HoldTimer itemId={item.id} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        onClick={handleBuyNow}
                        disabled={!user}
                        title={!user ? 'Sign in to purchase' : ''}
                        className={`w-full py-2 px-4 rounded-lg font-semibold transition ${
                          user
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-300 dark:border-green-700 cursor-not-allowed'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {user ? 'Buy It Now' : 'Sign in to buy'}
                      </button>

                      {/* Phase 1: Smart Cart — Add to cart button */}
                      {item.status === 'AVAILABLE' && (
                        <button
                          onClick={() => handleAddToSmartCart(item)}
                          disabled={!user}
                          title={!user ? 'Sign in to add to cart' : ''}
                          className={`w-full py-2 px-4 rounded-lg font-semibold transition ${
                            shopperCart.items.some((i) => i.id === item.id)
                              ? 'bg-amber-200 text-amber-900 hover:bg-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800'
                              : user
                                ? 'bg-amber-600 text-white hover:bg-amber-700'
                                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 cursor-not-allowed'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {shopperCart.items.some((i) => i.id === item.id) ? '✓ In Cart' : '+ Cart'}
                        </button>
                      )}

                      {/* Feature #121: Hold Button — AVAILABLE items only */}
                      {item.status === 'AVAILABLE' && (
                        <HoldButton
                          item={{ id: item.id, title: item.title, sale: item.sale ? { id: item.sale.id, title: item.sale.title } : undefined }}
                          onHoldPlaced={() => queryClient.invalidateQueries({ queryKey: ['item', item.id] })}
                          variant="default"
                          className="bg-blue-500 hover:bg-blue-600"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Purchased State */}
              {purchaseStatus?.hasPurchased && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <p className="text-green-700 dark:text-green-300 font-semibold text-center">✓ You own this item</p>
                  {purchaseStatus?.purchasedAt && (
                    <p className="text-sm text-green-600 dark:text-green-400 text-center">
                      Purchased on {new Date(purchaseStatus.purchasedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {/* Auction End Time */}
              {isAuction && !isSold && item.auctionEndTime && (
                <div className="text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <span>Auction ends:</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatDistanceToNow(parseISO(item.auctionEndTime), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Bid History */}
          {showBidHistory && bids.length > 0 && (
            <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Bid History</h2>
              <div className="space-y-2">
                {bids.map((bid) => (
                  <div key={bid.id} className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">${(bid.bidAmount ?? 0).toFixed(2)}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{bid.bidder.name}</p>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(parseISO(bid.timestamp), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Buying Pool */}
          {item.buyingPool && (
            <BuyingPoolCard
              itemId={item.id}
              itemPrice={item.price}
              itemStatus={item.status}
              userId={user?.id}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showCheckoutModal && item && (
        <CheckoutModal
          itemId={item.id}
          itemTitle={item.title}
          listingType={item.listingType}
          onClose={() => setShowCheckoutModal(false)}
          onSuccess={() => {
            setShowCheckoutModal(false);
            // Redirect to confirmation page — will query most recent purchase
            router.push('/shopper/checkout-success');
          }}
        />
      )}

      <QrCodeModal
        itemId={item.id}
        itemTitle={item.title}
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
      />

      {/* Hold-to-Pay Modal: Organizer sends invoice */}
      {item.status === 'RESERVED' && item.reservedBy && (
        <HoldToPayModal
          itemId={item.id}
          itemTitle={item.title}
          itemPrice={item.price}
          itemPhoto={item.photoUrls[0]}
          shopperId={item.reservedBy}
          shopperName={item.reservedByName || 'Shopper'}
          shopperEmail={item.reservedByEmail || ''}
          organizerTier={(user?.organizerTier || 'SIMPLE') as 'SIMPLE' | 'PRO' | 'TEAMS'}
          expiresAt={item.invoiceExpiresAt || ''}
          isOpen={showHoldToPayModal}
          onClose={() => setShowHoldToPayModal(false)}
          onSuccess={() => refetchItem()}
          isAuction={isAuction}
        />
      )}

      {isLightboxOpen && (
        <PhotoLightbox
          photos={item.photoUrls}
          initialIndex={currentLightboxIndex}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}

      {/* Phase 1: Smart Cart — browsing cart drawer */}
      {item && (
        <ShopperCartDrawer
          isOpen={isShopperCartOpen}
          onClose={() => setIsShopperCartOpen(false)}
          saleName={item.sale?.title}
        />
      )}

      {/* Phase 1: Smart Cart — floating action button */}
      {item && <ShopperCartFAB onClick={() => setIsShopperCartOpen(true)} />}

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

      <div id="heart-container" className="fixed bottom-10 right-10 pointer-events-none" />
    </>
  );
};

export default ItemDetail;

/**
 * Feature #33 — Share Card Factory
 * Fetch item data server-side so OG meta tags are present in the initial HTML
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
    return { props: { ogData: null } };
  }

  try {
    // 3s timeout — fail fast so Vercel function never hangs waiting for localhost
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${apiUrl}/items/${id}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return { props: { ogData: null } };
    }
    const item = await res.json();

    const ogData: OGItemData = {
      id: item.id,
      title: item.title || '',
      description: item.description || '',
      price: typeof item.price === 'number' ? item.price : null,
      condition: item.condition || null,
      photoUrl: Array.isArray(item.photoUrls) && item.photoUrls.length > 0
        ? item.photoUrls[0]
        : null,
      saleId: item.sale?.id || '',
      saleName: item.sale?.title || 'FindA.Sale',
    };

    return { props: { ogData } };
  } catch {
    // Fail open — page still works, OG tags fall back to CSR version
    return { props: { ogData: null } };
  }
}
