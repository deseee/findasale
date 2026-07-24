import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { requireBoothTokenOrTeamMember } from '../middleware/requireBoothAuth';
import {
  listVendorBooths,
  createVendorBooth,
  getVendorBooth,
  updateVendorBooth,
  deleteVendorBooth,
  getPublicBoothSummary,
  claimVendorBooth,
  listMyVendorBooths,
  startVendorBoothStripeOnboarding,
  getVendorBoothStripeStatus,
  getVendorBoothPayouts,
} from '../controllers/vendorBoothController';
import {
  startBoothCart,
  addBoothCartItems,
  getBoothCartSummary,
  createBoothCartTerminalConnectionToken,
  authorizeBoothCartTerminalLeg,
  createBoothCartQrSetupIntent,
  authorizeBoothCartQrLegs,
  captureBoothCart,
  cancelBoothCart,
  listBoothCartTransactions,
  searchVendorBoothItems,
} from '../controllers/vendorBoothCartController';
import {
  previewVendorBoothSettlement,
  createVendorBoothSettlementBatch,
  getVendorBoothSettlementBatch,
  approveVendorBoothSettlementBatch,
  retryPendingVendorBoothPayouts,
  recordManualVendorBoothPayout,
} from '../controllers/vendorBoothSettlementController';

const router = Router();

// ============================================================================
// Vendor Booth Payments — Flea Market Multi-Booth Checkout (2026-07-07)
// ADR-015/016/017. Mounted with no router-level prefix (app.use(vendorBoothRoutes)
// in index.ts) — same convention as hubRoutes — since every path below is a
// literal full path. Grepped packages/backend/src/routes/hubs.ts first (per
// CLAUDE.md §7 auth-touching work gate): hubs.ts registers /api/organizer/hubs,
// /api/organizer/hubs/:hubId (GET/PUT/DELETE), /:hubId/join, /:hubId/sales/:saleId,
// /:hubId/event — none of these collide with the /:hubId/vendor-booths,
// /:hubId/cart/*, /:hubId/settlement/* sub-paths registered here.
// ============================================================================

// --- Public / vendor-facing endpoints (no organizer auth) ---

// Authenticated User's own booths across all hubs — MUST be defined before the
// GET /:boothToken route immediately below, not just before /:vendorBoothId
// further down. Express matches route registration order, and ":boothToken" is
// a single-segment wildcard that matches the literal string "my-booths" just as
// readily as a real token — so if this route were registered after, EVERY
// GET /api/vendor-booth/my-booths request would be swallowed by getPublicBoothSummary
// and always 404 with "Booth not found". Live-QA'd S1091: this was exactly the bug
// (my-booths was registered after :boothToken, not just after :vendorBoothId) —
// confirmed via a real authenticated call returning 404 before this fix.
router.get('/api/vendor-booth/my-booths', authenticate, listMyVendorBooths);

// Public, token-gated, read-only booth summary — field-whitelisted (ADR-017)
router.get('/api/vendor-booth/:boothToken', getPublicBoothSummary);

// Authenticated User claims a booth. userId derived exclusively from req.user.id.
router.post('/api/vendor-booth/:boothToken/claim', authenticate, claimVendorBooth);

// Booth owner only (req.user.id === VendorBooth.userId, enforced in controller)
router.post('/api/vendor-booth/:vendorBoothId/stripe/onboard', authenticate, startVendorBoothStripeOnboarding);
router.get('/api/vendor-booth/:vendorBoothId/stripe/status', authenticate, getVendorBoothStripeStatus);
router.get('/api/vendor-booth/:vendorBoothId/payouts', authenticate, getVendorBoothPayouts);

// --- Organizer-only CRUD ---

router.get('/api/organizer/hubs/:hubId/vendor-booths', authenticate, requireTier('TEAMS'), listVendorBooths);
router.post('/api/organizer/hubs/:hubId/vendor-booths', authenticate, requireTier('TEAMS'), createVendorBooth);
router.get('/api/organizer/hubs/:hubId/vendor-booths/:boothId', authenticate, requireTier('TEAMS'), getVendorBooth);
router.put('/api/organizer/hubs/:hubId/vendor-booths/:boothId', authenticate, requireTier('TEAMS'), updateVendorBooth);
router.delete('/api/organizer/hubs/:hubId/vendor-booths/:boothId', authenticate, requireTier('TEAMS'), deleteVendorBooth);

