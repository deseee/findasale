import React, { useMemo, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import TierGate from '../../components/TierGate';

interface Sale {
  id: string;
  title: string;
  saleType: string;
  startDate: string;
  endDate: string;
  status: string;
  qrScanCount: number;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  PUBLISHED: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-900 dark:text-green-200',
    badge: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
  },
  UPCOMING: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-900 dark:text-amber-200',
    badge: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200',
  },
  DRAFT: {
    bg: 'bg-gray-50 dark:bg-gray-800',
    border: 'border-gray-300 dark:border-gray-600',
    text: 'text-gray-900 dark:text-gray-300',
    badge: 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
  },
  ENDED: {
    bg: 'bg-gray-50 dark:bg-gray-800',
    border: 'border-gray-300 dark:border-gray-600',
    text: 'text-gray-600 dark:text-gray-400',
    badge: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-400',
  },
};

export default function OrganizerCalendarPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());

  // Redirect if not authorized — must be in useEffect, not early return, to preserve hooks order (React #310 fix)
  useEffect(() => {
    if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Fetch organizer's sales
  const { data: salesData, isLoading, isError } = useQuery<Sale[]>({
    queryKey: ['organizer-calendar-sales'],
    queryFn: async () => {
      const res = await api.get('/organizers/me/sales');
      return res.data;
    },
    enabled: !!user?.id,
  });

  const sales = salesData || [];

  // Calendar logic
  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const monthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build calendar grid
  const days = useMemo(() => {
    const totalDays = daysInMonth(currentDate);
    const firstDay = firstDayOfMonth(currentDate);
    const calendarDays = Array(firstDay).fill(null);

    for (let i = 1; i <= totalDays; i++) {
      calendarDays.push(i);
    }

    return calendarDays;
  }, [currentDate]);

  // Get sales for a specific day
  const getSalesForDay = (dayNum: number) => {
    if (!dayNum) return [];
    const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
    return sales.filter(sale => {
      const startDate = new Date(sale.startDate);
      const endDate = new Date(sale.endDate);
      return dayDate >= startDate && dayDate <= endDate;
    });
  };

  // Upcoming sales (next 5)
  const upcomingSales = useMemo(() => {
    const now = new Date();
    return sales
      .filter(s => new Date(s.startDate) >= now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 5);
  }, [sales]);

  // Gate render after all hooks (redirect handled by useEffect above)
  if (authLoading || !user || !user.roles?.includes('ORGANIZER')) {
    return null;
  }

  // Navigation handlers
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleSaleClick = (saleId: string) => {
    router.push(`/organizer/sales/${saleId}`);
  };

  const pageContent = (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header with breadcrumb */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/organizer/dashboard" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400 text-sm">
            ← Dashboard
          </Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Calendar</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Calendar section */}
          <div className="lg:col-span-2">
            {/* Month header with navigation */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{monthYear}</h2>
                <div className="flex gap-2">
                  <button
                    onClick={goToPreviousMonth}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={goToToday}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                  >
                    Today
                  </button>
                  <button
                    onClick={goToNextMonth}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                  >
                    Next →
                  </button>
                </div>
              </div>

              {/* Loading state */}
              {isLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600 dark:border-amber-400"></div>
                  <p className="mt-4 text-gray-600 dark:text-gray-400 text-sm">Loading your sales…</p>
                </div>
              )}

              {/* Error state */}
              {isError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
                  <p className="text-red-800 dark:text-red-200 text-sm">
                    Unable to load your sales. Please try again.
                  </p>
                </div>
              )}

              {/* Calendar grid */}
              {!isLoading && !isError && (
                <div>
                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-2 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="text-center font-semibold text-gray-600 dark:text-gray-400 text-sm py-2">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar days */}
                  <div className="grid grid-cols-7 gap-2">
                    {days.map((dayNum, idx) => {
                      const daysSales = dayNum ? getSalesForDay(dayNum) : [];
                      const isToday =
                        dayNum &&
                        new Date().getDate() === dayNum &&
                        new Date().getMonth() === currentDate.getMonth() &&
                        new Date().getFullYear() === currentDate.getFullYear();

                      return (
                        <div
                          key={idx}
                          className={`min-h-24 p-2 rounded-lg border ${
                            dayNum
                              ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-amber-400 dark:hover:border-amber-600 transition cursor-pointer'
                              : 'bg-transparent border-transparent'
                          } ${isToday ? 'ring-2 ring-amber-400 dark:ring-amber-600' : ''}`}
                        >
                          {dayNum && (
                            <>
                              <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {dayNum}
                              </div>
                              <div className="space-y-1">
                                {daysSales.slice(0, 2).map(sale => {
                                  const colors = STATUS_COLORS[sale.status] || STATUS_COLORS.DRAFT;
                                  return (
                                    <button
                                      key={sale.id}
                                      onClick={() => handleSaleClick(sale.id)}
                                      className={`block w-full text-left p-1 rounded text-xs font-medium truncate ${colors.bg} ${colors.text} hover:opacity-80 transition`}
                                      title={sale.title}
                                    >
                                      {sale.title}
                                    </button>
                                  );
                                })}
                                {daysSales.length > 2 && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 px-1">
                                    +{daysSales.length - 2} more
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Upcoming sales section */}
            {!isLoading && !isError && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
                  Upcoming Sales
                </h3>

                {upcomingSales.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No upcoming sales scheduled.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {upcomingSales.map(sale => {
                      const colors = STATUS_COLORS[sale.status] || STATUS_COLORS.DRAFT;
                      const startDate = new Date(sale.startDate);
                      const endDate = new Date(sale.endDate);

                      return (
                        <button
                          key={sale.id}
                          onClick={() => handleSaleClick(sale.id)}
                          className="block w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-amber-400 dark:hover:border-amber-600 hover:shadow-md dark:hover:shadow-gray-900/30 transition"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate flex-1">
                              {sale.title}
                            </h4>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${colors.badge}`}>
                              {sale.status}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                            <p>
                              <span className="font-medium">Type:</span> {sale.saleType || 'ESTATE'}
                            </p>
                            <p>
                              <span className="font-medium">Dates:</span> {startDate.toLocaleDateString()} – {endDate.toLocaleDateString()}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Team schedules placeholder */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-blue-600 dark:text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    Team Schedules
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Coordinate team member work shifts and assignments.
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-2">
                    Coming soon
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>Calendar - FindA.Sale</title>
        <meta name="description" content="View and manage your sales calendar" />
      </Head>

      <TierGate
        requiredTier="TEAMS"
        featureName="Sales Calendar"
        description="Plan and coordinate your sales with calendar view and team scheduling. Available on TEAMS plans and above."
      >
        {pageContent}
      </TierGate>
    </>
  );
}
