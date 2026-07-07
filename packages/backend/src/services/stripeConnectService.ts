import { getStripe } from '../utils/stripe';
import { prisma } from '../lib/prisma';
import Stripe from 'stripe';

const stripe = () => getStripe();

/**
 * Create a Stripe Express account for a consignor.
 * Returns the accountId.
 */
export const createConnectAccount = async (consignor: {
  id: string;
  email?: string | null;
  name: string;
  workspaceId: string;
}) => {
  try {
    const accountData: Stripe.AccountCreateParams = {
      type: 'express',
      email: consignor.email || undefined,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        consignorId: consignor.id,
        workspaceId: consignor.workspaceId,
      },
    };

    const account = await stripe().accounts.create(accountData);

    // Store the account ID
    await prisma.consignor.update({
      where: { id: consignor.id },
      data: { stripeAccountId: account.id },
    });

    return account.id;
  } catch (error) {
    console.error('Failed to create Stripe Connect account:', error);
    throw error;
  }
};

/**
 * Create a Stripe account onboarding link.
 * Returns the onboarding URL.
 */
export const createOnboardingLink = async (
  accountId: string,
  returnUrl: string,
  refreshUrl: string
) => {
  try {
    const link = await stripe().accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });

    return link.url;
  } catch (error) {
    console.error('Failed to create onboarding link:', error);
    throw error;
  }
};

/**
 * Get the onboarding status of a Stripe Express account.
 * Returns true if charges_enabled (fully onboarded).
 */
export const getAccountStatus = async (accountId: string) => {
  try {
    const account = await stripe().accounts.retrieve(accountId);
    return {
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      status: account.requirements?.current_deadline ? 'PENDING' : 'COMPLETE',
      requirements: account.requirements,
    };
  } catch (error) {
    console.error('Failed to get account status:', error);
    throw error;
  }
};

/**
 * Pay a consignor via ACH using Stripe Transfers.
 * TODO (compliance): Verify Stripe Identity at $500 lifetime threshold
 * TODO (compliance): Track 1099-NEC reporting at $600/yr
 *
 * PRE-EXISTING BUG FIX (2026-07-07, ADR-017 P0 finding, findasale-hacker
 * re-verification): this function used to set
 * `transferData.source_transaction = organizerStripeConnectAccountId` — an
 * `acct_...` value — where Stripe's Transfer API requires a charge ID
 * (`ch_...`). `source_transaction` is OPTIONAL per Stripe's own API docs
 * (confirmed via docs.stripe.com/api/transfers/create this session): omitting
 * it is always safe and simply draws from the general available balance
 * instead of tying the transfer to one specific pending charge.
 *
 * Neither of this function's two existing callers (consignorSettlementController.ts
 * ~line 332, stripeConnectController.ts ~line 201) currently has a specific
 * PaymentIntent/charge to attribute the payout to — both compute a payout from
 * aggregate net proceeds across possibly-many sales/items, not one charge. The
 * correct fix here is therefore to accept an OPTIONAL real charge ID
 * (`sourceChargeId`, a `ch_...` value the caller must resolve itself, e.g. via
 * `stripe().paymentIntents.retrieve(piId, {...}).latest_charge`) and only set
 * `source_transaction` when a genuine charge ID is supplied — never pass an
 * account ID, and never guess one. This is NOT blocking any current call site
 * (both pass no charge ID today, so both simply stop mis-setting the field);
 * a caller that later wants "pending balance" transfer-before-settlement
 * behavior can start passing a real charge ID once it has one available.
 * Gated behind STRIPE_CONNECT_LIVE_TRANSFERS (default OFF) — filed separately
 * from the VendorBoothPayout feature per ADR-017 Dev Instructions #5.
 */
