/**
 * shopperNav -- single source of truth for the shopper sections of the MOBILE drawer.
 *
 * WHY THIS EXISTS
 * Layout's mobile drawer rendered the shopper sections twice, once for dual-role
 * (organizer + shopper) accounts and once for shopper-only accounts, hand-copied. They drifted:
 * "My Trails" and "Early Access Cache" existed only in the dual-role copy and "Bounties" only in
 * the shopper-only copy. Both branches now render from this list (union of the two, nothing
 * removed), each with its own accordion state.
 *
 * Scope: mobile drawer only. The desktop sidebar and avatar dropdown keep their own shopper
 * sections for now.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Heart,
  Star,
  Gavel,
  Clock,
  Package,
  Map as MapIcon,
  Calendar,
  Zap,
  Lightbulb,
  TrendingUp,
  Tag,
  Compass,
  Award,
  Camera,
  Sparkles,
  Target,
  Trophy,
  Shield,
  Gift,
  Ticket,
  ArrowLeftRight,
} from 'lucide-react';

export type ShopperNavGroup = 'collection' | 'explore' | 'connect' | 'huntExclusives';

export interface ShopperNavEntry {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: ShopperNavGroup;
  /** Renders a small "(Soon)" tag after the label. */
  soon?: boolean;
}

export const SHOPPER_NAV_ENTRIES: ShopperNavEntry[] = [
  { id: 'wishlist', label: 'Wishlist', href: '/shopper/wishlist', icon: Heart, group: 'collection' },
  { id: 'following', label: 'Following', href: '/shopper/wishlist?tab=sellers', icon: Star, group: 'collection' },
  { id: 'bids', label: 'My Bids', href: '/shopper/bids', icon: Gavel, group: 'collection' },
  { id: 'holds', label: 'My Holds', href: '/shopper/holds', icon: Clock, group: 'collection' },
  { id: 'history', label: 'My History', href: '/shopper/history', icon: Package, group: 'collection' },

  { id: 'map', label: 'Map', href: '/map', icon: MapIcon, group: 'explore' },
  { id: 'calendar', label: 'Calendar', href: '/calendar', icon: Calendar, group: 'explore' },
  { id: 'feed', label: 'Feed', href: '/feed', icon: Zap, group: 'explore' },
  { id: 'inspiration', label: 'Inspiration', href: '/inspiration', icon: Lightbulb, group: 'explore' },
  { id: 'trending', label: 'Trending', href: '/trending', icon: TrendingUp, group: 'explore' },
  { id: 'clearance', label: 'Clearance', href: '/clearance', icon: Tag, group: 'explore' },
  { id: 'treasure-trails', label: 'Treasure Trails', href: '/trails', icon: MapIcon, group: 'explore' },
  { id: 'my-trails', label: 'My Trails', href: '/shopper/trails', icon: Compass, group: 'explore' },
  { id: 'explorer-profile', label: 'Explorer Profile', href: '/shopper/explorer-profile', icon: Award, group: 'explore' },
  { id: 'haul-posts', label: 'Haul Posts', href: '/shopper/haul-posts', icon: Camera, group: 'explore' },
  { id: 'curio', label: 'Curio', href: '/shopper/curio', icon: Sparkles, group: 'explore' },
  { id: 'early-access-cache', label: 'Early Access Cache', href: '/shopper/early-access-cache', icon: Zap, group: 'explore' },
  // Same page as Connect > Bounty Board. Kept only because the shopper-only drawer showed it here
  // (no links removed); candidate for cleanup.
  { id: 'explore-bounties', label: 'Bounties', href: '/shopper/bounties', icon: Target, group: 'explore' },

  { id: 'appraisals', label: 'Appraisals', href: '/shopper/appraisals', icon: Star, group: 'connect' },
  { id: 'bounty-board', label: 'Bounty Board', href: '/shopper/bounties', icon: Target, group: 'connect' },
  { id: 'guild-primer', label: "Explorer's Guild", href: '/shopper/guild-primer', icon: Star, group: 'connect' },
  { id: 'rewards', label: 'Rewards', href: '/coupons', icon: Ticket, group: 'connect' },
  { id: 'leaderboard', label: 'Leaderboard', href: '/leaderboard', icon: Trophy, group: 'connect' },
  { id: 'achievements', label: 'Achievements', href: '/shopper/achievements', icon: Award, group: 'connect' },
  { id: 'reputation', label: 'Reputation', href: '/shopper/reputation', icon: Shield, group: 'connect' },
  { id: 'refer-friend', label: 'Refer a Friend', href: '/referral-dashboard', icon: Gift, group: 'connect' },
  { id: 'trades', label: 'Trades', href: '/shopper/trades', icon: ArrowLeftRight, group: 'connect', soon: true },

  { id: 'rare-finds', label: 'Rare Finds', href: '/shopper/rare-finds', icon: Sparkles, group: 'huntExclusives' },
  { id: 'loot-legend', label: 'Loot Legend', href: '/shopper/loot-legend', icon: Star, group: 'huntExclusives' },
  { id: 'league', label: 'League', href: '/shopper/league', icon: Trophy, group: 'huntExclusives' },
];

export function shopperNavGroup(group: ShopperNavGroup): ShopperNavEntry[] {
  return SHOPPER_NAV_ENTRIES.filter((e) => e.group === group);
}
