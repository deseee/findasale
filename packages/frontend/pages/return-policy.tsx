import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const ReturnPolicyPage = () => {
  const effectiveDate = 'June 17, 2026';

  return (
    <>
      <Head>
        <title>Return &amp; Refund Policy – FindA.Sale</title>
        <meta
          name="description"
          content="Return and refund policy for FindA.Sale — a marketplace for estate sales, yard sales, auctions, and flea markets. Each seller sets their own return policy."
        />
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Return &amp; Refund Policy</h1>
          <p className="text-warm-500 dark:text-warm-400 mb-10">Effective date: {effectiveDate}</p>

          <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-8">
            FindA.Sale is a marketplace that connects shoppers with independent sale organizers — estate sale
            companies, yard sale hosts, auctioneers, flea market vendors, and consignment sellers. Because each
            seller is an independent business, <strong>FindA.Sale does not set a single blanket return policy.</strong>{' '}
            Return eligibility, timeframes, and procedures are determined by each individual seller for each sale.
          </p>

          {/* 1 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">1. How Returns Work on FindA.Sale</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              If you would like to return an item or request a refund, you must contact the individual seller or
              organizer directly. Each seller's contact information is listed on their sale page.
            </p>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              Whether a return is accepted — and under what conditions — depends entirely on the seller's own
              policy. Some sellers accept returns within a short window; others sell all items as final sale. If no
              return policy is stated in the listing, reach out to the seller before purchasing to ask.
            </p>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              FindA.Sale does not process returns or issue refunds on behalf of sellers. Any approved refund is
              arranged directly between you and the seller.
            </p>
          </section>

          {/* 2 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">2. Before You Buy</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              We recommend taking a few minutes before purchasing to:
            </p>
            <ul className="list-disc list-inside text-warm-700 dark:text-warm-300 space-y-2 mb-4">
              <li>Read the full item description and review all photos carefully.</li>
              <li>Check the sale listing for any posted return or final-sale policy.</li>
              <li>Message the organizer directly if you have questions about condition, dimensions, or authenticity.</li>
              <li>Confirm pickup or shipping arrangements before completing your purchase.</li>
            </ul>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              Taking these steps upfront is the best way to make sure you're comfortable with your purchase before
              money changes hands.
            </p>
          </section>

          {/* 3 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">3. Disputes</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              If you and a seller are unable to reach an agreement on a return or refund, contact FindA.Sale
              support at{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">
                support@finda.sale
              </a>
              . We will review the situation and do our best to help mediate a fair resolution.
            </p>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              Please note that FindA.Sale acts as a neutral facilitator in disputes. We are not a party to the
              transaction between buyer and seller and cannot guarantee any specific outcome, but we take buyer
              concerns seriously and will work with both parties in good faith.
            </p>
          </section>

          {/* 4 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">4. Item Condition</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              Most items sold on FindA.Sale are secondhand, vintage, or pre-owned. By completing a purchase, buyers
              acknowledge and accept the item's condition as described and photographed at the time of purchase.
            </p>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              If an item arrives significantly not as described, contact the seller immediately and reach out to our
              support team if needed. We evaluate these situations case by case.
            </p>
          </section>

          {/* 5 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">5. Digital Purchases &amp; Platform Fees</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              Platform service fees charged by FindA.Sale are non-refundable. This includes buyer convenience fees,
              subscription fees, and any other charges collected directly by FindA.Sale rather than by the
              individual seller. If you believe a fee was charged in error, contact{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">
                support@finda.sale
              </a>{' '}
              and we will review it promptly.
            </p>
          </section>

          {/* 6 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">6. Contact Us</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              Questions about a return or refund? We're here to help.
            </p>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mt-3">
              <strong>Email:</strong>{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">
                support@finda.sale
              </a>
            </p>
          </section>

          <div className="border-t border-warm-200 dark:border-gray-700 pt-6 text-sm text-warm-500 dark:text-warm-400">
            <p>
              See also our{' '}
              <Link href="/terms" className="text-amber-600 hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-amber-600 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export const getStaticProps = async () => {
  return { props: {} };
};

export default ReturnPolicyPage;
