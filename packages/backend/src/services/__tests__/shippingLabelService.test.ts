/**
 * ADR-115 Phase 2 — shippingLabelService.ts unit tests.
 *
 * shippingLabelService is deliberately Prisma-free (plain address/parcel data in, plain
 * rate/label data out), so these are pure unit tests against a mocked `global.fetch` — no
 * database needed, unlike the controller-level suite (shippingLabelPurchase.test.ts) which
 * exercises the real Purchase/Organizer/Sale rows.
 *
 * Request/response shapes below match what was independently, live-verified against Shippo's
 * real test-mode API this session (2026-09-05, outreach@finda.sale account) before this file
 * was written — not guessed.
 */

import { getShippingRates, buyLabelForRate, buyCheapestLabel, ShippingLabelPurchaseError } from '../shippingLabelService';

const ADDRESS = {
  name: 'Test Organizer',
  street1: '219 E Michigan Ave',
  city: 'Paw Paw',
  state: 'MI',
  zip: '49079',
  phone: '+1 269 555 0100',
  email: 'organizer@example.com',
};
const ADDRESS_TO = {
  name: 'Test Shopper',
  street1: '215 Clayton St',
  city: 'San Francisco',
  state: 'CA',
  zip: '94117',
  phone: '+1 415 555 0100',
  email: 'shopper@example.com',
};
const PARCEL = { lengthIn: 10, widthIn: 8, heightIn: 4, weightOz: 16 };

