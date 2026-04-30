import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import axios from 'axios';

/**
 * Request verification for the authenticated organizer
 * Requires: auth
 * Returns: 200 with status 'PENDING' or 409 if already pending/verified
 */
export const requestVerification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Organizer profile not found' });
    }

    const organizerId = req.user.organizerProfile.id;

    // Check current verification status
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // If already pending or verified, return 409
    if (organizer.verificationStatus === 'PENDING' || organizer.verificationStatus === 'VERIFIED') {
      return res.status(409).json({
        message: 'Verification already in progress or complete',
        status: organizer.verificationStatus
      });
    }

    // Update status to PENDING, clear notes
    await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        verificationStatus: 'PENDING',
        verificationNotes: null
      }
    });

    return res.json({
      message: 'Verification request submitted',
      status: 'PENDING'
    });
  } catch (error) {
    console.error('Request verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get verification status for the authenticated organizer
 * Requires: auth
 * Returns: { status, verificationNotes, verifiedAt }
 */
export const getVerificationStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Organizer profile not found' });
    }

    const organizerId = req.user.organizerProfile.id;

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: {
        verificationStatus: true,
        verificationNotes: true,
        verifiedAt: true,
        verificationSource: true,
        googlePlaceId: true
      }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    return res.json({
      status: organizer.verificationStatus,
      verificationNotes: organizer.verificationNotes,
      verifiedAt: organizer.verifiedAt,
      verificationSource: organizer.verificationSource,
      googlePlaceId: organizer.googlePlaceId
    });
  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Admin: Approve verification for an organizer
 * Requires: organizerId in params
 * Sets: verificationStatus = 'VERIFIED', verifiedAt = now, clears notes
 */
export const adminApproveVerification = async (req: Request, res: Response) => {
  try {
    const { organizerId } = req.params;

    if (!organizerId) {
      return res.status(400).json({ message: 'organizerId is required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Update to VERIFIED
    await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        verificationNotes: null
      }
    });

    return res.json({
      message: 'Organizer verified'
    });
  } catch (error) {
    console.error('Admin approve verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Admin: Reject verification for an organizer
 * Requires: organizerId in params, optional reason in body
 * Sets: verificationStatus = 'REJECTED', verificationNotes = reason
 */
export const adminRejectVerification = async (req: Request, res: Response) => {
  try {
    const { organizerId } = req.params;
    const { reason } = req.body;

    if (!organizerId) {
      return res.status(400).json({ message: 'organizerId is required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Update to REJECTED
    await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        verificationStatus: 'REJECTED',
        verificationNotes: reason || null
      }
    });

    return res.json({
      message: 'Verification rejected'
    });
  } catch (error) {
    console.error('Admin reject verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Admin: Get pending verification requests
 * Requires: auth + admin
 * Returns: array of organizers with verificationStatus = 'PENDING'
 */
export const getPendingOrganizers = async (req: Request, res: Response) => {
  try {
    const organizers = await prisma.organizer.findMany({
      where: { verificationStatus: 'PENDING' },
      select: {
        id: true,
        businessName: true,
        subscriptionTier: true,
        createdAt: true,
        user: {
          select: {
            email: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return res.json({ organizers });
  } catch (error) {
    console.error('Get pending organizers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Search Google Places by business name/query
 * GET /api/verification/google/search?q=...
 * Requires: auth
 * Returns: top 5 results with placeId, name, address, rating, userRatingsTotal
 */
export const searchGooglePlaces = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Organizer profile not found' });
    }

    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ message: 'Search query required' });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: 'Google Places not configured' });
    }

    // Use browser-supplied lat/lng for location bias if provided
    const { lat, lng } = req.query;
    let locationParams: Record<string, string> = {};
    if (lat && lng && typeof lat === 'string' && typeof lng === 'string') {
      locationParams = {
        location: `${lat},${lng}`,
        radius: '80000' // 80km radius
      };
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
        params: {
          query: q,
          key: apiKey,
          ...locationParams
        },
        timeout: 10000
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        console.error('Google Places API error:', response.data.status);
        return res.status(400).json({ message: 'Search failed' });
      }

      const results = (response.data.results || []).slice(0, 5).map((place: any) => ({
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating || null,
        userRatingsTotal: place.user_ratings_total || 0
      }));

      res.json({ results });
    } catch (axiosError) {
      console.error('Google Places API request failed:', axiosError);
      res.status(500).json({ message: 'Search failed' });
    }
  } catch (error) {
    console.error('Search Google Places error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get preview of Google Place details for verification
 * GET /api/verification/google/preview?placeId=...
 * Requires: auth
 * Returns: { incoming: {...}, current: {...} }
 */
export const previewGooglePlace = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Organizer profile not found' });
    }

    const { placeId } = req.query;
    if (!placeId || typeof placeId !== 'string') {
      return res.status(400).json({ message: 'placeId required' });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: 'Google Places not configured' });
    }

    const organizerId = req.user.organizerProfile.id;

    // Get current organizer data
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: {
        businessName: true,
        address: true,
        phone: true,
        website: true
      }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Get current hours
    const currentHours = await prisma.organizerHours.findMany({
      where: { organizerId },
      select: { dayOfWeek: true, openTime: true, closeTime: true }
    });

    try {
      // Fetch Google Place details
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
        params: {
          place_id: placeId,
          fields: 'name,formatted_address,formatted_phone_number,website,opening_hours,rating,user_ratings_total',
          key: apiKey
        },
        timeout: 10000
      });

      if (response.data.status !== 'OK') {
        console.error('Google Places details error:', response.data.status);
        return res.status(400).json({ message: 'Could not load business details' });
      }

      const place = response.data.result;

      // Convert Google hours to our format
      const incomingHours = [];
      if (place.opening_hours?.periods) {
        const daysUsed = new Set<number>();
        for (const period of place.opening_hours.periods) {
          const dayOfWeek = period.open?.day || 0;
          if (!daysUsed.has(dayOfWeek)) {
            daysUsed.add(dayOfWeek);
            const openTime = period.open?.time || '00:00';
            const closeTime = period.close?.time || '23:59';
            // Convert "1000" → "10:00"
            const openFormatted = `${openTime.slice(0, 2)}:${openTime.slice(2)}`;
            const closeFormatted = `${closeTime.slice(0, 2)}:${closeTime.slice(2)}`;
            incomingHours.push({
              dayOfWeek,
              openTime: openFormatted,
              closeTime: closeFormatted
            });
          }
        }
      }

      res.json({
        incoming: {
          businessName: place.name,
          address: place.formatted_address,
          phone: place.formatted_phone_number || null,
          website: place.website || null,
          hours: incomingHours,
          googlePlaceId: placeId,
          rating: place.rating || null,
          reviewCount: place.user_ratings_total || 0
        },
        current: {
          businessName: organizer.businessName,
          address: organizer.address,
          phone: organizer.phone || null,
          website: organizer.website || null,
          hours: currentHours
        }
      });
    } catch (axiosError) {
      console.error('Google Places details API request failed:', axiosError);
      res.status(500).json({ message: 'Could not load business details' });
    }
  } catch (error) {
    console.error('Preview Google Place error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Confirm Google verification and auto-fill profile
 * POST /api/verification/google/confirm body: { placeId: string }
 * Requires: auth
 * Updates: businessName, address, phone, website, googlePlaceId, verificationSource, verificationStatus, verifiedAt, OrganizerHours
 */
export const confirmGoogleVerification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Organizer profile not found' });
    }

    const { placeId } = req.body;
    if (!placeId) {
      return res.status(400).json({ message: 'placeId required' });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: 'Google Places not configured' });
    }

    const organizerId = req.user.organizerProfile.id;

    // Check if already verified via different source
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { verificationStatus: true, verificationSource: true }
    });

    if (organizer?.verificationStatus === 'VERIFIED' && organizer.verificationSource && organizer.verificationSource !== 'GOOGLE') {
      return res.status(409).json({
        message: `Already verified via ${organizer.verificationSource}`,
        currentSource: organizer.verificationSource
      });
    }

    try {
      // Fetch Google Place details again
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
        params: {
          place_id: placeId,
          fields: 'name,formatted_address,formatted_phone_number,website,opening_hours,rating,user_ratings_total',
          key: apiKey
        },
        timeout: 10000
      });

      if (response.data.status !== 'OK') {
        console.error('Google Places details error:', response.data.status);
        return res.status(400).json({ message: 'Could not verify business' });
      }

      const place = response.data.result;

      // Parse Google hours
      const incomingHours = [];
      const daysUsed = new Set<number>();
      if (place.opening_hours?.periods) {
        for (const period of place.opening_hours.periods) {
          const dayOfWeek = period.open?.day || 0;
          if (!daysUsed.has(dayOfWeek)) {
            daysUsed.add(dayOfWeek);
            const openTime = period.open?.time || '00:00';
            const closeTime = period.close?.time || '23:59';
            const openFormatted = `${openTime.slice(0, 2)}:${openTime.slice(2)}`;
            const closeFormatted = `${closeTime.slice(0, 2)}:${closeTime.slice(2)}`;
            incomingHours.push({
              dayOfWeek,
              openTime: openFormatted,
              closeTime: closeFormatted
            });
          }
        }
      }

      // Atomic transaction: update organizer + hours
      const updatedOrganizer = await prisma.$transaction(async (tx) => {
        // Update organizer
        const updated = await tx.organizer.update({
          where: { id: organizerId },
          data: {
            businessName: place.name,
            address: place.formatted_address,
            phone: place.formatted_phone_number || undefined,
            website: place.website || undefined,
            googlePlaceId: placeId,
            verificationSource: 'GOOGLE',
            verificationStatus: 'VERIFIED',
            verifiedAt: new Date()
          }
        });

        // Upsert hours for days in Google's data
        for (const hour of incomingHours) {
          await tx.organizerHours.upsert({
            where: {
              organizerId_dayOfWeek: {
                organizerId,
                dayOfWeek: hour.dayOfWeek
              }
            },
            create: {
              organizerId,
              dayOfWeek: hour.dayOfWeek,
              openTime: hour.openTime,
              closeTime: hour.closeTime
            },
            update: {
              openTime: hour.openTime,
              closeTime: hour.closeTime
            }
          });
        }

        // Delete hours for days NOT in Google's data (0-6 all days should exist)
        const allDays = [0, 1, 2, 3, 4, 5, 6];
        const googleDays = incomingHours.map(h => h.dayOfWeek);
        for (const day of allDays) {
          if (!googleDays.includes(day)) {
            await tx.organizerHours.deleteMany({
              where: {
                organizerId,
                dayOfWeek: day
              }
            });
          }
        }

        return updated;
      });

      res.json({
        message: 'Business verified',
        verificationStatus: 'VERIFIED',
        verifiedAt: updatedOrganizer.verifiedAt
      });
    } catch (axiosError) {
      console.error('Google Places details API request failed:', axiosError);
      res.status(500).json({ message: 'Could not verify business' });
    }
  } catch (error) {
    console.error('Confirm Google verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
