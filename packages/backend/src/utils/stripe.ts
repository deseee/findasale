import Stripe from 'stripe';

let stripe: Stripe | null = null;
let testStripeInstance: Stripe | null = null;

export const getStripe = (): Stripe => {
  if (!stripe) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables. Set it in your .env file before initializing Stripe.');
    }

    stripe = new Stripe(stripeKey);
  }
  return stripe;
};

export const getTestStripe = (): Stripe => {
  const testKey = process.env.STRIPE_TEST_SECRET_KEY;
  if (!testKey) {
    return getStripe(); // pre-go-live fallback
  }
  if (!testStripeInstance) {
    testStripeInstance = new Stripe(testKey);
  }
  return testStripeInstance;
};

export default getStripe;