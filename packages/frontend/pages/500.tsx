import Head from 'next/head';
import Link from 'next/link';

export default function ServerError() {
  return (
    <>
      <Head>
        <title>Something went wrong – FindA.Sale</title>
      </Head>
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <div className="max-w-md">
          <p className="text-6xl font-extrabold text-blue-600 mb-4">500</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h1>
          <p className="text-gray-600 mb-8">
            Our server hit an unexpected error. We've been notified and are working on it. Please
            try again in a few moments.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Try again
            </button>
            <Link
              href="/"
              className="border border-gray-300 hover:border-gray-400 text-gray-700 font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