describe('shippingLabelService (ADR-115 Phase 2)', () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.SHIPPO_TEST_TOKEN;

  beforeEach(() => {
    process.env.SHIPPO_TEST_TOKEN = 'shippo_test_fake_token';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.SHIPPO_TEST_TOKEN = originalToken;
    jest.resetAllMocks();
  });

  describe('getShippingRates', () => {
    it('parses a successful shipment response into a rate list', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'SUCCESS',
          rates: [
            { object_id: 'rate_ground', provider: 'USPS', servicelevel: { name: 'Ground Advantage' }, amount: '10.01', currency: 'USD', estimated_days: 5 },
            { object_id: 'rate_priority', provider: 'USPS', servicelevel: { name: 'Priority Mail' }, amount: '11.41', currency: 'USD', estimated_days: 3 },
          ],
        }),
      });

      const rates = await getShippingRates(ADDRESS, ADDRESS_TO, PARCEL);

      expect(rates).toHaveLength(2);
      expect(rates[0]).toEqual({
        rateId: 'rate_ground',
        provider: 'USPS',
        serviceName: 'Ground Advantage',
        amountCents: 1001,
        currency: 'USD',
        estimatedDays: 5,
      });

      // Sender/recipient phone+email were both supplied -- must reach Shippo verbatim
      // (this is the exact requirement that failed live without them this session).
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.address_from.phone).toBe(ADDRESS.phone);
      expect(body.address_from.email).toBe(ADDRESS.email);
      expect(body.address_to.phone).toBe(ADDRESS_TO.phone);
    });

    it('falls back to platform contact info when address phone/email are omitted', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'SUCCESS', rates: [] }),
      });

      const { phone, email, ...addressNoContact } = ADDRESS_TO;
      await getShippingRates(ADDRESS, addressNoContact as any, PARCEL);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      // Must never be blank -- Shippo/USPS rejects a label purchase outright without these
      // (sender_info_missing, hit live this session).
      expect(body.address_to.phone).toBeTruthy();
      expect(body.address_to.email).toBeTruthy();
    });

    it('throws ShippingLabelPurchaseError when the shipment does not reach SUCCESS', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ERROR', messages: [{ source: 'Shippo', text: 'bad address' }] }),
      });

      await expect(getShippingRates(ADDRESS, ADDRESS_TO, PARCEL)).rejects.toThrow(ShippingLabelPurchaseError);
    });

    it('throws when no Shippo token is configured', async () => {
      delete process.env.SHIPPO_TEST_TOKEN;
      await expect(getShippingRates(ADDRESS, ADDRESS_TO, PARCEL)).rejects.toThrow(/token/i);
    });
  });

  describe('buyLabelForRate', () => {
    // Live-verified 2026-09-05 (first real Chrome QA pass on ADR-115 Phase 2, a real
    // production label purchase): Shippo's real /transactions/ response returns `rate` as a
    // plain object_id STRING, not the expanded {provider, amount} object this suite originally
    // mocked -- that wrong mock shape is exactly how the carrier:'Unknown'/costCents:0 bug
    // shipped with green tests. Every case below now mocks `rate` as the real string shape.
    it('parses a successful transaction into a label result, using knownRate for carrier/cost', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object_id: 'txn_1',
          object_state: 'VALID',
          tracking_number: '9334620845500001339632',
          tracking_url_provider: 'https://tools.usps.com/go/TrackConfirmAction_input?origTrackNum=9334620845500001339632',
          label_url: 'https://deliver.goshippo.com/txn_1.pdf',
          rate: 'rate_ground', // real API shape: plain id string, not an object
        }),
      });

      const knownRate = { rateId: 'rate_ground', provider: 'USPS', serviceName: 'Ground Advantage', amountCents: 1001, currency: 'USD', estimatedDays: 5 };
      const label = await buyLabelForRate('rate_ground', knownRate);

      expect(label).toEqual({
        transactionId: 'txn_1',
        trackingNumber: '9334620845500001339632',
        trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction_input?origTrackNum=9334620845500001339632',
        labelUrl: 'https://deliver.goshippo.com/txn_1.pdf',
        carrier: 'USPS',
        costCents: 1001,
      });
    });

    // Regression coverage for the bug itself: without knownRate, and with the real string-shaped
    // `rate` field, carrier/cost cannot be recovered from the transaction response alone -- this
    // documents that real constraint rather than silently re-hiding it.
    it('falls back to Unknown/0 when no knownRate is given and Shippo returns rate as a plain id string', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object_id: 'txn_1b',
          object_state: 'VALID',
          tracking_number: '9334620845500001339633',
          tracking_url_provider: null,
          label_url: 'https://deliver.goshippo.com/txn_1b.pdf',
          rate: 'rate_ground',
        }),
      });

      const label = await buyLabelForRate('rate_ground');

      expect(label.carrier).toBe('Unknown');
      expect(label.costCents).toBe(0);
    });

    // Live-verified failure mode this session: buying a label without phone+email on both
    // addresses succeeds at the shipment step but fails HERE with this exact message.
    it('throws ShippingLabelPurchaseError with Shippo messages on sender_info_missing', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object_id: 'txn_2',
          object_state: 'ERROR',
          messages: [{ source: 'USPS', code: 'sender_info_missing', text: 'Seller email and phone number required for USPS.' }],
        }),
      });

      await expect(buyLabelForRate('rate_ground')).rejects.toMatchObject({
        name: 'ShippingLabelPurchaseError',
        shippoMessages: [{ source: 'USPS', code: 'sender_info_missing', text: expect.stringContaining('required for USPS') }],
      });
    });
  });

  describe('buyCheapestLabel', () => {
    it('rate-shops then buys the cheapest of several valid rates', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'SUCCESS',
            rates: [
              { object_id: 'rate_express', provider: 'USPS', servicelevel: { name: 'Priority Mail Express' }, amount: '55.79', currency: 'USD' },
              { object_id: 'rate_ground', provider: 'USPS', servicelevel: { name: 'Ground Advantage' }, amount: '10.01', currency: 'USD' },
              { object_id: 'rate_priority', provider: 'USPS', servicelevel: { name: 'Priority Mail' }, amount: '11.41', currency: 'USD' },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            object_id: 'txn_cheapest',
            object_state: 'VALID',
            tracking_number: 'TRACK123',
            tracking_url_provider: null,
            label_url: 'https://deliver.goshippo.com/txn_cheapest.pdf',
            rate: 'rate_ground', // real API shape: plain id string, not an object
          }),
        });

      const { rates, label } = await buyCheapestLabel(ADDRESS, ADDRESS_TO, PARCEL);

      expect(rates).toHaveLength(3);
      // The transactions/ call (2nd fetch) must have been made against the cheapest rate id.
      const secondCallBody = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
      expect(secondCallBody.rate).toBe('rate_ground');
      // costCents/carrier must come from the rate-shopping step (knownRate), not the
      // transaction response -- this is the ADR-115 Phase 2 carrier/cost bug fix.
      expect(label.costCents).toBe(1001);
      expect(label.carrier).toBe('USPS');
    });

    it('throws when Shippo returns zero rates', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'SUCCESS', rates: [] }),
      });

      await expect(buyCheapestLabel(ADDRESS, ADDRESS_TO, PARCEL)).rejects.toThrow(ShippingLabelPurchaseError);
    });
  });
});
