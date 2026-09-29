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
 *   stripe-connect.tsx if (!canAccess('TEAMS'))
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
  Scale,
  ShieldAlert,
  Mail,
  Share2,
  BarChart2,
  Palette,
  FileText,
} from 'lucide-react';

export type OrganizerTier = 'SIMPLE' | 'PRO' | 'TEAMS';

/**
 * Navigation surfaces that can render organizer entries. Membership is
 * explicit per entry so that a surface showing a smaller set (a bottom tab bar
 * cannot show eleven items) is modelled as data, not as an accidental omission.
 */
export type NavSurface = 'sidebar' | 'mobileMenu' | 'avatarDropdown' | 'bottomTab';

/** Presentation grouping. Only the desktop sidebar renders section headers. */
export type NavGroup = 'teams' | 'developerTools' | 'workspace' | 'retail' | 'proTools';

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
// stripe-connect.tsx). Gating the sidebar copy at PRO showed PRO organizers five
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
    // Not on 'sidebar': the desktop sidebar already renders Calendar under
    // "Your Sales". Listing it here too would render it twice in one nav.
    id: 'calendar',
    label: 'Calendar',
    href: '/organizer/calendar',
    icon: Calendar,
    title: 'Plan and coordinate your sales',
    requiredTier: 'TEAMS',
    group: 'teams',
    surfaces: ['mobileMenu', 'avatarDropdown'],
    priority: 20,
  },
  {
    // Not on 'sidebar': already rendered under "Selling Tools" there.
    id: 'members',
    label: 'Team Members',
    href: '/organizer/members',
    icon: UserPlus,
    title: 'Invite and manage team members',
    requiredTier: 'TEAMS',
    group: 'teams',
    surfaces: ['mobileMenu', 'avatarDropdown'],
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
    title: 'Consignor portal and payouts management. TEAMS',
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
    id: 'stripe-connect',
    label: 'Consignor Payouts',
    href: '/organizer/stripe-connect',
    icon: CreditCard,
    title: 'Send payouts to consignors. TEAMS',
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
 * An entry is left OFF a surface only where that surface already renders the same link
 * elsewhere in the same nav, to avoid a double link (same rule as Calendar/Team Members above):
 *   ripples          sidebar only  -- mobile has it under Selling, avatar under Sales
 *   insights         not sidebar   -- sidebar has its own "Insights" header (Advanced Analytics)
 *   brand-kit        not sidebar   -- sidebar has its own "Branding" header
 *   message-templates not sidebar  -- sidebar lists it in the general section
 *   line-queue       not sidebar   -- sidebar lists it under Selling Tools
 *
 * requiredTier mirrors the gate these surfaces already applied on desktop (canAccess('PRO')).
 * It has NOT been re-verified against each destination page the way TEAMS_NAV_ENTRIES was.
 * The Markdown Re-tag List is SIMPLE on purpose: the free-tier markdownCron feeds it too.
 */
export const PRO_NAV_ENTRIES: OrganizerNavEntry[] = [
  {
    id: 'ripples',
    label: 'Sale Ripples',
    href: '/organizer/ripples',
    icon: Activity,
    title: 'Free sale performance analytics',
    requiredTier: 'SIMPLE',
    group: 'proTools',
    surfaces: ['sidebar'],
    priority: 10,
  },
  {
    id: 'flip-report',
    label: 'Flip Report',
    href: '/organizer/flip-report',
    icon: TrendingUp,
    title: 'Smart analysis of your best-performing item categories',
    requiredTier: 'SIMPLE',
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
  },
  {
    id: 'markdown-retag',
    label: 'Markdown Re-tag List',
    href: '/organizer/markdown-retag',
    icon: Tag,
    title: 'Auto-marked-down items that still need a new tag or sticker on the shelf',
    requiredTier: 'SIMPLE',
    group: 'proTools',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 40,
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
    id: 'appraisals',
    label: 'Appraisals',
    href: '/organizer/appraisals',
    icon: Scale,
    title: 'Crowdsourced item appraisals (also sold a la carte)',
    requiredTier: 'SIMPLE',
    group: 'proTools',
    surfaces: ['sidebar', 'mobileMenu', 'avatarDropdown'],
    priority: 60,
  },
  {
    id: 'email-digest',
    label: 'Email Digest',
    href: '/organizer/email-digest-preview',
    icon: Mail,
    title: 'Preview your email digest before it sends',
    requiredTier: 'SIMPLE',
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
    surfaces: ['mobileMenu', 'avatarDropdown'],
    priority: 90,
  },
  {
    id: 'brand-kit',
    label: 'Brand Kit',
    href: '/organizer/brand-kit',
    icon: Palette,
    title: 'Custom logos, colors, and banners for your sale pages',
    requiredTier: 'PRO',
    group: 'proTools',
    surfaces: ['mobileMenu', 'avatarDropdown'],
    priority: 100,
  },
  {
    id: 'message-templates',
    label: 'Message Templates',
    href: '/organizer/message-templates',
    icon: FileText,
    title: 'Saved buyer communication templates',
    requiredTier: 'SIMPLE',
    group: 'proTools',
    surfaces: ['mobileMenu', 'avatarDropdown'],
    priority: 110,
  },
  {
    id: 'line-queue',
    label: 'Line Queue',
    href: '/organizer/line-queue',
    icon: Users,
    title: 'Virtual line management for your sale',
    requiredTier: 'SIMPLE',
    group: 'proTools',
    surfaces: ['mobileMenu', 'avatarDropdown'],
    priority: 120,
  },
];

/** Pro Tools entries a surface should render, in display order (caller applies the tier gate). */
export function proNavForSurface(surface: NavSurface): OrganizerNavEntry[] {
  return PRO_NAV_ENTRIES.filter((entry) => entry.surfaces.includes(surface)).sort(
    (a, b) => a.priority - b.priority,
  );
}
