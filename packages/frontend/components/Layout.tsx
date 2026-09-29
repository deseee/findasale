import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ChevronRight,
  Search,
  Store,
  Zap,
  List,
  Calendar,
  Users,
  Wrench,
  Bookmark,
  ShoppingCart,
  Map,
  BarChart2,
  UserPlus,
  Sparkles,
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
  Lightbulb,
  MessageSquare,
  Activity,
  UserCircle,
  Settings,
  BookOpen,
  FileText,
  Share2,
  Send,
  Camera,
  Gift,
  Smartphone,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { useOrganizerTier } from '../hooks/useOrganizerTier';
import { useMyWorkspaceMemberships } from '../hooks/useWorkspace';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import useUnreadMessages from '../hooks/useUnreadMessages';
import useXpProfile from '../hooks/useXpProfile';
import { SectionHeader, TierGatedNavLink } from './TierGatedNav';
import { teamsNavForSurface, teamsNavGroupForSurface, proNavForSurface, coreNavGroupForSurface, SIDEBAR_RETAIL_TIER } from '../lib/organizerNav';
import type { NavGroup } from '../lib/organizerNav';
import { shopperNavGroup } from '../lib/shopperNav';
import type { ShopperNavGroup } from '../lib/shopperNav';
import BottomTabNav from './BottomTabNav';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle'; // #63: Dark Mode
import OfflineIndicator from './OfflineIndicator'; // Feature #69: Local-First Offline Mode
import AvatarDropdown from './AvatarDropdown';
import BecomeOrganizerModal from './BecomeOrganizerModal';
import QRScannerButton from './qr-scanner/QRScannerButton';
import { useShopperCart } from '../hooks/useShopperCart';
import { useCart } from '../context/CartContext';
import CartDrawer from './CartDrawer';
import CartIcon from './CartIcon';
import { io } from 'socket.io-client';
import { useToast } from './ToastContext';
import api from '../lib/api';

