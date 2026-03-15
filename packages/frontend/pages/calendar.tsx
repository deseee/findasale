import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO } from 'date-fns';
import api from '../lib/api';
import Skeleton from '../components/Skeleton';
import RemindMeButton from '../components/RemindMeButton';

interface Sale {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  city: string;
  state: string;
  organizer: {
    businessName: string;
  };
}

const CalendarPage = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile on client side
  React.useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { data: salesData, isLoading, isError } = useQuery({
    queryKey: ['sales-calendar'],
    queryFn: async () => {
      try {
        const response = await api.get(`/feed?status=PUBLISHED&limit=100`);
        return response.data.sales || [];
      } catch (err: any) {
        console.error('Error fetching sales for calendar:', err);
        return [];
      }
    },
  });

  const sales = (salesData as Sale[]) || [];

  // Build a map of date -> sales for efficient lookup
  const salesByDate = useMemo(() => {
    const map = new Map<string, Sale[]>();
    sales.forEach((sale) => {
      try {
        const startDate = parseISO(sale.startDate);
        const endDate = parseISO(sale.endDate);

        // Add sale to each day it spans
        const currentDay = new Date(startDate);
        while (currentDay <= endDate) {
          const dateKey = format(currentDay, 'yyyy-MM-dd');
          if (!map.has(dateKey)) {
            map.set(dateKey, []);
          }
          map.get(dateKey)!.push(sale);
          currentDay.setDate(currentDay.getDate() + 1);
        }
      } catch {
        // Skip sales with invalid dates
      }
    });
    return map;
  }, [sales]);

  // Get calendar grid for current month
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Add padding days from previous/next months
  const firstDay = calendarDays[0];
  const lastDay = calendarDays[calendarDays.length - 1];
  const daysOfWeek = firstDay.getDay();
  const paddingStart = Array.from({ length: daysOfWeek }, (_, i) => {
    const date = new Date(firstDay);
    date.setDate(date.getDate() - (daysOfWeek - i));
    return date;
  });
  const daysAfterLast = 6 - lastDay.getDay();
  const paddingEnd = Array.from({ length: daysAfterLast }, (_, i) => {
    const date = new Date(lastDay);
    date.setDate(date.getDate() + (i + 1));
    return date;
  });

  const gridDays = [...paddingStart, ...calendarDays, ...paddingEnd];

  // Mobile: grouped list by date
  const mobileListDays = useMemo(() => {
    return calendarDays
      .filter((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        return salesByDate.has(dateKey) && (salesByDate.get(dateKey) || []).length > 0;
      })
      .map((day) => ({
        date: day,
        sales: salesByDate.get(format(day, 'yyyy-MM-dd')) || [],
      }));
  }, [calendarDays, salesByDate]);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>Sale Calendar - FindA.Sale</title>
        <meta name="description" content="Browse upcoming estate sales on our interactive calendar" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-amber-600 mb-2">Sale Calendar</h1>
          <p className="text-lg text-warm-700">Browse upcoming estate sales month by month</p>
        </div>

        {/* Month Navigation */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={handlePrevMonth}
              className="px-4 py-2 border border-warm-300 rounded-lg hover:bg-warm-100 transition text-warm-900 font-medium"
              aria-label="Previous month"
            >
              ← Prev
            </button>
            <h2 className="text-2xl md:text-3xl font-bold text-warm-900">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
            <button
              onClick={handleNextMonth}
              className="px-4 py-2 border border-warm-300 rounded-lg hover:bg-warm-100 transition text-warm-900 font-medium"
              aria-label="Next month"
            >
              Next →
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : isError || !sales || sales.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-warm-600">No sales found. Try adjusting your dates.</p>
            </div>
          ) : isMobile ? (
            // Mobile: Vertical list grouped by date
            <div className="space-y-4">
              {mobileListDays.length === 0 ? (
                <p className="text-center text-warm-600 py-6">No sales this month</p>
              ) : (
                mobileListDays.map(({ date, sales: daySales }) => (
                  <div key={format(date, 'yyyy-MM-dd')} className="border border-warm-200 rounded-lg p-4">
                    <h3 className="font-bold text-warm-900 mb-3">
                      {format(date, 'EEEE, MMMM d, yyyy')}
                    </h3>
                    <div className="space-y-2">
                      {daySales.map((sale) => (
                        <div key={sale.id} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <Link
                            href={`/sales/${sale.id}`}
                            className="block hover:text-amber-700 transition"
                          >
                            <p className="font-semibold text-amber-900 line-clamp-1">{sale.title}</p>
                            <p className="text-sm text-amber-700">{sale.city}, {sale.state}</p>
                          </Link>
                          <div className="mt-2 pt-2 border-t border-amber-200">
                            <RemindMeButton saleId={sale.id} saleName={sale.title} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            // Desktop: Calendar grid
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-0 mb-2 text-center">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="py-2 font-bold text-warm-700 text-sm">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-px bg-warm-200 rounded-lg overflow-hidden border border-warm-300">
                {gridDays.map((day, idx) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const daySales = salesByDate.get(dateKey) || [];
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={idx}
                      className={`min-h-24 p-2 ${
                        isCurrentMonth
                          ? 'bg-white'
                          : 'bg-warm-50'
                      } ${isToday ? 'border-2 border-amber-600' : ''}`}
                    >
                      <div className={`text-sm font-semibold mb-2 ${
                        isCurrentMonth
                          ? isToday ? 'text-amber-600' : 'text-warm-900'
                          : 'text-warm-400'
                      }`}>
                        {format(day, 'd')}
                      </div>
                      <div className="space-y-1">
                        {daySales.slice(0, 1).map((sale) => (
                          <div key={sale.id} className="bg-amber-50 rounded p-1.5 border border-amber-200">
                            <Link
                              href={`/sales/${sale.id}`}
                              className="block text-xs text-amber-900 hover:text-amber-700 transition font-medium line-clamp-1"
                              title={sale.title}
                            >
                              {sale.title}
                            </Link>
                            <div className="mt-1">
                              <RemindMeButton saleId={sale.id} saleName={sale.title} />
                            </div>
                          </div>
                        ))}
                        {daySales.length > 1 && (
                          <div className="text-xs text-amber-700 px-1.5 py-0.5 font-medium">
                            +{daySales.length - 1} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-warm-500 mt-4 text-center">
                Showing {sales.length} sales this month
              </p>
            </>
          )}
        </div>

        {/* Info section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-warm-900 mb-4">How to use this calendar</h2>
          <ul className="space-y-2 text-warm-700">
            <li className="flex gap-2">
              <span className="text-amber-600">•</span>
              <span>Click on any sale title to view full details</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-600">•</span>
              <span>Dates are highlighted when sales are running</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-600">•</span>
              <span>On mobile, sales are grouped by date</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-600">•</span>
              <span>Multi-day sales appear on each day they run</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
};

export default CalendarPage;
