import React from 'react';
import Head from 'next/head';

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Terms of Service - FindA.Sale</title>
        <meta name="description" content="Terms of Service for FindA.Sale" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-8"><strong>Last Updated:</strong> March 3, 2026</p>

          <div className="prose prose-lg text-gray-700 space-y-8">

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing or using FindA.Sale ("the Platform," "we," "us," or "our"), you agree to be bound
                by these Terms of Service ("Terms") and our Privacy Policy. These Terms apply to all visitors,
                registered users, buyers, and organizers. If you do not agree to these Terms, do not use the Platform.
              </p>
              <p className="mt-3">
                We may update these Terms from time to time. Continued use of the Platform after changes are posted
                constitutes your acceptance of the revised Terms. We will notify registered users of material changes
                by email or in-platform notification.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. About the Platform</h2>
              <p>
                FindA.Sale is an online marketplace platform that connects estate sale organizers ("Organizers")
                with potential buyers ("Shoppers"). We provide tools for listing sales and items, managing
                inventory, accepting payments, and facilitating communication between parties.
              </p>
              <p className="mt-3">
                FindA.Sale is a venue. We are not the seller or organizer of any estate sale listed on the
                Platform. Items are offered for sale by independent Organizers, and FindA.Sale is not party to
                any transaction between an Organizer and a Shopper except to facilitate payment processing.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. Eligibility and Accounts</h2>
              <p>
                You must be at least 18 years old to create an account or make purchases on FindA.Sale. By
                creating an account, you represent that all information you provide is accurate and that you have
                the legal capacity to enter into these Terms.
              </p>
              <p className="mt-3">
                You are responsible for maintaining the confidentiality of your account credentials and for all
                activity that occurs under your account. Notify us immediately at{' '}
                <a href="mailto:support@finda.sale" className="text-blue-600 hover:underline">support@finda.sale</a>{' '}
                if you suspect unauthorized access to your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Organizer Responsibilities</h2>
              <p>
                Organizers who list sales and items on FindA.Sale agree to the following:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2">
                <li>All item listings must be accurate, complete, and not misleading. Photos must represent the actual item being sold.</li>
                <li>Organizers are the seller of record for all items they list. FindA.Sale is not responsible for item condition, authenticity, or fulfillment.</li>
                <li>Organizers must honor sales made through the Platform, including online auctions and in-person purchases processed via FindA.Sale.</li>
                <li>Organizers may not list items that are illegal, counterfeit, stolen, hazardous, or otherwise prohibited by applicable law.</li>
                <li>Organizers are responsible for accurately representing sale dates, times, locations, and access policies.</li>
                <li>Organizers are responsible for collecting and remitting any applicable sales taxes for their transactions, unless otherwise required by law to be handled by FindA.Sale.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Shopper Responsibilities</h2>
              <p>
                Shoppers who browse, bid on, or purchase items through FindA.Sale agree to the following:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2">
                <li>Bids and purchases are binding commitments to pay. Do not place bids or initiate purchases you do not intend to complete.</li>
                <li>Shoppers are responsible for reviewing item descriptions and photos before purchasing. All sales are final unless the Organizer has a stated return policy or there is a qualifying dispute.</li>
                <li>Shoppers agree to comply with the individual policies of each Organizer, including in-person attendance rules, line management procedures, and item pickup requirements.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Payments and Fees</h2>
              <p>
                FindA.Sale uses Stripe to process payments. By making or receiving a payment through the Platform,
                you agree to Stripe's Terms of Service. FindA.Sale does not store your full payment card details.
              </p>
              <p className="mt-3">
                FindA.Sale charges a platform fee on transactions processed through the Platform. Current fee
                rates are disclosed at the time of checkout or during Organizer onboarding. We reserve the right
                to adjust fees with reasonable notice.
              </p>
              <p className="mt-3">
                Organizer payouts are processed through Stripe Connect. Payout timing is subject to Stripe's
                standard processing schedules and any applicable hold periods. FindA.Sale is not liable for
                delays caused by Stripe or banking institutions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Refund and Dispute Policy</h2>
              <p>
                <strong>All sales are final</strong> unless an exception applies below. Because estate sale
                items are unique and often one-of-a-kind, we do not generally accept returns or issue refunds
                after a sale is completed.
              </p>
              <p className="mt-3">
                Exceptions that may qualify for a refund or dispute resolution include:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2">
                <li>An item was materially misrepresented in the listing (wrong item, significant undisclosed damage).</li>
                <li>A charge was processed in error or without authorization.</li>
                <li>An Organizer failed to fulfill a purchased item or honor a completed auction bid.</li>
              </ul>
              <p className="mt-3">
                To initiate a dispute, contact us at{' '}
                <a href="mailto:support@finda.sale" className="text-blue-600 hover:underline">support@finda.sale</a>{' '}
                within 7 days of the transaction date. We will review each case individually, coordinate with the
                relevant Organizer, and work toward a fair resolution. FindA.Sale's decision on disputes is final.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Prohibited Conduct</h2>
              <p>You agree not to use FindA.Sale to:</p>
              <ul className="list-disc pl-6 mt-3 space-y-2">
                <li>Commit fraud, impersonate others, or engage in deceptive practices.</li>
                <li>Circumvent or interfere with the Platform's payment systems, security, or functionality.</li>
                <li>Harvest user data, scrape the Platform, or use automated tools without written permission.</li>
                <li>Post spam, false reviews, or manipulate sale listings.</li>
                <li>List or sell prohibited, stolen, counterfeit, or illegal items.</li>
                <li>Conduct transactions off-platform to avoid fees after connecting through FindA.Sale.</li>
              </ul>
              <p className="mt-3">
                Violations may result in account suspension, removal of listings, forfeiture of funds held in
                dispute, and/or referral to law enforcement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Intellectual Property</h2>
              <p>
                The FindA.Sale name, logo, platform design, and underlying software are owned by FindA.Sale and
                protected by applicable intellectual property laws. You may not reproduce, distribute, or create
                derivative works from our Platform without written permission.
              </p>
              <p className="mt-3">
                By uploading photos or content to FindA.Sale, you grant us a non-exclusive, royalty-free license
                to display that content on the Platform for the purpose of facilitating your listing. You retain
                ownership of your content.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Disclaimer of Warranties</h2>
              <p>
                FindA.Sale is provided "as is" without warranties of any kind, express or implied. We do not
                warrant that the Platform will be uninterrupted, error-free, or secure, or that any item listed
                is authentic, accurately described, or in the stated condition. Your use of the Platform is at
                your own risk.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">11. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, FindA.Sale and its officers, directors, and employees
                shall not be liable for any indirect, incidental, special, consequential, or punitive damages
                arising from your use of the Platform, including but not limited to disputes between buyers and
                sellers, item condition, failed transactions, or Platform downtime.
              </p>
              <p className="mt-3">
                Our total liability to you for any claim arising from your use of the Platform shall not exceed
                the greater of (a) the amount you paid FindA.Sale in fees in the 12 months preceding the claim,
                or (b) $100.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">12. Governing Law</h2>
              <p>
                These Terms are governed by the laws of the State of Michigan, without regard to conflict of
                law principles. Any disputes arising from these Terms shall be resolved in the state or federal
                courts located in Kent County, Michigan.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">13. Contact</h2>
              <p>
                For questions about these Terms, contact us at:{' '}
                <a href="mailto:support@finda.sale" className="text-blue-600 hover:underline">support@finda.sale</a>
              </p>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
};

export default TermsPage;
