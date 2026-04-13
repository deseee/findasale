import React, { useState, useEffect } from 'react';
import api from '../lib/api';

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

  useEffect(() => {
    // Check if user dismissed banner
    const isDismissed = localStorage.getItem('city-heat-dismissed') === 'true';
    if (isDismissed) {
      setDismissed(true);
      setLoading(false);
      return;
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

  if (loading || dismissed || !data || !data.cities || data.cities.length === 0) {
    return null;
  }

  const topCity = data.cities[0];
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