// --- Roaming multi-booth cart (cashier: TeamMember JWT or X-Booth-Token) ---
// optionalAuthenticate() runs first — it populates req.user when a valid Bearer
// token/cookie is present, but calls next() without erroring when it is absent
// (unlike authenticate(), which hard-401s with no token). This lets
// requireBoothTokenOrTeamMember() serve BOTH cases: a TeamMember with a real JWT
// (req.user populated) AND a vendor booth cashier with ONLY an X-Booth-Token header
// and no FindA.Sale session token at all. requireBoothTokenOrTeamMember() itself
// still hard-401s if neither a valid booth token NOR an authenticated req.user is present.
router.post('/api/organizer/hubs/:hubId/cart/start', optionalAuthenticate, requireBoothTokenOrTeamMember(), startBoothCart);
router.post('/api/organizer/hubs/:hubId/cart/:cartTransactionId/items', optionalAuthenticate, requireBoothTokenOrTeamMember(), addBoothCartItems);

// QR-fail fallback (2026-07-24): cashier can search a specific vendor's sellable
// items by keyword when scanning fails. Same auth model as the rest of the cart
// routes -- booth token or team member, scoped to this hub.
router.get('/api/organizer/hubs/:hubId/cart/booths/:vendorBoothId/items', optionalAuthenticate, requireBoothTokenOrTeamMember(), searchVendorBoothItems);

// ADR-020 (2026-07-07): sequential per-booth Standard-account checkout — replaces
// the old single-PaymentIntent /charge + /confirm pair. Terminal rail: booth-scoped
// connection token -> authorize (one physical tap per booth) -> shared /capture.
// QR/in-app rail: one platform SetupIntent -> authorize (clones the PaymentMethod
// into every booth's account, confirms all legs server-side) -> the SAME shared
// /capture. /cancel is the whole-cart-cancel-and-restart path for either rail.
router.get('/api/organizer/hubs/:hubId/cart/:cartTransactionId/summary', optionalAuthenticate, requireBoothTokenOrTeamMember(), getBoothCartSummary);
router.post('/api/organizer/hubs/:hubId/cart/:cartTransactionId/terminal/connection-token', optionalAuthenticate, requireBoothTokenOrTeamMember(), createBoothCartTerminalConnectionToken);
router.post('/api/organizer/hubs/:hubId/cart/:cartTransactionId/terminal/authorize', optionalAuthenticate, requireBoothTokenOrTeamMember(), authorizeBoothCartTerminalLeg);
router.post('/api/organizer/hubs/:hubId/cart/:cartTransactionId/qr/setup-intent', optionalAuthenticate, requireBoothTokenOrTeamMember(), createBoothCartQrSetupIntent);
router.post('/api/organizer/hubs/:hubId/cart/:cartTransactionId/qr/authorize', optionalAuthenticate, requireBoothTokenOrTeamMember(), authorizeBoothCartQrLegs);
router.post('/api/organizer/hubs/:hubId/cart/:cartTransactionId/capture', optionalAuthenticate, requireBoothTokenOrTeamMember(), captureBoothCart);
router.post('/api/organizer/hubs/:hubId/cart/:cartTransactionId/cancel', optionalAuthenticate, requireBoothTokenOrTeamMember(), cancelBoothCart);

// Organizer-only audit view
router.get('/api/organizer/hubs/:hubId/cart-transactions', authenticate, requireTier('TEAMS'), listBoothCartTransactions);

// --- Settlement batches (organizer-only) ---

router.get('/api/organizer/hubs/:hubId/settlement/preview', authenticate, requireTier('TEAMS'), previewVendorBoothSettlement);
router.post('/api/organizer/hubs/:hubId/settlement/batches', authenticate, requireTier('TEAMS'), createVendorBoothSettlementBatch);
router.get('/api/organizer/hubs/:hubId/settlement/batches/:batchId', authenticate, requireTier('TEAMS'), getVendorBoothSettlementBatch);
router.post('/api/organizer/hubs/:hubId/settlement/batches/:batchId/approve', authenticate, requireTier('TEAMS'), approveVendorBoothSettlementBatch);
router.post('/api/organizer/hubs/:hubId/settlement/batches/:batchId/retry-pending', authenticate, requireTier('TEAMS'), retryPendingVendorBoothPayouts);
router.patch('/api/organizer/hubs/:hubId/settlement/payouts/:payoutId', authenticate, requireTier('TEAMS'), recordManualVendorBoothPayout);

export default router;
