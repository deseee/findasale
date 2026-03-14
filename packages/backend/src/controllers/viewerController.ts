import { Request, Response } from 'express';

interface ViewerSession {
  viewerId: string;
  lastPing: number;
}

// In-memory store: saleId -> Set of viewerId:lastPing pairs
const saleViewers = new Map<string, Map<string, ViewerSession>>();

// Auto-expire viewers after 60 seconds of no ping
const VIEWER_EXPIRY_MS = 60000;
const PING_INTERVAL_MS = 30000; // Clients should ping every ~30s

// Cleanup task: remove expired viewers every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [saleId, viewers] of saleViewers.entries()) {
    for (const [viewerId, session] of viewers.entries()) {
      if (now - session.lastPing > VIEWER_EXPIRY_MS) {
        viewers.delete(viewerId);
      }
    }
    // Clean up empty sale entries
    if (viewers.size === 0) {
      saleViewers.delete(saleId);
    }
  }
}, PING_INTERVAL_MS);

/**
 * GET /api/sales/:saleId/viewers
 * Returns the current viewer count for a sale.
 * Only returns count >= 2 (hide single viewers for privacy).
 */
export const getViewerCount = (req: Request, res: Response) => {
  const { saleId } = req.params;

  if (!saleId) {
    return res.status(400).json({ error: 'saleId is required' });
  }

  const viewers = saleViewers.get(saleId);
  const count = viewers ? viewers.size : 0;

  // Filter by minimum threshold: only show "2 or more"
  const displayCount = count >= 2 ? count : 0;

  res.json({
    saleId,
    count: displayCount,
    threshold: 2,
  });
};

/**
 * POST /api/sales/:saleId/viewers/ping
 * Registers or refreshes a viewer session.
 * Body: { viewerId: string }
 */
export const pingViewer = (req: Request, res: Response) => {
  const { saleId } = req.params;
  const { viewerId } = req.body;

  if (!saleId || !viewerId) {
    return res.status(400).json({ error: 'saleId and viewerId are required' });
  }

  // Initialize sale viewers map if needed
  if (!saleViewers.has(saleId)) {
    saleViewers.set(saleId, new Map());
  }

  const viewers = saleViewers.get(saleId)!;
  viewers.set(viewerId, {
    viewerId,
    lastPing: Date.now(),
  });

  res.json({
    saleId,
    viewerId,
    status: 'pinged',
  });
};

/**
 * DELETE /api/sales/:saleId/viewers/:viewerId
 * Removes a viewer session on unmount.
 */
export const removeViewer = (req: Request, res: Response) => {
  const { saleId, viewerId } = req.params;

  if (!saleId || !viewerId) {
    return res.status(400).json({ error: 'saleId and viewerId are required' });
  }

  const viewers = saleViewers.get(saleId);
  if (viewers) {
    viewers.delete(viewerId);
    // Clean up empty sale entries
    if (viewers.size === 0) {
      saleViewers.delete(saleId);
    }
  }

  res.json({
    saleId,
    viewerId,
    status: 'removed',
  });
};
