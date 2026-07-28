/**
 * Vendor Booth Payments — Organizer Multi-Booth Cart / Register (2026-07-07,
 * ADR-015/016/017; sequential per-booth checkout added 2026-07-08, ADR-020).
 * Roaming cart that can scan/select items from ANY booth in this hub in one
 * checkout. Functional over polished — correctness and full state coverage
 * prioritized over visual polish.
 *
 * ADR-020: each vendor booth is now its own Stripe Standard account (Direct
 * charge, its own merchant of record) — so a cart spanning N booths requires N
 * separate PaymentIntents instead of one combined charge. The shopper still taps
 * their card once per booth (still genuinely card-present every time — no fee/
 * liability-shift penalty), and once every booth has authorized, ALL legs are
 * captured together in one step. If any leg can't be resolved, the WHOLE cart
 * cancels (free, nothing was captured yet) and the cashier restarts a new cart
 * without the problem vendor's items — v1 behavior Patrick signed off on, not
 * partial-capture/split-transaction.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import TierGate from '../../../../components/TierGate';
import HubManagementNav from '../../../../components/HubManagementNav';

interface CartTransaction {
  id: string;
  hubId: string;
  totalAmount: string | number;
  boothsRepresented: string[];
  status: string;
}

interface BoothSummary {
  vendorBoothId: string;
  vendorName: string;
  boothNumber: string;
  subtotalCents: number;
  itemCount: number;
  readyForStandardCharge: boolean;
  leg: { legId: string; status: string; rail: string } | null;
}

type BoothLegOutcome = 'pending' | 'connecting' | 'ready' | 'tapping' | 'authorized' | 'failed';

/**
 * One failure, in words a cashier can act on (2026-07-28).
 * Before this, every failure on this page collapsed to one string. "Failed to start
 * register session" was shown for a 403 you can never fix by retrying, a 404 for a
 * market that does not exist, and a dropped WiFi connection alike. The server's own
 * reason was thrown away: the backend middleware answers with `message`
 * (requireBoothAuth.ts) while this page only ever read `data.error`.
 *
 * `canRetry` is the important field. A 403 will never fix itself, so no Try again
 * button is offered on one. A button that can only ever fail teaches people to jab at a
 * dead control and then give up on the whole product.
 */
interface Failure {
  title: string;
  detail: string;
  canRetry: boolean;
  retryLabel?: string;
  href?: string;
  hrefLabel?: string;
}

/** Pull the server's own words out, whichever key it used. */
const serverMessage = (error: any): string | null => {
  const data = error?.response?.data;
  if (!data) return null;
  const raw = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : null;
  const trimmed = raw ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
};

/** Turn any thrown error into something readable at a busy counter. */
const describeFailure = (error: any, retryLabel: string): Failure => {
  // No HTTP response at all means the request never reached the server: a dead WiFi
  // access point, a phone that dropped to no bars, airplane mode.
  if (!error?.response) {
    return {
      title: 'No internet right now',
      detail: 'Your phone is not connected. Check the WiFi or your cell signal, then try again. No card was charged.',
      canRetry: true,
      retryLabel,
    };
  }

  const status = error.response.status;
  const code = error.response.data?.code;
  const message = serverMessage(error);

  if (status === 401) {
    return {
      title: 'You are signed out',
      detail: 'Your sign in ran out. Sign in again, then open the register.',
      canRetry: false,
      href: '/login',
      hrefLabel: 'Sign in',
    };
  }

  if (status === 403 && code === 'NOT_TEAM_MEMBER') {
    return {
      title: 'You are not on this market\u2019s team',
      detail: 'The register opens for the market owner and the staff they have added. Ask the market owner to add you to their team. Then open this page again.',
      canRetry: false,
      href: '/organizer/members',
      hrefLabel: 'See team members',
    };
  }

  if (status === 403 && code === 'NO_WORKSPACE') {
    return {
      title: 'This market has no team yet',
      detail: 'The register needs a team before it can open. The market owner can add one on the Team Members page, then come back here.',
      canRetry: false,
      href: '/organizer/members',
      hrefLabel: 'Go to Team Members',
    };
  }

  if (status === 403) {
    return {
      title: 'You cannot do that here',
      detail: message || 'You do not have permission for this. Ask the market owner to check your access.',
      canRetry: false,
    };
  }

  if (status === 404 && code === 'HUB_NOT_FOUND') {
    return {
      title: 'We cannot find this market',
      detail: 'It may have been deleted, or the link is wrong. Go back to your markets and open it from the list.',
      canRetry: false,
      href: '/organizer/hubs',
      hrefLabel: 'Back to my markets',
    };
  }

  if (status === 404) {
    return {
      title: 'That is gone',
      detail: message || 'We could not find it. Start a new cart.',
      canRetry: false,
    };
  }

  if (status === 409) {
    return {
      title: 'Wait a moment',
      detail: message || 'Something else is using this cart right now. Wait a few seconds, then try again.',
      canRetry: true,
      retryLabel,
    };
  }

  if (status === 429) {
    return {
      title: 'Too many tries',
      detail: 'Wait about a minute, then try again.',
      canRetry: true,
      retryLabel,
    };
  }

  if (status >= 500) {
    return {
      title: 'Something went wrong on our end',
      detail: 'This one is our fault, not yours. Wait a moment and try again. No card was charged.',
      canRetry: true,
      retryLabel,
    };
  }

  return {
    title: 'That did not work',
    detail: message || 'Something unexpected happened. Try again. If it keeps happening, call for help.',
    canRetry: true,
    retryLabel,
  };
};

