import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const SecurityNoticePage = () => {
  const lastChecked = 'August 3, 2026';

  return (
    <>
      <Head>
        <title>Security Notices | FindA.Sale</title>
        <meta
          name="description"
          content="Security notices for FindA.Sale. Confirmed security incidents affecting user data are posted here, as described in our Privacy Policy."
        />
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Security Notices</h1>
          <p className="text-warm-500 dark:text-warm-400 mb-10">No incidents reported as of {lastChecked}</p>

          <section className="mb-8">
            <div className="rounded-lg border border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-900 px-6 py-8">
              <h2 className="text-xl font-semibold text-warm-800 dark:text-warm-200 mb-3">
                There are no active security notices at this time.
              </h2>
              <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
                Any confirmed security incident affecting user data will be posted here within 72 hours of
                confirmation, and affected users will also be notified directly by email. We&apos;ll keep this page
                plain and factual &mdash; what happened, what data was involved, and what we&apos;re doing about it.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">How This Page Works</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              This is where FindA.Sale posts notice of any confirmed security breach affecting your personal
              information, as described in our{' '}
              <Link href="/privacy" className="text-amber-600 hover:underline">Privacy Policy</Link>. We only post
              here once an incident is confirmed &mdash; not for routine security maintenance or unconfirmed reports.
            </p>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              If you believe your account has been compromised, or you&apos;ve spotted something that looks off,
              contact us right away at{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>.
            </p>
          </section>

          <div className="border-t border-warm-200 dark:border-gray-700 pt-6 text-sm text-warm-500 dark:text-warm-400">
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

export const getStaticProps = async () => {
  return { props: {} };
};

export default SecurityNoticePage;
