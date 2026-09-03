/**
 * Consignor commission rates — ADR-096 follow-up.
 *
 * The rate ladder used to be seeded once and then unreachable: there was no
 * screen and no endpoint to see or change it. This page is the organizer's
 * view of that ladder.
 *
 * Editing model: a band's starting price is always the previous band's ending
 * price, so it is shown but never typed. Only "up to" and the rate are
 * editable, and the two are kept linked as you type. That makes a gap or an
 * overlap impossible to create here, which matters because a broken ladder
 * pays real people the wrong amount.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Plus, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import TierGate from '../../components/TierGate';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import ConfirmDialog from '../../components/ConfirmDialog';

/** Server shape — Decimals arrive as strings. */
interface ApiTier {
  id: string;
  minPrice: string;
  maxPrice: string | null;
  consignorRate: string;
}

interface TiersResponse {
  tiers: ApiTier[];
  optedIn: boolean;
  consignorCount: number;
  editable: boolean;
}

/** Local editing row. Values stay as strings so a half-typed number isn't destroyed. */
interface EditRow {
  key: string;
  minPrice: number;
  maxPrice: string; // '' means open-ended (only valid on the last row)
  consignorRate: string;
}

let rowSeq = 0;
const nextKey = () => `row-${rowSeq++}`;

