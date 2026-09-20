import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  createFinixIdentity,
  createFinixPaymentInstrument,
  createFinixMerchant,
  persistFinixOnboarding,
  FinixConfigError,
  type CreateFinixIdentityParams,
  type CreateFinixPaymentInstrumentParams,
} from '../services/finixConnectService';

/**
 * Finix Connect-Equivalent Onboarding Controller -- Vendor Booth only
 * (2026-09-19, ADR-127 SS5.3/SS5.4 step 4 -- Maple Lake Mall hub chargeback-liability
 * wiring prerequisite, dispatched after Patrick's "go ahead and do the ui and backend
 * while we wait" -- built now against the Finix SANDBOX while production approval is
 * still pending, since nothing here is wired to a live payment path yet.)
 *
 * Wires up finixConnectService.ts's createFinixIdentity/createFinixPaymentInstrument/
 * createFinixMerchant/persistFinixOnboarding functions, which existed but were explicitly
 * NOT wired to any controller/route as of 2026-09-18 (see that file's own doc comments).
 *
 * Scoped to VENDOR_BOOTH only for this dispatch -- ADR-127 SS5.3 requires every booth that
 * transacts through the Maple Lake Mall hub register to have its OWN Finix identity/
 * merchant. Organizer/Consignor Finix onboarding is not built by this dispatch.
 *
 * NOT an OAuth redirect like the Stripe/Square routes in vendorBoothController.ts --
 * Finix's model is a direct server-to-server API sequence (Identity -> Payment Instrument
 * -> Merchant), so this onboarding happens over ONE POST carrying the vendor's business/
 * personal/bank info directly, not a redirect URL.
 *
 * SANDBOX ONLY as of this dispatch -- Finix production API access is still pending (see
 * finixConnectService.ts's FINIX_PRODUCTION_API_BASE_URL fail-closed guard). ADR-127
 * SS5.4 steps 1-3 (the actual split-transfer wiring that would make a booth's Finix
 * merchant ID process a real charge) are a separate, still-deferred dispatch.
 *
 * Square remains the sole PRODUCTION payout processor for vendor booths (see
 * vendor-booth/[boothToken].tsx's own header comment) -- this Finix flow is additive, for
 * the Maple Lake Mall hub/register use case specifically, not a replacement.
 */

interface FinixOnboardAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

interface FinixOnboardDate {
  day?: number;
  month?: number;
  year?: number;
}

interface FinixOnboardBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  taxId?: string;
  dob?: FinixOnboardDate;
  personalAddress?: FinixOnboardAddress;
  businessName?: string;
  businessType?: string;
  businessAddress?: FinixOnboardAddress;
  businessPhone?: string;
  businessTaxId?: string;
  doingBusinessAs?: string;
  url?: string;
  defaultStatementDescriptor?: string;
  mcc?: string;
  annualCardVolume?: number;
  principalPercentageOwnership?: number;
  maxTransactionAmount?: number;
  incorporationDate?: FinixOnboardDate;
  bankAccountType?: string;
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
  bankAccountCountry?: string;
  bankAccountHolderName?: string;
}

const REQUIRED_TOP_LEVEL_FIELDS: (keyof FinixOnboardBody)[] = [
  'firstName', 'lastName', 'email', 'phone', 'taxId', 'dob',
  'personalAddress', 'businessName', 'businessType', 'businessAddress',
  'businessPhone', 'businessTaxId', 'doingBusinessAs', 'url',
  'defaultStatementDescriptor', 'mcc', 'annualCardVolume',
  'principalPercentageOwnership', 'maxTransactionAmount', 'incorporationDate',
  'bankAccountType', 'bankAccountNumber', 'bankRoutingNumber',
  'bankAccountCountry', 'bankAccountHolderName',
];

const REQUIRED_ADDRESS_FIELDS: (keyof FinixOnboardAddress)[] = ['line1', 'city', 'region', 'postalCode', 'country'];

