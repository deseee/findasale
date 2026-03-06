import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { io as socketIO, Socket } from 'socket.io-client'; // V1: live bidding
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
  sale: {
    id: string;
    title: string;
    organizerId: string; // Phase 20: For messaging
  };
}

interface Wishlist {
  id: string;
  name: string;
}

interface Bid {
  id: string;
  amount: number;
  user: {
    name: string;
  };
  createdAt: string;
}

// Helper function to safely format prices
const formatPrice = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? 'N/A' : `$${num.toFixed(2)}`;
};

// Helper function to format time remaining
const formatTimeRemaining = (endTime: string | null | undefined): string => {
  if (!endTime) return 'No end time';
  
  try {
    const end = new Date(endTime);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    
    if (diff <= 0) {
      return 'Ended';
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else {
      return `${minutes}m ${seconds}s`;
    }
  } catch (error) {
    return 'No end time';
  }
};

// Helper function to get minimum next bid
const getMinimumNextBid = (item: any): number => {
  if (item.currentBid) {
    return item.currentBid + (item.bidIncrement || 1);
  }
  return item.auctionStartPrice || item.price || 0;
};

const ItemDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [bidAmount, setBidAmount] = useState('');
  const [isBidding, setIsBidding] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [checkoutItemId, setCheckoutItemId] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [holdCountdown, setHoldCountdown] = useState('');
  const [isLiveDropRevealed, setIsLiveDropRevealed] = useState(false); // CD2
  const [wishlistDropdownOpen, setWishlistDropdownOpen] = useState(false);
  const [wishlistsInItem, setWishlistsInItem] = useState<Set<string>>(new Set());
  const [onWaitlist, setOnWaitlist] = useState(false);
  const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false);
  const socketRef = useRef<Socket | null>(null); // V1: live bidding socket
  const { showToast } = useToast();
  const { isAnimating: isHeartAnimating, triggerAnimation: triggerHeartAnimation } = useHeartAnimation();

  const { data: item, isLoading, isError, refetch } = useQuery({
    queryKey: ['item', id],
    queryFn: async () => {
      if (!id) throw new Error('No item ID provided');
      const response = await api.get(`/items/${id}`);
      return response.data as Item;
    },
    enabled: !!id,
  });

  // CD2: Check if Live Drop has been revealed
  useEffect(() => {
    if (!item) return;
    if (!item.isLiveDrop || !item.liveDropAt) {
      setIsLiveDropRevealed(true);
      return;
    }
    const now = new Date();
    const reveal = new Date(item.liveDropAt);
    setIsLiveDropRevealed(now >= reveal);
  }, [item]);

  // Track recently viewed items in localStorage
  useEffect(() => {
    if (!item || typeof window === 'undefined') return;
    try {
      const MAX_RECENT = 10;
      const recent = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
      const entry = {
        id: item.id,
        title: item.title,
        photoUrl: item.photoUrls?.[0],
        price: item.price,
        viewedAt: Date.now(),
      };
      const filtered = recent.filter((r: any) => r.id !== item.id);
      localStorage.setItem('recentlyViewed', JSON.stringify([entry, ...filtered].slice(0, MAX_RECENT)));
    } catch (error) {
      console.error('Failed to track recently viewed item:', error);
    }
  }, [item?.id, item?.title, item?.photoUrls, item?.price]);

  // Check if item is favorited
  const { data: favoriteStatus } = useQuery({
    queryKey: ['favorite', id],
    queryFn: async () => {
      if (!id || !user) return false;
      try {
        const response = await api.get(`/favorites/item/${id}`);
        return response.data.isFavorite;
      } catch {
        return false;
      }
    },
    enabled: !!id && !!user,
  });

  useEffect(() => {
    if (favoriteStatus !== undefined) {
      setIsFavorite(favoriteStatus);
    }
  }, [favoriteStatus]);

  // Fetch wishlists to check which ones contain this item
  const { data: wishlists = [] } = useQuery({
    queryKey: ['wishlists', id],
    queryFn: async () => {
      if (!id || !user) return [];
      try {
        const response = await api.get('/wishlists');
        const allWishlists = response.data as Array<{ id: string; name: string; items: Array<{ itemId: string }> }>;
        const inItem = new Set(
          allWishlists
            .filter((w) => w.items.some((item) => item.itemId === id))
            .map((w) => w.id)
        );
        setWishlistsInItem(inItem);
        return allWishlists;
      } catch (error) {
        return [];
      }
    },
    enabled: !!id && !!user,
  });

  // V1: Connect to socket for live bidding
  useEffect(() => {
    if (!item) return;
    socketRef.current = socketIO(undefined, {
      query: { itemId: item.id },
    });
    socketRef.current.on('bidUpdate', () => {
      refetch();
    });
    return () => {
      socketRef.current?.disconnect();
    };
  }, [item?.id, refetch]);

  const toggleFavorite = async () => {
    if (!item || !user) {
      showToast('Please log in to favorite items', 'info');
      return;
    }

    try {
      // Trigger heart animation
      triggerHeartAnimation();

      await api.post(`/favorites/item/${item.id}`, { isFavorite: !isFavorite });
      setIsFavorite(!isFavorite);
      queryClient.invalidateQueries({ queryKey: ['favorite', id] });

      // Record save streak if adding to favorites
      if (!isFavorite) {
        api.post('/streaks/save').catch((err) => {
          console.error('Streak save recording failed (non-blocking):', err.message);
        });
      }
    } catch (err: any) {
      console.error('Favorite error:', err);
      showToast('Failed to update favorite status', 'error');
    }
  };

  // Mutation to add/remove from wishlist
  const wishlistMutation = useMutation({
    mutationFn: async (data: { wishlistId: string; add: boolean }) => {
      if (data.add) {
        return api.post('/wishlists/items', {
          wishlistId: data.wishlistId,
          itemId: id,
        });
      } else {
        return api.delete(`/wishlists/${data.wishlistId}/items/${id}`);
      }
    },
    onSuccess: (_, variables) => {
      const newSet = new Set(wishlistsInItem);
      if (variables.add) {
        newSet.add(variables.wishlistId);
      } else {
        newSet.delete(variables.wishlistId);
      }
      setWishlistsInItem(newSet);
      queryClient.invalidateQueries({ queryKey: ['wishlists', id] });
    },
  });

  // Mutation for placing bids
  const bidMutation = useMutation({
    mutationFn: async (amount: string) => {
      const bid = parseFloat(amount);
      if (isNaN(bid)) throw new Error('Invalid bid amount');
      return api.post(`/items/${id}/bids`, { amount: bid });
    },
    onSuccess: () => {
      setBidAmount('');
      setIsBidding(false);
      showToast('Bid placed successfully!', 'success');
      refetch();
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to place bid';
      showToast(message, 'error');
    },
  });

  // Mutation to join hold/waitlist
  const holdMutation = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error('Item not loaded');
      return api.post(`/items/${item.id}/waitlist`);
    },
    onSuccess: () => {
      setOnWaitlist(true);
      showToast('You\'ve been added to the waitlist!', 'success');
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to join waitlist';
      showToast(message, 'error');
    },
  });

  // Update time remaining on a timer
  useEffect(() => {
    if (!item?.auctionEndTime) return;
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(item.auctionEndTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [item?.auctionEndTime]);

  // Update hold countdown on a timer
  useEffect(() => {
    if (!item?.holdCountdownUntil) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const holdUntil = new Date(item.holdCountdownUntil).getTime();
      const diff = holdUntil - now;
      if (diff <= 0) {
        setHoldCountdown('');
      } else {
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        setHoldCountdown(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [item?.holdCountdownUntil]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-amber-600 border-t-transparent mb-4"></div>
          <p className="text-warm-600">Loading item...</p>
        </div>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50">
        <div className="text-center">
          <p className="text-3xl mb-4">❌</p>
          <h1 className="text-xl font-bold text-warm-900 mb-2">Item Not Found</h1>
          <p className="text-warm-600 mb-6">This item may have been sold or removed.</p>
          <Link href="/" className="text-amber-600 hover:underline font-medium">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const minimumNextBid = getMinimumNextBid(item);

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>{item.title} — FindA.Sale</title>
        <meta name="description" content={item.description} />
        <meta property="og:title" content={item.title} />
        <meta property="og:description" content={item.description} />
        {item.photoUrls?.[0] && <meta property="og:image" content={getOptimizedUrl(item.photoUrls[0])} />}
      </Head>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={item.photoUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Checkout modal */}
      {checkoutItemId && (
        <CheckoutModal
          itemId={checkoutItemId}
          onClose={() => setCheckoutItemId(null)}
        />
      )}

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/" className="text-amber-600 hover:text-amber-700 font-medium mb-6 inline-block">
          ← Back
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Photos */}
          <div className="md:col-span-3">
            <div className="sticky top-4">
              <div
                className="aspect-square bg-warm-200 rounded-lg overflow-hidden mb-4 cursor-pointer"
                onClick={() => setLightboxIndex(selectedPhotoIndex)}
              >
                {item.photoUrls?.[selectedPhotoIndex] ? (
                  <img
                    src={getOptimizedUrl(item.photoUrls[selectedPhotoIndex])}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-warm-400">No image</div>
                )}
              </div>
              {item.photoUrls && item.photoUrls.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {item.photoUrls.map((photo, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedPhotoIndex(idx)}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                        idx === selectedPhotoIndex ? 'border-amber-600' : 'border-warm-300'
                      }`}
                    >
                      <img src={getThumbnailUrl(photo)} alt={`${item.title} ${idx}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="md:col-span-2">
            {/* CD2 Phase 4: Reverse auction badge */}
            {item.reverseAuction && (
              <div className="mb-4">
                <ReverseAuctionBadge
                  dailyDrop={item.reverseDailyDrop || 0}
                  floorPrice={item.reverseFloorPrice || 0}
                  startDate={item.reverseStartDate || ''}
                />
              </div>
            )}

            {/* CD2: Live Drop badge */}
            {item.isLiveDrop && !isLiveDropRevealed && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm font-semibold text-red-700">🔓 Live Drop Coming</p>
                <CountdownTimer endTime={item.liveDropAt || ''} />
              </div>
            )}

            <h1 className="text-3xl font-bold text-warm-900 mb-4">{item.title}</h1>
            <p className="text-warm-600 mb-6 leading-relaxed">{item.description}</p>

            {/* Pricing */}
            <div className="card p-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                {item.currentBid > 0 ? (
                  <>
                    <div>
                      <p className="text-xs text-warm-500 uppercase">Current bid</p>
                      <p className="text-2xl font-bold text-warm-900">{formatPrice(item.currentBid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-warm-500 uppercase">Next bid</p>
                      <p className="text-2xl font-bold text-amber-600">{formatPrice(minimumNextBid)}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-warm-500 uppercase">Starting price</p>
                      <p className="text-2xl font-bold text-warm-900">{formatPrice(item.auctionStartPrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-warm-500 uppercase">Your bid</p>
                      <p className="text-2xl font-bold text-amber-600">{formatPrice(minimumNextBid)}</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Time remaining */}
            {item.auctionEndTime && (
              <div className="card p-4 mb-6">
                <p className="text-xs text-warm-500 uppercase mb-1">Time remaining</p>
                <p className="text-lg font-semibold text-warm-900">{timeRemaining}</p>
              </div>
            )}

            {/* Status badge */}
            <div className="mb-6">
              {item.status === 'SOLD' && <span className="inline-block bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">Sold</span>}
              {item.status === 'AVAILABLE' && <span className="inline-block bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">Available</span>}
              {item.status === 'RESERVED' && <span className="inline-block bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-medium">Reserved</span>}
            </div>

            {/* CTA Buttons */}
            {isLiveDropRevealed && item.status === 'AVAILABLE' && (
              <>
                {item.currentBid > 0 || item.auctionStartPrice > 0 ? (
                  <>
                    {!isBidding ? (
                      <button
                        onClick={() => setIsBidding(true)}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-lg mb-3 transition-colors"
                      >
                        Place Bid
                      </button>
                    ) : (
                      <div className="mb-3">
                        <input
                          type="number"
                          placeholder={`${minimumNextBid}`}
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 mb-2"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => bidMutation.mutate(bidAmount)}
                            disabled={bidMutation.isPending}
                            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            {bidMutation.isPending ? 'Placing...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setIsBidding(false)}
                            className="flex-1 bg-warm-200 hover:bg-warm-300 text-warm-900 font-bold py-2 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => setCheckoutItemId(item.id)}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-lg mb-3 transition-colors"
                  >
                    Buy Now
                  </button>
                )}
              </>
            )}

            {item.status === 'RESERVED' && holdCountdown && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-3">
                <p className="text-sm font-semibold text-yellow-700 mb-2">Hold expires in:</p>
                <p className="text-lg font-bold text-yellow-900">{holdCountdown}</p>
              </div>
            )}

            {item.status === 'SOLD' && (
              <button
                onClick={() => {
                  setIsJoiningWaitlist(true);
                  holdMutation.mutate();
                }}
                disabled={onWaitlist || isJoiningWaitlist || holdMutation.isPending}
                className="w-full bg-warm-200 hover:bg-warm-300 text-warm-900 font-bold py-3 rounded-lg disabled:opacity-50 transition-colors mb-3"
              >
                {onWaitlist ? '✓ On Waitlist' : isJoiningWaitlist ? 'Joining...' : 'Join Waitlist'}
              </button>
            )}

            <div className="flex gap-2">
              {/* Favorite button */}
              <button
                onClick={toggleFavorite}
                className={`text-2xl focus:outline-none transition-transform ${isHeartAnimating ? 'animate-heart' : ''}`}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                {isFavorite ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                )}
              </button>
              {/* Share button */}
              <div className="flex-1">
                <ItemShareButton itemId={item.id} title={item.title} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ItemDetailPage;