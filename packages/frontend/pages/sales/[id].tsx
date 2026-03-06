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
import SaleMap from '../../components/SaleMap';
import Skeleton from '../../components/Skeleton';
import BadgeDisplay from '../../components/BadgeDisplay';
import AuctionCountdown from '../../components/AuctionCountdown';
import PhotoLightbox from '../../components/PhotoLightbox';
import { getThumbnailUrl } from '../../lib/imageUtils';
import ReviewsSection from '../../components/ReviewsSection';

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
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [downloadingKit, setDownloadingKit] = useState(false);

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

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>{sale.title} - FindA.Sale</title>
        <meta name="description" content={`${sale.title} in ${sale.city}, ${sale.state}. Sale runs from ${format(saleStartDate, 'MMM d, yyyy')} to ${format(saleEndDate, 'MMM d, yyyy')}.`} />
        <meta property="og:title" content={sale.title} />
        <meta property="og:description" content={`${sale.address}, ${sale.city}, ${sale.state}`} />
        <meta property="og:image" content={sale.photoUrls[0] || '/default-sale.jpg'} />
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
              <SaleShareButton saleId={sale.id} saleTitle={sale.title} saleLocation={`${sale.city}, ${sale.state}`} userId={user?.id} />
            </div>
          </div>
        </div>

        {/* Organizer Info Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-warm-900 mb-2">Organized by</h2>
              <p className="text-lg font-semibold text-warm-800">{sale.organizer.businessName}</p>
              <p className="text-sm text-warm-600 mb-4">{sale.organizer.phone}</p>
              {sale.organizer.avgRating && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-medium text-warm-700">Rating:</span>
                  <span className="text-sm text-warm-600">{sale.organizer.avgRating.toFixed(1)}/5.0</span>
                  <span className="text-sm text-warm-500">({sale.organizer.reviewCount || 0} reviews)</span>
                </div>
              )}
              <BadgeDisplay badges={sale.organizer.badges} />
            </div>
            {isOrganizer && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => router.push(`/organizer/sales/${sale.id}/edit`)}
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
                    src={getThumbnailUrl(sale.photoUrls[currentPhotoIndex], 800)}
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
                        src={getThumbnailUrl(url, 100)}
                        alt={`Thumbnail ${idx + 1}`}
                        className={`h-20 w-20 object-cover rounded cursor-pointer transition ${
                          idx === currentPhotoIndex ? 'ring-2 ring-amber-600' : ''
                        }`}
                        onClick={() => setCurrentPhotoIndex(idx)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Map */}
            <SaleMap lat={sale.lat} lng={sale.lng} address={sale.address} className="mb-8 rounded-lg shadow-md h-96" />

            {/* Description */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold text-warm-900 mb-4">About</h2>
              <p className="text-warm-700 whitespace-pre-wrap leading-relaxed">{sale.description}</p>
            </div>

            {/* Items */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-warm-900 mb-6">Items</h2>
              {sale.items.length === 0 ? (
                <p className="text-warm-600">No items listed yet.</p>
              ) : (
                <div className="space-y-6">
                  {sale.items.map((item) => {
                    const auctionEndTime = parseISO(item.auctionEndTime);
                    const auctionEnded = now >= auctionEndTime;
                    return (
                      <div key={item.id} className="border border-warm-200 rounded-lg p-6">
                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-warm-900 mb-2">{item.title}</h3>
                            <p className="text-warm-700 mb-2">{item.description}</p>
                            {item.category && <p className="text-sm text-warm-600">Category: {item.category}</p>}
                            {item.condition && <p className="text-sm text-warm-600">Condition: {item.condition}</p>}
                          </div>
                        </div>

                        {/* Pricing Display */}
                        <div className="mb-4 p-4 bg-warm-50 rounded-lg">
                          {item.status === 'SOLD' ? (
                            <p className="text-lg font-bold text-red-600">SOLD</p>
                          ) : sale.isAuctionSale ? (
                            <>
                              <p className="text-sm text-warm-600 mb-1">Auction</p>
                              <p className="text-2xl font-bold text-warm-900">${item.currentBid.toFixed(2)}</p>
                              <p className="text-xs text-warm-600 mt-1">Start price: ${item.auctionStartPrice.toFixed(2)}</p>
                              <p className="text-xs text-warm-600">Bid increment: ${item.bidIncrement.toFixed(2)}</p>
                              {!auctionEnded && user && (
                                <AuctionCountdown endTime={item.auctionEndTime} />
                              )}
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-warm-600 mb-1">Fixed Price</p>
                              <p className="text-2xl font-bold text-warm-900">${item.price.toFixed(2)}</p>
                            </>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-wrap">
                          {sale.isAuctionSale && !auctionEnded && user ? (
                            <>
                              <input
                                type="number"
                                step="0.01"
                                min={item.currentBid + item.bidIncrement}
                                placeholder="Enter bid"
                                value={bidAmounts[item.id] || ''}
                                onChange={(e) => handleBidAmountChange(item.id, e.target.value)}
                                className="flex-1 px-3 py-2 border border-warm-300 rounded"
                              />
                              <button
                                onClick={() => handlePlaceBid(item.id)}
                                disabled={biddingItemId === item.id}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium disabled:opacity-50"
                              >
                                {biddingItemId === item.id ? 'Placing bid...' : 'Bid'}
                              </button>
                            </>
                          ) : !sale.isAuctionSale && item.status !== 'SOLD' && user ? (
                            <button
                              onClick={() => handleBuyNow(item.id, item.title)}
                              className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium"
                            >
                              Buy Now
                            </button>
                          ) : !user && item.status !== 'SOLD' ? (
                            <Link
                              href="/login"
                              className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium text-center"
                            >
                              Sign in to bid
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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

            {/* Organizer Contact */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-lg font-bold text-warm-900 mb-4">Contact Info</h2>
              <p className="text-sm text-warm-600 mb-2">
                <span className="font-medium text-warm-900">Phone:</span> {sale.organizer.phone}
              </p>
              <p className="text-sm text-warm-600">
                <span className="font-medium text-warm-900">Address:</span> {sale.organizer.address}
              </p>
            </div>

            {/* Reviews Section */}
            <ReviewsSection saleId={sale.id} />
          </div>
        </div>
      </main>

      {/* Modals */}
      {checkoutItem && (
        <CheckoutModal
          item={checkoutItem}
          onClose={handleCheckoutClose}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {isImportModalOpen && isOrganizer && (
        <CSVImportModal saleId={sale.id} onClose={() => setIsImportModalOpen(false)} onComplete={handleImportComplete} />
      )}

      {lightboxOpen && sale.photoUrls.length > 0 && (
        <PhotoLightbox photos={sale.photoUrls} currentIndex={currentPhotoIndex} onClose={() => setLightboxOpen(false)} onNavigate={setCurrentPhotoIndex} />
      )}
    </div>
  );
};

export default SaleDetailPage;