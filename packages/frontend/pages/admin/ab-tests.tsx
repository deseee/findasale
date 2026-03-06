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
    if (!userLoading && (!user || user.role !== 'ADMIN')) {
      router.push('/');
    }
  }, [user, userLoading, router]);

  // Fetch test results
  useEffect(() => {
    if (user?.role !== 'ADMIN') return;

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
        <h1 className="text-3xl font-bold text-warm-900 mb-8">A/B Tests</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {results && (
          <div className="space-y-8">
            {/* Test Card: Hero CTA v1 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-warm-900">Hero CTA v1</h2>
                  <p className="text-warm-600 text-sm mt-1">Homepage call-to-action button variants</p>
                </div>
                {winner && (
                  <div className="px-4 py-2 bg-green-100 border border-green-300 rounded-lg">
                    <p className="text-xs font-bold text-green-800 uppercase">Winner</p>
                    <p className="text-sm font-bold text-green-700">Variant {winner.variant}</p>
                  </div>
                )}
              </div>

              {/* Results Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-warm-200">
                      <th className="text-left py-3 px-4 font-bold text-warm-900">Variant</th>
                      <th className="text-right py-3 px-4 font-bold text-warm-900">Views</th>
                      <th className="text-right py-3 px-4 font-bold text-warm-900">Clicks</th>
                      <th className="text-right py-3 px-4 font-bold text-warm-900">Conversions</th>
                      <th className="text-right py-3 px-4 font-bold text-warm-900">Conversion Rate</th>
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
                          <span className="font-bold text-warm-900">Variant {variant.variant}</span>
                        </td>
                        <td className="text-right py-3 px-4 text-warm-700">{variant.views}</td>
                        <td className="text-right py-3 px-4 text-warm-700">{variant.clicks}</td>
                        <td className="text-right py-3 px-4 text-warm-700">{variant.conversions}</td>
                        <td className="text-right py-3 px-4">
                          <span className="font-bold text-amber-600">{variant.conversionRate.toFixed(2)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Clear Data Button */}
              <div className="mt-6 pt-6 border-t border-warm-200">
                <button
                  onClick={handleClearData}
                  className="px-4 py-2 bg-warm-100 text-warm-700 rounded-lg hover:bg-warm-200 transition-colors text-sm font-medium"
                >
                  Clear Test Data
                </button>
                <p className="text-xs text-warm-600 mt-2">Contact support to reset test data</p>
              </div>
            </div>

            {/* Empty State */}
            {results.variants.length === 0 && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
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
