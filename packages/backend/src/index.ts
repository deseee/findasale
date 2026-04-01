import './instrument'; // must be first — initializes Sentry before all other imports
import dotenv from 'dotenv';
import path from 'path';
import http from 'http'; // V1: needed to attach Socket.io alongside Express

// Try multiple paths to load .env file
const possiblePaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'packages/backend/.env')
];

let envLoaded = false;
for (const envPath of possiblePaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (result.parsed) {
      console.log('✅ Loaded .env from:', envPath);
      envLoaded = true;
      break;
    }
  } catch (error) {
    // Continue to next path
  }
}

if (!envLoaded) {
  console.warn('⚠️  No .env file loaded, checking environment variables directly');
  // Check if critical env vars are set
  if (process.env.STRIPE_SECRET_KEY) {
    console.log('✅ STRIPE_SECRET_KEY found in environment');
  } else {
    console.log('❌ STRIPE_SECRET_KEY not found in environment');
  }
}

// C1: Fail fast if JWT_SECRET is missing — prevents silent use of fallback secret in production
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set. Server will not start.');
  process.exit(1);
}

// P0-2: Fail fast if STRIPE_SECRET_KEY is missing — prevents accidental use of test key in production
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('FATAL: STRIPE_SECRET_KEY not set');
  process.exit(1);
}

