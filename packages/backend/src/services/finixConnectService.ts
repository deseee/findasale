import axios, { AxiosInstance } from 'axios';
import { prisma } from '../lib/prisma';

/**
 * Finix Connect-Equivalent Onboarding Service (2026-09-18, sandbox build-ahead-of-approval)
 * Mirrors squareConnectService.ts's SHAPE (one service handling organizer/consignor/
 * vendor-booth onboarding identity), NOT its OAuth mechanics -- Finix's model is closer to
 * Stripe's server-side-creation pattern than Square's OAuth-redirect pattern:
 *
 *   Finix: the PLATFORM calls the Finix API server-side to CREATE an Identity (the
 *   seller's business+personal info) and then a Merchant under that Identity (the
 *   account that actually processes payments). There is no OAuth redirect/callback the
 *   way Square requires -- Finix's own hosted onboarding form (if used) or a direct API
 *   flow collects the seller's info, and FindA.Sale's platform-level API credentials
 *   (Basic Auth) are used for every subsequent call on behalf of any onboarded Merchant.
 *
 * ================================================================================
 * UPDATE 2026-09-18 (same day, later dispatch): real Finix sandbox credentials now exist
 * (packages/backend/.env FINIX_* block) and createFinixIdentity/createFinixMerchant below
 * have been corrected against REAL sandbox API responses -- see
 * claude_docs/feature-notes/finix-sandbox-smoke-test-results-2026-09-18.md for the exact
 * confirmed request/response shapes (business_type enum, the 11 additional required
 * identity fields, and the Identity -> Payment Instrument -> Merchant onboarding order).
 * finixPaymentService.ts's split-transfer logic is NOT yet validated against a live
 * transfer call -- still treat that file as documented-but-unconfirmed.
 * ================================================================================
 *
 * Base URL and auth confirmed from docs.finix.com/api/section/authentication and
 * docs.finix.com/guides/getting-started/set-up-developer-environment (both read
 * 2026-09-18): sandbox base URL is https://finix.sandbox-payments-api.com, auth is HTTP
 * Basic Auth (username:password from the Finix Dashboard -> Developer -> Create API Key),
 * with a required `Finix-Version` header. Production base URL was NOT found stated in the
 * docs pulled this session -- FINIX_PRODUCTION_API_BASE_URL below has no hardcoded
 * default for that reason; it must be set explicitly before this service is ever pointed
 * at production, deliberately fail-closed rather than guessing a host.
 */

const FINIX_API_VERSION_HEADER = '2022-02-01'; // confirmed from docs.finix.com/api/section/authentication, 2026-09-18

export class FinixConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinixConfigError';
  }
}

const getFinixEnvironment = (): 'sandbox' | 'production' =>
  process.env.FINIX_ENVIRONMENT === 'production' ? 'production' : 'sandbox';

const getFinixBaseUrl = (): string => {
  if (getFinixEnvironment() === 'production') {
    const url = process.env.FINIX_PRODUCTION_API_BASE_URL;
    if (!url) {
      throw new FinixConfigError(
        'FINIX_PRODUCTION_API_BASE_URL is not set. Finix\'s production API host was not ' +
          'confirmed in this session\'s documentation research -- Patrick/Dev must confirm it ' +
          'from the Finix Dashboard before production use. Deliberately no hardcoded default ' +
          'here to avoid silently pointing a real charge at a guessed host.'
      );
    }
    return url;
  }
  // Confirmed 2026-09-18 from docs.finix.com -- see file header comment.
  return process.env.FINIX_SANDBOX_API_BASE_URL || 'https://finix.sandbox-payments-api.com';
};

let clientSingleton: AxiosInstance | null = null;

/**
 * Platform-level Finix API client (Basic Auth with FindA.Sale's own platform
 * username/password -- NOT per-merchant, unlike Square's per-organizer OAuth token).
 * Every onboarding and payment call in this service and finixPaymentService.ts routes
 * through this client.
 */