const BoothCartPage: React.FC = () => {
  const router = useRouter();
  const { hubId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [cart, setCart] = useState<CartTransaction | null>(null);
  const [itemIdInput, setItemIdInput] = useState('');
  const [addedItems, setAddedItems] = useState<Array<{ itemId: string; title: string; price: number }>>([]);
  const [rejectedItems, setRejectedItems] = useState<Array<{ itemId: string; reason: string }>>([]);
  const [starting, setStarting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [startFailure, setStartFailure] = useState<Failure | null>(null);

  // ─── Sequential per-booth checkout state (ADR-020) ─────────────────────────
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutFailure, setCheckoutFailure] = useState<Failure | null>(null);
  // A capture failure is its own state. The money may already be authorized on the
  // customer's card, so the way out is "try to finish again" (the server treats a repeat
  // capture as safe: vendorBoothCartController.ts:1123 returns success for a cart that
  // already completed, and :1140 explicitly keeps retries unblocked), NOT "start over".
  const [captureFailed, setCaptureFailed] = useState(false);
  const [addFailure, setAddFailure] = useState<Failure | null>(null);
  const [booths, setBooths] = useState<BoothSummary[]>([]);
  const [boothOutcomes, setBoothOutcomes] = useState<Record<string, BoothLegOutcome>>({});
  const [activeBoothIndex, setActiveBoothIndex] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [completed, setCompleted] = useState<{ itemsSold: number } | null>(null);
  const terminalRef = useRef<any>(null);

  const startCart = async () => {
    if (!hubId || typeof hubId !== 'string') return;
    setStarting(true);
    setStartFailure(null);
    try {
      const response = await api.post(`/organizer/hubs/${hubId}/cart/start`, { cashierType: 'TEAM_MEMBER' });
      setCart(response.data);
    } catch (error: any) {
      console.error('Error starting cart:', error);
      setStartFailure(describeFailure(error, 'Try again'));
    } finally {
      setStarting(false);
    }
  };

  // Open exactly ONE register session per hub per visit. Without this guard, any change
  // to the `user` object identity re-ran startCart and left another PENDING
  // BoothCartTransaction row open on the hub that nobody can see or close.
  const autoStartedForHub = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !hubId || typeof hubId !== 'string') return;
    if (autoStartedForHub.current === hubId) return;
    autoStartedForHub.current = hubId;
    startCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hubId]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  // `e` is optional so the failure card's retry button can call this directly with the
  // item ID still in the box (the input is only cleared on success).
  const handleAddItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!cart || !itemIdInput.trim()) return;
    setAdding(true);
    setAddFailure(null);
    try {
      const response = await api.post(
        `/organizer/hubs/${hubId}/cart/${cart.id}/items`,
        { itemIds: [itemIdInput.trim()] }
      );
      setCart(response.data.cart);
      setAddedItems((prev) => [...prev, ...(response.data.accepted || [])]);
      if (response.data.rejected?.length > 0) {
        setRejectedItems((prev) => [...prev, ...response.data.rejected]);
        // A toast disappears. The reason also goes into the cart card below, where it
        // stays on screen until the cashier starts a new cart.
        showToast('That item was not added. See the reason under the cart.', 'error');
      } else {
        showToast('Item added to cart', 'success');
      }
      setItemIdInput('');
    } catch (error: any) {
      console.error('Error adding item:', error);
      const failure = describeFailure(error, 'Try adding it again');
      setAddFailure(failure);
      showToast(failure.title, 'error');
    } finally {
      setAdding(false);
    }
  };

  // ─── Sequential per-booth checkout (ADR-020) ────────────────────────────────

  /** Connects (or reconnects) the Terminal SDK reader scoped to ONE booth's own
   *  Standard account. Each booth leg needs its OWN connection token — switching
   *  which connected account a physical reader processes for requires a fresh
   *  token (per docs.stripe.com/terminal/features/connect, direct-charge model:
   *  "the client SDKs create the PaymentIntent on the same connected account the
   *  ConnectionToken belongs to"). */
  const connectReaderForBooth = useCallback(async (vendorBoothId: string) => {
    const { loadStripeTerminal } = await import('@stripe/terminal-js');
    const StripeTerminal = await loadStripeTerminal();

    // Disconnect any previous booth's reader connection before switching accounts.
    if (terminalRef.current) {
      try {
        await terminalRef.current.disconnectReader();
      } catch (err) {
        console.warn('[cart] Failed to disconnect previous reader (non-fatal):', err);
      }
      terminalRef.current = null;
    }

    const terminal = StripeTerminal!.create({
      onFetchConnectionToken: async () => {
        const res = await api.post<{ secret: string }>(
          `/organizer/hubs/${hubId}/cart/${cart!.id}/terminal/connection-token`,
          { vendorBoothId }
        );
        return res.data.secret;
      },
      onUnexpectedReaderDisconnect: () => {
        showToast('The card reader disconnected.', 'error');
        setCheckoutFailure({
          title: 'The card reader disconnected',
          detail: 'Check that the reader is switched on and on the same WiFi as this phone. No card was charged. Start a new cart once the reader is back.',
          canRetry: false,
        });
      },
    });

    const discoverResult = await terminal.discoverReaders({
      simulated: process.env.NEXT_PUBLIC_STRIPE_TERMINAL_SIMULATED === 'true',
    });
    if ('error' in discoverResult) throw new Error(discoverResult.error.message);
    if (!discoverResult.discoveredReaders.length) {
      throw new Error('No readers found. Ensure the card reader is powered on and on the same WiFi network.');
    }

    const connectResult = await terminal.connectReader(discoverResult.discoveredReaders[0]);
    if ('error' in connectResult) throw new Error(connectResult.error.message);

    terminalRef.current = terminal;
    return terminal;
  }, [hubId, cart, showToast]);

  /** Runs ONE booth's leg: connect reader for that booth -> authorize (server
   *  creates the card_present manual-capture PaymentIntent on that booth's own
   *  account) -> physical tap -> processPayment. Advances to the next booth on
   *  success; on failure, cancels the WHOLE cart (whole-cart-cancel-and-restart,
   *  per Patrick's v1 sign-off — no partial-capture). */
  const runBoothLeg = useCallback(async (booth: BoothSummary) => {
    setBoothOutcomes((prev) => ({ ...prev, [booth.vendorBoothId]: 'connecting' }));
    try {
      const terminal = await connectReaderForBooth(booth.vendorBoothId);

      const authRes = await api.post(
        `/organizer/hubs/${hubId}/cart/${cart!.id}/terminal/authorize`,
        { vendorBoothId: booth.vendorBoothId }
      );
      const { clientSecret } = authRes.data;

      setBoothOutcomes((prev) => ({ ...prev, [booth.vendorBoothId]: 'ready' }));
      showToast(`Tap card for ${booth.vendorName} — $${(booth.subtotalCents / 100).toFixed(2)}`, 'success');

      setBoothOutcomes((prev) => ({ ...prev, [booth.vendorBoothId]: 'tapping' }));
      const collectResult = await terminal.collectPaymentMethod(clientSecret);
      if ('error' in collectResult) throw new Error(collectResult.error.message);

      const processResult = await terminal.processPayment(collectResult.paymentIntent);
      if ('error' in processResult) throw new Error(processResult.error.message);

      setBoothOutcomes((prev) => ({ ...prev, [booth.vendorBoothId]: 'authorized' }));
      return true;
    } catch (error: any) {
      console.error(`[cart] Booth leg failed for ${booth.vendorBoothId}:`, error);
      setBoothOutcomes((prev) => ({ ...prev, [booth.vendorBoothId]: 'failed' }));
      const failure = describeFailure(error, 'Try again');
      setCheckoutFailure({
        title: `The payment for ${booth.vendorName} did not go through`,
        // A Stripe Terminal error is thrown as a plain Error with no HTTP response, so
        // describeFailure would read it as an offline blip. Prefer the reader's own words
        // when there is no server response to explain it.
        detail: error?.response
          ? failure.detail
          : `${error?.message || 'The card was not accepted.'} No card was charged. This cart is closing. Start a new cart without this vendor\u2019s items.`,
        canRetry: false,
      });
      return false;
    }
  }, [connectReaderForBooth, hubId, cart, showToast]);

  const startSequentialCheckout = async () => {
    if (!cart) return;
    setCheckoutLoading(true);
    setCheckoutFailure(null);
    setCaptureFailed(false);
    try {
      const summaryRes = await api.get(`/organizer/hubs/${hubId}/cart/${cart.id}/summary`);
      const boothList: BoothSummary[] = summaryRes.data.booths || [];
      if (boothList.length === 0) {
        setCheckoutFailure({
          title: 'The cart is empty',
          detail: 'Scan or type an item ID first, then take payment.',
          canRetry: false,
        });
        setCheckoutLoading(false);
        return;
      }
      const notReady = boothList.find((b) => !b.readyForStandardCharge);
      if (notReady) {
        setCheckoutFailure({
          title: `${notReady.vendorName} cannot be paid yet`,
          detail: `${notReady.vendorName} has not finished setting up their payouts, so their items cannot be sold here. Start a new cart without their items, or ask them to finish their setup.`,
          canRetry: false,
        });
        setCheckoutLoading(false);
        return;
      }
      setBooths(boothList);
      setBoothOutcomes(Object.fromEntries(boothList.map((b) => [b.vendorBoothId, 'pending' as BoothLegOutcome])));
      setActiveBoothIndex(0);
      setCheckoutOpen(true);
      setCheckoutLoading(false);

      // Walk the booths sequentially — tap, tap, tap, done.
      for (let i = 0; i < boothList.length; i++) {
        setActiveBoothIndex(i);
        const ok = await runBoothLeg(boothList[i]);
        if (!ok) {
          await cancelCart();
          return;
        }
      }

      // Every leg authorized — capture all together.
      await captureAll();
    } catch (error: any) {
      console.error('[cart] Failed to start checkout:', error);
      setCheckoutFailure(describeFailure(error, 'Try payment again'));
      setCheckoutLoading(false);
    }
  };

  const captureAll = async () => {
    if (!cart) return;
    setCapturing(true);
    setCheckoutFailure(null);
    try {
      const res = await api.post(`/organizer/hubs/${hubId}/cart/${cart.id}/capture`, {});
      setCompleted({ itemsSold: res.data.itemsSold ?? 0 });
      setCaptureFailed(false);
      showToast('Sale complete!', 'success');
    } catch (error: any) {
      console.error('[cart] Capture failed:', error);
      const failure = describeFailure(error, 'Try to finish the sale again');
      // The card has already been approved by this point. Never tell the cashier to
      // start over here: that leaves an authorized payment behind and invites a second
      // charge. Finishing again is safe and is the only correct next step.
      setCaptureFailed(true);
      setCheckoutFailure({
        title: 'The sale did not finish',
        detail: `${failure.detail} The card was approved but the sale is not closed yet. Do not charge the customer again. Press the button below to finish it.`,
        canRetry: true,
        retryLabel: 'Try to finish the sale again',
      });
    } finally {
      setCapturing(false);
    }
  };

  const cancelCart = async () => {
    if (!cart) return;
    try {
      await api.post(`/organizer/hubs/${hubId}/cart/${cart.id}/cancel`, {});
      showToast('Checkout cancelled. No card was charged.', 'error');
    } catch (error: any) {
      // Do NOT claim the cart was cancelled when it was not. A cart that failed to
      // cancel still holds its items as reserved, so they will not show as for sale
      // until it closes properly.
      console.error('[cart] Failed to cancel cart:', error);
      const failure = describeFailure(error, 'Try to close this cart again');
      setCheckoutFailure({
        title: 'This cart did not close',
        detail: `${failure.detail} The items in it are still held and will not show as for sale until this cart closes.`,
        canRetry: true,
        retryLabel: 'Try to close this cart again',
      });
    }
  };

  const resetForNewCart = () => {
    setCart(null);
    setAddedItems([]);
    setRejectedItems([]);
    setCheckoutOpen(false);
    setCheckoutFailure(null);
    setCaptureFailed(false);
    setAddFailure(null);
    setBooths([]);
    setBoothOutcomes({});
    setCompleted(null);
    startCart();
  };

  /**
   * One consistent way to show a failure: big text, big buttons, high contrast, and a
   * next action that can actually work. Replaces the bare red sentence this page used.
   */
  const FailureCard: React.FC<{ failure: Failure; onRetry?: () => void; busy?: boolean }> = ({
    failure,
    onRetry,
    busy,
  }) => (
    <div
      role="alert"
      className="bg-red-50 dark:bg-red-950 border-2 border-red-600 dark:border-red-500 rounded-xl p-6 mb-6"
    >
      <p className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">{failure.title}</p>
      <p className="text-base leading-relaxed text-red-900 dark:text-red-100 mb-5">{failure.detail}</p>
      {failure.canRetry && onRetry && (
        <button
          onClick={onRetry}
          disabled={busy}
          className="w-full min-h-[56px] bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-lg font-bold py-3 px-4 rounded-lg transition-colors"
        >
          {busy ? 'Working...' : failure.retryLabel || 'Try again'}
        </button>
      )}
      {failure.href && (
        <Link
          href={failure.href}
          className="block w-full min-h-[56px] text-center bg-white dark:bg-gray-800 border-2 border-red-700 dark:border-red-400 text-red-800 dark:text-red-200 text-lg font-bold py-3 px-4 rounded-lg mt-3"
        >
          {failure.hrefLabel || 'Go'}
        </Link>
      )}
    </div>
  );

  if (authLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }
  if (!user) {
    return null;
  }

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Vendor Booth Register"
      description="Ring up items from any booth in this hub in one checkout. Available on TEAMS and above."
    >
      <Head>
        <title>Register | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/organizer/hubs"
            className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium mb-6 inline-block"
          >
            ← Back to Hubs
          </Link>

          {hubId && typeof hubId === 'string' && <HubManagementNav hubId={hubId} />}

          <h1 className="text-3xl font-bold text-warm-900 dark:text-white mb-2">Multi-Booth Register</h1>
          <p className="text-warm-600 dark:text-warm-400 mb-8">
            Scan or enter item IDs from any booth in this hub. Each booth is billed separately — the
            customer taps their card once per booth represented in the cart.
          </p>

          {starting ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
              <p className="text-warm-600 dark:text-warm-400">Opening register session...</p>
            </div>
          ) : startFailure ? (
            <FailureCard failure={startFailure} onRetry={startCart} busy={starting} />
          ) : !cart ? (
            // Dead end before this change: the page said "No active register session"
            // and gave no way to open one.
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
              <p className="text-lg text-warm-700 dark:text-warm-300 mb-5">The register is not open.</p>
              <button
                onClick={startCart}
                disabled={starting}
                className="w-full min-h-[56px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-lg font-bold py-3 px-4 rounded-lg transition-colors"
              >
                {starting ? 'Opening...' : 'Open the register'}
              </button>
            </div>
          ) : completed ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-8 text-center">
              <p className="text-green-700 dark:text-green-400 font-bold text-xl mb-2">Sale complete</p>
              <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                {completed.itemsSold} item(s) sold across {booths.length} booth(s). Receipt sent if an email was on file.
              </p>
              <button
                onClick={resetForNewCart}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Start new cart
              </button>
            </div>
          ) : checkoutOpen ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-6">
              <h2 className="text-lg font-bold text-warm-900 dark:text-white mb-4">Checkout — tap once per booth</h2>
              <ul className="space-y-3 mb-4">
                {booths.map((booth, idx) => {
                  const outcome = boothOutcomes[booth.vendorBoothId] || 'pending';
                  const isActive = idx === activeBoothIndex && !completed;
                  return (
                    <li
                      key={booth.vendorBoothId}
                      className={`p-3 rounded-lg border ${isActive ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-warm-200 dark:border-gray-700'}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-warm-900 dark:text-white">
                          {booth.vendorName}{booth.boothNumber ? ` (Booth ${booth.boothNumber})` : ''}
                        </span>
                        <span className="font-bold text-warm-700 dark:text-warm-300">${(booth.subtotalCents / 100).toFixed(2)}</span>
                      </div>
                      <div className="text-xs mt-1">
                        {outcome === 'pending' && <span className="text-warm-500">Waiting...</span>}
                        {outcome === 'connecting' && <span className="text-blue-600">Connecting to reader...</span>}
                        {outcome === 'ready' && <span className="text-blue-600 font-bold">Tap card now</span>}
                        {outcome === 'tapping' && <span className="text-blue-600">Processing tap...</span>}
                        {outcome === 'authorized' && <span className="text-green-600">Authorized ✓</span>}
                        {outcome === 'failed' && <span className="text-red-600">Failed</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {capturing && (
                <p className="text-center text-blue-600 font-bold mb-4">Finalizing sale — capturing all booths...</p>
              )}
              {/* Capture failures retry the capture, which is safe and the only correct
                  move once the card is approved. Everything else retries the close. */}
              {checkoutFailure && (
                <FailureCard
                  failure={checkoutFailure}
                  onRetry={captureFailed ? captureAll : cancelCart}
                  busy={capturing}
                />
              )}
              {checkoutFailure && !captureFailed && (
                <button
                  onClick={resetForNewCart}
                  className="w-full min-h-[56px] bg-warm-700 hover:bg-warm-800 text-white text-lg font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  Start a new cart
                </button>
              )}
            </div>
          ) : (
            <>
              <form onSubmit={handleAddItem} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-6">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-2">
                  Item ID (scan or type)
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={itemIdInput}
                    onChange={(e) => setItemIdInput(e.target.value)}
                    className="flex-1 border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white"
                    placeholder="Enter item ID"
                    aria-label="Item ID"
                    disabled={adding || cart.status !== 'PENDING'}
                  />
                  <button
                    type="submit"
                    disabled={adding || !itemIdInput.trim() || cart.status !== 'PENDING'}
                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    {adding ? 'Adding...' : 'Add'}
                  </button>
                </div>
                {cart.status !== 'PENDING' && (
                  // Before this the box just went grey with no explanation, which reads
                  // as a broken page.
                  <p className="mt-3 text-base text-warm-700 dark:text-warm-300">
                    This cart is already in checkout, so no more items can go in it. Finish it or start a new cart.
                  </p>
                )}
              </form>

              {addFailure && (
                <FailureCard failure={addFailure} onRetry={() => handleAddItem()} busy={adding} />
              )}

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-6">
                <h2 className="text-lg font-bold text-warm-900 dark:text-white mb-4">Cart</h2>
                {addedItems.length === 0 ? (
                  <p className="text-warm-500 dark:text-warm-400 text-sm">No items added yet</p>
                ) : (
                  <ul className="divide-y divide-warm-200 dark:divide-gray-700">
                    {addedItems.map((item, idx) => (
                      <li key={`${item.itemId}-${idx}`} className="py-2 flex justify-between text-sm">
                        <span className="text-warm-900 dark:text-white">{item.title}</span>
                        <span className="text-warm-700 dark:text-warm-300 font-bold">${Number(item.price).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {rejectedItems.length > 0 && (
                  // The server sends a per-item reason. Showing only a count threw it
                  // away and left the cashier guessing which item and why.
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-950 border-2 border-red-600 dark:border-red-500 rounded-lg">
                    <p className="text-base font-bold text-red-900 dark:text-red-100 mb-2">
                      {rejectedItems.length === 1 ? '1 item was not added' : `${rejectedItems.length} items were not added`}
                    </p>
                    <ul className="space-y-1">
                      {rejectedItems.map((r, idx) => (
                        <li key={`${r.itemId}-${idx}`} className="text-base text-red-900 dark:text-red-100">
                          {r.itemId}: {r.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-700 flex justify-between items-center">
                  <span className="font-bold text-warm-900 dark:text-white">Total</span>
                  <span className="text-xl font-bold text-warm-900 dark:text-white">
                    ${Number(cart.totalAmount).toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 text-xs text-warm-500 dark:text-warm-400">
                  {cart.boothsRepresented.length} booth(s) represented in this cart — the customer will tap their
                  card once per booth during checkout.
                </div>
              </div>

              {checkoutFailure && (
                <FailureCard
                  failure={checkoutFailure}
                  onRetry={startSequentialCheckout}
                  busy={checkoutLoading}
                />
              )}

              <button
                onClick={startSequentialCheckout}
                disabled={checkoutLoading || addedItems.length === 0 || cart.status !== 'PENDING'}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                {checkoutLoading ? 'Starting checkout...' : `Checkout $${Number(cart.totalAmount).toFixed(2)} (${cart.boothsRepresented.length} booth tap${cart.boothsRepresented.length === 1 ? '' : 's'})`}
              </button>
            </>
          )}
        </div>
      </div>
    </TierGate>
  );
};

export default BoothCartPage;