import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient, RedisClientType } from 'redis';
import { csrfTokenCookie, validateCsrfToken } from './middleware/csrf';
import authRoutes from './routes/auth';
import passkeyRoutes from './routes/passkey';
import saleRoutes from './routes/sales';
import itemRoutes from './routes/items';
import favoriteRoutes from './routes/favorites';
import userRoutes from './routes/users';
import stripeRoutes from './routes/stripe';
import notificationRoutes from './routes/notifications';
import affiliateRoutes from './routes/affiliate';
import lineRoutes from './routes/lines';
import geocodeRoutes from './routes/geocode';
import uploadRoutes from './routes/upload';
import organizerRoutes from './routes/organizers';
import contactRoutes from './routes/contact';
import pushRoutes from './routes/push';
import feedRoutes from './routes/feed'; // Phase 28: personalized activity feed
import searchRoutes from './routes/search'; // Phase 29: Discovery + search
import reviewRoutes from './routes/reviews'; // Phase 15: Review + rating system
import messageRoutes from './routes/messages'; // Phase 20: Shopper messaging
import reservationRoutes from './routes/reservations'; // Phase 21: Item reservations/holds
import referralRoutes from './routes/referrals'; // Phase 23: Referral program
import bountyRoutes from './routes/bounties';    // V3: UGC missing-listing bounties
import webhookRoutes from './routes/webhooks';   // X1: Zapier webhook system
import insightsRoutes from './routes/insights';  // CD2 Phase 3: Organizer insights dashboard
import leaderboardRoutes from './routes/leaderboard'; // CD2 Phase 3: City leaderboards & badges
import streakRoutes from './routes/streaks';     // CD2 Phase 2: Streak Challenges + Hunt Pass
import flashDealRoutes from './routes/flashDeals'; // Flash Deals & Promotions
import wishlistRoutes from './routes/wishlists'; // Wishlist / Registry feature
import tierRoutes from './routes/tiers'; // Phase 31: Organizer Tier Rewards
import plannerRoutes from './routes/planner'; // Planning assistant chatbot
import organizerDigestRoutes from './routes/organizerDigest'; // Organizer weekly digest manual trigger
import buyingPoolRoutes from './routes/buyingPools'; // Group Buying Pools
import adminRoutes from './routes/admin'; // Admin panel
import devRoutes from './routes/dev'; // Dev utilities
import notificationInboxRoutes from './routes/notificationInbox'; // Notification inbox
import waitlistRoutes from './routes/waitlist'; // Item Waitlist / "Notify Me"
import pickupRoutes from './routes/pickup'; // Pickup Appointment Scheduling
import inviteRoutes from './routes/invites'; // Beta invite code validation
import socialPostRoutes from './routes/socialPost'; // Social media post generator
import couponsRouter from './routes/coupons';          // Sprint 3: Shopper Loyalty Coupons
import routeRoutes from './routes/routes';             // D3: Map route planning
import viewersRouter from './routes/viewers';           // Feature 34: Hype Meter
import exportRouter from './routes/export';             // Sprint 2: Export features
import socialRouter from './routes/social';             // Sprint 2: Social template generator
import tagRouter from './routes/tags';                  // Sprint 3: Tag-based SEO endpoints
import hubRoutes from './routes/hubs';                  // Feature #40+#44: Sale Hubs & Neighborhood Sale Day
import voiceRoutes from './routes/voice';                // Feature #42: Voice-to-tag extraction
import reminderRoutes from './routes/reminders';        // Sale Reminders — email notifications
import billingRoutes from './routes/billing';             // #65 Sprint 2: Stripe billing endpoints
import healthRoutes from './routes/health';              // Feature #20: Proactive Degradation Mode
import nudgeRoutes from './routes/nudges';                // Feature 61: Near-Miss Nudges
import socialProofRoutes from './routes/socialProof';     // Feature 67: Social Proof Notifications
import snoozeRoutes from './routes/snooze';               // Feature 23: Unsubscribe-to-Snooze
import commandCenterRoutes from './routes/commandCenter';  // #68 Sprint 1: Command Center Dashboard
import reputationRoutes from './routes/reputation';        // #71: Organizer Reputation Score
import cityHeatRoutes from './routes/cityHeat';              // Phase 5: #49 City Heat Index
import linkClickRoutes from './routes/linkClicks';           // #18: Post Performance Analytics
import collectorPassportRoutes from './routes/collectorPassport'; // Feature #45: Collector Passport
import challengeRoutes from './routes/challenges';               // Feature #55: Seasonal Discovery Challenges
import receiptRoutes from './routes/receipts';               // #62: Digital Receipts
import returnRoutes from './routes/returns';                 // #62: Return Requests
import itemLibraryRoutes from './routes/itemLibrary';         // Feature #25: Item Library (Consignment Rack)
import brandKitRoutes from './routes/brandKit';               // #31 Brand Kit expansion
import wishlistAlertRoutes from './routes/wishlistAlerts';     // Feature #32: Wishlist Alerts
import smartFollowRoutes from './routes/smartFollows';         // Feature #32: Smart Follow
import loyaltyRoutes from './routes/loyalty';                 // Feature #29: Loyalty Passport
import flipReportRoutes from './routes/flipReport';           // Feature #41: Flip Report
import verificationRoutes from './routes/verification';       // Feature #16: Verified Organizer Badge
import lootLogRoutes from './routes/lootLog';                 // Feature #50: Loot Log
import ugcPhotoRoutes from './routes/ugcPhotos';              // Feature #47: UGC Photo Tags
import photoOpRoutes from './routes/photoOps';                // Feature #39: Photo Op Stations
import achievementRoutes from './routes/achievements';        // Features #58-59: Achievement Badges & Streak Rewards
import fraudRoutes from './routes/fraud';                     // Feature #17: Bid Bot Detector
import trailRoutes from './routes/trails';                    // Feature #48: Treasure Trail Route Builder
import workspaceRoutes from './routes/workspace';              // Feature #13: TEAMS Multi-User Workspace
import encyclopediaRoutes from './routes/encyclopedia';        // Feature #52: Estate Sale Encyclopedia
import appraisalRoutes from './routes/appraisals';            // Feature #54: Crowdsourced Appraisal API
import typologyRoutes from './routes/typology';               // Feature #46: Treasure Typology Classifier
import syncRoutes from './routes/sync';                        // Feature #69: Local-First Offline Mode
import checklistRoutes from './routes/checklist';               // Sale Checklist
import disputeRoutes from './routes/disputes';                  // Disputes Management
import messageTemplateRoutes from './routes/messageTemplates';  // Message Templates
import priceHistoryRoutes from './routes/priceHistory';         // Price History Tracking
import savedSearchRoutes from './routes/savedSearches';         // Saved Searches with notifyOnNew
import saleWaitlistRoutes from './routes/saleWaitlist';         // Sale Waitlist (sale-level)
import treasureHuntRoutes from './routes/treasureHunt';         // Daily Treasure Hunt
import trendingRoutes from './routes/trending';                 // Trending Items & Sales
import unsubscribeRoutes from './routes/unsubscribe';           // Unsubscribe / Preferences
import shopperReferralRoutes from './routes/shopperReferral';   // Feature #7: Shopper Referral Rewards
import earningsPdfRoutes from './routes/earningsPdf';           // Payout PDF Export
import abTestRoutes from './routes/abTest';                     // A/B Testing Infrastructure
import feedbackRoutes from './routes/feedback';                 // User Feedback
import bidsRoutes from './routes/bids';                         // Shopper bids page
import xpController from './controllers/xpController';          // Phase 2a: Explorer's Guild XP system
import supportRoutes from './routes/support';                  // #128: Automated Support Stack
import posTiersRoutes from './routes/posTiers';               // POS Tier Status tracking
import settlementRoutes from './routes/settlement';           // Feature #228: Settlement Hub
import { authenticate } from './middleware/auth';
import { sentryUserContext } from './middleware/sentryUserContext'; // Feature #21: User Impact Scoring
import { degradationMode } from './middleware/degradationMode'; // Feature #20: Proactive Degradation Mode
import { requestTimeout } from './middleware/requestTimeout'; // Feature #108: Global request timeout (30s)
import { correlationIdMiddleware } from './middleware/correlationId'; // #98: Request tracing
import { initSocket } from './lib/socket'; // V1: Socket.io live bidding
import { initLiveFeed } from './services/liveFeedService'; // Feature #70: Live Sale Feed
import { initBidRateLimiter } from './middleware/bidRateLimiter'; // #95: Bidding velocity rate limiter
import { initCouponRateLimiter } from './middleware/couponRateLimiter'; // #94: Coupon validation enumeration prevention
import './jobs/auctionJob';
import './jobs/notificationJob';
import './jobs/emailReminderJob';
import './jobs/reputationJob'; // Phase 22: Creator Tier Program — weekly tier recalculation
import './jobs/reservationExpiryJob'; // Phase 21: Expire stale holds every 30 min
import './jobs/curatorEmailJob'; // Phase 30: Weekly curator email digest — Mondays 8 AM
import './jobs/reverseAuctionJob'; // CD2 Phase 4: Daily price drop processing
import './jobs/organizerWeeklyDigestJob'; // Organizer weekly performance digest — Mondays 8 AM
import './jobs/abandonedCheckoutJob'; // Abandoned Checkout Recovery — hourly email
import './jobs/saleEndingSoonJob'; // Sale Ending Soon notifications — hourly check
import './jobs/weeklyEmailJob'; // CD2 Phase 2: Weekly personalized shopper digest — Sundays 6 PM
import './jobs/tierLapseJob'; // Feature #75: Tier lapse state logic — daily batch processing and warnings
import { scheduleCleanupCron } from './jobs/cleanupStaleDrafts'; // Phase 2B: Cleanup stale DRAFT items daily
import { syncAchievements } from './services/achievementService'; // Features #58-59: Initialize achievements
import { scheduleAuctionCloseCron } from './jobs/auctionCloseCron'; // Auction auto-close
import { schedulePhotoRetentionCron } from './jobs/photoRetentionCron'; // Feature #103: Photo retention + deletion
import { scheduleArchivalCron } from './jobs/archivalCron'; // #112: Soft-delete archival (quarterly)
import { scheduleMarkdownCron } from './jobs/markdownCron'; // Feature #91: Auto-markdown (smart clearance)