export const getFinixClient = (): AxiosInstance => {
  if (clientSingleton) return clientSingleton;

  const username = process.env.FINIX_USERNAME;
  const password = process.env.FINIX_PASSWORD;
  if (!username || !password) {
    throw new FinixConfigError(
      'FINIX_USERNAME / FINIX_PASSWORD are not set. Get sandbox credentials from ' +
        'https://finix.payments-dashboard.com/signup (Developer -> Create API Key) and set ' +
        'them in your .env file before using Finix services. See finixConnectService.ts header ' +
        'comment for the confirmed sandbox base URL and auth shape.'
    );
  }

  clientSingleton = axios.create({
    baseURL: getFinixBaseUrl(),
    auth: { username, password },
    headers: {
      'Content-Type': 'application/json',
      'Finix-Version': FINIX_API_VERSION_HEADER,
    },
    timeout: 15000,
  });
  return clientSingleton;
};

// ---------------------------------------------------------------------------
// Identity creation
// ---------------------------------------------------------------------------

/**
 * Minimal required fields per docs.finix.com/guides/onboarding/onboarding-with-api/
 * (pulled 2026-09-18) -- UNCONFIRMED against a live response. Finix's Identity object
 * supports many more optional fields (beneficial-owner info, underwriting data, etc.);
 * this interface covers only what the onboarding guide listed as required for a
 * BUSINESS/SELLER identity. Extend as real onboarding requirements are discovered.
 */
// Confirmed exhaustive list from a real Finix 400 response, 2026-09-18 -- see
// claude_docs/feature-notes/finix-sandbox-smoke-test-results-2026-09-18.md section 1.
export type FinixBusinessType =
  | 'INDIVIDUAL_SOLE_PROPRIETORSHIP'
  | 'CORPORATION'
  | 'LIMITED_LIABILITY_COMPANY'
  | 'PARTNERSHIP'
  | 'LIMITED_PARTNERSHIP'
  | 'GENERAL_PARTNERSHIP'
  | 'ASSOCIATION_ESTATE_TRUST'
  | 'TAX_EXEMPT_ORGANIZATION'
  | 'INTERNATIONAL_ORGANIZATION'
  | 'GOVERNMENT_AGENCY'
  | 'JOINT_VENTURE'
  | 'LLC_DISREGARDED';

export interface FinixAddress {
  line1: string;
  line2?: string;
  city: string;
  region: string; // state
  postalCode: string;
  country: string; // 'USA' confirmed accepted by a real 201 response, 2026-09-18
}

/**
 * Fields per a real Finix 201-Created response for a LIMITED_LIABILITY_COMPANY identity,
 * 2026-09-18 -- see the feature note above. Finix's Identity requires BOTH a personal
 * record (the individual signing up) and a business record; several fields that look
 * redundant (phone/businessPhone, taxId/businessTaxId, personalAddress/businessAddress)
 * are genuinely two separate required fields, confirmed by a real 422 response, not a
 * duplication mistake.
 */
export interface CreateFinixIdentityParams {
  firstName: string;
  lastName: string;
  email: string;
  phone: string; // the individual's personal phone -- Finix also requires a separate businessPhone below
  taxId: string; // the individual's personal tax id (SSN-equivalent) -- Finix also requires a separate businessTaxId (EIN) below
  personalAddress: FinixAddress; // the individual's home address -- confirmed required and distinct from businessAddress, real 422 response, 2026-09-18
  businessName: string;
  businessType: FinixBusinessType;
  businessAddress: FinixAddress;
  businessPhone: string; // confirmed required, distinct from the individual's personal phone -- real 422 response, 2026-09-18
  businessTaxId: string; // the business EIN, confirmed required, distinct from the individual's personal taxId -- real 422 response, 2026-09-18
  doingBusinessAs: string;
  url: string; // business website
  defaultStatementDescriptor: string; // appears on the buyer's card statement
  mcc: string; // Merchant Category Code -- '5931' (Used Merchandise and Secondhand Stores) confirmed accepted 2026-09-18; worth revisiting for FindA.Sale's actual sale-type mix, flagged for Patrick
  annualCardVolume: number; // confirmed accepted as a plain integer (dollars), e.g. 100000 -- real 201 response, 2026-09-18
  principalPercentageOwnership: number; // confirmed accepted as a plain integer percentage, e.g. 100 -- real 201 response, 2026-09-18
  maxTransactionAmount: number; // confirmed accepted as an integer -- NOT confirmed whether Finix enforces this as a real ceiling or stores it as metadata only, see feature note section 5
  dob: { day: number; month: number; year: number };
  incorporationDate: { day: number; month: number; year: number }; // same shape as dob -- confirmed required for LIMITED_LIABILITY_COMPANY, real 422 response, 2026-09-18
}

