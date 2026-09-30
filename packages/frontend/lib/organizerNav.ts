/**
 * organizerNav — single source of truth for the organizer TEAMS navigation.
 *
 * WHY THIS EXISTS
 * The TEAMS nav was hand-duplicated across three surfaces (Layout desktop
 * sidebar, Layout mobile menu, AvatarDropdown). They drifted: Shopify and
 * Consignor Payouts were missing from some surfaces, the discount-rules link
 * pointed at a redirect stub in two of them, and one surface used a different
 * label and tier gate for the same feature. Every surface now renders from the
 * data below; each surface keeps its own presentation (icon sizes, classes,
 * grouping, accordion behaviour) and shares only the data.
 *
 * TIER GATES
 * requiredTier is the tier the destination page actually enforces. Verified
 * against the pages themselves, all of which hard-gate at TEAMS:
 *   command-center.tsx TierGate requiredTier="TEAMS"
 *   calendar.tsx       TierGate requiredTier="TEAMS"
 *   members.tsx        "Upgrade to TEAMS" wall
 *   webhooks.tsx       TierGate requiredTier="TEAMS"
 *   workspace.tsx      TierGate requiredTier="TEAMS"
 *   hubs/index.tsx     TierGate requiredTier="TEAMS"
 *   discount-rules.tsx if (!canAccess('TEAMS'))
 *   consignors.tsx     requiredTier="TEAMS"
 *   locations.tsx      TierGate requiredTier="TEAMS"
 *   shopify.tsx        if (tier !== 'TEAMS')
 *   consignor-settlement/index.tsx  ConsignorPayoutsView locked placeholder below TEAMS
 *   stripe-connect.tsx (legacy, no nav entry) if (!canAccess('TEAMS'))
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Calendar,
  UserPlus,
  Webhook,
  Network,
  Store,
  Tag,
  Users,
  MapPin,
  ShoppingBag,
  CreditCard,
  Activity,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Mail,
  Share2,
  BarChart2,
  Palette,
  FileText,
  List,
  PlusCircle,
  Bookmark,
  ShoppingCart,
  Send,
  Package,
  Trophy,
  Ticket,
  Printer,
  DollarSign,
  Wallet,
  Image as ImageIcon,
  Star,
  Camera,
  BookOpen,
  CheckCircle,
  Wifi,
  Gift,
  UserCircle,
  Settings,
  Clock,
  MessageSquare,
} from 'lucide-react';

export type OrganizerTier = 'SIMPLE' | 'PRO' | 'TEAMS';

/**
 * Navigation surfaces that can render organizer entries. Membership is
 * explicit per entry so that a surface showing a smaller set (a bottom tab bar
 * cannot show eleven items) is modelled as data, not as an accidental omission.
 */
export type NavSurface = 'sidebar' | 'mobileMenu' | 'avatarDropdown' | 'bottomTab';

/** Presentation grouping. Only the desktop sidebar renders section headers. */
export type NavGroup =
  | 'top'
  | 'yourSales'
  | 'inSaleTools'
  | 'postSales'
  | 'account'
  | 'teams'
  | 'developerTools'
  | 'workspace'
  | 'retail'
  | 'proTools';

export interface OrganizerNavEntry {
  /** Stable key. Also used as the React key on every surface. */
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Tooltip. Surfaces that show tooltips use it; others ignore it. */
  title?: string;
  /** Tier the destination page enforces. */
  requiredTier: OrganizerTier;
  group: NavGroup;
  surfaces: NavSurface[];
  /** Lower sorts first. */
  priority: number;
  /**
   * Shown in the "Selling tools" quick-access card on the organizer dashboard
   * (see quickAccessNavEntries). Tier labels, lock states and hrefs on that card
   * come straight from this entry, so they cannot drift from the nav.
   */
  quickAccess?: boolean;
}

/**
 * The desktop sidebar currently exposes the Retail entries at PRO, while the
 * pages behind them enforce TEAMS, so PRO organizers reach an upgrade wall.
 * Tightening this to TEAMS would take links away from PRO organizers, which is
 * a product decision rather than a bug fix, so the existing behaviour is
 * preserved here and flagged for a decision. Change this one constant to
 * 'TEAMS' to reconcile it.
 */