const Layout = ({ children, noFooter }: { children: React.ReactNode; noFooter?: boolean }) => {
  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'your area';

  const router = useRouter();
  const { user, logout } = useAuth();
  const { canAccess, isLapsed, tierKnown } = useOrganizerTier();
  const { isLowBandwidth } = useNetworkQuality();
  const cart = useShopperCart(user?.id);
  const { items: cartItems } = cart;
  const { holdCount, isCartOpen, closeCart, openCart } = useCart();
  const { showToast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const { data: unreadMessages } = useUnreadMessages(!!user);
  const { data: xpProfile } = useXpProfile(isClient && !!user);
  // Derived role flags (must be after isClient declaration)
  const isOrganizer = isClient && user?.roles?.includes('ORGANIZER');
  const isUser = isClient && user?.roles?.includes('USER');
  const isAdmin = isClient && user?.roles?.includes('ADMIN');
  const isTeams = isClient && canAccess('TEAMS');
  // Shared With You (mobile) -- 2026-07-30, same-day follow-up: the desktop
  // AvatarDropdown got this fix earlier today, but the mobile drawer below
  // renders from a completely separate JSX tree (authLinks, this file) and
  // never got the equivalent links -- confirmed live, Pegasus/user5 had
  // nothing to click on mobile despite the desktop fix working.
  const { data: myVendorBoothsMobile = [] } = useQuery<{ id: string }[]>({
    queryKey: ['my-vendor-booths', user?.id],
    queryFn: async () => {
      const response = await api.get('/vendor-booth/my-booths');
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: isClient && !!user?.id,
    staleTime: 60_000,
  });
  const { data: myTeamMembershipsMobile = [] } = useMyWorkspaceMemberships({ enabled: isClient && !!user?.id });
  const hasVendorBoothsMobile = myVendorBoothsMobile.length > 0;
  const hasTeamMembershipsMobile = isClient && !!user?.id && myTeamMembershipsMobile.length > 0;
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
  const [mobileShopperCollectionOpen, setMobileShopperCollectionOpen] = useState(false);
  const [mobileShopperExploreOpen, setMobileShopperExploreOpen] = useState(false);
  const [mobileAdminOpen, setMobileAdminOpen] = useState(false);
  const [mobileTeamsOpen, setMobileTeamsOpen] = useState(false);
  const [mobileDevToolsOpen, setMobileDevToolsOpen] = useState(false);
  const [mobileInSaleToolsOpen, setMobileInSaleToolsOpen] = useState(false);
  const [mobileShopperConnectOpen, setMobileShopperConnectOpen] = useState(false);
  const [mobileHuntPassOpen, setMobileHuntPassOpen] = useState(false);
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

  // CART_SHARE_REQUEST: organizer requested shopper share their cart
  // Auto-shares and opens the cart drawer so the organizer sees it immediately
  useEffect(() => {
    if (!user?.id) return;
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ||
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');
    // S708: accessToken now lives in an httpOnly cookie. Send cookies on the socket handshake
    // (withCredentials) so the backend can read it. Keep legacy auth.token fallback for any
    // older code paths that still write to localStorage.
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const socket = io(socketUrl, {
      auth: { token: token || undefined },
      withCredentials: true,
      transports: ['websocket'],
      upgrade: false,
    });
    socket.emit('join', `user:${user.id}`);
    socket.on('CART_SHARE_REQUEST', async (data: { saleId: string; saleName?: string }) => {
      // Auto-share current cart if it matches the requested sale
      if (cart.saleId === data.saleId && cart.cartCount > 0) {
        try {
          await api.post('/pos/sessions', {
            saleId: data.saleId,
            cartItems: cart.items.map(item => ({
              id: item.id,
              title: item.title,
              price: item.price ?? 0,
              photoUrl: item.photoUrl,
              saleId: item.saleId,
            })),
          });
          showToast('Cart shared with cashier ✓', 'success');
        } catch {
          showToast('Cashier requested your cart. Tap Share Cart to check out.', 'info');
        }
      } else {
        // Cart is empty or on a different sale: just notify
        showToast('Cashier is ready for you. Open your cart and tap Share.', 'info');
      }
      openCart();
    });

    // Feature #397: Crew Invasion (notify shopper when their crew triggers a group discount)
    socket.on('CREW_INVASION_TRIGGERED', (data: {
      saleId: string;
      crewId: string;
      code: string;
      discountPct: number;
      expiresAt: string;
      memberCount: number;
    }) => {
      const expiresDate = new Date(data.expiresAt);
      const minutesLeft = Math.round((expiresDate.getTime() - Date.now()) / 60000);
      showToast(
        `Crew Invasion! Use code ${data.code} for ${data.discountPct}% off your held items. Expires in ${minutesLeft} min.`,
        'success'
      );
    });

    return () => { socket.disconnect(); };
  }, [user?.id, cart.saleId, cart.cartCount]);

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
    // Clear every gate InstallPrompt.tsx uses to suppress its OWN automatic banner.
    // A tap here is an explicit request, not the passive auto-prompt those gates exist for.
    // Bug (2026-09-18): this used to clear only the 7-day "dismissed" flag. If the automatic
    // banner had already shown once this browser session (findasale_install_shown in
    // sessionStorage), InstallPrompt's mount effect returned before ever attaching the
    // beforeinstallprompt listener -- so reload() below just reloaded the current page with
    // no prompt, dialog, or visible effect at all (landing back on whatever page -- e.g. the
    // dashboard -- the user was already on).
    localStorage.removeItem('findasale_install_dismissed_until');
    localStorage.setItem('findasale_install_visits', '3'); // satisfy the MIN_VISITS gate
    try { sessionStorage.removeItem('findasale_install_shown'); } catch {}
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      setShowIOSTooltip(true);
    } else {
      // Bug (2026-09-18, part 2): clearing the gates above wasn't enough on its own --
      // InstallPrompt.tsx's beforeinstallprompt listener normally only attaches after a
      // 5-second delay (meant for the passive auto-banner), which is almost always later
      // than when Chrome actually dispatches the event on a fresh reload. Flag this reload
      // as an explicit request so InstallPrompt.tsx attaches its listener immediately
      // instead of waiting, and falls back to manual instructions if Chrome still doesn't
      // fire the event (see InstallPrompt.tsx for the full explanation).
      try { sessionStorage.setItem('findasale_install_explicit_request', 'true'); } catch {}
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

  const [exploreOpen, setExploreOpen] = useState(false);

  const staticNavLinks = [
    { href: '/map', label: 'Map' },
    { href: '/trending', label: 'Trending' },
  ];

  // Organizer nav rows for the sidebar and mobile drawer. Both render from
  // lib/organizerNav.ts (CORE_NAV_ENTRIES) so labels, gates and membership cannot drift.
  const sidebarCoreLinks = (group: NavGroup) =>
    coreNavGroupForSurface('sidebar', group)
      .filter((e) => canAccess(e.requiredTier))
      .map(({ id, label, href, icon: Icon, title }) => (
        <Link key={id} href={href} className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title={title}>
          <Icon size={16} className="text-amber-500" />
          <span>{label}</span>
        </Link>
      ));
  const mobileCoreLinks = (group: NavGroup) =>
    coreNavGroupForSurface('mobileMenu', group)
      .filter((e) => canAccess(e.requiredTier))
      .map(({ id, label, href, icon: Icon, title }) => (
        <Link key={id} href={href} className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title={title}>
          <Icon size={14} className="inline mr-2 text-amber-500" /> {label}
        </Link>
      ));

  // Shopper sections of the mobile drawer. ONE renderer for both the dual-role and the shopper-only
  // branch (they used to be two hand-copied blocks that drifted), fed by lib/shopperNav.ts.
  // Each accordion has its own state: the dual-role "Connect" used to reuse mobileInSaleToolsOpen,
  // so opening it also toggled the organizer "In-Sale Tools" section.
  const mobileShopperLink = 'block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md';
  const mobileShopperAccordion = (
    label: string,
    HeaderIcon: typeof ShoppingCart,
    group: ShopperNavGroup,
    open: boolean,
    toggle: () => void,
    accent: 'indigo' | 'amber' = 'indigo',
  ) => (
    <>
      <button
        onClick={toggle}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider ${accent === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'} hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors`}
      >
        <div className="flex items-center gap-2">
          <HeaderIcon size={14} />
          <span>{label}</span>
        </div>
        <ChevronRight
          size={16}
          className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <>
          {shopperNavGroup(group).map(({ id, label: entryLabel, href, icon: Icon, soon }) => (
            <Link key={id} href={href} className={mobileShopperLink}>
              <Icon size={14} className={`inline mr-2 ${accent === 'amber' ? 'text-amber-500' : 'text-indigo-500'}`} /> {entryLabel}
              {soon && <span className="text-xs text-gray-400"> (Soon)</span>}
            </Link>
          ))}
        </>
      )}
    </>
  );
  const renderMobileShopperNav = () => (
    <>
      <Link href="/shopper/dashboard" className={mobileShopperLink}>
        <LayoutDashboard size={14} className="inline mr-2 text-indigo-600" /> Shopper Dashboard
      </Link>

      <button
        onClick={() => { openCart(); setMenuOpen(false); }}
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

      {mobileShopperAccordion('My Collection', Heart, 'collection', mobileShopperCollectionOpen, () => setMobileShopperCollectionOpen(!mobileShopperCollectionOpen))}
      {mobileShopperAccordion('Explore', Compass, 'explore', mobileShopperExploreOpen, () => setMobileShopperExploreOpen(!mobileShopperExploreOpen))}
      {mobileShopperAccordion('Connect', Share2, 'connect', mobileShopperConnectOpen, () => setMobileShopperConnectOpen(!mobileShopperConnectOpen))}

      <Link href="/shopper/hunt-pass" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
        <Ticket size={14} className="inline mr-2 text-amber-500" /> Hunt Pass
      </Link>

      {mobileShopperAccordion('Hunt Exclusives', Award, 'huntExclusives', mobileHuntPassOpen, () => setMobileHuntPassOpen(!mobileHuntPassOpen), 'amber')}
    </>
  );

  const authLinks = isClient ? (
    user ? (
      <>
        <span className="block px-3 py-2 text-sm text-warm-500 truncate">
          Hi, {user.name || user.email}
        </span>
        {(hasVendorBoothsMobile || hasTeamMembershipsMobile) && (
          <>
            {hasVendorBoothsMobile && (
              <Link href="/vendor/booths" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Every booth you have claimed, and your register if one has been shared with you">
                <Store size={16} className="text-amber-500" />
                <span>Your Booths</span>
              </Link>
            )}
            {hasTeamMembershipsMobile && (
              <Link href="/team/registers" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Every team you belong to, and your register if one has been shared with you">
                <Users size={16} className="text-amber-500" />
                <span>Your Teams</span>
              </Link>
            )}
          </>
        )}
        {user?.roles?.includes('ORGANIZER') && (
          <>
<SectionHeader icon={Store} label="Your Sales" color="amber" />
            {sidebarCoreLinks('top')}
            {sidebarCoreLinks('yourSales')}

            <SectionHeader icon={Share2} label="In-Sale Tools" color="amber" />
            {sidebarCoreLinks('inSaleTools')}

            <SectionHeader icon={Activity} label="Post Sales" color="amber" />
            {sidebarCoreLinks('postSales')}

            <SectionHeader icon={Wrench} label="Account & Profile" color="amber" />
            <Link href="/messages" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Your messages">
              <MessageSquare size={16} className="text-amber-500" />
              <span>Messages</span>
            </Link>
            <Link href="/organizer/subscription" className="flex items-center gap-2 px-3 py-2 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Sparkles size={16} />
              {/* S-TIER-RECONCILE: never sell a plan to someone whose tier we could not read.
                  `!canAccess('PRO')` is true both for a real SIMPLE organizer AND for an
                  unresolved tier. Only the former should be asked to upgrade. */}
              <span>{!tierKnown ? 'Subscription' : canAccess('TEAMS') ? 'Subscription' : canAccess('PRO') ? 'Upgrade to TEAMS' : 'Upgrade to PRO'}</span>
            </Link>
            {sidebarCoreLinks('account')}

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

            <SectionHeader icon={Sparkles} label="Pro Tools" color="purple" />
            {tierKnown && !canAccess('PRO') && (
              <Link href="/organizer/subscription" className="block px-3 py-1 text-xs text-purple-600 dark:text-purple-400 hover:underline">
                Upgrade to PRO for advanced tools
              </Link>
            )}
            {/* Rendered from lib/organizerNav.ts PRO_NAV_ENTRIES (shared with the mobile menu and AvatarDropdown). */}
            {proNavForSurface('sidebar').filter((e) => canAccess(e.requiredTier)).map(({ id, label, href, icon: Icon, title }) => (
              <Link key={id} href={href} className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title={title}>
                <Icon size={16} className="text-purple-400" />
                <span>{label}</span>
              </Link>
            ))}

            {(isTeams || isAdmin) && (
              <>
                <SectionHeader icon={Users} label="Teams" color="purple" />
                {teamsNavGroupForSurface('sidebar', 'teams').map(({ id, label, href, icon: Icon, title }) => (
                  <Link key={id} href={href} className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title={title}>
                    <Icon size={16} className="text-gray-400" />
                    <span>{label}</span>
                  </Link>
                ))}
                <SectionHeader icon={Wrench} label="Developer Tools" />
                {teamsNavGroupForSurface('sidebar', 'developerTools').map(({ id, label, href, icon: Icon, title }) => (
                  <Link key={id} href={href} className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title={title}>
                    <Icon size={16} className="text-gray-500" />
                    <span>{label}</span>
                  </Link>
                ))}
                <SectionHeader icon={Users} label="Workspace" />
                {teamsNavGroupForSurface('sidebar', 'workspace').map(({ id, label, href, icon: Icon, title }) => (
                  <Link key={id} href={href} className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title={title}>
                    <Icon size={16} className="text-gray-500" />
                    <span>{label}</span>
                  </Link>
                ))}
              </>
            )}
            {canAccess(SIDEBAR_RETAIL_TIER) && (
              <>
                <SectionHeader icon={Store} label="Retail" />
                {teamsNavGroupForSurface('sidebar', 'retail').map(({ id, label, href, icon: Icon, title }) => (
                  <Link key={id} href={href} className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title={title}>
                    <Icon size={16} className="text-teal-500" />
                    <span>{label}</span>
                  </Link>
                ))}
              </>
            )}

            <Link href="/clearance" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Clearance items from active sales">
              <Tag size={16} className="text-amber-500" />
              <span>Clearance</span>
            </Link>
          </>
        )}
        {user?.roles?.includes('USER') && (
          <>
            {/* Shopper Dashboard: always show for users (even dual-role) with subtle indicator */}
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

            <SectionHeader icon={Compass} label="Explore" color="indigo" />
            <Link href="/search" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Search across all sales and items">
              <Search size={16} className="text-indigo-500" />
              <span>Search</span>
            </Link>
            <Link href="/clearance" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Clearance items from active sales">
              <Tag size={16} className="text-indigo-500" />
              <span>Clearance</span>
            </Link>
            <Link href="/shopper/explorer-profile" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Your explorer journey, badges, and discovery history">
              <Award size={16} className="text-indigo-500" />
              <span>Explorer Profile</span>
            </Link>
            <Link href="/shopper/haul-posts" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Share your latest hauls with the community">
              <Camera size={16} className="text-indigo-500" />
              <span>Haul Posts</span>
            </Link>
            <Link href="/shopper/curio" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Snap a photo of anything to see what it might be worth">
              <Sparkles size={16} className="text-indigo-500" />
              <span>Curio</span>
            </Link>
            <Link href="/shopper/early-access-cache" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Spend 100 XP for 48-hour early access to items">
              <Zap size={16} className="text-indigo-500" />
              <span>Early Access Cache</span>
            </Link>

            <SectionHeader icon={Share2} label="Connect" color="indigo" />
            <Link href="/shopper/appraisals" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Star size={16} className="text-indigo-500" />
              <span>Appraisals</span>
            </Link>
            <Link href="/shopper/bounties" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Request hard-to-find items from local organizers">
              <Target size={16} className="text-indigo-500" />
              <span>Bounty Board</span>
            </Link>
            <Link href="/shopper/guild-primer" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Star size={16} className="text-indigo-500" />
              <span>Explorer's Guild</span>
            </Link>
            <Link href="/coupons" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Spend XP on discount codes and Rarity Boost">
              <Ticket size={16} className="text-indigo-500" />
              <span>Rewards</span>
            </Link>
            <Link href="/shopper/reputation" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Shield size={16} className="text-indigo-500" />
              <span>Reputation</span>
            </Link>
            <Link href="/referral-dashboard" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Gift size={16} className="text-indigo-500" />
              <span>Refer a Friend</span>
            </Link>
            <Link href="/shopper/trades" className="flex items-center gap-2 px-3 py-2 text-gray-400 dark:text-gray-500 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md cursor-not-allowed">
              <ArrowLeftRight size={16} className="text-indigo-400" />
              <span>Trades <span className="text-xs text-gray-400">(Soon)</span></span>
            </Link>

            <Link href="/shopper/hunt-pass" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="$4.99/mo for 1.5x XP, early access to sales, and exclusive badges">
              <Ticket size={16} className="text-amber-500" />
              <span>Hunt Pass</span>
            </Link>

            <SectionHeader icon={Award} label="Hunt Exclusives" color="amber" />
            <Link href="/shopper/rare-finds" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Dedicated rare items page for Hunt Pass subscribers">
              <Sparkles size={16} className="text-amber-400" />
              <span>Rare Finds</span>
            </Link>
            <Link href="/shopper/loot-legend" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Your LEGENDARY and EPIC items live in the Hunt Pass Loot Legend Portfolio">
              <Star size={16} className="text-amber-400" />
              <span>Loot Legend</span>
            </Link>
            <Link href="/shopper/league" className="flex items-center gap-2 px-3 py-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Weekly XP leaderboard where you compete with shoppers in your region">
              <Trophy size={16} className="text-amber-500" />
              <span>League</span>
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
            <Link href="/admin/ab-tests" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Lightbulb size={16} className="text-red-500" />
              <span>A/B Tests</span>
            </Link>
            <Link href="/admin/bid-review" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <MessageSquare size={16} className="text-red-500" />
              <span>Bid Review</span>
            </Link>
            <Link href="/admin/scraper" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Activity size={16} className="text-red-500" />
              <span>Scraper Management</span>
            </Link>
            <Link href="/admin/scrape-pool" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Activity size={16} className="text-red-500" />
              <span>Scrape Pool</span>
            </Link>

            <Link href="/admin/disputes" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <MessageSquare size={16} className="text-red-500" />
              <span>Disputes</span>
            </Link>
            <Link href="/admin/invites" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Users size={16} className="text-red-500" />
              <span>Invites</span>
            </Link>
            <Link href="/admin/social-accounts" className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
              <Share2 size={16} className="text-red-500" />
              <span>Social Accounts</span>
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
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <OfflineIndicator /> {/* Feature #69: Local-First Offline Mode */}
      {/* Skip to main content: keyboard/screen reader accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-amber-600 focus:text-white focus:rounded-md focus:font-medium"
      >
        Skip to main content
      </a>

      {/* ── HEADER ── fixed, 48px mobile / 64px desktop */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 shadow-header dark:shadow-gray-800/50">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-12 lg:h-16">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/" className="text-xl lg:text-2xl text-gray-900 dark:text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800 }}>
                Find<span className="text-amber-600">A.</span>Sale
              </Link>
              <span className="hidden sm:inline-block text-[10px] font-bold tracking-wider uppercase bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded self-start mt-1">Beta</span>
            </div>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center space-x-3 mx-6" aria-label="Main navigation">
              {/* Static nav links for all users (includes discovery pages and utilities) */}
              {staticNavLinks.map(({ href, label }) => (
                <Link key={href} href={href} className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400">{label}</Link>
              ))}

              {/* Explore dropdown */}
              <div className="relative" onMouseLeave={() => setExploreOpen(false)}>
                <button
                  onMouseEnter={() => setExploreOpen(true)}
                  onClick={() => setExploreOpen(true)}
                  className="flex items-center gap-1 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400"
                >
                  Explore
                  <svg className="w-3 h-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {/* Invisible bridge: prevents mouseleave gap between button and dropdown */}
                <div className="absolute top-full left-0 w-full h-2" />
                {exploreOpen && (
                  <div className="absolute top-full left-0 mt-2 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-warm-200 dark:border-gray-700 py-1 z-50">
                    <Link href="/feed" onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700">
                      <Zap size={14} className="text-amber-500" /> Feed
                    </Link>
                    <Link href="/calendar" onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700">
                      <Calendar size={14} className="text-amber-500" /> Calendar
                    </Link>
                    <Link href="/shopper/wishlist" onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700">
                      <Heart size={14} className="text-rose-500" /> Wishlist
                    </Link>
                    <Link href="/clearance" onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700">
                      <Tag size={14} className="text-amber-500" /> Clearance
                    </Link>
                    <hr className="my-1 border-warm-100 dark:border-gray-700" />
                    <Link href="/categories" onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700">
                      <Tag size={14} className="text-amber-500" /> Categories
                    </Link>
                    <Link href="/encyclopedia" onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700">
                      <BookOpen size={14} className="text-amber-500" /> Encyclopedia
                    </Link>
                    <Link href="/guides" onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700">
                      <FileText size={14} className="text-amber-500" /> Guides
                    </Link>
                  </div>
                )}
              </div>

              {/* Desktop collapsible search: overlays nav when open */}
              <div className="relative flex items-center">
                <button
                  onClick={() => setIsSearchOpen(prev => !prev)}
                  className="p-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  aria-label={isSearchOpen ? 'Close search' : 'Open search'}
                >
                  <Search size={20} />
                </button>
                {isSearchOpen && (
                  <form onSubmit={handleHeaderSearch} role="search"
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-50">
                    <div className="relative">
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
                        placeholder="Search..."
                        aria-label="Search sales and items"
                        className="pl-9 pr-3 py-1.5 text-sm border border-amber-500 dark:border-amber-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 w-64 shadow-lg"
                      />
                    </div>
                  </form>
                )}
              </div>

              {/* Pricing link */}
              <Link
                href="/pricing"
                className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400"
              >
                Pricing
              </Link>

              {/* "Host a Sale" CTA for logged-in shoppers without ORGANIZER role */}
              {isClient && user && user.roles?.includes('USER') && !user?.roles?.includes('ORGANIZER') && (
                <button
                  onClick={() => setShowBecomeOrganizerModal(true)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white rounded-md font-medium text-sm whitespace-nowrap"
                >
                  Host a Sale
                </button>
              )}
            </nav>

            {/* Desktop right-side nav (Saved, Messages, Profile + Auth) */}
            <div className="hidden lg:flex items-center space-x-3">
              {user ? (
                <>
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
                  <div className="border-l border-warm-300 dark:border-gray-700 pl-3 flex items-center gap-1">
                    <NotificationBell />
                    {!['/login', '/register', '/forgot-password'].includes(router.pathname) && !router.pathname.startsWith('/organizer') && (
                      <QRScannerButton variant="compact" />
                    )}
                    <CartIcon />
                    {isLowBandwidth && (
                      <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700" title="Low-Bandwidth Mode is on, so photos are optimized for slow connections">
                        Low BW
                      </span>
                    )}
                    <AvatarDropdown onBecomeOrganizer={() => setShowBecomeOrganizerModal(true)} />
                  </div>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400">Login</Link>
                  <Link href="/register" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md">Register</Link>
                </>
              )}
            </div>

            {/* Mobile: notification bell + QR scanner + cart + hamburger */}
            <div className="lg:hidden flex items-center gap-1">
              {isClient && user && (
                <>
                  <NotificationBell />
                  {!['/login', '/register', '/forgot-password'].includes(router.pathname) && !router.pathname.startsWith('/organizer') && (
                    <QRScannerButton variant="compact" />
                  )}
                  <CartIcon />
                </>
              )}
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
          <div className="flex items-center gap-2">
            <span className="text-lg text-gray-900 dark:text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800 }}>Find<span className="text-amber-600">A.</span>Sale</span>
            <span className="text-[10px] font-bold tracking-wider uppercase bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded self-start mt-0.5">Beta</span>
          </div>
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
                {/* User info: name, email, rank badge, XP bar */}
                {isClient && user && (
                  <div className="px-3 py-2 mb-1 border-b border-warm-200 dark:border-gray-700">
                    <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 truncate">{user.name || user.email}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                    {xpProfile && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          {xpProfile.explorerRank === 'INITIATE' ? (
                            <Compass className="w-3.5 h-3.5 text-blue-500" />
                          ) : (
                            <span className="text-sm leading-none">
                              {xpProfile.explorerRank === 'SCOUT' ? '🔍' : xpProfile.explorerRank === 'RANGER' ? '🎯' : xpProfile.explorerRank === 'SAGE' ? '✨' : '👑'}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                            {xpProfile.explorerRank.charAt(0) + xpProfile.explorerRank.slice(1).toLowerCase()}
                          </span>
                        </div>
                        {xpProfile.rankProgress && (
                          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full max-w-[100px] overflow-hidden">
                            <div
                              className="h-full bg-indigo-500"
                              style={{
                                width: xpProfile.rankProgress.nextRank
                                  ? `${Math.min((xpProfile.rankProgress.currentXp / xpProfile.rankProgress.nextRankXp) * 100, 100)}%`
                                  : '100%',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ADMIN Section: Collapsible (ADMIN role) */}
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
                          <Package size={14} className="inline mr-2" /> Manage Items
                        </Link>
                        <Link href="/admin/reports" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <BarChart2 size={14} className="inline mr-2" /> Reports
                        </Link>
                        <Link href="/admin/feature-flags" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Lightbulb size={14} className="inline mr-2" /> Feature Flags
                        </Link>
                        <Link href="/admin/broadcast" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <MessageSquare size={14} className="inline mr-2" /> Broadcast Message
                        </Link>
                        <Link href="/admin/ab-tests" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Lightbulb size={14} className="inline mr-2" /> A/B Tests
                        </Link>
                        <Link href="/admin/bid-review" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <MessageSquare size={14} className="inline mr-2" /> Bid Review
                        </Link>
                        <Link href="/admin/scraper" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Activity size={14} className="inline mr-2" /> Scraper Management
                        </Link>
                        <Link href="/admin/scrape-pool" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Activity size={14} className="inline mr-2" /> Scrape Pool
                        </Link>

                        <Link href="/admin/disputes" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <MessageSquare size={14} className="inline mr-2" /> Disputes
                        </Link>
                        <Link href="/admin/invites" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Users size={14} className="inline mr-2" /> Invites
                        </Link>
                        <Link href="/admin/social-accounts" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <Share2 size={14} className="inline mr-2" /> Social Accounts
                        </Link>
                        <Link href="/admin/encyclopedia" className="block px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                          <BookOpen size={14} className="inline mr-2" /> Encyclopedia
                        </Link>
                      </>
                    )}

                    <hr className="my-2 border-warm-200 dark:border-gray-700" />
                  </>
                )}

                {/* Quick Links */}
                {mobileCoreLinks('top')}

                {/* Your Sales Section: Collapsible */}
                <button
                  onClick={() => setMobileYourSalesOpen(!mobileYourSalesOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <span className="flex items-center gap-2"><Store size={14} /> Your Sales</span>
                  <ChevronRight
                    size={16}
                    className={`transition-transform duration-200 ${mobileYourSalesOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {mobileYourSalesOpen && (
                  <>
                    {mobileCoreLinks('yourSales')}
                  </>
                )}

                {/* In-Sale Tools Section: Collapsible */}
                <button
                  onClick={() => setMobileInSaleToolsOpen(!mobileInSaleToolsOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <span className="flex items-center gap-2"><Share2 size={14} /> In-Sale Tools</span>
                  <ChevronRight
                    size={16}
                    className={`transition-transform duration-200 ${mobileInSaleToolsOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {mobileInSaleToolsOpen && (
                  <>
                    {mobileCoreLinks('inSaleTools')}
                  </>
                )}

                {/* Post Sales Section: Collapsible */}
                <button
                  onClick={() => setMobilePostSalesOpen(!mobilePostSalesOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <span className="flex items-center gap-2"><Activity size={14} /> Post Sales</span>
                  <ChevronRight
                    size={16}
                    className={`transition-transform duration-200 ${mobilePostSalesOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {mobilePostSalesOpen && (
                  <>
                    {mobileCoreLinks('postSales')}
                  </>
                )}

                <Link href="/organizer/subscription" className="block px-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                  <Zap size={14} className="inline mr-2" /> {!tierKnown ? 'Subscription' : canAccess('TEAMS') ? 'Subscription' : canAccess('PRO') ? 'Upgrade to TEAMS' : 'Upgrade to PRO'}
                </Link>

                {mobileCoreLinks('account')}

                {/* Pro Tools Section: Collapsible */}
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
                    {tierKnown && !canAccess('PRO') && (
                      <Link href="/organizer/subscription" className="block px-3 py-2 text-xs text-purple-600 dark:text-purple-400 hover:underline">
                        Upgrade to PRO for advanced tools
                      </Link>
                    )}
                    {/* Rendered from lib/organizerNav.ts PRO_NAV_ENTRIES (shared with the desktop sidebar and AvatarDropdown). */}
                    {proNavForSurface('mobileMenu').filter((e) => canAccess(e.requiredTier)).map(({ id, label, href, icon: Icon }) => (
                      <Link key={id} href={href} className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                        <Icon size={14} className="inline mr-2 text-purple-400" /> {label}
                      </Link>
                    ))}
                  </>
                )}

                {/* TEAMS Section: Collapsible (TEAMS tier) */}
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
                        {teamsNavForSurface('mobileMenu').map(({ id, label, href, icon: Icon, group }) => (
                          <Link
                            key={id}
                            href={href}
                            className={`block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md ${
                              group === 'retail'
                                ? 'hover:text-teal-600 dark:hover:text-teal-400'
                                : 'hover:text-amber-600 dark:hover:text-amber-400'
                            }`}
                          >
                            <Icon
                              size={14}
                              className={`inline mr-2 ${group === 'retail' ? 'text-teal-500' : 'text-gray-400'}`}
                            />{' '}
                            {label}
                          </Link>
                        ))}
                      </>
                    )}
                  </>
                )}

                <hr className="my-2 border-warm-200 dark:border-gray-700" />

                {/* Shopper sections for dual-role organizers */}
                {isClient && user?.roles?.includes('USER') && (
                  <>
                    <hr className="my-2 border-warm-200 dark:border-gray-700" />

                    {renderMobileShopperNav()}
                  </>
                )}

              </>
            ) : isClient && user && user?.roles?.includes('USER') ? (
              <>
                {/* User info: name, email, rank badge, XP bar */}
                <div className="px-3 py-2 mb-1 border-b border-warm-200 dark:border-gray-700">
                  <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 truncate">{user.name || user.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                  {xpProfile && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {xpProfile.explorerRank === 'INITIATE' ? (
                          <Compass className="w-3.5 h-3.5 text-blue-500" />
                        ) : (
                          <span className="text-sm leading-none">
                            {xpProfile.explorerRank === 'SCOUT' ? '🔍' : xpProfile.explorerRank === 'RANGER' ? '🎯' : xpProfile.explorerRank === 'SAGE' ? '✨' : '👑'}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          {xpProfile.explorerRank.charAt(0) + xpProfile.explorerRank.slice(1).toLowerCase()}
                        </span>
                      </div>
                      {xpProfile.rankProgress && (
                        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full max-w-[100px] overflow-hidden">
                          <div
                            className="h-full bg-indigo-500"
                            style={{
                              width: xpProfile.rankProgress.nextRank
                                ? `${Math.min((xpProfile.rankProgress.currentXp / xpProfile.rankProgress.nextRankXp) * 100, 100)}%`
                                : '100%',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Shared With You (mobile) -- 2026-07-30, second follow-up: this is the
                    ACTUAL branch that renders for a real logged-in shopper/team-member
                    (isClient && user && user.roles.includes('USER')) -- the first mobile
                    fix went into `authLinks`, which is dead code for this user shape (only
                    reachable when a logged-in user has neither USER nor ORGANIZER role).
                    Root-caused live: confirmed via DOM inspection against the deployed build
                    that this three-way isOrganizer / isUser / authLinks ternary was missed
                    the first time around. */}
                {(hasVendorBoothsMobile || hasTeamMembershipsMobile) && (
                  <>
                    {hasVendorBoothsMobile && (
                      <Link href="/vendor/booths" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Every booth you have claimed, and your register if one has been shared with you">
                        <Store size={14} className="inline mr-2 text-indigo-500" /> Your Booths
                      </Link>
                    )}
                    {hasTeamMembershipsMobile && (
                      <Link href="/team/registers" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md" title="Every team you belong to, and your register if one has been shared with you">
                        <Users size={14} className="inline mr-2 text-indigo-500" /> Your Teams
                      </Link>
                    )}
                  </>
                )}

                {/* Shopper-only nav: same renderer as the dual-role branch */}
                {renderMobileShopperNav()}
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
                  {!isOrganizer && (
                    <button
                      onClick={() => setShowBecomeOrganizerModal(true)}
                      className="block w-full text-left px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md"
                    >
                      <UserPlus size={14} className="inline mr-2" /> Host a Sale
                    </button>
                  )}
                  {isOrganizer && (
                    <Link href="/organizer/profile" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <UserCircle size={14} className="inline mr-2 text-amber-600" /> My Profile
                    </Link>
                  )}
                  {!isOrganizer && (
                    <Link href="/shopper/explorer-profile" className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                      <UserCircle size={14} className="inline mr-2 text-indigo-500" /> Explorer Profile
                    </Link>
                  )}
                  <Link href={isOrganizer ? "/organizer/settings" : "/shopper/settings"} className="block px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md">
                    <Settings size={14} className={`inline mr-2 ${isOrganizer ? "text-amber-500" : "text-indigo-500"}`} /> Settings
                  </Link>
                  {!isStandalone && (
                    <>
                      <button
                        onClick={handleInstallApp}
                        className="block w-full text-left px-3 py-2 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md"
                      >
                        <Smartphone size={14} className="inline mr-2 text-amber-500" />
                        📲 Install App
                      </button>
                      {showIOSTooltip && (
                        <div className="px-3 py-2 text-xs text-warm-700 dark:text-warm-300 bg-warm-50 dark:bg-gray-800 rounded-md mx-2 mt-1">
                          Tap the Share button (↑) below, then select "Add to Home Screen"
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-sm text-warm-900 dark:text-warm-100">
                  <span>Appearance</span>
                  <ThemeToggle compact={true} />
                </div>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-3 py-2 mt-1 text-sm text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-md"
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
        className="flex-grow pt-[92px] md:pt-16 pb-15 md:pb-0"
      >
        {/* Feature #75: Tier Lapse Banner (hard gate for past_due organizers) */}
        {isClient && isOrganizer && isLapsed && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b-2 border-amber-300 dark:border-amber-700 px-4 py-3 sticky top-[92px] md:top-16 z-40">
            <div className="container mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <ShieldAlert size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  Your subscription payment failed. Update your billing to restore access.
                </p>
              </div>
              <Link
                href="/organizer/subscription"
                className="flex-shrink-0 font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline whitespace-nowrap"
              >
                Update billing →
              </Link>
            </div>
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {/* Bottom tab navigation: mobile only */}
      <BottomTabNav />

      {/* Footer: hidden if noFooter prop is true (e.g., for chat pages) */}
      {!noFooter && (
      <footer className="bg-warm-800 dark:bg-gray-950 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-lg font-bold mb-4">FindA.Sale</h3>
              <p className="text-warm-400 mb-4">
                Helping you find the best yard sales, garage sales, estate sales, flea markets, auctions, and more near you.
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
                <li><Link href="/pricing" className="text-warm-400 hover:text-white">Pricing</Link></li>
                <li><Link href="/leaderboard" className="text-warm-400 hover:text-white">Leaderboard</Link></li>
                <li><Link href="/contact" className="text-warm-400 hover:text-white">Contact</Link></li>
                <li><Link href="/support" className="text-warm-400 hover:text-white">Support</Link></li>
                <li><Link href="/faq" className="text-warm-400 hover:text-white">FAQ</Link></li>
                <li><Link href="/guides" className="text-warm-400 hover:text-white">Guides</Link></li>
                <li><Link href="/blog" className="text-warm-400 hover:text-white">Blog</Link></li>
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
              <h3 className="text-lg font-bold mb-4">Discover</h3>
              <ul className="space-y-2">
                <li><Link href="/map" className="text-warm-400 hover:text-white">Map</Link></li>
                <li><Link href="/trending" className="text-warm-400 hover:text-white">Trending Sales</Link></li>
                <li><Link href="/search" className="text-warm-400 hover:text-white">Search</Link></li>
                <li><Link href="/categories" className="text-warm-400 hover:text-white">Browse by Category</Link></li>
                <li><Link href="/cities" className="text-warm-400 hover:text-white">Browse by City</Link></li>
                <li><Link href="/sale-index" className="text-warm-400 hover:text-white">The Weekend Sale Index</Link></li>
                <li><Link href="/encyclopedia" className="text-warm-400 hover:text-white">Encyclopedia</Link></li>
                <li><Link href="/guides" className="text-warm-400 hover:text-white">Guides</Link></li>
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
            <p>&copy; {isClient ? new Date().getFullYear() : '2026'} FindA.Sale. All rights reserved.</p>
          </div>
        </div>
      </footer>
      )}

      {/* Unified Cart Drawer (holds + browsing cart) */}
      <CartDrawer isOpen={isCartOpen} onClose={closeCart} />

      {/* Become Organizer Modal */}
      <BecomeOrganizerModal
        isOpen={showBecomeOrganizerModal}
        onClose={() => setShowBecomeOrganizerModal(false)}
      />
    </div>
  );
};

export default Layout;