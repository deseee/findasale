// ---------------------------------------------------------------------------------------------
// Thin wrappers around lib/saleLocationPrivacy for public / discovery / shopper-facing surfaces
// (2026-10-13). Street address only for signed-in viewers from the day before the sale starts (sale
// local time); owner organizer and admin always. In list contexts only owner/admin are privileged.
// Select GATE_ORGANIZER_SELECT on the sale's organizer so the owner check and the sale time zone
// work; gateSalesForViewer strips those helper keys again unless the endpoint already returned them.
// ---------------------------------------------------------------------------------------------
import { redactSalesForViewer, notEmbargoedForPublicWhere } from './saleLocationPrivacy';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

/** Organizer fields the gate needs (owner check + sale local time zone). */
export const GATE_ORGANIZER_SELECT = { userId: true, timezone: true } as const;

type Viewer = { id?: string; role?: string } | null | undefined;

/** Gates every sale in a list for the viewer and removes gate-only organizer keys. */
export function gateSalesForViewer<T extends Record<string, any>>(
  sales: T[],
  viewer: Viewer,
  keepOrganizerKeys: string[] = [],
  now: Date = new Date()
): T[] {
  return redactSalesForViewer(sales, viewer, now).map((s: any) => {
    if (!s || !s.organizer || typeof s.organizer !== 'object') return s;
    const organizer = { ...s.organizer };
    for (const k of ['userId', 'timezone']) if (!keepOrganizerKeys.includes(k)) delete organizer[k];
    return { ...s, organizer };
  });
}

/** Single-sale variant of gateSalesForViewer. */
export function gateSaleForViewer<T extends Record<string, any>>(
  sale: T,
  viewer: Viewer,
  keepOrganizerKeys: string[] = [],
  now: Date = new Date()
): T {
  if (!sale) return sale;
  return gateSalesForViewer([sale], viewer, keepOrganizerKeys, now)[0];
}

/**
 * Gates a nested `sale` on each row (items, favorites, trail stops, ...). Rows without a sale object are
 * returned unchanged.
 */
export function gateNestedSales<T extends Record<string, any>>(
  rows: T[],
  viewer: Viewer,
  key: string = 'sale',
  keepOrganizerKeys: string[] = [],
  now: Date = new Date()
): T[] {
  return rows.map((r: any) => {
    if (!r || !r[key] || typeof r[key] !== 'object') return r;
    return { ...r, [key]: gateSaleForViewer(r[key], viewer, keepOrganizerKeys, now) };
  });
}

/** Item where for anything listed or counted publicly: public status AND not inside an early-access window. */
export function publicItemWhere(now: Date = new Date()) {
  return { AND: [PUBLIC_ITEM_FILTER, notEmbargoedForPublicWhere(now)] };
}

/** Organizer fields that must never be sent on a public surface. */
export function stripOrganizerPrivateFields<T extends Record<string, any>>(organizer: T): T {
  if (!organizer || typeof organizer !== 'object') return organizer;
  const out: any = { ...organizer };
  if ('address' in out) out.address = '';
  if ('phone' in out) delete out.phone;
  return out;
}
