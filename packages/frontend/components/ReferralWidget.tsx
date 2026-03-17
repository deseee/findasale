import React, { useState } from 'react';
import { useReferral } from '../hooks/useReferral';

const ReferralWidget: React.FC = () => {
  const { data, isLoading, isError, claimReward, isClaimingReward } = useReferral();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyCode = () => {
    if (data?.referralCode) {
      navigator.clipboard.writeText(data.referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyLink = () => {
    if (data?.referralLink) {
      navigator.clipboard.writeText(data.referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center justify-center py-8">
          <p className="text-warm-600">Loading referral information...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-2xl font-bold mb-4 text-warm-900">Share & Earn</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Failed to load referral information. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8 dark:bg-slate-800">
      <h2 className="text-2xl font-bold mb-1 text-warm-900 dark:text-white">Share & Earn</h2>
      <p className="text-warm-600 dark:text-warm-300 text-sm mb-6">
        Invite friends to FindA.Sale and earn rewards for each successful referral.
      </p>

      {/* Referral Code Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-warm-800 dark:text-warm-100 mb-3">
          Your Referral Code
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              type="text"
              readOnly
              value={data?.referralCode || ''}
              className="w-full px-4 py-2 border border-warm-300 rounded-lg bg-warm-50 dark:bg-slate-700 dark:border-slate-600 text-warm-900 dark:text-white font-mono font-semibold"
            />
          </div>
          <button
            onClick={handleCopyCode}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              copiedCode
                ? 'bg-green-500 text-white'
                : 'bg-[#8FB897] hover:bg-[#7da686] text-white'
            }`}
          >
            {copiedCode ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Referral Link Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-warm-800 dark:text-warm-100 mb-3">
          Share This Link
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate">
            <input
              type="text"
              readOnly
              value={data?.referralLink || ''}
              className="w-full px-4 py-2 border border-warm-300 rounded-lg bg-warm-50 dark:bg-slate-700 dark:border-slate-600 text-warm-700 dark:text-warm-300 text-xs truncate"
            />
          </div>
          <button
            onClick={handleCopyLink}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
              copiedLink
                ? 'bg-green-500 text-white'
                : 'bg-[#8FB897] hover:bg-[#7da686] text-white'
            }`}
          >
            {copiedLink ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="border-t border-warm-200 dark:border-slate-700 pt-6">
        <h3 className="text-lg font-semibold text-warm-800 dark:text-warm-100 mb-4">
          Your Rewards
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {/* Total Referrals */}
          <div className="bg-warm-50 dark:bg-slate-700 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-[#8FB897]">
              {data?.totalReferrals ?? 0}
            </div>
            <p className="text-sm text-warm-600 dark:text-warm-300">Referrals</p>
          </div>

          {/* Total Rewards Earned */}
          <div className="bg-warm-50 dark:bg-slate-700 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-amber-600">
              {data?.totalRewardsEarned ?? 0}
            </div>
            <p className="text-sm text-warm-600 dark:text-warm-300">Points Earned</p>
          </div>

          {/* Pending Rewards */}
          <div className="bg-warm-50 dark:bg-slate-700 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-orange-500">
              {data?.pendingRewards ?? 0}
            </div>
            <p className="text-sm text-warm-600 dark:text-warm-300">Pending</p>
          </div>
        </div>
      </div>

      {/* Info Message */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          💡 <strong>Tip:</strong> You earn 50 points for each friend who joins using your referral code!
        </p>
      </div>
    </div>
  );
};

export default ReferralWidget;
