import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import Skeleton from '../../components/Skeleton';
import { useToast } from '../../components/ToastContext';

interface Sale {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  city: string;
  state: string;
  status: string;
  items: {
    id: string;
    status: string;
  }[];
}

interface PaymentStatus {
  onboarded: boolean;
  needsSetup: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}

interface LineEntry {
  id: string;
  position: number;
  status: 'WAITING' | 'CALLED' | 'SERVED' | 'CANCELLED';
  user: {
    name: string;
    phone: string;
  };
}

interface SaleAnalytics {
  id: string;
  title: string;
  status: string;
  itemsSold: number;
  itemsUnsold: number;
  revenue: number;
  fees: number;
  qrScanCount: number;
}

interface Analytics {
  totalRevenue: number;
  totalFees: number;
  itemsSold: number;
  itemsUnsold: number;
  sales: SaleAnalytics[];
}

const StatusBadge = ({ status }: { status: string }) => {
  const cls =
    status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
    status === 'DRAFT'     ? 'bg-yellow-100 text-yellow-800' :
    status === 'ENDED'     ? 'bg-gray-100 text-gray-800' :
                             'bg-red-100 text-red-800';
  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${cls}`}>
      {status}
    </span>
  );
};

const OrganizerDashboard = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [activeTab, setActiveTab] = useState('sales');
  const [lineEntries, setLineEntries] = useState<LineEntry[]>([]);
  const [currentLineEntry, setCurrentLineEntry] = useState<LineEntry | null>(null);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);

  // Fetch organizer's sales
  const { data: sales, isLoading, isError } = useQuery({
    queryKey: ['organizer-sales'],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      const allSales = response.data.sales || response.data;
      return Array.isArray(allSales)
        ? allSales.map((sale: any) => ({
            ...sale,
            items: Array.isArray(sale.items) ? sale.items : [],
          }))
        : [];
    },
  });

  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ['organizer-analytics'],
    queryFn: async () => {
      const response = await api.get('/organizers/me/analytics');
      return response.data;
    },
    enabled: activeTab === 'analytics',
  });

  // Fetch payment status
  const fetchPaymentStatus = async () => {
    setPaymentStatusLoading(true);
    try {
      const response = await api.get('/stripe/account-status');
      setPaymentStatus(response.data);
      if (router.query.success === 'true') {
        showToast('Payment setup completed successfully!', 'success');
        router.replace('/organizer/dashboard', undefined, { shallow: true });
      }
    } catch (error) {
      console.error('Error fetching payment status:', error);
      setPaymentStatus(null);
    } finally {
      setPaymentStatusLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentStatus();
  }, [router.query]);

  const handleSetupPayments = async () => {
    try {
      const response = await api.post('/stripe/create-connect-account');
      window.location.href = response.data.url;
    } catch (error) {
      console.error('Error setting up payments:', error);
      showToast('Failed to set up payments. Please try again.', 'error');
    }
  };

  const handleGenerateQR = async (sale: Sale) => {
    try {
      setSelectedSale(sale);
      const response = await api.post(`/sales/${sale.id}/generate-qr`, {}, { responseType: 'blob' });
      const imageUrl = URL.createObjectURL(response.data);
      setQrCodeUrl(imageUrl);
      setShowQRModal(true);
    } catch (error) {
      console.error('Error generating QR code:', error);
      showToast('Failed to generate QR code. Please try again.', 'error');
    }
  };

  const handleDownloadQR = () => {
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `qr-code-${selectedSale?.title.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleStatusChange = async (saleId: string, newStatus: string) => {
    setStatusLoading(saleId);
    try {
      await api.patch(`/sales/${saleId}/status`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ['organizer-sales'] });
      queryClient.invalidateQueries({ queryKey: ['organizer-analytics'] });
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update sale status.', 'error');
    } finally {
      setStatusLoading(null);
    }
  };

  const startLine = async (saleId: string) => {
    try {
      await api.post(`/lines/${saleId}/start`);
      showToast('Line started successfully! SMS notifications sent.', 'success');
      queryClient.invalidateQueries({ queryKey: ['line-status', saleId] });
    } catch (error) {
      console.error('Error starting line:', error);
      showToast('Failed to start line. Please try again.', 'error');
    }
  };

  const callNext = async (saleId: string) => {
    try {
      await api.post(`/lines/${saleId}/next`);
      showToast('Next person called successfully!', 'success');
      queryClient.invalidateQueries({ queryKey: ['line-status', saleId] });
    } catch (error) {
      console.error('Error calling next person:', error);
      showToast('Failed to call next person. Please try again.', 'error');
    }
  };

  const markAsServed = async (lineEntryId: string) => {
    try {
      await api.post(`/lines/entry/${lineEntryId}/served`);
      showToast('Person marked as served!', 'success');
      queryClient.invalidateQueries({ queryKey: ['line-status', selectedSale?.id] });
    } catch (error) {
      console.error('Error marking as served:', error);
      showToast('Failed to mark person as served. Please try again.', 'error');
    }
  };

  const fetchLineStatus = async (saleId: string) => {
    try {
      const response = await api.get(`/lines/${saleId}/status`);
      setLineEntries(response.data);
      const calledEntry = response.data.find((entry: LineEntry) => entry.status === 'CALLED');
      setCurrentLineEntry(calledEntry || null);
    } catch (error) {
      console.error('Error fetching line status:', error);
    }
  };

  // Dashboard skeleton
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <Skeleton className="h-9 w-64" />
            <div className="flex space-x-4">
              <Skeleton className="h-16 w-56" />
              <Skeleton className="h-10 w-24 self-center" />
              <Skeleton className="h-10 w-36 self-center" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-lg shadow-md p-6">
                <Skeleton className="h-5 w-28 mb-3" />
                <Skeleton className="h-10 w-16" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <Skeleton className="h-7 w-32 mb-6" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center py-4 border-b border-gray-100 space-x-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (isError) return <div className="min-h-screen flex items-center justify-center">Error loading dashboard</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Organizer Dashboard - FindA.Sale</title>
        <meta name="description" content="Manage your estate sales" />
      </Head>

      {/* QR Code Modal */}
      {showQRModal && selectedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">QR Code Sign</h3>
              <button onClick={() => setShowQRModal(false)} className="text-gray-500 hover:text-gray-700" aria-label="Close QR modal">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="text-center mb-6">
              <p className="mb-4">Scan this QR code to access the sale page directly</p>
              <div className="border-2 border-gray-300 rounded-lg p-4 inline-block">
                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
              </div>
              <p className="mt-4 text-sm text-gray-600">Sale: {selectedSale.title}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handleDownloadQR} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                Download PNG
              </button>
              <button onClick={() => window.print()} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Organizer Dashboard</h1>
          <div className="flex space-x-4">
            {/* Payment Setup Section */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-lg font-bold mb-2">Payment Processing</h2>
              {paymentStatusLoading ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm">Loading...</span>
                </div>
              ) : paymentStatus?.onboarded ? (
                <div className="flex flex-col sm:flex-row sm:items-center">
                  <div className="mb-2 sm:mb-0">
                    <p className="text-green-600 font-medium text-sm">✓ Payments Enabled</p>
                    <p className="text-gray-600 text-xs mt-1">Customers can purchase items</p>
                  </div>
                  <button onClick={handleSetupPayments} className="ml-0 sm:ml-3 mt-2 sm:mt-0 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-1 px-3 rounded">
                    Manage Account
                  </button>
                </div>
              ) : paymentStatus?.needsSetup ? (
                <div className="flex flex-col sm:flex-row sm:items-center">
                  <div className="mb-2 sm:mb-0">
                    <p className="text-gray-700 font-medium text-sm">Payment Setup Required</p>
                    <p className="text-gray-600 text-xs mt-1">Enable payments to receive money</p>
                  </div>
                  <button onClick={handleSetupPayments} className="ml-0 sm:ml-3 mt-2 sm:mt-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-1 px-3 rounded">
                    Setup Payments
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center">
                  <div className="mb-2 sm:mb-0">
                    <p className="text-yellow-600 font-medium text-sm">⚠ Setup Incomplete</p>
                    <p className="text-gray-600 text-xs mt-1">Finish Stripe onboarding</p>
                  </div>
                  <button onClick={handleSetupPayments} className="ml-0 sm:ml-3 mt-2 sm:mt-0 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-bold py-1 px-3 rounded">
                    Continue Setup
                  </button>
                </div>
              )}
            </div>

            <Link href="/organizer/settings" className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded inline-flex items-center self-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Settings
            </Link>

            <Link href="/organizer/create-sale" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-flex items-center self-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Create New Sale
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {['sales', 'analytics', 'line'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab === 'line' ? 'Line Management' : tab === 'analytics' ? 'Revenue & Analytics' : 'Sales'}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Analytics Tab ── */}
        {activeTab === 'analytics' && (
          <div>
            {analyticsLoading ? (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white rounded-lg shadow-md p-6">
                      <Skeleton className="h-5 w-32 mb-3" />
                      <Skeleton className="h-10 w-24" />
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <Skeleton className="h-6 w-40 mb-6" />
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex py-3 border-b border-gray-100 space-x-4">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              </div>
            ) : analytics ? (
              <div>
                {/* Summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Revenue</h3>
                    <p className="text-3xl font-bold text-green-600">${analytics.totalRevenue.toFixed(2)}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Platform Fees Paid</h3>
                    <p className="text-3xl font-bold text-orange-500">${analytics.totalFees.toFixed(2)}</p>
                    <p className="text-xs text-gray-400 mt-1">5% regular / 7% auction</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Items Sold</h3>
                    <p className="text-3xl font-bold text-blue-600">{analytics.itemsSold}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Items Unsold</h3>
                    <p className="text-3xl font-bold text-gray-500">{analytics.itemsUnsold}</p>
                  </div>
                </div>

                {/* Per-sale breakdown */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-xl font-bold mb-4 text-gray-900">Breakdown by Sale</h2>
                  {analytics.sales.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No sale data yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sold</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unsold</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Fees</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">QR Scans</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {analytics.sales.map((s) => (
                            <tr key={s.id}>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                <Link href={`/sales/${s.id}`} className="hover:text-blue-600">{s.title}</Link>
                              </td>
                              <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{s.itemsSold}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-500">{s.itemsUnsold}</td>
                              <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">${s.revenue.toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm text-right text-orange-500">${s.fees.toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm text-right text-purple-600 font-medium">{s.qrScanCount ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold">
                          <tr>
                            <td className="px-4 py-3 text-sm" colSpan={2}>Total</td>
                            <td className="px-4 py-3 text-sm text-right">{analytics.itemsSold}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-500">{analytics.itemsUnsold}</td>
                            <td className="px-4 py-3 text-sm text-right text-green-700">${analytics.totalRevenue.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-right text-orange-500">${analytics.totalFees.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-right text-purple-600">{analytics.sales.reduce((sum, s) => sum + (s.qrScanCount ?? 0), 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-16">Could not load analytics.</p>
            )}
          </div>
        )}

        {/* ── Line Management Tab ── */}
        {activeTab === 'line' && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6">Line Management</h2>
            {sales && sales.length > 0 ? (
              <div className="mb-6">
                <label htmlFor="sale-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Select Sale
                </label>
                <select
                  id="sale-select"
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                  onChange={(e) => {
                    const sale = sales.find((s: Sale) => s.id === e.target.value);
                    if (sale) {
                      setSelectedSale(sale);
                      fetchLineStatus(sale.id);
                    }
                  }}
                  value={selectedSale?.id || ''}
                >
                  <option value="">Choose a sale</option>
                  {sales.map((sale: Sale) => (
                    <option key={sale.id} value={sale.id}>
                      {sale.title} ({new Date(sale.startDate).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {selectedSale ? (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold">Current Line for {selectedSale.title}</h3>
                  <div className="space-x-2">
                    <button onClick={() => startLine(selectedSale.id)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">Start Line</button>
                    <button onClick={() => callNext(selectedSale.id)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Call Next</button>
                    <button onClick={() => fetchLineStatus(selectedSale.id)} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Refresh</button>
                  </div>
                </div>

                {currentLineEntry && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                    <p className="text-sm text-yellow-700">
                      <span className="font-bold">Currently Called:</span> {currentLineEntry.user.name} (Position #{currentLineEntry.position})
                      <button onClick={() => markAsServed(currentLineEntry.id)} className="ml-4 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-2 rounded">
                        Mark as Served
                      </button>
                    </p>
                  </div>
                )}

                {lineEntries.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {lineEntries.map((entry) => (
                          <tr key={entry.id} className={entry.status === 'CALLED' ? 'bg-yellow-50' : ''}>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">#{entry.position}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">{entry.user.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">{entry.user.phone}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                entry.status === 'WAITING' ? 'bg-blue-100 text-blue-800' :
                                entry.status === 'CALLED'  ? 'bg-yellow-100 text-yellow-800' :
                                entry.status === 'SERVED'  ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {entry.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center py-8 text-gray-600">No line entries yet. Start the line to begin managing visitors.</p>
                )}
              </div>
            ) : (
              <p className="text-center py-8 text-gray-600">Select a sale to manage its line</p>
            )}
          </div>
        )}

        {/* ── Sales Tab ── */}
        {activeTab === 'sales' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Total Sales</h3>
                <p className="text-3xl font-bold text-blue-600">{sales?.length || 0}</p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Active Sales</h3>
                <p className="text-3xl font-bold text-green-600">
                  {sales?.filter((sale: Sale) => sale.status === 'PUBLISHED').length || 0}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Total Items</h3>
                <p className="text-3xl font-bold text-purple-600">
                  {sales?.reduce((total: number, sale: Sale) => total + (sale.items?.length || 0), 0) || 0}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold mb-6">Your Sales</h2>
              {sales?.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 mb-4">You haven't created any sales yet.</p>
                  <Link href="/organizer/create-sale" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-flex items-center">
                    Create New Sale
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dates</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sales?.map((sale: Sale) => (
                        <tr key={sale.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{sale.title}</div>
                            <div className="text-sm text-gray-500">{sale.city}, {sale.state}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <StatusBadge status={sale.status} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div>{new Date(sale.startDate).toLocaleDateString()}</div>
                            <div>to {new Date(sale.endDate).toLocaleDateString()}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {sale.items?.length || 0} items
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex flex-wrap gap-2">
                              {/* Status action buttons */}
                              {sale.status === 'DRAFT' && (
                                <button
                                  onClick={() => handleStatusChange(sale.id, 'PUBLISHED')}
                                  disabled={statusLoading === sale.id}
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-3 rounded disabled:opacity-50"
                                >
                                  {statusLoading === sale.id ? '...' : 'Publish'}
                                </button>
                              )}
                              {sale.status === 'PUBLISHED' && (
                                <button
                                  onClick={() => handleStatusChange(sale.id, 'ENDED')}
                                  disabled={statusLoading === sale.id}
                                  className="bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold py-1 px-3 rounded disabled:opacity-50"
                                >
                                  {statusLoading === sale.id ? '...' : 'End Sale'}
                                </button>
                              )}
                              <Link href={`/organizer/add-items?saleId=${sale.id}`} className="text-blue-600 hover:text-blue-900">
                                Add Items
                              </Link>
                              <Link href={`/sales/${sale.id}`} className="text-green-600 hover:text-green-900">
                                View
                              </Link>
                              <button onClick={() => handleGenerateQR(sale)} className="text-purple-600 hover:text-purple-900">
                                QR Code
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default OrganizerDashboard;
