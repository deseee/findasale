import Head from 'next/head';
import Link from 'next/link';

interface Feature {
  title: string;
  description: string;
  icon: string;
}

const PRO_FEATURES: Feature[] = [
  {
    title: 'Brand Kit',
    description: 'Upload your logo, customize colors, and add social links. Your branding automatically appears on all your sales and social templates.',
    icon: '🎨',
  },
  {
    title: 'Flip Report',
    description: 'Get detailed post-sale analytics: sell-through %, revenue drivers, category breakdown, and pricing insights in a print-friendly PDF.',
    icon: '📊',
  },
  {
    title: 'Command Center',
    description: 'Manage multiple sales from one dashboard. Track performance across all your active sales in real time.',
    icon: '🎯',
  },
  {
    title: 'Batch Operations',
    description: 'Edit hundreds of items at once. Change prices, photos, descriptions, and categories in bulk to save hours of manual work.',
    icon: '📦',
  },
  {
    title: 'Data Export',
    description: 'Export your sale data as CSV for accounting, bookkeeping, and future planning. Keep records organized.',
    icon: '📥',
  },
  {
    title: 'Priority Support',
    description: 'Get priority email support with a 24-hour response guarantee. Plus, your profile displays a Verified badge to build trust.',
    icon: '⭐',
  },
];

export default function ProFeaturesPage() {
  return (
    <>
      <Head>
        <title>PRO Features | FindA.Sale</title>
        <meta name="description" content="Explore everything included in the PRO organizer tier" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="font-fraunces text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Everything You Need to Run a Professional Sale
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              The PRO tier includes six powerful features designed to save time, increase sales, and help you grow your business.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            {PRO_FEATURES.map((feature, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 hover:shadow-lg transition"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h2 className="font-fraunces text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                  {feature.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          {/* Social Proof */}
          <div className="bg-sage-50 rounded-lg border border-sage-200 p-8 mb-12">
            <p className="text-center text-gray-700 dark:text-gray-300 leading-relaxed">
              <span className="font-semibold">Join estate sale organizers who trust FindA.Sale.</span> PRO features help you streamline operations, understand what sells, and build a professional brand.
            </p>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Link
              href="/organizer/upgrade"
              className="inline-block bg-sage-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-sage-700 transition"
            >
              Upgrade to PRO
            </Link>
            <p className="text-gray-600 dark:text-gray-400 mt-4">7-day free trial — no credit card required</p>
          </div>
        </div>
      </div>
    </>
  );
}
