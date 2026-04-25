import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Calendar, TrendingUp, Zap, Heart } from 'lucide-react';
import { useAuth } from './AuthContext';
import useUnreadMessages from '../hooks/useUnreadMessages';
import QRScannerButton from './qr-scanner/QRScannerButton';

/**
 * BottomTabNav — Phase 25 mobile bottom navigation
 * 5 primary tabs: Map, Calendar, Wishlist, Messages, Profile/Dashboard
 * Hidden on desktop (md+). Fixed to bottom with safe-area padding.
 */

// SVG icon components — inline to avoid dependency

const MapIcon = ({ active }: { active: boolean }) => (
  <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5}
      d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5}
      d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
    />
  </svg>
);

const HeartIcon = ({ active }: { active: boolean }) => (
  <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5}
      d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
    />
  </svg>
);

const ProfileIcon = ({ active }: { active: boolean }) => (
  <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5}
      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
    />
  </svg>
);

const MessagesIcon = ({ active }: { active: boolean }) => (
  <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />
  </svg>
);

type Tab = {
  href: string;
  label: string;
  icon: React.FC<{ active: boolean }>;
  matchPaths: string[];
};

const BottomTabNav = () => {
  const router = useRouter();
  const { user } = useAuth();
  const isOrganizer = user?.roles?.includes('ORGANIZER');
  const { data: unreadData } = useUnreadMessages(!!user);
  const [exploreSheetOpen, setExploreSheetOpen] = useState(false);

  // Profile tab destination and label depend on user role
  const profileHref = isOrganizer
    ? '/organizer/dashboard'
    : user
      ? '/shopper/dashboard'
      : '/login';
  const profileLabel = isOrganizer ? 'Dashboard' : 'Profile';

  const TrendingIcon = ({ active }: { active: boolean }) => (
    <TrendingUp className="w-6 h-6" fill={active ? 'currentColor' : 'none'} />
  );

  const ExploreIcon = ({ active }: { active: boolean }) => (
    <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5}
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
      />
    </svg>
  );

  type TabExtended = Tab & { onClick?: () => void };

  const tabs: TabExtended[] = [
    {
      href: '/map',
      label: 'Map',
      icon: MapIcon,
      matchPaths: ['/map'],
    },
    {
      href: '/trending',
      label: 'Trending',
      icon: TrendingIcon,
      matchPaths: ['/trending'],
    },
    {
      href: '#',
      label: 'Explore',
      icon: ExploreIcon,
      matchPaths: ['/feed', '/calendar', '/shopper/wishlist', '/trending'],
      onClick: () => setExploreSheetOpen(true),
    },
    {
      href: '/messages',
      label: 'Messages',
      icon: MessagesIcon,
      matchPaths: ['/messages'],
    },
    {
      href: profileHref,
      label: profileLabel,
      icon: ProfileIcon,
      matchPaths: ['/organizer', '/shopper', '/profile', '/login', '/register'],
    },
  ];

  // QRScannerButton rendered separately — not in tabs array
  // Current 5 tabs already fill mobile space; adding scanner as 6th tab would crowd UI
  // Scanner mounts directly in the nav flex row below instead

  const isActive = (tab: TabExtended) => {
    return tab.matchPaths.some((path) => {
      if (path === '/') return router.pathname === '/';
      return router.pathname.startsWith(path);
    });
  };

  // Check if QR scanner should be shown (not on auth pages or organizer routes)
  const shouldShowScanner = !['/login', '/register', '/forgot-password'].includes(router.pathname) && !router.pathname.startsWith('/organizer');

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-warm-200 dark:border-gray-700 shadow-nav pb-safe"
        aria-label="Bottom navigation"
      >
        <div className="flex items-center justify-around h-14">
          {tabs.map((tab) => {
            const active = isActive(tab);
            const Icon = tab.icon;

            if (tab.onClick) {
              // Explore button (not a link)
              return (
                <button
                  key={tab.label}
                  onClick={tab.onClick}
                  className={`flex flex-col items-center justify-center flex-1 h-full min-w-touch transition-colors duration-150 ${
                    active
                      ? 'text-amber-600'
                      : 'text-warm-500 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-100'
                  }`}
                  aria-label={tab.label}
                >
                  <div className="relative">
                    <Icon active={active} />
                  </div>
                  <span className="text-[10px] mt-0.5 font-medium leading-none" aria-hidden="true">
                    {tab.label}
                  </span>
                </button>
              );
            }

            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={`flex flex-col items-center justify-center flex-1 h-full min-w-touch transition-colors duration-150 ${
                  active
                    ? 'text-amber-600'
                    : 'text-warm-500 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-100'
                }`}
                aria-label={tab.label}
                aria-current={active ? 'page' : undefined}
              >
                <div className="relative">
                  <Icon active={active} />
                  {tab.label === 'Messages' && unreadData && unreadData.unread > 0 && (
                    <span className="absolute -top-1.5 -right-2 w-4 h-4 rounded-full bg-amber-600 text-white text-[9px] font-bold flex items-center justify-center leading-none" aria-hidden="true">
                      {unreadData.unread > 9 ? '9+' : unreadData.unread}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-0.5 font-medium leading-none" aria-hidden="true">
                  {tab.label}
                </span>
              </Link>
            );
          })}

          {/* QR Scanner button — Note: BottomTabNav currently has 5 tabs at mobile viewport capacity.
              The scanner is mounted here conditionally, but 6 items in the nav bar will slightly compress labels.
              Patrick may want to replace one existing tab with the scanner instead. */}
          {shouldShowScanner && (
            <QRScannerButton variant="tab" />
          )}
        </div>
      </nav>

      {/* Explore bottom sheet */}
      {exploreSheetOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50 md:hidden" onClick={() => setExploreSheetOpen(false)} />
          <div className="fixed bottom-14 left-0 right-0 bg-white dark:bg-gray-900 border-t border-warm-200 dark:border-gray-700 rounded-t-xl z-50 pb-safe md:hidden">
            <div className="p-4">
              <h3 className="text-xs font-semibold text-warm-500 dark:text-gray-400 uppercase tracking-wide mb-3">Explore</h3>
              <div className="grid grid-cols-3 gap-3">
                <Link href="/feed" onClick={() => setExploreSheetOpen(false)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-warm-50 dark:bg-gray-800 text-warm-900 dark:text-warm-100">
                  <Zap size={20} className="text-amber-500" />
                  <span className="text-xs font-medium">Feed</span>
                </Link>
                <Link href="/calendar" onClick={() => setExploreSheetOpen(false)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-warm-50 dark:bg-gray-800 text-warm-900 dark:text-warm-100">
                  <Calendar size={20} className="text-amber-500" />
                  <span className="text-xs font-medium">Calendar</span>
                </Link>
                <Link href="/shopper/wishlist" onClick={() => setExploreSheetOpen(false)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-warm-50 dark:bg-gray-800 text-warm-900 dark:text-warm-100">
                  <Heart size={20} className="text-rose-500" />
                  <span className="text-xs font-medium">Wishlist</span>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default BottomTabNav;
