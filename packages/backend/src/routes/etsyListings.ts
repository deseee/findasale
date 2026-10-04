import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { itemEndpointLimiter, paymentLimiter } from '../middleware/rateLimiter';
import {
  etsyKillSwitch,
  getEtsyEligibilityEndpoint,
  suggestEtsyTaxonomyEndpoint,
  createEtsyDraftEndpoint,
  getEtsyListingEndpoint,
  publishEtsyListingEndpoint,
  endEtsyListingEndpoint,
} from '../controllers/etsyListingController';

// ADR-135 batch B3. Etsy listing lifecycle routes, mounted by the wiring batch at /api/etsy
// (index.ts), next to routes/etsy.ts (connection) and the sync batch's webhook router.
//
// Every route runs the kill switch FIRST (503 { code: 'ETSY_DISABLED' } unless ETSY_CONNECTOR_ENABLED
// is exactly 'true'), then authenticate + requireOrganizer, and every handler derives the organizer
// from the JWT subject and re-checks item ownership; none accepts an organizer id, Etsy listing id or
// shop id from the client. The kill switch is applied per route on purpose, never with router.use, so
// the public webhook router that shares the /api/etsy prefix keeps answering 200 when the connector is off.
//
// ETSY_PUSH_ENABLED (checked inside the draft and publish handlers, 503 { code: 'ETSY_PUSH_DISABLED' })
// blocks draft and publish only; DELETE .../listing (end or discard) always works.
//
// Limiters: paymentLimiter (5 per minute per user) on the routes that spend Etsy calls or money
// (draft, publish, end); itemEndpointLimiter (100 per minute per user) on the read routes the UI
// polls (listing status polls every 2 seconds while a draft is being built).
const router = Router();

// Pre-check for the UI: 200 { eligible: true } or 422 { eligible: false, reason, message } (Discogs shape).
router.get('/items/:id/eligibility', etsyKillSwitch, authenticate, requireOrganizer, itemEndpointLimiter, getEtsyEligibilityEndpoint);

// Category picker: keyword suggestions plus a searchable leaf list.
router.get('/taxonomy/suggest', etsyKillSwitch, authenticate, requireOrganizer, itemEndpointLimiter, suggestEtsyTaxonomyEndpoint);

// Draft first: attest, create the Etsy draft in the background (202).
router.post('/items/:id/draft', etsyKillSwitch, authenticate, requireOrganizer, paymentLimiter, createEtsyDraftEndpoint);

// Local listing status (no Etsy call).
router.get('/items/:id/listing', etsyKillSwitch, authenticate, requireOrganizer, itemEndpointLimiter, getEtsyListingEndpoint);

// Publish: requires { confirm: true }. Etsy charges its listing fee when the listing goes live.
router.post('/items/:id/publish', etsyKillSwitch, authenticate, requireOrganizer, paymentLimiter, publishEtsyListingEndpoint);

// End a live listing or discard a draft.
router.delete('/items/:id/listing', etsyKillSwitch, authenticate, requireOrganizer, paymentLimiter, endEtsyListingEndpoint);

export default router;
