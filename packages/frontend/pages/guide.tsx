/**
 * CA7: Organizer Guide Page
 * Full walkthrough for sale organizers. Linked from footer + organizer dashboard.
 */

import React, { useState } from 'react';
import { jsonLdSafe } from '@/lib/jsonLdSafe';
import Head from 'next/head';
import Link from 'next/link';
import { auctionWorkedExample, describeInclusiveRates, MINIMUM_TRANSACTION_FEE_LABEL } from '../lib/platformFees';


// Fee figures come from lib/platformFees so this page cannot drift from the real rates.
const FEE_SIMPLE = describeInclusiveRates('SIMPLE');
const FEE_PRO = describeInclusiveRates('PRO');
const AUCTION_EX = auctionWorkedExample(200, 'SIMPLE');

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const sections: Section[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    content: (
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200">Creating Your Account</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Head to FindA.Sale and sign up for an account. Once you've confirmed your email,
          visit <strong>Settings → Account</strong> and set your role to Organizer. You'll be prompted
          to complete your organizer profile. Add a business name, profile photo, and bio.
          A professional photo and welcoming bio help shoppers trust you before they ever visit a sale.
        </p>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">Connecting Square (Required for Payouts)</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Before you can receive payments, connect your bank account through Square.
          Go to <strong>Settings → Payments</strong> and click <strong>Connect Square</strong>.
          This is a one-time setup that takes about 5 to 10 minutes, handled on Square's own
          onboarding page. Square verifies your identity and banking details before your first payout.
        </p>
      </div>
    ),
  },
  {
    id: 'creating-a-sale',
    title: 'Creating a Sale',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Click <strong>Create Sale</strong> in your dashboard. You'll fill in a few key fields:
        </p>
        <ul className="space-y-3 text-warm-700 dark:text-warm-300">
          <li>
            <strong>Sale Title</strong>: Choose a clear, descriptive title. "Oak Valley Estate Collection"
            or "Downtown Victoriana, May 5-7" works better than just "Yard Sale" or "Estate Sale." Shoppers search by keywords,
            so be specific.
          </li>
          <li>
            <strong>Description</strong>. Briefly describe what's for sale. Mention standout categories
            (antique furniture, vintage jewelry, collectibles) and any special details. Two or three sentences
            is plenty.
          </li>
          <li>
            <strong>Sale Dates</strong>. Set your start and end dates. Publishing 3–5 days before the
            sale starts gives shoppers time to browse and set holds before opening day.
          </li>
          <li>
            <strong>Address</strong>. Your exact address is shown to shoppers once the sale is published
            and used to display your sale on the map.
          </li>
          <li>
            <strong>Sale Type</strong>. Choose Regular (fixed price) or Auction (competitive bidding).
            All items carry the platform fee for your plan ({FEE_SIMPLE} on SIMPLE, {FEE_PRO} on PRO and TEAMS, card processing included) regardless of sale type. On auctions, the winning
            bidder also pays a separate 5% buyer&apos;s premium on top of their bid, set by FindA.Sale.
          </li>
        </ul>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Once saved, your sale appears on the FindA.Sale map and in local search results.
          You can edit all details at any time before and during the sale.
        </p>
      </div>
    ),
  },
  {
    id: 'adding-items',
    title: 'Adding Items',
    content: (
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200">Uploading Photos</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          From your sale, click <strong>Add Item</strong>. Upload one or more photos by clicking the
          upload area or dragging files. The first photo becomes the thumbnail shoppers see while browsing.
          Drag photos to reorder them. Tip: natural light and close-up shots of maker's marks, signatures,
          or condition details help shoppers make confident decisions.
        </p>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">Smart Auto-Tagging</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          After you upload photos, our system suggests a title, description, category, and tags based on
          what it sees. Review each suggestion. You know your items best. Accept useful suggestions,
          dismiss irrelevant ones, or edit them freely. Smart tagging handles the first draft; you refine it.
        </p>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">Setting Price</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Pricing varies by event type. Whole-house sale items typically go for 20–50% of retail. Auction items may exceed retail with competitive bidding; garage sale and flea market items often go lower. Research comparable items online if you're unsure. You can adjust prices any time before or during the sale. For auction items, set a starting bid price; the 10% platform fee applies to the final bid, and the winning bidder pays a separate 5% buyer&apos;s premium on top of that bid.
        </p>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">Tags and Categories</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Select the most specific category that fits (Furniture, Glassware, Jewelry, Books, Art, etc.).
          Add custom tags for styles collectors search for, "Mid-Century Modern," "Art Deco," "Tole Ware."
          Good tags dramatically improve item discoverability.
        </p>
      </div>
    ),
  },
  {
    id: 'community-appraisals',
    title: 'Community Appraisals',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Not sure what an item is worth? Community members can appraise items for you.
          Mark an item for appraisal and Scout-rank members will submit valuations based on
          their expertise, research, and market knowledge. You choose the appraisal you find
          most useful. It's your decision, your final value.
        </p>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">What Qualifies You to Appraise</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          You don't need formal credentials. What matters is specificity and honesty. Appraisers
          with collecting experience, professional backgrounds (antiques dealer, sale organizer,
          eBay powerseller), or solid research skills can all contribute valuable insights.
          A collector with 20 years of pottery knowledge is more useful than a generalist with a degree.
        </p>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">What Makes a Great Appraisal</h3>
        <ul className="space-y-3 text-warm-700 dark:text-warm-300 list-disc list-inside">
          <li><strong>Cite your source:</strong> eBay sold listings, Worthpoint, live auction results, personal sales experience. Name it.</li>
          <li><strong>Be specific about what you see:</strong> Describe joinery style, maker's marks, material, era, model number. "Old bowl" is useless; "Wedgwood Jasperware, ca. 1920, blue with white relief figures" is credible.</li>
          <li><strong>Give a price range, not a single number:</strong> $150–$250, not $185. Explain the spread. Condition variance, regional differences, market timing.</li>
          <li><strong>Note what pushes value up or down:</strong> Original hardware vs. replacements, restoration work, provenance, reproduction parts. Honesty builds trust.</li>
        </ul>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">Structure Your Appraisal for Impact</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Strong appraisals follow a simple flow:
        </p>
        <ol className="space-y-2 text-warm-700 dark:text-warm-300 list-decimal list-inside">
          <li><strong>What I see:</strong> Identify maker, era, material, condition, distinguishing details.</li>
          <li><strong>What it's worth:</strong> Price range with reasoning.</li>
          <li><strong>Why:</strong> Comparable sales, market demand, condition impact.</li>
          <li><strong>Source:</strong> Where you found your data.</li>
        </ol>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">What Gets Rejected or Downvoted</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Vague opinions ("looks old"), chatbot-written text, copy-pasted descriptions from elsewhere,
          no source cited, or a price with zero reasoning all get flagged. The community votes down
          weak appraisals so the strongest ones rise to the top.
        </p>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">XP Rewards</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Submitting an appraisal earns base XP. If the organizer selects your appraisal as most useful,
          you earn a significant bonus. Over time, expert appraisers climb the Guild ranks and unlock
          perks like bulk editing and team management.
        </p>
      </div>
    ),
  },
  {
    id: 'managing-inventory',
    title: 'Managing Inventory',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          From your sale dashboard you can edit any item, reorder photos within an item, and mark items
          as sold. When an item sells online, it's marked automatically. For in-person sales, mark items
          sold manually to prevent duplicate purchases and keep your inventory accurate.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          <strong>CSV Export</strong>. Go to your sale dashboard and click <strong>Export</strong> to
          download your full inventory as a CSV. The file includes titles, descriptions, prices, categories,
          tags, and sold status. Useful for record-keeping and accounting. Exports are included with PRO and TEAMS.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          <strong>Holds and Reservations</strong>. Shoppers can request holds before the sale opens.
          If you allow holds, the item is marked "held" and reserved for that shopper. Accept or decline
          hold requests from your dashboard. Holds build excitement and give serious buyers confidence.
        </p>
      </div>
    ),
  },
  {
    id: 'auction-items',
    title: 'Auction Items',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          When you create an auction sale, shoppers bid on items rather than buying at a fixed price.
          Each bid must exceed the previous bid (typically by $1–$5). Bidding is live. Participants see
          each other's bids in real time. At the auction end time, the highest bidder wins and payment
          is collected automatically.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          All items carry the <strong>platform fee for your plan</strong> on the final sale price, deducted from
          your payout: {FEE_SIMPLE} on SIMPLE, {FEE_PRO} on PRO and TEAMS. Card processing is included, and there is
          a {MINIMUM_TRANSACTION_FEE_LABEL} minimum per transaction.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Auctions carry one more fee, and the <strong>winning bidder</strong> pays it: a{' '}
          <strong>buyer&apos;s premium</strong> added to their bid at checkout. It is{' '}
          a flat <strong>5%</strong>, set by FindA.Sale on every auction. Bidders see it on the sale page
          and on the bid form before they bid, and confirm it before paying. Worked example on a $200
          winning bid at the SIMPLE online rate: the buyer is charged <strong>${AUCTION_EX.buyerTotal.toFixed(2)}</strong>, your
          platform fee is <strong>${AUCTION_EX.fee.toFixed(2)}</strong>, and you receive <strong>${AUCTION_EX.net.toFixed(2)}</strong>.
          If you would rather your winner paid exactly their bid, turn on &ldquo;Cover the
          buyer&apos;s premium&rdquo; on the sale. The 5% then comes out of your payout, so you receive{' '}
          <strong>${AUCTION_EX.netIfCovered.toFixed(2)}</strong> and the buyer is charged <strong>${AUCTION_EX.bid.toFixed(2)}</strong>.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          After the auction ends, we notify winners and process payments. Payouts are deposited to
          your connected Square account on a weekly schedule.
        </p>
      </div>
    ),
  },
  {
    id: 'shopper-communication',
    title: 'Shopper Communication',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Shoppers can message you directly with questions about items or logistics. Check your inbox
          regularly. Responding within a few hours builds trust and reduces abandoned carts.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          You can also send updates to all shoppers following your sale. Use this for last-minute announcements
          like new items added, early-bird pricing, or sale-day logistics. Go to your sale dashboard and
          click <strong>Send Update</strong>.
        </p>
      </div>
    ),
  },
  {
    id: 'payouts',
    title: 'Payouts',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Once Square is connected, payouts happen automatically. Your share of each completed
          sale is deposited to your connected Square account on a weekly schedule.
          The platform fee for your plan (card processing included) is deducted before payout.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          View your full payout history and pending balance at <strong>Settings → Payments</strong>
          in your FindA.Sale dashboard, or in your Square dashboard directly.
        </p>
      </div>
    ),
  },
  {
    id: 'qr-codes',
    title: 'QR Code Marketing',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Every sale gets a unique QR code that links directly to its details page. Print it on posters,
          flyers, lawn signs, or social media posts. When shoppers scan the code, they land on your sale
          and can browse inventory, set holds, and enable notifications.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Find your sale's QR code on the sale detail page under <strong>Share</strong>.
          The larger you print it, the easier it is to scan from a distance. Aim for at least 2 inches
          on printed materials.
        </p>
      </div>
    ),
  },
  {
    id: 'notifications',
    title: 'Push Notifications',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Shoppers who enable notifications get alerted when your sale starts, when popular items are
          running low, and when new sales are posted. More notification subscribers means more opening-day
          traffic.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          You control notification settings for each sale. Go to <strong>Settings → Notifications</strong>
          to manage which alerts are sent and when. You can also push a manual announcement to all
          followers from the sale dashboard.
        </p>
      </div>
    ),
  },
  {
    id: 'referral-program',
    title: 'Referral Program',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Every organizer account has a unique referral link. Share it with other sale organizers.
          When someone signs up using your link and creates their first paid sale, you earn a <strong>$5 credit</strong>{' '}
          toward your next platform fees. Credits accumulate and are applied automatically. Find your
          link at <strong>Settings → Referrals</strong>.
        </p>
      </div>
    ),
  },
  {
    id: 'zapier-webhooks',
    title: 'Zapier & Webhooks',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Connect FindA.Sale to thousands of apps via Zapier. Use webhooks to automatically log
          purchases to Google Sheets, notify your team in Slack when a sale starts, or post new
          listings to Facebook.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          To get started: go to <strong>Settings → Integrations → Webhooks</strong>, click
          <strong> Add Webhook</strong>, and paste your Zapier webhook URL. Select the events
          you want to trigger (purchase completed, sale published, bid placed, etc.) and save.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          For full event schemas, example Zap recipes, and authentication details, see the{' '}
          <Link href="/organizer/webhooks" className="text-amber-600 hover:underline font-medium">
            Webhooks settings page
          </Link>.
        </p>
      </div>
    ),
  },
  {
    id: 'before-you-go-live',
    title: 'Before You Go Live',
    content: (
      <div className="space-y-4">
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          You've added your items, set your prices, and printed your signs. Before you open the doors,
          take 10 minutes to confirm every payment path is working. Nothing derails a sale morning faster
          than a payment issue at the table.
        </p>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">1. Confirm Your Square Account Is Ready</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Go to <strong>Settings → Payments</strong>. If you see a banner saying your Square setup
          isn't finished, complete it there first. No card payments will go through until it's done.
          You're ready when you see a green &quot;Square Connected&quot; status and no setup banners.
        </p>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">2. Walk Through the POS Flow Once</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Open the{' '}
          <Link href="/organizer/pos" className="text-amber-600 hover:underline font-medium">POS page</Link>{' '}
          and run a quick walkthrough: search for an item, add it to the cart, and verify prices look
          right. If your sale uses self-checkout QR codes, open one on your phone to confirm it loads
          correctly. You're just confirming items load, prices are accurate, and the checkout screen
          appears the way you expect.
        </p>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          Running into trouble even with your Square account showing Connected? Contact support before
          your sale day.
        </p>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-6">Pre-Sale Checklist</h3>
        <ul className="space-y-2 text-warm-700 dark:text-warm-300 mt-2">
          {[
            'Square account fully connected (no setup banners)',
            'At least one item is priced and published',
            'QR codes printed and tested (if using self-checkout)',
            'Sale start time is correct (double-check timezone)',
            'Sale is published and visible on the discovery feed',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-0.5 text-amber-600 font-bold">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <h3 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mt-8">Card Readers and In-Person Payments</h3>
        <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
          For in-person card payments at your sale, check the{' '}
          <Link href="/organizer/pos" className="text-amber-600 hover:underline font-medium">POS page</Link>{' '}
          for current card reader support and setup steps. Cash, Venmo, and Zelle are always available
          as walk-up payment options.
        </p>
      </div>
    ),
  },
  {
    id: 'tips',
    title: 'Tips for Success',
    content: (
      <div className="space-y-3 text-warm-700 dark:text-warm-300">
        <p><strong>Be detailed.</strong> Accurate descriptions and multiple clear photos build shopper confidence. If an item has condition issues, mention them upfront.</p>
        <p><strong>Price fairly.</strong> Research comparable items online. Competitive pricing attracts more buyers and moves inventory faster.</p>
        <p><strong>Respond quickly.</strong> Answer questions within a few hours. Prompt, friendly communication encourages purchases and builds your reputation.</p>
        <p><strong>Use tags wisely.</strong> Add tags shoppers actually search for. "Vintage," "Collectible," and "Handmade" are popular; niche tags like "Art Deco" or "Tole Ware" help collectors.</p>
        <p><strong>Photograph everything.</strong> Good lighting and clear angles matter. Capture maker marks, signatures, and any condition details.</p>
        <p><strong>Publish early.</strong> Put your sale live 3–5 days before the start date. Shoppers browse and set holds before opening day.</p>
        <p><strong>Follow up.</strong> After the sale, send a thank-you to repeat buyers or followers. Relationships drive repeat business.</p>
      </div>
    ),
  },
];

const GuidePage = () => {
  const [activeSection, setActiveSection] = useState<string>('getting-started');

  return (
    <>
      <Head>
        <title>Organizer Guide. FindA.Sale</title>
        <meta name="description" content="Complete guide for sale organizers on FindA.Sale. Create sales, add items, manage inventory, and get paid." />
        <meta property="og:title" content="Organizer Guide. FindA.Sale" />
        <meta property="og:description" content="Complete guide for sale organizers on FindA.Sale. Create sales, add items, manage inventory, and get paid." />
        <meta property="og:url" content="https://finda.sale/guide" />
        <meta property="og:image" content="https://finda.sale/og-image.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdSafe({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: 'Organizer Guide',
              description: 'Complete guide for sale organizers on FindA.Sale. Create sales, add items, manage inventory, and get paid.',
              url: 'https://finda.sale/guide',
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdSafe({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: 'Home',
                  item: 'https://finda.sale',
                },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: 'Guide',
                  item: 'https://finda.sale/guide',
                },
              ],
            }),
          }}
        />
      </Head>

      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-10">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Organizer Guide</h1>
            <p className="text-warm-500 dark:text-warm-400 text-lg">Everything you need to run a successful sale on FindA.Sale.</p>
          </div>

          <div className="flex flex-col md:flex-row gap-8">
            {/* Sidebar nav */}
            <nav className="md:w-56 shrink-0">
              <ul className="space-y-1 sticky top-28 lg:top-20">
                {sections.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setActiveSection(s.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeSection === s.id
                          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 font-semibold'
                          : 'text-warm-600 dark:text-warm-400 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 hover:text-warm-900'
                      }`}
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {sections.map((s) => (
                <div
                  key={s.id}
                  className={activeSection === s.id ? 'block' : 'hidden'}
                >
                  <div className="mb-4 pb-4 border-b border-warm-100">
                    <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">{s.title}</h2>
                  </div>
                  <div className="text-warm-700 dark:text-warm-300 leading-relaxed">
                    {s.content}
                  </div>
                </div>
              ))}

              {/* Next section nav */}
              <div className="mt-10 pt-6 border-t border-warm-100 flex justify-between items-center">
                {sections.findIndex((s) => s.id === activeSection) > 0 && (
                  <button
                    onClick={() => {
                      const idx = sections.findIndex((s) => s.id === activeSection);
                      setActiveSection(sections[idx - 1].id);
                    }}
                    className="text-sm text-amber-600 hover:text-amber-700 font-medium"
                  >
                    ← {sections[sections.findIndex((s) => s.id === activeSection) - 1]?.title}
                  </button>
                )}
                <div className="flex-1" />
                {sections.findIndex((s) => s.id === activeSection) < sections.length - 1 && (
                  <button
                    onClick={() => {
                      const idx = sections.findIndex((s) => s.id === activeSection);
                      setActiveSection(sections[idx + 1].id);
                    }}
                    className="text-sm text-amber-600 hover:text-amber-700 font-medium"
                  >
                    {sections[sections.findIndex((s) => s.id === activeSection) + 1]?.title} →
                  </button>
                )}
              </div>

              {/* Help link */}
              <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm text-warm-700 dark:text-warm-300">
                Still have questions? <Link href="/contact" className="text-amber-600 hover:underline font-medium">Contact our support team</Link> or check the{' '}
                <Link href="/faq" className="text-amber-600 hover:underline font-medium">FAQ</Link>.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const getStaticProps = async () => {
  return { props: {} };
};

export default GuidePage;
