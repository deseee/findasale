import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { createHash } from 'crypto';

/**
 * QR Scanner Controller — Phase 2: Scan Analytics
 * Track QR code engagement across sales
 */

/**
 * Record a QR scan event
 * POST /api/qr-scanner/event
 * Auth: optional JWT (use optionalAuthenticate middleware)
 */
export const recordQRScanEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { saleId, eventType, decodedUrl, deviceType, userAgent } = req.body;

    // Validate required fields
    if (!saleId) {
      res.status(400).json({ error: 'saleId is required' });
      return;
    }

    if (!eventType) {
      res.status(400).json({ error: 'eventType is required' });
      return;
    }

    // Validate eventType
    const validEventTypes = ['SCAN_INITIATED', 'SCAN_DECODED_ON_DOMAIN', 'SCAN_DECODED_OFF_DOMAIN', 'SCAN_CAMERA_DENIED'];
    if (!validEventTypes.includes(eventType)) {
      res.status(400).json({
        error: `Invalid eventType. Must be one of: ${validEventTypes.join(', ')}`
      });
      return;
    }

    // Verify sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId }
    });

    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    // Compute IP hash from request IP
    const clientIp = req.ip || req.socket?.remoteAddress || '';
    const ipHash = createHash('sha256')
      .update(clientIp)
      .digest('hex')
      .slice(0, 16);

    // Get shopper ID from JWT if present
    const shopperId = (req as any).user?.id || null;

    // Create QRScannerEvent record
    const event = await prisma.qRScannerEvent.create({
      data: {
        saleId,
        shopperId,
        eventType,
        decodedUrl: decodedUrl || null,
        deviceType: deviceType || null,
        userAgent: userAgent || null,
        ipHash
      }
    });

    res.status(201).json({
      message: 'QR scan event recorded',
      eventId: event.id
    });
  } catch (error) {
    console.error('[qrScannerController] recordQRScanEvent error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get QR funnel analytics for a sale
 * GET /api/qr-scanner/funnel?saleId=&days=7
 * Auth: organizer JWT required (authenticate middleware)
 */
export const getQRFunnel = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { saleId, days = '7' } = req.query;
    const dayCount = parseInt(days as string, 10) || 7;

    if (!saleId || typeof saleId !== 'string') {
      res.status(400).json({ error: 'saleId query parameter is required' });
      return;
    }

    // Verify sale exists and belongs to authenticated organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true }
    });

    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    // Verify organizer ownership
    const organizerProfile = (req as any).organizerProfile;
    if (sale.organizerId !== organizerProfile.id) {
      res.status(403).json({ error: 'Unauthorized: you do not own this sale' });
      return;
    }

    // Calculate date range
    const now = new Date();
    const fromDate = new Date(now.getTime() - dayCount * 24 * 60 * 60 * 1000);

    // Query QRScannerEvents for this sale within the time window
    const events = await prisma.qRScannerEvent.findMany({
      where: {
        saleId,
        createdAt: {
          gte: fromDate,
          lte: now
        }
      }
    });

    // Compute funnel metrics
    const totalScanInitiated = events.filter(e => e.eventType === 'SCAN_INITIATED').length;
    const decodedOnDomain = events.filter(e => e.eventType === 'SCAN_DECODED_ON_DOMAIN').length;
    const decodedOffDomain = events.filter(e => e.eventType === 'SCAN_DECODED_OFF_DOMAIN').length;
    const cameraDenied = events.filter(e => e.eventType === 'SCAN_CAMERA_DENIED').length;

    // Calculate conversion rate (decoded on domain / scan initiated)
    const conversionRate =
      totalScanInitiated > 0
        ? Math.round((decodedOnDomain / totalScanInitiated) * 100 * 10) / 10
        : 0;

    // Count unique shoppers
    const uniqueShopperIds = new Set(events.filter(e => e.shopperId).map(e => e.shopperId));
    const uniqueShoppers = uniqueShopperIds.size;

    // Device type breakdown
    const mobileScans = events.filter(e => e.deviceType === 'mobile').length;
    const desktopScans = events.filter(e => e.deviceType === 'desktop').length;

    res.status(200).json({
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
    res.status(500).json({ error: 'Internal server error' });
  }
};
