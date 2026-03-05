import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from './AuthContext';
import usePoints from '../hooks/usePoints';
import PointsBadge from './PointsBadge';

/**
 * BottomTabNav — Phase 25 mobile bottom navigation
 * 4 primary tabs: Browse, Map, Saved, Profile
 * Hidden on desktop (md+). Fixed to bottom with safe-area padding.
 */

// SVG icon components — inline to avoid dependency
const BrowseIcon = ({ active }: { active: boolean }) => (
  <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5}
      d={active
        ? 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z'
        : 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z'
      }
    />
  </svg>
);

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

type Tab = {
  href: string;
  label: string;
  icon: React.FC<{ active: boolean }>;
  matchPaths: string[];
};

const BottomTabNav = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { data: pointsData } = usePoints(!!user);

  // Profile tab destination depends on user role
  const profileHref = user?.role === 'ORGANIZER'
    ? '/organizer/dashboard'
    : user
      ? '/shopper/dashboard'
      : '/login';

  const tabs: Tab[] = [
    {
      href: '/',
      label: 'Browse',
      icon: BrowseIcon,
      matchPaths: ['/', '/city', '/sales/zip'],
    },
    {
      href: '/#map',
      label: 'Map',
      icon: MapIcon,
      matchPaths: ['/#map'],
    },
    {
      href: '/shopper/dashboard#favorites',
      label: 'Saved',
      icon: HeartIcon,
      matchPaths: ['/shopper/dashboard'],
    },
    {
      href: profileHref,
      label: 'Profile',
      icon: ProfileIcon,
      matchPaths: ['/organizer', '/shopper', '/profile', '/login', '/register'],
    },
  ];

  const isActive = (tab: Tab) => {
    return tab.matchPaths.some((path) => {
      if (path === '/') return router.pathname === '/';
      return router.pathname.startsWith(path);
    });
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-warm-200 shadow-nav pb-safe"
      aria-label="Bottom navigation"
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 h-full min-w-touch transition-colors duration-150 ${
                active
                  ? 'text-amber-600'
                  : 'text-warm-500 hover:text-warm-900'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <div className="relative">
                <Icon active={active} />
                {tab.label === 'Profile' && pointsData && pointsData.points > 0 && (
                  <PointsBadge
                    points={pointsData.points}
                    className="absolute -top-1.5 -right-2.5"
                  />
                )}
              </div>
              <span className="text-[10px] mt-0.5 font-medium leading-none">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomTabNav;