function validateFinixOnboardBody(body: FinixOnboardBody): string | null {
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    const value = body[field] as unknown;
    if (value === undefined || value === null || value === '') {
      return `Missing required field: ${field}`;
    }
  }
  for (const addrField of ['personalAddress', 'businessAddress'] as const) {
    const addr = body[addrField];
    for (const f of REQUIRED_ADDRESS_FIELDS) {
      if (!addr?.[f]) return `Missing required field: ${addrField}.${f}`;
    }
  }
  for (const dateField of ['dob', 'incorporationDate'] as const) {
    const d = body[dateField];
    if (!d?.day || !d?.month || !d?.year) return `Missing required field: ${dateField} (day/month/year)`;
  }
  return null;
}

/**
 * GET /api/vendor-booth/:vendorBoothId/finix/status
 * Auth: booth owner only. Cache-only read, same convention as getVendorBoothSquareStatus.
 */
export const getVendorBoothFinixStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    return res.status(200).json({
      finixIdentityId: booth.finixIdentityId,
      finixMerchantId: booth.finixMerchantId,
      finixOnboarded: booth.finixOnboarded,
    });
  } catch (error) {
    console.error('[getVendorBoothFinixStatus] Error:', error);
    return res.status(500).json({ error: 'Failed to get booth Finix status' });
  }
};

/**
 * POST /api/vendor-booth/:vendorBoothId/finix/onboard
 * Auth: booth owner only. Body: full identity + bank details (see FinixOnboardBody above)
 * -- direct server-to-server sequence, not a redirect URL.
 *
 * Resumable by design: if the Identity call succeeds but a later step (payment instrument
 * or merchant creation) fails, the booth's finixIdentityId is persisted immediately so a
 * retry does not create a second, orphaned Identity on Finix's side. finixOnboarded only
 * flips to true once all three steps (identity, payment instrument, merchant) succeed.
 */
