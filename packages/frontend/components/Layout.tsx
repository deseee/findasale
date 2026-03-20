import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from './AuthContext';
import { useOrganizerTier } from '../hooks/useOrganizerTier';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { SectionHeader, TierGatedNavLink } from './TierGatedNav';
import BottomTabNav from './BottomTabNav';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle'; // #63: Dark Mode
import OfflineIndicator from './OfflineIndicator'; // Feature #69: Local-First Offline Mode

const Layout = ({ children }: { children: React.ReactNode }) => {
  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'your area';

  const router = useRouter();
  const { user, logout } = useAuth();
  const { canAccess } = useOrganizerTier();
  const { isLowBandwidth } = useNetworkQuality();
  const [isClient, setIsClient] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [router.pathname]);

  // Trap focus and lock scroll when drawer is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
      drawerRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleHeaderSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (headerSearch.trim()) {
      router.push(`/?q=${encodeURIComponent(headerSearch.trim())}`);
    }
  };

  const staticNavLinks = [
    { href: '/', label: 'Home' },
    { href: '/trending', label: 'Trending' },
    { href: '/about', label: 'About' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/contact', label: 'Contact' },
  ];

  const authLinks = isClient ? (
    user ? (
      <>
        <span className="block px-3 py-2 text-sm text-warm-500 truncate">
          Hi, {user.name || user.email}
        </span>
        {user.role === 'ORGANIZER' && (
          <>
            <SectionHeader label="Primary" />
            <Link href="/organizer/dashboard" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Dashboard
            </Link>
            <Link href="/plan" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Plan a Sale
            </Link>
            <Link href="/organizer/premium" className="block px-3 py-2 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              {canAccess('TEAMS') ? 'Subscription' : canAccess('PRO') ? 'Upgrade to TEAMS' : 'Upgrade to PRO'}
            </Link>
            <TierGatedNavLink href="/organizer/insights" label="Insights" requiredTier="PRO" />
            <TierGatedNavLink href="/organizer/workspace" label="Workspace" requiredTier="TEAMS" />

            <SectionHeader label="Pro Tools" />
            <TierGatedNavLink href="/organizer/command-center" label="Command Center" requiredTier="PRO" />
            <TierGatedNavLink href="/organizer/typology" label="Typology Classifier" requiredTier="PRO" />
            <TierGatedNavLink href="/organizer/fraud-signals" label="Fraud Signals" requiredTier="PRO" />
            <TierGatedNavLink href="/organizer/offline" label="Offline Mode" requiredTier="PRO" />
            <TierGatedNavLink href="/organizer/appraisals" label="Appraisals" requiredTier="PRO" />

            <SectionHeader label="Organizer Tools" />
            <Link href="/organizer/bounties" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Bounties
            </Link>
            <Link href="/organizer/message-templates" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Message Templates
            </Link>
            <Link href="/organizer/reputation" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Reputation
            </Link>
            <Link href="/organizer/ugc-moderation" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              UGC Moderation
            </Link>
          </>
        )}
        {(user.role === 'USER' || user.role === 'ADMIN') && (
          <>
            <Link href="/shopper/dashboard" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              My Profile
            </Link>
            <Link href="/wishlists" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              My Wishlists
            </Link>
            <Link href="/referral-dashboard" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Referrals
            </Link>
            <hr className="my-2 border-warm-200 dark:border-gray-700" />
            <span className="block px-3 py-1 text-xs font-semibold text-warm-600 dark:text-warm-300 uppercase">My Collection</span>
            <Link href="/shopper/collector-passport" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Collection
            </Link>
            <Link href="/shopper/alerts" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Wishlist Alerts
            </Link>
            <Link href="/shopper/trails" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Treasure Trails
            </Link>
            <Link href="/shopper/loot-log" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Loot Log
            </Link>
            <Link href="/shopper/loyalty" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Loyalty
            </Link>
            <Link href="/shopper/receipts" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Receipts
            </Link>
            <Link href="/challenges" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Challenges
            </Link>
            <Link href="/feed" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Live Sale Feed
            </Link>
            <Link href="/encyclopedia" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Encyclopedia
            </Link>
            <hr className="my-2 border-warm-200 dark:border-gray-700" />
            <Link href="/shopper/settings" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              Settings
            </Link>
          </>
        )}
        {user.role === 'ADMIN' && (
          <Link href="/admin" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md font-medium bg-amber-50 dark:bg-amber-900/20">
            Admin Panel
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="block w-full text-left px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md"
        >
          Logout
        </button>
      </>
    ) : (
      <>
        <Link href="/login" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
          Login
        </Link>
        <Link href="/register" className="block px-3 py-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white rounded-md font-medium text-center">
          Register
        </Link>
      </>
    )
  ) : (
    <>
      <Link href="/login" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
        Login
      </Link>
      <Link href="/register" className="block px-3 py-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white rounded-md font-medium text-center">
        Register
      </Link>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <OfflineIndicator /> {/* Feature #69: Local-First Offline Mode */}
      {/* Skip to main content — keyboard/screen reader accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-600 focus:text-white focus:rounded-md focus:font-medium"
      >
        Skip to main content
      </a>

      {/* ── HEADER ── fixed, 48px mobile / 64px desktop */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 shadow-header dark:shadow-gray-800/50">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-12 md:h-16">
            <Link href="/" className="text-xl md:text-2xl font-bold text-amber-600 font-heading flex-shrink-0">
              FindA.Sale
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center space-x-4" aria-label="Main navigation">
              {/* Show Explore/Browse for all users, Map for all users */}
              {isClient && user && (user.role === 'USER' || user.role === 'ADMIN') && (
                <>
                  <Link href="/" className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400">Explore</Link>
                  <Link href="/map" className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400">Map</Link>
                </>
              )}
              {/* Static nav links for all users */}
              {staticNavLinks.map(({ href, label }) => (
                <Link key={href} href={href} className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400">{label}</Link>
              ))}
            </nav>

            {/* Desktop right-side nav (Saved, Messages, Profile + Auth) */}
            <div className="hidden md:flex items-center space-x-4">
              {!isClient ? (
                <>
                  <Link href="/login" className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400">Login</Link>
                  <Link href="/register" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md">Register</Link>
                </>
              ) : user ? (
                <>
                  <Link href="/shopper/dashboard#favorites" className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400" title="Saved sales">
                    <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                  </Link>
                  <Link href="/messages" className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400" title="Messages">
                    <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </Link>
                  <div className="border-l border-warm-300 dark:border-gray-700 pl-4 flex items-center gap-2">
                    <span className="text-warm-900 dark:text-warm-100 text-sm">Hi, {user.name || user.email}</span>
                    <NotificationBell />
                    {isLowBandwidth && (
                      <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700" title="Low-Bandwidth Mode enabled — photos optimized for slow connections">
                        Low BW
                      </span>
                    )}
                    <button onClick={handleLogout} className="text-warm-900 dark:text-warm-300 hover:text-amber-600">Logout</button>
                  </div>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400">Login</Link>
                  <Link href="/register" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md">Register</Link>
                </>
              )}
            </div>

            {/* Mobile: notification bell (if logged in) + theme toggle + hamburger */}
            <div className="md:hidden flex items-center gap-1">
              {isClient && user && <NotificationBell />}
              <ThemeToggle compact={true} />
              <button
                className="p-2 rounded-md text-warm-500 dark:text-warm-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-200 dark:hover:bg-warm-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                aria-controls="mobile-drawer"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              >
                {menuOpen ? (
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── MOBILE PERSISTENT SEARCH BAR ── fixed below header, mobile only */}
      <div className="md:hidden fixed top-12 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700 px-3 py-1.5">
        <form onSubmit={handleHeaderSearch} role="search" aria-label="Search sales">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none" aria-hidden="true">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="search"
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              placeholder="Search sales &amp; items…"
              aria-label="Search sales and items"
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-warm-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-warm-50 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
            />
          </div>
        </form>
      </div>

      {/* ── MOBILE DRAWER BACKDROP ── */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* ── MOBILE SLIDE-IN DRAWER ── right side, full height */}
      <div
        id="mobile-drawer"
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`md:hidden fixed top-0 right-0 bottom-0 z-50 w-72 bg-white dark:bg-gray-900 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-warm-200 dark:border-gray-700">
          <span className="font-bold text-amber-600 font-heading text-lg">FindA.Sale</span>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="p-2 rounded-md text-warm-500 dark:text-warm-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-warm-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer nav links */}
        <nav className="flex-1 overflow-y-auto px-4 py-3 space-y-1" aria-label="Mobile menu">
          {staticNavLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                router.pathname === href
                  ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600'
                  : 'text-warm-900 dark:text-gray-200 hover:text-amber-600 hover:bg-warm-100 dark:hover:bg-gray-800'
              }`}
            >
              {label}
            </Link>
          ))}
          <div className="border-t border-warm-200 pt-3 mt-2 space-y-1" role="navigation" aria-label="Authenticated navigation">
            {isClient && user?.role === 'ORGANIZER' ? (
              <>
                {/* Primary organizer links */}
                <Link href="/organizer/dashboard" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  Dashboard
                </Link>
                <Link href="/plan" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  Plan a Sale
                </Link>
                <Link href="/organizer/premium" className="block px-3 py-2 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  {canAccess('TEAMS') ? 'Subscription' : canAccess('PRO') ? 'Upgrade to TEAMS' : 'Upgrade to PRO'}
                </Link>
                {canAccess('PRO') && (
                  <Link href="/organizer/insights" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                    Insights
                  </Link>
                )}
                {canAccess('TEAMS') && (
                  <Link href="/organizer/workspace" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                    Workspace
                  </Link>
                )}

                {/* Organizer Tools Section */}
                <SectionHeader label="Organizer Tools" />
                <Link href="/organizer/bounties" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  Bounties
                </Link>
                <Link href="/organizer/message-templates" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  Message Templates
                </Link>
                <Link href="/organizer/reputation" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  Reputation
                </Link>
                <Link href="/organizer/ugc-moderation" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  UGC Moderation
                </Link>
                <Link href="/organizer/performance" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  Performance
                </Link>

                {/* Pro Tools Section */}
                {canAccess('PRO') && (
                  <>
                    <SectionHeader label="Pro Tools" />
                    <Link href="/organizer/command-center" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      Command Center
                    </Link>
                    <Link href="/organizer/typology" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      Typology Classifier
                    </Link>
                    <Link href="/organizer/fraud-signals" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      Fraud Signals
                    </Link>
                    <Link href="/organizer/offline" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      Offline Mode
                    </Link>
                    <Link href="/organizer/appraisals" className="block px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      Appraisals
                    </Link>
                  </>
                )}
              </>
            ) : (
              authLinks
            )}
          </div>
        </nav>
      </div>

      {/* Main Content
          Mobile: pt accounts for fixed header (48px) + fixed search bar (~44px) = 92px
          Desktop: pt-16 for fixed header (64px)
      */}
      <main
        id="main-content"
        className="flex-grow pt-[92px] md:pt-16 pb-15 md:pb-0"
        tabIndex={-1}
      >
        {children}
      </main>

      {/* Bottom tab navigation — mobile only */}
      <BottomTabNav />

      {/* Footer */}
      <footer className="bg-warm-800 dark:bg-gray-950 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-bold mb-4">FindA.Sale</h3>
              <p className="text-warm-400 mb-4">
                Helping you find the best local estate sales and auctions near you.
              </p>
              <div className="bg-warm-700 rounded-lg p-4">
                <p className="text-xs text-warm-300 font-semibold mb-2">Need Help?</p>
                <a
                  href="mailto:support@finda.sale"
                  className="text-amber-300 hover:text-amber-200 font-medium block"
                >
                  support@finda.sale
                </a>
                <p className="text-xs text-warm-400 mt-2">We&apos;re here to help organizers and shoppers</p>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-4">Links</h3>
              <ul className="space-y-2">
                <li><Link href="/" className="text-warm-400 hover:text-white">Home</Link></li>
                <li><Link href="/about" className="text-warm-400 hover:text-white">About</Link></li>
                <li><Link href="/leaderboard" className="text-warm-400 hover:text-white">Leaderboard</Link></li>
                <li><Link href="/contact" className="text-warm-400 hover:text-white">Contact</Link></li>
                <li><Link href="/faq" className="text-warm-400 hover:text-white">FAQ</Link></li>
                {isClient && user?.role === 'ORGANIZER' && (
                  <>
                    <li><Link href="/organizer/dashboard" className="text-warm-400 hover:text-white">Dashboard</Link></li>
                    <li><Link href="/organizer/create-sale" className="text-warm-400 hover:text-white">Create Sale</Link></li>
                    <li><Link href="/guide" className="text-warm-400 hover:text-white">Organizer Guide</Link></li>
                  </>
                )}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-4">Legal</h3>
              <ul className="space-y-2">
                <li><Link href="/terms" className="text-warm-400 hover:text-white">Terms of Service</Link></li>
                <li><Link href="/privacy" className="text-warm-400 hover:text-white">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-warm-700 mt-8 pt-6 text-center text-warm-400">
            <p>&copy; {new Date().getFullYear()} FindA.Sale. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
