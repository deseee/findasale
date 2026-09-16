/**
 * Address Controller (ADR-126, 2026-09-16)
 *
 * Shopper-facing CRUD over the new `Address` table, plus one read-only convenience
 * endpoint (`getCheckoutAddressDefaults`) that native checkout uses to decide what to
 * pre-fill. Every write here is either the shopper managing their own saved addresses in
 * Account Settings, or the opt-in "save this address" checkbox on checkout/invoice --
 * never a silent write (ADR-126 §9.4).
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  getDefaultAddress,
  listAddresses,
  saveOrUpdateDefaultAddress,
  findGuestPromotionAddress,
  AddressRole,
} from '../services/addressService';

const VALID_ROLES: AddressRole[] = ['SHIP_TO', 'SHIP_FROM'];

function normalizeRole(value: unknown): AddressRole {
  return value === 'SHIP_FROM' ? 'SHIP_FROM' : 'SHIP_TO';
}

/** GET /api/users/me/addresses -- every saved address this shopper has, default first. */
export const listMyAddresses = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const role = typeof req.query.role === 'string' && VALID_ROLES.includes(req.query.role as AddressRole)
      ? (req.query.role as AddressRole)
      : undefined;
    const addresses = await listAddresses(req.user.id, role);
    return res.json({ addresses });
  } catch (error) {
    console.error('[addressController] listMyAddresses error:', error);
    return res.status(500).json({ message: 'Failed to load saved addresses' });
  }
};

/**
 * POST /api/users/me/addresses -- explicit, opt-in save (the checkout/invoice "save this
 * address" checkbox, or a shopper adding one directly in Account Settings). Body:
 * { recipientName?, line1, line2?, city, state, zip, country?, phone?, label?, role?,
 *   makeDefault? }.
 */
export const createMyAddress = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { recipientName, line1, line2, city, state, zip, country, phone, label, role, makeDefault } = req.body as {
      recipientName?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      phone?: string;
      label?: string;
      role?: string;
      makeDefault?: boolean;
    };

    if (!line1 || typeof line1 !== 'string' || !line1.trim()) {
      return res.status(400).json({ message: 'Street address is required' });
    }
    if (!city || typeof city !== 'string' || !city.trim()) {
      return res.status(400).json({ message: 'City is required' });
    }
    if (!state || typeof state !== 'string' || !state.trim()) {
      return res.status(400).json({ message: 'State is required' });
    }
    if (!zip || typeof zip !== 'string' || !/^\d{5}(-\d{4})?$/.test(zip.trim())) {
      return res.status(400).json({ message: 'A valid US ZIP code is required' });
    }

    const resolvedRole = normalizeRole(role);
    // First address for this role always becomes the default, regardless of makeDefault --
    // otherwise a shopper's very first saved address would silently not show up as the
    // fast-path autofill (ADR-126 §9.1: fast-path UI shows only the default).
    const existingCount = await prisma.address.count({ where: { userId: req.user.id, role: resolvedRole } });
    const shouldBeDefault = makeDefault === true || existingCount === 0;

    if (shouldBeDefault) {
      // Reuses the same "exactly one default" transaction as the checkout-save path.
      const saved = await saveOrUpdateDefaultAddress(
        req.user.id,
        { recipientName, line1, line2, city, state, zip, country, phone, label },
        resolvedRole
      );
      return res.status(201).json({ address: saved });
    }

    const created = await prisma.address.create({
      data: {
        userId: req.user.id,
        role: resolvedRole,
        isDefault: false,
        recipientName: (recipientName || '').trim().slice(0, 200) || 'Recipient',
        line1: line1.trim().slice(0, 200),
        line2: line2 && line2.trim() ? line2.trim().slice(0, 200) : null,
        city: city.trim().slice(0, 100),
        state: state.trim().slice(0, 50),
        zip: zip.trim().slice(0, 10),
        country: (country || 'US').trim().slice(0, 2).toUpperCase() || 'US',
        phone: phone && phone.trim() ? phone.trim().slice(0, 30) : null,
        label: label && label.trim() ? label.trim().slice(0, 50) : null,
      },
    });
    return res.status(201).json({ address: created });
  } catch (error) {
    console.error('[addressController] createMyAddress error:', error);
    return res.status(500).json({ message: 'Failed to save address' });
  }
};

