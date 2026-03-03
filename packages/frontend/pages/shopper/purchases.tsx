import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import CheckoutModal from '../../components/CheckoutModal';
import { useToast } from '../../components/ToastContext';

interface Purchase {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  stripePaymentIntentId: string | null;
  item: {
    title: string;
    photoUrls: string[];
  };
  sale: {
    title: string;
  };
}

const PurchaseHistoryPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [checkoutPurchase, setCheckoutPurchase] = useState<{ id: string; title: string } | null>(null);

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const response = await api.get('/users/purchases');
      return response.data as Purchase[];
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please log in to view your purchases</h2>
          <Link href="/login" className="text-blue-600 hover:text-blue-800">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Purchase History - FindA.Sale</title>
        <meta name="description" content="Your purchase history" />
      </Head>

      {checkoutPurchase && (
        <CheckoutModal
          purchaseId={checkoutPurchase.id}
          itemTitle={checkoutPurchase.title}
          onClose={() => setCheckoutPurchase(null)}
          onSuccess={() => {
            setCheckoutPurchase(null);
            showToast('Payment successful!', 'success');
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
          }}
        />
      )}

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Purchase History</h1>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <p>Loading purchase history...</p>
            </div>
          ) : purchases.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">You haven't made any purchases yet.</p>
              <Link
                href="/"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
              >
                Browse Sales
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th scope="col" className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className={purchase.status === 'PENDING' ? 'bg-yellow-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {purchase.item.photoUrls.length > 0 ? (
                            <img
                              src={purchase.item.photoUrls[0]}
                              alt={purchase.item.title}
                              className="h-10 w-10 rounded-md object-cover"
                            />
                          ) : (
                            <div className="bg-gray-200 border-2 border-dashed rounded-xl w-10 h-10" />
                          )}
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{purchase.item.title}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {purchase.sale.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${purchase.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          purchase.status === 'PAID'     ? 'bg-green-100 text-green-800' :
                          purchase.status === 'PENDING'  ? 'bg-yellow-100 text-yellow-800' :
                          purchase.status === 'REFUNDED' ? 'bg-gray-100 text-gray-600' :
                          purchase.status === 'FAILED'   ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {purchase.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(purchase.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {purchase.status === 'PENDING' && purchase.stripePaymentIntentId && (
                          <button
                            onClick={() => setCheckoutPurchase({ id: purchase.id, title: purchase.item.title })}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded"
                          >
                            Pay Now
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PurchaseHistoryPage;
