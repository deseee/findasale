/**
 * /guides/[slug] — Individual guide detail page
 *
 * Content source: claude_docs/strategy/guides-drafts/[slug].md (markdown files)
 * Parsed at build time via getStaticProps — no DB queries, fully static ISR.
 *
 * Features:
 * - Manual frontmatter parser (no gray-matter dependency)
 * - Sections split on "## " headings
 * - Related guides sidebar from SECTIONS data (same cluster)
 * - SEO: title, description, canonical URL, og tags, HowTo schema
 * - Dark-mode compatible, mobile responsive
 * - Breadcrumb: Home › Guides › [Guide Title]
 * - fallback: 'blocking', revalidate: 86400
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetStaticPropsContext, GetStaticPropsResult, GetStaticPathsResult } from 'next';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedSection {
  heading: string;
  body: string;
}

interface GuidePageProps {
  slug: string;
  title: string;
  description: string;
  audience: string;
  intro: string;
  sections: ParsedSection[];
  relatedGuides: RelatedGuide[];
  updatedAt: string;
}

interface RelatedGuide {
  slug: string;
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Static cluster data for related-guide lookups
// Mirrors clusters in guides/index.tsx — keep in sync if clusters change.
// Only slug + title + description needed here.
// ---------------------------------------------------------------------------

interface GuideEntry {
  slug: string;
  title: string;
  description: string;
}

interface GuideCluster {
  id: string;
  guides: GuideEntry[];
}

const ALL_CLUSTERS: GuideCluster[] = [
  {
    id: 'setup',
    guides: [
      { slug: 'set-up-your-organizer-account', title: 'Set Up Your Organizer Account', description: 'Create your account, fill in your profile, and get your first sale ready to publish.' },
      { slug: 'connect-stripe-and-receive-your-first-payout', title: 'Connect Stripe and Receive Your First Payout', description: 'Link your bank account through Stripe so payouts land automatically after each sale.' },
      { slug: 'choosing-a-plan-simple-pro-or-teams', title: 'Choosing a Plan: Simple, Pro, or Teams', description: "Compare what each tier includes and figure out which one fits the size of what you're running." },
      { slug: 'add-staff-and-set-their-permissions', title: 'Add Staff and Set Their Permissions', description: 'Invite helpers and control what each person can see and do in your account.' },
      { slug: 'connect-your-workspace', title: 'Connect Your Workspace', description: 'Link multiple organizer accounts under one workspace for multi-team setups.' },
    ],
  },
  {
    id: 'creating-a-sale',
    guides: [
      { slug: 'create-your-first-sale', title: 'Create Your First Sale, Step by Step', description: "Walk through the create-sale form from start to finish." },
      { slug: 'pick-the-right-sale-type', title: "Pick the Right Sale Type for What You're Running", description: 'Yard sale, estate sale, auction, flea market, consignment — understand what each setting does.' },
      { slug: 'schedule-a-sale-and-pick-your-visibility-window', title: 'Schedule a Sale and Pick Your Visibility Window', description: 'Set your dates and control when the public can see your sale listing.' },
      { slug: 'run-a-sale-across-multiple-locations', title: 'Run a Sale Across Multiple Locations (Hubs)', description: 'Manage a multi-address sale from one listing using the Hubs feature.' },
      { slug: 'run-a-permanent-storefront', title: 'Run a Permanent Storefront (Shop Mode)', description: 'Keep a sale listing live year-round for ongoing retail and consignment operations.' },
    ],
  },
  {
    id: 'photo-workflow',
    guides: [
      { slug: 'rapidfire-mode-photograph-an-entire-sale', title: 'Rapidfire Mode: Photograph an Entire Sale in One Pass', description: 'Shoot all your items in a single session. The app handles naming, categories, and price suggestions.' },
      { slug: 'lighting-and-framing-for-better-auto-tagged-photos', title: 'Lighting and Framing for Better Auto-Tagged Photos', description: 'Small changes to how you position items and light them dramatically improve recognition accuracy.' },
      { slug: 'why-some-photos-need-a-retake', title: 'Why Some Photos Need a Retake (and How to Tell)', description: 'Understand what causes a photo to land in the retake queue and how to fix it fast.' },
      { slug: 'multi-angle-photos-for-high-value-items', title: 'Multi-Angle Photos for High-Value Items', description: 'Add extra shots to a single item listing to show condition, markings, and details.' },
      { slug: 'setting-up-photo-stations-for-volume-sales', title: 'Setting Up Photo Stations for Volume Sales', description: 'Organize your shooting area before the session so you can move through 200+ items without stopping.' },
      { slug: 'running-a-photo-session-with-helpers', title: 'Running a Photo Session With Helpers', description: 'Split the work across multiple people — who shoots, who moves items, who reviews.' },
    ],
  },
  {
    id: 'review-publish',
    guides: [
      { slug: 'the-review-queue-from-photo-to-live-listing', title: 'The Review Queue: From Photo to Live Listing', description: 'Everything you photographed waits here. Approve items, adjust prices, and publish in bulk.' },
      { slug: 'pricing-an-item-suggested-price-and-your-override', title: 'Pricing an Item: Suggested Price, Comparable Sales, and Your Override', description: 'Where the suggested price comes from and how to set your own.' },
      { slug: 'picking-the-right-condition-grade', title: 'Picking the Right Condition Grade (with examples)', description: 'S/A/B/C/D explained with real examples.' },
      { slug: 'categories-tags-and-searchability', title: 'Categories, Tags, and Why They Affect Searchability', description: 'How items get surfaced in search and browse.' },
      { slug: 'editing-a-listing-after-its-already-live', title: "Editing a Listing After It's Already Live", description: 'Change price, condition, or description on a published item without taking it down.' },
      { slug: 'what-rare-and-legendary-mean', title: 'What "Rare" and "Legendary" Mean', description: 'How rarity tiers are assigned and what they signal to shoppers browsing your sale.' },
    ],
  },
  {
    id: 'inventory',
    guides: [
      { slug: 'manage-holds-approve-extend-cancel', title: 'Manage Holds: Approve, Extend, Cancel', description: 'Control the holds queue — approve requests, extend deadlines, and release items that go unclaimed.' },
      { slug: 'color-rules-use-tag-colors-for-in-person-sorting', title: 'Color Rules: Use Tag Colors for In-Person Sorting', description: 'Assign colors to price ranges or categories so helpers can sort items without a device.' },
      { slug: 'discount-rules-and-markdown-cycles', title: 'Discount Rules and Markdown Cycles', description: 'Set automatic price reductions on day 2, day 3, or after a sale to move remaining inventory.' },
      { slug: 'print-inventory-sheets', title: 'Print Inventory Sheets for Walk-Through Reference', description: 'Generate a printed list of your items with prices for in-person reference during the sale.' },
      { slug: 'compose-custom-labels-for-your-sale', title: 'Compose Custom Labels for Your Sale', description: 'Print item-level tags with QR codes, price, and condition for physical attachment to items.' },
    ],
  },
  {
    id: 'promotion',
    guides: [
      { slug: 'where-to-post-flyers', title: 'Where to Post Flyers (and How to Use the Tear-Off Flyer)', description: 'The 12 places that actually drive foot traffic.' },
      { slug: 'the-promote-page-share-your-sale-on-8-platforms', title: 'The Promote Page: Share Your Sale on 8 Platforms', description: 'One screen to post to Facebook, Nextdoor, Craigslist, and five more.' },
      { slug: 'yard-signs-and-qr-codes', title: 'Yard Signs and QR Codes: Print, Place, Track', description: 'Generate a QR code, print it on a sign, and watch how many people scan it from the street.' },
      { slug: 'set-up-your-brand-kit', title: 'Set Up Your Brand Kit (logo, colors, custom storefront URL)', description: 'Upload a logo, set accent colors, and claim a shareable URL for your organizer profile.' },
      { slug: 'send-sale-updates-to-followers', title: 'Send Sale Updates to Followers (and what to write)', description: 'Message everyone following your profile with a sale preview or day-of reminder.' },
      { slug: 'built-in-share-cards', title: 'Built-In Share Cards: Pick a Theme and Post It', description: 'Generate a designed sale card and share it directly to social media.' },
    ],
  },
  {
    id: 'sale-day',
    guides: [
      { slug: 'run-the-pos-take-payments-in-person', title: 'Run the POS: Take Payments In Person', description: 'Scan items, add them to a cart, and take cash or card payments right from your phone.' },
      { slug: 'settle-up-reconcile-sales-and-get-your-payout', title: 'Settle Up: Reconcile Sales, Pay Consignors, Get Your Payout', description: 'Close out a sale, split proceeds with consignors, and trigger your payout.' },
      { slug: 'the-line-queue-manage-walk-up-traffic', title: 'The Line Queue: Manage Walk-Up Traffic', description: 'Let customers join a virtual line from their phone so the front door stays clear.' },
      { slug: 'message-templates-and-the-built-in-inbox', title: 'Message Templates and the Built-In Inbox', description: 'Save replies to common questions so you can respond to shoppers in two taps.' },
      { slug: 'treasure-trails-organizer-build-a-multi-stop-route', title: 'Treasure Trails (organizer side): Build a Multi-Stop Route', description: 'Link your sale to others nearby to create a mapped multi-stop shopping route.' },
    ],
  },
  {
    id: 'advanced',
    guides: [
      { slug: 'onboard-a-consignor-and-set-their-split', title: 'Onboard a Consignor and Set Their Split', description: 'Add a consignor, assign their items, and configure the payout percentage before the sale ends.' },
      { slug: 'list-items-on-ebay-from-your-sale', title: 'List Items on eBay From Your Sale', description: 'Cross-list items to eBay directly from the review queue.' },
      { slug: 'connect-shopify-and-cross-list', title: 'Connect Shopify and Cross-List', description: 'Sync your FindA.Sale inventory to a Shopify storefront.' },
      { slug: 'webhooks-and-zapier-send-sale-events-to-your-tools', title: 'Webhooks and Zapier: Send Sale Events to Your Tools', description: 'Trigger automations when items sell, holds are approved, and more.' },
      { slug: 'use-bounties-to-source-items-for-buyers', title: 'Use Bounties to Source Items for Buyers', description: 'Post a wanted-item request so shoppers in the community can bring you things to sell.' },
      { slug: 'read-your-flip-report', title: 'Read Your Flip Report (price calibration over time)', description: 'Track how your prices compare to final sale values over time.' },
    ],
  },
  {
    id: 'discovery',
    guides: [
      { slug: 'find-sales-near-you', title: 'Find Sales Near You: Map, Search, and Calendar', description: "Three ways to browse what's happening this weekend." },
      { slug: 'save-items-to-your-wishlist-and-get-notified', title: 'Save Items to Your Wishlist and Get Notified', description: 'Bookmark items you want and get a push notification if the price drops.' },
      { slug: 'follow-an-organizer', title: 'Follow an Organizer (and What "Following" Means)', description: 'Follow organizers you like and get notified the moment they list a new sale.' },
      { slug: 'browse-by-city-weekend-sale-pages', title: 'Browse by City: Weekend Sale Pages', description: 'City-level pages show every sale in a metro area this weekend.' },
      { slug: 'surprise-me-trending-and-the-inspiration-feed', title: 'Surprise Me, Trending, and the Inspiration Feed', description: "Let the app surface sales and items based on what you've saved." },
      { slug: 'plan-a-day-with-the-sale-planner', title: 'Plan a Day With the Sale Planner', description: 'Pick the sales you want to hit, put them in order, and get a driving route.' },
    ],
  },
  {
    id: 'at-the-sale',
    guides: [
      { slug: 'holds-reserve-an-item-before-you-get-there', title: 'Holds: Reserve an Item Before You Get There', description: "Place a hold on an item so it's set aside while you drive over." },
      { slug: 'what-the-condition-grades-mean-for-shoppers', title: 'What the Condition Grades Mean (with photo examples)', description: 'S, A, B, C, D — what each rating tells you about what you\'re buying.' },
      { slug: 'bidding-on-auction-items', title: 'Bidding on Auction Items', description: 'How online bidding works, when it closes, and what happens if you win.' },
      { slug: 'trade-items-with-other-shoppers', title: 'Trade Items With Other Shoppers', description: 'Propose a trade with another shopper using items from your respective finds.' },
      { slug: 'pay-requests-how-organizers-bill-you', title: 'Pay Requests: How Organizers Bill You (and how to avoid scams)', description: "What a pay request is, how to verify it's real, and how to pay safely." },
      { slug: 'loot-log-track-everything-youve-bought', title: "Loot Log: Track Everything You've Bought", description: "A record of every item you've purchased through FindA.Sale." },
    ],
  },
  {
    id: 'guild',
    guides: [
      { slug: 'hunt-pass-what-you-get-and-whether-its-worth-it', title: "Hunt Pass: What You Get and Whether It's Worth It", description: 'Early access to rare items, exclusive finds, and monthly perks.' },
      { slug: 'how-ranks-work', title: 'How Ranks Work (Initiate to Grandmaster)', description: 'XP, ranks, and what changes at each level.' },
      { slug: 'earning-xp-without-spending-12-ways', title: 'Earning XP Without Spending: 12 Ways That Cost Nothing', description: "Reviews, referrals, streaks, haul posts — all the ways to earn XP that don't require buying anything." },
      { slug: 'rare-finds-and-early-access', title: 'Rare Finds and Early Access: Why Subscribers See Items First', description: 'How the early-access window works and which item tiers qualify for it.' },
      { slug: 'achievements-and-the-hall-of-fame', title: 'Achievements and the Hall of Fame', description: 'One-time awards for milestones — what they are and how to earn them.' },
      { slug: 'streak-rewards-daily-logins', title: 'Streak Rewards: Daily Logins and How to Keep Them Going', description: 'How the daily login streak works and what you earn for keeping it alive.' },
      { slug: 'the-loot-legend', title: 'The Loot Legend: Your Lifetime Spending and Finds', description: "A running tally of everything you've ever found and bought on FindA.Sale." },
    ],
  },
  {
    id: 'community',
    guides: [
      { slug: 'post-a-haul-show-off-what-you-found', title: 'Post a Haul: Show Off What You Found', description: 'Share photos of your best finds with the community and earn XP for each post.' },
      { slug: 'create-or-join-a-crew', title: 'Create or Join a Crew', description: 'Team up with other shoppers, share finds, and compete on the crew leaderboard.' },
      { slug: 'walk-a-treasure-trail', title: 'Walk a Treasure Trail (multi-sale routing)', description: 'Follow a mapped route through multiple sales in one trip.' },
      { slug: 'bounties-get-paid-to-find-items', title: 'Bounties: Get Paid to Find Items for Other Shoppers', description: "Someone posted a wanted item. If you find it at a sale and connect them, you earn a reward." },
      { slug: 'the-leaderboard-and-monthly-league', title: 'The Leaderboard and Monthly League', description: 'How the XP leaderboard resets each month and what the top shoppers win.' },
    ],
  },
  {
    id: 'trust',
    guides: [
      { slug: 'how-organizer-reputation-works', title: 'How Organizer Reputation Works (and Why You Can Trust Ratings)', description: 'Where organizer ratings come from and how FindA.Sale handles fake or unfair reviews.' },
      { slug: 'refer-a-friend-earn-xp-and-coupons', title: 'Refer a Friend, Earn XP and Coupons', description: 'Share your referral link. When a friend signs up and buys or lists, you both earn.' },
      { slug: 'introduce-an-organizer-to-findasale-and-earn-rewards', title: 'Introduce an Organizer to FindA.Sale and Earn Rewards', description: "Refer someone who runs sales and earn a cut of platform fees from their first events." },
      { slug: 'build-your-reputation-as-an-organizer', title: 'Build Your Reputation as an Organizer', description: "Reviews, response rate, and hold-approval speed all affect your public rating." },
      { slug: 'affiliate-links-track-sales-you-promote', title: 'Affiliate Links: Track Sales You Promote', description: 'Generate a link for any sale, share it, and track clicks and purchases that came from you.' },
      { slug: 'the-ripples-page', title: "The Ripples Page: See Who's Talking About Your Sale", description: 'A feed of shares, reposts, and haul mentions that came from your sale.' },
      { slug: 'how-disputes-and-refunds-work', title: 'How Disputes and Refunds Work', description: "What to do when something doesn't go as expected — from both the buyer and seller side." },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helper: find related guides from the same cluster (excluding current slug)
// Returns up to 3 guides.
// ---------------------------------------------------------------------------

function findRelatedGuides(currentSlug: string): RelatedGuide[] {
  for (const cluster of ALL_CLUSTERS) {
    const found = cluster.guides.find((g) => g.slug === currentSlug);
    if (found) {
      return cluster.guides
        .filter((g) => g.slug !== currentSlug)
        .slice(0, 3)
        .map(({ slug, title, description }) => ({ slug, title, description }));
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Helper: resolve path to guides-drafts directory
// __dirname = packages/frontend/pages/guides at build time.
// guides-drafts is 4 levels up, then into claude_docs/strategy/guides-drafts.
// ---------------------------------------------------------------------------

function getGuidesDraftsDir(): string {
  const fromDirname = path.resolve(__dirname, '../../../../claude_docs/strategy/guides-drafts');
  if (fs.existsSync(fromDirname)) {
    return fromDirname;
  }
  // Fallback: cwd = packages/frontend locally
  return path.resolve(process.cwd(), '../../claude_docs/strategy/guides-drafts');
}

// ---------------------------------------------------------------------------
// Helper: parse frontmatter from markdown string
// ---------------------------------------------------------------------------

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatter: Record<string, string> = {};
  const trimmed = raw.trim();

  if (!trimmed.startsWith('---')) {
    return { frontmatter, body: trimmed };
  }

  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) {
    return { frontmatter, body: trimmed };
  }

  const fmBlock = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();

  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) frontmatter[key] = value;
  }

  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// Helper: parse markdown body into intro + sections
// Splits on "## " headings. The h1 title and production-only sections are stripped.
// ---------------------------------------------------------------------------

function parseMarkdownBody(body: string): { intro: string; sections: ParsedSection[] } {
  // Strip h1 line
  const withoutH1 = body.replace(/^#\s+.+\n?/, '').trim();

  // Strip "## Screen capture script" section (internal production note)
  const withoutScreenCapture = withoutH1.replace(/\n## Screen capture script[\s\S]*$/, '').trim();

  // Strip "## Related guides" section — we use cluster data instead
  const withoutRelated = withoutScreenCapture
    .replace(/\n## Related guides[\s\S]*?(?=\n## |$)/, '')
    .trim();

  // Split on "## " headings
  const parts = withoutRelated.split(/\n(?=## )/);

  const introPart = parts[0].trim();

  const sections: ParsedSection[] = [];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    const headingMatch = part.match(/^##\s+(.+)/);
    if (!headingMatch) continue;
    const heading = headingMatch[1].trim();
    const sectionBody = part.slice(headingMatch[0].length).trim();
    sections.push({ heading, body: sectionBody });
  }

  return { intro: introPart, sections };
}

// ---------------------------------------------------------------------------
// Section body renderer — handles ordered lists, unordered lists, Q&A, and paragraphs
// ---------------------------------------------------------------------------

function renderBody(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      nodes.push(
        <ol key={key++} className="list-decimal list-inside space-y-2 text-warm-700 dark:text-warm-300 leading-relaxed mb-4 ml-2">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">{item}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^[-*]\s/, ''));
        i++;
      }
      nodes.push(
        <ul key={key++} className="list-disc list-inside space-y-2 text-warm-700 dark:text-warm-300 leading-relaxed mb-4 ml-2">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">{item}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Q&A block: "**Q: ..."
    if (line.startsWith('**Q:')) {
      const question = line.replace(/^\*\*Q:\s*/, '').replace(/\*\*$/, '');
      i++;
      let answer = '';
      while (i < lines.length) {
        if (lines[i].startsWith('A:')) {
          answer = lines[i].replace(/^A:\s*/, '');
          i++;
        } else if (answer && lines[i] !== '' && !lines[i].startsWith('**Q:')) {
          answer += ' ' + lines[i];
          i++;
        } else {
          break;
        }
      }
      nodes.push(
        <div key={key++} className="mb-4 rounded-lg bg-warm-100 dark:bg-gray-800/80 border border-warm-200 dark:border-gray-700 p-4">
          <p className="font-semibold text-warm-900 dark:text-warm-100 mb-1">{question}</p>
          {answer && <p className="text-warm-700 dark:text-warm-300 leading-relaxed">{answer}</p>}
        </div>
      );
      if (i < lines.length && lines[i] === '') i++;
      continue;
    }

    // Bold label: "**Label:**  rest of text" at start of line
    if (line.startsWith('**') && line.includes(':**')) {
      const boldMatch = line.match(/^\*\*(.+?):\*\*\s*(.*)/);
      if (boldMatch) {
        const label = boldMatch[1];
        let rest = boldMatch[2];
        i++;
        while (
          i < lines.length &&
          lines[i] !== '' &&
          !lines[i].startsWith('**') &&
          !/^\d+\.\s/.test(lines[i]) &&
          !/^[-*]\s/.test(lines[i])
        ) {
          rest += ' ' + lines[i];
          i++;
        }
        nodes.push(
          <p key={key++} className="text-warm-700 dark:text-warm-300 leading-relaxed mb-3">
            <strong className="text-warm-900 dark:text-warm-100">{label}:</strong>{' '}
            {rest}
          </p>
        );
        if (i < lines.length && lines[i] === '') i++;
        continue;
      }
    }

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph — collect until blank line or list/qa
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^[-*]\s/.test(lines[i]) &&
      !lines[i].startsWith('**Q:')
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      nodes.push(
        <p key={key++} className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
          {paragraphLines.join(' ')}
        </p>
      );
    }
  }

  return <>{nodes}</>;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function GuideDetailPage({
  slug,
  title,
  description,
  audience,
  intro,
  sections,
  relatedGuides,
  updatedAt,
}: GuidePageProps) {
  const canonicalUrl = `https://finda.sale/guides/${slug}`;
  const metaTitle = `${title} — FindA.Sale Guide`;
  const audienceLabel =
    audience === 'organizer'
      ? 'For Organizers'
      : audience === 'shopper'
      ? 'For Shoppers'
      : 'FindA.Sale Guide';

  return (
    <>
      <Head>
        <title>{metaTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />

        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://finda.sale/og-default.png" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={description} />

        {/* BreadcrumbList + HowTo schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://finda.sale' },
                  { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://finda.sale/guides' },
                  { '@type': 'ListItem', position: 3, name: title, item: canonicalUrl },
                ],
              },
              {
                '@context': 'https://schema.org',
                '@type': 'HowTo',
                name: title,
                description,
                url: canonicalUrl,
                image: 'https://finda.sale/og-default.png',
                dateModified: updatedAt,
                step: sections.map((s, idx) => ({
                  '@type': 'HowToStep',
                  position: idx + 1,
                  name: s.heading,
                  text: s.body.slice(0, 500),
                })),
              },
            ]),
          }}
        />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Page header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 py-8">
          <div className="max-w-6xl mx-auto px-4">
            {/* Breadcrumb */}
            <nav className="text-sm text-warm-500 dark:text-warm-400 mb-4 flex items-center gap-2 flex-wrap">
              <Link href="/" className="hover:text-amber-600 dark:hover:text-amber-400">
                Home
              </Link>
              <span>›</span>
              <Link href="/guides" className="hover:text-amber-600 dark:hover:text-amber-400">
                Guides
              </Link>
              <span>›</span>
              <span className="text-warm-700 dark:text-warm-300 font-medium">{title}</span>
            </nav>

            <div className="flex items-start gap-3 mb-3">
              <BookOpen size={24} className="text-amber-500 dark:text-amber-400 shrink-0 mt-1" />
              <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 leading-snug">
                {title}
              </h1>
            </div>

            <div className="flex items-center gap-3 text-sm text-warm-500 dark:text-warm-400 ml-9">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium text-xs">
                {audienceLabel}
              </span>
              <span>&#8226;</span>
              <span>
                Updated{' '}
                {new Date(updatedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Main layout */}
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex gap-10 items-start">
            {/* Primary content */}
            <main className="flex-1 min-w-0">
              <Link
                href="/guides"
                className="inline-flex items-center gap-1 text-sm text-warm-500 dark:text-warm-400 hover:text-amber-600 dark:hover:text-amber-400 mb-8 transition-colors"
              >
                <ChevronLeft size={14} />
                All guides
              </Link>

              {/* Intro */}
              {intro && (
                <div className="mb-10">
                  <p className="text-lg text-warm-700 dark:text-warm-300 leading-relaxed">
                    {intro}
                  </p>
                </div>
              )}

              {/* Sections */}
              <div className="space-y-10">
                {sections.map((section, idx) => (
                  <section key={idx}>
                    <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-4 pb-2 border-b border-warm-200 dark:border-gray-700">
                      {section.heading}
                    </h2>
                    <div>{renderBody(section.body)}</div>
                  </section>
                ))}
              </div>

              {/* CTA */}
              <div className="mt-12 bg-amber-50 dark:bg-gray-800 border border-amber-200 dark:border-gray-700 rounded-lg p-8 text-center">
                <p className="text-warm-700 dark:text-warm-300 mb-6 text-base">
                  Ready to put this into practice? Your next sale starts here.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <Link
                    href="/organizer/new"
                    className="inline-block bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
                  >
                    List a Sale
                  </Link>
                  <Link
                    href="/"
                    className="inline-block bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-600 border border-amber-200 dark:border-gray-600 font-medium py-2.5 px-5 rounded-lg transition-colors"
                  >
                    Browse Sales
                  </Link>
                  <Link
                    href="/guides"
                    className="inline-block bg-white dark:bg-gray-700 text-warm-700 dark:text-warm-300 hover:bg-warm-100 dark:hover:bg-gray-600 border border-warm-200 dark:border-gray-600 font-medium py-2.5 px-5 rounded-lg transition-colors"
                  >
                    All Guides
                  </Link>
                </div>
              </div>
            </main>

            {/* Desktop sidebar */}
            {relatedGuides.length > 0 && (
              <aside className="hidden lg:block w-72 shrink-0 sticky top-6">
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-4 uppercase tracking-wide">
                    Related guides
                  </h3>
                  <ul className="space-y-3">
                    {relatedGuides.map((guide) => (
                      <li key={guide.slug}>
                        <Link
                          href={`/guides/${guide.slug}`}
                          className="group flex items-start gap-2 text-sm text-warm-700 dark:text-warm-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                        >
                          <ChevronRight
                            size={14}
                            className="shrink-0 mt-0.5 text-warm-400 dark:text-warm-500 group-hover:text-amber-500 transition-colors"
                          />
                          <span className="leading-snug">{guide.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 pt-4 border-t border-warm-200 dark:border-gray-700">
                    <Link
                      href="/guides"
                      className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
                    >
                      Browse all guides &rarr;
                    </Link>
                  </div>
                </div>
              </aside>
            )}
          </div>

          {/* Mobile related guides */}
          {relatedGuides.length > 0 && (
            <div className="lg:hidden mt-10 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-4 uppercase tracking-wide">
                Related guides
              </h3>
              <ul className="space-y-3">
                {relatedGuides.map((guide) => (
                  <li key={guide.slug}>
                    <Link
                      href={`/guides/${guide.slug}`}
                      className="group flex items-start gap-2 text-sm text-warm-700 dark:text-warm-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                    >
                      <ChevronRight
                        size={14}
                        className="shrink-0 mt-0.5 text-warm-400 dark:text-warm-500 group-hover:text-amber-500 transition-colors"
                      />
                      <span className="leading-snug">{guide.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-700">
                <Link
                  href="/guides"
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
                >
                  Browse all guides &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// getStaticPaths — reads all .md files from guides-drafts at build time
// ---------------------------------------------------------------------------

export async function getStaticPaths(): Promise<GetStaticPathsResult> {
  try {
    const draftsDir = getGuidesDraftsDir();
    const files = fs.readdirSync(draftsDir).filter((f) => f.endsWith('.md'));
    const paths = files.map((f) => ({ params: { slug: f.replace(/\.md$/, '') } }));
    return { paths, fallback: 'blocking' };
  } catch (error) {
    console.error('guides/[slug] getStaticPaths error:', error);
    return { paths: [], fallback: 'blocking' };
  }
}

// ---------------------------------------------------------------------------
// getStaticProps — reads and parses the specific .md file for the slug
// ---------------------------------------------------------------------------

export async function getStaticProps(
  context: GetStaticPropsContext<{ slug: string }>
): Promise<GetStaticPropsResult<GuidePageProps>> {
  const { slug } = context.params || {};

  if (!slug) {
    return { notFound: true };
  }

  try {
    const draftsDir = getGuidesDraftsDir();
    const filePath = path.join(draftsDir, `${slug}.md`);

    if (!fs.existsSync(filePath)) {
      return { notFound: true, revalidate: 3600 };
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const { intro, sections } = parseMarkdownBody(body);

    const title = frontmatter['title'] || slug.replace(/-/g, ' ');
    const audience = frontmatter['audience'] || 'both';

    // Description: first sentence of intro, capped at 160 chars
    const firstSentence = intro.split(/[.\n]/)[0].trim();
    const description =
      firstSentence.length > 160 ? firstSentence.slice(0, 157) + '...' : firstSentence;

    const relatedGuides = findRelatedGuides(slug);

    return {
      props: {
        slug,
        title,
        description,
        audience,
        intro,
        sections,
        relatedGuides,
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      revalidate: 86400,
    };
  } catch (error) {
    console.error('guides/[slug] getStaticProps error for slug:', slug, error);
    return { notFound: true, revalidate: 300 };
  }
}