/** PATCH /api/users/me/addresses/:id -- edit a saved address, or set it as the default. */
export const updateMyAddress = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const { id } = req.params;

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ message: 'Address not found' });
    }

    const { recipientName, line1, line2, city, state, zip, country, phone, label, isDefault } = req.body as {
      recipientName?: string;
      line1?: string;
      line2?: string | null;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      phone?: string | null;
      label?: string | null;
      isDefault?: boolean;
    };

    if (zip !== undefined && !/^\d{5}(-\d{4})?$/.test(String(zip).trim())) {
      return res.status(400).json({ message: 'A valid US ZIP code is required' });
    }

    const data: Record<string, unknown> = {};
    if (recipientName !== undefined) data.recipientName = recipientName.trim().slice(0, 200) || 'Recipient';
    if (line1 !== undefined) data.line1 = line1.trim().slice(0, 200);
    if (line2 !== undefined) data.line2 = line2 && line2.trim() ? line2.trim().slice(0, 200) : null;
    if (city !== undefined) data.city = city.trim().slice(0, 100);
    if (state !== undefined) data.state = state.trim().slice(0, 50);
    if (zip !== undefined) data.zip = zip.trim().slice(0, 10);
    if (country !== undefined) data.country = (country || 'US').trim().slice(0, 2).toUpperCase() || 'US';
    if (phone !== undefined) data.phone = phone && phone.trim() ? phone.trim().slice(0, 30) : null;
    if (label !== undefined) data.label = label && label.trim() ? label.trim().slice(0, 50) : null;

    if (isDefault === true) {
      // Same "exactly one default per user+role" invariant as saveOrUpdateDefaultAddress.
      const updated = await prisma.$transaction(async (tx) => {
        await tx.address.updateMany({
          where: { userId: req.user!.id, role: existing.role, isDefault: true },
          data: { isDefault: false },
        });
        return tx.address.update({ where: { id }, data: { ...data, isDefault: true } });
      });
      return res.json({ address: updated });
    }

    const updated = await prisma.address.update({ where: { id }, data });
    return res.json({ address: updated });
  } catch (error) {
    console.error('[addressController] updateMyAddress error:', error);
    return res.status(500).json({ message: 'Failed to update address' });
  }
};

/** DELETE /api/users/me/addresses/:id */
export const deleteMyAddress = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const { id } = req.params;

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ message: 'Address not found' });
    }

    await prisma.address.delete({ where: { id } });
    return res.json({ deleted: true });
  } catch (error) {
    console.error('[addressController] deleteMyAddress error:', error);
    return res.status(500).json({ message: 'Failed to delete address' });
  }
};

/**
 * GET /api/users/me/checkout-address-defaults -- what native checkout should pre-fill,
 * per ADR-126 §5. Prefers a real saved default Address; falls back to the quiet
 * guest-to-account promotion (§4/§9.5) when the shopper has never saved one but has a
 * past guest order under this same email. Never both -- a real saved Address always wins.
 */
export const getCheckoutAddressDefaults = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const savedAddress = await getDefaultAddress(req.user.id, 'SHIP_TO');
    if (savedAddress) {
      return res.json({ savedAddress, guestPromotionAddress: null });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } });
    const guestPromotionAddress = user ? await findGuestPromotionAddress(user.email) : null;
    return res.json({ savedAddress: null, guestPromotionAddress });
  } catch (error) {
    console.error('[addressController] getCheckoutAddressDefaults error:', error);
    return res.status(500).json({ message: 'Failed to load address defaults' });
  }
};
