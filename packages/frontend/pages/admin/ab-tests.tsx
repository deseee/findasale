import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';
import Layout from '../../components/Layout';

interface VariantResult {
  variant: string;
  views: number;
  clicks: number;
  conversions: number;
  conversionRate: number;
}

interface TestResults {
  variants: VariantResult[];
}

const ABTestsPage = () => {
  const router = useRouter();
  const { user, isLoading: userLoading } = useAuth();
  const [results, setResults] = useState<TestResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showClearToast, setShowClearToast] = useState(false);

  // Redirect if not admin
  useEffect(() => {
    if (!userLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, userLoading, router]);

  // Fetch test results
  useEffect(() => {
    if (!user?.roles?.includes('ADMIN')) return;

    const fetchResults = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await api.get('/ab/results/hero_cta_v1');
        setResults(response.data);
      } catch (err) {
        console.error('Error fetching A/B test results:', err);
        setError('Failed to load test results');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [user?.role]);

  const handleClearData = () => {
    setShowClearToast(true);
    setTimeout(() => setShowClearToast(false), 3000);
  };

  const getWinner = (): VariantResult | null => {
    if (!results?.variants || results.variants.length === 0) return null;
    return results.variants.reduce((prev, current) =>
      current.conversionRate > prev.conversionRate ? current : prev
    );
  };

  const winner = getWinner();

  if (userLoading || (user?.role === 'ADMIN' && loading)) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-amber-600 border-t-white"></div>
        </div>
      </Layout>
    );
  }

  if (user?.role !== 'ADMIN') {
    return null;
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-8">A/B Tests</h1>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {results && (
          <div className="space-y-8">
            {/* Test Card: Hero CTA v1 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">Hero CTA v1</h2>
                  <p className="text-warm-600 dark:text-warm-400 text-sm mt-1">Homepage call-to-action button variants</p>
                </div>
                {winner && (
                  <div className="px-4 py-2 bg-green-100 border border-green-300 rounded-lg">
                    <p className="text-xs font-bold text-green-800 dark:text-green-200 uppercase">Winner</p>
                    <p className="text-sm font-bold text-green-700">Variant {winner.variant}</p>
                  </div>
                )}
              </div>

              {/* Results Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-warm-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 font-bold text-warm-900 dark:text-warm-100">Variant</th>
                      <th className="text-right py-3 px-4 font-bold text-warm-900 dark:text-warm-100">Views</th>
                      <th className="text-right py-3 px-4 font-bold text-warm-900 dark:text-warm-100">Clicks</th>
                      <th className="text-right py-3 px-4 font-bold text-warm-900 dark:text-warm-100">Conversions</th>
                      <th className="text-right py-3 px-4 font-bold text-warm-900 dark:text-warm-100">Conversion Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.variants.map((variant) => (
                      <tr
                        key={variant.variant}
                        className={`border-b border-warm-100 transition-colors ${
                          winner?.variant === variant.variant ? 'bg-green-50' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <span className="font-bold text-warm-900 dark:text-warm-100">Variant {variant.variant}</span>
                        </td>
                        <td className="text-right py-3 px-4 text-warm-700 dark:text-warm-300">{variant.views}</td>
                        <td className="text-right py-3 px-4 text-warm-700 dark:text-warm-300">{variant.clicks}</td>
                        <td className="text-right py-3 px-4 text-warm-700 dark:text-warm-300">{variant.conversions}</td>
                        <td className="text-right py-3 px-4">
                          <span className="font-bold text-amber-600">{variant.conversionRate.toFixed(2)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Clear Data Button */}
              <div className="mt-6 pt-6 border-t border-warm-200 dark:border-gray-700">
                <button
                  onClick={handleClearData}
                  className="px-4 py-2 bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300 rounded-lg hover:bg-warm-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                >
                  Clear Test Data
                </button>
                <p className="text-xs text-warm-600 dark:text-warm-400 mt-2">Contact support to reset test data</p>
              </div>
            </div>

            {/* Empty State */}
            {results.variants.length === 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 px-4 py-3 rounded">
                <p>No test data available yet. Check back once the test has started.</p>
              </div>
            )}
          </div>
        )}

        {/* Toast Notification */}
        {showClearToast && (
          <div className="fixed bottom-4 right-4 bg-green-100 border border-green-300 text-green-700 px-4 py-3 rounded-lg shadow-lg">
            Data clear request submitted. Contact support to proceed.
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ABTestsPage;
