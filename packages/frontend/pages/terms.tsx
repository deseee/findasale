import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const TermsPage = () => {
  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'Grand Rapids';
  const effectiveDate = 'March 5, 2026';

  return (
    <>
      <Head>
        <title>Terms of Service – FindA.Sale</title>
        <meta name="description" content={`Terms of Service for FindA.Sale — the marketplace for estate sales, yard sales, auctions, and flea markets in ${defaultCity} and beyond.`} />
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 mb-2">Terms of Service</h1>
          <p className="text-warm-500 mb-10">Effective date: {effectiveDate}</p>

          <p className="text-warm-700 leading-relaxed mb-8">
            These Terms of Service ("Terms") govern your use of FindA.Sale, operated by FindA.Sale LLC ("Company," "we,"
            "us," or "our"), a Michigan limited liability company. By accessing or using FindA.Sale at finda.sale (the
            "Platform"), you agree to be bound by these Terms. If you do not agree, do not use the Platform.
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">1. Eligibility</h2>
            <p className="text-warm-700 leading-relaxed">
              You must be at least 18 years old to create an account or make a purchase. By using the Platform you
              represent that you meet this age requirement and that any information you provide is accurate and complete.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">2. Description of Service</h2>
            <p className="text-warm-700 leading-relaxed">
              FindA.Sale is an online marketplace that connects organizers of estate sales, yard sales, auctions, and flea markets ("Organizers") with shoppers ("Buyers"). The Company facilitates transactions but is not a party to any sale between Organizer and Buyer.
              We do not own, inspect, or guarantee any items listed on the Platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">3. Accounts</h2>
            <p className="text-warm-700 leading-relaxed mb-3">
              You are responsible for maintaining the confidentiality of your account credentials and for all activity
              that occurs under your account. Notify us immediately at{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>{' '}
              if you suspect unauthorized access. We reserve the right to suspend or terminate accounts that violate
              these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">4. Organizer Terms</h2>
            <p className="text-warm-700 leading-relaxed mb-3">
              Organizers may list items from estate sales, yard sales, auctions, or flea markets for fixed-price purchase or auction. By listing items you represent
              that you have the legal right to sell those items and that all listing information is accurate.
            </p>
            <p className="text-warm-700 leading-relaxed mb-3">
              <strong>Prohibited listings:</strong> You may not list stolen property, items requiring special licenses
              (e.g., regulated firearms, hazardous materials), counterfeit goods, or items that violate any applicable law.
            </p>
            <p className="text-warm-700 leading-relaxed mb-3">
              <strong>Legal Authority to Sell:</strong> By listing items on FindA.Sale, you represent that you have the
              legal right to sell those items. This right may arise from ownership, a valid consignment agreement, power
              of attorney, or other lawful authority. You are solely responsible for securing and maintaining that
              authority.
            </p>
            <p className="text-warm-700 leading-relaxed mb-3">
              <strong>FindA.Sale's Limited Role:</strong> FindA.Sale is a marketplace platform only. We do not enter into
              consignment agreements with estate owners, sellers, or any third parties. If you list items on consignment,
              the consignment relationship exists solely between you (the Organizer) and the item owner. FindA.Sale
              assumes no liability for disputes between you and your consignors, and we cannot resolve ownership or
              consignment disputes. You must handle all such disputes directly with your consignor and seek legal counsel
              if necessary.
            </p>
            <p className="text-warm-700 leading-relaxed mb-3">
              <strong>Payouts:</strong> Organizers receive proceeds via Stripe Connect Express after the platform fee is
              deducted. Payouts are subject to Stripe's standard processing timelines and{' '}
              <a href="https://stripe.com/legal/connect-account" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">
                Stripe Connected Account Agreement
              </a>. Instant payouts, where enabled, are subject to Stripe's instant payout policies.
            </p>
            <p className="text-warm-700 leading-relaxed mb-3">
              <strong>Fulfillment and Cancellation Obligations:</strong> Organizers may cancel a sale before any
              purchases are made. Once a Buyer has completed checkout, the Organizer is bound to fulfill. Specifically:
            </p>
            <ul className="list-disc list-inside text-warm-700 space-y-2 mb-3">
              <li>Organizers must acknowledge receipt of the purchase order within 24 hours of checkout completion.</li>
              <li>Pickup or delivery must occur within 30 days of the sale closing, unless the Organizer and Buyer agree to a different timeline in writing.</li>
              <li>If an Organizer fails to acknowledge, communicate, or fulfill within 30 days, the Buyer may file a dispute with FindA.Sale support at support@finda.sale.</li>
              <li>Organizers may only cancel after purchase if the item is no longer available due to circumstances beyond their control. Cancellation must be communicated immediately to the Buyer with a full refund offered.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">4a. Sales Tax Obligations</h2>
            <p className="text-warm-700 leading-relaxed mb-3">
              <strong>Organizer Responsibility:</strong> FindA.Sale does not calculate, collect, or remit sales tax on
              behalf of organizers. Organizers are solely responsible for determining whether their sales are subject to
              sales tax under Michigan state law and applicable local ordinances, and for registering with the appropriate
              tax authorities and remitting tax as required.
            </p>
            <p className="text-warm-700 leading-relaxed">
              <strong>Buyer Responsibility:</strong> Buyers should be aware that they may owe sales tax or use tax on
              items purchased, depending on their location and the applicable jurisdiction. Buyers are responsible for
              understanding their own tax obligations.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">5. Buyer Terms</h2>
            <p className="text-warm-700 leading-relaxed mb-3">
              <strong>All sales are final.</strong> Because items are second-hand or bulk goods sold by individual
              Organizers (from estate sales, yard sales, auctions, or flea markets), we do not accept returns or issue
              refunds except where required by law or where the item was materially misdescribed.
            </p>
            <p className="text-warm-700 leading-relaxed mb-3">
              <strong>Disputes and Refunds:</strong> If you believe a listing is fraudulent, the item is significantly
              misdescribed, or the Organizer failed to deliver, you must report the issue to{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>{' '}
              <strong>within 48 hours of your purchase</strong>. Include a description of the issue, photos if available,
              and your order confirmation. FindA.Sale will investigate and contact the Organizer for their response. If
              fraud is confirmed or the Organizer cannot resolve the issue, FindA.Sale will facilitate a refund. All
              disputes are reviewed and resolved within 7 days. If resolution cannot be reached, either party may
              escalate to Stripe for chargeback review.
            </p>
            <p className="text-warm-700 leading-relaxed mb-3">
              <strong>Contact Support:</strong> Submit disputes via email to{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>{' '}
              or use our{' '}
              <a href="/contact" className="text-amber-600 hover:underline">contact form</a>.
            </p>
            <p className="text-warm-700 leading-relaxed mb-3">
              <strong>Auctions:</strong> Placing a bid is a binding commitment to purchase at that price if you win.
              Auction winners must complete payment within 24 hours of sale close or the item may be released.
            </p>
            <p className="text-warm-700 leading-relaxed">
              <strong>Pickup:</strong> Unless otherwise noted by the Organizer, items must be picked up at the sale
              location. Shipping arrangements, if any, are solely between Buyer and Organizer.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">6. Platform Fees</h2>
            <p className="text-warm-700 leading-relaxed mb-3">
              FindA.Sale charges a <strong>10% flat platform fee</strong> on each completed transaction, regardless of
              sale type (fixed-price or auction). The fee is deducted automatically from the Organizer payout.
            </p>
            <p className="text-warm-700 leading-relaxed">
              Fees are exclusive of any Stripe payment processing fees, which are charged separately per Stripe's
              standard rates. We reserve the right to modify our fee structure with 30 days' notice to Organizers.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">7. Payment Processing</h2>
            <p className="text-warm-700 leading-relaxed">
              Payments are processed by Stripe, Inc. By making or receiving a payment on FindA.Sale you agree to
              Stripe's{' '}
              <a href="https://stripe.com/legal/ssa" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">
                Services Agreement
              </a>{' '}
              and{' '}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">
                Privacy Policy
              </a>. FindA.Sale does not store full payment card information. Payment data is handled exclusively by Stripe's
              PCI-compliant infrastructure.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">8. Prohibited Conduct</h2>
            <p className="text-warm-700 leading-relaxed mb-3">You agree not to:</p>
            <ul className="list-disc list-inside text-warm-700 space-y-2">
              <li>Use the Platform for any unlawful purpose</li>
              <li>Scrape, copy, or aggregate Platform data without written permission</li>
              <li>Circumvent or attempt to circumvent the payment system (e.g., off-platform cash deals)</li>
              <li>Create fake listings, shill bids, or manipulate ratings</li>
              <li>Harass, threaten, or impersonate other users</li>
              <li>Introduce malware, bots, or automated scripts that damage Platform performance</li>
              <li>Resell access to the Platform or your account credentials</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">9. Intellectual Property</h2>
            <p className="text-warm-700 leading-relaxed mb-3">
              The FindA.Sale name, logo, and Platform software are owned by FindA.Sale LLC and protected by applicable
              intellectual property laws. You may not use our trademarks without prior written consent.
            </p>
            <p className="text-warm-700 leading-relaxed">
              By uploading photos or content to the Platform, you grant FindA.Sale a non-exclusive, royalty-free,
              worldwide license to display and promote that content in connection with the Platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">10. Disclaimers</h2>
            <p className="text-warm-700 leading-relaxed mb-3">
              THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
              INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
              NON-INFRINGEMENT. We do not warrant that the Platform will be uninterrupted, error-free, or free of
              viruses.
            </p>
            <p className="text-warm-700 leading-relaxed">
              We make no representations about the accuracy, completeness, or quality of any listing. You rely on
              Organizer-provided descriptions at your own risk.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">11. Limitation of Liability</h2>
            <p className="text-warm-700 leading-relaxed mb-3">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, FIND\u0410.SALE LLC AND ITS MEMBERS, OFFICERS, AND AGENTS SHALL NOT
              BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR
              USE OF THE PLATFORM, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="text-warm-700 leading-relaxed">
              OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING FROM OR RELATED TO THESE TERMS OR YOUR USE OF THE
              PLATFORM SHALL NOT EXCEED THE GREATER OF (A) $100 OR (B) THE FEES PAID BY YOU TO FIND\u0410.SALE IN THE
              THREE MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">12. Indemnification</h2>
            <p className="text-warm-700 leading-relaxed">
              You agree to indemnify and hold harmless FindA.Sale LLC and its members, officers, and agents from any
              claims, losses, liabilities, and expenses (including reasonable attorneys' fees) arising from your use of
              the Platform, your listings or purchases, or your violation of these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">13. Governing Law & Disputes</h2>
            <p className="text-warm-700 leading-relaxed">
              These Terms are governed by the laws of the State of Michigan, without regard to conflict-of-law
              principles. Any dispute shall be resolved in the state or federal courts located in Kent County, Michigan,
              and you consent to personal jurisdiction in those courts.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">14. Changes to These Terms</h2>
            <p className="text-warm-700 leading-relaxed">
              We may update these Terms at any time. When we do, we will post the revised Terms with an updated
              effective date. Continued use of the Platform after the effective date constitutes acceptance of the
              revised Terms. We will provide 14 days' advance notice of material changes via email to registered users.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">15. Contact</h2>
            <p className="text-warm-700 leading-relaxed">
              Questions about these Terms? Contact us at{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>.
            </p>
          </section>

          <div className="border-t border-warm-200 pt-6 text-sm text-warm-500">
            <p>
              See also our{' '}
              <Link href="/privacy" className="text-amber-600 hover:underline">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default TermsPage;
