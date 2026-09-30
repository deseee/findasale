/**
 * Send Sale Update (text message)
 *
 * Organizers on PRO and TEAMS can text the shoppers who opted in to text updates for a sale.
 * Backend: GET /notifications/sms-audience/:saleId (who will be texted, limits, quiet hours) and
 * POST /notifications/send-sms { saleId, message } (sends; counts only in the response).
 *
 * Compliance is enforced server-side (recorded consent, STOP list, quiet hours 8 AM to 9 PM in the
 * organizer's timezone, daily cap, "Reply STOP to opt out." on every text); this page explains those
 * limits up front so a send never surprises anyone.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import { useOrganizerTier } from '../../../hooks/useOrganizerTier';
import TierGate from '../../../components/TierGate';

interface SmsAudience {
  saleId: string;
  saleTitle: string;
  saleEnded: boolean;
  eligibleCount: number;
  optedOutCount: number;
  noConsentCount: number;
  dailyCap: number;
  sentLast24h: number;
  remainingToday: number;
  quietHours: {
    allowedNow: boolean;
    timeZone: string;
    window: string;
    nextAllowedAt: string | null;
  };
  maxMessageChars: number;
  maxSegments: number;
  messagePrefix: string;
  messageSuffix: string;
  smsConfigured: boolean;
}

interface SendResult {
  message: string;
  sentCount: number;
  failedCount: number;
  skippedOptOutCount: number;
  audienceSize: number;
  remainingToday?: number;
}

const estimateSegments = (text: string): number => {
  // GSM-7 is 160 characters (153 per part when split); anything outside plain ASCII may switch the
  // whole text to UCS-2 (70 / 67). This is an estimate for the organizer; the server enforces the real limit.
  const usesSpecial = /[^\x00-\x7F]/.test(text);
  const single = usesSpecial ? 70 : 160;
  const multi = usesSpecial ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
};

const SendUpdatePage = () => {
  const router = useRouter();
  const saleId = typeof router.query.saleId === 'string' ? router.query.saleId : undefined;
  const { user, isLoading: authLoading } = useAuth();
  const { canAccess } = useOrganizerTier();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isPro = canAccess('PRO');

  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  // Auth guard (organizers only)
  useEffect(() => {
    if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const {
    data: audience,
    isLoading: audienceLoading,
    isError: audienceError,
    refetch: refetchAudience,
  } = useQuery<SmsAudience>({
    queryKey: ['sms-audience', saleId],
    queryFn: async () => {
      const res = await api.get(`/notifications/sms-audience/${saleId}`);
      return res.data;
    },
    enabled: !!saleId && !!user && isPro,
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/notifications/send-sms', { saleId, message: message.trim() });
      return res.data as SendResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setConfirming(false);
      setSendError(null);
      setMessage('');
      showToast(data.message, 'success');
      queryClient.invalidateQueries({ queryKey: ['sms-audience', saleId] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to send the text update. Nothing was sent.';
      setConfirming(false);
      setSendError(msg);
      showToast(msg, 'error');
      queryClient.invalidateQueries({ queryKey: ['sms-audience', saleId] });
    },
  });

  const maxChars = audience?.maxMessageChars ?? 240;
  const trimmed = message.trim();
  const fullText = audience ? `${audience.messagePrefix}${trimmed}${audience.messageSuffix}` : trimmed;
  const segments = estimateSegments(fullText);
  const tooManySegments = audience ? segments > audience.maxSegments : false;

  const quietNow = audience ? !audience.quietHours.allowedNow : false;
  const overAllowance = audience ? audience.eligibleCount > audience.remainingToday : false;
  const noAudience = audience ? audience.eligibleCount === 0 : false;

  const blockedReason: string | null = !audience
    ? null
    : !audience.smsConfigured
      ? 'Text sending is temporarily unavailable. Please try again later.'
      : audience.saleEnded
        ? 'This sale has ended, so text updates are closed.'
        : noAudience
          ? null
          : quietNow
            ? `Texts can only be sent between ${audience.quietHours.window} (${audience.quietHours.timeZone}).${
                audience.quietHours.nextAllowedAt
                  ? ` Sending opens again around ${new Date(audience.quietHours.nextAllowedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: audience.quietHours.timeZone })}.`
                  : ''
              }`
            : audience.remainingToday === 0
              ? `You have used all ${audience.dailyCap} texts allowed in the last 24 hours. The limit resets on a rolling basis.`
              : overAllowance
                ? `This update would reach ${audience.eligibleCount} shoppers, but you can send ${audience.remainingToday} more text${audience.remainingToday === 1 ? '' : 's'} in the next 24 hours.`
                : null;

  const canSend =
    !!audience && !blockedReason && !noAudience && trimmed.length > 0 && !tooManySegments && !sendMutation.isPending;

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    setSendError(null);
    if (!trimmed) {
      showToast('Message cannot be empty', 'error');
      return;
    }
    if (canSend) setConfirming(true);
  };

  return (
    <>
      <Head>
        <title>Send Sale Update - FindA.Sale</title>
      </Head>
      <TierGate
        requiredTier="PRO"
        featureName="Text Updates"
        description="Text your shoppers directly about a sale. Text updates are included with PRO and TEAMS because every text message has a real cost. Shoppers choose to opt in, and they can reply STOP any time."
      >
        <div className="min-h-screen bg-white dark:bg-gray-900">
          <div className="max-w-2xl mx-auto px-4 py-8">
            <Link href="/organizer/send-update" className="text-amber-600 dark:text-amber-400 hover:underline text-sm font-medium mb-4 inline-block">
              Back to all sales
            </Link>

            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Send a text update</h1>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              {audience?.saleTitle ? `For ${audience.saleTitle}. ` : ''}
              Texts go only to shoppers who opted in to text updates for this sale.
            </p>

            {(authLoading || audienceLoading) && isPro && (
              <div className="flex items-center gap-3 py-8" role="status" aria-label="Loading">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-amber-600 dark:border-amber-400"></div>
                <p className="text-warm-600 dark:text-warm-400 text-sm">Loading your audience...</p>
              </div>
            )}

            {audienceError && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-5 text-center mb-6">
                <p className="text-red-800 dark:text-red-200 text-sm mb-3">We could not load this sale. Please try again.</p>
                <button
                  type="button"
                  onClick={() => refetchAudience()}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Retry
                </button>
              </div>
            )}

            {result && (
              <div
                className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl p-5 mb-6"
                role="status"
                aria-live="polite"
              >
                <p className="font-semibold text-green-900 dark:text-green-100 mb-1">{result.message}</p>
                <ul className="text-sm text-green-800 dark:text-green-200 space-y-0.5">
                  <li>{result.sentCount} sent</li>
                  {result.failedCount > 0 && <li>{result.failedCount} could not be delivered</li>}
                  {result.skippedOptOutCount > 0 && <li>{result.skippedOptOutCount} skipped because they opted out</li>}
                </ul>
                <div className="flex flex-wrap gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    Send another update
                  </button>
                  <Link
                    href="/organizer/dashboard"
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-green-300 dark:border-green-600 text-green-900 dark:text-green-100"
                  >
                    Back to dashboard
                  </Link>
                </div>
              </div>
            )}

            {audience && !result && (
              <>
                {/* Audience summary */}
                <div className="bg-warm-50 dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-xl p-5 mb-6">
                  <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                    {audience.eligibleCount} shopper{audience.eligibleCount === 1 ? '' : 's'}
                    <span className="text-base font-medium text-warm-600 dark:text-warm-400"> will get this text</span>
                  </p>
                  <ul className="mt-2 text-xs text-warm-600 dark:text-warm-400 space-y-0.5">
                    {audience.optedOutCount > 0 && <li>{audience.optedOutCount} replied STOP and will not be texted</li>}
                    {audience.noConsentCount > 0 && (
                      <li>{audience.noConsentCount} have a number on file but never agreed to texts, so they are skipped</li>
                    )}
                    <li>
                      Today: {audience.sentLast24h} of {audience.dailyCap} texts used ({audience.remainingToday} left in the next 24 hours)
                    </li>
                    <li>Sending window: {audience.quietHours.window} ({audience.quietHours.timeZone})</li>
                  </ul>
                </div>

                {noAudience && (
                  <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-xl p-6 text-center mb-6">
                    <p className="text-warm-900 dark:text-warm-100 font-medium mb-1">No one has opted in to texts for this sale yet</p>
                    <p className="text-sm text-warm-600 dark:text-warm-400">
                      Shoppers turn on text updates with the &quot;Get text updates&quot; button on your sale page. Share your sale link
                      so they can sign up.
                    </p>
                  </div>
                )}

                {blockedReason && (
                  <div
                    className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-100 rounded-xl p-4 text-sm mb-6"
                    role="alert"
                  >
                    {blockedReason}
                  </div>
                )}

                {sendError && (
                  <div
                    className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-200 rounded-xl p-4 text-sm mb-6"
                    role="alert"
                  >
                    {sendError}
                  </div>
                )}

                {!noAudience && (
                  <form onSubmit={handleReview} className="space-y-5">
                    <div>
                      <label htmlFor="sms-message" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                        Message
                      </label>
                      <textarea
                        id="sms-message"
                        value={message}
                        onChange={(e) => {
                          setMessage(e.target.value);
                          setConfirming(false);
                        }}
                        rows={5}
                        maxLength={maxChars}
                        disabled={sendMutation.isPending}
                        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                        placeholder="What would you like to tell your shoppers?"
                      />
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                        {message.length}/{maxChars}. About {segments} text segment{segments === 1 ? '' : 's'} per shopper once your name and the opt-out line are added.
                      </p>
                      {tooManySegments && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">
                          Too long to send. Shorten it, or remove emoji and special characters.
                        </p>
                      )}
                    </div>

                    {/* What the shopper will actually receive */}
                    <div>
                      <p className="text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">What shoppers will receive</p>
                      <div className="bg-warm-100 dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm text-warm-900 dark:text-warm-100 whitespace-pre-wrap break-words">
                        {audience.messagePrefix}
                        {trimmed || <span className="text-warm-400 dark:text-warm-500">your message</span>}
                        {audience.messageSuffix}
                      </div>
                    </div>

                    {confirming ? (
                      <div className="border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
                        <p className="text-sm text-amber-900 dark:text-amber-100 mb-3">
                          Send this to {audience.eligibleCount} shopper{audience.eligibleCount === 1 ? '' : 's'} now? Texts cannot be recalled.
                        </p>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => sendMutation.mutate()}
                            disabled={sendMutation.isPending}
                            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                          >
                            {sendMutation.isPending ? 'Sending...' : 'Send now'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            disabled={sendMutation.isPending}
                            className="px-4 py-2 rounded-lg border border-warm-300 dark:border-gray-600 text-warm-800 dark:text-warm-200 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        disabled={!canSend}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Review and send
                      </button>
                    )}
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </TierGate>
    </>
  );
};

export default SendUpdatePage;
