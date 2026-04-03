'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthContext';
import { useOrganizerTier } from '../hooks/useOrganizerTier';
import { useRouter } from 'next/router';
import {
  ChevronRight,
  Store,
  Zap,
  List,
  PlusCircle,
  Calendar,
  Network,
  Users,
  Wrench,
  Bookmark,
  ShoppingCart,
  Printer,
  Map,
  QrCode,
  BarChart2,
  DollarSign,
  UserPlus,
  Sparkles,
  Palette,
  TrendingUp,
  Webhook,
  Tag,
  Heart,
  Star,
  Gavel,
  Clock,
  Package,
  Compass,
  Award,
  Ticket,
  Trophy,
  Target,
  Shield,
  ArrowLeftRight,
  ShieldAlert,
  LayoutDashboard,
  Search,
  MapPin,
  Lightbulb,
  MessageSquare,
  Share2,
  Camera,
  Activity,
  Scale,
  BookOpen,
  FileText,
  Image,
  Wallet,
  UserCircle,
  Settings,
  Gift,
  Mail,
  Smartphone,
} from 'lucide-react';
import { SectionHeader, TierGatedNavLink } from './TierGatedNav';
import { useShopperCart } from '../hooks/useShopperCart';
import ShopperCartDrawer from './ShopperCartDrawer';

