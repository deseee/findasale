import { useState } from 'react';
import Head from 'next/head';
import QRCode from 'qrcode';

interface OrganizerDashboardData {
  organizer: {
    id: string;
    businessName: string;
  };
  sales: Array<{
    id: string;
    title: string;
    startDate: string;
    items: Array<{ id: string; title: string }>;
  }>;
  analytics?: {
    totalRevenue: number;
    platformFees: number;
    breakdown: { regular: number; auction: number };
  };
}

export default function OrganizerDashboard() {
  const [activeTab, setActiveTab] = useState<'sales' | 'analytics' | 'lines' | 'payment'>('sales');
  const [stripeConnected, setStripeConnected] = useState(false);
  const [generatedQR, setGeneratedQR] = useState<string>('');

  const data: OrganizerDashboardData = {
    organizer: {
      id: '1',
      businessName: 'My Estate Sales',
    },
    sales: [],
  };

  // Generate QR code for sale
  const generateQRCode = async (saleId: string) => {
    const saleUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000'}/sales/${saleId}`;
    const qrUrl = await QRCode.toDataURL(saleUrl);
    setGeneratedQR(qrUrl);
  };

  // Download QR code
  const downloadQRCode = () => {
    const link = document.createElement('a');
    link.href = generatedQR;
    link.download = `qr-code-${Date.now()}.png`;
    link.click();
  };

  return (
    <>
      <Head>
        <title>Organizer Dashboard — FindA.Sale</title>
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome, {data.organizer.businessName}
          </h1>
          <p className="text-gray-600">Manage your sales, items, and payments.</p>
        </div>

        <div className="flex border-b border-gray-200 mb-6 bg-white rounded-t-lg">
          {['sales', 'analytics', 'lines', 'payment'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-3 font-medium ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-b-lg shadow p-6">
          {activeTab === 'sales' && (
            <div>
              <h2 className="text-xl font-bold mb-4">My Sales</h2>
              {data.sales.length === 0 ? (
                <p className="text-gray-500 mb-4">You haven't created any sales yet.</p>
              ) : (
                <div className="space-y-4">
                  {data.sales.map((sale) => (
                    <div key={sale.id} className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900">{sale.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {sale.items.length} items • {new Date(sale.startDate).toLocaleDateString()}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => generateQRCode(sale.id)}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          Generate QR Code
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <div>
              <h2 className="text-xl font-bold mb-4">Revenue & Fees</h2>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${data.analytics?.totalRevenue || 0}
                  </p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Platform Fees</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${data.analytics?.platformFees || 0}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Regular items: 5% fee • Auction items: 7% fee
              </p>
            </div>
          )}

          {activeTab === 'lines' && (
            <div>
              <h2 className="text-xl font-bold mb-4">Line Management</h2>
              <p className="text-gray-600 mb-4">Manage pickup lines for your sales.</p>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                Create Line
              </button>
            </div>
          )}

          {activeTab === 'payment' && (
            <div>
              <h2 className="text-xl font-bold mb-4">Payment Setup</h2>
              {!stripeConnected ? (
                <div>
                  <p className="text-gray-600 mb-4">Connect your Stripe account to receive payments.</p>
                  <button
                    onClick={() => setStripeConnected(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Connect Stripe
                  </button>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-green-800 font-semibold">✓ Stripe account connected</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* QR Code Modal */}
        {generatedQR && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow p-6 max-w-sm">
              <h3 className="text-xl font-bold mb-4">Sale QR Code</h3>
              <img src={generatedQR} alt="QR Code" className="w-full mb-4" />
              <div className="flex gap-2">
                <button
                  onClick={downloadQRCode}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Download
                </button>
                <button
                  onClick={() => setGeneratedQR('')}
                  className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
