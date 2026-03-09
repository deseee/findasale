import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import SaleMap, { SalePin } from '../components/SaleMap';
import Skeleton from '../components/Skeleton';
import { useToast } from '../components/ToastContext';
import RouteBuilder from '../components/RouteBuilder';

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
  photoUrls: string[];
  organizer: {
    id: string;
    businessName: string;
  };
  tags?: string[];
  isAuctionSale?: boolean;
}

type DateFilter = 'all' | 'this-week' | 'this-weekend' | 'today';

const MapPage = () => {
  const { showToast } = useToast();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeolocationRequested, setIsGeolocationRequested] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [filteredPins, setFilteredPins] = useState<SalePin[]>([]);

  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'Grand Rapids';
  const defaultState = process.env.NEXT_PUBLIC_DEFAULT_STATE || 'MI';

  const { data: sales, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales', { limit: 200 }],
    queryFn: async () => {
      try {
        // Backend filters by status: 'PUBLISHED' by default
        const response = await api.get('/sales?limit=200');
        return response.data.sales as Sale[];
      } catch (err: any) {
        console.error('Error fetching sales:', err);
        throw new Error('Failed to load sales. Please try again later.');
      }
    },
    retry: 1,
  });

  // Auto-request geolocation on mount
  useEffect(() => {
    if (!isGeolocationRequested && navigator.geolocation) {
      setIsGeolocationRequested(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Geolocation denied or unavailable:', error);
          showToast('Location access denied. Use the "My Location" button to share your location or browse sales near you.', 'info');
        }
      );
    }
  }, [isGeolocationRequested, showToast]);

  // Filter sales by date and geo-location
  const filteredSales = useMemo(() => {
    if (!sales) return [];
    let result = [...sales];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    // This Week = today through next 7 days
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);

    // This Weekend = Saturday and Sunday of current week
    const day = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
    const satDiff = day === 0 ? -1 : day === 6 ? 0 : 6 - day;
    const weekendStart = new Date(todayStart);
    weekendStart.setDate(weekendStart.getDate() + satDiff);
    const weekendEnd = new Date(weekendStart);
    weekendEnd.setDate(weekendEnd.getDate() + 1);
    weekendEnd.setHours(23, 59, 59, 999);

    result = result.filter((s) => {
      let start: Date, end: Date;
      try {
        start = new Date(s.startDate);
        end = new Date(s.endDate);
      } catch {
        return false;
      }
      if (isNaN(start.getTime())) return false;

      if (dateFilter === 'today') return end >= todayStart && start <= todayEnd;
      if (dateFilter === 'this-weekend') return start <= weekendEnd && end >= weekendStart;
      if (dateFilter === 'this-week') return end >= todayStart && start <= weekEnd;
      return true; // 'all'
    });

    return result;
  }, [sales, dateFilter]);

  // Convert filtered sales to map pins
  useMemo(() => {
    const pins = filteredSales
      .filter((s) => s.lat && s.lng)
      .map((s): SalePin => {
        const now = new Date();
        const saleStart = new Date(s.startDate);
        const saleEnd = new Date(s.endDate);
        const isActive = saleStart <= now && now <= saleEnd;
        const daysUntilStart = Math.ceil((saleStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const isWithin7Days = daysUntilStart <= 7 && daysUntilStart > 0;

        return {
          id: s.id,
          title: s.title,
          lat: s.lat,
          lng: s.lng,
          city: s.city,
          state: s.state,
          startDate: s.startDate,
          endDate: s.endDate,
          organizerName: s.organizer?.businessName ?? '',
          photoUrl: s.photoUrls?.[0],
          status: isActive ? 'active' : isWithin7Days ? 'upcoming-soon' : 'upcoming',
        };
      });
    setFilteredPins(pins);
  }, [filteredSales]);

  const handleUseLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          showToast('Unable to access your location. Please check your browser permissions.', 'error');
        }
      );
    }
  };

  const saleCount = filteredSales.length;

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col">
      <Head>
        <title>Sales Near You - FindA.Sale</title>
        <meta name="description" content="View estate sales on an interactive map near you" />
        <meta property="og:title" content="Estate Sales Map — FindA.Sale" />
        <meta property="og:description" content={`See all upcoming estate sales on an interactive map. Filter by date and find sales near you in ${defaultCity}, ${defaultState}.`} />
        <meta property="og:url" content="https://finda.sale/map" />
        <meta property="og:image" content="https://finda.sale/og-default.png" />
        <meta name="twitter:card" content="summary" />
      </Head>

      {/* Header Strip */}
      <section className="bg-white border-b border-warm-200 px-4 py-4">
        <div className="container mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl font-bold text-warm-900">Sales Near You</h1>
              <p className="text-sm text-warm-600 mt-1">
                {isLoading ? '...' : `${saleCount} sale${saleCount !== 1 ? 's' : ''} near ${defaultCity}, ${defaultState}`}
              </p>
            </div>
            <button
              onClick={handleUseLocation}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 flex-shrink-0"
              title="Use your current location"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">My Location</span>
            </button>
          </div>

          {/* Filter Chips */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'today', 'this-weekend', 'this-week'] as DateFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  dateFilter === f
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-warm-700 border-warm-300 hover:border-amber-400'
                }`}
              >
                {f === 'all' ? 'All' : f === 'today' ? 'Today' : f === 'this-weekend' ? 'This Weekend' : 'This Week'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Map Container */}
      <section className="flex-grow overflow-hidden">
        {isLoading ? (
          <Skeleton className="w-full h-full" />
        ) : isError ? (
          <div className="w-full h-full flex items-center justify-center bg-warm-50">
            <div className="text-center">
              <h2 className="text-xl font-bold text-red-600 mb-2">Error Loading Map</h2>
              <p className="text-warm-600 mb-4">There was a problem loading sales data.</p>
              <button
                onClick={() => refetch()}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <SaleMap
            pins={filteredPins}
            userLocation={userLocation}
            height="calc(100vh - 200px)"
            center={userLocation ? [userLocation.lat, userLocation.lng] : [42.9634, -85.6681]}
            zoom={userLocation ? 13 : 11}
          />
        )}
      </section>

      {/* D3: Route Builder — collapsible panel below map */}
      {!isLoading && !isError && (
        <RouteBuilder sales={filteredSales} />
      )}
    </div>
  );
};

export default MapPage;
