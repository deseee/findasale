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
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  } catch (error) {
    return 'No end time';
  }
};

const SaleDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [bidAmounts, setBidAmounts] = useState<{[key: string]: string}>({});
  const [biddingItemId, setBiddingItemId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [checkoutItem, setCheckoutItem] = useState<{ id: string; title: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [downloadingKit, setDownloadingKit] = useState(false);
  const { showToast } = useToast();

  // Poll for updates every 10 seconds for auction items
  useEffect(() => {
    if (!id) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
    }, 10000);

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
    if (!sale) return;
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
      <div className="min-h-screen bg-gray-50">
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-5 w-28 mb-6" />
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <Skeleton className="h-9 w-2/3 mb-4" />
            <Skeleton className="h-4 w-1/2 mb-2" />
            <Skeleton className="h-4 w-1/3 mb-6" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <Skeleton className="h-6 w-24 mb-4" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-40 w-full" />)}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <Skeleton className="h-6 w-36 mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3].map(i => (
                <div key={i} className="border rounded-lg overflow-hidden">
                  <Skeleton className="h-48 w-full rounded-none" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }
  if (isError) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Error loading sale</div>;
  if (!sale) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Sale not found</div>;

  // Check if user is the owner of this specific sale, or an admin
  const isOrganizer = user?.role === 'ADMIN' || (user?.role === 'ORGANIZER' && sale?.organizer?.userId === user?.id);

  // Format dates safely
  const formatSaleDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'TBA';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return format(date, 'MMMM d, yyyy h:mm a');
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Generate JSON-LD for schema.org structured data
  const generateJsonLd = () => {
    if (!sale) return null;

    const siteUrl = 'https://finda.sale';
    const saleUrl = `${siteUrl}/sales/${sale.id}`;

    const eventStatusMap: Record<string, string> = {
      PUBLISHED: 'https://schema.org/EventScheduled',
      ENDED: 'https://schema.org/EventScheduled',
      DRAFT: 'https://schema.org/EventScheduled',
    };

    const eventData = {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": sale.title,
      "url": saleUrl,
      "startDate": sale.startDate,
      "endDate": sale.endDate,
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "eventStatus": eventStatusMap[sale.status ?? 'PUBLISHED'] ?? 'https://schema.org/EventScheduled',
      "image": sale.photoUrls && sale.photoUrls.length > 0 ? sale.photoUrls : undefined,
      "location": {
        "@type": "Place",
        "name": sale.title,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": sale.address,
          "addressLocality": sale.city,
          "addressRegion": sale.state,
          "postalCode": sale.zip,
          "addressCountry": "US"
        }
      },
      "description": sale.description,
      "organizer": {
        "@type": "Organization",
        "name": sale.organizer.businessName,
        "telephone": sale.organizer.phone
      },
      "offers": {
        "@type": "AggregateOffer",
        "priceCurrency": "USD",
        "offerCount": sale.items.length,
        "lowPrice": sale.items.length > 0 ? Math.min(...sale.items.map(i => Number(i.price || i.auctionStartPrice || 0))) : 0,
        "offers": sale.items.map(item => ({
          "@type": "Offer",
          "name": item.title,
          "price": item.price || item.auctionStartPrice || 0,
          "priceCurrency": "USD",
          "availability": item.status === "AVAILABLE"
            ? "https://schema.org/InStock"
            : item.status === "SOLD"
              ? "https://schema.org/SoldOut"
              : "https://schema.org/PreOrder"
        }))
      }
    };

    const breadcrumbData = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": siteUrl },
        { "@type": "ListItem", "position": 2, "name": `Estate Sales in ${sale.city}`, "item": `${siteUrl}/city/${sale.city.toLowerCase().replace(/\s+/g, '-')}` },
        { "@type": "ListItem", "position": 3, "name": sale.title, "item": saleUrl }
      ]
    };

    return { event: JSON.stringify(eventData), breadcrumb: JSON.stringify(breadcrumbData) };
  };

  const jsonLd = generateJsonLd();

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>{sale.title} - FindA.Sale</title>
        <meta name="description" content={`${sale.title} — ${sale.address}, ${sale.city}, ${sale.state}. ${sale.description?.slice(0, 120) ?? ''}`} />

        {/* Open Graph Meta Tags */}
        <meta property="og:title" content={sale.title} />
        <meta property="og:description" content={sale.description} />
        <meta property="og:type" content="event" />
        <meta property="og:url" content={`https://finda.sale/sales/${sale.id}`} />
        <meta
          property="og:image"
          content={
            sale.photoUrls && sale.photoUrls.length > 0
              ? sale.photoUrls[0]
              : `/api/og?title=${encodeURIComponent(sale.title)}&date=${encodeURIComponent(
                  `${format(new Date(sale.startDate), 'MMM d')} - ${format(new Date(sale.endDate), 'MMM d, yyyy')}`
                )}&location=${encodeURIComponent(`${sale.city}, ${sale.state}`)}`
          }
        />

        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={sale.title} />
        <meta name="twitter:description" content={sale.description} />
        <meta
          name="twitter:image"
          content={
            sale.photoUrls && sale.photoUrls.length > 0
              ? sale.photoUrls[0]
              : `/api/og?title=${encodeURIComponent(sale.title)}&date=${encodeURIComponent(
                  `${format(new Date(sale.startDate), 'MMM d')} - ${format(new Date(sale.endDate), 'MMM d, yyyy')}`
                )}&location=${encodeURIComponent(`${sale.city}, ${sale.state}`)}`
          }
        />

        {/* JSON-LD Structured Data */}
        {jsonLd && (
          <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd.event }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd.breadcrumb }} />
          </>
        )}
      </Head>

      {checkoutItem && (
        <CheckoutModal
          itemId={checkoutItem.id}
          itemTitle={checkoutItem.title}
          onClose={handleCheckoutClose}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        saleId={sale.id}
        onImportComplete={handleImportComplete}
      />

      <main className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Home
        </Link>

        {/* Sale Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{sale.title}</h1>
              <div className="flex items-center text-gray-600 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-600">{sale.address}, {sale.city}, {sale.state} {sale.zip}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-600">
                  {formatSaleDate(sale.startDate)} - {formatSaleDate(sale.endDate)}
                </span>
              </div>
            </div>
            <div className="mt-4 md:mt-0 flex flex-col items-end gap-2">
              <Link href={`/organizers/${sale.organizer.id}`} className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors block">
                Organized by: {sale.organizer.businessName}
              </Link>
              {sale.organizer.badges && sale.organizer.badges.length > 0 && (
                <BadgeDisplay badges={sale.organizer.badges} size="sm" />
              )}
              {sale.organizer.avgRating !== undefined && (
                <div className="text-sm text-gray-600">
                  ⭐ {sale.organizer.avgRating} ({sale.organizer.reviewCount} reviews)
                </div>
              )}
              {/* Add to Calendar */}
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/sales/${sale.id}/calendar.ics`}
                className="inline-flex items-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
                Add to Calendar
              </a>
              <div className="flex space-x-2">
                {/* Share Button */}
                <SaleShareButton
                  saleId={sale.id}
                  saleTitle={sale.title}
                  saleDate={`${format(new Date(sale.startDate), 'MMM d')} - ${format(new Date(sale.endDate), 'MMM d, yyyy')}`}
                  saleLocation={`${sale.city}, ${sale.state}`}
                  userId={user?.id}
                />
                
                {/* Post to Nextdoor Button */}
                <button 
                  onClick={() => {
                    const postText = `Check out this estate sale on FindA.Sale!\n\n${sale.title}\n${sale.address}, ${sale.city}, ${sale.state}\n${format(new Date(sale.startDate), 'MMM d, yyyy h:mm a')} - ${format(new Date(sale.endDate), 'MMM d, yyyy h:mm a')}\n\n${window.location.origin}/sales/${sale.id}`;
                    navigator.clipboard.writeText(postText);
                    showToast('Post text copied to clipboard! Paste it into Nextdoor.', 'success');
                  }}
                  className="flex items-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 3 3 0 004.242 0l3-3a3 3 0 00-4.242-4.242l-3 3a3 3 0 000 4.242 1 1 0 101.414-1.414 1 1 0 010-1.414l3-3z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M14.586 10.586a2 2 0 012.828 0 3 3 0 010 4.242l-3 3a3 3 0 01-4.242 0 1 1 0 101.414 1.414 1 1 0 001.414 0l3-3a1 1 0 000-1.414 1 1 0 00-1.414 0l-3 3a1 1 0 101.414 1.414 3 3 0 010-4.242 1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                  Post to Nextdoor
                </button>
              </div>
            </div>
          </div>

          {sale.description && (
            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-2 text-gray-900">Description</h2>
              <p className="text-gray-700">{sale.description}</p>
            </div>
          )}

          {/* Subscription section for shoppers */}
          {!isOrganizer && user && (
            <SaleSubscription 
              saleId={sale.id} 
              userEmail={user.email}
            />
          )}

          {isOrganizer && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link 
                href={`/organizer/edit-sale/${sale.id}`}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                Edit Sale Details
              </Link>
              <Link 
                href={`/organizer/add-items/${sale.id}`}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add Items
              </Link>
              <button 
                onClick={() => setIsImportModalOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Import Items
              </button>
              <Link
                href={`/organizer/send-update/${sale.id}`}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                </svg>
                Send Update
              </Link>
              <button
                onClick={handleDownloadMarketingKit}
                disabled={downloadingKit}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded inline-flex items-center disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                {downloadingKit ? 'Generating...' : 'Download Marketing Kit'}
              </button>
              <Link
                href={`/organizer/line-queue/${sale.id}`}
                className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
                Manage Queue
              </Link>
            </div>
          )}
        </div>

        {/* Photo Gallery */}
        {sale.photoUrls && sale.photoUrls.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Photos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {sale.photoUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url}
                    alt={`${sale.title} photo ${i + 1}`}
                    className="w-full h-40 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity cursor-pointer"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Map Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Location</h2>
          {sale.lat && sale.lng ? (
            <SaleMap
              singlePin={{
                lat: sale.lat,
                lng: sale.lng,
                label: `${sale.title} — ${sale.address}, ${sale.city}, ${sale.state}`,
              }}
              height="360px"
            />
          ) : (
            <div className="h-72 bg-gray-100 rounded-lg flex items-center justify-center">
              <p className="text-gray-500">Location not available</p>
            </div>
          )}
          <p className="mt-3 text-sm text-gray-500">
            {sale.address}, {sale.city}, {sale.state} {sale.zip}
          </p>
        </div>

        {/* Items Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
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

          {/* Category Filter */}
          {sale.items && sale.items.some((item) => item.category) && (
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">Filter by category:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
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
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
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
              <p className="text-gray-600 mb-4">No items listed for this sale yet.</p>
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
                        src={item.photoUrls[0]} 
                        alt={item.title} 
                        className="w-full h-48 object-cover"
                      />
                    ) : (
                      <div className="bg-gray-200 h-48 flex items-center justify-center">
                        <span className="text-gray-500">No image</span>
                      </div>
                    )}
                  </Link>
                  <div className="p-4">
                    <h3 className="font-bold text-lg mb-2 text-gray-900">{item.title}</h3>
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{item.description}</p>

                    {/* Category and Condition badges */}
                    {(item.category || item.condition) && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {item.category && (
                          <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
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
                            <span className="text-sm text-gray-600">Current Bid:</span>
                            <span className="font-bold text-blue-600 ml-1">
                              {formatPrice(item.currentBid || item.auctionStartPrice)}
                            </span>
                          </div>
                          {item.auctionEndTime && (
                            <div className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                              {formatTimeRemaining(item.auctionEndTime)} left
                            </div>
                          )}
                        </div>
                        
                        <div className="mb-2">
                          <span className="text-sm text-gray-600">
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
                              className="flex-grow px-2 py-1 border border-gray-300 rounded-l text-sm text-gray-900"
                              placeholder="Enter bid amount"
                            />
                            <button
                              onClick={() => handlePlaceBid(item.id)}
                              disabled={biddingItemId === item.id}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded-r disabled:opacity-50"
                            >
                              {biddingItemId === item.id ? '...' : 'Bid'}
                            </button>
                          </div>
                        )}
                        
                        {item.status === 'AUCTION_ENDED' && (
                          <div className="text-sm text-center py-2 bg-gray-100 rounded text-gray-600">
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
                        <span className="font-bold text-blue-600">
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
                        item.status === 'AUCTION_ENDED' ? 'bg-gray-100 text-gray-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                      {isOrganizer && (
                        <Link 
                          href={`/organizer/edit-item/${item.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Edit
                        </Link>
                      )}
                      {!isOrganizer && user && !sale.isAuctionSale && item.status === 'AVAILABLE' && (
                        <button
                          onClick={() => handleBuyNow(item.id, item.title)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded"
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
      </main>
    </div>
  );
};

export default SaleDetailPage;
