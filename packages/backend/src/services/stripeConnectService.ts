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
 * ADR-024: Manual (non-reuse-eligible) fallback for the Networked Onboarding
 * migration path above. Root-caused 2026-07-08: Stripe's own hosted
 * account-linking step (triggered after SMS 2FA, when the account holder
 * selects a Google account to confirm the reuse offer) fails with an
 * undocumented "Multi region routing target not found" error -- confirmed
 * Stripe-side (our request params match docs.stripe.com/connect/networked-onboarding
 * exactly; the error occurs entirely within Stripe's hosted domain, no code
 * of ours runs between account-link creation and the error). This function
 * deliberately prefills `company.address` (copied live from the OLD account --
 * never client-submitted) which per Stripe's own eligibility docs DISQUALIFIES
 * the new account from the reuse offer, so the buggy Google-linking step is
 * never shown at all. Trade-off: the organizer must manually re-enter their
 * bank account afterward (Stripe never exposes full bank account numbers via
 * the API, so that specific field can't be prefilled either way) -- a few
 * minutes of manual entry instead of a permanent block.
 */
export const createStandardMigrationAccountManual = async (
  oldAccountId: string,
  organizerId: string
) => {
  try {
    const oldAccount = await stripe().accounts.retrieve(oldAccountId);

    const accountData: Stripe.AccountCreateParams = {
      type: 'standard',
      country: oldAccount.country || undefined,
      business_type: oldAccount.business_type || undefined,
      company: oldAccount.company
        ? {
            name: oldAccount.company.name || undefined,
            address: oldAccount.company.address
              ? {
                  city: oldAccount.company.address.city || undefined,
                  country: oldAccount.company.address.country || undefined,
                  line1: oldAccount.company.address.line1 || undefined,
                  line2: oldAccount.company.address.line2 || undefined,
                  postal_code: oldAccount.company.address.postal_code || undefined,
                  state: oldAccount.company.address.state || undefined,
                }
              : undefined,
          }
        : undefined,
      email: oldAccount.email || undefined,
      metadata: {
        organizerId,
        migrationFromAccountId: oldAccountId,
        migrationType: 'express-to-standard-manual',
      },
    };

    const newAccount = await stripe().accounts.create(accountData);
    return newAccount.id;
  } catch (error) {
    console.error('Failed to create Stripe standard migration account (manual):', error);
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
      // ADR 1 (2026-07-11, stripe-migration-reconciliation): the live
      // controller.fees.payer value -- needed by reconcileStripeMigration to
      // match the EXACT eligibility condition the account.updated webhook's
      // cutover block already uses (charges_enabled && payouts_enabled &&
      // controller.fees.payer === 'account'). Additive field, no existing
      // caller destructures this away.
      feesPayer: account.controller?.fees?.payer,
    };
  } catch (error) {
    console.error('Failed to get account status:', error);
    throw error;
  }
};

/**
 * Pay a consignor via ACH using Stripe Transfers.
 * COMPLIANCE (findasale-legal review 2026-07-26, see
 * claude_docs/feature-notes/legal-stripe-consignor-payout-compliance-2026-07-26.md):
 * - Identity verification: Stripe enforces its own verification thresholds
 *   automatically on the connected Express account (its documented example is
 *   $1,500 in charges or 30 days, whichever first) via `account.requirements`
 *   (already read in `getAccountStatus()` above). No app-side duplicate check
 *   needed — surface `requirements.currently_due`/Restricted status to the
 *   organizer/consignor instead of gating independently.
 * - Tax reporting: consignor payouts via Stripe Transfers to a connected
 *   account fall under Form 1099-K (IRC §6050W), not 1099-NEC. The federal
 *   threshold is $20,000 AND 200+ transactions (OBBBA, July 2025 — the
 *   earlier $600 ARPA threshold was repealed). Before enabling
 *   STRIPE_CONNECT_LIVE_TRANSFERS in production: verify whether Stripe's
 *   built-in Connect tax-reporting (auto-generates/files 1099-K) is enabled
 *   in the Stripe Dashboard, and get attorney review on state-level 1099-K
 *   thresholds (several states are below the federal bar).
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
 * REMOVED (ADR-090 Phase 3, 2026-07-20): payVendorBoothViaTransfer used to pay a
 * VendorBooth's net sale proceeds via a platform/organizer-account -> vendor
 * Transfer, back when booth-cart checkout was ONE PaymentIntent on the ORGANIZER's
 * account (pre-ADR-020). It was already broken by the time ADR-020 shipped (Direct
 * charges per-booth-leg): it looked for the charge on the ORGANIZER's account (wrong
 * -- each leg's charge lives on the VENDOR's own Standard account) and transferred
 * organizer -> vendor (wrong direction -- the vendor already has 100% of their
 * sale's money via the Direct charge, they were never owed a Transfer from anyone).
 *
 * Post-ADR-090-Phase-2, this function's original PURPOSE (pay the vendor their net
 * sale proceeds) is genuinely dead, not just buggy: the vendor's net proceeds
 * (gross minus application_fee_amount, which now also carries the hub owner's
 * revenue-share cut) already land on the vendor's own account automatically at
 * capture time. There is nothing left for a settlement-time Transfer to pay them.
 * See vendorBoothSettlementController.ts's module header for the full rescoping.
 * Flat booth-fee collection (a genuinely separate, vendor-owes-hub-owner flow) is
 * handled by vendorBoothFeeBillingCron.ts (ADR-090 Phase 4), which charges the
 * vendor's saved platform payment method and Transfers proceeds to the hub owner --
 * it does not call this function or need anything like it.
 */

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
/**
 * ADR 1 (2026-07-11, stripe-migration-reconciliation-and-isr-revalidation-adr):
 * Reconciliation-first fix for the Stripe `account.updated` webhook gap. Live-checks
 * a pending Standard-migration account's REAL status via the Stripe API (never the
 * cached DB fields) and, if eligible, performs the EXACT same cutover the webhook's
 * `account.updated` handler already does (see stripeController.ts, the
 * `[stripe-migration] cutover` block inside the `case 'account.updated':` switch arm).
 * This function is not a parallel implementation of that cutover -- it is the same
 * logic, decoupled from webhook delivery, so it works identically whether called by
 * the daily reconciliation cron, a one-off manual invocation, or (later) directly by
 * the webhook handler itself once Patrick approves subscribing to `account.updated`.
 *
 * Never throws for the "not yet eligible" case -- that is an expected, common state
 * for an organizer mid-onboarding, not an error condition.
 */
