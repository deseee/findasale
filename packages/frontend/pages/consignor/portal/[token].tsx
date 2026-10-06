/**
 * Consignor Public Portal — Feature #309
 *
 * PUBLIC page (NO AUTH REQUIRED)
 * Accessible via token-gated URL: /consignor/portal/:token
 *
 * Displays:
 * - Consignor's items and their statuses
 * - Payout history
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import {
  PORTAL_SQUARE_ANCHOR,
  rememberPendingPortalSquareToken,
} from '../../../lib/consignorPortalSquare';

// Consignor portal Square payouts (2026-10-06). Mirrors GET /consignors/portal/:token/square.
interface PortalSquareStatus {
  status: 'NOT_CONNECTED' | 'ACTIVE' | 'NEEDS_ACTIVATION';
  canConnect: boolean;
  payoutsFlaggedForReview: boolean;
}

type SquareNotice = 'connected' | 'needs-activation' | 'cancelled' | 'already-connected' | 'error' | null;

const SQUARE_SIGNUP_URL = 'https://squareup.com/signup';

interface Item {
  id: string;
  title: string;
  price: string | number;
  status: string;
  createdAt: string;
  // Markdown visibility (Patrick, 2026-09-25): populated when the organizer's automatic
  // markdown system has reduced this item's price -- see getConsignorPortal in
  // consignorController.ts. priceBeforeMarkdown is only meaningful when markdownApplied
  // is true.
  priceBeforeMarkdown?: number | string | null;
  markdownApplied?: boolean;
}

interface Payout {
  id: string;
  totalSales: string | number;
  commissionAmount: string | number;
  netPayout: string | number;
  method: string | null;
  paidAt: string | null;
  createdAt: string;
}

// In-app consignor agreement (Patrick, 2026-09-25): rendered server-side from this
// consignor's real values -- see renderConsignorAgreementForConsignor in
// consignorAgreementService.ts. acceptedAt/acceptedVersion mirror Consignor's own
// agreementAcceptedAt/agreementAcceptedVersion columns.
interface Agreement {
  version: number;
  renderedMarkdown: string;
  acceptedAt: string | null;
  acceptedVersion: number | null;
}

interface PortalData {
  consignor: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  items: Item[];
  payouts: Payout[];
  agreement: Agreement | null;
}

const ConsignorPortalPage: React.FC = () => {
  const router = useRouter();
  const { token } = router.query;

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'items' | 'payouts' | 'agreement'>('items');
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Square payouts card state (2026-10-06)
  const [square, setSquare] = useState<PortalSquareStatus | null>(null);
  const [squareBusy, setSquareBusy] = useState<'start' | 'refresh' | null>(null);
  const [squareError, setSquareError] = useState<string | null>(null);
  const [squareNotice, setSquareNotice] = useState<SquareNotice>(null);

  useEffect(() => {
    if (!token) return;

    const fetchPortal = async () => {
      try {
        setLoading(true);
        setError(null);

        // No auth required — public endpoint
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL || '/api'}/consignors/portal/${token}`
        );

        setData(response.data);
      } catch (err: any) {
        console.error('Error fetching consignor portal:', err);
        setError(err.response?.data?.error || 'Portal not found');
      } finally {
        setLoading(false);
      }
    };

    fetchPortal();
  }, [token]);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
  const tokenStr = typeof token === 'string' ? token : '';

  const fetchSquareStatus = async () => {
    if (!tokenStr) return;
    try {
      const response = await axios.get(`${apiBase}/consignors/portal/${encodeURIComponent(tokenStr)}/square`);
      setSquare(response.data);
    } catch (err: any) {
      // Non-fatal: the rest of the portal still works; the card shows a retry.
      setSquareError(err.response?.data?.error || 'Could not load your Square payout status.');
    }
  };

  // Load Square status, and read the one-time result the Square callback page hands back
  // (?square=connected|needs-activation|cancelled|already-connected|error).
  useEffect(() => {
    if (!router.isReady || !tokenStr) return;
    const q = router.query.square;
    const allowed: SquareNotice[] = ['connected', 'needs-activation', 'cancelled', 'already-connected', 'error'];
    if (typeof q === 'string' && (allowed as string[]).includes(q)) {
      setSquareNotice(q as SquareNotice);
      router.replace(`/consignor/portal/${encodeURIComponent(tokenStr)}#${PORTAL_SQUARE_ANCHOR}`, undefined, { shallow: true });
    }
    fetchSquareStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, tokenStr]);

  // Bring the Square card into view when arriving from the email button or the callback.
  useEffect(() => {
    if (!data || typeof window === 'undefined') return;
    if (window.location.hash === `#${PORTAL_SQUARE_ANCHOR}`) {
      const el = document.getElementById(PORTAL_SQUARE_ANCHOR);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [data]);

  const handleStartSquare = async () => {
    if (!tokenStr) return;
    setSquareBusy('start');
    setSquareError(null);
    setSquareNotice(null);
    try {
      const response = await axios.post(`${apiBase}/consignors/portal/${encodeURIComponent(tokenStr)}/square/start`);
      const url = response.data?.onboardingUrl;
      if (typeof url !== 'string' || !url.startsWith('https://')) {
        throw new Error('bad url');
      }
      rememberPendingPortalSquareToken(tokenStr);
      window.location.assign(url);
    } catch (err: any) {
      const code = err.response?.data?.code;
      if (code === 'SQUARE_ALREADY_CONNECTED') {
        setSquareNotice('already-connected');
        fetchSquareStatus();
      } else {
        setSquareError(err.response?.data?.error || 'Could not start the Square connection. Please try again.');
      }
      setSquareBusy(null);
    }
  };

  const handleRefreshSquare = async () => {
    if (!tokenStr) return;
    setSquareBusy('refresh');
    setSquareError(null);
    try {
      const response = await axios.post(`${apiBase}/consignors/portal/${encodeURIComponent(tokenStr)}/square/refresh`);
      setSquare(response.data);
      setSquareNotice(response.data?.status === 'ACTIVE' ? 'connected' : null);
    } catch (err: any) {
      setSquareError(err.response?.data?.error || 'Could not check with Square right now. Please try again.');
    } finally {
      setSquareBusy(null);
    }
  };

  const handleAcceptAgreement = async () => {
    if (!token) return;
    try {
      setAccepting(true);
      setAcceptError(null);

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || '/api'}/consignors/portal/${token}/agreement/accept`
      );

      setData(prev =>
        prev && prev.agreement
          ? {
              ...prev,
              agreement: {
                ...prev.agreement,
                acceptedAt: response.data.agreementAcceptedAt,
                acceptedVersion: response.data.agreementAcceptedVersion,
              },
            }
          : prev
      );
    } catch (err: any) {
      console.error('Error accepting consignor agreement:', err);
      setAcceptError(err.response?.data?.error || 'Could not record your acceptance. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  // Minimal, dependency-free rendering for the agreement's markdown (## headings + plain
  // paragraphs only -- that's all CONSIGNOR_AGREEMENT_TEMPLATE uses).
  const renderAgreementMarkdown = (markdown: string) =>
    markdown
      .split(/\n{2,}/)
      .map(block => block.trim())
      .filter(Boolean)
      .map((block, idx) => {
        if (block.startsWith('## ')) {
          return (
            <h3 key={idx} className="text-base font-bold text-warm-900 dark:text-white mt-5 mb-1 first:mt-0">
              {block.replace(/^##\s+/, '')}
            </h3>
          );
        }
        if (block.startsWith('# ')) {
          return (
            <h2 key={idx} className="text-lg font-bold text-warm-900 dark:text-white mb-2">
              {block.replace(/^#\s+/, '')}
            </h2>
          );
        }
        return (
          <p key={idx} className="text-sm text-warm-700 dark:text-warm-300 leading-relaxed mb-3">
            {block}
          </p>
        );
      });

  if (loading) {
    return (
      <>
        <Head>
          <title>Loading... | FindA.Sale Consignor Portal</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
          <p className="text-warm-600 dark:text-warm-400">Loading portal...</p>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Head>
          <title>Portal Not Found | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-warm-900 dark:text-white mb-2">
              Portal Not Found
            </h1>
            <p className="text-warm-600 dark:text-warm-400 text-sm">
              {error || 'This consignor portal link is invalid or has expired.'}
            </p>
            <p className="text-warm-500 dark:text-warm-400 text-xs mt-4">
              Please contact your organizer for a valid portal link.
            </p>
          </div>
        </div>
      </>
    );
  }

  const itemsSold = data.items.filter(i => i.status === 'SOLD').length;
  const itemsAvailable = data.items.filter(i => i.status === 'AVAILABLE').length;
  const itemsHeld = data.items.filter(i => i.status === 'HELD').length;

  const totalPayouted = data.payouts.reduce(
    (sum, p) => sum + Number(p.netPayout),
    0
  );

  return (
    <>
      <Head>
        <title>Your Consignment Portal | FindA.Sale</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-white mb-2">
              Your Consignment Portal
            </h1>
            <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
              {data.consignor.name}
            </p>
            {data.consignor.email && (
              <p className="text-sm text-warm-600 dark:text-warm-400">{data.consignor.email}</p>
            )}
            {data.consignor.phone && (
              <p className="text-sm text-warm-600 dark:text-warm-400">{data.consignor.phone}</p>
            )}
          </div>

          {/* Agreement banner (Patrick, 2026-09-25): unmissable until accepted, easy to ignore after */}
          {data.agreement && !data.agreement.acceptedAt && (
            <div className="mb-8 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Please review and accept your consignor agreement.
              </p>
              <button
                onClick={() => setActiveTab('agreement')}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors self-start sm:self-auto"
              >
                Review Agreement
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">
                Total Items
              </p>
              <p className="text-2xl font-bold text-warm-900 dark:text-white">{data.items.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">
                Sold
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{itemsSold}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">
                Available
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{itemsAvailable}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">
                Received
              </p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                ${totalPayouted.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Square payouts (2026-10-06): consignor connects Square from this portal, no account needed */}
          <div
            id={PORTAL_SQUARE_ANCHOR}
            className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-4 md:p-6 scroll-mt-4"
          >
            <h2 className="text-lg font-bold text-warm-900 dark:text-white mb-1">Get paid through Square</h2>

            {squareNotice === 'cancelled' && (
              <p className="mb-3 text-sm rounded-lg p-3 bg-warm-50 dark:bg-gray-700 text-warm-700 dark:text-warm-300">
                The Square connection was cancelled. Nothing was changed. You can try again any time.
              </p>
            )}
            {squareNotice === 'error' && (
              <p className="mb-3 text-sm rounded-lg p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                We could not finish connecting Square. The link may have expired. Please try again.
              </p>
            )}
            {squareNotice === 'already-connected' && (
              <p className="mb-3 text-sm rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200">
                A Square account is already connected for your payouts. If it needs to change, please contact your organizer.
              </p>
            )}
            {squareError && (
              <div className="mb-3 text-sm rounded-lg p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>{squareError}</span>
                <button
                  onClick={() => { setSquareError(null); fetchSquareStatus(); }}
                  className="self-start sm:self-auto px-3 py-2 min-h-[44px] rounded-lg text-sm font-bold bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                >
                  Retry
                </button>
              </div>
            )}

            {!square && !squareError && (
              <p className="text-sm text-warm-600 dark:text-warm-400">Loading your payout status...</p>
            )}

            {square?.status === 'NOT_CONNECTED' && (
              <div>
                <p className="text-sm text-warm-700 dark:text-warm-300 mb-2">
                  Connect a Square account so your organizer can pay you through Square when your items sell.
                  You do not need a FindA.Sale account.
                </p>
                <ul className="text-sm text-warm-600 dark:text-warm-400 mb-4 list-disc pl-5 space-y-1">
                  <li>Already have a Square account? Sign in with it on the next screen.</li>
                  <li>
                    New to Square? First{' '}
                    <a
                      href={SQUARE_SIGNUP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-700 dark:text-amber-400 underline"
                    >
                      create a free Square account
                    </a>
                    , then come back here and choose Connect Square.
                  </li>
                  <li>Prefer cash, check or another method? Just tell your organizer. Nothing changes for you.</li>
                </ul>
                <button
                  onClick={handleStartSquare}
                  disabled={squareBusy !== null}
                  className="w-full sm:w-auto px-5 py-3 min-h-[44px] rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {squareBusy === 'start' ? 'Opening Square...' : 'Connect Square'}
                </button>
              </div>
            )}

            {square?.status === 'NEEDS_ACTIVATION' && (
              <div>
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-1">
                  Almost done: finish activating your Square account
                </p>
                <p className="text-sm text-warm-700 dark:text-warm-300 mb-4">
                  Your Square account is connected, but Square says it is not fully active yet. Sign in at squareup.com and
                  finish the steps Square asks for (for example, linking a bank account). Then come back and check again.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={handleRefreshSquare}
                    disabled={squareBusy !== null}
                    className="px-5 py-3 min-h-[44px] rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
                  >
                    {squareBusy === 'refresh' ? 'Checking...' : 'Check again'}
                  </button>
                  {square.canConnect && (
                    <button
                      onClick={handleStartSquare}
                      disabled={squareBusy !== null}
                      className="px-5 py-3 min-h-[44px] rounded-lg text-sm font-bold bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 disabled:opacity-60 transition-colors"
                    >
                      {squareBusy === 'start' ? 'Opening Square...' : 'Reconnect the same Square account'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {square?.status === 'ACTIVE' && (
              <div>
                <p className="text-sm font-bold text-green-700 dark:text-green-400 mb-1">
                  {squareNotice === 'connected' ? 'Square connected. You are all set.' : 'Square is connected for your payouts.'}
                </p>
                <p className="text-sm text-warm-700 dark:text-warm-300">
                  Your organizer can pay you through Square. To change the connected account, please contact your organizer.
                </p>
              </div>
            )}

            {square?.payoutsFlaggedForReview && (
              <p className="mt-3 text-xs rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200">
                As a routine precaution, our team is taking a quick look at this account before payouts begin. No action is needed from you.
              </p>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-4 border-b border-warm-200 dark:border-gray-700 mb-6">
            <button
              onClick={() => setActiveTab('items')}
              className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${
                activeTab === 'items'
                  ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-300'
              }`}
            >
              Items ({data.items.length})
            </button>
            <button
              onClick={() => setActiveTab('payouts')}
              className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${
                activeTab === 'payouts'
                  ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-300'
              }`}
            >
              Payouts ({data.payouts.length})
            </button>
            {data.agreement && (
              <button
                onClick={() => setActiveTab('agreement')}
                className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${
                  activeTab === 'agreement'
                    ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                    : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-300'
                }`}
              >
                Agreement{!data.agreement.acceptedAt && ' •'}
              </button>
            )}
          </div>

          {/* Items Tab */}
          {activeTab === 'items' && (
            <div>
              {data.items.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-warm-200 dark:border-gray-700">
                  <p className="text-warm-600 dark:text-warm-400">No items listed yet</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-warm-50 dark:bg-gray-700 border-b border-warm-200 dark:border-gray-600">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Title
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Price
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                        {data.items.map(item => (
                          <tr
                            key={item.id}
                            className="hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm text-warm-900 dark:text-white font-medium">
                              {item.title}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-amber-600 dark:text-amber-400">
                              {item.markdownApplied && item.priceBeforeMarkdown != null ? (
                                <div>
                                  <div>
                                    <span className="line-through text-warm-400 dark:text-warm-500 font-normal mr-2">
                                      ${Number(item.priceBeforeMarkdown).toFixed(2)}
                                    </span>
                                    <span>${Number(item.price).toFixed(2)}</span>
                                  </div>
                                  <div className="text-[11px] font-normal text-warm-500 dark:text-warm-400">
                                    Marked down from original price
                                  </div>
                                </div>
                              ) : (
                                <>${Number(item.price).toFixed(2)}</>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span
                                className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                  item.status === 'SOLD'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : item.status === 'AVAILABLE'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-warm-600 dark:text-warm-400">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payouts Tab */}
          {activeTab === 'payouts' && (
            <div>
              {data.payouts.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-warm-200 dark:border-gray-700">
                  <p className="text-warm-600 dark:text-warm-400">No payouts recorded yet</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-warm-50 dark:bg-gray-700 border-b border-warm-200 dark:border-gray-600">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Total Sales
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Commission
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Payout
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Method
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                        {data.payouts.map(payout => (
                          <tr
                            key={payout.id}
                            className="hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm text-warm-900 dark:text-white font-medium">
                              {new Date(payout.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-warm-700 dark:text-warm-300">
                              ${Number(payout.totalSales).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-warm-700 dark:text-warm-300">
                              ${Number(payout.commissionAmount).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-green-600 dark:text-green-400">
                              ${Number(payout.netPayout).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-warm-600 dark:text-warm-400">
                              {payout.method || 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Agreement Tab */}
          {activeTab === 'agreement' && data.agreement && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6">
              <div className="max-w-none">
                {renderAgreementMarkdown(data.agreement.renderedMarkdown)}
              </div>

              <div className="mt-6 pt-4 border-t border-warm-200 dark:border-gray-700">
                {data.agreement.acceptedAt ? (
                  <p className="text-sm font-bold text-green-600 dark:text-green-400">
                    ✓ Accepted on {new Date(data.agreement.acceptedAt).toLocaleDateString()}
                    {data.agreement.acceptedVersion != null && ` (version ${data.agreement.acceptedVersion})`}
                  </p>
                ) : (
                  <div>
                    <button
                      onClick={handleAcceptAgreement}
                      disabled={accepting}
                      className="px-5 py-2.5 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
                    >
                      {accepting ? 'Recording...' : 'I Agree'}
                    </button>
                    {acceptError && (
                      <p className="text-sm text-red-600 dark:text-red-400 mt-2">{acceptError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 text-center text-xs text-warm-500 dark:text-warm-400">
            <p>FindA.Sale Consignor Portal</p>
            <p className="mt-1">This is a secure, token-gated page. Do not share this link.</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default ConsignorPortalPage;
