import { Server } from 'socket.io';
import { randomUUID } from 'crypto';

/**
 * LiveFeedService — Feature #70: Real-time activity stream during active sales
 * Stateless in-memory ring buffer per sale: stores last 20 events per saleId
 * TTL: auto-clears events older than 2 hours on push
 */

export interface FeedEvent {
  id: string;
  saleId: string;
  type: 'SOLD' | 'HOLD_PLACED' | 'HOLD_RELEASED' | 'PRICE_DROP';
  itemTitle: string;
  amount?: number; // for SOLD and PRICE_DROP
  timestamp: Date;
}

const MAX_EVENTS_PER_SALE = 20;
const EVENT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes

// In-memory store: saleId → array of events
const feedStore = new Map<string, FeedEvent[]>();

/**
 * Push a new event to a sale's feed and emit to all subscribers
 */
export const pushEvent = (io: Server, saleId: string, event: Omit<FeedEvent, 'id'>): void => {
  try {
    // Get or initialize feed for this sale
    if (!feedStore.has(saleId)) {
      feedStore.set(saleId, []);
    }

    const feed = feedStore.get(saleId)!;

    // Create full event with ID
    const fullEvent: FeedEvent = {
      ...event,
      id: randomUUID(),
      timestamp: event.timestamp || new Date(),
    };

    // Add to front of array (newest first)
    feed.unshift(fullEvent);

    // Keep only last MAX_EVENTS_PER_SALE
    if (feed.length > MAX_EVENTS_PER_SALE) {
      feed.pop();
    }

    // Emit to all clients subscribed to this sale's feed
    io.to(`sale:${saleId}`).emit('FEED_EVENT', fullEvent);

    console.log(`[liveFeed] ${fullEvent.type} event pushed to sale ${saleId}: ${fullEvent.itemTitle}`);
  } catch (error) {
    console.error('[liveFeed] Error pushing event:', error);
  }
};

/**
 * Get recent events for a sale (e.g. when client joins)
 */
export const getRecentEvents = (saleId: string): FeedEvent[] => {
  const feed = feedStore.get(saleId) || [];
  // Filter out events older than TTL
  const now = Date.now();
  return feed.filter((event) => now - event.timestamp.getTime() < EVENT_TTL_MS);
};

/**
 * Initialize live feed cleanup job
 */
export const initLiveFeed = (io: Server): void => {
  console.log('[liveFeed] Initializing live feed service');

  // Periodic cleanup: remove expired events
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    feedStore.forEach((feed, saleId) => {
      const before = feed.length;
      // Remove events older than TTL
      const filtered = feed.filter((event) => now - event.timestamp.getTime() < EVENT_TTL_MS);
      if (filtered.length < before) {
        if (filtered.length === 0) {
          feedStore.delete(saleId);
        } else {
          feedStore.set(saleId, filtered);
        }
      }
    });
  }, CLEANUP_INTERVAL_MS);

  // Cleanup on process shutdown
  process.on('SIGINT', () => {
    clearInterval(cleanupInterval);
  });
};
