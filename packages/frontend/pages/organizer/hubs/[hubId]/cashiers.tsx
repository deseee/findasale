/**
 * Cashier Discretionary Discount at Point of Sale (ADR cashier-discretionary-discount,
 * 2026-09-25) -- the mall-owner-only per-cashier toggle screen (ADR §4). Lists every
 * CONFIRMED vendor booth at this hub + toggle, every reachable team member + toggle,
 * and a non-toggleable "You (mall owner)" row (always allowed, never needs a grant row).
 *
 * ACCESS CONTROL lives server-side (routes/vendorBooth.ts + vendorBoothController.ts's
 * listHubCashierDiscretionGrants/setHubCashierDiscretionGrant): only the hub-owning
 * organizer's own login can load this data or flip a toggle -- not any TEAM_MEMBER, not
 * even a MANAGER-role one. This page renders whatever the server returns and does not
 * itself attempt any authorization decision.
 *
 * Functional over polished, matching this hub-management page family's own convention
 * (see vendor-booths.tsx's header comment).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import TierGate from '../../../../components/TierGate';
import HubManagementNav from '../../../../components/HubManagementNav';

interface BoothRow {
  vendorBoothId: string;
  vendorName: string;
  boothNumber: string;
  isHubOwnerBooth: boolean;
  enabled: boolean;
}

interface TeamMemberRow {
  teamMemberId: string;
  role: string;
  name: string;
  enabled: boolean;
}

const CashiersPage: React.FC = () => {
  const router = useRouter();
  const { hubId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [booths, setBooths] = useState<BoothRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchGrants = useCallback(async () => {
    if (!hubId || typeof hubId !== 'string') return;
    try {
      setLoading(true);
      setLoadError(null);
      const res = await api.get(`/organizer/hubs/${hubId}/cashier-discretion`);
      setBooths(res.data?.booths || []);
      setTeamMembers(res.data?.teamMembers || []);
    } catch (error: any) {
      console.error('[cashiers] Failed to load cashier discretion settings:', error);
      setLoadError(error.response?.data?.error || 'Failed to load cashier discount settings');
    } finally {
      setLoading(false);
    }
  }, [hubId]);

  useEffect(() => {
    if (user && hubId) fetchGrants();
  }, [user, hubId, fetchGrants]);

  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const toggleBooth = async (booth: BoothRow) => {
    if (!hubId || typeof hubId !== 'string') return;
    const key = `BOOTH:${booth.vendorBoothId}`;
    const nextEnabled = !booth.enabled;
    setSavingKey(key);
    // Optimistic update, reverted on failure below.
    setBooths((prev) => prev.map((b) => (b.vendorBoothId === booth.vendorBoothId ? { ...b, enabled: nextEnabled } : b)));
    try {
      await api.put(`/organizer/hubs/${hubId}/cashier-discretion/BOOTH/${booth.vendorBoothId}`, { enabled: nextEnabled });
      showToast(`${booth.vendorName}'s discount permission ${nextEnabled ? 'enabled' : 'disabled'}.`, 'success');
    } catch (error: any) {
      setBooths((prev) => prev.map((b) => (b.vendorBoothId === booth.vendorBoothId ? { ...b, enabled: booth.enabled } : b)));
      showToast(error.response?.data?.error || 'Failed to update this booth\'s permission.', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const toggleTeamMember = async (member: TeamMemberRow) => {
    if (!hubId || typeof hubId !== 'string') return;
    const key = `TEAM_MEMBER:${member.teamMemberId}`;
    const nextEnabled = !member.enabled;
    setSavingKey(key);
    setTeamMembers((prev) => prev.map((m) => (m.teamMemberId === member.teamMemberId ? { ...m, enabled: nextEnabled } : m)));
    try {
      await api.put(`/organizer/hubs/${hubId}/cashier-discretion/TEAM_MEMBER/${member.teamMemberId}`, { enabled: nextEnabled });
      showToast(`${member.name}'s discount permission ${nextEnabled ? 'enabled' : 'disabled'}.`, 'success');
    } catch (error: any) {
      setTeamMembers((prev) => prev.map((m) => (m.teamMemberId === member.teamMemberId ? { ...m, enabled: member.enabled } : m)));
      showToast(error.response?.data?.error || 'Failed to update this team member\'s permission.', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Cashier Discount Permissions"
      description="Control who can apply the checkout-time discretionary discount at this market's shared register. Available on TEAMS and above."
    >
      <Head>
        <title>Cashiers | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/organizer/hubs"
            className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium mb-6 inline-block"
          >
            ← Back to Hubs
          </Link>

          {hubId && typeof hubId === 'string' && <HubManagementNav hubId={hubId} />}

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-white">Cashier Discount Permissions</h1>
            <p className="text-warm-600 dark:text-warm-400 mt-1">
              Choose who can apply a discretionary discount at checkout, on top of any existing markdown. Every
              discount is capped automatically -- at most 10% of an item's current price, and never more than 20%
              off its original price in total.
            </p>
          </div>

          {loading && <p className="text-warm-500 dark:text-warm-400">Loading...</p>}
          {loadError && !loading && (
            <p className="text-red-600 dark:text-red-400 mb-4">{loadError}</p>
          )}

          {!loading && !loadError && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-warm-900 dark:text-warm-100">You (mall owner)</span>
                  <span className="text-xs text-warm-400 dark:text-warm-500">Always allowed</span>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-warm-700 dark:text-warm-300 mb-2">Vendor booths</h2>
                {booths.length === 0 ? (
                  <p className="text-sm text-warm-500 dark:text-warm-400">No confirmed vendor booths at this hub yet.</p>
                ) : (
                  <div className="rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 divide-y divide-warm-100 dark:divide-gray-700">
                    {booths.map((b) => (
                      <div key={b.vendorBoothId} className="flex items-center justify-between p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-warm-900 dark:text-warm-100 truncate">
                            {b.vendorName}{b.isHubOwnerBooth ? ' (house booth)' : ''}
                          </p>
                          <p className="text-xs text-warm-500 dark:text-warm-400">Booth {b.boothNumber}</p>
                        </div>
                        <button
                          type="button"
                          disabled={savingKey === `BOOTH:${b.vendorBoothId}`}
                          onClick={() => toggleBooth(b)}
                          aria-pressed={b.enabled}
                          className={`shrink-0 w-12 h-7 rounded-full transition-colors relative disabled:opacity-50 ${b.enabled ? 'bg-sage-600' : 'bg-warm-300 dark:bg-gray-600'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ${b.enabled ? 'translate-x-5' : ''}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-sm font-semibold text-warm-700 dark:text-warm-300 mb-2">Team members</h2>
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-warm-500 dark:text-warm-400">No team members in this workspace yet.</p>
                ) : (
                  <div className="rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 divide-y divide-warm-100 dark:divide-gray-700">
                    {teamMembers.map((m) => (
                      <div key={m.teamMemberId} className="flex items-center justify-between p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-warm-900 dark:text-warm-100 truncate">{m.name}</p>
                          <p className="text-xs text-warm-500 dark:text-warm-400">{m.role}</p>
                        </div>
                        <button
                          type="button"
                          disabled={savingKey === `TEAM_MEMBER:${m.teamMemberId}`}
                          onClick={() => toggleTeamMember(m)}
                          aria-pressed={m.enabled}
                          className={`shrink-0 w-12 h-7 rounded-full transition-colors relative disabled:opacity-50 ${m.enabled ? 'bg-sage-600' : 'bg-warm-300 dark:bg-gray-600'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ${m.enabled ? 'translate-x-5' : ''}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </TierGate>
  );
};

export default CashiersPage;
