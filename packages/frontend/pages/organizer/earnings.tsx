import Head from 'next/head';
import Link from 'next/link';

export default function OrganizerEarningsPage() {
  return (
    <>
      <Head>
        <title>Earnings - FindA.Sale</title>
        <meta name="description" content="Coming soon: In-depth sales analytics and earnings breakdown" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">📊</div>

          <h1 className="text-4xl font-bold text-warm-900 dark:text-gray-100 mb-4">
            Earnings
          </h1>

          <p className="text-lg text-warm-700 dark:text-gray-400 mb-8">
            Detailed sales analytics and earnings breakdown by category and time period.
          </p>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 mb-8">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              🎉 <strong>Coming Soon</strong> — Analytics in development
            </p>
          </div>

          <Link
            href="/organizer/dashboard"
            className="inline-block px-8 py-3 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 transition"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </>
  );
}
