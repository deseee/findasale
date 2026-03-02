import Stripe from 'stripe';

let stripe: Stripe | null = null;

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

export default getStripe;
