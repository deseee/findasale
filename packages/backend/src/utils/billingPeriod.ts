/**
 * billingPeriod.ts -- the ONE way subscription periods (organizer PRO/TEAMS, Hunt Pass), trial ends and
 * dunning retry / grace deadlines are advanced (2026-09-30).
 *
 * A billing period is a fixed number of 24-hour days added to an exact instant. It is done with plain
 * UTC millisecond arithmetic, never Date#setDate: setDate works in the SERVER's local time zone, so
 * across a daylight-saving change "+30 days" lands 23 or 25 hours off (and differs between a laptop
 * and the production host), while the subscribe path used `+ 30 * 86400000`. The renewal job's
 * period-end guard (`billingCurrentPeriodEnd === the period it billed`) and the ledger's period key
 * both depend on every writer producing byte-identical instants, so all writers must use this.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The ledger key (OrganizerBillingCharge.periodKey) for the organizer billing period that ENDED at
 * `periodEnd`. The daily renewal job and createSquareBillingSubscription (when the organizer's period
 * end is already past) both build the key here, so they claim the SAME row for the same period and can
 * never both charge it. Pure and dependency-free so no test has to mock the ledger to get it.
 */
export function renewalPeriodKey(periodEnd: Date): string {
  return `renewal:${periodEnd.toISOString()}`;
}

/** `date` plus `days` 24-hour days, as an exact UTC-millisecond offset (DST and server-time-zone proof). */
export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}
