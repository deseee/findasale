'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthContext';
import { useOrganizerTier } from '../hooks/useOrganizerTier';
import { useRouter } from 'next/router';
import { ChevronRight } from 'lucide-react';
import { SectionHeader, TierGatedNavLink } from './TierGatedNav';

const AvatarDropdown: React.FC = () => {
  const { user, logout } = useAuth();
  const { canAccess } = useOrganizerTier();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [orgToolsOpen, setOrgToolsOpen] = useState(false);
  const [proToolsOpen, setProToolsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        triggerRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on route change
  useEffect(() => {
    setIsOpen(false);
  }, [router.pathname]);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    router.push('/login');
    setIsOpen(false);
  };

  // Generate initials from name or email
  const getInitials = () => {
    if (user.name) {
      return user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return user.email[0].toUpperCase();
  };

  const isOrganizer = user.roles?.includes('ORGANIZER');
  const isUser = user.roles?.includes('USER');
  const isAdmin = user.roles?.includes('ADMIN');

  return (
    <div className="relative">
      {/* Avatar Button Trigger */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-full hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`User menu for ${user.name || user.email}`}
      >
        {/* Avatar Circle — initials only (no profile photo field on User model yet) */}
        <div className="w-8 h-8 rounded-full bg-amber-500 dark:bg-amber-600 flex items-center justify-center text-xs font-bold text-white select-none">
          {getInitials()}
        </div>

        {/* User name label (hidden on very small screens) */}
        <span className="text-sm font-medium text-warm-900 dark:text-warm-100 hidden sm:inline max-w-[120px] truncate">
          {user.name || user.email.split('@')[0]}
        </span>

        {/* Dropdown arrow */}
        <svg
          className={`w-4 h-4 text-warm-600 dark:text-warm-300 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:shadow-xl border border-warm-200 dark:border-gray-700 z-50 py-2"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu"
        >
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-warm-200 dark:border-gray-700">
            <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 truncate">
              {user.name || user.email}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user.email}
            </p>
          </div>

          {/* ADMIN Menu Items */}
          {isAdmin && (
            <>
              <Link
                href="/admin"
                className="block px-4 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Admin Panel
              </Link>
              <hr className="my-2 border-warm-200 dark:border-gray-700" />
            </>
          )}

          {/* ORGANIZER Menu Items */}
          {isOrganizer && (
            <>
              <Link
                href="/organizer/dashboard"
                className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Organizer Dashboard
              </Link>
              <Link
                href="/profile"
                className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Organizer Profile
              </Link>
              <Link
                href="/plan"
                className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Plan a Sale
              </Link>
              <Link
                href="/organizer/payouts"
                className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Payouts
              </Link>

              {canAccess('PRO') && (
                <Link
                  href="/organizer/insights"
                  className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Insights
                </Link>
              )}

              {canAccess('TEAMS') && (
                <Link
                  href="/organizer/workspace"
                  className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Workspace
                </Link>
              )}

              <Link
                href="/organizer/subscription"
                className="block px-4 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                {canAccess('TEAMS')
                  ? 'Subscription'
                  : canAccess('PRO')
                    ? 'Upgrade to TEAMS'
                    : 'Upgrade to PRO'}
              </Link>

              {/* Organizer Tools Section — Collapsible */}
              <button
                onClick={() => setOrgToolsOpen(!orgToolsOpen)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
              >
                Organizer Tools
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${orgToolsOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {orgToolsOpen && (
                <>
                  <Link
                    href="/organizer/bounties"
                    className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    Bounties
                  </Link>
                  <Link
                    href="/organizer/message-templates"
                    className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    Message Templates
                  </Link>
                  <Link
                    href="/organizer/reputation"
                    className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    Reputation
                  </Link>
                  <Link
                    href="/organizer/ugc-moderation"
                    className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    UGC Moderation
                  </Link>
                  <Link
                    href="/organizer/performance"
                    className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    Performance
                  </Link>
                </>
              )}

              {/* Pro Tools Section — Collapsible */}
              <button
                onClick={() => setProToolsOpen(!proToolsOpen)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
              >
                Pro Tools
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${proToolsOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {proToolsOpen && (
                <>
                  <TierGatedNavLink href="/organizer/command-center" label="Command Center" requiredTier="PRO" />
                  <TierGatedNavLink href="/organizer/typology" label="Typology Classifier" requiredTier="PRO" />
                  <TierGatedNavLink href="/organizer/fraud-signals" label="Fraud Signals" requiredTier="PRO" />
                  <TierGatedNavLink href="/organizer/offline" label="Offline Mode" requiredTier="PRO" />
                  <TierGatedNavLink href="/organizer/appraisals" label="Appraisals" requiredTier="PRO" />
                  <TierGatedNavLink href="/organizer/ripples" label="Sale Ripples" requiredTier="PRO" />
                  <TierGatedNavLink href="/organizer/item-library" label="Item Library" requiredTier="PRO" />
                </>
              )}

              <hr className="my-2 border-warm-200 dark:border-gray-700" />
            </>
          )}

          {/* USER/SHOPPER Menu Items */}
          {isUser && (
            <>
              <Link
                href="/shopper/dashboard"
                className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Shopper Dashboard
              </Link>
              <Link
                href="/profile"
                className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                My Profile
              </Link>
              <Link
                href="/shopper/wishlist"
                className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                My Saves
              </Link>

              <hr className="my-2 border-warm-200 dark:border-gray-700" />
            </>
          )}

          {/* About / Leaderboard / Contact */}
          <hr className="my-2 border-warm-200 dark:border-gray-700" />
          <Link
            href="/about"
            className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            About
          </Link>
          <Link
            href="/leaderboard"
            className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            Leaderboard
          </Link>
          <Link
            href="/contact"
            className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            Contact
          </Link>

          {/* Common Menu Items */}
          <hr className="my-2 border-warm-200 dark:border-gray-700" />
          <Link
            href="/settings"
            className="block px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            Settings
          </Link>

          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
            role="menuitem"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default AvatarDropdown;
