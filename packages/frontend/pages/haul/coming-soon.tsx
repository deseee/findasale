import Head from 'next/head';
import Link from 'next/link';

export default function HaulComingSoonPage() {
  return (
    <>
      <Head>
        <title>Share Your Finds — Coming Soon</title>
        <meta name="description" content="Coming soon: Share your haul photos and connect with the community" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">📸</div>

          <h1 className="text-4xl font-bold text-slate-900 dark:text-gray-100 mb-4">
            Share Your Finds
          </h1>

          <p className="text-lg text-slate-600 dark:text-gray-400 mb-8">
            Show off your latest haul! Post photos of your finds, tag items, and connect with other collectors in the community.
          </p>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              🎉 <strong>Coming Soon</strong> — This feature is being crafted with love. Stay tuned!
            </p>
          </div>

          <div className="space-y-3 mb-8">
            <p className="text-slate-700 dark:text-gray-300 font-semibold">
              You'll be able to:
            </p>
            <ul className="text-left space-y-2 text-slate-600 dark:text-gray-400">
              <li className="flex items-start">
                <span className="text-[#8FB897] mr-3">✓</span>
                <span>Upload photos of your recent purchases</span>
              </li>
              <li className="flex items-start">
                <span className="text-[#8FB897] mr-3">✓</span>
                <span>Link items and share your story</span>
              </li>
              <li className="flex items-start">
                <span className="text-[#8FB897] mr-3">✓</span>
                <span>React with 🔥 and ❤️ to others' finds</span>
              </li>
              <li className="flex items-start">
                <span className="text-[#8FB897] mr-3">✓</span>
                <span>Build your collector reputation</span>
              </li>
            </ul>
          </div>

          <Link
            href="/shopper/loot-log"
            className="inline-block px-8 py-3 bg-[#8FB897] text-white font-semibold rounded-lg hover:bg-opacity-90 transition"
          >
            ← Back to My Loot Log
          </Link>
        </div>
      </div>
    </>
  );
}