// Collapsed to TEAMS 2026-07-28 (Patrick approved). These five retail entries are
// ALSO rendered in the TEAMS accordion, and every destination page hard-gates at
// TEAMS (consignors.tsx, discount-rules.tsx, locations.tsx, shopify.tsx,
// and the consignor-settlement ledger view). Gating the sidebar copy at PRO showed PRO organizers five
// links that walled them on arrival.
export const SIDEBAR_RETAIL_TIER: OrganizerTier = 'TEAMS';

export const TEAMS_NAV_ENTRIES: OrganizerNavEntry[] = [
  {
    id: 'command-center',
    label: 'Command Center',
    href: '/organizer/command-center',
    icon: LayoutDashboard,
    title: 'Multi-sale overview dashboard',
    requiredTier: 'TEAMS',
    group: 'teams',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 10,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    href: '/organizer/calendar',
    icon: Calendar,
    title: 'Plan and coordinate your sales',
    requiredTier: 'TEAMS',
    group: 'teams',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 20,
  },
  {
    id: 'members',
    label: 'Team Members',
    href: '/organizer/members',
    icon: UserPlus,
    title: 'Invite and manage team members',
    requiredTier: 'TEAMS',
    group: 'teams',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 30,
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    href: '/organizer/webhooks',
    icon: Webhook,
    title: 'Send real-time sale events to your own systems',
    requiredTier: 'TEAMS',
    group: 'developerTools',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 40,
  },
  {
    id: 'workspace',
    label: 'Workspace',
    href: '/organizer/workspace',
    icon: Network,
    title: 'Team and member management. TEAMS',
    requiredTier: 'TEAMS',
    group: 'workspace',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 50,
  },
  {
    id: 'hubs',
    label: 'Market Hubs',
    href: '/organizer/hubs',
    icon: Store,
    title: 'Flea market events. TEAMS',
    requiredTier: 'TEAMS',
    group: 'workspace',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 60,
  },
  {
    // Canonical href is /organizer/discount-rules. /organizer/color-rules is a
    // redirect stub (pages/organizer/color-rules.tsx router.replace) that two
    // surfaces were pointing at, costing an extra client-side hop.
    id: 'discount-rules',
    label: 'Discount Rules',
    href: '/organizer/discount-rules',
    icon: Tag,
    title: 'Color-tagged discount rules. TEAMS',
    requiredTier: 'TEAMS',
    group: 'retail',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 70,
  },
  {
    id: 'consignors',
    label: 'Consignors',
    href: '/organizer/consignors',
    icon: Users,
    title: 'Consignors and their payments. TEAMS',
    requiredTier: 'TEAMS',
    group: 'retail',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 80,
  },
  {
    id: 'locations',
    label: 'Locations',
    href: '/organizer/locations',
    icon: MapPin,
    title: 'Multi-location inventory view. TEAMS',
    requiredTier: 'TEAMS',
    group: 'retail',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 90,
  },
  {
    id: 'shopify',
    label: 'Shopify',
    href: '/organizer/shopify',
    icon: ShoppingBag,
    title: 'Cross-list items to your Shopify store. TEAMS',
    requiredTier: 'TEAMS',
    group: 'retail',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 100,
  },
  {
    // Repointed 2026-09-29 (was id 'stripe-connect' -> /organizer/stripe-connect). Stripe is closed;
    // consignors are now paid through Square or settled by the organizer, and the ledger that tracks
    // what each consignor is owed lives at /organizer/consignor-settlement. The old
    // /organizer/stripe-connect page still exists and is reachable by URL only (no nav entry).
    // Group stays 'retail' on purpose: the sidebar only renders the teams/developerTools/workspace/retail
    // groups from TEAMS_NAV_ENTRIES, so a 'postSales' group here would hide the entry on the sidebar.
    id: 'consignor-payouts',
    label: 'Consignor Payouts',
    href: '/organizer/consignor-settlement',
    icon: CreditCard,
    title: 'Work out what each consignor is owed and record what you paid them. TEAMS',
    requiredTier: 'TEAMS',
    group: 'retail',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 110,
  },
];