// Import + re-export shared Prisma singleton — all controllers/services import from here or lib/prisma
import { prisma } from './lib/prisma';
export { prisma };

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
// V1: Wrap Express in a bare HTTP server so Socket.io can share the same port
const httpServer = http.createServer(app);

// ─── Security ────────────────────────────────────────────────────────────────────────────────────────────────────────────

// Trust the first proxy (ngrok / reverse proxy) so rate-limiter and IP detection work correctly
app.set('trust proxy', 1);

// Helmet sets safe defaults for ~15 HTTP headers
app.use(
  helmet({
    // CSP is handled by Next.js headers config; keep it loose here for the API
    contentSecurityPolicy: false,
    // Allow Stripe iframes on the frontend
    crossOriginEmbedderPolicy: false,
  })
);

// Restrict CORS to known origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());

// Ensure production domains are always included for finda.sale
if (!allowedOrigins.includes('https://finda.sale')) {
  allowedOrigins.push('https://finda.sale');
}
if (!allowedOrigins.includes('https://www.finda.sale')) {
  allowedOrigins.push('https://www.finda.sale');
}

// V1: Initialize Socket.io on the shared HTTP server — mirrors the Express CORS policy
const io = initSocket(httpServer, allowedOrigins);

// Feature #70: Initialize live feed service for real-time activity streams
initLiveFeed(io);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow all Vercel preview deployments for this project
      if (/^https:\/\/findasale[a-z0-9-]*\.vercel\.app$/.test(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// Feature #106: Initialize Redis client for distributed rate limiting
// Falls back gracefully to in-memory store if Redis is unavailable
let redisRateLimitClient: RedisClientType | null = null;
if (process.env.REDIS_URL) {
  try {
    redisRateLimitClient = createClient({ url: process.env.REDIS_URL });
    redisRateLimitClient.on('error', (err) => {
      console.error('[rateLimit] Redis error:', err);
      redisRateLimitClient = null; // graceful degradation
    });
    redisRateLimitClient.connect().catch((err) => {
      console.error('[rateLimit] Failed to connect to Redis:', err);
      redisRateLimitClient = null;
    });
  } catch (error) {
    console.error('[rateLimit] Failed to initialize Redis client:', error);
    redisRateLimitClient = null;
  }
}

// Build store config for rate limiters
const createRateLimitStore = () => {
  if (redisRateLimitClient && redisRateLimitClient.isOpen) {
    return new RedisStore({
      sendCommand: (...args: string[]) => redisRateLimitClient!.sendCommand(args),
    });
  }
  return undefined; // Falls back to default in-memory store
};

// IP whitelist — comma-separated IPs in RATE_LIMIT_WHITELIST_IPS env var bypass all rate limits
// Usage: set RATE_LIMIT_WHITELIST_IPS=203.0.113.1,203.0.113.2 in Railway environment variables
const RATE_LIMIT_WHITELIST = (process.env.RATE_LIMIT_WHITELIST_IPS || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

const isWhitelistedIP = (req: express.Request): boolean => {
  if (RATE_LIMIT_WHITELIST.length === 0) return false;
  const clientIP = req.ip || req.socket?.remoteAddress || '';
  return RATE_LIMIT_WHITELIST.some((allowed) => clientIP === allowed || clientIP.endsWith(allowed));
};

// Global rate limit — 500 req / 15 min per IP (prevents brute force and scraping)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path.startsWith('/api/viewers') || req.path === '/api/health/latency' || isWhitelistedIP(req),
  store: createRateLimitStore(),
});
app.use(globalLimiter);

// Viewer ping limiter — higher limit, short window, exempt from global limiter
const viewerLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1 minute window
  max: 120,                       // 120 req/min per IP (covers ~4 active sale tabs with 30s ping + 15s poll each)
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isWhitelistedIP(req),
  message: { error: 'Too many viewer requests.' },
});