export type ReconcileStripeMigrationResult =
  | { status: 'no-pending-migration'; organizerId: string }
  | { status: 'not-yet-eligible'; organizerId: string; pendingAccountId: string; chargesEnabled: boolean; payoutsEnabled: boolean; feesPayer: string | undefined }
  | { status: 'organizer-not-found'; organizerId: string }
  | { status: 'cutover-complete'; organizerId: string; oldAccountId: string | null; newAccountId: string; vendorBoothsCutOver: number }
  | { status: 'error'; organizerId: string; message: string };

export const reconcileStripeMigration = async (
  organizerId: string
): Promise<ReconcileStripeMigrationResult> => {
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
    });

    if (!organizer) {
      return { status: 'organizer-not-found', organizerId };
    }

    if (!organizer.pendingStripeMigrationAccountId) {
      return { status: 'no-pending-migration', organizerId };
    }

    // Defensive: the 'CLAIMING' sentinel (startStandardMigration's race-condition
    // guard) is never a real Stripe account id -- nothing to live-check yet.
    if (organizer.pendingStripeMigrationAccountId === 'CLAIMING') {
      return { status: 'not-yet-eligible', organizerId, pendingAccountId: organizer.pendingStripeMigrationAccountId, chargesEnabled: false, payoutsEnabled: false, feesPayer: undefined };
    }

    const pendingAccountId = organizer.pendingStripeMigrationAccountId;

    // REAL live API call -- never inferred from cached DB fields.
    const liveStatus = await getAccountStatus(pendingAccountId);

    // Same eligibility condition as the account.updated webhook's cutover block:
    // charges_enabled && payouts_enabled && controller.fees.payer === 'account'.
    const eligible =
      liveStatus.chargesEnabled && liveStatus.payoutsEnabled && liveStatus.feesPayer === 'account';

    if (!eligible) {
      return {
        status: 'not-yet-eligible',
        organizerId,
        pendingAccountId,
        chargesEnabled: liveStatus.chargesEnabled,
        payoutsEnabled: liveStatus.payoutsEnabled,
        feesPayer: liveStatus.feesPayer,
      };
    }

    // Same cutover the webhook performs: swap stripeConnectId to the new account,
    // mark it 'standard', clear the pending marker, mark onboarded, and cut over
    // any VendorBooth rows still sharing the OLD account id.
    const oldAccountId = organizer.stripeConnectId;
    await prisma.organizer.update({
      where: { id: organizer.id },
      data: {
        stripeConnectId: pendingAccountId,
        stripeAccountType: 'standard',
        pendingStripeMigrationAccountId: null,
        stripeOnboarded: true,
      },
    });
    console.log(`[stripe-migration] reconcile cutover: organizer ${organizer.id} ${oldAccountId} -> ${pendingAccountId}`);

    let vendorBoothsCutOver = 0;
    if (oldAccountId) {
      const boothsCutOver = await prisma.vendorBooth.updateMany({
        where: { stripeAccountId: oldAccountId },
        data: { stripeAccountId: pendingAccountId, stripeAccountType: 'standard' },
      });
      vendorBoothsCutOver = boothsCutOver.count;
      if (vendorBoothsCutOver > 0) {
        console.log(`[stripe-migration] reconcile cutover also applied to ${vendorBoothsCutOver} vendor booth(s) sharing the old account id`);
      }
    }

    return {
      status: 'cutover-complete',
      organizerId,
      oldAccountId,
      newAccountId: pendingAccountId,
      vendorBoothsCutOver,
    };
  } catch (error) {
    console.error(`[stripe-migration] reconcileStripeMigration failed for organizer ${organizerId}:`, error);
    return { status: 'error', organizerId, message: error instanceof Error ? error.message : String(error) };
  }
};
