import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';

export default function PurchaseDetailPage() {
  const router = useRouter();
  const { purchaseId } = router.query;
  const { data: session, status } = useSession();

  const { data: purchase, isLoading, error } = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: async () => {
      const { data } = await api.get(`/api/loot-log/${purchaseId}`);
      return data;
    },
    enabled: !!purchaseId && status === 'authenticated',
  });

  // Redirect to login if not authenticated
  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  if (status === 'loading' || isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-xl text-slate-700 mb-4">Purchase not found</p>
          <Link href="/shopper/loot-log">
            <a className="px-6 py-2 bg-[#8FB897] text-white rounded-lg">Back to Loot Log</a>
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

      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-2xl mx-auto px-4 py-12">
          {/* Back Link */}
          <Link href="/shopper/loot-log">
            <a className="text-[#8FB897] font-semibold mb-8 inline-flex items-center">
              ← Back to Loot Log
            </a>
          </Link>

          {/* Detail Card */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-lg">
            <div className="grid grid-cols-2 gap-8 p-8">
              {/* Image */}
              <div className="flex items-center justify-center bg-slate-100 rounded-lg overflow-hidden">
                {purchase?.item?.imageUrl ? (
                  <Image
                    src={purchase.item.imageUrl}
                    alt={purchase.item.title}
                    width={300}
                    height={300}
                    objectFit="cover"
                  />
                ) : (
                  <div className="w-full h-80 flex items-center justify-center text-slate-400">
                    No image available
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex flex-col justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 mb-4">{purchase?.item?.title}</h1>

                  <div className="space-y-4 mb-8">
                    <InfoRow label="Category" value={purchase?.item?.category} />
                    <InfoRow label="Price Paid" value={`$${purchase?.amount?.toFixed(2)}`} />
                    <InfoRow label="Item Condition" value={purchase?.item?.description || 'Not specified'} />
                    <InfoRow label="Purchase Date" value={purchaseDate} />
                  </div>

                  {/* Sale Info */}
                  <div className="border-t border-slate-200 pt-6">
                    <h3 className="font-semibold text-slate-900 mb-4">Sale Information</h3>
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
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-800">✓ Purchase Complete</p>
                  <p className="text-xs text-green-700 mt-1">Transaction ID: {purchase?.id}</p>
                </div>
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
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value || 'N/A'}</span>
    </div>
  );
}