// Stricter limit on auth routes — 100 failed req / 15 min per IP (successful logins don't count)
// Test accounts (@example.com) bypass rate limiting for automated QA testing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
  skip: (req) => {
    // Bypass rate limit for whitelisted IPs
    if (isWhitelistedIP(req)) return true;

    // Bypass rate limit for test accounts (@example.com)
    const email = req.body?.email?.toLowerCase();
    if (email && email.endsWith('@example.com')) return true;

    return false;
  },
  store: createRateLimitStore(),
});

// Contact form limiter — 5 submissions / 15 min per IP (M3: prevents spam campaigns)
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isWhitelistedIP(req),
  message: { error: 'Too many messages sent. Please wait before trying again.' },
});

// Raw body middleware for Stripe webhooks (must come before json parser)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// JSON parser with 1 MB body size limit to prevent payload attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// #104: CSRF protection — set token on all requests, validate on state-mutating routes
app.use(csrfTokenCookie);
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Validate CSRF token on POST, PUT, PATCH, DELETE requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return validateCsrfToken(req, res, next);
  }
  next();
});

// #98: Request correlation ID for end-to-end tracing
app.use(correlationIdMiddleware);

// Feature #21: Global Sentry user context enrichment
// Runs on all requests; silently no-op if not authenticated
// Enriches error reports with user tier, points, hunt pass status for prioritization
app.use(sentryUserContext);

