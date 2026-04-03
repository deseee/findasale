import Head from 'next/head';
import Link from 'next/link';
import ShopperReferralCard from '../../components/ShopperReferralCard';

export default function ShopperReputationPage() {
  return (
    <>
      <Head>
        <title>Reputation - FindA.Sale</title>
        <meta name="description" content="Coming soon: Shopper reputation and trust score" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-900 dark:to-gray-800 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-indigo-900 dark:text-gray-100 mb-2">
              ⭐ Your Reputation
            </h1>
            <p className="text-lg text-indigo-700 dark:text-gray-400">
              Earn rewards and credit by inviting friends to FindA.Sale.
            </p>
          </div>

          <ShopperReferralCard />

          <div className="mt-8 text-center">
            <Link
              href="/shopper/dashboard"
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
