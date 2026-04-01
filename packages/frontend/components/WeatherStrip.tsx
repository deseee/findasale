/**
 * Weather Strip Widget — Feature #236
 * Thin horizontal strip: date + icon + high/low + condition text
 * Shows only if sale date ≤ 10 days away
 */
import React, { useMemo } from 'react';

interface WeatherStripProps {
  saleStartDate: string;
  saleCity?: string;
  status?: string; // Sale status for condition to also render on LIVE sales
}

// Simple weather approximation based on month + region (no external API in Phase 1)
function getApproxWeather(dateStr: string): { tempHigh: number; tempLow: number; condition: string; icon: string } | null {
  const date = new Date(dateStr);
  const month = date.getMonth(); // 0-11

  // Grand Rapids, MI approximate temps by month
  const monthData: Record<number, { tempHigh: number; tempLow: number; condition: string; icon: string }> = {
    0: { tempHigh: 31, tempLow: 17, condition: 'Cold & snowy', icon: '❄️' },
    1: { tempHigh: 34, tempLow: 19, condition: 'Cold & snowy', icon: '❄️' },
    2: { tempHigh: 45, tempLow: 28, condition: 'Chilly', icon: '🌥️' },
    3: { tempHigh: 58, tempLow: 37, condition: 'Cool & breezy', icon: '🌤️' },
    4: { tempHigh: 70, tempLow: 48, condition: 'Mild & pleasant', icon: '☀️' },
    5: { tempHigh: 79, tempLow: 58, condition: 'Warm', icon: '☀️' },
    6: { tempHigh: 83, tempLow: 63, condition: 'Hot & sunny', icon: '☀️' },
    7: { tempHigh: 81, tempLow: 61, condition: 'Warm & humid', icon: '⛅' },
    8: { tempHigh: 74, tempLow: 53, condition: 'Pleasant', icon: '🌤️' },
    9: { tempHigh: 61, tempLow: 42, condition: 'Cool & crisp', icon: '🍂' },
    10: { tempHigh: 47, tempLow: 33, condition: 'Chilly', icon: '🌥️' },
    11: { tempHigh: 34, tempLow: 22, condition: 'Cold', icon: '❄️' },
  };

  return monthData[month] || null;
}

export default function WeatherStrip({ saleStartDate, saleCity, status }: WeatherStripProps) {
  const shouldShow = useMemo(() => {
    if (!saleStartDate) return false;
    const saleDate = new Date(saleStartDate);
    const now = new Date();
    const diffDays = (saleDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    // Show if sale is within 10 days OR if status is LIVE
    return status === 'LIVE' || (diffDays >= 0 && diffDays <= 10);
  }, [saleStartDate, status]);

  const weather = useMemo(() => getApproxWeather(saleStartDate), [saleStartDate]);

  if (!shouldShow || !weather) return null;

  const saleDate = new Date(saleStartDate);
  const dateStr = saleDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="bg-gradient-to-r from-blue-50 to-sky-50 dark:from-gray-800 dark:to-gray-750 rounded-lg px-4 py-2 flex items-center gap-3 border border-blue-100 dark:border-gray-700">
      <span className="text-xl">{weather.icon}</span>
      <div className="flex-1 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{dateStr}</span>
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {weather.tempHigh}° / {weather.tempLow}°F
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{weather.condition}</span>
        {saleCity && (
          <span className="text-xs text-gray-400 dark:text-gray-500">{saleCity}</span>
        )}
      </div>
    </div>
  );
}
