/**
 * Feature (2026-09-16): Email Invoice -- organizer-initiated, one-off invoice sent
 * straight to any email address. No hold, no catalog item, and no requirement that the
 * recipient already have a FindA.Sale account -- they get a payable Square Checkout link
 * by email and pay there. PRO/TEAMS feature (see TierGate below and the backend's own
 * gate in guestInvoiceController.ts).
 *
 * Deliberately standalone -- not nested inside /organizer/pos (the POS register screen).
 * The whole point is an organizer can send this without opening the register at all.
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import TierGate from '../../components/TierGate';
import { getPlatformFeeRate, formatFeeRate } from '../../lib/platformFees';

interface LineItem {
  title: string;
  amount: string; // kept as string while editing, parsed to number on submit
}

interface SendInvoiceResult {
  invoiceId: string;
  status: string;
  checkoutUrl: string;
  totalAmount: number; // cents
  platformFeeAmount: number; // cents
  linkedExistingAccount: boolean;
  emailWarning?: string;
}

interface RecipientLookupResult {
  exists: boolean;
  phone: string | null;
}

function SendInvoiceForm() {
  const { user } = useAuth();
  const { tier } = useOrganizerTier();
  const { showToast } = useToast();

  const { data: sales } = useQuery({
    queryKey: ['organizer-sales-list', user?.id],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return response.data.sales as { id: string; title: string; status: string }[];
    },
    enabled: !!user?.id,
  });

  const [saleId, setSaleId] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [phoneAutoFilled, setPhoneAutoFilled] = useState(false);
  const [shippingAddressLine1, setShippingAddressLine1] = useState('');
  const [shippingAddressLine2, setShippingAddressLine2] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingZip, setShippingZip] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [expiryDays, setExpiryDays] = useState('7');
  const [lastResult, setLastResult] = useState<SendInvoiceResult | null>(null);

  // Default to the organizer's most recently created sale once the list loads.
  React.useEffect(() => {
    if (!saleId && sales && sales.length > 0) {
      setSaleId(sales[0].id);
    }
  }, [sales, saleId]);

  // Auto-fill from an existing account (2026-09-16 follow-up): look up the email once the
  // organizer leaves the field, and pre-fill phone if that account has one on file. There is
  // no persisted shipping address anywhere on a User to pull in -- confirmed by reading every
  // checkout/profile flow in this codebase (Purchase captures an address fresh per-purchase,
  // never as a reusable default) -- so shipping always starts blank here, guest or not.
  const trimmedEmail = recipientEmail.trim().toLowerCase();
  const [lookupEmail, setLookupEmail] = useState('');
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

  const { data: recipientLookup } = useQuery({
    queryKey: ['guest-invoice-recipient-lookup', lookupEmail],
    queryFn: async () => {
      const response = await api.get('/guest-invoices/lookup-recipient', { params: { email: lookupEmail } });
      return response.data as RecipientLookupResult;
    },
    enabled: !!lookupEmail,
    staleTime: 60000,
  });

  React.useEffect(() => {
    if (recipientLookup?.exists && recipientLookup.phone && !recipientPhone) {
      setRecipientPhone(recipientLookup.phone);
      setPhoneAutoFilled(true);
    }
  }, [recipientLookup, recipientPhone]);

  const handleEmailBlur = () => {
    if (emailLooksValid) setLookupEmail(trimmedEmail);
  };

  const lookupMatchesCurrentEmail = lookupEmail === trimmedEmail;

  const addLineItem = () => setLineItems((prev) => [...prev, { title: '', amount: '' }]);
  const removeLineItem = (idx: number) => setLineItems((prev) => prev.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: keyof LineItem, value: string) =>
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, [field]: value } : li)));

  const parsedAmount = parseFloat(amount);
  const parsedLineItemsTotal = lineItems.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0);
  const grandTotalDollars = (Number.isFinite(parsedAmount) ? parsedAmount : 0) + parsedLineItemsTotal;
  const feeRate = getPlatformFeeRate(tier);
  const estimatedFee = grandTotalDollars * feeRate;

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/guest-invoices', {
        saleId,
        recipientEmail: recipientEmail.trim(),
        recipientName: recipientName.trim() || undefined,
        recipientPhone: recipientPhone.trim() || undefined,
        title: title.trim(),
        amount: parsedAmount,
        lineItems: lineItems
          .filter((li) => li.title.trim() && li.amount.trim())
          .map((li) => ({ title: li.title.trim(), amount: parseFloat(li.amount) })),
        expiryDays: parseInt(expiryDays, 10) || 7,
        shippingAddressLine1: shippingAddressLine1.trim() || undefined,
        shippingAddressLine2: shippingAddressLine2.trim() || undefined,
        shippingCity: shippingCity.trim() || undefined,
        shippingState: shippingState.trim() || undefined,
        shippingZip: shippingZip.trim() || undefined,
      });
      return response.data as SendInvoiceResult;
    },
    onSuccess: (data) => {
      setLastResult(data);
      if (data.emailWarning) {
        showToast(data.emailWarning, 'error');
      } else {
        showToast(
          data.linkedExistingAccount
            ? 'Invoice sent -- this email matches an existing FindA.Sale account, so they also got an in-app notification.'
            : 'Invoice emailed. They can pay from that email with no FindA.Sale account needed.',
          'success'
        );
      }
      // Reset the form but keep the sale selection for a possible next invoice.
      setRecipientEmail('');
      setRecipientName('');
      setRecipientPhone('');
      setPhoneAutoFilled(false);
      setLookupEmail('');
      setShippingAddressLine1('');
      setShippingAddressLine2('');
      setShippingCity('');
      setShippingState('');
      setShippingZip('');
      setTitle('');
      setAmount('');
      setLineItems([]);
      setExpiryDays('7');
    },
    onError: (err: any) => {
      const message = err.response?.data?.message || 'Failed to send invoice';
      showToast(message, 'error');
    },
  });

  const canSubmit =
    !!saleId &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim()) &&
    !!title.trim() &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    !sendMutation.isPending;

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100">Email Invoice</h1>
        </div>
        <p className="text-sm text-warm-700 dark:text-warm-300 mb-6">
          Bill anyone by email -- a Christmas tree with a separate shipping quote, a special
          request, anything. No hold, no catalog listing, and the customer doesn't need a
          FindA.Sale account: they get a payable link by email and pay there.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
              Which sale is this for?
            </label>
            <select
              value={saleId}
              onChange={(e) => setSaleId(e.target.value)}
              className="w-full rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
            >
              <option value="" disabled>Select a sale...</option>
              {(sales ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
                Customer email
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                onBlur={handleEmailBlur}
                placeholder="customer@example.com"
                className="w-full rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
                autoComplete="email"
              />
              {lookupMatchesCurrentEmail && recipientLookup?.exists && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Matches an existing FindA.Sale account -- payment will link to it{recipientLookup.phone ? ' and their phone was pre-filled below' : ''}.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
                Customer name (optional)
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
                autoComplete="name"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
              Customer phone (optional)
              {phoneAutoFilled && (
                <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-400">(from their account)</span>
              )}
            </label>
            <input
              type="tel"
              value={recipientPhone}
              onChange={(e) => { setRecipientPhone(e.target.value); setPhoneAutoFilled(false); }}
              placeholder="(555) 123-4567"
              className="w-full sm:w-64 rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
              autoComplete="tel"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
              What are they paying for?
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Christmas tree (7ft, pre-lit)"
              className="w-full rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
              Price ($)
            </label>
            <input
              type="number"
              min="0.50"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="150.00"
              className="w-full sm:w-48 rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
            />
          </div>

          <div className="border-t border-warm-200 dark:border-gray-700 pt-4">
            <p className="text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
              Shipping address (optional)
            </p>
            <p className="text-xs text-warm-500 dark:text-warm-400 mb-2">
              For anything you'll ship -- like a Christmas tree needing a shipping quote.
              Leave blank for local pickup. This never comes pre-filled: there's no saved
              address on any FindA.Sale account to pull from, even a linked one.
            </p>
            <div className="space-y-2">
              <input
                type="text"
                value={shippingAddressLine1}
                onChange={(e) => setShippingAddressLine1(e.target.value)}
                placeholder="Street address"
                maxLength={200}
                className="w-full rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
                autoComplete="address-line1"
              />
              <input
                type="text"
                value={shippingAddressLine2}
                onChange={(e) => setShippingAddressLine2(e.target.value)}
                placeholder="Apt, suite, etc. (optional)"
                maxLength={200}
                className="w-full rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
                autoComplete="address-line2"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shippingCity}
                  onChange={(e) => setShippingCity(e.target.value)}
                  placeholder="City"
                  maxLength={100}
                  className="flex-1 rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
                  autoComplete="address-level2"
                />
                <input
                  type="text"
                  value={shippingState}
                  onChange={(e) => setShippingState(e.target.value.toUpperCase())}
                  placeholder="State"
                  maxLength={2}
                  className="w-20 rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2 uppercase"
                  autoComplete="address-level1"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={shippingZip}
                  onChange={(e) => setShippingZip(e.target.value)}
                  placeholder="ZIP"
                  maxLength={10}
                  className="w-28 rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
                  autoComplete="postal-code"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-warm-900 dark:text-warm-100">
                Extra line items (shipping, etc.) -- optional
              </label>
              <button
                type="button"
                onClick={addLineItem}
                className="text-sm text-amber-600 dark:text-amber-400 hover:underline"
              >
                + Add line item
              </button>
            </div>
            {lineItems.map((li, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={li.title}
                  onChange={(e) => updateLineItem(idx, 'title', e.target.value)}
                  placeholder="Shipping"
                  className="flex-1 rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={li.amount}
                  onChange={(e) => updateLineItem(idx, 'amount', e.target.value)}
                  placeholder="25.00"
                  className="w-28 rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => removeLineItem(idx)}
                  className="px-2 text-warm-500 hover:text-red-600"
                  aria-label="Remove line item"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-900 dark:text-warm-100 mb-1">
              Payment window
            </label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="w-full sm:w-48 rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-2"
            >
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </div>

          {grandTotalDollars > 0 && (
            <div className="text-sm text-warm-700 dark:text-warm-300 bg-warm-50 dark:bg-gray-700 rounded-md p-3">
              Total: <strong>${grandTotalDollars.toFixed(2)}</strong> &middot; Platform fee
              ({formatFeeRate(tier)}): ${estimatedFee.toFixed(2)} &middot; You'll net{' '}
              ${(grandTotalDollars - estimatedFee).toFixed(2)}
            </div>
          )}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => sendMutation.mutate()}
            className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-warm-300 disabled:cursor-not-allowed text-white font-medium rounded-md px-4 py-2.5"
          >
            {sendMutation.isPending ? 'Sending...' : 'Send Invoice'}
          </button>
        </div>

        {lastResult && (
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-md p-5">
            <h2 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">Last invoice sent</h2>
            <p className="text-sm text-warm-700 dark:text-warm-300 mb-2">
              Total ${(lastResult.totalAmount / 100).toFixed(2)} -- status {lastResult.status}
              {lastResult.linkedExistingAccount ? ' -- linked to an existing FindA.Sale account' : ' -- guest, no account'}
            </p>
            <a
              href={lastResult.checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-amber-600 dark:text-amber-400 hover:underline break-all"
            >
              {lastResult.checkoutUrl}
            </a>
          </div>
        )}

        <div className="mt-6">
          <Link href="/organizer/holds" className="text-sm text-warm-600 dark:text-warm-400 hover:underline">
            &larr; Back to Holds
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SendInvoicePage() {
  return (
    <>
      <Head>
        <title>Email Invoice - FindA.Sale</title>
      </Head>
      <TierGate
        requiredTier="PRO"
        featureName="Email Invoices"
        description="Bill any customer by email -- no hold, no catalog listing, and they don't need a FindA.Sale account. Upgrade to PRO to send one-off invoices like this."
      >
        <SendInvoiceForm />
      </TierGate>
    </>
  );
}
