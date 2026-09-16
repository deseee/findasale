/**
 * Address Service (ADR-126, 2026-09-16)
 *
 * Shared helpers for the new `Address` table -- a real, reusable, editable saved address
 * owned by a User (see schema.prisma's Address model comment for the full design writeup
 * and claude_docs/architecture/ADR-126-shipping-address-data-model.md for the ADR).
 *
 * Deliberately thin: every caller (addressController.ts, squarePaymentController.ts,
 * guestInvoiceController.ts) needs the exact same three operations --
 * read-the-default-for-prefill, save-or-update-the-default-on-opt-in-checkbox, and
 * find-a-guest's-past-order-address-for-promotion -- so they live here once instead of
 * being reimplemented per call site.
 */

import { prisma } from '../lib/prisma';

export type AddressRole = 'SHIP_TO' | 'SHIP_FROM';

export interface AddressInput {
  recipientName?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
  country?: string | null;
  phone?: string | null;
  label?: string | null;
}

/**
 * The shopper's default saved address for a given role (SHIP_TO by default). Used to
 * pre-fill checkout/invoice forms (ADR-126 §5) -- never returns anything for a guest
 * (Address.userId is required; a guest by definition has no User row).
 */
export async function getDefaultAddress(userId: string, role: AddressRole = 'SHIP_TO') {
  return prisma.address.findFirst({
    where: { userId, role, isDefault: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function listAddresses(userId: string, role?: AddressRole) {
  return prisma.address.findMany({
    where: { userId, ...(role ? { role } : {}) },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
}

/**
 * Opt-in "save this address" (ADR-126 §5 / §9.4 -- Patrick's call: an explicit
 * checkbox/confirm before anything gets saved to a shopper's account, NEVER silent). Only
 * ever called from a code path that already confirmed the shopper checked that box.
 *
 * If the shopper already has a default address for this role, this UPDATES it in place
 * (matches ADR-126 §5's "prompted to save the change back to their default Address" --
 * not a second row every time they tweak an apartment number). If they have none yet,
 * this CREATES the first one and marks it default. Never creates a second default: any
 * other row for this user+role that happened to be isDefault is atomically un-defaulted
 * first so the "exactly one default per user+role" invariant always holds.
 */
export async function saveOrUpdateDefaultAddress(
  userId: string,
  input: AddressInput,
  role: AddressRole = 'SHIP_TO'
) {
  const data = {
    recipientName: (input.recipientName || '').trim().slice(0, 200) || 'Recipient',
    line1: input.line1.trim().slice(0, 200),
    line2: input.line2 && input.line2.trim() ? input.line2.trim().slice(0, 200) : null,
    city: input.city.trim().slice(0, 100),
    state: input.state.trim().slice(0, 50),
    zip: input.zip.trim().slice(0, 10),
    country: (input.country || 'US').trim().slice(0, 2).toUpperCase() || 'US',
    phone: input.phone && input.phone.trim() ? input.phone.trim().slice(0, 30) : null,
    label: input.label && input.label.trim() ? input.label.trim().slice(0, 50) : null,
  };

  return prisma.$transaction(async (tx) => {
    const existingDefault = await tx.address.findFirst({ where: { userId, role, isDefault: true } });

    if (existingDefault) {
      return tx.address.update({ where: { id: existingDefault.id }, data });
    }

    // Defense in depth: unset any stray isDefault rows for this user+role before creating
    // the new one, so a data inconsistency never produces two defaults at once.
    await tx.address.updateMany({ where: { userId, role, isDefault: true }, data: { isDefault: false } });

    return tx.address.create({ data: { ...data, userId, role, isDefault: true } });
  });
}

export interface GuestPromotionAddress {
  recipientName: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  source: 'purchase' | 'hold_invoice';
  sourceDate: Date;
}

/**
 * ADR-126 §4 (guest-to-account promotion, Patrick's §9.5 call: QUIET, never a proactive
 * "we found a past order, save this address?" prompt at signup). Finds the most recent
 * address on file for this email from either the guest-checkout path (Purchase.buyerEmail,
 * userId null) or the guest-invoice path (HoldInvoice.guestEmail) -- whichever is more
 * recent wins. Returns null when there is nothing to promote (the normal case for anyone
 * who was never a guest, or a guest order that never collected shipping). Callers are
 * responsible for only using this as a PRE-FILL, never for auto-saving an Address row --
 * that still requires the person's own explicit opt-in confirm at checkout/invoice time.
 */
export async function findGuestPromotionAddress(email: string): Promise<GuestPromotionAddress | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const [purchase, holdInvoice] = await Promise.all([
    prisma.purchase.findFirst({
      where: { userId: null, buyerEmail: normalizedEmail, shippingAddressLine1: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        guestName: true,
        shippingAddressLine1: true,
        shippingAddressLine2: true,
        shippingCity: true,
        shippingState: true,
        shippingZip: true,
        shippingCountry: true,
        createdAt: true,
      },
    }),
    prisma.holdInvoice.findFirst({
      where: { shopperUserId: null, guestEmail: normalizedEmail, shippingAddressLine1: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        guestName: true,
        shippingAddressLine1: true,
        shippingAddressLine2: true,
        shippingCity: true,
        shippingState: true,
        shippingZip: true,
        shippingCountry: true,
        createdAt: true,
      },
    }),
  ]);

  const candidates: GuestPromotionAddress[] = [];
  if (purchase?.shippingAddressLine1) {
    candidates.push({
      recipientName: purchase.guestName ?? null,
      line1: purchase.shippingAddressLine1,
      line2: purchase.shippingAddressLine2 ?? null,
      city: purchase.shippingCity ?? '',
      state: purchase.shippingState ?? '',
      zip: purchase.shippingZip ?? '',
      country: purchase.shippingCountry ?? 'US',
      source: 'purchase',
      sourceDate: purchase.createdAt,
    });
  }
  if (holdInvoice?.shippingAddressLine1) {
    candidates.push({
      recipientName: holdInvoice.guestName ?? null,
      line1: holdInvoice.shippingAddressLine1,
      line2: holdInvoice.shippingAddressLine2 ?? null,
      city: holdInvoice.shippingCity ?? '',
      state: holdInvoice.shippingState ?? '',
      zip: holdInvoice.shippingZip ?? '',
      country: holdInvoice.shippingCountry ?? 'US',
      source: 'hold_invoice',
      sourceDate: holdInvoice.createdAt,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.sourceDate.getTime() - a.sourceDate.getTime());
  return candidates[0];
}
