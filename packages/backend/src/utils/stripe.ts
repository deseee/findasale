import Stripe from 'stripe';

let stripe: Stripe | null = null;
let testStripeInstance: Stripe | null = null;

// Stripe Partners program app info
// When Stripe provides partner_id after acceptance, Patrick adds STRIPE_PARTNER_ID=pp_partner_XXXXX to Railway env
const APP_INFO: Stripe.AppInfo = {
  name: 'FindA.Sale',
  version: '1.0.1',
  url: 'https://finda.sale',
  partner_id: process.env.STRIPE_PARTNER_ID,
};

export const getStripe = (): Stripe => {
  if (!stripe) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables. Set it in your .env file before initializing Stripe.');
    }

    stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      appInfo: APP_INFO,
      timeout: 20000, // 20s network timeout — don't hang a request thread on a stalled Stripe call
      maxNetworkRetries: 2, // retry idempotent Stripe calls twice on network failure
    });
  }
  return stripe;
};

export const getTestStripe = (): Stripe => {
  const testKey = process.env.STRIPE_TEST_SECRET_KEY;
  if (!testKey) {
    return getStripe(); // pre-go-live fallback
  }
  if (!testStripeInstance) {
    testStripeInstance = new Stripe(testKey, {
      apiVersion: '2023-10-16',
      appInfo: APP_INFO,
      timeout: 20000,
      maxNetworkRetries: 2,
    });
  }
  return testStripeInstance;
};

export default getStripe;
