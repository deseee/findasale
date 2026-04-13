import Head from 'next/head';
import Link from 'next/link';

export default function AdminReportsPage() {
  return (
    <>
      <Head>
        <title>Reports - FindA.Sale Admin</title>
        <meta name="description" content="Coming soon: Platform analytics and reports" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">📈</div>

          <h1 className="text-4xl font-bold text-red-900 dark:text-gray-100 mb-4">
            Reports
          </h1>

          <p className="text-lg text-red-700 dark:text-gray-400 mb-8">
            Platform analytics and detailed reports.
          </p>

          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 mb-8">
            <p className="text-sm text-red-800 dark:text-red-200">
              🎉 <strong>Coming Soon</strong> — Admin feature in development
            </p>
          </div>

          <Link
            href="/admin"
            className="inline-block px-8 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition"
          >
            ← Back to Admin
          </Link>
        </div>
      </div>
    </>
  );
}
