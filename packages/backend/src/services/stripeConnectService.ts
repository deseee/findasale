import { getStripe } from '../utils/stripe';
import { prisma } from '../lib/prisma';
import Stripe from 'stripe';

const stripe = () => getStripe();

/**
 * Create a Stripe Express account for a consignor.
 * Returns the accountId.
 */
export const createConnectAccount = async (
  consignor: {
    id: string;
    email?: string | null;
    name: string;
    workspaceId: string;
  },
  accountType: 'standard' | 'express' = 'standard'
) => {
  try {
    // 2026-07-08 fix (findasale-hacker live QA, S1091): requesting `transfers` alone
    // was rejected live by Stripe -- confirmed via real Railway logs on a genuine
    // account-creation attempt: StripeInvalidRequestError, "Your platform needs
    // approval for accounts to have requested the `transfers` capability without the
    // `card_payments` capability." This was NOT a new regression from the vendor-booth
    // feature -- confirmed via DB query that 0 of the 2 existing Consignor rows have
    // ever had a stripeAccountId set, meaning this shared function has never
    // successfully created a real Connect account for anyone. Requesting both
    // capabilities is Stripe's standard unblock; the connected account never actually
    // processes a card charge itself (this platform always charges on the ORGANIZER's
    // stripeConnectId, then Transfers out) so card_payments goes unused but satisfies
    // Stripe's approval requirement. Alternative: contact Stripe support to request
    // transfers-only approval for this platform account (removes the need for this
    // capability entirely) -- flagged for Patrick, not pursued here since it requires
    // Stripe's manual review and this unblocks onboarding today.
    // ADR-020 (2026-07-07, Patrick-approved): Standard accounts make the
    // connected account its own Direct-charge merchant of record — Stripe's own
    // defaults for `type: 'standard'` already are `fees.payer: 'account'`,
    // `stripe_dashboard.type: 'full'`, `requirement_collection: 'stripe'`,
    // `losses.payments: 'stripe'` (all cited in ADR-018/019 against Stripe's own
    // docs) — so `type: 'standard'` alone is sufficient, no `controller` block or
    // `capabilities` request needed (capabilities are self-managed by the vendor's
    // own full Stripe Dashboard on a Standard account, unlike Express). Express
    // accounts keep the existing explicit capability request unchanged — this is
    // an additive branch, not a rewrite of the working Express path.
    const accountData: Stripe.AccountCreateParams =
      accountType === 'standard'
        ? {
            type: 'standard',
            email: consignor.email || undefined,
            metadata: {
              consignorId: consignor.id,
              workspaceId: consignor.workspaceId,
            },
          }
        : {
            type: 'express',
            email: consignor.email || undefined,
            capabilities: {
              transfers: { requested: true },
              card_payments: { requested: true },
            },
            metadata: {
              consignorId: consignor.id,
              workspaceId: consignor.workspaceId,
            },
          };

    const account = await stripe().accounts.create(accountData);

    // 2026-07-08 fix (found via live Railway logs during Maple Lake Mall E2E QA,
    // S1091): this used to persist stripeAccountId to the Consignor table
    // unconditionally, but createConnectAccount is shared by two callers with
    // DIFFERENT owning models -- stripeConnectController.ts (real Consignor rows)
    // and vendorBoothController.ts (VendorBooth rows, passing booth.id as the
    // `id` field). Since no Consignor row exists with id === booth.id, the
    // prisma.consignor.update() below threw P2025 "Record to update not found"
    // for every VendorBooth onboarding attempt -- confirmed via real Railway
    // deploy logs showing the exact PrismaClientKnownRequestError at this line.
    // Persistence is now the CALLER's responsibility (each caller knows its own
    // model). stripeConnectController.ts updated to persist to Consignor itself;
    // vendorBoothController.ts already persisted to VendorBooth separately.
    return account.id;
  } catch (error) {
    console.error('Failed to create Stripe Connect account:', error);
    throw error;
  }
};

/**
 * ADR-023: Create a NEW Standard account for an organizer currently on Express,
 * eligible for Stripe's Networked Onboarding reuse offer -- so the account
 * holder gets a one-click "use my existing verified info" option instead of
 * re-entering business/bank/identity data.
 *
 * Eligibility rule (confirmed against docs.stripe.com/connect/networked-onboarding
 * this session, ADR-022/023): prefilling the individual field, company.address,
 * external_accounts, or any owners/directors/executives field on the NEW
 * account DISQUALIFIES it from the reuse offer. This function therefore only
 * prefills business_type/country/company.name -- deliberately NOT address,
 * NOT individual, NOT bank details. Those get filled in by the one-click reuse
 * itself once the account holder confirms on Stripe's hosted page.
 *
 * Caller is responsible for persisting the returned account id to
 * Organizer.pendingStripeMigrationAccountId -- never to stripeConnectId
 * directly (that cutover only happens once the webhook confirms the new
 * account is actually live, see stripeController.ts account.updated).
 */
export const createStandardMigrationAccount = async (
  oldAccountId: string,
  organizerId: string
) => {
  try {
    const oldAccount = await stripe().accounts.retrieve(oldAccountId);

    const accountData: Stripe.AccountCreateParams = {
      type: 'standard',
      country: oldAccount.country || undefined,
      business_type: oldAccount.business_type || undefined,
      company: oldAccount.company?.name ? { name: oldAccount.company.name } : undefined,
      email: oldAccount.email || undefined,
      metadata: {
        organizerId,
        migrationFromAccountId: oldAccountId,
        migrationType: 'express-to-standard',
      },
    };

    const newAccount = await stripe().accounts.create(accountData);
    return newAccount.id;
  } catch (error) {
    console.error('Failed to create Stripe standard migration account:', error);
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
      // ADR-021 (2026-07-08): the real Stripe account type (`'express'` |
      // `'standard'` | ...) -- used by the VendorBooth account-reuse resolution
      // to record what an existing (possibly-reused) account actually is, rather
      // than defaulting/assuming.
      accountType: account.type,
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
