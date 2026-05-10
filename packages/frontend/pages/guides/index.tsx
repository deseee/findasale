/**
 * /guides — Guide Library Index Page
 *
 * Static index of all FindA.Sale guides, grouped by audience.
 * Links to /guide/[slug] for individual guide pages (singular route per ADR-075).
 * Uses getStaticProps — no DB queries, fully static.
 *
 * Route shape from guide-and-video-library-plan.md §3:
 *   /guides          → this index page
 *   /guides/<slug>   → individual guide (future — for now links to /guide/[slug] SEO route)
 *
 * Note: The existing /guide/[slug] route serves SEO-targeted city+sale-type pages.
 * The guide drafts in guides-drafts/ will eventually get their own /guides/[slug] route.
 * This index page links to the intended /guides/[slug] paths for forward compatibility.
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetStaticPropsResult } from 'next';
import {
  Camera,
  CheckCircle,
  Users,
  ShoppingBag,
  BookOpen,
  ChevronRight,
  Star,
  Zap,
  DollarSign,
  Megaphone,
  Package,
  Award,
  Heart,
  Globe,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GuideEntry {
  slug: string;
  title: string;
  description: string;
  priority: 'P1' | 'P2' | 'P3';
}

interface GuideCluster {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  guides: GuideEntry[];
}

interface GuideSection {
  id: 'organizer' | 'shopper' | 'both';
  label: string;
  description: string;
  clusters: GuideCluster[];
}

interface GuidesIndexProps {
  totalGuides: number;
}

// ---------------------------------------------------------------------------
// Static guide data — curated from guides-drafts/ and guide-and-video-library-plan.md
// ---------------------------------------------------------------------------

const SECTIONS: GuideSection[] = [
  {
    id: 'organizer',
    label: 'For Organizers',
    description: 'Running a sale? These guides cover every step — from setup through payout.',
    clusters: [
      {
        id: 'setup',
        label: 'Setup & Getting Started',
        icon: CheckCircle,
        color: 'amber',
        guides: [
          {
            slug: 'set-up-your-organizer-account',
            title: 'Set Up Your Organizer Account',
            description: 'Create your account, fill in your profile, and get your first sale ready to publish.',
            priority: 'P1',
          },
          {
            slug: 'connect-stripe-and-receive-your-first-payout',
            title: 'Connect Stripe and Receive Your First Payout',
            description: 'Link your bank account through Stripe so payouts land automatically after each sale.',
            priority: 'P1',
          },
          {
            slug: 'choosing-a-plan-simple-pro-or-teams',
            title: 'Choosing a Plan: Simple, Pro, or Teams',
            description: "Compare what each tier includes and figure out which one fits the size of what you're running.",
            priority: 'P2',
          },
          {
            slug: 'add-staff-and-set-their-permissions',
            title: 'Add Staff and Set Their Permissions',
            description: 'Invite helpers and control what each person can see and do in your account.',
            priority: 'P2',
          },
          {
            slug: 'connect-your-workspace',
            title: 'Connect Your Workspace',
            description: 'Link multiple organizer accounts under one workspace for multi-team setups.',
            priority: 'P3',
          },
        ],
      },
      {
        id: 'creating-a-sale',
        label: 'Creating a Sale',
        icon: Zap,
        color: 'amber',
        guides: [
          {
            slug: 'create-your-first-sale',
            title: 'Create Your First Sale, Step by Step',
            description: "Walk through the create-sale form from start to finish — dates, location, sale type, and visibility.",
            priority: 'P1',
          },
          {
            slug: 'pick-the-right-sale-type',
            title: 'Pick the Right Sale Type for What You\'re Running',
            description: 'Yard sale, estate sale, auction, flea market, consignment — understand what each setting does.',
            priority: 'P1',
          },
          {
            slug: 'schedule-a-sale-and-pick-your-visibility-window',
            title: 'Schedule a Sale and Pick Your Visibility Window',
            description: 'Set your dates and control when the public can see your sale listing.',
            priority: 'P2',
          },
          {
            slug: 'run-a-sale-across-multiple-locations',
            title: 'Run a Sale Across Multiple Locations (Hubs)',
            description: 'Manage a multi-address sale from one listing using the Hubs feature.',
            priority: 'P2',
          },
          {
            slug: 'run-a-permanent-storefront',
            title: 'Run a Permanent Storefront (Shop Mode)',
            description: 'Keep a sale listing live year-round for ongoing retail and consignment operations.',
            priority: 'P3',
          },
        ],
      },
      {
        id: 'photo-workflow',
        label: 'The Photo Workflow (Rapidfire Mode)',
        icon: Camera,
        color: 'amber',
        guides: [
          {
            slug: 'rapidfire-mode-photograph-an-entire-sale',
            title: 'Rapidfire Mode: Photograph an Entire Sale in One Pass',
            description: 'Shoot all your items in a single session. The app handles naming, categories, and price suggestions.',
            priority: 'P1',
          },
          {
            slug: 'lighting-and-framing-for-better-auto-tagged-photos',
            title: 'Lighting and Framing for Better Auto-Tagged Photos',
            description: 'Small changes to how you position items and light them dramatically improve recognition accuracy.',
            priority: 'P1',
          },
          {
            slug: 'why-some-photos-need-a-retake',
            title: 'Why Some Photos Need a Retake (and How to Tell)',
            description: 'Understand what causes a photo to land in the retake queue and how to fix it fast.',
            priority: 'P1',
          },
          {
            slug: 'multi-angle-photos-for-high-value-items',
            title: 'Multi-Angle Photos for High-Value Items',
            description: 'Add extra shots to a single item listing to show condition, markings, and details.',
            priority: 'P2',
          },
          {
            slug: 'setting-up-photo-stations-for-volume-sales',
            title: 'Setting Up Photo Stations for Volume Sales',
            description: 'Organize your shooting area before the session so you can move through 200+ items without stopping.',
            priority: 'P2',
          },
          {
            slug: 'running-a-photo-session-with-helpers',
            title: 'Running a Photo Session With Helpers',
            description: 'Split the work across multiple people — who shoots, who moves items, who reviews.',
            priority: 'P3',
          },
        ],
      },
      {
        id: 'review-publish',
        label: 'Review & Publish',
        icon: CheckCircle,
        color: 'amber',
        guides: [
          {
            slug: 'the-review-queue-from-photo-to-live-listing',
            title: 'The Review Queue: From Photo to Live Listing',
            description: 'Everything you photographed waits here. Approve items, adjust prices, and publish in bulk.',
            priority: 'P1',
          },
          {
            slug: 'pricing-an-item-suggested-price-and-your-override',
            title: 'Pricing an Item: Suggested Price, Comparable Sales, and Your Override',
            description: 'Where the suggested price comes from, how to read the comparable-sale lookup, and how to set your own.',
            priority: 'P1',
          },
          {
            slug: 'picking-the-right-condition-grade',
            title: 'Picking the Right Condition Grade (with examples)',
            description: 'S/A/B/C/D explained with real examples. Getting this right affects searchability and buyer trust.',
            priority: 'P1',
          },
          {
            slug: 'categories-tags-and-searchability',
            title: 'Categories, Tags, and Why They Affect Searchability',
            description: 'How items get surfaced in search and browse — and the two fields that matter most.',
            priority: 'P1',
          },
          {
            slug: 'editing-a-listing-after-its-already-live',
            title: 'Editing a Listing After It\'s Already Live',
            description: 'Change price, condition, or description on a published item without taking it down.',
            priority: 'P2',
          },
          {
            slug: 'what-rare-and-legendary-mean',
            title: 'What "Rare" and "Legendary" Mean (and how items get tagged)',
            description: 'How rarity tiers are assigned and what they signal to shoppers browsing your sale.',
            priority: 'P2',
          },
        ],
      },
      {
        id: 'inventory',
        label: 'Inventory Management',
        icon: Package,
        color: 'amber',
        guides: [
          {
            slug: 'manage-holds-approve-extend-cancel',
            title: 'Manage Holds: Approve, Extend, Cancel',
            description: 'Control the holds queue — approve requests, extend deadlines, and release items that go unclaimed.',
            priority: 'P1',
          },
          {
            slug: 'color-rules-use-tag-colors-for-in-person-sorting',
            title: 'Color Rules: Use Tag Colors for In-Person Sorting',
            description: 'Assign colors to price ranges or categories so helpers can sort items at the sale without a device.',
            priority: 'P2',
          },
          {
            slug: 'discount-rules-and-markdown-cycles',
            title: 'Discount Rules and Markdown Cycles',
            description: 'Set automatic price reductions on day 2, day 3, or after a sale to move remaining inventory.',
            priority: 'P2',
          },
          {
            slug: 'print-inventory-sheets',
            title: 'Print Inventory Sheets for Walk-Through Reference',
            description: 'Generate a printed list of your items with prices for in-person reference during the sale.',
            priority: 'P3',
          },
          {
            slug: 'compose-custom-labels-for-your-sale',
            title: 'Compose Custom Labels for Your Sale',
            description: 'Print item-level tags with QR codes, price, and condition for physical attachment to items.',
            priority: 'P3',
          },
        ],
      },
      {
        id: 'promotion',
        label: 'Promotion & Print Marketing',
        icon: Megaphone,
        color: 'amber',
        guides: [
          {
            slug: 'where-to-post-flyers',
            title: 'Where to Post Flyers (and How to Use the Tear-Off Flyer)',
            description: 'The 12 places that actually drive foot traffic — library boards, laundromats, grocery stores, and more.',
            priority: 'P1',
          },
          {
            slug: 'the-promote-page-share-your-sale-on-8-platforms',
            title: 'The Promote Page: Share Your Sale on 8 Platforms',
            description: 'One screen to post to Facebook, Nextdoor, Craigslist, and five more without copying and pasting.',
            priority: 'P1',
          },
          {
            slug: 'yard-signs-and-qr-codes',
            title: 'Yard Signs and QR Codes: Print, Place, Track',
            description: 'Generate a QR code, print it on a sign, and watch how many people scan it from the street.',
            priority: 'P2',
          },
          {
            slug: 'set-up-your-brand-kit',
            title: 'Set Up Your Brand Kit (logo, colors, custom storefront URL)',
            description: 'Upload a logo, set accent colors, and claim a shareable URL for your organizer profile.',
            priority: 'P2',
          },
          {
            slug: 'send-sale-updates-to-followers',
            title: 'Send Sale Updates to Followers (and what to write)',
            description: 'Message everyone following your profile with a sale preview, price drop alert, or day-of reminder.',
            priority: 'P2',
          },
          {
            slug: 'built-in-share-cards',
            title: 'Built-In Share Cards: Pick a Theme and Post It',
            description: 'Generate a designed sale card — choose a style and share it directly to social media.',
            priority: 'P3',
          },
        ],
      },
      {
        id: 'sale-day',
        label: 'Sale Day & Payments',
        icon: DollarSign,
        color: 'amber',
        guides: [
          {
            slug: 'run-the-pos-take-payments-in-person',
            title: 'Run the POS: Take Payments In Person',
            description: 'Scan items, add them to a cart, and take cash or card payments right from your phone.',
            priority: 'P1',
          },
          {
            slug: 'settle-up-reconcile-sales-and-get-your-payout',
            title: 'Settle Up: Reconcile Sales, Pay Consignors, Get Your Payout',
            description: 'Close out a sale, split proceeds with consignors, and trigger your payout to your bank.',
            priority: 'P1',
          },
          {
            slug: 'the-line-queue-manage-walk-up-traffic',
            title: 'The Line Queue: Manage Walk-Up Traffic',
            description: 'Let customers join a virtual line from their phone so the front door stays clear.',
            priority: 'P2',
          },
          {
            slug: 'message-templates-and-the-built-in-inbox',
            title: 'Message Templates and the Built-In Inbox',
            description: 'Save replies to common questions so you can respond to shoppers in two taps instead of typing.',
            priority: 'P2',
          },
          {
            slug: 'treasure-trails-organizer-build-a-multi-stop-route',
            title: 'Treasure Trails (organizer side): Build a Multi-Stop Route',
            description: 'Link your sale to others nearby to create a mapped multi-stop shopping route for visitors.',
            priority: 'P3',
          },
        ],
      },
      {
        id: 'advanced',
        label: 'Consignment & Advanced',
        icon: Star,
        color: 'amber',
        guides: [
          {
            slug: 'onboard-a-consignor-and-set-their-split',
            title: 'Onboard a Consignor and Set Their Split',
            description: 'Add a consignor, assign their items, and configure the payout percentage before the sale ends.',
            priority: 'P1',
          },
          {
            slug: 'list-items-on-ebay-from-your-sale',
            title: 'List Items on eBay From Your Sale (and what gets through)',
            description: 'Cross-list items to eBay directly from the review queue and understand what the sync covers.',
            priority: 'P1',
          },
          {
            slug: 'connect-shopify-and-cross-list',
            title: 'Connect Shopify and Cross-List',
            description: 'Sync your FindA.Sale inventory to a Shopify storefront for items that need a permanent online home.',
            priority: 'P2',
          },
          {
            slug: 'webhooks-and-zapier-send-sale-events-to-your-tools',
            title: 'Webhooks and Zapier: Send Sale Events to Your Tools',
            description: 'Trigger automations in Zapier, Make, or any webhook receiver when items sell, holds are approved, and more.',
            priority: 'P2',
          },
          {
            slug: 'use-bounties-to-source-items-for-buyers',
            title: 'Use Bounties to Source Items for Buyers',
            description: 'Post a wanted-item request so shoppers in the community can bring you things to sell.',
            priority: 'P3',
          },
          {
            slug: 'read-your-flip-report',
            title: 'Read Your Flip Report (price calibration over time)',
            description: 'Track how your prices compare to final sale values over time and adjust your estimates.',
            priority: 'P3',
          },
        ],
      },
    ],
  },
  {
    id: 'shopper',
    label: 'For Shoppers',
    description: "Looking for a sale or tracking what you've found? Start here.",
    clusters: [
      {
        id: 'discovery',
        label: 'Finding Sales',
        icon: Globe,
        color: 'sage',
        guides: [
          {
            slug: 'find-sales-near-you',
            title: 'Find Sales Near You: Map, Search, and Calendar',
            description: 'Three ways to browse what\'s happening this weekend — map pins, keyword search, and the calendar view.',
            priority: 'P1',
          },
          {
            slug: 'save-items-to-your-wishlist-and-get-notified',
            title: 'Save Items to Your Wishlist and Get Notified',
            description: 'Bookmark items you want and get a push notification if the price drops before the sale ends.',
            priority: 'P1',
          },
          {
            slug: 'follow-an-organizer',
            title: 'Follow an Organizer (and What "Following" Means)',
            description: 'Follow organizers you like and get notified the moment they list a new sale.',
            priority: 'P2',
          },
          {
            slug: 'browse-by-city-weekend-sale-pages',
            title: 'Browse by City: Weekend Sale Pages',
            description: 'City-level pages show every sale in a metro area this weekend — sorted by proximity.',
            priority: 'P2',
          },
          {
            slug: 'surprise-me-trending-and-the-inspiration-feed',
            title: 'Surprise Me, Trending, and the Inspiration Feed',
            description: 'Let the app surface sales and items based on what you\'ve saved and where you are.',
            priority: 'P3',
          },
          {
            slug: 'plan-a-day-with-the-sale-planner',
            title: 'Plan a Day With the Sale Planner',
            description: 'Pick the sales you want to hit, put them in order, and get a driving route.',
            priority: 'P3',
          },
        ],
      },
      {
        id: 'at-the-sale',
        label: 'At the Sale',
        icon: ShoppingBag,
        color: 'sage',
        guides: [
          {
            slug: 'holds-reserve-an-item-before-you-get-there',
            title: 'Holds: Reserve an Item Before You Get There',
            description: 'Place a hold on an item so it\'s set aside while you drive over — no deposits required.',
            priority: 'P1',
          },
          {
            slug: 'what-the-condition-grades-mean-for-shoppers',
            title: 'What the Condition Grades Mean (with photo examples)',
            description: 'S, A, B, C, D — what each rating tells you about what you\'re buying before you see it in person.',
            priority: 'P1',
          },
          {
            slug: 'bidding-on-auction-items',
            title: 'Bidding on Auction Items',
            description: 'How online bidding works, when it closes, and what happens if you win.',
            priority: 'P2',
          },
          {
            slug: 'trade-items-with-other-shoppers',
            title: 'Trade Items With Other Shoppers',
            description: 'Propose a trade with another shopper using items from your respective finds.',
            priority: 'P2',
          },
          {
            slug: 'pay-requests-how-organizers-bill-you',
            title: 'Pay Requests: How Organizers Bill You (and how to avoid scams)',
            description: 'What a pay request is, how to verify it\'s real, and how to pay safely.',
            priority: 'P3',
          },
          {
            slug: 'loot-log-track-everything-youve-bought',
            title: "Loot Log: Track Everything You've Bought",
            description: 'A record of every item you\'ve purchased through FindA.Sale, with photos and prices.',
            priority: 'P3',
          },
        ],
      },
      {
        id: 'guild',
        label: "The Explorer's Guild",
        icon: Award,
        color: 'sage',
        guides: [
          {
            slug: 'hunt-pass-what-you-get-and-whether-its-worth-it',
            title: "Hunt Pass: What You Get and Whether It's Worth It",
            description: 'Early access to rare items, exclusive finds, and monthly perks — broken down plainly.',
            priority: 'P1',
          },
          {
            slug: 'how-ranks-work',
            title: 'How Ranks Work (Initiate to Grandmaster)',
            description: 'XP, ranks, and what changes at each level — from your first find to the top of the leaderboard.',
            priority: 'P1',
          },
          {
            slug: 'earning-xp-without-spending-12-ways',
            title: 'Earning XP Without Spending: 12 Ways That Cost Nothing',
            description: 'Reviews, referrals, streaks, haul posts — all the ways to earn XP that don\'t require buying anything.',
            priority: 'P2',
          },
          {
            slug: 'rare-finds-and-early-access',
            title: 'Rare Finds and Early Access: Why Subscribers See Items First',
            description: 'How the early-access window works and which item tiers qualify for it.',
            priority: 'P2',
          },
          {
            slug: 'achievements-and-the-hall-of-fame',
            title: 'Achievements and the Hall of Fame',
            description: 'One-time awards for milestones — what they are, how to earn them, and where to see them.',
            priority: 'P3',
          },
          {
            slug: 'streak-rewards-daily-logins',
            title: 'Streak Rewards: Daily Logins and How to Keep Them Going',
            description: 'How the daily login streak works and what you earn for keeping it alive.',
            priority: 'P3',
          },
          {
            slug: 'the-loot-legend',
            title: 'The Loot Legend: Your Lifetime Spending and Finds',
            description: 'A running tally of everything you\'ve ever found and bought on FindA.Sale.',
            priority: 'P3',
          },
        ],
      },
      {
        id: 'community',
        label: 'Community',
        icon: Users,
        color: 'sage',
        guides: [
          {
            slug: 'post-a-haul-show-off-what-you-found',
            title: 'Post a Haul: Show Off What You Found',
            description: 'Share photos of your best finds with the community and earn XP for each post.',
            priority: 'P1',
          },
          {
            slug: 'create-or-join-a-crew',
            title: 'Create or Join a Crew',
            description: 'Team up with other shoppers, share finds, and compete on the crew leaderboard.',
            priority: 'P2',
          },
          {
            slug: 'walk-a-treasure-trail',
            title: 'Walk a Treasure Trail (multi-sale routing)',
            description: 'Follow a mapped route through multiple sales in one trip — built by organizers or other shoppers.',
            priority: 'P2',
          },
          {
            slug: 'bounties-get-paid-to-find-items',
            title: 'Bounties: Get Paid to Find Items for Other Shoppers',
            description: "Someone posted a wanted item. If you find it at a sale and connect them, you earn a reward.",
            priority: 'P3',
          },
          {
            slug: 'the-leaderboard-and-monthly-league',
            title: 'The Leaderboard and Monthly League',
            description: 'How the XP leaderboard resets each month and what the top shoppers win.',
            priority: 'P3',
          },
        ],
      },
    ],
  },
  {
    id: 'both',
    label: 'Trust & Community',
    description: 'How the platform works — for anyone using FindA.Sale.',
    clusters: [
      {
        id: 'trust',
        label: 'Reputation & Referrals',
        icon: Heart,
        color: 'warm',
        guides: [
          {
            slug: 'how-organizer-reputation-works',
            title: 'How Organizer Reputation Works (and Why You Can Trust Ratings)',
            description: 'Where organizer ratings come from and how FindA.Sale handles fake or unfair reviews.',
            priority: 'P1',
          },
          {
            slug: 'refer-a-friend-earn-xp-and-coupons',
            title: 'Refer a Friend, Earn XP and Coupons',
            description: 'Share your referral link. When a friend signs up and buys or lists, you both earn.',
            priority: 'P1',
          },
          {
            slug: 'introduce-an-organizer-to-findasale-and-earn-rewards',
            title: 'Introduce an Organizer to FindA.Sale and Earn Rewards',
            description: "Refer someone who runs sales and earn a cut of platform fees from their first events.",
            priority: 'P1',
          },
          {
            slug: 'build-your-reputation-as-an-organizer',
            title: 'Build Your Reputation as an Organizer',
            description: 'Reviews, response rate, and hold-approval speed all affect your public rating — here\'s how.',
            priority: 'P2',
          },
          {
            slug: 'affiliate-links-track-sales-you-promote',
            title: 'Affiliate Links: Track Sales You Promote',
            description: 'Generate a link for any sale, share it, and track clicks and purchases that came from you.',
            priority: 'P2',
          },
          {
            slug: 'the-ripples-page',
            title: 'The Ripples Page: See Who\'s Talking About Your Sale',
            description: 'A feed of shares, reposts, and haul mentions that came from your sale.',
            priority: 'P3',
          },
          {
            slug: 'how-disputes-and-refunds-work',
            title: 'How Disputes and Refunds Work',
            description: "What to do when something doesn't go as expected — from both the buyer and seller side.",
            priority: 'P3',
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Priority badge
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: GuideEntry['priority'] }) {
  if (priority !== 'P1') return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
      <Star size={10} className="fill-current" />
      Start here
    </span>
  );
}

// ---------------------------------------------------------------------------
// Guide card
// ---------------------------------------------------------------------------

function GuideCard({ guide }: { guide: GuideEntry }) {
  return (
    <Link
      href={`/guides/${guide.slug}`}
      className="group flex flex-col gap-2 p-4 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 leading-snug">
          {guide.title}
        </h3>
        <ChevronRight
          size={14}
          className="text-warm-400 dark:text-warm-500 group-hover:text-amber-500 shrink-0 mt-0.5 transition-colors"
        />
      </div>
      <p className="text-xs text-warm-600 dark:text-warm-400 leading-relaxed">
        {guide.description}
      </p>
      <div className="mt-auto pt-1">
        <PriorityBadge priority={guide.priority} />
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Cluster section
// ---------------------------------------------------------------------------

function ClusterSection({ cluster }: { cluster: GuideCluster }) {
  const Icon = cluster.icon;
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-amber-500 dark:text-amber-400 shrink-0" />
        <h3 className="text-base font-semibold text-warm-900 dark:text-warm-100">
          {cluster.label}
        </h3>
        <span className="text-xs text-warm-400 dark:text-warm-500 ml-1">
          {cluster.guides.length} guide{cluster.guides.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cluster.guides.map((guide) => (
          <GuideCard key={guide.slug} guide={guide} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audience section tab
// ---------------------------------------------------------------------------

function AudienceSection({ section }: { section: GuideSection }) {
  const sectionGuideCount = section.clusters.reduce((sum, c) => sum + c.guides.length, 0);
  return (
    <section id={section.id} className="mb-16 scroll-mt-20">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">
            {section.label}
          </h2>
          <span className="text-sm text-warm-400 dark:text-warm-500">
            {sectionGuideCount} guide{sectionGuideCount !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-warm-600 dark:text-warm-400">{section.description}</p>
      </div>
      {section.clusters.map((cluster) => (
        <ClusterSection key={cluster.id} cluster={cluster} />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuidesIndex({ totalGuides }: GuidesIndexProps) {
  const sections = SECTIONS;
  const canonicalUrl = 'https://finda.sale/guides';

  return (
    <>
      <Head>
        <title>Guides — FindA.Sale</title>
        <meta
          name="description"
          content={`${totalGuides} step-by-step guides for sale organizers and shoppers. Learn how to photograph inventory, price items, manage holds, find sales near you, and more.`}
        />
        <link rel="canonical" href={canonicalUrl} />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Guides — FindA.Sale" />
        <meta
          property="og:description"
          content="Step-by-step guides for sale organizers and shoppers. Everything from setting up your account to managing holds and processing payouts."
        />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://finda.sale/og-default.png" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Guides — FindA.Sale" />
        <meta
          name="twitter:description"
          content="Step-by-step guides for sale organizers and shoppers."
        />

        {/* BreadcrumbList schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://finda.sale' },
                { '@type': 'ListItem', position: 2, name: 'Guides', item: canonicalUrl },
              ],
            }),
          }}
        />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Page header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 py-10">
          <div className="max-w-6xl mx-auto px-4">
            {/* Breadcrumb */}
            <nav className="text-sm text-warm-500 dark:text-warm-400 mb-4 flex items-center gap-2">
              <Link href="/" className="hover:text-amber-600 dark:hover:text-amber-400">
                Home
              </Link>
              <span>›</span>
              <span className="text-warm-700 dark:text-warm-300 font-medium">Guides</span>
            </nav>

            <div className="flex items-center gap-3 mb-3">
              <BookOpen size={28} className="text-amber-500 dark:text-amber-400" />
              <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">
                FindA.Sale Guides
              </h1>
            </div>
            <p className="text-warm-600 dark:text-warm-400 max-w-2xl">
              Step-by-step guides for organizers and shoppers. Each one covers a single feature from start to finish — written for someone doing the thing right now, not reading ahead.
            </p>

            {/* Audience jump links */}
            <div className="flex flex-wrap gap-3 mt-6">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full border border-warm-200 dark:border-gray-600 text-warm-700 dark:text-warm-300 bg-white dark:bg-gray-700 hover:border-amber-400 dark:hover:border-amber-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                >
                  {section.label}
                  <span className="text-warm-400 dark:text-warm-500 text-xs">
                    ({section.clusters.reduce((sum, c) => sum + c.guides.length, 0)})
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Guides content */}
        <main className="max-w-6xl mx-auto px-4 py-12">
          {sections.map((section) => (
            <AudienceSection key={section.id} section={section} />
          ))}

          {/* Footer CTA */}
          <div className="bg-amber-50 dark:bg-gray-800 border border-amber-200 dark:border-gray-700 rounded-lg p-8 text-center">
            <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-3">
              Ready to get started?
            </h2>
            <p className="text-warm-600 dark:text-warm-400 mb-6 max-w-md mx-auto">
              Have a question that isn't covered here? Check the FAQ or reach out — we read every message.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link
                href="/faq"
                className="inline-block bg-white dark:bg-gray-700 border border-warm-200 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-400 dark:hover:border-amber-500 font-medium py-2.5 px-5 rounded-lg transition-colors"
              >
                Browse the FAQ
              </Link>
              <Link
                href="/organizer/new"
                className="inline-block bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
              >
                List a Sale
              </Link>
              <Link
                href="/"
                className="inline-block bg-white dark:bg-gray-700 border border-warm-200 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-400 dark:hover:border-amber-500 font-medium py-2.5 px-5 rounded-lg transition-colors"
              >
                Browse Sales
              </Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// getStaticProps — fully static, no DB queries
// ---------------------------------------------------------------------------

export async function getStaticProps(): Promise<GetStaticPropsResult<GuidesIndexProps>> {
  const totalGuides = SECTIONS.reduce(
    (sum, section) =>
      sum + section.clusters.reduce((cSum, cluster) => cSum + cluster.guides.length, 0),
    0
  );

  return {
    props: {
      totalGuides,
    },
    revalidate: 86400, // 24-hour ISR cache
  };
}
