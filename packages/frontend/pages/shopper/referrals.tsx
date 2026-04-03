import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useReferral } from '../../hooks/useReferral';

export default function ReferralsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { data, isLoading } = useReferral();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return null;
  }

  const handleCopyLink = async () => {
    if (data?.referralLink) {
      try {
        await navigator.clipboard.writeText(data.referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleShare = (platform: string) => {
    const link = data?.referralLink || '';
    const message = encodeURIComponent('Join me on FindA.Sale to discover great deals at estate sales, yard sales, and more!');

    let shareUrl = '';
    switch (platform) {
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${message} ${encodeURIComponent(link)}`;
        break;
      case 'sms':
        shareUrl = `sms:?body=${message} ${encodeURIComponent(link)}`;
        break;
      case 'email':
        shareUrl = `mailto:?subject=Join me on FindA.Sale&body=${message}%0A%0A${encodeURIComponent(link)}`;
        break;
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${message}&url=${encodeURIComponent(link)}`;
        break;
      default:
        return;
    }

    window.open(shareUrl, '_blank');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300">Loading your referral info...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Share & Earn - FindA.Sale</title>
        <meta name="description" content="Earn XP by referring friends to FindA.Sale" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-800 dark:to-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="text-6xl mb-4">🎁</div>
            <h1 className="text-4xl font-bold text-blue-900 dark:text-blue-300 mb-2">Share & Earn</h1>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
              Invite friends to FindA.Sale. Earn XP every time they sign up or make a purchase.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 inline-block">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <span className="font-bold">20 XP</span> when they sign up · <span className="font-bold">30 XP</span> when they make their first purchase
              </p>
            </div>
          </div>

          {/* Referral Link Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Your Referral Link</h2>

            {data?.referralLink ? (
              <div className="space-y-4">
                {/* Link Display */}
                <div className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-4 flex items-center justify-between">
                  <code className="text-sm text-gray-700 dark:text-gray-300 break-all">
                    {data.referralLink}
                  </code>
                  <button
                    onClick={handleCopyLink}
                    className={`ml-4 px-4 py-2 rounded-lg font-semibold transition ${
                      copied
                        ? 'bg-green-500 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {copied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>

                {/* Share Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-6">
                  <button
                    onClick={() => handleShare('whatsapp')}
                    className="p-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition flex items-center justify-center"
                    title="Share on WhatsApp"
                  >
                    <span className="text-xl">💬</span>
                  </button>
                  <button
                    onClick={() => handleShare('sms')}
                    className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition flex items-center justify-center"
                    title="Share via SMS"
                  >
                    <span className="text-xl">📱</span>
                  </button>
                  <button
                    onClick={() => handleShare('email')}
                    className="p-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold transition flex items-center justify-center"
                    title="Share via Email"
                  >
                    <span className="text-xl">✉️</span>
                  </button>
                  <button
                    onClick={() => handleShare('twitter')}
                    className="p-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-semibold transition flex items-center justify-center"
                    title="Share on Twitter"
                  >
                    <span className="text-xl">𝕏</span>
                  </button>
                  <button
                    onClick={handleCopyLink}
                    className="p-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-semibold transition flex items-center justify-center"
                    title="Copy Link"
                  >
                    <span className="text-xl">🔗</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">Unable to load referral link. Please try again.</p>
            )}
          </div>

          {/* Stats Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Your Referral Stats</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Total Referrals */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
                <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                  {data?.totalReferrals ?? 0}
                </div>
                <p className="text-gray-700 dark:text-gray-300 mt-2">Total Referrals</p>
              </div>

              {/* First Purchases */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center">
                <div className="text-4xl font-bold text-green-600 dark:text-green-400">
                  {/* Assuming the API tracks successful purchases — fallback to showing referrals if not available */}
                  {(data as any)?.successfulPurchases ?? 0}
                </div>
                <p className="text-gray-700 dark:text-gray-300 mt-2">First Purchases Made</p>
              </div>

              {/* Total XP Earned */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 text-center">
                <div className="text-4xl font-bold text-amber-600 dark:text-amber-400">
                  {data?.totalRewardsEarned ?? 0}
                </div>
                <p className="text-gray-700 dark:text-gray-300 mt-2">XP Earned</p>
              </div>
            </div>
          </div>

          {/* Back to Dashboard */}
          <div className="mt-8 text-center">
            <Link
              href="/shopper/dashboard"
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