export interface FinixIdentityResult {
  id: string;
  raw: unknown; // full Finix response, kept for debugging until the real shape is confirmed
}

/**
 * Creates a Finix Identity (the seller's business+personal record). Mirrors
 * squareConnectService.ts's role in the onboarding flow, but this is a direct
 * server-to-server call, not an OAuth redirect.
 *
 * NOT wired into any controller/route yet -- call sites (e.g. a future
 * finixConnectController.ts) are a separate dispatch. Field shape below is CONFIRMED
 * against a real 201-Created sandbox response, 2026-09-18 -- see
 * claude_docs/feature-notes/finix-sandbox-smoke-test-results-2026-09-18.md.
 */
export async function createFinixIdentity(params: CreateFinixIdentityParams): Promise<FinixIdentityResult> {
  const client = getFinixClient();

  // Field shape confirmed against a real Finix sandbox 201 response, 2026-09-18 -- see
  // file header and the feature note referenced above.
  const response = await client.post('/identities', {
    entity: {
      first_name: params.firstName,
      last_name: params.lastName,
      email: params.email,
      phone: params.phone,
      tax_id: params.taxId,
      personal_address: {
        line1: params.personalAddress.line1,
        line2: params.personalAddress.line2,
        city: params.personalAddress.city,
        region: params.personalAddress.region,
        postal_code: params.personalAddress.postalCode,
        country: params.personalAddress.country,
      },
      business_name: params.businessName,
      business_type: params.businessType,
      business_address: {
        line1: params.businessAddress.line1,
        line2: params.businessAddress.line2,
        city: params.businessAddress.city,
        region: params.businessAddress.region,
        postal_code: params.businessAddress.postalCode,
        country: params.businessAddress.country,
      },
      business_phone: params.businessPhone,
      business_tax_id: params.businessTaxId,
      doing_business_as: params.doingBusinessAs,
      url: params.url,
      default_statement_descriptor: params.defaultStatementDescriptor,
      mcc: params.mcc,
      annual_card_volume: params.annualCardVolume,
      principal_percentage_ownership: params.principalPercentageOwnership,
      max_transaction_amount: params.maxTransactionAmount,
      dob: params.dob,
      incorporation_date: params.incorporationDate,
    },
    identity_roles: ['SELLER'],
    type: 'BUSINESS',
  });

  const id = (response.data as any)?.id;
  if (!id) {
    throw new Error('Finix createIdentity response did not include an id -- unexpected shape, see raw response in logs.');
  }
  return { id, raw: response.data };
}

// ---------------------------------------------------------------------------
// Payment instrument creation -- REQUIRED before Merchant creation (confirmed 2026-09-18)
// ---------------------------------------------------------------------------

export interface CreateFinixPaymentInstrumentParams {
  accountType: string; // e.g. 'CHECKING' -- confirmed accepted by a real 201 response, 2026-09-18
  accountNumber: string;
  bankCode: string; // routing number
  country: string; // 'USA' confirmed accepted
  name: string; // account holder / business name on the bank account
}

export interface FinixPaymentInstrumentResult {
  id: string;
  raw: unknown;
}

/**
 * Creates a BANK_ACCOUNT payment instrument on an existing Identity. CONFIRMED REQUIRED
 * before createFinixMerchant() below will succeed -- a real 422 response against a fresh
 * Identity with no payment instrument returned: "Following instruments should be
 * associated to merchant identity: BANK_ACCOUNT". The real onboarding order is:
 *   1. createFinixIdentity()
 *   2. createFinixPaymentInstrument()  <-- this function
 *   3. createFinixMerchant()
 * See claude_docs/feature-notes/finix-sandbox-smoke-test-results-2026-09-18.md section 3
 * for the confirmed real request/response. NOT wired into any controller/route yet, same
 * as the other functions in this file.
 */
export async function createFinixPaymentInstrument(
  identityId: string,
  params: CreateFinixPaymentInstrumentParams
): Promise<FinixPaymentInstrumentResult> {
  const client = getFinixClient();

  const response = await client.post('/payment_instruments', {
    identity: identityId,
    type: 'BANK_ACCOUNT',
    account_type: params.accountType,
    account_number: params.accountNumber,
    bank_code: params.bankCode,
    country: params.country,
    name: params.name,
  });

  const data = response.data as any;
  if (!data?.id) {
    throw new Error('Finix createPaymentInstrument response did not include an id -- unexpected shape, see raw response in logs.');
  }
  return { id: data.id, raw: data };
}