// Feature #20: Proactive Degradation Mode
// Monitors latency and adds degradation headers when threshold exceeded
app.use(degradationMode);

// Feature #108: Global request timeout guard (30 seconds)
// Prevents handlers from blocking indefinitely; returns 503 on timeout
app.use(requestTimeout(30000));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'FindA.Sale API is running!' });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes); // stricter rate limit on auth
app.use('/api/auth/passkey', authLimiter, passkeyRoutes); // Feature #19: Passkey/WebAuthn routes
app.use('/api/sales', saleRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/organizers', organizerRoutes);
app.use('/api/contact', contactLimiter, contactRoutes); // M3: dedicated contact spam limiter
app.use('/api/push', pushRoutes);
app.use('/api/feed', feedRoutes); // Phase 28: personalized activity feed
app.use('/api/search', searchRoutes); // Phase 29: Discovery + search
app.use('/api/reviews', reviewRoutes); // Phase 15: Review + rating system
app.use('/api/messages', messageRoutes); // Phase 20: Shopper messaging
app.use('/api/reservations', reservationRoutes); // Phase 21: Item reservations/holds
app.use('/api/referrals', referralRoutes);  // Phase 23: Referral program
app.use('/api/bounties', bountyRoutes);    // V3: UGC missing-listing bounties
app.use('/api/webhooks', webhookRoutes);   // X1: Zapier webhook system
app.use('/api/insights', insightsRoutes);  // CD2 Phase 3: Organizer insights dashboard
app.use('/api/leaderboard', leaderboardRoutes); // CD2 Phase 3: City leaderboards & badges
app.use('/api/streaks', streakRoutes);     // CD2 Phase 2: Streak Challenges + Hunt Pass
app.use('/api/flash-deals', flashDealRoutes); // Flash Deals & Promotions
app.use('/api/wishlists', wishlistRoutes); // Wishlist / Registry feature
app.use('/api/tiers', tierRoutes); // Phase 31: Organizer Tier Rewards
app.use('/api/organizer/pos-tiers', posTiersRoutes); // POS Tier Status tracking
app.use('/api/planner', plannerRoutes); // Planning assistant chatbot
app.use('/api/buying-pools', buyingPoolRoutes); // Group Buying Pools
app.use('/api/organizer-digest', organizerDigestRoutes); // Organizer weekly digest manual trigger
app.use('/api/admin', adminRoutes); // Admin panel
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev', devRoutes); // Dev utilities
}
app.use('/api/notifications/inbox', notificationInboxRoutes); // Notification inbox
app.use('/api/waitlist', waitlistRoutes); // Item Waitlist / "Notify Me"
app.use('/api/pickup', pickupRoutes); // Pickup Appointment Scheduling
app.use('/api/invites', inviteRoutes); // Beta invite code validation (public)
app.use('/api/social-post', socialPostRoutes); // Social media post generator
app.use('/api/coupons', couponsRouter);         // Sprint 3: Shopper Loyalty Coupons
app.use('/api/routes', routeRoutes);            // D3: Map route planning
app.use('/api/viewers', viewerLimiter, viewersRouter);         // Feature 34: Hype Meter viewer counts
app.use('/api/export', exportRouter);                            // Sprint 2: Export features
app.use('/api/social', socialRouter);                            // Sprint 2: Social template generator
app.use('/api/tags', tagRouter);                                 // Sprint 3: Tag-based SEO endpoints
app.use(hubRoutes);                                              // Feature #40+#44: Sale Hubs & Neighborhood Sale Day
app.use('/api/voice', voiceRoutes);                              // Feature #42: Voice-to-tag extraction
app.use('/api/billing', billingRoutes);                          // #65 Sprint 2: Stripe billing endpoints
app.use('/api/reminders', reminderRoutes);                       // Sale Reminders — email notifications
app.use('/api/nudges', nudgeRoutes);                             // Feature 61: Near-Miss Nudges
app.use('/api/social-proof', socialProofRoutes);                 // Feature 67: Social Proof Notifications
app.use('/api/snooze', snoozeRoutes);                            // Feature 23: Unsubscribe-to-Snooze
app.use('/api/organizer/command-center', commandCenterRoutes);    // #68 Sprint 1: Command Center Dashboard
app.use('/api/organizers', reputationRoutes);                      // #71: Organizer Reputation Score
app.use('/api/city-heat', cityHeatRoutes);                         // Phase 5: #49 City Heat Index
app.use('/api/link-clicks', linkClickRoutes);                      // #18: Post Performance Analytics
app.use('/api/receipts', receiptRoutes);                             // #62: Digital Receipts
app.use('/api/returns', returnRoutes);                               // #62: Return Requests
app.use('/api/item-library', itemLibraryRoutes);                     // Feature #25: Item Library
app.use('/api/brand-kit', brandKitRoutes);                           // #31 Brand Kit expansion
app.use('/api/wishlist-alerts', wishlistAlertRoutes);                // Feature #32: Wishlist Alerts
app.use('/api/smart-follows', smartFollowRoutes);                    // Feature #32: Smart Follow
app.use('/api/loyalty', loyaltyRoutes);                              // Feature #29: Loyalty Passport
app.use('/api/collector-passport', collectorPassportRoutes);        // Feature #45: Collector Passport
app.use('/api/challenges', challengeRoutes);                         // Feature #55: Seasonal Discovery Challenges
app.use('/api/flip-report', flipReportRoutes);                       // Feature #41: Flip Report
app.use('/api/verification', verificationRoutes);                    // Feature #16: Verified Organizer Badge
app.use('/api/loot-log', lootLogRoutes);                             // Feature #50: Loot Log
app.use('/api/ugc-photos', ugcPhotoRoutes);                          // Feature #47: UGC Photo Tags
app.use('/api/health', healthRoutes);                                // Feature #20: Proactive Degradation Mode
app.use('/api/achievements', achievementRoutes);                     // Features #58-59: Achievement Badges & Streak Rewards
app.use('/api/fraud', fraudRoutes);                                  // Feature #17: Bid Bot Detector
app.use('/api/trails', trailRoutes);                                 // Feature #48: Treasure Trail Route Builder
app.use('/api/workspace', workspaceRoutes);                          // Feature #13: TEAMS Multi-User Workspace
app.use('/api/encyclopedia', encyclopediaRoutes);                     // Feature #52: Estate Sale Encyclopedia
app.use('/api/appraisals', appraisalRoutes);                          // Feature #54: Crowdsourced Appraisal API
app.use('/api', typologyRoutes);                                       // Feature #46: Treasure Typology Classifier
app.use('/api/sync', syncRoutes);                                    // Feature #69: Local-First Offline Mode
app.use('/api/checklist', checklistRoutes);                            // Sale Checklist
app.use('/api/disputes', disputeRoutes);                               // Disputes Management
app.use('/api/message-templates', messageTemplateRoutes);              // Message Templates
app.use('/api/items', priceHistoryRoutes);                             // Price History (sub-routes under /api/items/:id/price-history)
app.use('/api/saved-searches', savedSearchRoutes);                     // Saved Searches with notifyOnNew
app.use('/api/sale-waitlist', saleWaitlistRoutes);                     // Sale Waitlist (sale-level)
app.use('/api/treasure-hunt', treasureHuntRoutes);                     // Daily Treasure Hunt
app.use('/api/trending', trendingRoutes);                              // Trending Items & Sales
app.use('/api/unsubscribe', unsubscribeRoutes);                        // Unsubscribe / Preferences
app.use('/api/shopper-referral', shopperReferralRoutes);               // Feature #7: Shopper Referral Rewards
app.use('/api/earnings', earningsPdfRoutes);                           // Payout PDF Export (/api/earnings/pdf)
app.use('/api/ab', abTestRoutes);                                      // A/B Testing Infrastructure
app.use('/api/feedback', feedbackRoutes);                              // User Feedback
app.use('/api/bids', bidsRoutes);                                      // Shopper bids page
app.use('/api/xp', xpController);                                      // Phase 2a: Explorer's Guild XP system
app.use('/api/support', supportRoutes);                                 // #128: Automated Support Stack
app.use('/api/sales', settlementRoutes);                                   // Feature #228: Settlement Hub

