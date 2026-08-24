/**
 * Charm Pricing -- rounds a raw price to a psychological price ending in
 * .49 or .99 (e.g. $12.50 -> $12.49, $10.00 -> $9.99). Applied everywhere a
 * suggested/estimated price is shown to an organizer, so every pricing path
 * (AI vision guess, manual "Get a Price Suggestion", and the multi-source
 * pricing engine) produces consistent, deliberate-looking prices instead of
 * round or half-dollar numbers.
 *
 * See claude_docs/feature-notes/ADR-charm-pricing-discogs-comp-wiring-2026-08-24.md
 */

const MIN_CHARM_PRICE = 0.49;

/**
 * Round a dollar amount to the nearest charm price (.49 or .99 ending).
 * Rounds to the nearest half-dollar first, then subtracts a cent so a
 * .00 lands on the prior dollar's .99 and a .50 lands on that dollar's .49.
 * A value already ending in .49/.99 is left unchanged. Invalid input (NaN,
 * Infinity, very low/negative amounts) floors at $0.49.
 */
export function applyCharmPricing(rawPrice: number): number {
  if (rawPrice == null || !isFinite(rawPrice)) {
    return MIN_CHARM_PRICE;
  }

  const roundedToHalf = Math.round(rawPrice * 2) / 2; // nearest .00 or .50
  const charm = Math.round((roundedToHalf - 0.01) * 100) / 100; // avoid float drift

  return Math.max(charm, MIN_CHARM_PRICE);
}

/**
 * Same as applyCharmPricing but for values expressed in cents (used by the
 * multi-source pricing engine, which works in cents throughout).
 */
export function applyCharmPricingCents(rawCents: number): number {
  const dollars = applyCharmPricing(rawCents / 100);
  return Math.round(dollars * 100);
}