// ---------------------------------------------------------------------------
// Merchant creation (underwriting)
// ---------------------------------------------------------------------------

export interface FinixMerchantResult {
  id: string;
  status: string; // 'PROVISIONING' confirmed on create, flips to 'APPROVED' within seconds in sandbox with the DUMMY_V1 processor -- real response, 2026-09-18. Full enum still not exhaustively confirmed (e.g. 'UPDATE_REQUESTED' is a documented guess).
  raw: unknown;
}

/**
 * Creates a Finix Merchant under an existing Identity, which automatically starts
 * underwriting. `processor` is required by Finix's API -- sandbox commonly uses a dummy
 * test processor value; the real production processor value must come from Finix's
 * onboarding docs/support once a production account exists, do not assume the sandbox
 * value carries over.
 *
 * CONFIRMED 2026-09-18: this call fails with a 422 unless the Identity already has a
 * BANK_ACCOUNT payment instrument -- call createFinixPaymentInstrument() first. See the
 * feature note referenced above.
 */
export async function createFinixMerchant(identityId: string, processor?: string): Promise<FinixMerchantResult> {
  const client = getFinixClient();

  const resolvedProcessor =
    processor || process.env.FINIX_SANDBOX_PROCESSOR || 'DUMMY_V1'; // sandbox test-processor value per docs.finix.com, 2026-09-18 -- UNCONFIRMED for production

  const response = await client.post(`/identities/${identityId}/merchants`, {
    processor: resolvedProcessor,
  });

  const data = response.data as any;
  if (!data?.id) {
    throw new Error('Finix createMerchant response did not include an id -- unexpected shape, see raw response in logs.');
  }
  return { id: data.id, status: data.onboarding_state || data.status || 'UNKNOWN', raw: data };
}

// ---------------------------------------------------------------------------
// Onboarding status persistence (owner-model agnostic)
// ---------------------------------------------------------------------------

export type FinixOwnerType = 'ORGANIZER' | 'CONSIGNOR' | 'VENDOR_BOOTH';

/**
 * Persists identity/merchant ids and onboarding status to the correct owner model.
 * Mirrors the additive finixIdentityId/finixMerchantId/finixOnboarded columns added to
 * Organizer, Consignor, and VendorBooth this same dispatch (see schema.prisma).
 */
export async function persistFinixOnboarding(
  ownerType: FinixOwnerType,
  ownerId: string,
  identityId: string,
  merchantId: string,
  onboarded: boolean
): Promise<void> {
  const data = { finixIdentityId: identityId, finixMerchantId: merchantId, finixOnboarded: onboarded };

  if (ownerType === 'ORGANIZER') {
    await prisma.organizer.update({ where: { id: ownerId }, data });
  } else if (ownerType === 'CONSIGNOR') {
    await prisma.consignor.update({ where: { id: ownerId }, data });
  } else {
    await prisma.vendorBooth.update({ where: { id: ownerId }, data });
  }
}

/**
 * Webhook handler STUB for Finix's Merchant Updated / Merchant Underwritten events
 * (event names UNCONFIRMED against a real webhook payload -- per docs.finix.com's
 * five-step onboarding guide, 2026-09-18). NOT wired to any route yet -- a real
 * finixWebhookController.ts is a separate dispatch once the event payload shape is
 * confirmed against a live sandbox webhook delivery. This stub documents the intended
 * shape so that follow-up work has a starting point rather than a blank page.
 */
export async function handleFinixMerchantWebhookStub(payload: {
  type: string; // e.g. 'merchant.updated', 'merchant.underwritten' -- UNCONFIRMED exact event names
  merchantId: string;
  onboardingState: string; // e.g. 'APPROVED' | 'PROVISIONING' | 'UPDATE_REQUESTED' -- UNCONFIRMED exact enum
}): Promise<void> {
  // Intentionally not implemented yet -- needs a real sandbox webhook payload to build
  // against safely. Throwing here rather than silently no-opping so this stub is never
  // mistaken for a working handler if it's accidentally wired up early.
  throw new Error(
    'handleFinixMerchantWebhookStub is a documented placeholder, not a working webhook ' +
      'handler -- build the real implementation once a live Finix sandbox webhook payload ' +
      'has been observed and its shape confirmed.'
  );
}
