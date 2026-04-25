import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

/**
 * QR Scanner Controller — Phase 2: Scan Analytics
 * Track QR code engagement across sales
 */

/**
 * Record a QR scan event
 * POST /api/qr-scanner/event
 * Auth: optional JWT (use optionalAuthenticate middleware)
 *
 * Fire-and-forget pattern: always returns 200 to not block frontend UX
 * Even if there's an error, we log and return success to prevent blocking scanner
 */
export const recordQRScanEvent = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { saleId, eventType, decodedUrl, deviceType } = req.body;

    // Validate eventType — valid values per ADR-072
    const validEventTypes = ['SCAN_INITIATED', 'SCAN_DECODED_ON_DOMAIN', 'SCAN_DECODED_OFF_DOMAIN', 'SCAN_CAMERA_DENIED', 'SCAN_COMPLETED'];
    if (!eventType || !validEventTypes.includes(eventType)) {
      console.warn('[qrScannerController] Invalid eventType:', eventType);
      // Fire-and-forget: return 200 to not block frontend
      res.status(200).json({ success: true });
      return;
    }

    // Compute IP hash from request IP
    const clientIp = req.ip || req.socket?.remoteAddress || '';
    const ipHash = crypto.createHash('sha256')
      .update(clientIp)
      .digest('hex')
      .slice(0, 16);

    // Get shopper ID from JWT if present
    const shopperId = req.user?.id || null;

    // Create QRScannerEvent record (saleId is optional per frontend)
    const event = await prisma.qrScannerEvent.create({
      data: {
        saleId: saleId || null,
        shopperId,
        eventType,
        decodedUrl: decodedUrl || null,
        deviceType: deviceType || null,
        ipHash
      }
    });

    // Fire-and-forget: always return 200
    res.status(200).json({ success: true, eventId: event.id });
  } catch (error) {
    console.error('[qrScannerController] recordQRScanEvent error:', error);
    // Fire-and-forget: log error but return 200 to not block frontend
    res.status(200).json({ success: true });
  }
};

/**
 * Get QR funnel analytics for a sale
 * GET /api/qr-scanner/funnel?saleId=X&days=30
 * Auth: organizer JWT required (authenticate middleware)
 */
export const getQRFunnel = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Check organizer role
    const hasOrganizerRole =
      req.user?.roles?.includes('ORGANIZER') ||
      req.user?.role === 'ORGANIZER' ||
      req.user?.roles?.includes('ADMIN') ||
      req.user?.role === 'ADMIN';

    if (!req.user || !hasOrganizerRole) {
      res.status(403).json({ message: 'Access denied. Organizer access required.' });
      return;
    }

    const { saleId, days: daysParam } = req.query;

    if (!saleId || typeof saleId !== 'string') {
      res.status(400).json({ message: 'saleId is required' });
      return;
    }

    // Parse days (default 30, min 1, max 365)
    const days = daysParam ? Math.min(Math.max(parseInt(daysParam as string), 1), 365) : 30;

    // Load organizer profile
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id }
    });

    if (!organizer) {
      res.status(404).json({ message: 'Organizer profile not found' });
      return;
    }

    // Verify sale belongs to this organizer
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizerId: organizer.id },
      select: { id: true }
    });

    if (!sale) {
      res.status(404).json({ message: 'Sale not found or access denied' });
      return;
    }

    // Build date window
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Fetch all events for this sale in the time window
    const events = await prisma.qrScannerEvent.findMany({
      where: {
        saleId,
        createdAt: { gte: since }
      }
    });

    // Aggregate metrics
    const totalScanInitiated = events.filter(e => e.eventType === 'SCAN_INITIATED').length;
    const decodedOnDomain = events.filter(e => e.eventType === 'SCAN_DECODED_ON_DOMAIN').length;
    const decodedOffDomain = events.filter(e => e.eventType === 'SCAN_DECODED_OFF_DOMAIN').length;
    const cameraDenied = events.filter(e => e.eventType === 'SCAN_CAMERA_DENIED').length;

    // Conversion rate: on-domain / total scans
    const conversionRate =
      totalScanInitiated > 0
        ? Math.round((decodedOnDomain / totalScanInitiated) * 100)
        : 0;

    // Device breakdown
    const mobileScans = events.filter(e => e.deviceType === 'mobile').length;
    const desktopScans = events.filter(e => e.deviceType === 'desktop').length;

    // Unique shoppers (exclude nulls)
    const shopperIds = new Set(events.filter(e => e.shopperId).map(e => e.shopperId));
    const uniqueShoppers = shopperIds.size;

    res.json({
      saleId,
      funnel: {
        totalScanInitiated,
        decodedOnDomain,
        decodedOffDomain,
        cameraDenied,
        conversionRate
      },
      uniqueShoppers,
      mobileScans,
      desktopScans
    });
  } catch (error) {
    console.error('[qrScannerController] getQRFunnel error:', error);
    res.status(500).json({ message: 'Server error while fetching scanner funnel' });
  }
};
