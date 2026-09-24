import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import Skeleton from './Skeleton';

/**
 * Facebook sold alerts card (ADR-131), embedded on pages/organizer/marketplace-extension.tsx.
 * Shows the organizer's unique forwarding address from
 * GET /api/organizers/me/facebook-sold-email (routes/organizers.ts) and the Gmail steps to
 * forward Facebook's "New Marketplace order for ..." emails to it. The first load creates
 * the address. Filter values below mirror the IMAP poll's search in
 * packages/backend/src/services/facebookMarketplaceEmailPollService.ts and the exact
 * sender/subject check in facebookMarketplaceEmailSoldDetection.ts.
 * 2026-09-23: step 3 is ONE Gmail filter whose "Has the words" query covers every marketplace
 * the poll reads (Facebook order + shipping-label emails, Vinted, Mercari, Poshmark, Grailed).
 * Each sender is paired with its own subject so only sale notices are forwarded. The backend
 * still re-checks the exact sender, subject and DKIM/DMARC per platform
 * (facebookMarketplaceEmailSoldDetection.ts, vintedSoldEmailDetection.ts,
 * mercariSoldEmailDetection.ts, poshmarkSoldEmailDetection.ts, grailedSoldEmailDetection.ts).
 *
 * Types are local on purpose (a @findasale/shared import breaks the Vercel build).
 */

interface FacebookSoldEmailResponse {
  address: string;
  token: string;
  autoConfirmEnabled: boolean;
  lastSoldEmailAt: string | null;
}

// One Gmail filter for every supported marketplace. Same sender/subject pairs as the poll's
// searches in facebookMarketplaceEmailPollService.ts. Gmail filters accept OR and parentheses
// in the "Has the words" box. Poshmark (research-built, not yet seen live) and Grailed
// (PROVISIONAL: subject not known yet, so sold OR sale) were added 2026-09-23; the backend only
// acts on their exact sale notices and ignores everything else these clauses let through.
const SOLD_EMAIL_FILTER_QUERY =
  '(from:noreply@marketplace.facebook.com (subject:"New Marketplace order for" OR subject:"Shipping label for your Marketplace order")) OR ' +
  '(from:no-reply@vinted.com subject:"You sold an item") OR ' +
  '(from:no-reply@alerts.us.mercari.com subject:"made a sale") OR ' +
  '(from:orders@poshmark.com subject:"just sold to") OR ' +
  '(from:help@grailed.com (subject:sold OR subject:sale))';

const CopyChip: React.FC<{ value: string; label?: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <code className="font-mono text-sm break-all bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-gray-100 px-3 py-1.5 rounded border border-warm-200 dark:border-gray-600 max-w-full">
        {value}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={label ? `Copy ${label}` : 'Copy'}
        className="text-xs font-medium bg-warm-200 dark:bg-gray-600 hover:bg-warm-300 dark:hover:bg-gray-500 text-warm-800 dark:text-gray-100 px-3 py-1.5 rounded transition-colors"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
};

const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <li className="flex gap-3">
    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-600 text-white text-sm font-bold flex items-center justify-center">
      {n}
    </span>
    <div className="min-w-0 text-sm text-warm-700 dark:text-gray-300 leading-relaxed">
      <span className="font-semibold text-warm-900 dark:text-gray-100">{title}</span> {children}
    </div>
  </li>
);

const formatDateTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const FacebookSoldAlertsCard: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<FacebookSoldEmailResponse>({
    queryKey: ['facebook-sold-email'],
    queryFn: async () => (await api.get('/organizers/me/facebook-sold-email')).data,
  });

  const regenerate = useMutation({
    mutationFn: async () => (await api.post('/organizers/me/facebook-sold-email/regenerate')).data,
    onSuccess: (next: FacebookSoldEmailResponse) => {
      queryClient.setQueryData(['facebook-sold-email'], next);
    },
  });

  const handleRegenerate = () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Get a new address? Your old one stops working right away, so you will need to redo the Gmail steps with the new one.'
      )
    ) {
      return;
    }
    regenerate.mutate();
  };

  return (
    <div className="border-t border-warm-200 dark:border-gray-700 pt-6 mt-6">
      <h3 className="text-sm font-semibold text-warm-700 dark:text-gray-300 mb-3">
        Marketplace sold alerts
      </h3>

      <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
        <p className="text-sm text-warm-600 dark:text-gray-400 mb-4 leading-relaxed">
          When something sells on Facebook Marketplace, Vinted, Mercari, Poshmark or Grailed, you get
          a sale email.
          Forward those emails to your private FindA.Sale address and we mark the item sold and pull
          it from your other marketplaces.
        </p>

        {isLoading && <Skeleton className="h-24 w-full" />}

        {!isLoading && isError && (
          <div className="text-sm">
            <p className="text-warm-900 dark:text-gray-100 font-medium mb-2">
              We couldn&apos;t load your forwarding address.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-amber-600 hover:underline font-medium"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && data && (
          <>
            <div className="mb-5">
              <p className="text-xs uppercase tracking-wide font-semibold text-warm-500 dark:text-gray-400">
                Your forwarding address
              </p>
              <CopyChip value={data.address} label="forwarding address" />
              {data.lastSoldEmailAt && (
                <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                  Working. Last sale caught by email: {formatDateTime(data.lastSoldEmailAt)}
                </p>
              )}
            </div>

            <ol className="space-y-4">
              <Step n={1} title="Add the address in Gmail.">
                On a computer, open Gmail, click the gear, then See all settings, then Forwarding and
                POP/IMAP. Click Add a forwarding address and paste the address above. Leave
                forwarding itself turned off so only sale notices come to us.
              </Step>
              <Step n={2} title="Confirm it.">
                {data.autoConfirmEnabled ? (
                  <>Gmail sends a confirmation to that address. We confirm it for you, usually within 20 minutes.</>
                ) : (
                  <>
                    Gmail sends a confirmation to that address.{' '}
                    <Link href="/support" className="text-amber-600 hover:underline font-medium">
                      Contact support
                    </Link>{' '}
                    to finish this step.
                  </>
                )}
              </Step>
              <Step n={3} title="Create one filter for all your marketplaces.">
                In Gmail search, open the search options and paste this into Has the words:
                <CopyChip value={SOLD_EMAIL_FILTER_QUERY} label="filter" />
                <div className="mt-2">
                  Click Create filter, check Forward it to, pick your FindA.Sale address, then Create
                  filter again. This one filter covers Facebook Marketplace, Vinted, Mercari, Poshmark
                  and Grailed sales. Offers, messages and promos are not forwarded. Made one of our
                  older filters? You can delete it once this one is saved.
                </div>
              </Step>
            </ol>

            <div className="mt-5 pt-4 border-t border-warm-100 dark:border-gray-700 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerate.isPending}
                className="text-xs font-medium text-warm-600 dark:text-gray-400 hover:underline disabled:opacity-50"
              >
                {regenerate.isPending ? 'Getting a new address...' : 'Get a new address'}
              </button>
              {regenerate.isError && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  Couldn&apos;t change your address. Try again later.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FacebookSoldAlertsCard;
