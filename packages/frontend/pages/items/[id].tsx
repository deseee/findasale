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
import { getThumbnailUrl, getOptimizedUrl } from '../../lib/imageUtils';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useHeartAnimation } from '../../hooks/useHeartAnimation';
import Skeleton from '../../components/Skeleton';
import ItemOGMeta from '../../components/ItemOGMeta';

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
  reverseAuction: boolean; // CD2 Phase 4
  reverseDailyDrop?: number; // CD2 Phase 4
  reverseFloorPrice?: number; // CD2 Phase 4
  reverseStartDate?: string; // CD2 Phase 4
  isAiTagged?: boolean; // B2: AI tagging disclosure
  sale: {
    id: string;
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    zipCode: string;
    organizer?: {
      name: string;
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

  const { data: likes = [], refetch: refetchLikes } = useQuery<any[]>({
    queryKey: ['likes', id],
    enabled: !!id,
    queryFn: async () => {
      const response = await api.get(`/items/${id}/likes`);
      return response.data;
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

  const updateLikesMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/items/${id}/like`);
      return response.data;
    },
    onSuccess: () => {
      refetchLikes();
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/cart/add`, {
        itemId: id,
        quantity: 1,
      });
      return response.data;
    },
    onSuccess: () => {
      showToast('Added to cart!', 'success');
      setShowCheckoutModal(true);
    },
    onError: () => {
      showToast('Failed to add to cart', 'error');
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
        newSocket!.emit('join-item', { itemId: id });
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

  const handleAddToCart = async () => {
    if (!user) {
      showToast('Please log in to add items to cart', 'warning');
      router.push('/auth/login');
      return;
    }
    addToCartMutation.mutate();
  };

  const handleLike = () => {
    if (!user) {
      showToast('Please log in to like items', 'warning');
      router.push('/auth/login');
      return;
    }

    triggerHeartAnimation();
    updateLikesMutation.mutate();
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
    return <div className="p-6">Item not found.</div>;
  }

  const isAuction = item.status === 'auction';
  const isSold = item.status === 'sold';
  const currentPrice = isAuction ? item.currentBid : item.price;
  const isUserLiked = user && likes.some((l) => l.id === user.id);

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

      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href={`/sales/${item.sale.id}`}>
            <a className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
              ← Back to {item.sale.title}
            </a>
          </Link>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white rounded-lg shadow-lg p-6">
            {/* Photo Section */}
            <div className="flex flex-col gap-4">
              {/* Main Photo */}
              <div
                onClick={() => setIsLightboxOpen(true)}
                className="relative w-full bg-gray-200 rounded-lg overflow-hidden cursor-pointer group"
              >
                <img
                  src={getOptimizedUrl(item.photoUrls[selectedPhotoIndex])}
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
                      selectedPhotoIndex === index ? 'border-blue-600' : 'border-gray-300'
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
                  {item.reverseAuction && <ReverseAuctionBadge item={item} />}
                  <h1 className="text-3xl font-bold text-gray-900">{item.title}</h1>
                </div>
                <div className="text-sm text-gray-500 mb-2">
                  <span>{item.cartCount} in cart</span> • <span>{item.views} views</span> •
                  Sale by {item.sale.organizer?.name ?? 'Organizer'}
                </div>
              </div>

              {/* B2: AI Tagging Disclosure */}
              {item.isAiTagged && (
                <p className="text-xs text-warm-500 mt-1">
                  ✨ Some of this item&apos;s details were auto-suggested — check with the seller if you have questions.
                </p>
              )}

              {/* Price Section */}
              <div className="border-t border-b py-4">
                <div className="text-sm text-gray-500 mb-1">
                  {isAuction ? 'Current Bid' : 'Price'}
                </div>
                <div className="text-4xl font-bold text-gray-900 mb-2">
                  ${currentPrice.toFixed(2)}
                </div>
                {!isAuction && (
                  <div className="text-xs text-gray-500 mb-2">
                    <div>+ ${(currentPrice * 0.05).toFixed(2)} platform fee</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">
                      ${(currentPrice + currentPrice * 0.05).toFixed(2)} total
                    </div>
                  </div>
                )}
                {isAuction && (
                  <div className="text-sm text-gray-600">
                    Starting Price: ${item.auctionStartPrice.toFixed(2)}
                  </div>
                )}
                {item.reverseAuction && item.reverseFloorPrice && (
                  <div className="text-sm text-gray-600">
                    Floor Price: ${item.reverseFloorPrice.toFixed(2)}
                  </div>
                )}
              </div>

              {/* Condition & Category */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Condition:</span>
                  <p className="font-semibold text-gray-900">{item.condition}</p>
                </div>
                <div>
                  <span className="text-gray-500">Category:</span>
                  <p className="font-semibold text-gray-900">{item.category}</p>
                </div>
              </div>

              {/* Description */}
              <div className="text-gray-700 text-sm leading-relaxed">
                <p>{item.description}</p>
              </div>

              {/* Tags */}
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs"
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
                  disabled={updateLikesMutation.isPending}
                  className={`flex-1 py-2 px-4 rounded-lg font-semibold transition ${
                    isUserLiked
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  } disabled:opacity-50`}
                >
                  {isUserLiked ? '❤️ Liked' : '🤍 Like'}
                </button>
                <ItemShareButton
                  itemId={item.id}
                  itemTitle={item.title}
                  itemPrice={currentPrice}
                  userId={user?.id}
                />
              </div>

              {/* Bid/Cart Section */}
              {!isSold && (
                <div className="border-t pt-4">
                  {isAuction ? (
                    <div className="space-y-3">
                      <input
                        type="number"
                        placeholder="Enter bid amount"
                        value={bidAmount || ''}
                        onChange={(e) => {
                          setBidAmount(e.target.value ? parseFloat(e.target.value) : null);
                          setBidError('');
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      {bidError && <p className="text-red-600 text-sm">{bidError}</p>}
                      <button
                        onClick={handlePlaceBid}
                        disabled={isSubmittingBid || placeBidMutation.isPending}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {isSubmittingBid || placeBidMutation.isPending
                          ? 'Placing Bid...'
                          : 'Place Bid'}
                      </button>
                      <button
                        onClick={() => setShowBidHistory(!showBidHistory)}
                        className="w-full text-blue-600 hover:text-blue-800 py-2 px-4 text-sm font-semibold"
                      >
                        {showBidHistory ? 'Hide' : 'View'} Bid History
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleAddToCart}
                      disabled={addToCartMutation.isPending}
                      className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {addToCartMutation.isPending ? 'Adding to Cart...' : 'Add to Cart'}
                    </button>
                  )}
                </div>
              )}

              {/* Auction End Time */}
              {isAuction && !isSold && (
                <div className="text-sm text-gray-600 border-t pt-4">
                  <span>Auction ends:</span>
                  <p className="font-semibold text-gray-900">
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
            <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold mb-4">Bid History</h2>
              <div className="space-y-2">
                {bids.map((bid) => (
                  <div key={bid.id} className="flex justify-between items-center py-2 border-b">
                    <div>
                      <p className="font-semibold text-gray-900">${bid.bidAmount.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">{bid.bidder.name}</p>
                    </div>
                    <p className="text-sm text-gray-500">
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
          onClose={() => setShowCheckoutModal(false)}
          onSuccess={() => {
            setShowCheckoutModal(false);
            showToast('Purchase complete! Check your purchases page for details.', 'success');
          }}
        />
      )}

      {isLightboxOpen && (
        <PhotoLightbox
          photos={item.photoUrls}
          initialIndex={currentLightboxIndex}
          onClose={() => setIsLightboxOpen(false)}
        />
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