/**
 * VENDOR BOOTHS -- deliberately NOT a member of TEAMS_NAV_ENTRIES above.
 *
 * "Someone who rents a booth at another person's market" is not a tier, and it is not
 * even necessarily an organizer. Claiming a booth grants no role at all: claimVendorBooth
 * (backend vendorBoothController.ts :537-540) writes only VendorBooth.userId, and a normal
 * signup gets roles ['USER'] (authController.ts :172).
 *
 * The three surfaces that consume this file all render TEAMS_NAV_ENTRIES from INSIDE a
 * tier gate, and none of them reads entry.requiredTier at all:
 *   Layout.tsx :456   `{(isTeams || isAdmin) && (` wraps the teams/developerTools/workspace groups
 *   Layout.tsx :479   `{canAccess(SIDEBAR_RETAIL_TIER) && (` wraps the retail group
 *   Layout.tsx :1285  `{(isTeams || isAdmin) && (` wraps the whole mobile Teams accordion
 *   AvatarDropdown.tsx :821 renders inside the same organizer-only Teams accordion
 * So an entry added to that array would be invisible to exactly the people who need it,
 * whatever requiredTier it carried. Forcing it in would have shipped a dead link.
 *
 * The entry lives here as data so the surfaces can adopt it in one line once someone owns
 * that change, but it is intentionally NOT in TEAMS_NAV_ENTRIES and so is NOT returned by
 * teamsNavForSurface / teamsNavGroupForSurface. Correct placement is OUTSIDE the tier gate,
 * shown to any signed-in user; the destination page decides what to show and renders an
 * empty-state for a user with no booths, so a non-vendor loses nothing by seeing the link.
 * Today the reachable routes to it are the dashboard card (organizer/dashboard.tsx) and the
 * back link on the booth page (vendor-booth/[boothToken].tsx).
 */
export const VENDOR_BOOTHS_NAV_ENTRY: OrganizerNavEntry = {
  id: 'vendor-booths',
  label: 'Your Booths',
  href: '/vendor/booths',
  icon: Store,
  title: 'Booths you rent at other markets',
  // Lowest tier in the union. The destination enforces no tier and no role; this field
  // only exists because OrganizerNavEntry requires it.
  requiredTier: 'SIMPLE',
  group: 'workspace',
  // Empty on purpose: no surface renders it yet, and teamsNavForSurface would not return
  // it in any case since it is not in TEAMS_NAV_ENTRIES.
  surfaces: [],
  priority: 65,
};

/** Entries a surface should render, in display order. */
export function teamsNavForSurface(surface: NavSurface): OrganizerNavEntry[] {
  return TEAMS_NAV_ENTRIES.filter((entry) => entry.surfaces.includes(surface)).sort(
    (a, b) => a.priority - b.priority,
  );
}

/** Entries a surface should render within one presentation group. */
export function teamsNavGroupForSurface(
  surface: NavSurface,
  group: NavGroup,
): OrganizerNavEntry[] {
  return teamsNavForSurface(surface).filter((entry) => entry.group === group);
}

/**
 * PRO_NAV_ENTRIES -- single source of truth for the "Pro Tools" group (2026-09-29).
 *
 * Same drift problem the TEAMS nav had: the Pro Tools list was hand-written in three places
 * (Layout desktop sidebar, Layout mobile menu, AvatarDropdown) and they disagreed. Mobile was
 * missing Auto Markdown, Email Digest and Marketplace Autofill outright, and showed Brand Kit,
 * Insights and Fraud Signals to every tier while desktop hid them below PRO. The Markdown
 * Re-tag List (staff shelf re-tag alert) was in none of the three Pro Tools groups.
 *
 * Each surface renders the entries whose `surfaces` include it, filtered by
 * canAccess(entry.requiredTier), and keeps its own presentation.
 *
 * Every entry here is on all three surfaces (sidebar, mobileMenu, avatarDropdown). Ripples,
 * Line Queue and Message Templates moved to CORE_NAV_ENTRIES (they are free-tier tools, not
 * Pro Tools). Insights and Brand Kit are on the sidebar too now that its separate "Insights"
 * and "Branding" headers are gone. The Markdown Re-tag List is in CORE_NAV_ENTRIES (Post Sales)
 * as a free-tier entry, see the note below.
 *
 * requiredTier is verified against the destination pages (2026-09-29): flip-report,
 * markdown-cycles, fraud-signals, insights, brand-kit and marketplace-extension enforce PRO.
 * Markdown split (Patrick, 2026-09-29, decision D3): the default 50% Day 2 / 75% Day 3 markdown
 * schedule (Sale.markdownEnabled, the "auto markdown" checkbox on edit-sale) is a FREE-TIER feature for
 * every tier, so the Markdown Re-tag List, its daily alert and the mark-retagged actions are free-tier
 * too and live in CORE_NAV_ENTRIES under Post Sales ('markdown-retag', SIMPLE). Only Markdown CYCLES
 * ("Auto Markdown", /organizer/markdown-cycles, the 'markdown-cycles' entry below) stay PRO.
 * Email Digest is PRO too (page gated 2026-09-29; every digest email still carries its own
 * one-click unsubscribe link, so free-tier organizers can opt out).
 * Appraisals is NOT a Pro tool: it is a community, XP-priced feature (requests cost 250+ XP, decision
 * S443; backend is deliberately not tier-gated), so it lives in CORE_NAV_ENTRIES under In-Sale Tools.
 */
