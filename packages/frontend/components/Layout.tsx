import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ChevronRight,
  Search,
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
  MapPin,
  Lightbulb,
  MessageSquare,
  Activity,
  UserCircle,
  Settings,
  Wallet,
  BookOpen,
  FileText,
  Image,
  Share2,
  Send,
  Camera,
  Scale,
  Gift,
  Smartphone,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { useOrganizerTier } from '../hooks/useOrganizerTier';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import useUnreadMessages from '../hooks/useUnreadMessages';
import { SectionHeader, TierGatedNavLink } from './TierGatedNav';
import BottomTabNav from './BottomTabNav';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle'; // #63: Dark Mode
import OfflineIndicator from './OfflineIndicator'; // Feature #69: Local-First Offline Mode
import AvatarDropdown from './AvatarDropdown';
import BecomeOrganizerModal from './BecomeOrganizerModal';
import { useShopperCart } from '../hooks/useShopperCart';
import ShopperCartDrawer from './ShopperCartDrawer';

const Layout = ({ children, noFooter }: { children: React.ReactNode; noFooter?: boolean }) => {
  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'your area';

  const router = useRouter();
  const { user, logout } = useAuth();
  const { canAccess } = useOrganizerTier();
  const { isLowBandwidth } = useNetworkQuality();
  const { items: cartItems } = useShopperCart();
  const [isClient, setIsClient] = useState(false);
  const { data: unreadMessages } = useUnreadMessages(!!user);
  // Derived role flags — must be after isClient declaration
  const isOrganizer = isClient && user?.roles?.includes('ORGANIZER');
  const isUser = isClient && user?.roles?.includes('USER');
  const isAdmin = isClient && user?.roles?.includes('ADMIN');
  const isTeams = isClient && canAccess('TEAMS');
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showBecomeOrganizerModal, setShowBecomeOrganizerModal] = useState(false);
  const [mobileYourSalesOpen, setMobileYourSalesOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const [mobileSellingToolsOpen, setMobileSellingToolsOpen] = useState(false);
  const [mobilePostSalesOpen, setMobilePostSalesOpen] = useState(false);
  const [mobileProToolsOpen, setMobileProToolsOpen] = useState(false);
  const [mobileSaleContextOpen, setMobileSaleContextOpen] = useState(false);
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);
  const [mobileShopperCollectionOpen, setMobileShopperCollectionOpen] = useState(false);
  const [mobileShopperExploreOpen, setMobileShopperExploreOpen] = useState(false);
  const [mobileAdminOpen, setMobileAdminOpen] = useState(false);
  const [mobileTeamsOpen, setMobileTeamsOpen] = useState(false);
  const [mobileDevToolsOpen, setMobileDevToolsOpen] = useState(false);
  const [mobileInSaleToolsOpen, setMobileInSaleToolsOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSTooltip, setShowIOSTooltip] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if app is in standalone/installed mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
    }
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

  // Focus search input when it opens, and handle Escape to close
  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsSearchOpen(false);
      setHeaderSearch('');
    }
  };

  const handleSearchBlur = () => {
    if (!headerSearch.trim()) {
      setIsSearchOpen(false);
    }
  };

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
  };

  const handleHeaderSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (headerSearch.trim()) {
      router.push(`/?q=${encodeURIComponent(headerSearch.trim())}`);
    }
  };

  const staticNavLinks = [
    { href: '/map', label: 'Map' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/feed', label: 'Feed' },
    { href: '/inspiration', label: 'Inspiration' },
    { href: '/trending', label: 'Trending' },
    { href: '/pricing', label: 'Pricing' },
  ];

  const authLinks = isClient ? (
    user ? (
      <>
        <span className="block px-3 py-2 text-sm text-warm-500 truncate">
          Hi, {user.name || user.email}
        </span>
        {user?.roles?.includes('ORGANIZER') && (
          <>
            <SectionHeader icon={Store} label="Your Sales" color="amber" />
            <Link href="/organizer/dashboard" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Zap size={16} className="text-amber-500" />
              <span>Active Sale</span>
            </Link>
            <Link href="/organizer/sales" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <List size={16} className="text-amber-500" />
              <span>All Sales</span>
            </Link>
            <Link href="/plan" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <PlusCircle size={16} className="text-amber-500" />
              <span>Create Sale</span>
            </Link>
            <Link href="/organizer/calendar" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Calendar size={16} className="text-amber-500" />
              <span>Calendar</span>
            </Link>
            <Link href="/profile" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Shield size={16} className="text-amber-500" />
              <span>My Profile</span>
            </Link>
            <Link href="/organizer/subscription" className="flex items-center gap-2 px-3 py-2 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Sparkles size={16} />
              <span>{canAccess('TEAMS') ? 'Subscription' : canAccess('PRO') ? 'Upgrade to TEAMS' : 'Upgrade to PRO'}</span>
            </Link>

            <SectionHeader icon={Wrench} label="Account & Profile" color="amber" />
            <Link href="/organizer/messages" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Buyer and organizer messaging">
              <MessageSquare size={16} className="text-amber-500" />
              <span>Messages</span>
            </Link>
            <Link href="/organizer/profile" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Your public organizer profile">
              <UserCircle size={16} className="text-amber-500" />
              <span>My Profile</span>
            </Link>
            <Link href="/organizer/settings" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Account and sale preferences">
              <Settings size={16} className="text-amber-500" />
              <span>Settings</span>
            </Link>

            {!isStandalone && (
              <div>
                <button
                  onClick={handleInstallApp}
                  className="flex items-center gap-2 w-full px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md"
                >
                  <Smartphone size={16} className="text-amber-500" />
                  <span>📲 Install App</span>
                </button>
                {showIOSTooltip && (
                  <div className="px-3 py-2 text-xs text-warm-700 dark:text-warm-300 bg-warm-50 dark:bg-gray-800 rounded-md mx-2 mt-1">
                    Tap the Share button (↑) below, then select "Add to Home Screen"
                  </div>
                )}
              </div>
            )}

            <SectionHeader icon={Wrench} label="Selling Tools" color="amber" />
            <Link href="/organizer/holds" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Reserve items for buyers before the sale starts">
              <Bookmark size={16} className="text-amber-500" />
              <span>Holds</span>
            </Link>
            <Link href="/organizer/pos" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Process in-person payments at your sale">
              <ShoppingCart size={16} className="text-amber-500" />
              <span>POS / Checkout</span>
            </Link>
            <Link href="/organizer/print-inventory" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Generate printable item sheets for your sale table">
              <Printer size={16} className="text-amber-500" />
              <span>Print Inventory</span>
            </Link>
            <Link href="/organizer/qr-codes" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <QrCode size={16} className="text-amber-500" />
              <span>QR Codes</span>
            </Link>
            <Link href="/organizer/earnings" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <DollarSign size={16} className="text-amber-500" />
              <span>Earnings</span>
            </Link>
            <Link href="/organizer/staff" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <UserPlus size={16} className="text-amber-500" />
              <span>Staff Accounts</span>
            </Link>
            <Link href="/organizer/payouts" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Stripe payout schedule and on-demand transfers">
              <Wallet size={16} className="text-amber-500" />
              <span>Payouts</span>
            </Link>
            <Link href="/organizer/item-library" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Reuse items across multiple sales">
              <BookOpen size={16} className="text-amber-500" />
              <span>Item Library</span>
            </Link>
            <Link href="/organizer/inventory" className="flex items-center gap-2 px-3 py-2 text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed" title="Persistent inventory across sales (coming soon)">
              <Package size={16} className="text-amber-400" />
              <span>Inventory <span className="text-xs text-gray-400">(Soon)</span></span>
            </Link>
            <Link href="/organizer/reputation" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Your organizer rating and trust score">
              <Star size={16} className="text-amber-500" />
              <span>Reputation</span>
            </Link>
            <Link href="/organizer/message-templates" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Saved buyer communication templates">
              <FileText size={16} className="text-amber-500" />
              <span>Message Templates</span>
            </Link>
            <Link href="/organizer/ugc-moderation" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Approve or reject buyer-submitted photos">
              <Image size={16} className="text-amber-500" />
              <span>Manage Photos</span>
            </Link>

            <SectionHeader icon={Sparkles} label="Pro Tools" color="purple" />
            <Link href="/organizer/brand-kit" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Custom logos, colors, and banners for your sale pages">
              <Palette size={16} className="text-purple-400" />
              <span>Brand Kit</span>
            </Link>
            <Link href="/organizer/ripples" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Free sale performance analytics">
              <Activity size={16} className="text-purple-400" />
              <span>Sale Ripples</span>
            </Link>
            <Link href="/organizer/flip-report" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="AI analysis of your best-performing item categories">
              <TrendingUp size={16} className="text-purple-400" />
              <span>Flip Report</span>
            </Link>
            <Link href="/organizer/appraisals" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Crowdsourced item appraisals — PRO">
              <Scale size={16} className="text-purple-400" />
              <span>Appraisals</span>
            </Link>
            <Link href="/organizer/bounties" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Buyer bounty requests for your sale items">
              <Trophy size={16} className="text-purple-400" />
              <span>Bounties</span>
            </Link>
            <Link href="/organizer/email-digest-preview" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Preview your email digest before it sends">
              <MessageSquare size={16} className="text-purple-400" />
              <span>Email Digest</span>
            </Link>
            <Link href="/organizer/command-center" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Multi-sale overview dashboard — PRO">
              <LayoutDashboard size={16} className="text-purple-400" />
              <span>Command Center</span>
            </Link>
            <Link href="/organizer/typology" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="AI item type and category classifier — PRO">
              <Tag size={16} className="text-purple-400" />
              <span>Typology</span>
            </Link>
            <Link href="/organizer/fraud-signals" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="AI bid bot and fraud detection — PRO">
              <ShieldAlert size={16} className="text-purple-400" />
              <span>Fraud Signals</span>
            </Link>

            {canAccess('TEAMS') && (
              <>
                <SectionHeader icon={Wrench} label="Developer Tools" />
                <Link href="/organizer/webhooks" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Send real-time sale events to your own systems">
                  <Webhook size={16} className="text-gray-500" />
                  <span>Webhooks</span>
                </Link>
                <SectionHeader icon={Users} label="Workspace" />
                <Link href="/organizer/workspace" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Team and staff management — TEAMS">
                  <Users size={16} className="text-gray-500" />
                  <span>Workspace</span>
                </Link>
              </>
            )}

            <SectionHeader icon={Share2} label="Sale Context" />
            <Link href="/organizer/promote" className="flex items-center gap-2 px-3 py-2 text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed" title="Accessed from your sale management page">
              <Share2 size={16} className="text-amber-400" />
              <span>Share & Promote <span className="text-xs text-gray-400">(In Sale)</span></span>
            </Link>
            <Link href="/organizer/send-update" className="flex items-center gap-2 px-3 py-2 text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed" title="Accessed from your sale management page">
              <Send size={16} className="text-amber-400" />
              <span>Send Update <span className="text-xs text-gray-400">(In Sale)</span></span>
            </Link>
            <Link href="/organizer/photo-ops" className="flex items-center gap-2 px-3 py-2 text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed" title="Accessed from your sale management page">
              <Camera size={16} className="text-amber-400" />
              <span>Photo Ops <span className="text-xs text-gray-400">(In Sale)</span></span>
            </Link>
            <Link href="/organizer/print-inventory" className="flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Print labels and signage for your items">
              <Printer size={16} className="text-amber-600 dark:text-amber-400" />
              <span>Print & Labels</span>
            </Link>
            <Link href="/organizer/line-queue" className="flex items-center gap-2 px-3 py-2 text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed" title="Virtual line management — coming soon">
              <List size={16} className="text-amber-400" />
              <span>Line Queue <span className="text-xs text-gray-400">(Soon)</span></span>
            </Link>
          </>
        )}
        {user?.roles?.includes('USER') && (
          <>
            {/* Shopper Dashboard — always show for users (even dual-role) with subtle indicator */}
            <Link href="/shopper/dashboard" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <LayoutDashboard size={16} className="text-indigo-600" />
              <div className="flex flex-col">
                <span>Shopper Dashboard</span>
                {user?.roles?.includes('ORGANIZER') && <span className="text-xs text-gray-500 dark:text-gray-400">As a shopper</span>}
              </div>
            </Link>

            <SectionHeader icon={Heart} label="My Collection" color="indigo" />
            <Link href="/shopper/wishlist" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Bookmark size={16} className="text-indigo-500" />
              <span>Saved Sales</span>
            </Link>
            <Link href="/shopper/bids" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Gavel size={16} className="text-indigo-500" />
              <span>My Bids</span>
            </Link>
            <Link href="/shopper/holds" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Clock size={16} className="text-indigo-500" />
              <span>My Holds</span>
            </Link>
            <Link href="/shopper/history" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Package size={16} className="text-indigo-500" />
              <span>My History</span>
            </Link>
            <Link href="/shopper/settings" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Settings size={16} className="text-indigo-500" />
              <span>Settings</span>
            </Link>

            {!isStandalone && (
              <div>
                <button
                  onClick={handleInstallApp}
                  className="flex items-center gap-2 w-full px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md"
                >
                  <Smartphone size={16} className="text-indigo-500" />
                  <span>📲 Install App</span>
                </button>
                {showIOSTooltip && (
                  <div className="px-3 py-2 text-xs text-warm-700 dark:text-warm-300 bg-warm-50 dark:bg-gray-800 rounded-md mx-2 mt-1">
                    Tap the Share button (↑) below, then select "Add to Home Screen"
                  </div>
                )}
              </div>
            )}

            {/* Show "Host a Sale" for shoppers without organizer role */}
            {!user?.roles?.includes('ORGANIZER') && (
              <>
                <hr className="my-2 border-warm-200 dark:border-gray-700" />
                <button
                  onClick={() => setShowBecomeOrganizerModal(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md font-medium"
                >
                  <Store size={16} />
                  <span>Host a Sale</span>
                </button>
              </>
            )}

            <SectionHeader icon={Compass} label="Explore & Connect" color="indigo" />
            <Link href="/shopper/explorer-passport" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Your full shopper profile, badges, and history">
              <Award size={16} className="text-indigo-500" />
              <span>Explorer Passport</span>
            </Link>
            <Link href="/shopper/hunt-pass" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="2x XP, early access to sales, and exclusive badges — $4.99/mo">
              <Ticket size={16} className="text-indigo-500" />
              <span>Hunt Pass <span className="text-xs text-gray-400">(Soon)</span></span>
            </Link>
            <Link href="/shopper/league" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Weekly XP leaderboard — compete with shoppers in your region">
              <Trophy size={16} className="text-indigo-500" />
              <span>League</span>
            </Link>
            <Link href="/shopper/loyalty" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Star size={16} className="text-indigo-500" />
              <span>Loyalty Passport</span>
            </Link>
            <Link href="/shopper/bounties" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Target size={16} className="text-indigo-500" />
              <span>Bounties</span>
            </Link>
            <Link href="/shopper/reputation" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Shield size={16} className="text-indigo-500" />
              <span>Reputation</span>
            </Link>
            <Link href="/shopper/trades" className="flex items-center gap-2 px-3 py-2 text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
              <ArrowLeftRight size={16} className="text-indigo-400" />
              <span>Trades <span className="text-xs text-gray-400">(Soon)</span></span>
            </Link>
            <Link href="/referral-dashboard" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Gift size={16} className="text-indigo-500" />
              <span>Refer a Friend</span>
            </Link>
          </>
        )}
        {user?.roles?.includes('ADMIN') && (
          <>
            <hr className="my-2 border-warm-200 dark:border-gray-700" />
            <SectionHeader icon={ShieldAlert} label="Admin" color="red" />
            <Link href="/admin" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md font-medium">
              <LayoutDashboard size={16} className="text-red-500" />
              <span>Admin Dashboard</span>
            </Link>
            <Link href="/admin/users" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Users size={16} className="text-red-500" />
              <span>Manage Users</span>
            </Link>
            <Link href="/admin/sales" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Store size={16} className="text-red-500" />
              <span>Manage Sales</span>
            </Link>
            <Link href="/admin/items" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <List size={16} className="text-red-500" />
              <span>Manage Items</span>
            </Link>
            <Link href="/admin/reports" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <BarChart2 size={16} className="text-red-500" />
              <span>Reports</span>
            </Link>
            <Link href="/admin/feature-flags" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Zap size={16} className="text-red-500" />
              <span>Feature Flags</span>
            </Link>
            <Link href="/admin/broadcast" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <MessageSquare size={16} className="text-red-500" />
              <span>Broadcast Message</span>
            </Link>
          </>
        )}
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
          <div className="flex justify-between items-center h-12 lg:h-16">
            <Link href="/" className="text-xl lg:text-2xl font-bold text-amber-600 font-heading flex-shrink-0">
              FindA.Sale
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center space-x-4" aria-label="Main navigation">
              {/* Static nav links for all users (includes discovery pages and utilities) */}
              {staticNavLinks.map(({ href, label }) => (
                <Link key={href} href={href} className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400">{label}</Link>
              ))}

              {/* Desktop collapsible search */}
              <div className="flex items-center ml-2">
                {!isSearchOpen ? (
                  <button
                    onClick={() => setIsSearchOpen(true)}
                    className="p-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    aria-label="Open search"
                  >
                    <Search size={20} />
                  </button>
                ) : (
                  <form onSubmit={handleHeaderSearch} role="search" aria-label="Search sales" className="flex items-center">
                    <div className="relative transition-all duration-200">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none" aria-hidden="true">
                        <Search size={16} />
                      </span>
                      <input
                        ref={searchInputRef}
                        type="search"
                        value={headerSearch}
                        onChange={(e) => setHeaderSearch(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        onBlur={handleSearchBlur}
                        placeholder="Search…"
                        aria-label="Search sales and items"
                        className="pl-9 pr-3 py-1.5 text-sm border border-warm-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-warm-50 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 w-48 transition-all duration-200"
                      />
                    </div>
                  </form>
                )}
              </div>

              {/* "Host a Sale" CTA for logged-in shoppers without ORGANIZER role */}
              {isClient && user && user.roles?.includes('USER') && !user?.roles?.includes('ORGANIZER') && (
                <button
                  onClick={() => setShowBecomeOrganizerModal(true)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white rounded-md font-medium text-sm"
                >
                  Host a Sale
                </button>
              )}
            </nav>

            {/* Desktop right-side nav (Saved, Messages, Profile + Auth) */}
            <div className="hidden lg:flex items-center space-x-4">
              {!isClient ? (
                <>
                  <Link href="/login" className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400">Login</Link>
                  <Link href="/register" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md">Register</Link>
                </>
              ) : user ? (
                <>
                  <Link href="/shopper/wishlist" className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400" title="My Collections">
                    <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                  </Link>
                  <div className="relative">
                    <Link href="/messages" className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400" title="Messages">
                      <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </Link>
                    {unreadMessages && unreadMessages.unread > 0 && (
                      <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-amber-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                        {unreadMessages.unread > 9 ? '9+' : unreadMessages.unread}
                      </span>
                    )}
                  </div>
                  <div className="border-l border-warm-300 dark:border-gray-700 pl-4 flex items-center gap-2">
                    <NotificationBell />
                    <ThemeToggle compact={true} />
                    {isLowBandwidth && (
                      <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700" title="Low-Bandwidth Mode enabled — photos optimized for slow connections">
                        Low BW
                      </span>
                    )}
                    <AvatarDropdown />
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
            <div className="lg:hidden flex items-center gap-1">
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
      <div className="lg:hidden fixed top-12 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700 px-3 py-1.5">
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
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
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
        className={`lg:hidden fixed top-0 right-0 bottom-0 z-50 w-[85vw] sm:w-72 bg-white dark:bg-gray-900 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col ${
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
          {staticNavLinks.filter(({ href }) => !['/map', '/calendar', '/feed', '/inspiration', '/trending', '/pricing'].includes(href)).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                router.pathname === href
                  ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600'
                  : 'text-warm-900 dark:text-gray-200 hover:text-amber-600 hover:bg-warm-100 dark:hover:bg-gray-800'
              }`}
            >
              {label}
            </Link>
          ))}
          <div className="space-y-1" role="navigation" aria-label="Authenticated navigation">
            {isClient && user?.roles?.includes('ORGANIZER') ? (
              <>
                {/* User info — name, email, rank badge, XP bar */}
                {isClient && user && (
                  <div className="px-3 py-2 mb-1 border-b border-warm-200 dark:border-gray-700">
                    <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 truncate">{user.name || user.email}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">⚔️ Scout</span>
                      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full max-w-[100px] overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: '40%' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* ADMIN Section — Collapsible (ADMIN role) */}
                {isAdmin && (
                  <>
                    <Link href="/admin" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md font-medium">
                      <LayoutDashboard size={14} className="inline mr-2" /> Admin Dashboard
                    </Link>
                    <button
                      onClick={() => setMobileAdminOpen(!mobileAdminOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      <span className="flex items-center gap-2"><ShieldAlert size={14} className="text-red-500" /> Admin</span>
                      <ChevronRight
                        size={16}
                        className={`transition-transform duration-200 ${mobileAdminOpen ? 'rotate-90' : ''}`}
                      />
                    </button>
                    {mobileAdminOpen && (
                      <>
                        <Link href="/admin/users" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Users size={14} className="inline mr-2" /> Manage Users
                        </Link>
                        <Link href="/admin/sales" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Store size={14} className="inline mr-2" /> Manage Sales
                        </Link>
                        <Link href="/admin/items" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Package size={14} className="inline mr-2" /> Manage Items <span className="text-xs text-gray-400">(Soon)</span>
                        </Link>
                        <Link href="/admin/reports" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <BarChart2 size={14} className="inline mr-2" /> Reports <span className="text-xs text-gray-400">(Soon)</span>
                        </Link>
                        <Link href="/admin/feature-flags" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Lightbulb size={14} className="inline mr-2" /> Feature Flags <span className="text-xs text-gray-400">(Soon)</span>
                        </Link>
                        <Link href="/admin/broadcast" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <MessageSquare size={14} className="inline mr-2" /> Broadcast Message <span className="text-xs text-gray-400">(Soon)</span>
                        </Link>
                      </>
                    )}

                    <hr className="my-2 border-warm-200 dark:border-gray-700" />
                  </>
                )}

                {/* Quick Links */}
                <Link href="/organizer/dashboard" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  <LayoutDashboard size={14} className="inline mr-2 text-amber-600" /> Organizer Dashboard
                </Link>

                {/* Your Sales Section — Collapsible */}
                <button
                  onClick={() => setMobileYourSalesOpen(!mobileYourSalesOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Store size={14} />
                    <span>Your Sales</span>
                  </div>
                  <ChevronRight
                    size={16}
                    className={`transition-transform duration-200 ${mobileYourSalesOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {mobileYourSalesOpen && (
                  <>
                    <Link href="/organizer/sales" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <List size={14} className="inline mr-2 text-amber-500" /> All Sales
                    </Link>
                    <Link href="/organizer/create-sale" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <PlusCircle size={14} className="inline mr-2 text-amber-500" /> Create Sale
                    </Link>
                    <Link href="/plan" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Calendar size={14} className="inline mr-2 text-amber-500" /> Plan a Sale
                    </Link>
                    <Link href="/organizer/add-items" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Add items to any sale or your inventory">
                      <PlusCircle size={14} className="inline mr-2 text-amber-500" /> Add Items
                    </Link>
                    <Link href="/organizer/holds" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Bookmark size={14} className="inline mr-2 text-amber-500" /> Holds
                    </Link>
                    <Link href="/organizer/pos" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <ShoppingCart size={14} className="inline mr-2 text-amber-500" /> POS / Checkout
                    </Link>
                    <Link href="/organizer/ripples" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Activity size={14} className="inline mr-2 text-amber-500" /> Sale Ripples
                    </Link>
                  </>
                )}

                {/* In-Sale Tools Section — Collapsible */}
                <button
                  onClick={() => setMobileInSaleToolsOpen(!mobileInSaleToolsOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <span className="flex items-center gap-2"><Share2 size={14} className="text-amber-500" /> In-Sale Tools</span>
                  <ChevronRight
                    size={16}
                    className={`transition-transform duration-200 ${mobileInSaleToolsOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {mobileInSaleToolsOpen && (
                  <>
                    <Link href="/organizer/promote" className="block px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
                      <Share2 size={14} className="inline mr-2 text-amber-400" /> Share & Promote <span className="text-xs text-gray-400">(Soon)</span>
                    </Link>
                    <Link href="/organizer/send-update" className="block px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
                      <Send size={14} className="inline mr-2 text-amber-400" /> Send Update <span className="text-xs text-gray-400">(Soon)</span>
                    </Link>
                    <Link href="/organizer/photo-ops" className="block px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
                      <Camera size={14} className="inline mr-2 text-amber-400" /> Photo Ops <span className="text-xs text-gray-400">(Soon)</span>
                    </Link>
                    <Link href="/organizer/qr-codes" className="block px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
                      <Tag size={14} className="inline mr-2 text-amber-400" /> Price Tags <span className="text-xs text-gray-400">(Soon)</span>
                    </Link>
                    <Link href="/organizer/print-kit" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Printer size={14} className="inline mr-2 text-amber-500" /> Print Kit
                    </Link>
                  </>
                )}

                {/* Post Sales Section — Collapsible */}
                <button
                  onClick={() => setMobilePostSalesOpen(!mobilePostSalesOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <span className="flex items-center gap-2"><Activity size={14} className="text-amber-500" /> Post Sales</span>
                  <ChevronRight
                    size={16}
                    className={`transition-transform duration-200 ${mobilePostSalesOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {mobilePostSalesOpen && (
                  <>
                    <Link href="/organizer/print-inventory" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Printer size={14} className="inline mr-2 text-amber-500" /> Print & Labels
                    </Link>
                    <Link href="/organizer/earnings" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <DollarSign size={14} className="inline mr-2 text-amber-500" /> Earnings <span className="text-xs text-gray-400">(Soon)</span>
                    </Link>
                    <Link href="/organizer/payouts" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Wallet size={14} className="inline mr-2 text-amber-500" /> Payouts
                    </Link>
                    <Link href="/organizer/ugc-moderation" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Image size={14} className="inline mr-2 text-amber-500" /> Manage Photos
                    </Link>
                    <Link href="/organizer/reputation" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Star size={14} className="inline mr-2 text-amber-500" /> Reputation
                    </Link>
                  </>
                )}


                <Link href="/organizer/subscription" className="block px-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  <Zap size={14} className="inline mr-2" /> {canAccess('TEAMS') ? 'Subscription' : canAccess('PRO') ? 'Upgrade to TEAMS' : 'Upgrade to PRO'}
                </Link>

                {/* Pro Tools Section — Collapsible */}
                <button
                  onClick={() => setMobileProToolsOpen(!mobileProToolsOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <span className="flex items-center gap-2"><Sparkles size={14} className="text-purple-400" /> Pro Tools</span>
                  <ChevronRight
                    size={16}
                    className={`transition-transform duration-200 ${mobileProToolsOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {mobileProToolsOpen && (
                  <>
                    <Link href="/organizer/command-center" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <LayoutDashboard size={14} className="inline mr-2 text-purple-400" /> Command Center
                    </Link>
                    <Link href="/organizer/brand-kit" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Palette size={14} className="inline mr-2 text-purple-400" /> Brand Kit
                    </Link>
                    <Link href="/organizer/insights" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <BarChart2 size={14} className="inline mr-2 text-purple-400" /> Insights
                    </Link>
                    <Link href="/organizer/flip-report" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <TrendingUp size={14} className="inline mr-2 text-purple-400" /> Flip Report
                    </Link>
                    <Link href="/organizer/appraisals" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Scale size={14} className="inline mr-2 text-purple-400" /> Appraisals
                    </Link>
                    <Link href="/organizer/item-library" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <BookOpen size={14} className="inline mr-2 text-purple-400" /> Item Library
                    </Link>
                    <Link href="/organizer/message-templates" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <FileText size={14} className="inline mr-2 text-purple-400" /> Message Templates
                    </Link>
                    <Link href="/organizer/typology" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Tag size={14} className="inline mr-2 text-purple-400" /> Typology
                    </Link>
                    <Link href="/organizer/fraud-signals" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <ShieldAlert size={14} className="inline mr-2 text-purple-400" /> Fraud Signals
                    </Link>
                    <Link href="/organizer/sale-hubs" className="block px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
                      <Network size={14} className="inline mr-2 text-purple-400" /> Sale Hubs <span className="text-xs text-gray-400">(Soon)</span>
                    </Link>
                    <Link href="/organizer/line-queue" className="block px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
                      <Users size={14} className="inline mr-2 text-purple-400" /> Virtual Queue <span className="text-xs text-gray-400">(Soon)</span>
                    </Link>
                  </>
                )}

                {/* TEAMS Section — Collapsible (TEAMS tier) */}
                {(isTeams || isAdmin) && (
                  <>
                    <button
                      onClick={() => setMobileTeamsOpen(!mobileTeamsOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      <span className="flex items-center gap-2"><Users size={14} /> Teams</span>
                      <ChevronRight
                        size={16}
                        className={`transition-transform duration-200 ${mobileTeamsOpen ? 'rotate-90' : ''}`}
                      />
                    </button>
                    {mobileTeamsOpen && (
                      <>
                        <Link href="/organizer/calendar" className="block px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
                          <Calendar size={14} className="inline mr-2 text-gray-400" /> Calendar <span className="text-xs text-gray-400">(Soon)</span>
                        </Link>
                        <Link href="/organizer/staff" className="block px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
                          <UserPlus size={14} className="inline mr-2 text-gray-400" /> Staff Accounts <span className="text-xs text-gray-400">(Soon)</span>
                        </Link>
                        <Link href="/organizer/webhooks" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Webhook size={14} className="inline mr-2 text-gray-500" /> Webhooks
                        </Link>
                        <Link href="/organizer/workspace" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Network size={14} className="inline mr-2 text-gray-500" /> Workspace
                        </Link>
                      </>
                    )}
                  </>
                )}

                <hr className="my-2 border-warm-200 dark:border-gray-700" />

                {/* Shopper sections for dual-role organizers */}
                {isClient && user?.roles?.includes('USER') && (
                  <>
                    <hr className="my-2 border-warm-200 dark:border-gray-700" />

                    {/* Shopper Dashboard */}
                    <Link href="/shopper/dashboard" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <LayoutDashboard size={14} className="inline mr-2 text-indigo-600" /> Shopper Dashboard
                    </Link>

                    {/* Shopping Cart Button */}
                    <button
                      onClick={() => { setMobileCartOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors text-left"
                    >
                      <ShoppingCart size={14} className="text-indigo-500" />
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
                      onClick={() => setMobileShopperCollectionOpen(!mobileShopperCollectionOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Package size={14} />
                        <span>My Collection</span>
                      </div>
                      <ChevronRight
                        size={16}
                        className={`transition-transform duration-200 ${mobileShopperCollectionOpen ? 'rotate-90' : ''}`}
                      />
                    </button>
                    {mobileShopperCollectionOpen && (
                      <>
                        <Link href="/shopper/wishlist" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Heart size={14} className="inline mr-2 text-indigo-500" /> Wishlist
                        </Link>
                        <Link href="/shopper/wishlist?tab=sellers" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Star size={14} className="inline mr-2 text-indigo-500" /> Following
                        </Link>
                        <Link href="/shopper/bids" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Gavel size={14} className="inline mr-2 text-indigo-500" /> My Bids
                        </Link>
                        <Link href="/shopper/holds" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Clock size={14} className="inline mr-2 text-indigo-500" /> My Holds
                        </Link>
                        <Link href="/shopper/history" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Package size={14} className="inline mr-2 text-indigo-500" /> My History
                        </Link>
                      </>
                    )}

                    {/* Explore & Connect Section — Collapsible */}
                    <button
                      onClick={() => setMobileShopperExploreOpen(!mobileShopperExploreOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Compass size={14} />
                        <span>Explore & Connect</span>
                      </div>
                      <ChevronRight
                        size={16}
                        className={`transition-transform duration-200 ${mobileShopperExploreOpen ? 'rotate-90' : ''}`}
                      />
                    </button>
                    {mobileShopperExploreOpen && (
                      <>
                        <Link href="/map" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Map size={14} className="inline mr-2 text-indigo-500" /> Map
                        </Link>
                        <Link href="/calendar" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Calendar size={14} className="inline mr-2 text-indigo-500" /> Calendar
                        </Link>
                        <Link href="/feed" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Zap size={14} className="inline mr-2 text-indigo-500" /> Feed
                        </Link>
                        <Link href="/inspiration" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Lightbulb size={14} className="inline mr-2 text-indigo-500" /> Inspiration
                        </Link>
                        <Link href="/trending" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <TrendingUp size={14} className="inline mr-2 text-indigo-500" /> Trending
                        </Link>
                        <Link href="/shopper/trails" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Compass size={14} className="inline mr-2 text-indigo-500" /> My Trails
                        </Link>
                        <Link href="/shopper/explorer-passport" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Award size={14} className="inline mr-2 text-indigo-500" /> Explorer Passport
                        </Link>
                        <Link href="/shopper/hunt-pass" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Ticket size={14} className="inline mr-2 text-indigo-500" /> Hunt Pass
                        </Link>
                        <Link href="/shopper/league" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Trophy size={14} className="inline mr-2 text-indigo-500" /> League
                        </Link>
                        <Link href="/shopper/loyalty" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Star size={14} className="inline mr-2 text-indigo-500" /> Loyalty Passport
                        </Link>
                        <Link href="/shopper/leaderboard" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Trophy size={14} className="inline mr-2 text-indigo-500" /> Explorer Leaderboard
                        </Link>
                        <Link href="/shopper/achievements" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Award size={14} className="inline mr-2 text-indigo-500" /> Achievements
                        </Link>
                        <Link href="/shopper/bounties" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Target size={14} className="inline mr-2 text-indigo-500" /> Bounties <span className="text-xs text-gray-400">(Soon)</span>
                        </Link>
                        <Link href="/shopper/reputation" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Shield size={14} className="inline mr-2 text-indigo-500" /> Reputation <span className="text-xs text-gray-400">(Soon)</span>
                        </Link>
                        <Link href="/shopper/trades" className="block px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
                          <ArrowLeftRight size={14} className="inline mr-2 text-indigo-400" /> Trades <span className="text-xs text-gray-400">(Soon)</span>
                        </Link>
                      </>
                    )}
                  </>
                )}

              </>
            ) : isClient && user && user?.roles?.includes('USER') ? (
              <>
                {/* Shopper-only nav (when not organizer) */}
                <Link href="/shopper/dashboard" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  <LayoutDashboard size={14} className="inline mr-2 text-indigo-600" /> Shopper Dashboard
                </Link>

                {/* Shopping Cart Button */}
                <button
                  onClick={() => { setMobileCartOpen(true); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors text-left"
                >
                  <ShoppingCart size={14} className="text-indigo-500" />
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
                  onClick={() => setMobileExplorerOpen(!mobileExplorerOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Heart size={14} />
                    <span>My Collection</span>
                  </div>
                  <ChevronRight
                    size={16}
                    className={`transition-transform duration-200 ${mobileExplorerOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {mobileExplorerOpen && (
                  <>
                    <Link href="/shopper/wishlist" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Bookmark size={14} className="inline mr-2 text-indigo-500" /> Wishlist
                    </Link>
                    <Link href="/shopper/wishlist?tab=sellers" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Star size={14} className="inline mr-2 text-indigo-500" /> Following
                    </Link>
                    <Link href="/shopper/bids" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Gavel size={14} className="inline mr-2 text-indigo-500" /> My Bids
                    </Link>
                    <Link href="/shopper/holds" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Clock size={14} className="inline mr-2 text-indigo-500" /> My Holds
                    </Link>
                    <Link href="/shopper/history" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Package size={14} className="inline mr-2 text-indigo-500" /> My History
                    </Link>
                  </>
                )}

                {/* Explore & Connect Section — Collapsible */}
                <button
                  onClick={() => setMobileProToolsOpen(!mobileProToolsOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Compass size={14} />
                    <span>Explore & Connect</span>
                  </div>
                  <ChevronRight
                    size={16}
                    className={`transition-transform duration-200 ${mobileProToolsOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {mobileProToolsOpen && (
                  <>
                    <Link href="/map" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Map size={14} className="inline mr-2 text-indigo-500" /> Map
                    </Link>
                    <Link href="/calendar" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Calendar size={14} className="inline mr-2 text-indigo-500" /> Calendar
                    </Link>
                    <Link href="/feed" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Zap size={14} className="inline mr-2 text-indigo-500" /> Feed
                    </Link>
                    <Link href="/inspiration" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Lightbulb size={14} className="inline mr-2 text-indigo-500" /> Inspiration
                    </Link>
                    <Link href="/trending" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <TrendingUp size={14} className="inline mr-2 text-indigo-500" /> Trending
                    </Link>
                    <Link href="/shopper/explorer-passport" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Award size={14} className="inline mr-2 text-indigo-500" /> Explorer Passport
                    </Link>
                    <Link href="/shopper/hunt-pass" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Ticket size={14} className="inline mr-2 text-indigo-500" /> Hunt Pass
                    </Link>
                    <Link href="/shopper/league" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Trophy size={14} className="inline mr-2 text-indigo-500" /> League
                    </Link>
                    <Link href="/shopper/bounties" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Target size={14} className="inline mr-2 text-indigo-500" /> Bounties <span className="text-xs text-gray-400">(Soon)</span>
                    </Link>
                    <Link href="/shopper/reputation" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <Shield size={14} className="inline mr-2 text-indigo-500" /> Reputation <span className="text-xs text-gray-400">(Soon)</span>
                    </Link>
                    <Link href="/shopper/trades" className="block px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
                      <ArrowLeftRight size={14} className="inline mr-2 text-indigo-400" /> Trades <span className="text-xs text-gray-400">(Soon)</span>
                    </Link>
                  </>
                )}
              </>
            ) : (
              authLinks
            )}
            {isClient && user && (
              <>
                <div className="border-t border-warm-200 dark:border-gray-700 pt-3 mt-2 space-y-1">
                  <Link href="/pricing" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                    <Tag size={14} className="inline mr-2 text-warm-500" /> Pricing
                  </Link>
                  {user?.roles?.includes('ORGANIZER') && (
                    <Link href="/organizer/profile" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <UserCircle size={14} className="inline mr-2 text-amber-600" /> My Profile
                    </Link>
                  )}
                  <Link href="/organizer/settings" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                    <Settings size={14} className="inline mr-2 text-amber-500" /> Settings
                  </Link>
                </div>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-3 py-2 mt-3 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </nav>
      </div>

      {/* Main Content
          Mobile: pt accounts for fixed header (48px) + fixed search bar (~44px) = 92px
          Desktop: pt-16 for fixed header (64px)
      */}
      <div
        id="main-content"
        className="flex-grow pt-[92px] md:pt-16 pb-15 md:pb-0"
        tabIndex={-1}
      >
        {children}
      </div>

      {/* Bottom tab navigation — mobile only */}
      <BottomTabNav />

      {/* Footer — hidden if noFooter prop is true (e.g., for chat pages) */}
      {!noFooter && (
      <footer className="bg-warm-800 dark:bg-gray-950 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-bold mb-4">FindA.Sale</h3>
              <p className="text-warm-400 mb-4">
                Helping you find the best estate sales, garage sales, yard sales, flea markets, auctions, and more near you.
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
                <li><Link href="/support" className="text-warm-400 hover:text-white">Support</Link></li>
                <li><Link href="/faq" className="text-warm-400 hover:text-white">FAQ</Link></li>
                {isClient && user?.roles?.includes('ORGANIZER') && (
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
      )}

      {/* Shopping Cart Drawer */}
      <ShopperCartDrawer isOpen={mobileCartOpen} onClose={() => setMobileCartOpen(false)} />

      {/* Become Organizer Modal */}
      <BecomeOrganizerModal
        isOpen={showBecomeOrganizerModal}
        onClose={() => setShowBecomeOrganizerModal(false)}
      />
    </div>
  );
};

export default Layout;