// Protected route example
app.get('/api/protected', authenticate, (req, res) => {
  res.json({ message: 'This is a protected route', user: (req as any).user });
});

// Sentry error handler — must be registered after all routes and before the custom error handler
// Captures exceptions and attaches Sentry event IDs to req.sentry
Sentry.setupExpressErrorHandler(app);

// H8: Global error handler — catches uncaught async errors forwarded via next(err)
// Must be defined AFTER all routes and BEFORE app.listen
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message, err.stack);
  const status = (err as any).status || (err as any).statusCode || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  httpServer.close();
  process.exit(0);
});

// V1: Listen on the HTTP server (not app.listen) so Socket.io shares the same port
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`FindA.Sale backend running on port ${PORT} (HTTP + Socket.io)`);

  // Phase 2B: Register cleanup cron for stale DRAFT items
  scheduleCleanupCron();

  // Auction auto-close cron
  scheduleAuctionCloseCron();

  // Feature #103: Register photo retention cron
  schedulePhotoRetentionCron();

  // #112: Register quarterly archival cron
  scheduleArchivalCron();

  // Feature #91: Register auto-markdown cron
  scheduleMarkdownCron();

  // Features #58-59: Initialize achievements from code
  syncAchievements();

  // #95: Initialize bid rate limiter (Redis)
  initBidRateLimiter();

  // #94: Initialize coupon validation rate limiter (Redis)
  initCouponRateLimiter();

  // Log environment variables status for debugging (dev only)
  if (process.env.NODE_ENV !== 'production') {
    console.log('Environment variables status:');
    console.log('- STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ Present' : '❌ Missing');
    console.log('- TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ Present' : '❌ Missing');
    console.log('- TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '✅ Present' : '❌ Missing');
    console.log('- DATABASE_URL:', process.env.DATABASE_URL ? '✅ Present' : '❌ Missing');
  }
});