export const PRO_NAV_ENTRIES: OrganizerNavEntry[] = [
  {
    id: 'flip-report',
    label: 'Flip Report',
    href: '/organizer/flip-report',
    icon: TrendingUp,
    title: 'Smart analysis of your best-performing item categories',
    requiredTier: 'PRO',
    group: 'proTools',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 20,
  },
  {
    id: 'markdown-cycles',
    label: 'Auto Markdown',
    href: '/organizer/markdown-cycles',
    icon: TrendingDown,
    title: 'Automatic time-based price reductions. PRO',
    requiredTier: 'PRO',
    group: 'proTools',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 30,
    quickAccess: true,
  },
  {
    id: 'fraud-signals',
    label: 'Fraud Signals',
    href: '/organizer/fraud-signals',
    icon: ShieldAlert,
    title: 'Bid bot and fraud detection',
    requiredTier: 'PRO',
    group: 'proTools',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 50,
  },
  {
    id: 'email-digest',
    label: 'Email Digest',
    href: '/organizer/email-digest-preview',
    icon: Mail,
    title: 'Preview your email digest before it sends',
    requiredTier: 'PRO',
    group: 'proTools',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 70,
  },
  {
    id: 'marketplace-extension',
    label: 'Marketplace Autofill',
    href: '/organizer/marketplace-extension',
    icon: Share2,
    title: 'Post your inventory to Facebook Marketplace with the browser extension',
    requiredTier: 'PRO',
    group: 'proTools',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 80,
  },
  {
    id: 'insights',
    label: 'Insights',
    href: '/organizer/insights',
    icon: BarChart2,
    title: 'Advanced analytics and sale performance insights',
    requiredTier: 'PRO',
    group: 'proTools',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 90,
    quickAccess: true,
  },
  {
    id: 'brand-kit',
    label: 'Brand Kit',
    href: '/organizer/brand-kit',
    icon: Palette,
    title: 'Custom logos, colors, and banners for your sale pages',
    requiredTier: 'PRO',
    group: 'proTools',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 100,
  },
];

/** Pro Tools entries a surface should render, in display order (caller applies the tier gate). */
export function proNavForSurface(surface: NavSurface): OrganizerNavEntry[] {
  return PRO_NAV_ENTRIES.filter((entry) => entry.surfaces.includes(surface)).sort(
    (a, b) => a.priority - b.priority,
  );
}

/**
 * CORE ORGANIZER NAV — every organizer-facing link that is not Pro Tools or
 * TEAMS. Same rule as above: one entry, one label, one gate, one href, and an
 * explicit list of the surfaces that render it.
 *
 * Group order on every surface: top → yourSales → inSaleTools → postSales →
 * (Subscription link, hand-rendered: its copy depends on tier) → account →
 * proTools → teams.
 *
 * TIER GATES verified against the destination pages (2026-09-29):
 *   send-invoice.tsx     TierGate requiredTier="PRO"
 *   photo-ops/index.tsx  TierGate requiredTier="PRO"
 *   inventory.tsx        TierGate requiredTier="PRO" (persistent inventory, roadmap #25)
 *   send-update/index.tsx TierGate requiredTier="PRO" (text updates cost real money per message)
 * Every other entry below is open to SIMPLE. print-inventory.tsx is open to
 * everyone (only its marketplace export is PRO) so it stays SIMPLE here.
 *
 * LOCKED ENTRIES ARE HIDDEN, not shown dimmed. That matches the 2026-07-28
 * retail decision (links that wall on arrival are worse than no link). The one
 * upgrade hint lives at the top of the Pro Tools group on every surface.
 *
 * DELIBERATELY NOT HERE
 *  - "Add Items": /organizer/add-items has no saleId and redirects to the
 *    dashboard; the working route is /organizer/add-items/[saleId], reached
 *    from All Sales or the dashboard. The old links were a dead end (avatar) or
 *    a duplicate of All Sales (mobile).
 *  - Subscription/Upgrade: label depends on tier, rendered per surface.
 *  - My Profile / Settings on the avatarDropdown: it renders its own footer
 *    because it also handles dual-role (organizer + shopper) labelling.
 */
