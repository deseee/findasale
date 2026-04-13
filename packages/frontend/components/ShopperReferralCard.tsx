import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface ReferralStats {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  shopperCredits: number;
  creditPerReferral: number;
}

export default function ShopperReferralCard() {
  const [copied, setCopied] = useState(false);

  const { data: stats, isLoading } = useQuery<ReferralStats>({
    queryKey: ['shopper-referral-stats'],
    queryFn: async () => {
      const res = await api.get('/shopper-referral/stats');
      return res.data;
    },
  });

  const handleCopy = async () => {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(stats.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select the text
    }
  };

  if (isLoading) {
    return <div className="animate-pulse bg-gray-100 rounded-xl h-32" />;
  }

  if (!stats) return null;

  return (
    <div className="border border-amber-200 rounded-xl p-5 bg-amber-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 text-sm">Refer Friends, Earn Credit</h3>
        {stats.shopperCredits > 0 && (
          <span className="bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
            ${stats.shopperCredits.toFixed(2)} credit
          </span>
        )}
      </div>
      <p className="text-xs text-gray-600 mb-4">
        Invite friends to FindA.Sale — earn <strong>${stats.creditPerReferral.toFixed(0)} store credit</strong> per successful referral.
        You've referred <strong>{stats.totalReferrals}</strong> {stats.totalReferrals === 1 ? 'person' : 'people'}.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={stats.referralLink}
          className="flex-1 min-w-0 text-xs bg-white border border-amber-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none"
          aria-label="Your referral link"
        />
        <button
          onClick={handleCopy}
          className="shrink-0 bg-amber-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-amber-700 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
