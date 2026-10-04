import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';
import {
  etsyKillSwitch,
  connectEtsyEndpoint,
  etsyCallbackEndpoint,
  getEtsyConnectionEndpoint,
  disconnectEtsyEndpoint,
  getEtsyShopSetupEndpoint,
  putEtsyShopSetupEndpoint,
} from '../controllers/etsyConnectController';

// ADR-135 batch B1. Etsy connection routes, mounted by the wiring batch at /api/etsy (index.ts).
//
// Every route below runs the kill switch FIRST (503 { code: 'ETSY_DISABLED' } unless
// ETSY_CONNECTOR_ENABLED is exactly 'true'), then authenticate + requireOrganizer, and every handler
// derives the organizer from the JWT subject; none accepts an organizer id from the client.
//
// The kill switch is applied per route on purpose, never with router.use: other routers share the
// /api/etsy prefix (items, taxonomy, and the public webhook, which must keep answering 200 when the
// connector is off), and a router-level 503 here would swallow them.
//
// paymentLimiter (5 requests per minute per user) sits on every route that creates a state row,
// exchanges a real OAuth code, or spends Etsy API budget (shop-setup makes up to 3 Etsy calls).
const router = Router();

// Start the OAuth flow: returns { authorizeUrl } as JSON (not a 302) so the JWT header is used.
router.get('/connect', etsyKillSwitch, authenticate, requireOrganizer, paymentLimiter, connectEtsyEndpoint);

// Finish the OAuth flow. Authenticated POST bound to the organizer and user that started it.
router.post('/callback', etsyKillSwitch, authenticate, requireOrganizer, paymentLimiter, etsyCallbackEndpoint);

// Local connection state (no Etsy call). The disabled case answers 503 with { enabled: false }.
router.get('/connection', etsyKillSwitch, authenticate, requireOrganizer, getEtsyConnectionEndpoint);
router.delete('/connection', etsyKillSwitch, authenticate, requireOrganizer, disconnectEtsyEndpoint);

// Shipping profiles, return policies and processing profiles, and saving the organizer's defaults.
router.get('/shop-setup', etsyKillSwitch, authenticate, requireOrganizer, paymentLimiter, getEtsyShopSetupEndpoint);
router.put('/shop-setup', etsyKillSwitch, authenticate, requireOrganizer, paymentLimiter, putEtsyShopSetupEndpoint);

export default router;
