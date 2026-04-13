/**
 * Brand Kit Controller
 *
 * Handles brand kit operations for organizers:
 * - GET /api/organizers/:id/brand-kit — public: fetch brand data by organizer ID
 * - GET /api/organizers/by-slug/:slug/brand-kit — public: fetch brand data by custom slug
 * - PATCH /api/organizer/brand-kit — authenticated: update brand kit (PRO tier only)
 */

import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

/**
 * GET /api/organizers/:id/brand-kit
 * Public endpoint: fetch organizer's brand kit by ID
 */
export const getBrandKit = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const organizer = await prisma.organizer.findUnique({
      where: { id },
      select: {
        id: true,
        businessName: true,
        bio: true,
        profilePhoto: true,
        website: true,
        facebook: true,
        instagram: true,
        etsy: true,
        brandLogoUrl: true,
        brandPrimaryColor: true,
        brandSecondaryColor: true,
        brandFontFamily: true,
        brandBannerImageUrl: true,
        brandAccentColor: true,
        customStorefrontSlug: true,
        subscriptionTier: true,
      },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    res.json(organizer);
  } catch (error) {
    console.error('Error fetching brand kit:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/organizers/by-slug/:slug/brand-kit
 * Public endpoint: fetch organizer's brand kit by custom slug
 */
export const getBrandKitBySlug = async (req: AuthRequest, res: Response) => {
  try {
    const { slug } = req.params;

    const organizer = await prisma.organizer.findUnique({
      where: { customStorefrontSlug: slug },
      select: {
        id: true,
        businessName: true,
        bio: true,
        profilePhoto: true,
        website: true,
        facebook: true,
        instagram: true,
        etsy: true,
        brandLogoUrl: true,
        brandPrimaryColor: true,
        brandSecondaryColor: true,
        brandFontFamily: true,
        brandBannerImageUrl: true,
        brandAccentColor: true,
        customStorefrontSlug: true,
        subscriptionTier: true,
      },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer storefront not found' });
    }

    res.json(organizer);
  } catch (error) {
    console.error('Error fetching brand kit by slug:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PATCH /api/organizer/brand-kit
 * Authenticated endpoint: update current organizer's brand kit
 * PRO tier only for: brandFontFamily, brandBannerImageUrl, brandAccentColor
 */
export const updateBrandKit = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const {
      customStorefrontSlug,
      brandFontFamily,
      brandBannerImageUrl,
      brandAccentColor,
      brandLogoUrl,
      brandPrimaryColor,
      brandSecondaryColor,
    } = req.body;

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true, subscriptionTier: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Tier check: PRO fields only for PRO or TEAMS tier
    const isPro = organizer.subscriptionTier === 'PRO' || organizer.subscriptionTier === 'TEAMS';
    if (!isPro && (brandFontFamily || brandBannerImageUrl || brandAccentColor)) {
      return res.status(403).json({
        message: 'PRO tier required for advanced brand kit features (font, banner, accent color)',
      });
    }

    // Check if customStorefrontSlug is already taken (and it's not the current org's slug)
    if (customStorefrontSlug) {
      const existing = await prisma.organizer.findUnique({
        where: { customStorefrontSlug },
      });
      if (existing && existing.id !== organizer.id) {
        return res.status(409).json({ message: 'This storefront slug is already in use' });
      }
    }

    const updated = await prisma.organizer.update({
      where: { userId: req.user.id },
      data: {
        ...(customStorefrontSlug !== undefined && { customStorefrontSlug }),
        ...(brandLogoUrl !== undefined && { brandLogoUrl }),
        ...(brandPrimaryColor !== undefined && { brandPrimaryColor }),
        ...(brandSecondaryColor !== undefined && { brandSecondaryColor }),
        ...(brandFontFamily !== undefined && { brandFontFamily }),
        ...(brandBannerImageUrl !== undefined && { brandBannerImageUrl }),
        ...(brandAccentColor !== undefined && { brandAccentColor }),
      },
      select: {
        id: true,
        businessName: true,
        bio: true,
        profilePhoto: true,
        website: true,
        brandLogoUrl: true,
        brandPrimaryColor: true,
        brandSecondaryColor: true,
        brandFontFamily: true,
        brandBannerImageUrl: true,
        brandAccentColor: true,
        customStorefrontSlug: true,
        subscriptionTier: true,
      },
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating brand kit:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'This storefront slug is already in use' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};
