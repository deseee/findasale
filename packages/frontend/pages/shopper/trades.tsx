import Head from 'next/head';
import Link from 'next/link';

export default function ShopperTradesPage() {
  return (
    <>
      <Head>
        <title>Trades - FindA.Sale</title>
        <meta name="description" content="Coming soon: Item trade and swap between shoppers" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">🔄</div>

          <h1 className="text-4xl font-bold text-indigo-900 dark:text-gray-100 mb-4">
            Trades
          </h1>

          <p className="text-lg text-indigo-700 dark:text-gray-400 mb-8">
            Trade and swap items with other shoppers.
          </p>

          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-6 mb-8">
            <p className="text-sm text-indigo-800 dark:text-indigo-200">
              🎉 <strong>Coming Soon</strong> — Feature in development
            </p>
          </div>

          <Link
            href="/shopper/dashboard"
            className="inline-block px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </>
  );
}
