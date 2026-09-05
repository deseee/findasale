// ADR-115 Phase 2 -- Shippo native shipping label purchasing.
//
// Thin wrapper around Shippo's REST API using plain `fetch` (already the established
// pattern in this backend -- see ebayRateEstimateService.ts, itemController.ts, etc.) rather
// than the `shippo` npm SDK: this sandbox cannot run `pnpm install` to regenerate
// pnpm-lock.yaml safely, and there's already one unrelated in-flight lockfile risk sitting in
// this repo (imapflow/mailparser added without a lockfile update) -- adding a second
// dependency without a working lockfile-regen path isn't worth it when a raw fetch call does
// the same job.
//
// Deliberately pure / Prisma-free: every function here takes plain address/parcel data in and
// returns plain rate/label data out. The calling controller owns all DB reads/writes (which
// Purchase, which Item, ownership checks, etc.) -- this service only knows how to talk to
// Shippo. Keeps this file trivially unit-testable with a mocked `fetch`.
//
// API contract below is NOT guessed -- it was independently validated live against Shippo's
// real test-mode API this session (2026-09-05, outreach@finda.sale account) before this file
// was written: a real shipment was created, real USPS test rates came back, and a real test
// label was purchased end-to-end. One live finding baked into this file: Shippo/USPS rejects
// a label purchase with `sender_info_missing` unless BOTH address_from AND address_to include
// phone + email -- see buildAddress() below.

const SHIPPO_API_BASE = 'https://api.goshippo.com';

export interface ShippoAddressInput {
  name: string;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country?: string; // defaults to 'US'
  phone?: string | null;
  email?: string | null;
}

export interface ShippoParcelInput {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightOz: number;
}

export interface ShippoRate {
  rateId: string;
  provider: string; // 'USPS' | 'UPS' | 'FedEx' | ...
  serviceName: string;
  amountCents: number;
  currency: string;
  estimatedDays: number | null;
}

export interface ShippoLabelResult {
  transactionId: string;
  trackingNumber: string;
  trackingUrl: string | null;
  labelUrl: string;
  carrier: string;
  costCents: number;
}

/** Raised whenever Shippo itself reports a real failure (not a network/programmer error) --
 *  callers should surface `messages` to the organizer rather than a generic 500. */
export class ShippingLabelPurchaseError extends Error {
  constructor(
    message: string,
    public readonly shippoMessages: Array<{ source?: string; code?: string; text?: string }> = []
  ) {
    super(message);
    this.name = 'ShippingLabelPurchaseError';
  }
}

const getToken = (): string => {
  const token = process.env.SHIPPO_TEST_TOKEN || process.env.SHIPPO_LIVE_TOKEN;
  if (!token) {
    throw new ShippingLabelPurchaseError(
      'No Shippo API token configured (SHIPPO_TEST_TOKEN / SHIPPO_LIVE_TOKEN both unset)'
    );
  }
  return token;
};

/** Live-tested finding: Shippo/USPS requires phone + email on BOTH addresses or the label
 *  purchase step fails with `sender_info_missing`, even though the shipment/rate step
 *  succeeds without them. Fill in a documented platform-level fallback rather than silently
 *  omitting the field -- an organizer without a phone on file should not be unable to ship. */
const PLATFORM_FALLBACK_PHONE = '+1 269 555 0100'; // FindA.Sale business line placeholder -- see flag in handoff
const PLATFORM_FALLBACK_EMAIL = 'outreach@finda.sale';

const buildAddress = (input: ShippoAddressInput) => ({
  name: input.name,
  street1: input.street1,
  street2: input.street2 || '',
  city: input.city,
  state: input.state,
  zip: input.zip,
  country: input.country || 'US',
  phone: input.phone || PLATFORM_FALLBACK_PHONE,
  email: input.email || PLATFORM_FALLBACK_EMAIL,
});

/** Step 1: create a Shippo shipment and return every valid rate Shippo quoted for it. */
export async function getShippingRates(
  addressFrom: ShippoAddressInput,
  addressTo: ShippoAddressInput,
  parcel: ShippoParcelInput
): Promise<ShippoRate[]> {
  const token = getToken();

  const res = await fetch(`${SHIPPO_API_BASE}/shipments/`, {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address_from: buildAddress(addressFrom),
      address_to: buildAddress(addressTo),
      parcels: [
        {
          length: String(parcel.lengthIn),
          width: String(parcel.widthIn),
          height: String(parcel.heightIn),
          distance_unit: 'in',
          weight: String(parcel.weightOz),
          mass_unit: 'oz',
        },
      ],
      async: false,
    }),
  });

  if (!res.ok) {
    throw new ShippingLabelPurchaseError(`Shippo shipment creation failed (HTTP ${res.status})`);
  }

  const data: any = await res.json();
  if (data.status !== 'SUCCESS') {
    throw new ShippingLabelPurchaseError('Shippo shipment did not reach SUCCESS status', data.messages || []);
  }

  const rates: any[] = Array.isArray(data.rates) ? data.rates : [];
  return rates.map((r) => ({
    rateId: r.object_id,
    provider: r.provider,
    serviceName: r.servicelevel?.name ?? r.servicelevel_name ?? 'Unknown service',
    amountCents: Math.round(parseFloat(r.amount) * 100),
    currency: r.currency,
    estimatedDays: r.estimated_days ?? null,
  }));
}

/** Step 2: buy a real (or, on a test token, test-mode) label for one specific rate. */
export async function buyLabelForRate(rateId: string): Promise<ShippoLabelResult> {
  const token = getToken();

  const res = await fetch(`${SHIPPO_API_BASE}/transactions/`, {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rate: rateId, label_file_type: 'PDF', async: false }),
  });

  if (!res.ok) {
    throw new ShippingLabelPurchaseError(`Shippo label purchase failed (HTTP ${res.status})`);
  }

  const data: any = await res.json();
  if (data.object_state !== 'VALID' || !data.label_url) {
    // This is exactly the failure mode hit live this session (sender_info_missing) --
    // surface Shippo's own messages verbatim so the organizer/log sees the real reason.
    throw new ShippingLabelPurchaseError(
      'Shippo could not issue a label for this rate',
      data.messages || []
    );
  }

  const rateAmount = data.rate && typeof data.rate === 'object' ? parseFloat(data.rate.amount) : NaN;

  return {
    transactionId: data.object_id,
    trackingNumber: data.tracking_number,
    trackingUrl: data.tracking_url_provider || null,
    labelUrl: data.label_url,
    carrier: data.rate?.provider || 'Unknown',
    costCents: Number.isFinite(rateAmount) ? Math.round(rateAmount * 100) : 0,
  };
}

/** Convenience: rate-shop then buy the cheapest valid rate in one call -- the Poshmark-style
 *  "just pick the cheapest real option" default ADR-115 already committed to. Returns both the
 *  full rate list (for logging/audit) and the purchased label. */
export async function buyCheapestLabel(
  addressFrom: ShippoAddressInput,
  addressTo: ShippoAddressInput,
  parcel: ShippoParcelInput
): Promise<{ rates: ShippoRate[]; label: ShippoLabelResult }> {
  const rates = await getShippingRates(addressFrom, addressTo, parcel);
  if (rates.length === 0) {
    throw new ShippingLabelPurchaseError('Shippo returned no valid rates for this shipment');
  }
  const cheapest = rates.reduce((min, r) => (r.amountCents < min.amountCents ? r : min), rates[0]);
  const label = await buyLabelForRate(cheapest.rateId);
  return { rates, label };
}
