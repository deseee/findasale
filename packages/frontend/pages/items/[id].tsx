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
import { useToast } from '../../components/ToastContext';
import { getThumbnailUrl, getOptimizedUrl } from '../../lib/imageUtils';
import { formatDistanceToNow, parseISO } from 'date-fns';

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
  sale: {
    id: string;
    title: string;
  };
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
  const socketRef = useRef<Socket | null>(null); // V1: live bidding socket
  const { showToast } = useToast();

  const { data: item, isLoading, isError, refetch } = useQuery({
    queryKey: ['item', id],
    queryFn: async () => {
      if (!id) throw new Error('No item ID provided');
      const response = await api.get(`/items/${id}`);
      return response.data as Item;
    },
    enabled: !!id,
  });

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
      await api.post(`/favorites/item/${item.id}`, { isFavorite: !isFavorite });
      setIsFavorite(!isFavorite);
      queryClient.invalidateQueries({ queryKey: ['favorite', id] });
    } catch (err: any) {
      console.error('Favorite error:', err);
      showToast('Failed to update favorite status', 'error');
    }
  };

  useEffect(() => {
    if (item && item.auctionStartPrice) {
      setBidAmount(getMinimumNextBid(item).toString());
    }
  }, [item]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-warm-50">Loading...</div>;
  if (isError) return (
  <div className="min-h-screen flex flex-col items-center justify-center bg-warm-50 gap-4">
    <p className="text-warm-700 text-lg">Failed to load item details.</p>
    <button onClick={() => refetch()} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">
      Try again
    </button>
  </div>
);
  if (!item) return <div className="min-h-screen flex items-center justify-center bg-warm-50">Item not found</div>;

  const isOrganizer = user?.role === 'ORGANIZER' || user?.role === 'ADMIN';
  const isAuctionItem = !!item.auctionStartPrice;
  const auctionEnded = item.auctionEndTime && new Date(item.auctionEndTime) < new Date();
  const myHold = reservation && user && reservation.userId === user.id;
  const someoneElseHolds = reservation && user && reservation.userId !== user.id && ['PENDING', 'CONFIRMED'].includes(reservation.status);

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>{item.title} - FindA.Sale</title>
        <meta name="description" content={item.description} />
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
              <div className="flex justify-between items-start">
                <h1 className="text-3xl font-bold text-warm-900 mb-2">{item.title}</h1>
                <button
                  onClick={toggleFavorite}
                  className="text-2xl focus:outline-none"
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
              </div>
              <p className="text-warm-600 mb-6">{item.description}</p>
              
              <div className="mb-6">
                <Link href={`/sales/${item.sale.id}`} className="text-amber-600 hover:text-amber-800">
                  \u2190 Back to {item.sale.title}
                </Link>
              </div>

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
                        {cancelMutation.isPending ? 'Cancelling\u2026' : 'Cancel hold'}
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
                      {placeMutation.isPending ? 'Placing hold\u2026' : 'Hold for 24 hours'}
                    </button>
                  ) : null}
                </div>
              )}

              {!user && item.status === 'AVAILABLE' && !isAuctionItem && (
                <div className="mt-4 text-sm text-center">
                  <Link href="/login" className="text-amber-600 hover:text-amber-800">
                    Log in to hold this item
                  </Link>
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
