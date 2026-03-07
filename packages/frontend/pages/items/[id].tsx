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
import Skeleton from '../../components/Skeleton';

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
      } catch {
        return [];
      }
    },
    enabled: !!id && !!user,
  });

  // Feature: Item Waitlist — check if user is on waitlist for this item
  const { data: waitlistStatus, refetch: refetchWaitlist } = useQuery({
    queryKey: ['waitlist', id, user?.id],
    queryFn: async () => {
      if (!id) return { onWaitlist: false, count: 0 };
      try {
        const response = await api.get(`/waitlist/status/${id}`);
        return response.data as { onWaitlist: boolean; count: number };
      } catch {
        return { onWaitlist: false, count: 0 };
      }
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (waitlistStatus !== undefined) {
      setOnWaitlist(waitlistStatus.onWaitlist);
    }
  }, [waitlistStatus]);

  // Phase 21: Fetch active reservation for this item
  const { data: reservation, refetch: refetchReservation } = useQuery({
    queryKey: ['reservation', id],
    queryFn: async () => {
      if (!id || !user) return null;
      try {
        const response = await api.get(`/reservations/item/${id}`);
        return response.data as { id: string; userId: string; status: string; expiresAt: string } | null;
      } catch {
        return null;
      }
    },
    enabled: !!id && !!user,
    refetchInterval: 30000,
  });

  // Countdown timer for the shopper's own hold
  useEffect(() => {
    if (!reservation || reservation.userId !== user?.id) return;
    const tick = () => {
      const diff = new Date(reservation.expiresAt).getTime() - Date.now();
      if (diff <= 0) { setHoldCountdown('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setHoldCountdown(`${h}h ${m}m remaining`);
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [reservation, user?.id]);

  // Phase 21: Place hold mutation
  const placeMutation = useMutation({
    mutationFn: () => api.post('/reservations', { itemId: id }),
    onSuccess: () => {
      showToast('Item held for 24 hours!', 'success');
      refetch();
      refetchReservation();
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to place hold', 'error');
    },
  });

  // Phase 21: Cancel hold mutation
  const cancelMutation = useMutation({
    mutationFn: (reservationId: string) => api.delete(`/reservations/${reservationId}`),
    onSuccess: () => {
      showToast('Hold cancelled', 'success');
      refetch();
      refetchReservation();
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to cancel hold', 'error');
    },
  });

  // CD2 Phase 2: Mark as found mutation
  const treasureHuntMutation = useMutation({
    mutationFn: () => api.post('/treasure-hunt/found', { itemId: id }),
    onSuccess: (response: any) => {
      showToast(`Found it! Earned ${response.data.pointsEarned} points!`, 'success');
      queryClient.invalidateQueries({ queryKey: ['treasureHunt', 'today'] });
    },
    onError: (err: any) => {
      const message = err.response?.data?.message || 'Item doesn\'t match today\'s clue';
      showToast(message, 'error');
    },
  });

  // Timer effect for auction countdown
  useEffect(() => {
    if (!item?.auctionEndTime) return;

    const calculateTimeRemaining = () => {
      setTimeRemaining(formatTimeRemaining(item.auctionEndTime));
    };

    calculateTimeRemaining();
    const timer = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(timer);
  }, [item?.auctionEndTime]);

  // V1: Live bid updates via Socket.io — only active for auction items
  useEffect(() => {
    if (!id || !item?.auctionStartPrice) return; // non-auction items don't need a socket

    // Derive socket server URL from the API base URL (strip /api suffix)
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? apiBase.replace(/\/api\/?$/, '');

    const socket = socketIO(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.emit('join:item', id as string);

    socket.on('bid:update', (data: { itemId: string; currentBid: number }) => {
      if (data.itemId !== id) return;
      // Update the React Query cache so the UI reflects the new bid instantly
      queryClient.setQueryData(['item', id], (old: Item | undefined) => {
        if (!old) return old;
        return { ...old, currentBid: data.currentBid };
      });
      // Also advance the bid input to the new minimum
      setBidAmount((data.currentBid + (item?.bidIncrement ?? 1)).toFixed(2));
    });

    return () => {
      socket.emit('leave:item', id as string);
      socket.disconnect();
      socketRef.current = null;
    };
    // Re-subscribe if item ID changes (navigation between auction items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!item?.auctionStartPrice]);

  const handleBuyNow = () => {
    if (!item) return;
    setCheckoutItemId(item.id);
  };

  const handleCheckoutClose = () => {
    setCheckoutItemId(null);
  };

  const handleCheckoutSuccess = () => {
    setCheckoutItemId(null);
    refetch();

    // Record purchase streak
    api.post('/streaks/purchase').catch((err) => {
      console.error('Streak purchase recording failed (non-blocking):', err.message);
    });
  };

  const handlePlaceBid = async () => {
    if (!item || !user) return;

    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid bid amount', 'error');
      return;
    }

    setIsBidding(true);
    try {
      await api.post(`/items/${item.id}/bid`, { amount });
      showToast('Bid placed successfully!', 'success');
      setBidAmount('');
      refetch();
    } catch (err: any) {
      console.error('Bid error:', err);
      showToast(err.response?.data?.message || 'Failed to place bid. Please try again.', 'error');
    } finally {
      setIsBidding(false);
    }
  };

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
        // Find the wishlist item and remove it
        const wishlist = wishlists.find((w) => w.id === data.wishlistId);
        if (wishlist) {
          const wishlistItem = wishlist.items?.find((item) => item.itemId === id);
          if (wishlistItem) {
            return api.delete(`/wishlists/items/${wishlistItem.itemId}`);
          }
        }
        return Promise.resolve();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlists', id] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to update wishlist', 'error');
    },
  });

  // Feature: Item Waitlist — toggle join/leave waitlist
  const handleToggleWaitlist = async () => {
    if (!user) {
      showToast('Please log in to join the waitlist', 'info');
      return;
    }

    if (!item) return;

    setIsJoiningWaitlist(true);
    try {
      if (onWaitlist) {
        // Leave waitlist
        await api.delete(`/waitlist/${item.id}`);
        setOnWaitlist(false);
        showToast('Removed from waitlist', 'success');
      } else {
        // Join waitlist
        await api.post(`/waitlist/${item.id}`);
        setOnWaitlist(true);
        showToast('Added to waitlist! We\'ll email you when it\'s available.', 'success');
      }
      refetchWaitlist();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update waitlist', 'error');
    } finally {
      setIsJoiningWaitlist(false);
    }
  };

  const toggleWishlistItem = (wishlistId: string) => {
    const isInWishlist = wishlistsInItem.has(wishlistId);
    wishlistMutation.mutate({
      wishlistId,
      add: !isInWishlist,
    });
  };

  useEffect(() => {
    if (item && item.auctionStartPrice) {
      setBidAmount(getMinimumNextBid(item).toString());
    }
  }, [item]);

  // Close wishlist dropdown on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setWishlistDropdownOpen(false);
    };
    if (wishlistDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [wishlistDropdownOpen]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Skeleton className="h-96" />
            <div className="space-y-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-20" />
              <Skeleton className="h-12 w-48" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (isError) return (
  <div className="min-h-screen flex flex-col items-center justify-center bg-warm-50 gap-4">
    <p className="text-warm-700 text-lg">Failed to load item details.</p>
    <button onClick={() => refetch()} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">
      Try again
    </button>
  </div>
);
  if (!item) return <div className="min-h-screen flex items-center justify-center bg-warm-50">Item not found</div>;

  // CD2: Live Drop teaser mode — show before reveal time
  if (item.isLiveDrop && item.liveDropAt && !isLiveDropRevealed) {
    return (
      <div className="min-h-screen bg-warm-50">
        <Head>
          <title>Live Drop Coming Soon - {item.sale.title} - FindA.Sale</title>
        </Head>
        <main className="container mx-auto px-4 py-8">
          <Link href={`/sales/${item.sale.id}`} className="inline-flex items-center text-amber-600 hover:text-amber-800 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to {item.sale.title}
          </Link>

          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
              {/* Teaser Image */}
              <div className="flex items-center justify-center">
                {item.photoUrls.length > 0 ? (
                  <div className="relative w-full">
                    <img
                      src={getOptimizedUrl(item.photoUrls[0]) || item.photoUrls[0]}
                      alt={item.title}
                      className="w-full h-96 object-contain rounded-lg blur-xl filter brightness-75"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg">
                      <div className="text-6xl">🔥</div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-96 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg flex items-center justify-center">
                    <div className="text-6xl">🔥</div>
                  </div>
                )}
              </div>

              {/* Teaser Content */}
              <div className="flex flex-col justify-center">
                {/* Live Drop Badge */}
                <div className="inline-flex items-center gap-2 mb-4 w-fit">
                  <span className="text-2xl">🔥</span>
                  <span className="px-4 py-1 bg-amber-100 text-amber-800 text-sm font-bold rounded-full">LIVE DROP</span>
                </div>

                {/* Title */}
                <h1 className="text-4xl font-bold text-warm-900 mb-4">{item.title}</h1>

                {/* Countdown Timer */}
                <div className="mb-8">
                  <p className="text-sm text-warm-600 font-medium mb-4">Reveals in:</p>
                  <CountdownTimer
                    targetDate={item.liveDropAt}
                    onReveal={() => {
                      setIsLiveDropRevealed(true);
                      showToast('Item revealed! Refresh to see full details.', 'success');
                    }}
                  />
                </div>

                {/* Set Reminder Text */}
                <p className="text-center text-warm-600 text-sm mb-6">
                  Set a reminder to catch this item when it drops!
                </p>

                {/* Teaser Description */}
                {item.description && (
                  <div className="mb-6 p-4 bg-warm-50 rounded-lg">
                    <p className="text-warm-700 text-sm">{item.description}</p>
                  </div>
                )}

                {/* Info Box */}
                <div className="bg-amber-50 border-l-4 border-amber-600 p-4 rounded">
                  <p className="text-sm text-amber-900">
                    Check back when the timer counts down to zero to see the item details, photos, and price.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // CD2: Normal item view (Live Drop revealed or not a Live Drop)
  const isOrganizer = user?.role === 'ORGANIZER' || user?.role === 'ADMIN';
  const isAuctionItem = !!item.auctionStartPrice;
  const auctionEnded = item.auctionEndTime && new Date(item.auctionEndTime) < new Date();
  const myHold = reservation && user && reservation.userId === user.id;
  const someoneElseHolds = reservation && user && reservation.userId !== user.id && ['PENDING', 'CONFIRMED'].includes(reservation.status);

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || 'https://findasale.com');
  const priceDisplay = item.price ? `$${(item.price / 100).toFixed(2)}` : (item.auctionStartPrice ? `$${(item.auctionStartPrice / 100).toFixed(2)}` : 'Price TBD');
  const ogImageUrl = item.photoUrls?.[0] ? item.photoUrls[0] : `${siteUrl}/api/og?${new URLSearchParams({
    type: 'item',
    title: item.title.substring(0, 60),
    price: priceDisplay,
    condition: item.status || '',
    location: item.sale?.title?.substring(0, 30) || '',
  }).toString()}`;

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>{item.title} - FindA.Sale</title>
        <meta name="description" content={`${item.title} — ${priceDisplay} | ${item.description?.substring(0, 100) || 'Item at estate sale on FindA.Sale'}`} />
        <meta property="og:title" content={`${item.title} — ${priceDisplay} | FindA.Sale`} />
        <meta property="og:description" content={`${item.status || 'Item'} at estate sale. ${item.description?.substring(0, 100) || ''}`} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:url" content={`${siteUrl}/items/${item.id}`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${item.title} — ${priceDisplay} | FindA.Sale`} />
        <meta name="twitter:description" content={`${item.status || 'Item'} at estate sale. ${item.description?.substring(0, 100) || ''}`} />
        <meta name="twitter:image" content={ogImageUrl} />
        {/* Structured data — Product schema for Google rich results */}
        {item && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'Product',
                name: item.title || '',
                description: item.description || '',
                image: item.photoUrls?.[0] || '',
                offers: {
                  '@type': 'Offer',
                  price: item.price ? (item.price / 100).toString() : '0',
                  priceCurrency: 'USD',
                  availability:
                    item.status === 'AVAILABLE'
                      ? 'https://schema.org/InStock'
                      : 'https://schema.org/OutOfStock',
                  url: `https://finda.sale/items/${item.id}`,
                  seller: {
                    '@type': 'Organization',
                    name: 'FindA.Sale',
                  },
                },
                brand: {
                  '@type': 'Brand',
                  name: 'FindA.Sale Estate Sales',
                },
              }),
            }}
          />
        )}
      </Head>

      {/* Phase 18: Photo lightbox */}
      {lightboxIndex !== null && item?.photoUrls?.length > 0 && (
        <PhotoLightbox
          photos={item.photoUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {checkoutItemId && item && (
        <CheckoutModal
          itemId={checkoutItemId}
          itemTitle={item.title}
          onClose={handleCheckoutClose}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      <main className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Link href={`/sales/${item.sale.id}`} className="inline-flex items-center text-amber-600 hover:text-amber-800 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to {item.sale.title}
        </Link>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Image Gallery — Phase 18: selected thumbnail + lightbox */}
            <div className="p-6">
              {item.photoUrls.length > 0 ? (
                <>
                  {/* Main photo — click to open lightbox */}
                  <button
                    onClick={() => setLightboxIndex(selectedPhotoIndex)}
                    className="group relative w-full bg-warm-200 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-amber-500"
                    aria-label="View full-size photo"
                  >
                    <img
                      src={getOptimizedUrl(item.photoUrls[selectedPhotoIndex]) || item.photoUrls[selectedPhotoIndex]}
                      alt={item.title}
                      className="w-full h-96 object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                    {/* Zoom hint */}
                    <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                      View full size
                    </div>
                  </button>

                  {/* Thumbnail strip — all photos, click to select or double-tap to open lightbox */}
                  {item.photoUrls.length > 1 && (
                    <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
                      {item.photoUrls.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            if (selectedPhotoIndex === i) {
                              // Second tap on active thumbnail opens lightbox
                              setLightboxIndex(i);
                            } else {
                              setSelectedPhotoIndex(i);
                            }
                          }}
                          className={`flex-shrink-0 w-20 h-20 rounded overflow-hidden border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                            i === selectedPhotoIndex
                              ? 'border-amber-500'
                              : 'border-transparent hover:border-amber-300'
                          }`}
                          aria-label={`View photo ${i + 1}`}
                          aria-pressed={i === selectedPhotoIndex}
                        >
                          <img
                            src={getThumbnailUrl(url) || url}
                            alt={`${item.title} ${i + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-warm-200 h-96 flex items-center justify-center rounded-lg">
                  <img
                    src="/images/placeholder.svg"
                    alt="No photo available"
                    className="w-16 h-16 opacity-30"
                    loading="lazy"
                  />
                </div>
              )}
            </div>

            {/* Item Details */}
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h1 className="text-3xl font-bold text-warm-900">{item.title}</h1>
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
                  <ItemShareButton
                    itemId={item.id}
                    itemTitle={item.title}
                    itemPrice={item.price || item.auctionStartPrice || 0}
                    userId={user?.id}
                  />

                  {/* Wishlist button */}
                  {user ? (
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setWishlistDropdownOpen(!wishlistDropdownOpen);
                        }}
                        className="text-2xl focus:outline-none"
                        aria-label="Save to wishlist"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-6 w-6 text-amber-600"
                          fill={wishlistsInItem.size > 0 ? 'currentColor' : 'none'}
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 5a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 19V5z"
                          />
                        </svg>
                      </button>

                      {/* Dropdown Menu */}
                      {wishlistDropdownOpen && (
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg z-50 border border-warm-200">
                          {wishlists.length === 0 ? (
                            <div className="p-4 text-center text-warm-600 text-sm">
                              <p className="mb-3">No wishlists yet.</p>
                              <Link
                                href="/wishlists"
                                className="text-amber-600 hover:text-amber-700 font-medium"
                              >
                                Create one
                              </Link>
                            </div>
                          ) : (
                            <>
                              <div className="max-h-60 overflow-y-auto">
                                {wishlists.map((wishlist) => (
                                  <button
                                    key={wishlist.id}
                                    onClick={() => {
                                      toggleWishlistItem(wishlist.id);
                                    }}
                                    className="w-full text-left px-4 py-3 hover:bg-warm-50 border-b border-warm-100 last:border-b-0 flex items-center gap-2"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={wishlistsInItem.has(wishlist.id)}
                                      onChange={() => {}}
                                      className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-warm-300 rounded"
                                    />
                                    <span className="text-sm text-warm-900">{wishlist.name}</span>
                                  </button>
                                ))}
                              </div>
                              <div className="border-t border-warm-200 p-3">
                                <Link
                                  href="/wishlists"
                                  className="block text-center text-sm text-amber-600 hover:text-amber-700 font-medium"
                                >
                                  Manage wishlists
                                </Link>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Link
                      href="/auth/login"
                      className="text-sm text-amber-600 hover:text-amber-700 font-medium"
                      title="Log in to save to wishlists"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 5a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 19V5z"
                        />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>
              <p className="text-warm-600 mb-6">{item.description}</p>
              
              <div className="mb-6">
                <Link href={`/sales/${item.sale.id}`} className="text-amber-600 hover:text-amber-800">
                  ← Back to {item.sale.title}
                </Link>
              </div>

              {/* CD2 Phase 4: Reverse Auction Badge */}
              {item.reverseAuction && <ReverseAuctionBadge item={item} />}

              {isAuctionItem ? (
                /* Auction Item */
                <div className="border-t border-b border-warm-200 py-6 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <span className="text-sm text-warm-600">Current Bid:</span>
                      <span className="font-bold text-amber-600 ml-1 text-xl">
                        {formatPrice(item.currentBid || item.auctionStartPrice)}
                      </span>
                    </div>
                    {item.auctionEndTime && (
                      <div className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded">
                        {timeRemaining} left
                      </div>
                    )}
                  </div>
                  
                  <div className="mb-4">
                    <span className="text-sm text-warm-600">
                      Minimum bid: {formatPrice(getMinimumNextBid(item))}
                    </span>
                  </div>
                  
                  {!isOrganizer && user && item.status === 'AVAILABLE' && !auctionEnded && (
                    <div className="flex flex-col space-y-3">
                      <div className="flex">
                        <input
                          type="number"
                          step="0.01"
                          min={getMinimumNextBid(item)}
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          className="flex-grow px-3 py-2 border border-warm-300 rounded-l text-warm-900"
                          placeholder="Enter bid amount"
                        />
                        <button
                          onClick={handlePlaceBid}
                          disabled={isBidding}
                          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-r disabled:opacity-50"
                        >
                          {isBidding ? 'Placing...' : 'Place Bid'}
                        </button>
                      </div>
                      <button
                        onClick={() => setBidAmount(getMinimumNextBid(item).toString())}
                        className="text-sm text-amber-600 hover:text-amber-800"
                      >
                        Set to minimum bid
                      </button>
                    </div>
                  )}
                  
                  {auctionEnded && (
                    <div className="text-center py-2 bg-warm-100 rounded text-warm-600">
                      Auction ended
                    </div>
                  )}
                  
                  {!user && (
                    <div className="text-center py-2">
                      <Link href="/login" className="text-amber-600 hover:text-amber-800">
                        Log in to place a bid
                      </Link>
                    </div>
                  )}
                  
                  {item.status === 'SOLD' && (
                    <div className="text-center py-2 bg-green-100 text-green-800 rounded">
                      Item sold
                    </div>
                  )}
                </div>
              ) : (
                /* Fixed Price Item */
                <div className="border-t border-b border-warm-200 py-6 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-warm-900">{formatPrice(item.price)}</span>
                    {!isOrganizer && user && item.status === 'AVAILABLE' && (
                      <button
                        onClick={handleBuyNow}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded"
                      >
                        Buy Now
                      </button>
                    )}
                  </div>
                  
                  {!user && (
                    <div className="text-center mt-4">
                      <Link href="/login" className="text-amber-600 hover:text-amber-800">
                        Log in to buy this item
                      </Link>
                    </div>
                  )}
                  
                  {item.status === 'SOLD' && (
                    <div className="mt-4 text-center py-2 bg-red-100 text-red-800 rounded">
                      Item sold
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center">
                <span className={`px-3 py-1 rounded-full text-sm ${
                  item.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                  item.status === 'SOLD' ? 'bg-red-100 text-red-800' :
                  item.status === 'RESERVED' ? 'bg-amber-100 text-amber-800' :
                  item.status === 'AUCTION_ENDED' ? 'bg-warm-100 text-warm-800' :
                  'bg-warm-100 text-warm-800'
                }`}>
                  {item.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Group Buying Pools — for high-value items ($100+) */}
              {!isAuctionItem && item && (
                <BuyingPoolCard
                  itemId={item.id}
                  itemPrice={item.price || 0}
                  itemStatus={item.status}
                  userId={user?.id}
                />
              )}

              {/* Phase 21: Reservation / hold UI */}
              {!isOrganizer && user && !isAuctionItem && (
                <div className="mt-4">
                  {myHold && ['PENDING', 'CONFIRMED'].includes(reservation!.status) ? (
                    /* Shopper holds this item */
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-sm font-semibold text-amber-800 mb-1">You have this item on hold</p>
                      <p className="text-xs text-amber-600 mb-3">{holdCountdown}</p>
                      <button
                        onClick={() => cancelMutation.mutate(reservation!.id)}
                        disabled={cancelMutation.isPending}
                        className="text-sm text-red-600 hover:text-red-800 underline disabled:opacity-50"
                      >
                        {cancelMutation.isPending ? 'Cancelling…' : 'Cancel hold'}
                      </button>
                    </div>
                  ) : someoneElseHolds ? (
                    /* Someone else holds it */
                    <div className="bg-warm-100 border border-warm-200 rounded-lg p-3 text-sm text-warm-600">
                      Item is currently on hold
                    </div>
                  ) : item.status === 'AVAILABLE' ? (
                    /* Available — show hold button */
                    <button
                      onClick={() => placeMutation.mutate()}
                      disabled={placeMutation.isPending}
                      className="w-full border border-amber-600 text-amber-600 hover:bg-amber-50 font-semibold py-2 px-6 rounded transition-colors disabled:opacity-50"
                    >
                      {placeMutation.isPending ? 'Placing hold…' : 'Hold for 24 hours'}
                    </button>
                  ) : null}
                </div>
              )}

              {/* Feature: Item Waitlist — "Notify Me" button for SOLD/RESERVED items */}
              {!isOrganizer && user && !isAuctionItem && (item.status === 'SOLD' || item.status === 'RESERVED') && (
                <div className="mt-4">
                  <button
                    onClick={handleToggleWaitlist}
                    disabled={isJoiningWaitlist}
                    className={`w-full font-semibold py-2 px-6 rounded transition-colors disabled:opacity-50 ${
                      onWaitlist
                        ? 'bg-green-100 border border-green-600 text-green-700 hover:bg-green-200'
                        : 'bg-blue-100 border border-blue-600 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    {isJoiningWaitlist ? (
                      <>Loading…</>
                    ) : onWaitlist ? (
                      <>✓ You&apos;re on the waitlist</>
                    ) : (
                      <>🔔 Notify Me If Available</>
                    )}
                  </button>
                </div>
              )}

              {!user && item.status === 'AVAILABLE' && !isAuctionItem && (
                <div className="mt-4 text-sm text-center">
                  <Link href="/login" className="text-amber-600 hover:text-amber-800">
                    Log in to hold this item
                  </Link>
                </div>
              )}

              {/* Phase 20: Message seller button — visible to shoppers only */}
              {user && !isOrganizer && (
                <div className="mt-4">
                  <Link
                    href={`/messages/new?organizerId=${item.sale.organizerId}&saleId=${item.sale.id}`}
                    className="w-full block text-center py-2 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                  >
                    💬 Ask seller a question
                  </Link>
                </div>
              )}

              {/* CD2 Phase 2: Treasure Hunt "Mark as Found" section */}
              {user && !isOrganizer && item.status === 'AVAILABLE' && (
                <div className="mt-6 pt-6 border-t border-warm-200">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">🗺️</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-blue-900 mb-2">
                          Does this match today's treasure hunt clue?
                        </p>
                        <button
                          onClick={() => treasureHuntMutation.mutate()}
                          disabled={treasureHuntMutation.isPending}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors disabled:opacity-50"
                        >
                          {treasureHuntMutation.isPending ? 'Checking…' : 'Mark as Found'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ItemDetailPage;
