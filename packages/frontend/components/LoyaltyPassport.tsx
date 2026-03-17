import React from 'react';
import { useLoyaltyPassport, PassportData } from '@/hooks/useLoyaltyPassport';
import Link from 'next/link';

const STAMP_ICONS: Record<string, string> = {
  ATTEND_SALE: '🏠',
  MAKE_PURCHASE: '🛍️',
  WRITE_REVIEW: '⭐',
  REFER_FRIEND: '👥',
};

const MILESTONE_COLORS: Record<string, string> = {
  BRONZE: '#CD7F32',
  SILVER: '#C0C0C0',
  GOLD: '#FFD700',
};

export function LoyaltyPassport() {
  const { passport, isLoading, error } = useLoyaltyPassport();

  if (isLoading) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (error || !passport) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Total Stamps & Next Milestone */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-900">Loyalty Passport</h3>
          <span className="text-2xl font-bold" style={{ color: '#8FB897' }}>
            {passport.totalStamps}
          </span>
        </div>

        {/* Progress Bar */}
        {passport.stampsToNextMilestone > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Next milestone: {passport.nextMilestone}</span>
              <span>{passport.stampsToNextMilestone} stamps to go</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  backgroundColor: '#8FB897',
                  width: `${((passport.totalStamps / (passport.totalStamps + passport.stampsToNextMilestone)) * 100) || 0}%`,
                }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Milestones / Badges */}
      {passport.milestones.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Badges Earned</h4>
          <div className="flex gap-3">
            {passport.milestones.map((m) => (
              <div
                key={m.milestone}
                className="flex flex-col items-center"
                title={`${m.badgeType} (${m.milestone} stamps)`}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
                  style={{ backgroundColor: MILESTONE_COLORS[m.badgeType] }}
                >
                  ★
                </div>
                <span className="text-xs text-gray-600 mt-1">{m.badgeType}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stamp Breakdown */}
      {passport.stamps.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Stamp Breakdown</h4>
          <div className="space-y-2">
            {passport.stamps.map((s) => (
              <div key={s.type} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{STAMP_ICONS[s.type] || '•'}</span>
                  <span className="text-gray-700 capitalize">
                    {s.type.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
                <span className="font-semibold" style={{ color: '#8FB897' }}>
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hunt Pass CTA */}
      {!passport.milestones.some((m) => m.badgeType === 'GOLD') && (
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200 p-4">
          <p className="text-sm text-blue-900 mb-2">
            Get early access to new listings with Hunt Pass!
          </p>
          <Link
            href="/shopper/hunt-pass"
            className="inline-block px-3 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Learn More
          </Link>
        </div>
      )}
    </div>
  );
}
