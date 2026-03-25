import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../components/AuthContext';
import api from '../../../lib/api';

export default function PurchaseDetailPage() {
  const router = useRouter();
  const { purchaseId } = router.query;
  const { user, isLoading: authLoading } = useAuth();

  const { data: purchase, isLoading, error } = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: async () => {
      const { data } = await api.get(`/api/loot-log/${purchaseId}`);
      return data;
    },
    enabled: !!purchaseId && !!user,
  });

  // Redirect to login if not authenticated
  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  if (authLoading || isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="text-center px-4 max-w-md">
          <p className="text-xl text-warm-700 dark:text-warm-300 mb-4">Purchase not found</p>
          <Link
            href="/shopper/loot-log"
            className="px-6 py-2 bg-[#8FB897] text-white rounded-lg"
          >
            Back to Loot Log
          </Link>
        </div>
      </div>
    );
  }

  const purchaseDate = new Date(purchase?.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <Head>
        <title>{purchase?.item?.title || 'Purchase'} — My Loot Log</title>
      </Head>

      <main className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-12">
          {/* Back Link */}
          <Link
            href="/shopper/loot-log"
            className="text-[#8FB897] font-semibold mb-8 inline-flex items-center"
          >
            ← Back to Loot Log
          </Link>

          {/* Detail Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-hidden shadow-lg">
            <div className="grid grid-cols-2 gap-8 p-8">
              {/* Image */}
              <div className="flex items-center justify-center bg-warm-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                {purchase?.item?.imageUrl ? (
                  <Image
                    src={purchase.item.imageUrl}
                    alt={purchase.item.title}
                    width={300}
                    height={300}
                    objectFit="cover"
                  />
                ) : (
                  <div className="w-full h-80 flex items-center justify-center text-warm-400">
                    No image available
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex flex-col justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-4">{purchase?.item?.title}</h1>

                  <div className="space-y-4 mb-8">
                    <InfoRow label="Category" value={purchase?.item?.category} />
                    <InfoRow label="Price Paid" value={`$${purchase?.amount?.toFixed(2)}`} />
                    <InfoRow label="Item Condition" value={purchase?.item?.description || 'Not specified'} />
                    <InfoRow label="Purchase Date" value={purchaseDate} />
                  </div>

                  {/* Sale Info */}
                  <div className="border-t border-warm-200 dark:border-gray-700 pt-6">
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-4">Sale Information</h3>
                    <div className="space-y-2">
                      <InfoRow label="Sale Name" value={purchase?.sale?.title} />
                      <InfoRow
                        label="Sale Location"
                        value={purchase?.sale?.address || 'Not specified'}
                      />
                      <InfoRow
                        label="Sale Date"
                        value={new Date(purchase?.sale?.startDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      />
                    </div>
                  </div>
                </div>

                {/* Receipt Badge */}
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-green-800 dark:text-green-200">✓ Purchase Complete</p>
                  <p className="text-xs text-green-700 mt-1">Transaction ID: {purchase?.id}</p>
                </div>

                {/* Share Your Find CTA */}
                <Link
                  href="/haul/coming-soon"
                  className="w-full block text-center px-6 py-3 bg-gradient-to-r from-[#8FB897] to-[#7AA584] text-white font-semibold rounded-lg hover:from-[#7AA584] hover:to-[#6A9574] transition transform hover:scale-105"
                >
                  📸 Share Your Find!
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex justify-between">
      <span className="text-warm-600 dark:text-warm-400">{label}</span>
      <span className="font-semibold text-warm-900 dark:text-warm-100">{value || 'N/A'}</span>
    </div>
  );
}