function toRows(tiers: ApiTier[]): EditRow[] {
  return tiers.map((t) => ({
    key: nextKey(),
    minPrice: Number(t.minPrice),
    maxPrice: t.maxPrice === null ? '' : String(Number(t.maxPrice)),
    consignorRate: String(Number(t.consignorRate)),
  }));
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

/**
 * Client-side mirror of the server's ladder rules. The server is still the
 * authority — this exists so the organizer sees the problem while typing
 * instead of after a failed save.
 */
function validateRows(rows: EditRow[]): string | null {
  if (rows.length === 0) return 'Add at least one price band.';
  if (rows[rows.length - 1].maxPrice !== '') {
    return 'The highest band must be open-ended. Leave its "up to" field blank.';
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = `Band ${i + 1}`;

    const rate = Number(row.consignorRate);
    if (row.consignorRate.trim() === '' || Number.isNaN(rate)) {
      return `${label}: enter a consignor rate.`;
    }
    if (rate < 0 || rate > 100) {
      return `${label}: the consignor rate must be between 0 and 100.`;
    }

    if (i < rows.length - 1) {
      if (row.maxPrice.trim() === '') {
        return `${label}: enter the price this band goes up to.`;
      }
      const max = Number(row.maxPrice);
      if (Number.isNaN(max)) return `${label}: "up to" must be a number.`;
      if (max <= row.minPrice) {
        return `${label}: "up to" must be more than ${money(row.minPrice)}.`;
      }
    }
  }
  return null;
}

/** Re-derive every band's starting price from the band below it. */
function relink(rows: EditRow[]): EditRow[] {
  return rows.map((row, i) => {
    if (i === 0) return { ...row, minPrice: 0 };
    const prevMax = Number(rows[i - 1].maxPrice);
    return { ...row, minPrice: Number.isNaN(prevMax) ? row.minPrice : prevMax };
  });
}

const CommissionTiersPage: React.FC = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { canAccess } = useOrganizerTier();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('[]');
  const [optedIn, setOptedIn] = useState(false);
  const [consignorCount, setConsignorCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  const clientError = useMemo(() => validateRows(rows), [rows]);
  const dirty = JSON.stringify(rows.map((r) => [r.minPrice, r.maxPrice, r.consignorRate])) !== savedSnapshot;

  const snapshot = (next: EditRow[]) =>
    JSON.stringify(next.map((r) => [r.minPrice, r.maxPrice, r.consignorRate]));

  const fetchTiers = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await api.get<TiersResponse>('/commission-tiers');
      const data = response.data;
      const next = toRows(data.tiers || []);
      setRows(next);
      setSavedSnapshot(snapshot(next));
      setOptedIn(Boolean(data.optedIn));
      setConsignorCount(data.consignorCount ?? 0);
    } catch (error: any) {
      const status = error?.response?.status;
      setLoadError(
        status === 403
          ? 'Commission rates are part of the TEAMS plan.'
          : "We couldn't load your commission rates. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.roles?.includes('ORGANIZER') && canAccess('TEAMS')) {
      fetchTiers();
    }
  }, [user, canAccess, fetchTiers]);

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const handleMaxChange = (index: number, value: string) => {
    setServerError(null);
    setRows((prev) => {
      const next = prev.map((r, i) => (i === index ? { ...r, maxPrice: value } : r));
      return relink(next);
    });
  };

  const handleRateChange = (index: number, value: string) => {
    setServerError(null);
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, consignorRate: value } : r)));
  };

  /** Insert a band directly below the open-ended top band, keeping the ladder connected. */
  const handleAddBand = () => {
    setServerError(null);
    setRows((prev) => {
      if (prev.length === 0) {
        return [{ key: nextKey(), minPrice: 0, maxPrice: '', consignorRate: '50' }];
      }
      const top = prev[prev.length - 1];
      const start = top.minPrice;
      const suggestedEnd = start > 0 ? start * 2 : 100;
      const inserted: EditRow = {
        key: nextKey(),
        minPrice: start,
        maxPrice: String(suggestedEnd),
        consignorRate: top.consignorRate,
      };
      return relink([...prev.slice(0, -1), inserted, { ...top, minPrice: suggestedEnd }]);
    });
  };

  /** Removing a band hands its range to the band below it, so nothing is left uncovered. */
  const handleRemoveBand = (index: number) => {
    setServerError(null);
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      if (index > 0) {
        next[index - 1] = { ...next[index - 1], maxPrice: removed.maxPrice };
      }
      return relink(next);
    });
  };

  const handleSave = async () => {
    const problem = validateRows(rows);
    if (problem) {
      setServerError(problem);
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      const payload = {
        tiers: rows.map((r) => ({
          minPrice: r.minPrice,
          maxPrice: r.maxPrice.trim() === '' ? null : Number(r.maxPrice),
          consignorRate: Number(r.consignorRate),
        })),
      };
      const response = await api.put<{ tiers: ApiTier[] }>('/commission-tiers', payload);
      const next = toRows(response.data.tiers || []);
      setRows(next);
      setSavedSnapshot(snapshot(next));
      showToast('Commission rates saved', 'success');
    } catch (error: any) {
      const message =
        error?.response?.data?.error || "We couldn't save your commission rates. Try again.";
      setServerError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetConfirm(false);
    setSaving(true);
    setServerError(null);
    try {
      const response = await api.post<{ tiers: ApiTier[] }>('/commission-tiers/reset', {});
      const next = toRows(response.data.tiers || []);
      setRows(next);
      setSavedSnapshot(snapshot(next));
      showToast('Starting rates restored', 'success');
    } catch (error: any) {
      setServerError(
        error?.response?.data?.error || "We couldn't restore the starting rates. Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 text-warm-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed';

  const renderBands = () => (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const isTop = index === rows.length - 1;
        return (
          <div
            key={row.key}
            className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-sm font-bold text-warm-900 dark:text-white">
                {isTop
                  ? `${money(row.minPrice)} and up`
                  : `${money(row.minPrice)} to ${row.maxPrice.trim() === '' ? 'and up' : money(Number(row.maxPrice))}`}
              </p>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveBand(index)}
                  disabled={!optedIn || saving}
                  aria-label={`Remove band ${index + 1}`}
                  className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-warm-500 dark:text-warm-400 mb-1">
                  Starts at
                </label>
                <p className="px-3 py-2 rounded-lg bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300 text-sm">
                  {money(row.minPrice)}
                </p>
              </div>

              <div>
                <label
                  htmlFor={`max-${row.key}`}
                  className="block text-xs font-bold uppercase text-warm-500 dark:text-warm-400 mb-1"
                >
                  Up to
                </label>
                {isTop ? (
                  <p className="px-3 py-2 rounded-lg bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300 text-sm">
                    No limit
                  </p>
                ) : (
                  <input
                    id={`max-${row.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={row.maxPrice}
                    onChange={(e) => handleMaxChange(index, e.target.value)}
                    disabled={!optedIn || saving}
                    className={inputClass}
                    aria-label={`Band ${index + 1} upper price`}
                  />
                )}
              </div>

              <div>
                <label
                  htmlFor={`rate-${row.key}`}
                  className="block text-xs font-bold uppercase text-warm-500 dark:text-warm-400 mb-1"
                >
                  Consignor keeps (%)
                </label>
                <input
                  id={`rate-${row.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.01"
                  value={row.consignorRate}
                  onChange={(e) => handleRateChange(index, e.target.value)}
                  disabled={!optedIn || saving}
                  className={inputClass}
                  aria-label={`Band ${index + 1} consignor rate`}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Commission Rates"
      description="Set the rate consignors keep at each price level. Available on TEAMS and above."
    >
      <Head>
        <title>Commission Rates | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/organizer/consignors"
            className="inline-flex items-center gap-2 text-sm text-warm-600 dark:text-warm-400 hover:text-amber-600 dark:hover:text-amber-400 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to consignors
          </Link>

          <div className="mb-6">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-white">Commission Rates</h1>
            <p className="text-warm-600 dark:text-warm-400 mt-1">
              Higher-priced items usually earn the consignor a bigger share. Set what they keep at
              each price level here. It applies to every consignor with tiered commission turned on.
            </p>
          </div>

          {loading ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center">
              <p className="text-warm-600 dark:text-warm-400">Loading commission rates...</p>
            </div>
          ) : loadError ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center border border-red-200 dark:border-red-900/50">
              <p className="text-warm-700 dark:text-warm-300 mb-4">{loadError}</p>
              <button
                type="button"
                onClick={fetchTiers}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {!optedIn && (
                <div className="mb-6 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-200 mb-1">
                    Tiered commission is off
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    {consignorCount === 0
                      ? 'Add a consignor and switch on tiered commission to start using price-based rates. Until then, everyone is paid their flat rate.'
                      : 'No consignor is using tiered commission yet, so these rates are read-only. Open a consignor, switch on tiered commission, and you can edit them here.'}
                  </p>
                  <Link
                    href="/organizer/consignors"
                    className="inline-block mt-3 text-sm font-bold text-amber-900 dark:text-amber-200 underline"
                  >
                    Go to consignors
                  </Link>
                </div>
              )}

              {rows.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-10 text-center border border-warm-200 dark:border-gray-700">
                  <p className="text-warm-700 dark:text-warm-300 mb-2 font-bold">
                    No rates set up yet
                  </p>
                  <p className="text-warm-600 dark:text-warm-400 mb-5 text-sm">
                    Start from our recommended rates and adjust from there.
                  </p>
                  <button
                    type="button"
                    onClick={() => setResetConfirm(true)}
                    disabled={!optedIn || saving}
                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    Use recommended rates
                  </button>
                </div>
              ) : (
                <>
                  {renderBands()}

                  <button
                    type="button"
                    onClick={handleAddBand}
                    disabled={!optedIn || saving || rows.length >= 20}
                    className="mt-3 w-full flex items-center justify-center gap-2 border-2 border-dashed border-warm-300 dark:border-gray-600 rounded-lg py-3 text-sm font-bold text-warm-600 dark:text-warm-400 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-warm-300"
                  >
                    <Plus className="w-4 h-4" />
                    Add a price band
                  </button>

                  {(serverError || (dirty && clientError)) && (
                    <div
                      role="alert"
                      className="mt-4 flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3"
                    >
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {serverError || clientError}
                      </p>
                    </div>
                  )}

                  <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-between">
                    <button
                      type="button"
                      onClick={() => setResetConfirm(true)}
                      disabled={!optedIn || saving}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restore starting rates
                    </button>

                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!optedIn || saving || !dirty || Boolean(clientError)}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving...' : 'Save rates'}
                    </button>
                  </div>

                  <p className="mt-4 text-xs text-warm-500 dark:text-warm-400">
                    An item is paid at the rate of the band its price falls into. A band starts where
                    the one below it ends, so every price is covered.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={resetConfirm}
        title="Restore starting rates?"
        message="This replaces your current bands with the recommended rates: 50% under $100, 60% to $500, 65% to $2,000, and 75% above that."
        confirmLabel="Restore"
        cancelLabel="Keep mine"
        onConfirm={handleReset}
        onCancel={() => setResetConfirm(false)}
      />
    </TierGate>
  );
};

export default CommissionTiersPage;
