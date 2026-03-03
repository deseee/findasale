import Head from 'next/head';
import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found – FindA.Sale</title>
      </Head>
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <div className="max-w-md">
          <p className="text-6xl font-extrabold text-blue-600 mb-4">404</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Page not found</h1>
          <p className="text-gray-600 mb-8">
            The page you're looking for doesn't exist or may have moved. Double-check the URL or
            head back to the homepage.
          </p>
          <Link
            href="/"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
          >
            Back to FindA.Sale
          </Link>
        </div>
      </div>
    </>
  );
}