export const startVendorBoothFinixOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    if (booth.finixOnboarded && booth.finixMerchantId) {
      console.log(`[Finix] Booth ${booth.id} already onboarded (merchant ${booth.finixMerchantId}) -- skipping.`);
      return res.status(200).json({ alreadyOnboarded: true, finixMerchantId: booth.finixMerchantId });
    }

    console.log(
      `[Finix] Starting onboarding for booth ${booth.id}` +
        (booth.finixIdentityId ? ` (resuming with existing identity ${booth.finixIdentityId})` : '') +
        '.'
    );

    const body = req.body as FinixOnboardBody;
    const validationError = validateFinixOnboardBody(body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const identityParams: CreateFinixIdentityParams = {
      firstName: body.firstName!,
      lastName: body.lastName!,
      email: body.email!,
      phone: body.phone!,
      taxId: body.taxId!,
      personalAddress: {
        line1: body.personalAddress!.line1!,
        line2: body.personalAddress!.line2,
        city: body.personalAddress!.city!,
        region: body.personalAddress!.region!,
        postalCode: body.personalAddress!.postalCode!,
        country: body.personalAddress!.country!,
      },
      businessName: body.businessName!,
      businessType: body.businessType as CreateFinixIdentityParams['businessType'],
      businessAddress: {
        line1: body.businessAddress!.line1!,
        line2: body.businessAddress!.line2,
        city: body.businessAddress!.city!,
        region: body.businessAddress!.region!,
        postalCode: body.businessAddress!.postalCode!,
        country: body.businessAddress!.country!,
      },
      businessPhone: body.businessPhone!,
      businessTaxId: body.businessTaxId!,
      doingBusinessAs: body.doingBusinessAs!,
      url: body.url!,
      defaultStatementDescriptor: body.defaultStatementDescriptor!,
      mcc: body.mcc!,
      annualCardVolume: body.annualCardVolume!,
      principalPercentageOwnership: body.principalPercentageOwnership!,
      maxTransactionAmount: body.maxTransactionAmount!,
      dob: {
        day: body.dob!.day!,
        month: body.dob!.month!,
        year: body.dob!.year!,
      },
      incorporationDate: {
        day: body.incorporationDate!.day!,
        month: body.incorporationDate!.month!,
        year: body.incorporationDate!.year!,
      },
    };

    // Step 1: Identity. Resumable -- reuse an already-created identity on retry rather
    // than creating a duplicate on Finix's side.
    let identityId: string | null = booth.finixIdentityId;
    if (!identityId) {
      try {
        const identity = await createFinixIdentity(identityParams);
        identityId = identity.id;
        await prisma.vendorBooth.update({ where: { id: booth.id }, data: { finixIdentityId: identityId } });
        console.log(`[Finix] Identity created for booth ${booth.id}: ${identityId}`);
      } catch (err: any) {
        console.error(
          `[Finix] createFinixIdentity failed for booth ${booth.id}:`,
          err?.response?.status,
          err?.response?.data?.message || err?.response?.data?.code || err?.message || err
        );
        return res.status(502).json({
          error: "We couldn't submit your business information to Finix. Please check your details and try again.",
        });
      }
    }

    if (!identityId) {
      // Unreachable in practice (the block above always sets it or returns early) --
      // kept as a defensive guard so the calls below never run against a null identity.
      console.error('[startVendorBoothFinixOnboarding] identityId unexpectedly null after identity step');
      return res.status(500).json({ error: 'Unexpected error resolving your Finix identity. Please try again.' });
    }

    // Step 2: Payment instrument (bank account). CONFIRMED required before Merchant
    // creation -- see finixConnectService.ts's createFinixPaymentInstrument doc comment.
    try {
      const paymentInstrumentParams: CreateFinixPaymentInstrumentParams = {
        accountType: body.bankAccountType!,
        accountNumber: body.bankAccountNumber!,
        bankCode: body.bankRoutingNumber!,
        country: body.bankAccountCountry!,
        name: body.bankAccountHolderName!,
      };
      const paymentInstrument = await createFinixPaymentInstrument(identityId, paymentInstrumentParams);
      console.log(`[Finix] Payment instrument created for booth ${booth.id} (identity ${identityId}): ${paymentInstrument.id}`);
    } catch (err: any) {
      console.error(
        `[Finix] createFinixPaymentInstrument failed for booth ${booth.id} (identity ${identityId}):`,
        err?.response?.status,
        err?.response?.data?.message || err?.response?.data?.code || err?.message || err
      );
      return res.status(502).json({
        error:
          "We couldn't save your bank account with Finix. Your business information is saved -- please check your bank details and try again.",
      });
    }

    // Step 3: Merchant (starts underwriting).
    try {
      const merchant = await createFinixMerchant(identityId);
      await persistFinixOnboarding('VENDOR_BOOTH', booth.id, identityId, merchant.id, true);
      console.log(`[Finix] Onboarding complete for booth ${booth.id}: merchant ${merchant.id} (status ${merchant.status}).`);
      return res.status(200).json({
        onboarded: true,
        finixMerchantId: merchant.id,
        merchantStatus: merchant.status,
      });
    } catch (err: any) {
      console.error(
        `[Finix] createFinixMerchant failed for booth ${booth.id} (identity ${identityId}):`,
        err?.response?.status,
        err?.response?.data?.message || err?.response?.data?.code || err?.message || err
      );
      return res.status(502).json({
        error:
          "We couldn't finish setting up your Finix merchant account. Your business and bank information are saved -- please try again.",
      });
    }
  } catch (error) {
    if (error instanceof FinixConfigError) {
      console.error('[startVendorBoothFinixOnboarding] Finix config error:', error.message);
      return res.status(503).json({ error: 'Finix is not configured yet. Please contact support.' });
    }
    console.error('[startVendorBoothFinixOnboarding] Error:', error);
    return res.status(500).json({ error: 'Failed to start Finix onboarding' });
  }
};
