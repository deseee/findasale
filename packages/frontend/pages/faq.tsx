/**
 * CA7: Expanded FAQ Page
 * Shopper + Organizer tabs, comprehensive Q&As.
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

const shopperFAQs: FAQItem[] = [
  {
    question: 'How do I find sales near me?',
    answer: (
      <>
        Open the FindA.Sale app and use the map or search feature. Sales are sorted by proximity to
        your location by default. You can also filter by sale type, date range,
        or search for specific items or locations. Follow your favorite organizers to get notified
        when they post new sales.
      </>
    ),
  },
  {
    question: 'How do I search for specific items?',
    answer: (
      <>
        Use the search bar to type what you're looking for — "vintage lamps," "oak furniture," "comic books," etc.
        Results show all matching items across current and upcoming sales in your area. Browse by
        category or use tags to narrow results further.
      </>
    ),
  },
  {
    question: 'How does bidding on auction items work?',
    answer: (
      <>
        In an auction, items go to the highest bidder. Place a bid, and if someone outbids you,
        you'll receive a notification. Bidding continues until the auction end time — the highest bid
        at closing wins. Auction end times are clearly marked so you always know the deadline.
      </>
    ),
  },
  {
    question: 'What is a Hold or Reservation?',
    answer: (
      <>
        A hold lets you request that an item be set aside for you until the sale opens. The organizer
        can accept or decline your request. Holds are useful for high-value or popular items you want
        to secure before opening day. Accepted holds are marked on the item listing.
      </>
    ),
  },
  {
    question: 'How do I complete a purchase?',
    answer: (
      <>
        Click <strong>Buy Now</strong> on any item, review your order, and complete checkout with your
        card via Stripe. Once payment goes through, the item is marked sold and you'll receive a
        confirmation. Coordinate pickup directly with the organizer — their contact info is on the sale page.
      </>
    ),
  },
  {
    question: 'What payment methods are accepted?',
    answer: (
      <>
        FindA.Sale accepts all major credit and debit cards (Visa, Mastercard, American Express,
        Discover) through Stripe. Cash, and other payment methods are handled at the sale location 
        using the FindA.Sale Point of Sale platform.
      </>
    ),
  },
   {
    question: 'What is the Explorer\'s Guild?',
    answer: (
      <>
        The Explorer's Guild is our loyalty rewards program. You earn Guild XP by visiting sales, making 
        purchases, and completing seasonal challenges. As you earn XP, you progress through ranks — 
        Initiate, Scout, Ranger, Sage, and Grandmaster — each new rank unlocks perks like coupons, longer 
        hold times, Hunt Pass discounts and more! Accumulate XP to unlock discounts on future purchases. 
        View your balance and redemption options at <strong>Account → Loyalty</strong>.
      </>
    ),
  },
  {
    question: 'What is Hunt Pass and how do I earn points?',
    answer: (
      <>
        Hunt Pass is the fun and competitive side of the Explorers Guild. For $4.99/month, you get 1.5x XP multiplier on all actions, 6-hour early access to Rare items and 12-hour early access to Legendary items before the general public, seasonal challenges with exclusive cosmetics, and priority trail recommendations. Hunt Pass also unlocks Treasure Trails and early flash deal notifications.
      </>
    ),
  },
  {
    question: 'How do I earn XP?',
    answer: (
      <>
        You earn XP from a wide range of activities. Main sources include: purchasing items ($1 spent = 10 XP), walking into a sale (2 XP per check-in, max 2 per day), posting haul reviews (30 XP), submitting appraisals (5 XP), and referring friends (500 XP per friend purchase). You also earn XP from Treasure Trails, QR code scans (3 XP), community activities, and streak bonuses. Visit your <strong>Account → Loyalty</strong> page to see all available actions and track your progress.
      </>
    ),
  },
  {
    question: 'What happens to my rank each year?',
    answer: (
      <>
        The Explorer's Guild resets ranks on January 1st each year. If you're at Grandmaster, you drop one tier to Sage. Scout and Initiate ranks don't drop — they stay the same. Crucially, <strong>Grandmaster receives free Hunt Pass forever</strong>, even after dropping to Sage, so reaching the top tier is a permanent achievement with lasting value.
      </>
    ),
  },
  {
    question: 'How do I follow an organizer?',
    answer: (
      <>
        On any sale detail page, click <strong>Follow</strong> to stay connected to that organizer.
        You'll receive notifications when they create new sales, and their listings appear first in
        your search results. Manage followed organizers in your account preferences.
      </>
    ),
  },
  {
    question: 'How do push notifications work?',
    answer: (
      <>
        Enable notifications in your account settings to get alerted when sales you're watching are
        about to start, when popular items are running low, or when organizers you follow post new
        sales. Toggle notifications on or off at any time, or customize which types of alerts you receive.
      </>
    ),
  },
  {
    question: 'What is the return and refund policy?',
    answer: (
      <>
        Secondhand sale items are generally sold as-is. If an item arrives damaged or doesn't match its
        description, contact the organizer immediately with photos. The organizer may offer a refund
        at their discretion. If you can't resolve the issue, contact{' '}
        <Link href="/contact" className="text-amber-600 hover:underline">our support team</Link> for assistance.
        All refunds are returned to your original payment method.
      </>
    ),
  },
  {
    question: 'How do I contact an organizer?',
    answer: (
      <>
        Click the organizer's name on the sale page to open their profile, then click <strong>Message</strong> to
        send a direct message. Most organizers respond within a few hours.
      </>
    ),
  },
  {
    question: 'How do I report a problem with an item?',
    answer: (
      <>
        Contact the organizer directly through the messaging system with photos of the issue. If the
        organizer doesn't respond, reach out to{' '}
        <Link href="/contact" className="text-amber-600 hover:underline">FindA.Sale support</Link> and
        we'll help mediate.
      </>
    ),
  },
  {
    question: 'What are seasonal challenges?',
    answer: (
      <>
        Each season (Spring, Summer, Fall, Winter) brings themed challenges — like visiting a certain number of sales or collecting items in specific categories. 
        Complete challenges to earn bonus XP and exclusive seasonal badges.
      </>
    ),
  },
  {
    question: 'What is a Condition Rating?',
    answer: (
      <>
        Every item on FindA.Sale has a condition rating: S = Like New, A = Excellent, B = Good, C = Fair, D = Poor,. These help you know what to expect before you visit.
        See our full Condition Guide for details.
      </>
    ),
  },
  {
    question: 'What are Treasure Trails?',
    answer: (
      <>
        Treasure Trails are curated routes that combine estate sale shopping, thrift store visits, and local points of interest into one adventure. A Trail might take you from a Saturday morning estate sale to a vintage shop downtown to a scenic overlook on the way home. Each stop is mapped. You check in at locations along the way, rate the trail when you're done, and earn XP for completing it. Hunt Pass subscribers can create their own trails and share them with the community — and earn XP every time someone new completes a trail they built.
      </>
    ),
  },
  {
    question: 'What do item rarity tiers mean?',
    answer: (
      <>
        Every item on FindA.Sale is automatically assigned a rarity tier based on its category, condition, estimated value, and our Smart Pricing analysis:
        <ul className="mt-2 ml-4 space-y-1">
          <li><strong>Common</strong> — Everyday household items, standard furniture, common clothing</li>
          <li><strong>Uncommon</strong> — Quality pieces with good condition ratings, desirable but not rare</li>
          <li><strong>Rare</strong> — Vintage, collectible, or high-value items that don't come up often</li>
          <li><strong>Legendary</strong> — Museum-quality, one-of-a-kind, or exceptionally rare finds</li>
        </ul>
        Higher rarity items are surfaced in the <strong>Rare Finds</strong> feed available to Hunt Pass subscribers. Rarity is set automatically — organizers can't manually inflate it.
      </>
    ),
  },
  {
    question: 'What is the Rare Finds feed?',
    answer: (
      <>
        Rare Finds is a curated feed exclusively for Hunt Pass subscribers that shows RARE and LEGENDARY items from sales in your area. Hunt Pass members see Rare items 6 hours early and Legendary items 12 hours early — before the general public. It's the best way to stay ahead of serious competition on the finds that matter most.
      </>
    ),
  },
  {
    question: 'What is a Treasure Hunt scan and how do QR codes work?',
    answer: (
      <>
        Each item at a participating sale has a QR sticker printed by the organizer. When you scan an item's QR code at the sale, you earn 3 XP (Hunt Pass: 4.5 XP). Scanning also pulls up the item's full listing so you can check price, condition, and description right from your phone. It's like a built-in shopping assistant at every sale you attend.
      </>
    ),
  },
  {
    question: 'What is a Bounty?',
    answer: (
      <>
        A Bounty is a request you post for a specific item you've been hunting for. Describe what you're looking for — "vintage Danish modern dining table," "1960s Pyrex set in pink" — and participating organizers can match and fulfill your request if they come across it. You get notified when a match is found. It's a way to turn passive hunting into active discovery.
      </>
    ),
  },
  {
    question: 'What are Flash Deals?',
    answer: (
      <>
        Flash Deals are time-limited discounts posted by organizers — usually on the last day of a sale when they want to move remaining inventory fast. Standard users are notified when a Flash Deal goes live. Hunt Pass subscribers are notified 6 hours early, giving them first access to the best deals before the crowd.
      </>
    ),
  },
  {
    question: 'What is the Loot Legend?',
    answer: (
      <>
        The Loot Legend is your personal collection showcase. Every notable purchase, earned badge, and completed challenge adds to it. You can make your Loot Legend public so other collectors can see your best finds, or keep it private. It's your FindA.Sale identity — a record of your collecting history.
      </>
    ),
  },
  {
    question: 'What are Crowd Appraisals?',
    answer: (
      <>
        Crowd Appraisals let the FindA.Sale community weigh in on an item's estimated value. When a buyer or organizer marks an item for appraisal, community members with SCOUT rank or above can submit their valuation. The community votes on submissions, and the requester picks the appraisal they find most useful. Submitting earns XP — and if yours is selected, you earn a significant XP bonus. It's a way for experienced collectors to share their knowledge and get recognized for it.
      </>
    ),
  },
  {
    question: 'What can I spend my XP on?',
    answer: (
      <>
        XP isn't just for rank progression — you can redeem it for real rewards in the Explorer's Guild. Current redemption options:
        <ul className="mt-2 ml-4 space-y-1">
          <li><strong>75 XP → $5 off</strong> at any participating sale (min $20 purchase)</li>
          <li><strong>15 XP → Rarity Boost</strong> — +2% Legendary item odds for your next sale visit</li>
          <li><strong>25 XP → Trail Boost</strong> — Feature your Treasure Trail at the top of the discovery feed for 48 hours</li>
          <li><strong>50 XP → Hunt Pass Discount</strong> — $1 off your next Hunt Pass billing cycle (stackable up to 3 times)</li>
        </ul>
        Redeem XP from <strong>Account → Loyalty</strong>.
      </>
    ),
  },
  {
    question: 'What are Explorer\'s Guild ranks and what do I unlock at each level?',
    answer: (
      <>
        There are five ranks in the Explorer's Guild, each unlocking new perks:
        <ul className="mt-2 ml-4 space-y-1">
          <li><strong>Initiate (0 XP)</strong> — Full access to the platform, join the community</li>
          <li><strong>Scout (500 XP)</strong> — 5% Hunt Pass discount, early access to 1 sale per week</li>
          <li><strong>Ranger (2,000 XP)</strong> — 10% Hunt Pass discount, early access to 3 sales per week</li>
          <li><strong>Sage (5,000 XP)</strong> — 15% Hunt Pass discount, unlimited early access, 48-hour advance sale alerts, ability to publish Sourcebook hunting guides</li>
          <li><strong>Grandmaster (12,000 XP)</strong> — Permanent free Hunt Pass, all Sage perks, priority support</li>
        </ul>
      </>
    ),
  },
  {
    question: 'How do I cancel a hold?',
    answer: (
      <>
        Holds you've placed on items can be cancelled from your account under <strong>Account → Holds</strong>. Find the item, click <strong>Cancel Hold</strong>, and the item is released back to Available status. Note that organizers can also cancel holds — you'll be notified if that happens.
      </>
    ),
  },
  {
    question: 'What does "Excellent" condition mean?',
    answer: (
      <>
        Excellent condition means the item is like new — no signs of wear or use, and may still have original packaging. These items are priced near retail (80–100% of retail value). Examples include new in box items, rarely used vintage collectibles, and display pieces in perfect condition.
      </>
    ),
  },
  {
    question: 'What does "Good" condition mean?',
    answer: (
      <>
        Good condition items have minor signs of use but are fully functional with only small cosmetic imperfections that don't affect use. Examples include gently used furniture, dishes without chips, and electronics in working order. Good items typically cost 50–75% of retail.
      </>
    ),
  },
  {
    question: 'What does "Fair" condition mean?',
    answer: (
      <>
        Fair condition items show visible wear or age but are fully functional. They may have noticeable cosmetic issues like scratches, fading, or patina. Fair items include well-loved vintage pieces, furniture with minor scuffs, and books with reading wear. Expect to pay 25–50% of retail value — fair condition items are excellent finds for budget shoppers, collectors, and people restoring or upcycling items.
      </>
    ),
  },
  {
    question: 'What does "Poor" condition mean?',
    answer: (
      <>
        Poor condition items show heavy wear, damage, or missing parts and may need repair. They're best suited for people working on restoration or upcycling projects. Examples include chipped or cracked ceramics, furniture needing reupholstering, and electronics with cosmetic damage. Poor items cost 10–25% of retail value.
      </>
    ),
  },
  {
    question: 'What does "As-Is" condition mean?',
    answer: (
      <>
        As-Is items are sold in their current condition without warranty or implied fitness for use. They may not function and should be inspected before purchasing. Examples include unknown condition electronics, untested vintage items, and items sold as found. Pricing is typically negotiable and often the lowest available.
      </>
    ),
  },
  {
    question: 'Who decides the condition rating?',
    answer: (
      <>
        The estate sale organizer or item seller sets the condition rating based on their professional assessment. If you have questions about a specific item's condition, you can contact the organizer directly through the item's listing to ask for additional photos or details.
      </>
    ),
  },
  {
    question: 'Can I dispute a condition rating?',
    answer: (
      <>
        If you believe an item's condition is misrepresented, contact the organizer directly through the item's listing. They may provide additional photos or clarifications. If you purchased an item and it arrives in worse condition than described, check the organizer's return and refund policy — most provide a grace period for inspection after pickup or delivery.
      </>
    ),
  },
];

const organizerFAQs: FAQItem[] = [
  {
    question: 'How does buying work for shoppers?',
    answer: (
      <>
        Shoppers browse estate sales on the{' '}
        <Link href="/" className="text-amber-600 hover:underline">homepage</Link> or map,
        click into any sale to see items, then click <strong>Buy Now</strong> and complete checkout
        via Stripe. Once paid, the item is marked sold and they receive a confirmation. They coordinate
        pickup directly with you. Or select from available pickup times if you enable them.
      </>
    ),
  },
  {
    question: 'How do I get paid?',
    answer: (
      <>
        Organizers receive payouts via <strong>Stripe Connect</strong>. Before your sale goes live,
        visit your <Link href="/organizer/dashboard" className="text-amber-600 hover:underline">dashboard</Link> and
        click <strong>Setup Payments</strong> to complete Stripe onboarding. Once verified, your share
        of each completed sale is deposited to your bank account within 2 business days.
      </>
    ),
  },
  {
    question: 'What is the platform fee?',
    answer: (
      <>
        FindA.Sale charges a <strong>10% flat platform fee</strong> on each completed purchase, regardless of sale
        type (fixed-price or auction). 
      </>
    ),
  },
  {
    question: 'How do I test my payment setup before my sale starts?',
    answer: (
      <>
        You have two ways to test payment flows:
        <br /><br />
        <strong>For POS (in-person card payments):</strong> Open the{' '}
        <Link href="/organizer/pos" className="text-amber-600 hover:underline">POS page</Link>,
        select your sale, and tap <strong>"Run $1.00 Test Transaction"</strong> in the Pre-Sale Test card.
        It sends a $1 charge through Stripe's test environment — no real money moves — and automatically
        checks off the POS task on your sale's progress checklist when it succeeds.
        <br /><br />
        <strong>For online checkout:</strong> Open your sale's Promote page and tap <strong>"Test Online Checkout"</strong> or <strong>"Test Auction Checkout"</strong> to get a test link and QR code. No real money moves and your inventory stays safe.
        <br /><br />
        For a full pre-sale walkthrough including all checkout methods and a day-before checklist, see the{' '}
        <Link href="/guide#before-you-go-live" className="text-amber-600 hover:underline">Before You Go Live</Link>{' '}
        section of the Organizer Guide.
        <br /><br />
        <strong>Common reasons tests fail:</strong> Stripe account not fully onboarded (look for a
        setup banner on your Earnings page), sale not yet published, or no items added. Still stuck?
        Contact support with your sale name and we'll help you get sorted before opening day.
      </>
    ),
  },
  {
    question: 'What Stripe test card numbers should I use?',
    answer: (
      <>
        Use these when clicking through the test checkout links on the Promote page. Any future expiry date (e.g. 12/30) and any 3-digit CVC work with all test cards.
        <br /><br />
        <strong>4242 4242 4242 4242</strong> — Payment succeeds<br />
        <strong>4000 0000 0000 0002</strong> — Payment is declined<br />
        <strong>4000 0025 0000 3155</strong> — Triggers an authentication step (3D Secure)
        <br /><br />
        Test cards only work in test checkout flows. Real checkouts will never ask for these numbers.
        If you see a test card request when you&apos;re not testing, contact support.
      </>
    ),
  },
  {
    question: 'Can I edit my sale or items after going live?',
    answer: (
      <>
        Yes. Visit your <Link href="/organizer/dashboard" className="text-amber-600 hover:underline">dashboard</Link>,
        click a sale, then click <strong>Edit</strong> to update pricing, descriptions, photos, tags,
        and more. You can edit at any time — before, during, or after the sale.
      </>
    ),
  },
  {
    question: 'How does Auto Tags work?',
    answer: (
      <>
        After you upload a photo, our system analyzes the image and suggests
        a title, description, category, and tags. You review each suggestion and apply, edit, or dismiss
        as you see fit. Auto Tags saves time on the first draft — you stay in control of the final listing.
      </>
    ),
  },
  {
    question: 'How do I run an auction sale?',
    answer: (
      <>
        When creating your sale, enable the <strong>Auction</strong> option. Then, for each item you
        want to auction, mark it as an auction item and set a starting bid. Bidding is live — shoppers
        see real-time bids. At the end time you set, the highest bidder wins and payment is processed
        automatically. The standard 10% platform fee applies.
      </>
    ),
  },
  {
    question: 'What is a QR code and how do I use it?',
    answer: (
      <>
        Every sale gets a unique QR code linking directly to its page. Find it under <strong>Share</strong> on
        your sale detail page. Print it on posters, flyers, or lawn signs. When shoppers scan it with
        their phone camera, they're taken straight to your sale. You can also share the QR image on
        social media for digital promotion.
      </>
    ),
  },
  {
    question: 'Can I connect FindA.Sale to Zapier or other apps?',
    answer: (
      <>
        Yes. Go to <strong>Teams → Webhooks</strong> and add your Zapier webhook URL.
        Select which events should trigger your Zap (purchase completed, sale published, auction won, etc.).
        Use Zapier to log sales to Google Sheets, send emails, post to Facebook, and more. See the full
        guide on your{' '}
        <Link href="/organizer/webhooks" className="text-amber-600 hover:underline">Webhooks settings page</Link>.
      </>
    ),
  },
  {
    question: 'Do you offer refunds to shoppers?',
    answer: (
      <>
        All sales are final once payment is completed. If there's a genuine issue (item not as described,
        damage, etc.), the organizer can issue a refund through their Stripe dashboard. Our support team
        can also help mediate disputes — contact us at{' '}
        <Link href="/contact" className="text-amber-600 hover:underline">support@finda.sale</Link>.
      </>
    ),
  },
  {
    question: 'How do I export my inventory?',
    answer: (
      <>
        From your sale dashboard, click <strong>Export</strong> to download a CSV of your full inventory.
        The file includes titles, descriptions, prices, categories, tags, and sold status — useful for
        accounting, record-keeping, or import into other systems.
      </>
    ),
  },
  {
    question: 'What\'s the difference between SIMPLE, PRO, and TEAMS?',
    answer: (
      <>
        SIMPLE is free — you get everything you need to run a single sale with up to 200 items. PRO ($29/month) unlocks bulk operations, analytics, export tools, and more.
        TEAMS ($79/month) adds multi-user workspaces with roles and permissions and the Command Center for organizations that run sales together.
      </>
    ),
  },
  {
    question: 'What is the Brand Kit?',
    answer: (
      <>
        Brand Kit lets you customize your organizer profile with your logo, colors, custom fonts, banners, and a custom URL. Brand Kit is available on PRO and TEAMS plans.
      </>
    ),
  },
  {
    question: 'What is the Command Center?',
    answer: (
      <>
        The Command Center is a Teams feature that gives you a real-time dashboard across all your active sales — track items, holds, messages, and performance in one place.
      </>
    ),
  },
  {
    question: 'What\'s the difference between item status (Available / Sold / Unavailable) and draft status (Draft / Published)?',
    answer: (
      <>
        These are two separate controls that often get confused.
        <ul className="mt-2 ml-4 space-y-1">
          <li><strong>Draft status</strong> controls whether shoppers can see the item at all. A Draft item is invisible to shoppers. A Published item is visible.</li>
          <li><strong>Item status</strong> controls what shoppers can do with a visible item. Available = purchasable. Sold = sold, display only. Unavailable = visible but temporarily not for sale.</li>
        </ul>
        So: Published + Available = shoppers can buy it. Published + Unavailable = shoppers can see it but can't purchase. Draft = shoppers can't see it at all, regardless of status.
      </>
    ),
  },
  {
    question: 'How does Rapid Capture work?',
    answer: (
      <>
        Open your sale and tap the ⚡ icon in the photo controls. You'll enter rapid-fire camera mode — photograph items one after another without stopping. Our system analyzes each photo as you go. When you're done, you'll review Auto Tag suggestions (title, description, category, tags) for all captured items in a batch on the Review page. Approve, edit, or dismiss each one and publish. This is the fastest way to get a large inventory online — many organizers photograph 100+ items in under 30 minutes.
      </>
    ),
  },
  {
    question: 'How do I use the Print Kit?',
    answer: (
      <>
        From your sale dashboard, click <strong>Print Kit</strong>. You can generate:
        <ul className="mt-2 ml-4 space-y-1">
          <li><strong>Item label stickers</strong> — Avery-format adhesive labels with QR codes for each item (6 per page, 30 per page options). Shoppers scan these at the sale to view item details and price on their phone.</li>
          <li><strong>Price sheet / cheat sheet</strong> — A printed reference grid of all items with prices, useful for you and staff during the sale.</li>
        </ul>
        Print the sticker sheet, cut the labels, and apply them to items before the sale. The QR code links directly to that item's listing.
      </>
    ),
  },
  {
    question: 'How do I manage holds and reservations?',
    answer: (
      <>
        Enable holds in your sale settings under <strong>Allow Holds</strong>. Once enabled, shoppers can request holds from any item detail page. You'll receive a notification for each request — you can accept or decline. Accepted holds are marked on the listing and the hold window is determined by the shopper's Explorer Rank (30–90 minutes depending on rank). Manage all active holds from your sale's <strong>Holds</strong> tab. You can cancel any hold at any time.
      </>
    ),
  },
  {
    question: 'How does in-person / Point of Sale checkout work?',
    answer: (
      <>
        The FindA.Sale POS lets you process sales at the event using your phone or tablet. From your sale dashboard, tap <strong>POS</strong> to open the point-of-sale view. You can search your inventory, add items to a cart, accept payment (card via Stripe or cash recorded manually), and mark items sold — all from the same screen. POS transactions sync with your online inventory in real time, so an item sold in person won't show as available online.
      </>
    ),
  },
  {
    question: 'How does the feedback and survey system work?',
    answer: (
      <>
        FindA.Sale occasionally prompts users with brief micro-surveys to help you understand shopper experience. These are triggered by real actions (a purchase completed, a hold placed, a sale visited). You can view aggregated feedback signals from your shoppers in your dashboard. To give us feedback about your own organizer experience, use <strong>Settings → Help & Support → Send Feedback</strong>. Feedback is reviewed and prioritized by the team weekly.
      </>
    ),
  },
];

interface FAQAccordionProps {
  faqs: FAQItem[];
}

const FAQAccordion = ({ faqs }: FAQAccordionProps) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {faqs.map((faq, index) => (
        <div
          key={index}
          className="border border-warm-200 dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
        >
          <button
            onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-inset"
            aria-expanded={expandedIndex === index}
          >
            <p className="text-left text-base font-semibold text-warm-900 dark:text-warm-100">{faq.question}</p>
            <span
              className={`ml-4 text-warm-500 dark:text-warm-400 transform transition-transform flex-shrink-0 ${
                expandedIndex === index ? 'rotate-180' : ''
              }`}
              aria-hidden
            >
              ▼
            </span>
          </button>
          {expandedIndex === index && (
            <div className="px-6 py-4 bg-warm-50 dark:bg-gray-900 border-t border-warm-200 dark:border-gray-700 text-warm-700 dark:text-warm-300 leading-relaxed text-sm">
              {faq.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

type Tab = 'shopper' | 'organizer';

const FAQPage = () => {
  const [tab, setTab] = useState<Tab>('shopper');

  return (
    <>
      <Head>
        <title>FAQ – FindA.Sale</title>
        <meta name="description" content="Frequently asked questions about buying and selling on FindA.Sale \u2014 the community resale marketplace." />
      </Head>

      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Frequently Asked Questions</h1>
          <p className="text-warm-500 dark:text-warm-400 mb-8">Find answers for shoppers and organizers below.</p>

          {/* Tab switcher */}
          <div className="flex border-b border-warm-200 dark:border-gray-700 mb-8">
            <button
              onClick={() => setTab('shopper')}
              className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === 'shopper'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-warm-500 dark:text-warm-400 hover:text-warm-800'
              }`}
            >
              For Shoppers
            </button>
            <button
              onClick={() => setTab('organizer')}
              className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === 'organizer'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-warm-500 dark:text-warm-400 hover:text-warm-800'
              }`}
            >
              For Organizers
            </button>
          </div>

          {tab === 'shopper' ? (
            <FAQAccordion faqs={shopperFAQs} />
          ) : (
            <FAQAccordion faqs={organizerFAQs} />
          )}

          {/* Bottom help prompt */}
          <div className="mt-10 p-5 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-sm text-warm-700 dark:text-warm-300">
            {tab === 'organizer' ? (
              <>
                Looking for the full walkthrough?{' '}
                <Link href="/guide" className="text-amber-600 hover:underline font-medium">Read the Organizer Guide →</Link>
              </>
            ) : (
              <>
                Still have questions?{' '}
                <Link href="/contact" className="text-amber-600 hover:underline font-medium">Contact our support team →</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default FAQPage;