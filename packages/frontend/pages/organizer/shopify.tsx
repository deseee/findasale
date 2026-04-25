/**
 * Shopify Cross-Listing — Feature #XXX
 *
 * TEAMS-tier page for managing Shopify integration:
 * - Connect/disconnect Shopify account
 * - View connection status
 * - Push items to Shopify
 * - Track listed items
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import TierGate from '../../components/TierGate';
import ConfirmDialog from '../../components/ConfirmDialog';
import Link from 'next/link';
import { Loader2, Check, X, ExternalLink } from 'lucide-react';

interface ShopifyStatus {
  connected: boolean;
  shopDomain: string | null;
  listingCount: number;
}

const ShopifyPage: React.FC = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [accessToken, setAccessToken] = useState('');
  const [shopDomain, setShopDomain] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  // Redirect if not authenticated
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Fetch Shopify status on mount
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/shopify/status');
      setStatus(response.data);
    } catch (error: any) {
      console.error('Failed to fetch Shopify status:', error);
      showToast('Failed to load Shopify status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accessToken.trim() || !shopDomain.trim()) {
      showToast('Please enter both access token and shop domain', 'error');
      return;
    }

    // Validate shop domain format
    if (!shopDomain.match(/^[a-z0-9-]+\.myshopify\.com$/i)) {
      showToast('Invalid shop domain format. Expected: yourshop.myshopify.com', 'error');
      return;
    }

    try {
      setConnecting(true);
      const response = await api.post('/shopify/connect', {
        accessToken: accessToken.trim(),
        shopDomain: shopDomain.trim().toLowerCase(),
      });

      showToast('Shopify connected successfully!', 'success');
      setAccessToken('');
      setShopDomain('');
      setShowForm(false);
      await fetchStatus();
    } catch (error: any) {
      console.error('Failed to connect Shopify:', error);
      showToast(error.response?.data?.error || 'Failed to connect Shopify', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      await api.delete('/shopify/connect');
      showToast('Shopify disconnected', 'success');
      setDisconnectConfirm(false);
      await fetchStatus();
    } catch (error: any) {
      console.error('Failed to disconnect Shopify:', error);
      showToast('Failed to disconnect Shopify', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Shopify Integration"
      description="Automatically list your items on your Shopify store. Available on TEAMS and above."
    >
      <Head>
        <title>Shopify Integration — FindA.Sale</title>
        <meta name="description" content="Manage Shopify cross-listing for your sales" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="mb-8">
            <Link href="/organizer/dashboard" className="text-sage-600 hover:text-sage-700 dark:text-sage-400 text-sm mb-4 inline-block">
              ← Back to Dashboard
            </Link>
            <h1 className="text-4xl font-fraunces font-bold text-gray-900 dark:text-white mb-2">Shopify</h1>
            <p className="text-gray-600 dark:text-gray-400">Automatically list your items on your Shopify store when you push them here.</p>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="w-8 h-8 text-sage-600 animate-spin" />
            </div>
          ) : (
            <>
              {/* Status Card */}
              {status?.connected ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8 border-l-4 border-green-500">
                  <div className="flex items-center mb-4">
                    <Check className="w-6 h-6 text-green-500 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Connected</h2>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Shop Domain</p>
                      <p className="text-lg font-medium text-gray-900 dark:text-white">{status.shopDomain}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Active Listings</p>
                      <p className="text-lg font-medium text-gray-900 dark:text-white">{status.listingCount}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <a
                      href={`https://${status.shopDomain}/admin`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-sage-100 dark:bg-sage-900 text-sage-700 dark:text-sage-300 rounded hover:bg-sage-200 dark:hover:bg-sage-800 transition"
                    >
                      Open Shopify Admin
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => setDisconnectConfirm(true)}
                      className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8 border-l-4 border-gray-300 dark:border-gray-600">
                  <div className="flex items-center mb-4">
                    <X className="w-6 h-6 text-gray-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Not Connected</h2>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">Connect your Shopify store to automatically list items here.</p>
                </div>
              )}

              {/* Connect Form */}
              {!status?.connected ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Connect Shopify</h3>

                  <form onSubmit={handleConnect} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Shop Domain
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., yourshop.myshopify.com"
                        value={shopDomain}
                        onChange={(e) => setShopDomain(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Found in your Shopify Admin → Settings → General</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Access Token
                      </label>
                      <input
                        type="password"
                        placeholder="shpat_..."
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-sage-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Generate a private app token in your Shopify Admin → Settings → Apps and Integrations → Develop apps → Create an app
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={connecting}
                      className="w-full px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
                    >
                      {connecting && <Loader2 className="w-4 h-4 animate-spin" />}
                      {connecting ? 'Connecting...' : 'Connect Shopify'}
                    </button>
                  </form>
                </div>
              ) : null}

              {/* Info Section */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">How It Works</h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                  <li>Items are pushed to Shopify when you click "Push to Shopify" on an item</li>
                  <li>When an item sells on FindA.Sale, it's automatically marked as sold on Shopify</li>
                  <li>You can manage listings in both FindA.Sale and your Shopify Admin</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Disconnect Confirmation Dialog */}
      <ConfirmDialog
        open={disconnectConfirm}
        title="Disconnect Shopify"
        message="Are you sure you want to disconnect your Shopify account? Your items will no longer be synced."
        confirmText="Disconnect"
        cancelText="Cancel"
        isLoading={disconnecting}
        onConfirm={handleDisconnect}
        onCancel={() => setDisconnectConfirm(false)}
        isDangerous
      />
    </TierGate>
  );
};

export default ShopifyPage;