const AvatarDropdown: React.FC = () => {
  const { user, logout } = useAuth();
  const { canAccess } = useOrganizerTier();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [orgToolsOpen, setOrgToolsOpen] = useState(false);
  const [inSaleToolsOpen, setInSaleToolsOpen] = useState(false);
  const [postSalesOpen, setPostSalesOpen] = useState(false);
  const [proToolsOpen, setProToolsOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [mobileProToolsOpen, setMobileProToolsOpen] = useState(false);
  const [myCollectionOpen, setMyCollectionOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSTooltip, setShowIOSTooltip] = useState(false);
  const [exploreConnectOpen, setExploreConnectOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
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

  // Check if app is in standalone/installed mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
    }
  }, []);

  if (!user) return null;

  const handleInstallApp = () => {
    localStorage.removeItem('findasale_install_dismissed_until');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      setShowIOSTooltip(true);
    } else {
      // Android/Chrome: reload to trigger beforeinstallprompt
      window.location.reload();
    }
  };

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
  const isTeams = canAccess('TEAMS');
  const { items: cartItems } = useShopperCart();

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
            {/* Rank badge — TODO: wire to real XP data */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">⚔️ Scout</span>
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full max-w-[120px] overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: '40%' }} />
              </div>
            </div>
          </div>

          {/* ADMIN Menu Items */}
          {isAdmin && (
            <>
              <Link
                href="/admin"
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors font-medium"
                onClick={() => setIsOpen(false)}
              >
                <LayoutDashboard size={16} className="text-red-600 dark:text-red-400" />
                <span>Admin Dashboard</span>
              </Link>
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} />
                  <span>Admin</span>
                </div>
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${adminOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {adminOpen && (
                <>
                  <Link
                    href="/admin/users"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Users size={14} className="text-red-400" />
                    <span>Manage Users</span>
                  </Link>
                  <Link
                    href="/admin/sales"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Store size={14} className="text-red-400" />
                    <span>Manage Sales</span>
                  </Link>
                  <Link
                    href="/admin/items"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Package size={14} className="text-red-400" />
                    <span>Manage Items <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/admin/reports"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <BarChart2 size={14} className="text-red-400" />
                    <span>Reports <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/admin/feature-flags"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Lightbulb size={14} className="text-red-400" />
                    <span>Feature Flags <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/admin/broadcast"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <MessageSquare size={14} className="text-red-400" />
                    <span>Broadcast Message <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                </>
              )}
              <hr className="my-2 border-warm-200 dark:border-gray-700" />
            </>
          )}

          {/* ORGANIZER Menu Items */}
          {isOrganizer && (
            <>
              <Link
                href="/organizer/dashboard"
                className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <LayoutDashboard size={16} className="text-amber-600" />
                <span>Organizer Dashboard</span>
              </Link>

              {/* Your Sales Section — Collapsible */}
              <button
                onClick={() => setOrgToolsOpen(!orgToolsOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Store size={16} />
                  <span>Your Sales</span>
                </div>
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${orgToolsOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {orgToolsOpen && (
                <>
                  <Link
                    href="/organizer/sales"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <List size={16} className="text-amber-500" />
                    <span>All Sales</span>
                  </Link>
                  <Link
                    href="/organizer/create-sale"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <PlusCircle size={16} className="text-amber-500" />
                    <span>Create Sale</span>
                  </Link>
                  <Link
                    href="/plan"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Calendar size={16} className="text-amber-500" />
                    <span>Plan a Sale</span>
                  </Link>
                  <Link
                    href="/organizer/add-items"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="Add items to any sale or your inventory"
                  >
                    <PlusCircle size={16} className="text-amber-500" />
                    <span>Add Items</span>
                  </Link>
                  <Link
                    href="/organizer/holds"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Bookmark size={16} className="text-amber-500" />
                    <span>Holds</span>
                  </Link>
                  <Link
                    href="/organizer/pos"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <ShoppingCart size={16} className="text-amber-500" />
                    <span>POS / Checkout</span>
                  </Link>
                  <Link
                    href="/organizer/ripples"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Activity size={16} className="text-amber-500" />
                    <span>Sale Ripples</span>
                  </Link>
                </>
              )}

              {/* In-Sale Tools Section — Collapsible */}
              <button
                onClick={() => setInSaleToolsOpen(!inSaleToolsOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Share2 size={16} />
                  <span>In-Sale Tools</span>
                </div>
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${inSaleToolsOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {inSaleToolsOpen && (
                <>
                  <Link
                    href="/organizer/promote"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-not-allowed"
                    onClick={() => setIsOpen(false)}
                  >
                    <Share2 size={16} className="text-amber-400" />
                    <span>Share & Promote <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/organizer/send-update"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-not-allowed"
                    onClick={() => setIsOpen(false)}
                  >
                    <MessageSquare size={16} className="text-amber-400" />
                    <span>Send Update <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/organizer/photo-ops"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-not-allowed"
                    onClick={() => setIsOpen(false)}
                  >
                    <Camera size={16} className="text-amber-400" />
                    <span>Photo Ops <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/organizer/qr-codes"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-not-allowed"
                    onClick={() => setIsOpen(false)}
                  >
                    <Tag size={16} className="text-amber-400" />
                    <span>Price Tags <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/organizer/print-kit"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Printer size={16} className="text-amber-500" />
                    <span>Print Kit</span>
                  </Link>
                </>
              )}

              {/* Post Sales Section — Collapsible */}
              <button
                onClick={() => setPostSalesOpen(!postSalesOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Activity size={16} />
                  <span>Post Sales</span>
                </div>
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${postSalesOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {postSalesOpen && (
                <>
                  <Link
                    href="/organizer/print-inventory"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Printer size={16} className="text-amber-500" />
                    <span>Print & Labels</span>
                  </Link>
                  <Link
                    href="/organizer/earnings"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <DollarSign size={16} className="text-amber-500" />
                    <span>Earnings <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/organizer/payouts"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Wallet size={16} className="text-amber-500" />
                    <span>Payouts</span>
                  </Link>
                  <Link
                    href="/organizer/ugc-moderation"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Image size={16} className="text-amber-500" />
                    <span>Manage Photos</span>
                  </Link>
                  <Link
                    href="/organizer/reputation"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Star size={16} className="text-amber-500" />
                    <span>Reputation</span>
                  </Link>
                </>
              )}

              {/* Upgrade/Subscription link — before Pro Tools */}
              <Link
                href="/organizer/subscription"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Sparkles size={16} />
                <span>{canAccess('TEAMS')
                  ? 'Subscription'
                  : canAccess('PRO')
                    ? 'Upgrade to TEAMS'
                    : 'Upgrade to PRO'}</span>
              </Link>

              {/* Pro Tools Section — Collapsible */}
              <button
                onClick={() => setProToolsOpen(!proToolsOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={16} />
                  <span>Pro Tools</span>
                </div>
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${proToolsOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {proToolsOpen && (
                <>
                  <Link
                    href="/organizer/command-center"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="Multi-sale overview dashboard — PRO"
                  >
                    <LayoutDashboard size={16} className="text-purple-400" />
                    <span>Command Center</span>
                  </Link>
                  <Link
                    href="/organizer/brand-kit"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="Custom logos, colors, and banners for your sale pages"
                  >
                    <Palette size={16} className="text-purple-400" />
                    <span>Brand Kit</span>
                  </Link>
                  <Link
                    href="/organizer/insights"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <BarChart2 size={16} className="text-purple-400" />
                    <span>Insights</span>
                  </Link>
                  <Link
                    href="/organizer/flip-report"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="AI analysis of your best-performing item categories"
                  >
                    <TrendingUp size={16} className="text-purple-400" />
                    <span>Flip Report</span>
                  </Link>
                  <Link
                    href="/organizer/appraisals"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="Crowdsourced item appraisals — PRO"
                  >
                    <Scale size={16} className="text-purple-400" />
                    <span>Appraisals</span>
                  </Link>
                  <Link
                    href="/organizer/item-library"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="Reuse items across multiple sales"
                  >
                    <BookOpen size={16} className="text-purple-400" />
                    <span>Item Library</span>
                  </Link>
                  <Link
                    href="/organizer/message-templates"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="Saved buyer communication templates"
                  >
                    <FileText size={16} className="text-purple-400" />
                    <span>Message Templates</span>
                  </Link>
                  <Link
                    href="/organizer/typology"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="AI item type and category classifier — PRO"
                  >
                    <Tag size={16} className="text-purple-400" />
                    <span>Typology</span>
                  </Link>
                  <Link
                    href="/organizer/fraud-signals"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="AI bid bot and fraud detection — PRO"
                  >
                    <ShieldAlert size={16} className="text-purple-400" />
                    <span>Fraud Signals</span>
                  </Link>
                  <Link
                    href="/organizer/bounties"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="Buyer bounty requests for your sale items"
                  >
                    <Trophy size={16} className="text-purple-400" />
                    <span>Bounties</span>
                  </Link>
                  <Link
                    href="/organizer/email-digest-preview"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="Preview your email digest before it sends"
                  >
                    <Mail size={16} className="text-purple-400" />
                    <span>Email Digest</span>
                  </Link>
                  <Link
                    href="/organizer/hubs"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-not-allowed"
                    onClick={() => setIsOpen(false)}
                  >
                    <Network size={16} className="text-purple-400" />
                    <span>Sale Hubs <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/organizer/line-queue"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-not-allowed"
                    onClick={() => setIsOpen(false)}
                  >
                    <Users size={16} className="text-purple-400" />
                    <span>Virtual Queue <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                </>
              )}

              {/* Teams Section — Collapsible (TEAMS tier or ADMIN) */}
              {(isTeams || isAdmin) && (
                <>
                  <button
                    onClick={() => setTeamsOpen(!teamsOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Users size={16} />
                      <span>Teams</span>
                    </div>
                    <ChevronRight
                      size={16}
                      className={`transition-transform duration-200 ${teamsOpen ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {teamsOpen && (
                    <>
                      <Link
                        href="/organizer/calendar"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-not-allowed"
                        onClick={() => setIsOpen(false)}
                      >
                        <Calendar size={16} className="text-gray-400" />
                        <span>Calendar <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                      </Link>
                      <Link
                        href="/organizer/staff"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-not-allowed"
                        onClick={() => setIsOpen(false)}
                      >
                        <UserPlus size={16} className="text-gray-400" />
                        <span>Staff Accounts <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                      </Link>
                      <Link
                        href="/organizer/webhooks"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                        onClick={() => setIsOpen(false)}
                        title="Send real-time sale events to your own systems"
                      >
                        <Webhook size={16} className="text-gray-500" />
                        <span>Webhooks</span>
                      </Link>
                      <Link
                        href="/organizer/workspace"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                        onClick={() => setIsOpen(false)}
                        title="Team and staff management — TEAMS"
                      >
                        <Network size={16} className="text-gray-500" />
                        <span>Workspace</span>
                      </Link>
                    </>
                  )}
                </>
              )}

              <hr className="my-2 border-warm-200 dark:border-gray-700" />


              <hr className="my-2 border-warm-200 dark:border-gray-700" />
            </>
          )}

          {/* SHOPPER Menu Items — only show if USER role exists */}
          {isUser && (
            <>
              {/* Shopper Dashboard — always show for users (even dual-role) with subtle indicator */}
              <Link
                href="/shopper/dashboard"
                className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <LayoutDashboard size={16} className="text-indigo-600" />
                <span>Shopper Dashboard</span>
              </Link>

              {/* Shopping Cart Button */}
              <button
                onClick={() => { setCartOpen(true); setIsOpen(false); }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors w-full text-left"
              >
                <ShoppingCart size={16} className="text-indigo-500" />
                <span>
                  Shopping Cart
                  {cartItems.length > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-indigo-600 dark:bg-indigo-500 rounded-full">
                      {cartItems.length}
                    </span>
                  )}
                </span>
              </button>

              {/* My Collection Section — Collapsible */}
              <button
                onClick={() => setMyCollectionOpen(!myCollectionOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Package size={16} />
                  <span>My Collection</span>
                </div>
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${myCollectionOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {myCollectionOpen && (
                <>
                  <Link
                    href="/shopper/wishlist"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Heart size={16} className="text-indigo-500" />
                    <span>Wishlist</span>
                  </Link>
                  <Link
                    href="/shopper/wishlist?tab=sellers"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Star size={16} className="text-indigo-500" />
                    <span>Following</span>
                  </Link>
                  <Link
                    href="/shopper/bids"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Gavel size={16} className="text-indigo-500" />
                    <span>My Bids</span>
                  </Link>
                  <Link
                    href="/shopper/holds"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Clock size={16} className="text-indigo-500" />
                    <span>My Holds</span>
                  </Link>
                  <Link
                    href="/shopper/history"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Package size={16} className="text-indigo-500" />
                    <span>My History</span>
                  </Link>
                  <Link
                    href="/shopper/settings"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Settings size={16} className="text-indigo-500" />
                    <span>Settings</span>
                  </Link>
                </>
              )}

              {/* Host a Sale CTA for shopper-only users */}
              {!isOrganizer && (
                <button
                  onClick={() => {
                    router.push('/organizer/register');
                    setIsOpen(false);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md font-medium transition-colors"
                >
                  Host a Sale
                </button>
              )}

              {/* Explore & Connect Section — Collapsible */}
              <button
                onClick={() => setExploreConnectOpen(!exploreConnectOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Compass size={16} />
                  <span>Explore & Connect</span>
                </div>
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${exploreConnectOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {exploreConnectOpen && (
                <>
                  <Link href="/map" className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors" onClick={() => setIsOpen(false)}>
                    <Map size={16} className="text-indigo-500" />
                    <span>Map</span>
                  </Link>
                  <Link href="/calendar" className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors" onClick={() => setIsOpen(false)}>
                    <Calendar size={16} className="text-indigo-500" />
                    <span>Calendar</span>
                  </Link>
                  <Link href="/feed" className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors" onClick={() => setIsOpen(false)}>
                    <Zap size={16} className="text-indigo-500" />
                    <span>Feed</span>
                  </Link>
                  <Link href="/inspiration" className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors" onClick={() => setIsOpen(false)}>
                    <Lightbulb size={16} className="text-indigo-500" />
                    <span>Inspiration</span>
                  </Link>
                  <Link href="/trending" className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors" onClick={() => setIsOpen(false)}>
                    <TrendingUp size={16} className="text-indigo-500" />
                    <span>Trending</span>
                  </Link>
                  <Link href="/shopper/trails" className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors" onClick={() => setIsOpen(false)}>
                    <Compass size={16} className="text-indigo-500" />
                    <span>My Trails</span>
                  </Link>
                  <Link
                    href="/shopper/explorer-passport"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="Your full shopper profile, badges, and history"
                  >
                    <Award size={16} className="text-indigo-500" />
                    <span>Explorer Passport</span>
                  </Link>
                  <Link
                    href="/shopper/hunt-pass"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="2x XP, early access to sales, and exclusive badges — $4.99/mo"
                  >
                    <Ticket size={16} className="text-indigo-500" />
                    <span>Hunt Pass</span>
                  </Link>
                  <Link
                    href="/shopper/league"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                    title="Weekly XP leaderboard — compete with shoppers in your region"
                  >
                    <Trophy size={16} className="text-indigo-500" />
                    <span>League</span>
                  </Link>
                  <Link
                    href="/shopper/loyalty"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Star size={16} className="text-indigo-500" />
                    <span>Loyalty Passport</span>
                  </Link>
                  <Link
                    href="/shopper/leaderboard"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Trophy size={16} className="text-indigo-500" />
                    <span>Explorer Leaderboard</span>
                  </Link>
                  <Link
                    href="/shopper/achievements"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Award size={16} className="text-indigo-500" />
                    <span>Achievements</span>
                  </Link>
                  <Link
                    href="/shopper/bounties"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Target size={16} className="text-indigo-500" />
                    <span>Bounties <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/shopper/reputation"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Shield size={16} className="text-indigo-500" />
                    <span>Reputation <span className="text-xs text-gray-400 ml-1">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/shopper/trades"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <ArrowLeftRight size={16} className="text-indigo-400" />
                    <span>Trades <span className="text-xs text-gray-400">(Soon)</span></span>
                  </Link>
                  <Link
                    href="/referral-dashboard"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Gift size={16} className="text-indigo-500" />
                    <span>Refer a Friend</span>
                  </Link>
                </>
              )}

              <hr className="my-2 border-warm-200 dark:border-gray-700" />
            </>
          )}

          {/* Footer: Pricing, My Profile, Settings, Logout */}
          <hr className="my-2 border-warm-200 dark:border-gray-700" />
          <Link
            href="/pricing"
            className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <Tag size={16} className="text-warm-500" />
            <span>Pricing</span>
          </Link>
          <Link
            href="/organizer/profile"
            className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <UserCircle size={16} className="text-amber-600" />
            <span>My Profile</span>
          </Link>
          <Link
            href="/organizer/settings"
            className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <Settings size={16} className="text-amber-600" />
            <span>Settings</span>
          </Link>

          {!isStandalone && (
            <div>
              <button
                onClick={handleInstallApp}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                role="menuitem"
              >
                <Smartphone size={16} className="text-amber-600" />
                <span>📲 Install App</span>
              </button>
              {showIOSTooltip && (
                <div className="px-3 py-2 text-xs text-warm-700 dark:text-warm-300 bg-warm-50 dark:bg-gray-800 rounded-md mx-2 mt-1">
                  Tap the Share button (↑) below, then select "Add to Home Screen"
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            role="menuitem"
          >
            Logout
          </button>
        </div>
      )}

      {/* Shopping Cart Drawer */}
      <ShopperCartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default AvatarDropdown;