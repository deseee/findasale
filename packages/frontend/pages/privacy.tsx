import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const PrivacyPage = () => {
  const effectiveDate = 'March 5, 2026';

  return (
    <>
      <Head>
        <title>Privacy Policy \u2013 FindA.Sale</title>
        <meta name="description" content="Privacy Policy for FindA.Sale \u2014 estate sales, yard sales, auctions, and flea markets. How we collect, use, and protect your personal information." />
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Privacy Policy</h1>
          <p className="text-warm-500 dark:text-warm-400 mb-10">Effective date: {effectiveDate}</p>

          <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-8">
            FindA.Sale LLC ("Company," "we," "us," or "our") operates the FindA.Sale platform at finda.sale. This
            Privacy Policy explains what information we collect, how we use it, and your choices regarding your
            information. By using FindA.Sale you agree to the practices described in this Policy.
          </p>

          {/* 1 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">1. Information We Collect</h2>

            <h3 className="text-lg font-semibold text-warm-700 dark:text-warm-300 mb-2">Account Information</h3>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              When you register, we collect your name, email address, and password (stored as a one-way hash). Organizers
              additionally provide business name, phone number, and payout information required by Stripe Connect.
            </p>

            <h3 className="text-lg font-semibold text-warm-700 dark:text-warm-300 mb-2">Transaction Information</h3>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              We record purchase history, bid history, and payout records. Payment card details are never stored on our
              servers \u2014 they are transmitted directly to Stripe and handled under their PCI-compliant infrastructure.
            </p>

            <h3 className="text-lg font-semibold text-warm-700 dark:text-warm-300 mb-2">Location Information</h3>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              Listings for estate sales, yard sales, auctions, and flea markets include organizer-provided addresses,
              which we geocode and store as latitude/longitude coordinates to power map features. We do not continuously
              track your device location.
            </p>

            <h3 className="text-lg font-semibold text-warm-700 dark:text-warm-300 mb-2">Content You Upload</h3>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              Organizers upload item photos, which we store via Cloudinary. We may pass uploaded images through
              automated analysis services to generate suggested item descriptions; those
              descriptions are saved only if the Organizer accepts them.
            </p>

            <h3 className="text-lg font-semibold text-warm-700 dark:text-warm-300 mb-2">Usage Data</h3>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              We automatically collect browser type, device type, IP address, pages visited, search queries, and
              referring URLs via server logs. This data is used for analytics, performance monitoring, and fraud
              prevention.
            </p>

            <h3 className="text-lg font-semibold text-warm-700 dark:text-warm-300 mb-2">Cookies and Local Storage</h3>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              We use session cookies for authentication, local storage to maintain UI preferences, and push notification
              tokens if you opt in. We do not use third-party advertising cookies. You can disable cookies in your
              browser settings, but some Platform features may not function correctly.
            </p>
          </section>

          {/* 2 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">2. How We Use Your Information</h2>
            <ul className="list-disc list-inside text-warm-700 dark:text-warm-300 space-y-2">
              <li>To create and manage your account</li>
              <li>To process purchases, payouts, and refunds</li>
              <li>To display sale listings and map locations</li>
              <li>To send transactional emails (purchase confirmations, payout notices, sale reminders)</li>
              <li>To send weekly curator emails and deal alerts if you subscribe (you can unsubscribe at any time)</li>
              <li>To send push notifications for sales you follow (if you grant permission)</li>
              <li>To detect fraud and enforce our Terms of Service</li>
              <li>To monitor Platform performance via Sentry error tracking</li>
              <li>To improve the Platform through aggregate analytics</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          {/* 3 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">3. How We Share Your Information</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-3">
              We do not sell your personal information. We share information only in the following circumstances:
            </p>
            <ul className="list-disc list-inside text-warm-700 dark:text-warm-300 space-y-2">
              <li>
                <strong>Stripe:</strong> Payment information is shared with Stripe to process transactions. Stripe may
                collect additional information during Stripe Connect onboarding per their own Privacy Policy.
              </li>
              <li>
                <strong>Cloudinary:</strong> Item photos are stored and served via Cloudinary's CDN.
              </li>
              <li>
                <strong>Sentry:</strong> Error and performance data (which may include anonymized request details) is
                sent to Sentry for monitoring.
              </li>
              <li>
                <strong>Auto-Tagging Services:</strong> If auto-tagging is enabled, item photos may be sent to automated
                analysis services for label generation. No personally identifiable information is included
                in these requests.
              </li>
              <li>
                <strong>Organizer/Buyer transactions:</strong> When a purchase is made, the Organizer receives the
                Buyer's name and order details sufficient to fulfill the transaction.
              </li>
              <li>
                <strong>Legal requirements:</strong> We may disclose information if required by law, subpoena, or to
                protect the rights, property, or safety of FindA.Sale, our users, or the public.
              </li>
            </ul>
          </section>

          {/* 4 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">4. Data Retention</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              We retain account information for as long as your account is active. Transaction records are retained
              for a minimum of seven years to comply with financial recordkeeping requirements. You may request deletion
              of your account by contacting{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>;
              we will delete personal data that we are not legally required to retain within 30 days.
            </p>
          </section>

          {/* 5 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">5. Security</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              We implement industry-standard security measures including encrypted connections (HTTPS/TLS), hashed
              passwords, JWT-based authentication, and restricted database access. We monitor for unusual activity via
              Sentry. No system is perfectly secure; if you believe your account has been compromised, contact us
              immediately at{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>.
            </p>
          </section>

          {/* 6 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">6. Your Rights and Choices</h2>
            <ul className="list-disc list-inside text-warm-700 dark:text-warm-300 space-y-2">
              <li>
                <strong>Access and correction:</strong> You can view and update most account information in your
                profile settings.
              </li>
              <li>
                <strong>Email opt-out:</strong> You can unsubscribe from marketing emails via the unsubscribe link in
                any such email or via <Link href="/unsubscribe" className="text-amber-600 hover:underline">/unsubscribe</Link>.
                Transactional emails (purchase receipts, payout notices) cannot be disabled while your account is active.
              </li>
              <li>
                <strong>Push notifications:</strong> You can revoke notification permission at any time in your browser
                or device settings.
              </li>
              <li>
                <strong>Account deletion:</strong> Contact{' '}
                <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>{' '}
                to request account deletion.
              </li>
              <li>
                <strong>Michigan residents:</strong> If you are a Michigan resident, you may have additional rights
                under applicable state law. Contact us with any such requests.
              </li>
            </ul>
          </section>

          {/* 7 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">7. Children's Privacy</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              FindA.Sale is not directed to children under 18. We do not knowingly collect personal information from
              minors. If you believe we have inadvertently collected such information, please contact us and we will
              delete it promptly.
            </p>
          </section>

          {/* 8 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">8. Third-Party Links</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              The Platform may contain links to third-party websites (e.g., Stripe's dashboard). We are not responsible
              for the privacy practices of those sites and encourage you to review their privacy policies.
            </p>
          </section>

          {/* 9 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">9. Changes to This Policy</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              We may update this Privacy Policy periodically. When we do, we will post the revised Policy with an
              updated effective date. For material changes, we will notify registered users by email at least 14 days
              before the change takes effect.
            </p>
          </section>

          {/* 10 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">10. Contact Us</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              Privacy questions or requests? Email us at{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>{' '}
              or use our{' '}
              <Link href="/contact" className="text-amber-600 hover:underline">contact form</Link>.
            </p>
          </section>

          <div className="border-t border-warm-200 dark:border-gray-700 pt-6 text-sm text-warm-500 dark:text-warm-400">
            <p>
              See also our{' '}
              <Link href="/terms" className="text-amber-600 hover:underline">Terms of Service</Link>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default PrivacyPage;
