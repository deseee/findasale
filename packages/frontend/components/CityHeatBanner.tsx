import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import Skeleton from './Skeleton';

interface CityHeatResponse {
  cities: Array<{
    label: string;
    saleCount: number;
    itemCount: number;
    totalEstimatedValue: number;
    trend: 'up' | 'stable' | 'down';
    lat: number;
    lng: number;
  }>;
  timestamp: string;
  cacheAge: number;
}

const CityHeatBanner: React.FC = () => {
  const [data, setData] = useState<CityHeatResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    // Check if user dismissed banner
    const isDismissed = localStorage.getItem('city-heat-dismissed') === 'true';
    if (isDismissed) {
      setDismissed(true);
      setLoading(false);
      return;
    }

    // Get user location
    if (navigator.geolocation) {
      navigator.permissions
        ?.query({ name: 'geolocation' as PermissionName })
        .then((result) => {
          if (result.state === 'granted') {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
              },
              () => {}
            );
          }
        })
        .catch(() => {});
    }

    // Fetch city heat data
    api
      .get('/city-heat')
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch city heat:', err);
        setLoading(false);
      });
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('city-heat-dismissed', 'true');
    setDismissed(true);
  };

  // Helper to calculate distance between two lat/lng points (Haversine formula)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3959; // Earth radius in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Reserve layout space while loading so the banner popping in doesn't
  // shift content below it (CLS fix — S1066).
  if (loading) {
    return (
      <div className="mb-8 bg-warm-50 dark:bg-gray-800/40 border-l-4 border-warm-200 dark:border-gray-700 rounded-r-lg p-4 flex items-start gap-4">
        <div className="flex-shrink-0 text-2xl opacity-0">🔥</div>
        <div className="flex-grow space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    );
  }

  if (dismissed || !data || !data.cities || data.cities.length === 0) {
    return null;
  }

  const topCity = data.cities[0];

  // Only show banner if user's location is near the featured city (within 50 miles)
  // or if we don't have user location yet (fallback to showing it)
  const isNearUser = userLocation
    ? calculateDistance(userLocation.lat, userLocation.lng, topCity.lat, topCity.lng) <= 50
    : true;

  if (!isNearUser) {
    return null;
  }

  const trendEmoji = topCity.trend === 'up' ? '📈' : topCity.trend === 'down' ? '📉' : '➡️';

  return (
    <div className="mb-8 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-l-4 border-amber-500 rounded-r-lg p-4 flex items-start gap-4">
      <div className="flex-shrink-0 text-2xl">🔥</div>
      <div className="flex-grow">
        <h3 className="font-bold text-amber-900 dark:text-amber-100">
          {topCity.label} is heating up
        </h3>
        <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
          {topCity.saleCount} sale{topCity.saleCount !== 1 ? 's' : ''} this week {trendEmoji}
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="text-amber-600 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-100 font-bold text-xl flex-shrink-0"
        aria-label="Dismiss banner"
      >
        ×
      </button>
    </div>
  );
};

export default CityHeatBanner;
