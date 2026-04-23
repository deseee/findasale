/**
 * XP Store — Tabbed interface showing Shopper and Organizer perks
 * Available to all logged-in users. Two tabs visible regardless of role:
 * - Shopper tab: Discount coupons, rarity boost, cosmetics, coming-soon perks
 * - Organizer tab: Discount code generator, boosts, coming-soon perks
 * No role gating — both tabs open to everyone.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Head from 'next/head';
import Link from 'next/link';
import { Ticket, Sparkles, Lock } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import { RarityBoostModal } from '../components/RarityBoostModal';

type Coupon = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minPurchaseAmount: number | null;
  expiresAt: string;
  status: string;
  createdAt: string;
};

type XpProfile = {
  guildXp: number;
  spendableXp: number;
  explorerRank: string;
  huntPassActive: boolean;
  huntPassExpiry: string | null;
  rankProgress: {
    currentXp: number;
    nextRankXp: number;
    nextRank: string;
  };
};

type GenerateResult = {
  code: string;
  discountValue: number;
  expiresAt: string;
  xpSpent: number;
  generatedThisMonth: number;
  monthlyLimit: number;
  message: string;
  minPurchaseAmount?: number;
  tier?: string;
  huntPassStatus?: string;
};

type ShopperTier = 'DOLLAR_OFF_TEN' | 'ONE_FIFTY_OFF_TWENTY' | 'FIVE_OFF_FIFTY';

const SHOPPER_TIERS_BASE: Record<ShopperTier, {
  cost: number;
  discount: string;
  minPurchase: number;
  monthlyLimitStandard: number;
  monthlyLimitHuntPass: number;
  label: string;
  description: string;
}> = {
  DOLLAR_OFF_TEN: {
    cost: 100,
    discount: '$0.75 off',
    minPurchase: 10,
    monthlyLimitStandard: 2,
    monthlyLimitHuntPass: 3,
    label: 'Standard Deal',
    description: '$0.75 off $10+ purchases',
  },
  ONE_FIFTY_OFF_TWENTY: {
    cost: 200,
    discount: '$2.00 off',
    minPurchase: 25,
    monthlyLimitStandard: 2,
    monthlyLimitHuntPass: 3,
    label: 'Premium Deal',
    description: '$2.00 off $25+ purchases',
  },
  FIVE_OFF_FIFTY: {
    cost: 500,
    discount: '$5.00 off',
    minPurchase: 50,
    monthlyLimitStandard: 1,
    monthlyLimitHuntPass: 2,
    label: 'Deluxe Deal',
    description: '$5.00 off $50+ purchases',
  },
};

const CouponsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [newCode, setNewCode] = useState<string | null>(null);
  const [newCodeType, setNewCodeType] = useState<'organizer' | 'shopper'>('organizer');
  const [copied, setCopied] = useState(false);
  const [showRarityBoostModal, setShowRarityBoostModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'shopper' | 'organizer'>('shopper');

  // Redirect to login if not authenticated
  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const isOrganizer = user?.roles?.includes('ORGANIZER') ?? false;

  const { data: couponsData, isLoading: couponsLoading } = useQuery({
    queryKey: ['coupons'],
    queryFn: async () => {
      const res = await api.get('/coupons');
      return res.data as { coupons: Coupon[] };
    },
    enabled: !!user,
  });

  const { data: xpProfile } = useQuery<XpProfile>({
    queryKey: ['xp-profile'],
    queryFn: async () => {
      const res = await api.get('/xp/profile');
      return res.data;
    },
    enabled: !!user,
  });

  // Organizer: Generate $1-off code (50 XP)
  const organizerGenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/coupons/generate');
      return res.data as GenerateResult;
    },
    onSuccess: (data: GenerateResult) => {
      setNewCode(data.code);
      setNewCodeType('organizer');
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      queryClient.invalidateQueries({ queryKey: ['xp-profile'] });
      showToast(`Coupon ${data.code} created! 50 XP spent.`, 'success');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to generate coupon';
      showToast(msg, 'error');
    },
  });

  // Shopper: Generate discounts by tier
  const shopperGenerateMutation = useMutation({
    mutationFn: async (tier: ShopperTier) => {
      const res = await api.post('/coupons/generate-from-xp', { tier });
      return res.data as GenerateResult;
    },
    onSuccess: (data: GenerateResult) => {
      setNewCode(data.code);
      setNewCodeType('shopper');
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      queryClient.invalidateQueries({ queryKey: ['xp-profile'] });
      const tierLabel = Object.values(SHOPPER_TIERS_BASE).find(t => t.discount === `$${data.discountValue.toFixed(2)} off`)?.label || 'Coupon';
      showToast(`${tierLabel} generated! ${data.xpSpent} XP spent.`, 'success');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to generate coupon';
      showToast(msg, 'error');
    },
  });

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Code copied!', 'success');
    } catch {
      showToast('Copy failed — select and copy manually', 'error');
    }
  };

  const coupons = couponsData?.coupons ?? [];
  const spendableXp = xpProfile?.spendableXp ?? 0;
  const huntPassActive = xpProfile?.huntPassActive ?? false;

  const organizerCanGenerate = spendableXp >= 50 && !organizerGenerateMutation.isPending;

  const formatExpiry = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Head>
        <title>XP Store — FindA.Sale</title>
      </Head>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-warm-400 mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-amber-600">
            Home
          </Link>
          <span>›</span>
          <span className="text-warm-900 dark:text-warm-100 font-medium">XP Store</span>
        </nav>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2 flex items-center gap-3">
            <Ticket className="text-amber-600" size={32} />
            XP Store
          </h1>
          <p className="text-warm-600 dark:text-warm-400">
            Spend XP on discounts, boosts, and perks. Both tabs are open to everyone.
          </p>
        </div>

        {/* XP Balance Card */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-1">Available XP</p>
              <p className="text-3xl font-bold text-amber-900 dark:text-amber-100">
                {spendableXp.toLocaleString()} <span className="text-base font-normal">XP</span>
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {xpProfile?.explorerRank} · {huntPassActive ? '🎫 Hunt Pass Active' : 'Hunt Pass Inactive'}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 mb-8 border-b border-warm-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('shopper')}
            className={`pb-4 px-2 text-lg font-semibold transition ${
              activeTab === 'shopper'
                ? 'text-amber-600 border-b-2 border-amber-600'
                : 'text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
            }`}
          >
            Shopper
          </button>
          <button
            onClick={() => setActiveTab('organizer')}
            className={`pb-4 px-2 text-lg font-semibold transition ${
              activeTab === 'organizer'
                ? 'text-amber-600 border-b-2 border-amber-600'
                : 'text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
            }`}
          >
            Organizer
          </button>
        </div>

        {/* SHOPPER TAB */}
        {activeTab === 'shopper' && (
          <div className="mb-10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
                Shopper Perks
              </h2>

              {/* Wired: Discount Coupons */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">
                  Discount Coupons
                </h3>
                <p className="text-warm-700 dark:text-warm-300 mb-6">
                  Spend XP to generate single-use discount codes for your next purchase.
                </p>

                {/* Shopper Tier Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  {(Object.entries(SHOPPER_TIERS_BASE) as [ShopperTier, typeof SHOPPER_TIERS_BASE[ShopperTier]][]).map(
                    ([tier, tierData]) => {
                      const monthlyLimit = huntPassActive ? tierData.monthlyLimitHuntPass : tierData.monthlyLimitStandard;
                      const canGenerate = spendableXp >= tierData.cost && !shopperGenerateMutation.isPending;
                      return (
                        <div
                          key={tier}
                          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-amber-200 dark:border-amber-700 flex flex-col hover:shadow-md transition"
                        >
                          <h4 className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-2">
                            {tierData.label}
                          </h4>
                          <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">{tierData.description}</p>

                          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
                            <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 mb-1">
                              {tierData.discount}
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                              Min. ${tierData.minPurchase} purchase
                            </p>
                          </div>

                          <div className="space-y-2 mb-4 text-sm text-warm-600 dark:text-warm-400">
                            <p>
                              <span className="font-semibold">{tierData.cost} XP</span> to generate
                            </p>
                            <p>
                              <span className="font-semibold">{monthlyLimit}/month</span>
                              {huntPassActive && (
                                <span className="text-amber-600 dark:text-amber-300 font-semibold ml-1">
                                  (Bonus Coupon Slots)
                                </span>
                              )}
                            </p>
                          </div>

                          <button
                            onClick={() => shopperGenerateMutation.mutate(tier)}
                            disabled={!canGenerate}
                            className="mt-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
                          >
                            {shopperGenerateMutation.isPending ? 'Generating…' : `Generate (${tierData.cost} XP)`}
                          </button>
                        </div>
                      );
                    }
                  )}
                </div>

                {/* Newly generated shopper code */}
                {newCode && newCodeType === 'shopper' && (
                  <div className="mb-8 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-300 dark:border-amber-600">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
                      New coupon code ready to use:
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <code className="text-xl font-mono font-bold tracking-widest text-amber-700 dark:text-amber-300 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg select-all">
                        {newCode}
                      </code>
                      <button
                        onClick={() => copyCode(newCode)}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                      Enter this code at checkout during your next purchase.
                    </p>
                  </div>
                )}
              </div>

              {/* Wired: Rarity Boost */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">
                  Boosts & Bonuses
                </h3>
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-indigo-500 dark:bg-indigo-600 rounded-lg flex items-center justify-center">
                      <Sparkles className="text-white" size={24} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-indigo-900 dark:text-indigo-100 mb-1">
                        Rarity Boost
                      </h4>
                      <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                        Spend 50 XP to boost the rarity rolls on your next photo uploads at a sale.
                        Higher chance of rolling a rare find.
                      </p>
                      <button
                        onClick={() => setShowRarityBoostModal(true)}
                        disabled={spendableXp < 50}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
                      >
                        Activate Rarity Boost (50 XP)
                      </button>
                      {spendableXp < 50 && (
                        <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-2">
                          You need at least 50 XP. Earn XP by scanning QR codes, completing purchases, and checking in at sales.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Coming Soon: Cosmetics & Perks */}
              <div>
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">
                  Coming Soon
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Hunt Pass Discount */}
                  <ComingSoonCard
                    title="Hunt Pass Discount"
                    description="Reduce the cost of Hunt Pass renewal"
                    cost={100}
                  />
                  {/* Haul Visibility Boost */}
                  <ComingSoonCard
                    title="Haul Visibility Boost"
                    description="Boost your haul post to the top of the feed for 24 hours"
                    cost={80}
                  />
                  {/* Seasonal Challenge Access */}
                  <ComingSoonCard
                    title="Seasonal Challenge Access"
                    description="Unlock bonus seasonal challenge track"
                    cost={250}
                  />
                  {/* Username Color */}
                  <ComingSoonCard
                    title="Username Color"
                    description="Custom color for your username in the Guild"
                    cost={1000}
                  />
                  {/* Frame Badge */}
                  <ComingSoonCard
                    title="Frame Badge"
                    description="Exclusive profile frame visible on your public profile"
                    cost={2500}
                  />
                  {/* Crew Creation */}
                  <ComingSoonCard
                    title="Crew Creation"
                    description="Found a crew and recruit members"
                    cost={500}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ORGANIZER TAB */}
        {activeTab === 'organizer' && (
          <div className="mb-10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
                Organizer Tools
              </h2>

              {/* Wired: Shopper Discount Code Generator */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">
                  Discount Codes
                </h3>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-amber-200 dark:border-amber-700">
                  <p className="text-warm-700 dark:text-warm-300 mb-4">
                    Spend 50 XP to generate a $1-off single-use code. Share it with a shopper — they enter it at
                    checkout. Discount is deducted from your payout, not the platform fee.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <button
                      onClick={() => organizerGenerateMutation.mutate()}
                      disabled={!organizerCanGenerate}
                      className="px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition whitespace-nowrap"
                    >
                      {organizerGenerateMutation.isPending ? 'Generating…' : 'Generate Code (50 XP)'}
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400 self-center">Max 5 per month</p>
                  </div>

                  {spendableXp < 50 && (
                    <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                      You need at least 50 XP to generate a coupon. Earn XP by listing items, completing sales,
                      and other activities.
                    </p>
                  )}

                  {/* Newly generated organizer code */}
                  {newCode && newCodeType === 'organizer' && (
                    <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-amber-300 dark:border-amber-600">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
                        New coupon code ready to share:
                      </p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <code className="text-xl font-mono font-bold tracking-widest text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-4 py-2 rounded-lg select-all">
                          {newCode}
                        </code>
                        <button
                          onClick={() => copyCode(newCode)}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition"
                        >
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        Share this code with a shopper — they enter it at checkout for $1 off.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Coming Soon: Organizer Boosts */}
              <div>
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">
                  Coming Soon
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Early Access Boost */}
                  <ComingSoonCard
                    title="Early Access Boost"
                    description="Get your sale listed before standard organizers"
                    cost={200}
                  />
                  {/* Bounty Visibility Boost */}
                  <ComingSoonCard
                    title="Bounty Visibility Boost"
                    description="Boost a bounty item to top of shopper search results"
                    cost={50}
                  />
                  {/* Listings Extension */}
                  <ComingSoonCard
                    title="Listings Extension"
                    description="Extend an active listing's end date by 7 days"
                    cost={250}
                  />
                  {/* Event Sponsorship */}
                  <ComingSoonCard
                    title="Event Sponsorship"
                    description="Sponsor a community treasure hunt event"
                    cost={1000}
                  />
                  {/* Custom Map Pin */}
                  <ComingSoonCard
                    title="Custom Map Pin"
                    description="Custom icon for your sale on the map"
                    cost={1000}
                  />
                  {/* Treasure Trail Sponsor */}
                  <ComingSoonCard
                    title="Treasure Trail Sponsor"
                    description="Add your sale to an active treasure trail"
                    cost={150}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active Coupons List — Always visible below tabs */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">Your Active Coupons</h2>

          {couponsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 animate-pulse h-20" />
              ))}
            </div>
          ) : coupons.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center border border-warm-100 dark:border-gray-700">
              <p className="text-4xl mb-3">🎟️</p>
              <p className="text-warm-700 dark:text-warm-300 font-medium mb-1">No active coupons</p>
              <p className="text-sm text-warm-500 dark:text-warm-400">
                Generate a coupon above to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {coupons.map((coupon: Coupon) => {
                const discount =
                  coupon.discountType === 'PERCENT'
                    ? `${coupon.discountValue}% off`
                    : `$${coupon.discountValue.toFixed(2)} off`;

                return (
                  <div
                    key={coupon.id}
                    className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-warm-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="flex items-center gap-4">
                      <code className="text-lg font-mono font-bold tracking-widest text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-lg">
                        {coupon.code}
                      </code>
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">{discount}</p>
                        {coupon.minPurchaseAmount && (
                          <p className="text-xs text-warm-500 dark:text-warm-400">
                            Min. purchase ${coupon.minPurchaseAmount.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-warm-500 dark:text-warm-400">
                        Expires {formatExpiry(coupon.expiresAt)}
                      </p>
                      <button
                        onClick={() => copyCode(coupon.code)}
                        className="px-3 py-1.5 border border-amber-300 dark:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm font-medium rounded-lg transition"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Rarity Boost Modal — no role gate */}
      <RarityBoostModal
        isOpen={showRarityBoostModal}
        onClose={() => setShowRarityBoostModal(false)}
        userXp={spendableXp}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['xp-profile'] });
          showToast('Rarity Boost activated — your next upload gets a rarity bonus!', 'success');
        }}
      />
    </>
  );
};

/**
 * ComingSoonCard — placeholder card for future XP store perks
 */
const ComingSoonCard = ({ title, description, cost }: { title: string; description: string; cost: number }) => (
  <div className="relative bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-300 dark:border-gray-600 opacity-60">
    <span className="absolute top-3 right-3 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full font-medium">
      Coming Soon
    </span>
    <div className="mb-4 w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
      <Lock className="text-gray-400" size={24} />
    </div>
    <h4 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-2">{title}</h4>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{description}</p>
    <button disabled className="w-full px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed rounded-lg font-medium text-sm">
      {cost} XP
    </button>
  </div>
);

export default CouponsPage;
