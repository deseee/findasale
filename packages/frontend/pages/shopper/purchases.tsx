import { useState } from 'react';
import Head from 'next/head';

interface Purchase {
  id: string;
  itemTitle: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'REFUNDED';
  purchaseDate: string;
}

export default function PurchasesPage() {
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'PAID' | 'REFUNDED'>('ALL');
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const filteredPurchases =
    filterStatus === 'ALL' ? purchases : purchases.filter((p) => p.status === filterStatus);

  return (
    <>
      <Head>
        <title>Purchase History — FindA.Sale</title>
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Purchase History</h1>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All</option>
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>

        <div className="bg-white rounded-lg shadow">
          {filteredPurchases.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No purchases found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Item</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Amount</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredPurchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-900">{purchase.itemTitle}</td>
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        ${purchase.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            purchase.status === 'PAID'
                              ? 'bg-green-100 text-green-800'
                              : purchase.status === 'PENDING'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {purchase.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{
                        new Date(purchase.purchaseDate).toLocaleDateString()
                      }</td>
                      <td className="px-6 py-4">
                        {purchase.status === 'PENDING' && (
                          <button className="text-blue-600 hover:underline text-sm font-medium">
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
      </div>
    </>
  );
}
