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
 * TODO: Verify Stripe Identity at $500 lifetime threshold
 * TODO: Track 1099-NEC reporting at $600/yr
 */
export const payConsignorViaACH = async (
  consignorAccountId: string,
  amountCents: number,
  description: string,
  organizerStripeConnectAccountId?: string
) => {
  try {
    const transferData: Stripe.TransferCreateParams = {
      amount: amountCents,
      currency: 'usd',
      destination: consignorAccountId,
      description: description,
    };

    // If organizer has a Stripe Connect account, use it as the source
    if (organizerStripeConnectAccountId) {
      transferData.source_transaction = organizerStripeConnectAccountId;
    }

    const transfer = await stripe().transfers.create(transferData);

    return {
      transferId: transfer.id,
      status: transfer.status,
      amountCents: transfer.amount,
      amountFormatted: (transfer.amount / 100).toFixed(2),
    };
  } catch (error) {
    console.error('Failed to pay consignor via ACH:', error);
    throw error;
  }
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