export const payConsignorViaACH = async (
  consignorAccountId: string,
  amountCents: number,
  description: string,
  organizerStripeConnectAccountId?: string,
  sourceChargeId?: string
) => {
  try {
    const transferData: Stripe.TransferCreateParams = {
      amount: amountCents,
      currency: 'usd',
      destination: consignorAccountId,
      description: description,
    };

    // Only set source_transaction when a REAL charge ID (ch_...) is supplied.
    // NEVER pass organizerStripeConnectAccountId (an acct_... value) here — that
    // was the pre-existing bug. organizerStripeConnectAccountId is intentionally
    // unused for source_transaction now; kept as a parameter for call-site
    // backward compatibility (existing callers still pass it) but no longer
    // consulted for this purpose.
    if (sourceChargeId) {
      transferData.source_transaction = sourceChargeId;
    }

    const transfer = await stripe().transfers.create(transferData);

    return {
      transferId: transfer.id,
      status: (transfer as any).status,
      amountCents: transfer.amount,
      amountFormatted: (transfer.amount / 100).toFixed(2),
    };
  } catch (error) {
    console.error('Failed to pay consignor via ACH:', error);
    throw error;
  }
};

/**
 * Pay a VendorBooth via Stripe Transfer, drawing from the organizer's connected
 * account balance (2026-07-07, ADR-016/017).
 *
 * CORRECTED source_transaction logic (ADR-017): retrieves the real charge ID
 * from the PaymentIntent BEFORE setting source_transaction — never passes an
 * account ID. This is the pattern payConsignorViaACH should have used from the
 * start; written as a new function (not a clone of payConsignorViaACH) per
 * ADR-017 Dev Instructions #4 since VendorBooth needs this from day one while
 * payConsignorViaACH's existing callers are fixed separately/non-blockingly above.
 *
 * The Transfer is created WITH the { stripeAccount: organizerStripeConnectId }
 * request option — it originates from the ORGANIZER's connected-account balance
 * (where the cart charge actually landed, confirmed via posPaymentController read),
 * not the platform's balance. This matches Stripe's documented "separate charges
 * and transfers" pattern for one customer charge fanning out to multiple
 * connected accounts (confirmed via docs.stripe.com/connect/separate-charges-and-transfers).
 */
export const payVendorBoothViaTransfer = async (params: {
  vendorBoothStripeAccountId: string;
  amountCents: number;
  description: string;
  organizerStripeConnectId: string;
  cartPaymentIntentId: string; // the BoothCartTransaction's stripePaymentIntentId
  transferGroup?: string;
}) => {
  const {
    vendorBoothStripeAccountId,
    amountCents,
    description,
    organizerStripeConnectId,
    cartPaymentIntentId,
    transferGroup,
  } = params;

  // Retrieve the real charge ID from the PaymentIntent BEFORE setting
  // source_transaction. NEVER pass an account ID (organizerStripeConnectId) as
  // source_transaction — that is the exact bug this function exists to avoid.
  const pi = await stripe().paymentIntents.retrieve(cartPaymentIntentId, {
    stripeAccount: organizerStripeConnectId,
  });
  const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;

  const transferData: Stripe.TransferCreateParams = {
    amount: amountCents,
    currency: 'usd',
    destination: vendorBoothStripeAccountId,
    description,
    ...(transferGroup ? { transfer_group: transferGroup } : {}),
    ...(chargeId ? { source_transaction: chargeId } : {}),
  };

  const transfer = await stripe().transfers.create(transferData, {
    stripeAccount: organizerStripeConnectId,
  });

  return {
    transferId: transfer.id,
    status: (transfer as any).status,
    amountCents: transfer.amount,
    amountFormatted: (transfer.amount / 100).toFixed(2),
  };
};

/**
 * Update consignor onboarding status based on Stripe account status.
 */
export const updateConsignorOnboardingStatus = async (
  consignorId: string,
  accountId: string
) => {
  try {
    const status = await getAccountStatus(accountId);

    await prisma.consignor.update({
      where: { id: consignorId },
      data: {
        stripeOnboarded: status.chargesEnabled,
      },
    });

    return status;
  } catch (error) {
    console.error('Failed to update onboarding status:', error);
    throw error;
  }
};