export const CORE_NAV_ENTRIES: OrganizerNavEntry[] = [
  { id: 'dashboard', label: 'Organizer Dashboard', href: '/organizer/dashboard', icon: LayoutDashboard, title: 'Your sales at a glance', requiredTier: 'SIMPLE', group: 'top', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 10 },

  { id: 'all-sales', label: 'All Sales', href: '/organizer/sales', icon: List, title: 'Every sale you have created. Pick one to add items', requiredTier: 'SIMPLE', group: 'yourSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 10 },
  { id: 'create-sale', label: 'Create Sale', href: '/organizer/create-sale', icon: PlusCircle, requiredTier: 'SIMPLE', group: 'yourSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 20, quickAccess: true },
  { id: 'plan-sale', label: 'Plan a Sale', href: '/plan', icon: Clock, requiredTier: 'SIMPLE', group: 'yourSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 30 },
  { id: 'holds', label: 'Holds', href: '/organizer/holds', icon: Bookmark, title: 'Reserve items for buyers before the sale starts', requiredTier: 'SIMPLE', group: 'yourSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 40 },
  { id: 'pos', label: 'POS / Checkout', href: '/organizer/pos', icon: ShoppingCart, title: 'Process in-person payments at your sale', requiredTier: 'SIMPLE', group: 'yourSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 50, quickAccess: true },
  { id: 'send-invoice', label: 'Email Invoice', href: '/organizer/send-invoice', icon: Send, title: 'Email a one-off invoice to anyone. No hold, no account required', requiredTier: 'PRO', group: 'yourSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 60 },
  { id: 'ripples', label: 'Sale Ripples', href: '/organizer/ripples', icon: Activity, title: 'Live activity around your sale', requiredTier: 'SIMPLE', group: 'yourSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 70 },

  { id: 'promote', label: 'Share & Promote', href: '/organizer/promote', icon: Share2, title: 'Share and promote your sale', requiredTier: 'SIMPLE', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 10, quickAccess: true },
  { id: 'send-update', label: 'Send Update', href: '/organizer/send-update', icon: MessageSquare, title: 'Text updates to shoppers who opted in. PRO', requiredTier: 'PRO', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 20 },
  { id: 'photo-ops', label: 'Photo Ops', href: '/organizer/photo-ops', icon: Camera, title: 'Mark photo spots at your sale', requiredTier: 'PRO', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 30 },
  { id: 'qr-codes', label: 'QR Codes', href: '/organizer/qr-codes', icon: Tag, title: 'QR codes for your sale and how often they are scanned', requiredTier: 'SIMPLE', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 40, quickAccess: true },
  { id: 'print-kit', label: 'Print Kit', href: '/organizer/print-kit', icon: Printer, title: 'Signs and flyers for your sale', requiredTier: 'SIMPLE', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 50, quickAccess: true },
  { id: 'starter-kit', label: 'Starter Kit', href: '/organizer/starter-kit', icon: BookOpen, title: 'Printable sale day guide. Checklists, pricing tips, day-of runbook', requiredTier: 'SIMPLE', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 60 },
  { id: 'checklist', label: 'Sale Checklist', href: '/organizer/checklist', icon: CheckCircle, title: 'Sale preparation checklist', requiredTier: 'SIMPLE', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 70 },
  { id: 'offline', label: 'Offline Mode', href: '/organizer/offline', icon: Wifi, title: 'Keep selling when the connection drops', requiredTier: 'SIMPLE', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 80 },
  { id: 'line-queue', label: 'Line Queue', href: '/organizer/line-queue', icon: Users, title: 'Virtual line management for your sale', requiredTier: 'SIMPLE', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 90 },
  { id: 'appraisals', label: 'Appraisals', href: '/organizer/appraisals', icon: Star, title: 'Ask the community what an item is worth, or help appraise for XP', requiredTier: 'SIMPLE', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 95 },
  { id: 'message-templates', label: 'Message Templates', href: '/organizer/message-templates', icon: FileText, title: 'Saved buyer communication templates', requiredTier: 'SIMPLE', group: 'inSaleTools', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 100 },

  { id: 'inventory', label: 'Inventory', href: '/organizer/inventory', icon: Package, title: 'Manage your persistent inventory across all sales. PRO', requiredTier: 'PRO', group: 'postSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 10 },
  { id: 'orders', label: 'Orders', href: '/organizer/orders', icon: Package, title: 'Orders placed on your sales', requiredTier: 'SIMPLE', group: 'postSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 20 },
  { id: 'markdown-retag', label: 'Markdown Re-tag List', href: '/organizer/markdown-retag', icon: Tag, title: 'Auto-marked-down items that still need a new tag or sticker on the shelf', requiredTier: 'SIMPLE', group: 'postSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 25, quickAccess: true },
  { id: 'bounties', label: 'Bounties', href: '/organizer/bounties', icon: Trophy, title: 'Buyer bounty requests for your sale items', requiredTier: 'SIMPLE', group: 'postSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 30 },
  { id: 'coupons', label: 'Coupons', href: '/coupons', icon: Ticket, title: 'Generate and manage coupons for shoppers and your purchases', requiredTier: 'SIMPLE', group: 'postSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 40 },
  { id: 'print-inventory', label: 'Print & Labels', href: '/organizer/print-inventory', icon: Printer, title: 'Print item sheets, labels and signage', requiredTier: 'SIMPLE', group: 'postSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 50 },
  { id: 'earnings', label: 'Earnings', href: '/organizer/earnings', icon: DollarSign, requiredTier: 'SIMPLE', group: 'postSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 60 },
  { id: 'payouts', label: 'Payouts', href: '/organizer/payouts', icon: Wallet, title: 'Payout schedule and on-demand transfers', requiredTier: 'SIMPLE', group: 'postSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 70 },
  { id: 'ugc-moderation', label: 'Manage Photos', href: '/organizer/ugc-moderation', icon: ImageIcon, title: 'Approve or reject buyer-submitted photos', requiredTier: 'SIMPLE', group: 'postSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 80 },
  { id: 'reputation', label: 'Reputation', href: '/organizer/reputation', icon: Star, title: 'Your organizer rating and trust score', requiredTier: 'SIMPLE', group: 'postSales', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 90 },

  // avatarDropdown renders My Profile / Settings in its own footer (dual-role labels).
  { id: 'my-profile', label: 'My Profile', href: '/organizer/profile', icon: UserCircle, title: 'Your public organizer profile', requiredTier: 'SIMPLE', group: 'account', surfaces: ['sidebar', 'mobileMenu'], priority: 10 },
  { id: 'settings', label: 'Settings', href: '/organizer/settings', icon: Settings, title: 'Account and sale preferences', requiredTier: 'SIMPLE', group: 'account', surfaces: ['sidebar', 'mobileMenu'], priority: 20 },
  { id: 'referrals', label: 'Refer Organizers', href: '/organizer/referrals', icon: Gift, title: 'Refer other organizers. Earn XP and 30-day tier discount', requiredTier: 'SIMPLE', group: 'account', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 30 },
  { id: 'affiliate', label: 'Affiliate Program', href: '/organizer/affiliate', icon: TrendingUp, title: 'Earn commissions by referring other organizers', requiredTier: 'SIMPLE', group: 'account', surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'], priority: 40 },
];

/** Core entries for one surface and group, in display order (caller applies the tier gate). */
export function coreNavGroupForSurface(surface: NavSurface, group: NavGroup): OrganizerNavEntry[] {
  return CORE_NAV_ENTRIES.filter((e) => e.group === group && e.surfaces.includes(surface)).sort(
    (a, b) => a.priority - b.priority,
  );
}

/**
 * Entries for the dashboard "Selling tools" quick-access card (2026-09-29): every entry flagged
 * `quickAccess`, Core first (in list order) then Pro Tools (in priority order). The caller applies
 * useOrganizerTier().canAccess(entry.requiredTier) and renders locked entries as upgrade links, so
 * tier labels and hrefs always match the nav. This replaces the never-rendered SELLING_TOOLS
 * constant in pages/organizer/dashboard.tsx.
 */
export function quickAccessNavEntries(): OrganizerNavEntry[] {
  const core = CORE_NAV_ENTRIES.filter((e) => e.quickAccess);
  const pro = PRO_NAV_ENTRIES.filter((e) => e.quickAccess).sort((a, b) => a.priority - b.priority);
  const teams = TEAMS_NAV_ENTRIES.filter((e) => e.quickAccess).sort((a, b) => a.priority - b.priority);
  return [...core, ...pro, ...teams];
}
