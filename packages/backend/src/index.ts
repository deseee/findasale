import './instrument'; // must be first — initializes Sentry before all other imports
import { setDefaultResultOrder, setServers } from 'dns';
// Force Google public DNS — bypasses Railway's internal resolver which fails to
// resolve some external domains (e.g. api.ebay.com) in the us-east4 region.
setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
setDefaultResultOrder('ipv4first');
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
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient, RedisClientType } from 'redis';
import { csrfTokenCookie, validateCsrfToken } from './middleware/csrf';
import authRoutes from './routes/auth';
import passkeyRoutes from './routes/passkey';
import saleRoutes from './routes/sales';
import companyRoutes from './routes/companies'; // #567: hire-intent company directory
import itemRoutes from './routes/items';
import extensionRoutes from './routes/extension'; // ADR-084: Marketplace Autofill browser extension
import favoriteRoutes from './routes/favorites';
import userRoutes from './routes/users';
import stripeRoutes from './routes/stripe';
import stripeConnectRoutes from './routes/stripeConnect';
import notificationRoutes from './routes/notifications';
import affiliateRoutes from './routes/affiliate';
import lineRoutes from './routes/lines';
import geocodeRoutes from './routes/geocode';
import uploadRoutes from './routes/upload';
import organizerRoutes from './routes/organizers';
import contactRoutes from './routes/contact';
import pushRoutes from './routes/push';
import feedRoutes from './routes/feed'; // Phase 28: personalized activity feed
import googleMerchantRoutes from './routes/googleMerchant'; // Feature #463: Google Merchant Center product feed
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
import adminAffiliateRoutes from './routes/adminAffiliate'; // Admin: Creator/Affiliate management
import devRoutes from './routes/dev'; // Dev utilities
import notificationInboxRoutes from './routes/notificationInbox'; // Notification inbox
import waitlistRoutes from './routes/waitlist'; // Item Waitlist / "Notify Me"
import pickupRoutes from './routes/pickup'; // Pickup Appointment Scheduling
import inviteRoutes from './routes/invites'; // Beta invite code validation
import socialPostRoutes from './routes/socialPost'; // Social media post generator
import couponsRouter from './routes/coupons';          // Sprint 3: Shopper Loyalty Coupons
import boostsRouter from './routes/boosts';            // Phase 2b: Dual-rail boost system
import routeRoutes from './routes/routes';             // D3: Map route planning
import viewersRouter from './routes/viewers';           // Feature 34: Hype Meter
import exportRouter from './routes/export';             // Sprint 2: Export features
import socialRouter from './routes/social';             // Sprint 2: Social template generator
import tagRouter from './routes/tags';                  // Sprint 3: Tag-based SEO endpoints
import pricingRoutes from './routes/pricing';           // Phase S574: Multi-source pricing engine
import pricingSignalsRoutes from './routes/pricingSignals'; // Pricing signals: sleeper patterns & brand premiums
import hubRoutes from './routes/hubs';                  // Feature #40+#44: Sale Hubs & Neighborhood Sale Day
import vendorBoothRoutes from './routes/vendorBooth';    // Vendor Booth Payments (2026-07-07, ADR-015/016/017): flea market multi-booth checkout
import voiceRoutes from './routes/voice';                // Feature #42: Voice-to-tag extraction
import reminderRoutes from './routes/reminders';        // Sale Reminders — email notifications
import billingRoutes from './routes/billing';             // #65 Sprint 2: Stripe billing endpoints
import pointsRoutes from './routes/points';                    // XP tracking: sale visits
import consignorRoutes from './routes/consignors';       // Feature #309: Consignor Portal & Payouts
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
import earlyAccessRoutes from './routes/early-access';           // Early Access Cache: replace Lucky Roll
import guildRoutes from './routes/guild';                    // Phase 2b: Explorer's Guild Hall of Fame
import receiptRoutes from './routes/receipts';               // #62: Digital Receipts
import returnRoutes from './routes/returns';                 // #62: Return Requests
import itemInventoryRoutes from './routes/itemInventory';     // Feature #25: Item Inventory (Consignment Rack)
import brandKitRoutes from './routes/brandKit';               // #31 Brand Kit expansion
import wishlistAlertRoutes from './routes/wishlistAlerts';     // Feature #32: Wishlist Alerts
import smartFollowRoutes from './routes/smartFollows';         // Feature #32: Smart Follow
import loyaltyRoutes from './routes/loyalty';                 // Feature #29: Loyalty Passport
import flipReportRoutes from './routes/flipReport';           // Feature #41: Flip Report
import verificationRoutes from './routes/verification';       // Feature #16: Verified Organizer Badge
import lootLogRoutes from './routes/lootLog';                 // Feature #50: Loot Log
import ugcPhotoRoutes from './routes/ugcPhotos';              // Feature #47: UGC Photo Tags
import photoOpRoutes from './routes/photoOps';                // Feature #39: Photo Op Stations
import shareLinksRouter from './routes/shareLinks';           // Feature: Verified Social Share XP System
import achievementRoutes from './routes/achievements';        // Features #58-59: Achievement Badges & Streak Rewards
import fraudRoutes from './routes/fraud';                     // Feature #17: Bid Bot Detector
import trailRoutes from './routes/trails';                    // Feature #48: Treasure Trail Route Builder
import workspaceRoutes from './routes/workspace';              // Feature #13: TEAMS Multi-User Workspace
import staffRoutes from './routes/staff';                        // Team Collaboration: Member Management
import encyclopediaRoutes from './routes/encyclopedia';        // Feature #52: Estate Sale Encyclopedia
import appraisalRoutes from './routes/appraisals';            // Feature #54: Crowdsourced Appraisal API
// REMOVED S437: Typology deprecated — auto-tagging + tags replaced it
// import typologyRoutes from './routes/typology';
import syncRoutes from './routes/sync';                        // Feature #69: Local-First Offline Mode
import checklistRoutes from './routes/checklist';               // Sale Checklist
import disputeRoutes from './routes/disputes';                  // Disputes Management
import messageTemplateRoutes from './routes/messageTemplates';  // Message Templates
import priceHistoryRoutes from './routes/priceHistory';         // Price History Tracking
import savedSearchRoutes from './routes/savedSearches';         // Saved Searches with notifyOnNew
import saleWaitlistRoutes from './routes/saleWaitlist';         // Sale Waitlist (sale-level)
import treasureHuntRoutes from './routes/treasureHunt';         // Daily Treasure Hunt
import trendingRoutes from './routes/trending';                 // Trending Items & Sales
import indexMetrosRoutes from './routes/index-metros';          // Weekend Sale Index — public aggregation (backlink/PR asset)
import reportsRoutes from './routes/reports';                   // #442: Monthly trend report pages
import unsubscribeRoutes from './routes/unsubscribe';           // Unsubscribe / Preferences
import outreachRoutes from './routes/outreach';                      // Phase 1: Cold outreach email pipeline
import earningsPdfRoutes from './routes/earningsPdf';           // Payout PDF Export
import abTestRoutes from './routes/abTest';                     // A/B Testing Infrastructure
import feedbackRoutes from './routes/feedback';                 // User Feedback
import testimonialRoutes from './routes/testimonials';          // Outward Email Automation #2a: testimonial capture
import bidsRoutes from './routes/bids';                         // Shopper bids page
import xpController from './controllers/xpController';          // Phase 2a: Explorer's Guild XP system
import supportRoutes from './routes/support';                  // #128: Automated Support Stack
import posTiersRoutes from './routes/posTiers';               // POS Tier Status tracking
import settlementRoutes from './routes/settlement';           // Feature #228: Settlement Hub
import consignorSettlementRoutes from './routes/consignorSettlement'; // Feature #239: Multi-Consignor Estate Settlement
import posRoutes from './routes/pos';                         // POS Upgrade: Open Cart & Payment Links
import ebayRoutes from './routes/ebay';                       // eBay Marketplace Account Deletion
import ebayTaxonomyRoutes from './routes/ebayTaxonomy';       // Phase C: eBay Taxonomy, Catalog, AI Suggest
import barcodeRoutes from './routes/barcode';                  // Barcode scan -> eBay Catalog product enrichment
import shopifyRoutes from './routes/shopify';              // Feature: Shopify Cross-Listing
import luckyRollRoutes from './routes/lucky-roll';             // Phase 2b: Lucky Roll — weekly XP gacha
import crewsRoutes from './routes/crews';                       // Phase 2a: Explorer's Guild — Crew Creation
import discountRuleRoutes from './routes/discountRules';        // Feature #310: Color-tagged Discount Rules
import markdownCycleRoutes from './routes/markdownCycles';       // Feature: Automatic Markdown Cycles (PRO Tier)
import locationRoutes from './routes/locations';                 // #311: Multi-Location Inventory View
import qrScannerRoutes from './routes/qrScanner';                // QR Scanner Phase 2: scan analytics
import imageProxyRoutes from './routes/imageProxy';              // Image proxy for eBay CDN images
import { crawlerAnalyticsMiddleware, detectCrawler } from './middleware/crawlerAnalytics'; // AI Crawler Analytics
import crawlerStatsRouter from './routes/crawlerStats';           // AI Crawler Stats endpoint
import crawlerLogRouter from './routes/crawlerLog';               // AI Crawler Log — SSR bot tracking
import demandSignalsRouter from './routes/demandSignals';          // #454 Organizer Demand Dashboard
import aiScoreRouter from './routes/aiScore';                       // GEO Phase 3: Search Visibility Score
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
import './jobs/saleOfTheDayJob'; // Feature #401: Sale of the Day nightly selection
import './jobs/presaleSneakPeekJob'; // Feature #409: Pre-sale sneak peek email — daily 09:00 UTC
import './jobs/reputationJob'; // Phase 22: Creator Tier Program — weekly tier recalculation
import './jobs/reservationExpiryJob'; // Phase 21: Expire stale holds every 30 min
import './jobs/curatorEmailJob'; // Phase 30: Weekly curator email digest — Mondays 8 AM
import './jobs/reverseAuctionJob'; // CD2 Phase 4: Daily price drop processing
import './jobs/organizerWeeklyDigestJob'; // Organizer weekly performance digest — Mondays 8 AM
import './jobs/abandonedCheckoutJob'; // Abandoned Checkout Recovery — hourly email
import './jobs/saleEndingSoonJob'; // Sale Ending Soon notifications — hourly check
import './jobs/posStrandedSaleReconcileCron'; // ADR pos-webhook-idempotency-reconciliation (2026-07-23, S1151): auto-record stranded QR/POS sales every 10 min
import './jobs/weeklyEmailJob'; // CD2 Phase 2: Weekly personalized shopper digest — Sundays 6 PM
import './jobs/tierLapseJob'; // Feature #75: Tier lapse state logic — daily batch processing and warnings
import './jobs/fraudDetectionJob'; // Feature #73: Daily off-platform transaction detection at 2 AM
import './jobs/boostExpiryJob';   // Phase 2b: Expire stale ACTIVE BoostPurchase records hourly
import './jobs/xpExpiryCron';      // D-XP-002: XP expiry system — daily at 02:00 UTC with warning flags
import './jobs/huntPassExpiryCron'; // Hunt Pass: deactivate expired passes daily at 03:00 UTC
import './jobs/deliverabilityMonitorJob'; // Email deliverability monitoring — Sundays 19:00 UTC
import './jobs/gmailHealthCron';          // Gmail OAuth health, daily send summary, suspension detect
import { scheduleCleanupCron } from './jobs/cleanupStaleDrafts'; // Phase 2B: Cleanup stale DRAFT items daily
import { syncAchievements } from './services/achievementService'; // Features #58-59: Initialize achievements
import { scheduleSaleAutoCloseCron } from './jobs/saleAutoCloseCron'; // Auto-close expired PUBLISHED scraped sales hourly
import { schedulePhotoRetentionCron } from './jobs/photoRetentionCron'; // Feature #103: Photo retention + deletion
import { scheduleFootageRetentionCron } from './jobs/footageRetentionCron'; // ADR-080 §7: raw R2 footage retention sweep
import { scheduleWebhookEventPruneJob } from './jobs/webhookEventPruneJob'; // Webhook event pruning (30-day retention)
import { scheduleLogRetentionCron } from './jobs/logRetentionCron'; // Operational-log retention sweep (60-day retention)
import { scheduleScrapedSalePruneCron } from './jobs/pruneScrapedSales'; // Stale scraped ENDED-sale prune (volume reclaim, ADR 2026-07-05)
import { scheduleStripeMigrationReconcileCron } from './jobs/stripeMigrationReconcileCron'; // ADR 1 2026-07-11: Stripe migration reconciliation backstop (daily, 04:30)
import { scheduleVendorBoothFeeBillingCron } from './jobs/vendorBoothFeeBillingCron'; // ADR-090 Phase 4: flat VendorBooth.boothFee periodic billing (monthly, 1st @ 06:00 UTC)
import { scheduleArchivalCron, expireStaleVenueCron } from './jobs/archivalCron'; // #112: Soft-delete archival (quarterly) + daily stale venue expiry
import { scheduleMarkdownCron } from './jobs/markdownCron'; // Feature #91: Auto-markdown (smart clearance)
import { scheduleMarkdownCycleCron } from './jobs/markdownCycleCron'; // Feature: Automatic Markdown Cycles (PRO Tier)
import { scheduleGoogleMerchantFeedCron } from './jobs/googleMerchantFeedCron'; // Feature #463: Google Merchant Center feed
import { scheduleQuotaResetCron, scheduleCircuitBreakerRecoveryCron } from './jobs/pricingEngineCron'; // Phase S574: Pricing engine quota + recovery
import { startEbaySoldSyncCron } from './jobs/ebaySoldSyncCron'; // Feature #244 Phase 3: eBay sold sync
import { bounceSuppressService_runReclassifyBackfillIfNeeded } from './services/bounceSuppressService'; // S1065: self-limiting boot backfill for historical bounce reclassification
import { startEbayListingQueueCron } from './jobs/ebayListingQueueCron'; // eBay Queue Mode engine
import { startEbayEndedListingsSyncCron } from './jobs/ebayEndedListingsSyncCron'; // Feature #244 Phase 3: eBay ended listings sync
import { startEbayListingSyncCron } from './jobs/ebayListingSyncCron'; // Feature #244 Phase 4: eBay bidirectional listing sync
import { registerEbayNotificationSubscription } from './jobs/ebayNotificationSetup'; // Feature #244 Phase 4: real-time sold webhooks
import { startTierGraceCron } from './jobs/tierGraceCronJob'; // Feature #75: Tier grace period finalization
import { scheduleReferralRewardAgeGateCron } from './jobs/referralRewardAgeGateJob'; // D-XP-004 Phase 4: Referral reward age gate cron
import { scheduleFoundingOrgBadgeCron } from './jobs/foundingOrgBadgeJob'; // Feature #405: Founding Organizer Badge — nightly award
import { scheduleRetailAutoRenewCron } from './jobs/retailAutoRenewJob'; // Feature: Retail Mode auto-renewal
import { scheduleConsignorExpiryNoticeCron } from './jobs/consignorExpiryNoticeJob'; // Feature #309: Consignor expiry notices
import { scheduleResyncShippingDriftCron } from './jobs/resyncShippingDrift'; // ADR shipping-resync Phase 3 / Part C: daily carrier-rate drift re-pin (4 AM UTC)
import { scheduleReputationScoreCron } from './jobs/reputationScoreJob'; // Feature: Referral reputation score recomputation
import './jobs/curatorReviewJob'; // ADR-069 Phase 2: Automated curator review for AUTO_GENERATED Encyclopedia entries
import { runBackfillBenchmarks } from './jobs/backfillBenchmarks'; // ADR-069 Phase 1: Backfill PriceBenchmark from Items with aiSuggestedPrice
import { initScraperCron } from './jobs/scraperCron'; // ADR-073 Phase 1: Directory scraper national cron
import { initMetroSyncCron } from './jobs/metroSyncCron'; // ADR-074: Metro Sync — eBay sold items nightly cron
import { initCategorySyncCron } from './jobs/categorySyncCron'; // ADR-074 Phase 2: Category Sync — eBay category items nightly cron
// Pipeline crons below moved to GitHub Actions (Steps 1+2 complete — Step 3 removes in-memory scheduling).
// Imports for autoSeedOutreachCron, outreachEmailsCron, emailDiscoveryJob,
// websiteEnrichmentJob, organizerWebsiteAddressCron removed — no longer scheduled in-process.
import { scheduleSaleDetailEnrichmentCron } from './jobs/saleDetailEnrichmentCron'; // ADR-075: EstateSales.NET sale detail enrichment
import { scheduleGeocodingAuditCron } from './jobs/geocodingAuditJob'; // ADR-073: Geocoding success rate audit cron
import { scheduleOutwardEmailAutomationsCron } from './jobs/outwardEmailAutomationsJob'; // Outward Email Automations: recap + review/testimonial asks (daily 10:00 UTC)
import socialPublisherRoutes from './routes/socialPublisher'; // ADR-077: In-house social publisher (admin-only)
import videoPipelineAdminRoutes from './routes/videoPipelineAdmin'; // ADR-078 Wave 3: one-time ops trigger for video pipeline dry-run (admin-only, temporary)
import videoRoutes from './routes/video'; // ADR-080 Stage 1b: event-driven footage ingest (POST /api/video/footage-ingest)
import { scheduleSocialPublisherCron } from './jobs/socialPublisherCron'; // ADR-077: Social publisher cron (every 10 min)
import marketplacePosterRoutes from './routes/marketplacePoster'; // ADR-083: Marketplace Poster (admin-only)
import { scheduleMarketplacePosterCron } from './jobs/marketplacePosterCron'; // ADR-083: Marketplace Poster cron (every 10 min)
import { scheduleEngagementMonitorCron } from './jobs/engagementMonitorCron'; // Comment/mention monitor (hourly) + approved-reply poster (every 30 min)
import { scheduleFootageBatchSealCron } from './jobs/footageBatchSealJob'; // ADR-080 Stage 1b: quiet-seal OPEN FootageBatches (every 5 min)
import citiesRoutes from './routes/cities'; // ADR-074: Metro Sync city pages
import categoriesRoutes from './routes/categories'; // ADR-074 Phase 2: Category trending items
import internalRoutes from './routes/internal'; // ADR-076: Internal scraper endpoint
import saleOfTheDayRoutes from './routes/saleOfTheDay'; // Feature #401: Sale of the Day
import clearanceRoutes from './routes/clearance'; // Feature #460: End-of-Sale Auto-Liquidation clearance discovery
import widgetRoutes from './routes/widget'; // Public embeddable widget inventory

// Import + re-export shared Prisma singleton — all controllers/services import from here or lib/prisma
import { prisma } from './lib/prisma';
export { prisma };

// S1032 guardrail (b): server start time for uptimeSec in /health freshness endpoint
const SERVER_START_TIME = Date.now();

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
if (!allowedOrigins.includes('https://api.finda.sale')) {
  // api.finda.sale is the Railway custom domain added S779 (2026-05-21).
  // Vercel serves pages from this domain; their XHR hits Railway with Origin: https://api.finda.sale.
  // 38 CORS errors in Sentry (since March 14) were historical — resolved when this line shipped in S780.
  allowedOrigins.push('https://api.finda.sale');
}

// V1: Initialize Socket.io on the shared HTTP server — mirrors the Express CORS policy
const io = initSocket(httpServer, allowedOrigins);

// Feature #70: Initialize live feed service for real-time activity streams
initLiveFeed(io);

app.use((req, res, next) => {
  // Widget inventory is a public embeddable endpoint — any origin allowed.
  // Must bypass the allowlist check below before it rejects external domains.
  if (req.path.startsWith('/api/widget')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    return next();
  }
  // ADR-084: FindA.Sale Marketplace Autofill extension. Auth is Bearer-only (no
  // cookie), so reflect the chrome-extension origin and allow the Authorization
  // header without credentials — the token grants access, not the origin.
  // ADR-088: the extension SW also calls POST /api/auth/refresh with an explicit
  // X-Refresh-Token header (SameSite=Lax blocks cookie auto-attach on the
  // extension-origin fetch). That path needs the same origin-reflection + header
  // allowance, but ONLY for the chrome-extension origin — the web app never sends a
  // chrome-extension origin, so its credentialed cookie refresh still falls through
  // to the generic cors() below byte-for-byte (no downgrade of the web-app path).
  const extReqOrigin = req.headers.origin;
  const isExtensionOrigin = !!extReqOrigin && extReqOrigin.startsWith('chrome-extension://');
  if (req.path.startsWith('/api/extension') || (req.path === '/api/auth/refresh' && isExtensionOrigin)) {
    if (extReqOrigin) res.setHeader('Access-Control-Allow-Origin', extReqOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Refresh-Token');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    return next();
  }
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
  })(req, res, next);
});

// Feature #106: Initialize Redis client for distributed rate limiting
// Falls back gracefully to in-memory store if Redis is unavailable
let redisRateLimitClient: RedisClientType | null = null;
// Deduped health flag so we emit exactly ONE Sentry event per drop (and one per
// recovery), not one per failed request. Sentry FINDASALE-NODEJS-4G (2026-07-02).
let redisRateLimitHealthy = true;
if (process.env.REDIS_URL) {
  try {
    redisRateLimitClient = createClient({ url: process.env.REDIS_URL });
    redisRateLimitClient.on('error', (err) => {
      // Do NOT null the client here — node-redis auto-reconnects; nulling our
      // reference permanently defeats recovery, leaving the limiter dead until a
      // process restart. The store closure guards on isReady instead.
      console.error('[rateLimit] Redis error:', err);
      // Deduped alert: only the first error in a drop fires Sentry (check-then-set is
      // synchronous, no await between, so no interleave). Subsequent errors log only.
      if (redisRateLimitHealthy) {
        redisRateLimitHealthy = false;
        try {
          Sentry.captureMessage(
            `[rateLimit] Redis connection lost — rate limiting failing open to in-memory (${err instanceof Error ? err.message : String(err)})`,
            'error'
          );
        } catch (_sentryErr) {
          // Sentry not ready — continue
        }
      }
    });
    // Recovery alert: fire once when the client becomes ready again after a drop.
    redisRateLimitClient.on('ready', () => {
      if (!redisRateLimitHealthy) {
        redisRateLimitHealthy = true;
        console.log('[rateLimit] Redis reconnected — distributed limiting restored');
        try {
          Sentry.captureMessage(
            '[rateLimit] Redis reconnected — distributed limiting restored',
            'info'
          );
        } catch (_sentryErr) {
          // Sentry not ready — continue
        }
      }
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
  // Guard on isReady (not isOpen): rate-limit-redis runs a SCRIPT LOAD inside the
  // RedisStore constructor; when the client is isOpen-but-not-isReady at boot, the
  // guarded sendCommand closure's Promise.reject becomes an unhandled rejection
  // (Sentry FINDASALE-NODEJS-4G). isReady means the store is only built when Redis can
  // actually serve — otherwise this returns undefined → in-memory fallback (documented).
  if (redisRateLimitClient && redisRateLimitClient.isReady) {
    return new RedisStore({
      sendCommand: (...args: string[]) => {
        const c = redisRateLimitClient;
        if (!c || !c.isReady) return Promise.reject(new Error('redis-unavailable'));
        return c.sendCommand(args);
      },
    });
  }
  return undefined; // Falls back to default in-memory store
};

// Fail-open wrapper: if the rate-limit store errors (e.g. Redis drop mid-life),
// proceed instead of 500ing. Over-limit still returns 429 (express-rate-limit
// sends it itself and never calls this callback). Incident: Sentry
// FINDASALE-NODEJS-4F (2026-07-02) — the RedisStore closure NPE'd on a Redis drop
// and 500'd every rate-limited request; store now fails open + the client
// reference is no longer nulled so Redis-backed limiting self-restores on reconnect.
const resilientLimiter = (limiter: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => limiter(req, res, (err?: unknown) => {
    if (err) {
      console.error('[rateLimit] store error — failing open:', err instanceof Error ? err.message : err);
      return next();
    }
    next();
  });

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

// QA bypass — set QA_RATE_LIMIT_BYPASS_SECRET in Railway env vars.
// Chrome QA sessions send this secret in the X-QA-Bypass header to skip all rate limiting.
// Secure: requires knowledge of the secret; does not weaken prod security (secret is never public).
const isQABypassRequest = (req: express.Request): boolean => {
  const secret = process.env.QA_RATE_LIMIT_BYPASS_SECRET;
  if (!secret) return false;
  return req.headers['x-qa-bypass'] === secret;
};

// Global rate limit — anonymous: 500 req / 15 min per IP, authenticated: 3000 req / 15 min per IP
// Authenticated users (valid Bearer token present) get 6x headroom — they're real logged-in users,
// not bots. This prevents polling-heavy pages (POS, dashboard) from self-rate-limiting.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => {
    // Authenticated requests get 3000/15min (200/min) — enough for dashboard + POS polling
    if (req.headers.authorization?.startsWith('Bearer ')) return 3000;
    // Anonymous requests stay at 500/15min (33/min) — protects against scrapers/brute force
    return 500;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  // 2026-07-28: log rejections — this backend has no access logger (no morgan/winston/pino),
  // so a 429 was previously invisible in Railway logs. `handler` replaces express-rate-limit's
  // default response entirely, so it must still send the same 429 JSON body itself.
  handler: (req, res) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    console.warn(`[rateLimit] 429 ${req.method} ${req.path} ip=${ip} ua="${req.headers['user-agent'] || ''}"`);
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  },
  // 2026-07-28: verified-crawler bypass (GET only) — GSC Live Test showed /map's client-side
  // sales query failing for Googlebot's renderer (Soft 404 investigation). The anonymous
  // 500/15min budget had no exemption for search-engine crawlers; a crawl burst from a shared IP
  // can trip it. This only loosens a rate limit (not auth/payment), so a spoofed UA just wins a
  // bigger anonymous budget, not access to anything sensitive — reuses the same detectCrawler()
  // UA patterns as crawlerAnalyticsMiddleware to avoid a second list drifting out of sync.
  skip: (req) =>
    req.path.startsWith('/api/viewers') ||
    req.path === '/api/health/latency' ||
    isWhitelistedIP(req) ||
    (req.method === 'GET' && detectCrawler((req.headers['user-agent'] as string) || '') !== null),
  store: createRateLimitStore(),
});
app.use(resilientLimiter(globalLimiter));

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

    // Bypass rate limit for QA sessions using the shared bypass secret
    if (isQABypassRequest(req)) return true;

    // Bypass rate limit for test accounts (@example.com)
    const email = req.body?.email?.toLowerCase();
    if (email && email.endsWith('@example.com')) return true;

    // Bypass rate limit for session check — auth/me fires on every SSR page navigation
    // and should never be subject to login-attempt throttling.
    // Also skip auth/refresh — token refresh failures are not auth attacks; counting them
    // burns the IP's budget and causes authenticated users to see 429 on page transitions.
    if (req.path === '/me' || req.path === '/refresh' || req.path === '/logout') return true;

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

// Raw body middleware for Stripe and eBay webhooks (must come before json parser)
// eBay routes: express.raw() consumes the stream before global express.json() can attempt it,
// preventing the "stream is not readable" Sentry error when eBay closes the connection early.
// handleEbayAccountDeletion and handleEbayNotification ignore req.body, so raw buffer is fine.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use('/api/ebay/account-deletion', express.raw({ type: '*/*' }));
app.use('/api/ebay/notifications', express.raw({ type: '*/*' }));
// Resend webhook: svix signature verification needs the raw body, so capture it
// before the global json parser consumes the stream (same pattern as Stripe above).
app.use('/api/outreach/resend-webhook', express.raw({ type: 'application/json' }));

// JSON parser with 1 MB body size limit to prevent payload attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// P0 Security Fix: Parse httpOnly cookies for JWT authentication
app.use(cookieParser());

// #104: CSRF protection — set token on all requests, validate on state-mutating routes
app.use(csrfTokenCookie);
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Validate CSRF token on POST, PUT, PATCH, DELETE requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    // ADR-084 fix (2026-07-16): the Marketplace Autofill browser extension authenticates with a
    // Bearer token (Authorization header), NOT the session cookie. Bearer-token requests are
    // inherently CSRF-safe -- a forged cross-site request cannot attach the Authorization header the
    // way the browser auto-attaches cookies. The global CSRF check (a cookie-session defense) was
    // therefore blocking EVERY extension write (POST /api/extension/items/:id/listed and /removed),
    // so the extension could read inventory but never record a listing as listed or removed. Skip
    // CSRF only for Bearer-authenticated requests to /api/extension; a cookie-only request to the
    // same path still gets validated.
    const hasBearer = (req.headers.authorization || '').startsWith('Bearer ');
    if (req.path.startsWith('/api/extension') && hasBearer) {
      return next();
    }
    // Booth-token cart sessions (ADR-015 Contract Defined -- vendor covers register via
    // X-Booth-Token, no login, no CSRF cookie by design) are inherently CSRF-safe for the
    // same reason Bearer tokens are above: a cross-site attacker cannot read/attach a
    // secret X-Booth-Token header the victim never had, and an attacker who already
    // possesses a valid booth token doesn't need CSRF to abuse it. Confirmed live
    // 2026-07-23 (findasale-hacker VendorBooth adversarial pass): the global CSRF check
    // was unconditionally 403'ing every booth-token cart mutation (start/add-items/
    // terminal/qr/capture/cancel) before requireBoothTokenOrTeamMember ever ran -- the
    // entire no-login vendor-cashier flow was non-functional in production. Scoped
    // narrowly to the hub cart routes where X-Booth-Token is a recognized credential
    // (requireBoothTokenOrTeamMember, requireBoothAuth.ts) -- a forged header on an
    // unrelated route grants nothing, since no other middleware reads it.
    const hasBoothToken = typeof req.headers['x-booth-token'] === 'string' && req.headers['x-booth-token'].length > 0;
    if (/^\/api\/organizer\/hubs\/[^/]+\/cart(\/|$)/.test(req.path) && hasBoothToken) {
      return next();
    }
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

// Bare /health — uptime monitors that don't use /api prefix (no auth required)
// S1032 guardrail (b): enhanced freshness assertion — detects the stranded-deploy class (S1031).
// deployedSha: Railway auto-injects RAILWAY_GIT_COMMIT_SHA on each deploy; mismatch vs HEAD = stranded.
// lastJobRunAt: most recent ScrapedSalesJob.createdAt — confirms cron pipeline is alive.
// uptimeSec: elapsed seconds since process start — abnormally low = recent crash-loop restart.
app.get('/health', async (req, res) => {
  try {
    const [lastJob] = await prisma.scrapedSalesJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { createdAt: true, source: true, status: true },
    });
    res.json({
      status: 'ok',
      deployedSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'unknown',
      lastJobRunAt: lastJob?.createdAt ?? null,
      lastJobSource: lastJob?.source ?? null,
      lastJobStatus: lastJob?.status ?? null,
      uptimeSec: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // DB unavailable — still return liveness with degraded flag so uptime monitors don't false-positive
    res.json({
      status: 'ok',
      deployedSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'unknown',
      lastJobRunAt: null,
      lastJobSource: null,
      lastJobStatus: null,
      uptimeSec: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
      timestamp: new Date().toISOString(),
      dbError: true,
    });
  }
});

// Readiness probe — verifies the DB is reachable before declaring the instance ready to serve.
// Liveness (/health above) only confirms the process is up; readiness confirms dependencies.
app.get('/health/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    console.error('[health/ready] Readiness check failed — DB unreachable:', err);
    res.status(503).json({ status: 'not-ready' });
  }
});

// Routes
app.use('/api/auth', resilientLimiter(authLimiter), authRoutes); // stricter rate limit on auth
app.use('/api/auth/passkey', passkeyRoutes); // Feature #19: Passkey/WebAuthn routes (authLimiter already applied via /api/auth mount above)
app.use('/api/sales', saleRoutes);
app.use('/api/extension', extensionRoutes); // ADR-084: Marketplace Autofill browser extension
// Sentry FINDASALE-NODEJS-4H: re-analyze pipeline needs more than the global 30s
// budget (image download + Vision/Haiku + eBay category resolve + catalog
// enrichment). Excluded from the global timeout in requestTimeout.ts; given its
// own longer timeout here, same pattern as /api/upload/batch-analyze below.
app.post('/api/items/:id/reanalyze', requestTimeout(90000));
app.use('/api/items', itemRoutes);
app.use('/api/items', pricingSignalsRoutes);            // Pricing signals: sleeper patterns & brand premiums
app.use('/api/pricing', pricingRoutes);                 // Phase S574: Multi-source pricing engine
app.use('/api/favorites', favoriteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/stripe-connect', stripeConnectRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/geocode', geocodeRoutes);
app.post('/api/upload/batch-analyze', requestTimeout(120000)); // AI batch analysis needs up to 2 min
app.use('/api/upload', uploadRoutes);
app.use('/api/organizers', organizerRoutes);
app.use('/api/companies', companyRoutes); // #567: hire-intent company directory (SEO)
app.use('/api/contact', contactLimiter, contactRoutes); // M3: dedicated contact spam limiter
app.use('/api/push', pushRoutes);
app.use('/api/feed', feedRoutes); // Phase 28: personalized activity feed
app.use('/api/google-merchant', googleMerchantRoutes); // Feature #463: Google Merchant Center product feed (TSV)
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
app.use('/api/pos', posRoutes);                       // POS Upgrade: Open Cart & Payment Links
app.use('/api/planner', plannerRoutes); // Planning assistant chatbot
app.use('/api/buying-pools', buyingPoolRoutes); // Group Buying Pools
app.use('/api/organizer-digest', organizerDigestRoutes); // Organizer weekly digest manual trigger
app.use('/api/admin', adminRoutes); // Admin panel
app.use('/api/admin/affiliate', adminAffiliateRoutes); // Admin: Creator/Affiliate management
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev', devRoutes); // Dev utilities — NOT in production (privilege escalation risk)
}
app.use('/api/notifications/inbox', notificationInboxRoutes); // Notification inbox
app.use('/api/waitlist', waitlistRoutes); // Item Waitlist / "Notify Me"
app.use('/api/pickup', pickupRoutes); // Pickup Appointment Scheduling
app.use('/api/early-access-cache', earlyAccessRoutes); // Early Access Cache: replace Lucky Roll
app.use('/api/guild', guildRoutes); // Phase 2b: Explorer's Guild Hall of Fame
app.use('/api/invites', inviteRoutes); // Beta invite code validation (public)
app.use('/api/social-post', socialPostRoutes); // Social media post generator
app.use('/api/coupons', couponsRouter);         // Sprint 3: Shopper Loyalty Coupons
app.use('/api/boosts', boostsRouter);           // Phase 2b: Dual-rail boost system
app.use('/api/routes', routeRoutes);            // D3: Map route planning
app.use('/api/viewers', viewerLimiter, viewersRouter);         // Feature 34: Hype Meter viewer counts
app.use('/api/export', exportRouter);                            // Sprint 2: Export features
app.use('/api/social', socialRouter);                            // Sprint 2: Social template generator
app.use('/api/social-publisher', socialPublisherRoutes);       // ADR-077: In-house social publisher (admin-only)
app.use('/api/marketplace-poster', marketplacePosterRoutes);   // ADR-083: Marketplace Poster (admin-only)
app.use('/api/tags', tagRouter);                                 // Sprint 3: Tag-based SEO endpoints
app.use(hubRoutes);                                              // Feature #40+#44: Sale Hubs & Neighborhood Sale Day
app.use(vendorBoothRoutes);                                      // Vendor Booth Payments (2026-07-07): flea market multi-booth checkout
app.use('/api/voice', voiceRoutes);                              // Feature #42: Voice-to-tag extraction
app.use('/api/billing', billingRoutes);                          // #65 Sprint 2: Stripe billing endpoints
app.use('/api/points', pointsRoutes);                       // XP tracking: sale visits
app.use('/api/consignors', consignorRoutes);                     // Feature #309: Consignor Portal & Payouts
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
app.use('/api/item-inventory', itemInventoryRoutes);                // Feature #25: Item Inventory
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
app.use('/api', shareLinksRouter);                                   // Feature: Verified Social Share XP System
app.use('/api/health', healthRoutes);                                // Feature #20: Proactive Degradation Mode
app.use('/api/achievements', achievementRoutes);                     // Features #58-59: Achievement Badges & Streak Rewards
app.use('/api/fraud', fraudRoutes);                                  // Feature #17: Bid Bot Detector
app.use('/api/trails', trailRoutes);                                 // Feature #48: Treasure Trail Route Builder
app.use('/api/workspace', workspaceRoutes);                          // Feature #13: TEAMS Multi-User Workspace
app.use('/api/workspaces', staffRoutes);                               // Team Collaboration: Staff Management
app.use('/api/encyclopedia', encyclopediaRoutes);                     // Feature #52: Estate Sale Encyclopedia
app.use('/api/appraisals', appraisalRoutes);                          // Feature #54: Crowdsourced Appraisal API
// REMOVED S437: Typology deprecated
// app.use('/api', typologyRoutes);
app.use('/api/sync', syncRoutes);                                    // Feature #69: Local-First Offline Mode
app.use('/api/checklist', checklistRoutes);                            // Sale Checklist
app.use('/api/disputes', disputeRoutes);                               // Disputes Management
app.use('/api/message-templates', messageTemplateRoutes);              // Message Templates
app.use('/api/items', priceHistoryRoutes);                             // Price History (sub-routes under /api/items/:id/price-history)
app.use('/api/saved-searches', savedSearchRoutes);                     // Saved Searches with notifyOnNew
app.use('/api/sale-waitlist', saleWaitlistRoutes);                     // Sale Waitlist (sale-level)
app.use('/api/treasure-hunt', treasureHuntRoutes);                     // Daily Treasure Hunt
app.use('/api/trending', trendingRoutes);                              // Trending Items & Sales
app.use('/api/index', indexMetrosRoutes);                              // Weekend Sale Index — public aggregation for backlink/PR asset
app.use('/api/reports', reportsRoutes);                                // #442: Monthly trend report pages
app.use('/api/cities', citiesRoutes);                                  // ADR-074: Metro Sync city pages
app.use('/api/categories', categoriesRoutes);                          // ADR-074 Phase 2: Category trending items
app.use('/api/internal', internalRoutes);                              // ADR-076: Internal scraper endpoint
app.use('/api/public', saleOfTheDayRoutes);                            // Feature #401: Sale of the Day (public, no auth)
app.use('/api/clearance', clearanceRoutes);                              // Feature #460: End-of-Sale clearance discovery (public, no auth)
// Widget inventory: public, unauthenticated, wildcard CORS (per-route only — global CORS unchanged)
app.use('/api/widget', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
}, widgetRoutes);                                                          // Public embeddable widget (embed feature)
app.use('/api/outreach', outreachRoutes);                             // Phase 1: Cold outreach email pipeline
app.use('/api/unsubscribe', unsubscribeRoutes);                        // Unsubscribe / Preferences
app.use('/api/earnings', earningsPdfRoutes);                           // Payout PDF Export (/api/earnings/pdf)
app.use('/api/ab', abTestRoutes);                                      // A/B Testing Infrastructure
app.use('/api/feedback', feedbackRoutes);                              // User Feedback
app.use('/api/testimonials', testimonialRoutes);                       // Outward Email Automation #2a: testimonial capture
app.use('/api/bids', bidsRoutes);                                      // Shopper bids page
app.use('/api/xp', xpController);                                      // Phase 2a: Explorer's Guild XP system
app.use('/api/support', supportRoutes);                                 // #128: Automated Support Stack
app.use('/api/sales', settlementRoutes);                                   // Feature #228: Settlement Hub
app.use('/api/consignor-settlements', consignorSettlementRoutes);          // Feature #239: Multi-Consignor Estate Settlement
app.use('/api/ebay', ebayRoutes);                                          // eBay Marketplace Account Deletion
app.use('/api/ebay', ebayTaxonomyRoutes);                                  // Phase C: eBay Taxonomy + Catalog + AI Suggest
app.use('/api/barcode', barcodeRoutes);                                    // Barcode scan -> eBay Catalog product enrichment
app.use('/api/shopify', shopifyRoutes);                              // Feature: Shopify Cross-Listing
app.use('/api/lucky-roll', luckyRollRoutes);                               // Phase 2b: Lucky Roll — weekly XP gacha
app.use('/api/crews', crewsRoutes);                                        // Phase 2a: Explorer's Guild — Crew Creation
app.use('/api/discount-rules', discountRuleRoutes);                         // Feature #310: Color-tagged Discount Rules
app.use('/api/markdown-cycles', markdownCycleRoutes);                       // Feature: Automatic Markdown Cycles (PRO Tier)
app.use('/api/locations', locationRoutes);                                   // #311: Multi-Location Inventory View
app.use('/api/qr-scanner', qrScannerRoutes);                                 // QR Scanner Phase 2: scan analytics
app.use('/api', imageProxyRoutes);                                              // Image proxy for eBay CDN images
app.use(crawlerAnalyticsMiddleware);                                             // AI Crawler Analytics — fire-and-forget, never blocks
app.use('/api/crawler-stats', crawlerStatsRouter);                              // AI Crawler Stats
app.use('/api/crawler-log', crawlerLogRouter);                                  // AI Crawler Log — SSR bot tracking
app.use('/api/organizer/demand-signals', demandSignalsRouter);                  // #454 Organizer Demand Dashboard
app.use('/api', aiScoreRouter);                                           // GEO Phase 3: Search Visibility Score
app.use('/api/admin/video-pipeline', videoPipelineAdminRoutes);           // ADR-078 Wave 3: admin-only video pipeline dry-run trigger (temporary ops endpoint)
app.use('/api/video', videoRoutes);                                       // ADR-080 Stage 1b: event-driven footage ingest (shared-secret auth)

// Protected route example
app.get('/api/protected', authenticate, (req, res) => {
  res.json({ message: 'This is a protected route', user: (req as any).user });
});

// JSON 404 — catch-all for genuinely unmatched routes. Placed AFTER every route
// registration and BEFORE the eBay webhook error guard / Sentry / global error handler.
// This is a normal (non-error) middleware, so only requests that matched no route reach
// it; thrown errors skip it and go straight to the 4-arg error handlers below. Returns the
// app's JSON error shape instead of Express's default HTML 404.
app.use((req, res) => res.status(404).json({ message: 'Not found' }));

// eBay webhook stream guard — must run BEFORE Sentry's error handler so it never records this noise.
// express.json() (global body parser) throws `stream is not readable` (raw-body type: stream.not.readable)
// when eBay's delivery infrastructure closes the HTTP connection before body-parse finishes reading.
// This occurs on rapid retries and keep-alive connection reuse. Since handleEbayAccountDeletion and
// handleEbayNotification both ignore req.body entirely, we ack 200 immediately to halt eBay's retry loop.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const isEbayWebhookPath =
    req.path === '/api/ebay/account-deletion' || req.path === '/api/ebay/notifications';
  const isStreamError =
    err?.type === 'stream.not.readable' || err?.message === 'stream is not readable';
  if (isEbayWebhookPath && isStreamError) {
    if (!res.headersSent) {
      res.status(200).json({});
    }
    return;
  }
  next(err);
});

// Sentry error handler — must be registered after all routes and before the custom error handler
// Captures exceptions and attaches Sentry event IDs to req.sentry
Sentry.setupExpressErrorHandler(app);

// ─── Process-level safety net ────────────────────────────────────────────────────────────────────
// Reliability hardening: capture errors that escape Express/async handlers so they reach Sentry
// instead of vanishing (or, for uncaughtException, silently taking the process down).
// Sentry was initialized at the top of this file via `import './instrument'`.

// unhandledRejection: a Promise rejected with no .catch(). Log + capture, but DO NOT exit —
// a stray rejected promise should not take the whole API down.
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('[unhandledRejection] Unhandled promise rejection:', reason);
  try {
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)), {
      tags: { type: 'unhandledRejection' },
      extra: { promise: String(promise) },
      level: 'error',
    });
  } catch (_sentryErr) {
    // Sentry capture failed — never let the handler itself throw.
  }
});

// uncaughtException: a truly fatal, unrecovered synchronous error. Log + capture to Sentry,
// then let the existing graceful-shutdown path run and the process exit. We deliberately do
// NOT swallow this — continuing after an uncaught exception leaves the process in an undefined
// state. flush() best-effort ensures the Sentry event is sent before exit.
process.on('uncaughtException', (err: Error) => {
  console.error('[uncaughtException] Fatal uncaught exception:', err?.message, err?.stack);
  try {
    Sentry.captureException(err, {
      tags: { type: 'uncaughtException' },
      level: 'fatal',
    });
    // Best-effort flush, then exit non-zero so Railway restarts the service cleanly.
    Sentry.flush(2000).finally(() => process.exit(1));
  } catch (_sentryErr) {
    process.exit(1);
  }
});

// H8: Global error handler — catches uncaught async errors forwarded via next(err)
// Must be defined AFTER all routes and BEFORE app.listen
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message, err.stack);
  // Guard: if a handler already sent a response (e.g. scraper/ingest, ebay/account-deletion)
  // attempting to send again causes "Cannot set headers after they are sent". Log and bail.
  if (res.headersSent) {
    console.error('Global error handler: response already sent, suppressing duplicate response');
    return;
  }
  const status = (err as any).status || (err as any).statusCode || 500;
  // Don't leak internal error details to clients on 5xx. Full detail is already logged above
  // and captured by Sentry's error handler; return a generic message for server errors.
  // 4xx messages are client-actionable and are preserved as-is.
  if (status >= 500) {
    res.status(status).json({ message: 'Internal server error' });
  } else {
    res.status(status).json({ message: err.message || 'Request error' });
  }
});

// Graceful shutdown handler — shared between SIGINT and SIGTERM
const gracefulShutdown = async (signal: string) => {
  console.log(`[${signal}] Graceful shutdown initiated`);

  // Close HTTP server first — stops accepting new requests
  httpServer.close(async () => {
    console.log('[shutdown] HTTP server closed');

    // Disconnect Prisma — ensures all DB connections are cleanly closed
    try {
      await prisma.$disconnect();
      console.log('[shutdown] Prisma disconnected');
    } catch (err) {
      console.error('[shutdown] Error disconnecting Prisma:', err);
    }

    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long (30 seconds)
  const forceExitTimeout = setTimeout(() => {
    console.error('[shutdown] Forced exit after timeout (30s)');
    process.exit(1);
  }, 30000);

  // Clear timeout if graceful shutdown completes in time
  httpServer.once('close', () => clearTimeout(forceExitTimeout));
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// V1: Listen on the HTTP server (not app.listen) so Socket.io shares the same port
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`FindA.Sale backend running on port ${PORT} (HTTP + Socket.io)`);

  // S1065: one-time (self-limiting) reclassify-bounces backfill check -- no-op once caught up
  bounceSuppressService_runReclassifyBackfillIfNeeded();

  // Phase 2B: Register cleanup cron for stale DRAFT items
  scheduleCleanupCron();

  // Auto-close expired PUBLISHED scraped sales hourly
  scheduleSaleAutoCloseCron();

  // Feature #103: Register photo retention cron
  schedulePhotoRetentionCron();
  scheduleFootageRetentionCron(); // ADR-080 §7: raw R2 footage retention sweep

  // Webhook event pruning (30-day retention)
  scheduleWebhookEventPruneJob();

  // Operational-log retention sweep (60-day retention) — prunes ScrapedSalesJob,
  // OutreachAuditLog, DirectoryCrawlLog. Operational logs only; no user/sale/item data.
  scheduleLogRetentionCron();

  // #112: Register quarterly archival cron
  scheduleArchivalCron();

  // #112 daily: Expire stale scraped venue records (RETAIL/FLEA_MARKET) whose date window lapsed
  expireStaleVenueCron();
  scheduleScrapedSalePruneCron(); // gated by PRUNE_ENABLED env

  // ADR 1 2026-07-11: Register daily Stripe migration reconciliation cron (04:30 server
  // time, after the 04:00 prune job) — self-healing backstop for the account.updated
  // webhook cutover, independent of webhook subscription/config correctness.
  scheduleStripeMigrationReconcileCron();

  // ADR-090 Phase 4: Register monthly VendorBooth flat boothFee billing cron (1st of
  // the month, 06:00 UTC) — charges each CONFIRMED booth's saved payment method and
  // Transfers proceeds to the hub owner. Safe to run with no vendor payment methods
  // on file yet (pre-wire state) — see vendorBoothFeeBillingCron.ts header.
  scheduleVendorBoothFeeBillingCron();

  // Feature #91: Register auto-markdown cron
  scheduleMarkdownCron();
  scheduleMarkdownCycleCron();

  // Feature #463: Register Google Merchant Center feed cron (3:30 AM UTC daily)
  scheduleGoogleMerchantFeedCron();

  // Feature: Register retail auto-renewal cron (daily at 1 AM UTC)
  scheduleRetailAutoRenewCron();

  // Feature: Register referral reputation score recomputation cron (daily at 2 AM UTC)
  scheduleReputationScoreCron();

  // Feature #309: Register consignor expiry notice cron (daily at 2 AM UTC)
  scheduleConsignorExpiryNoticeCron();

  scheduleOutwardEmailAutomationsCron();

  // ADR shipping-resync Phase 3 / Part C: Register daily carrier-rate drift re-pin sweep (4 AM UTC)
  scheduleResyncShippingDriftCron();

  // ADR-075: Register EstateSales.NET sale detail enrichment cron (every 4 hours at :00 UTC)
  scheduleSaleDetailEnrichmentCron();

  // Feature #244 Phase 3: Register eBay sold sync cron (every 15 minutes — polling fallback)
  startEbaySoldSyncCron();

  // eBay Queue Mode engine — auto-manage listing slots (every 30 minutes)
  startEbayListingQueueCron();

  // Feature #244 Phase 3: Register eBay ended listings sync cron (every 4 hours — passive reconciliation)
  startEbayEndedListingsSyncCron();

  // Feature #244 Phase 4: Register eBay bidirectional listing sync cron (every 4 hours — pull eBay changes back)
  startEbayListingSyncCron();

  // Feature #244 Phase 4: Register eBay Commerce Notification subscription (real-time sold sync)
  registerEbayNotificationSubscription().catch(err =>
    console.warn('[eBay Notify Setup] Non-fatal startup error:', err.message)
  );

  // Phase S574: Register pricing engine crons (quota reset at 3 AM, recovery at 4 AM UTC)
  scheduleQuotaResetCron();
  scheduleCircuitBreakerRecoveryCron();

  // ADR-073: Geocoding success rate audit cron (daily at 6 AM UTC)
  scheduleGeocodingAuditCron();

  // ADR-073: Geocode backlog — defensive require() so a missing/corrupt compiled file
  // can't crash-loop the entire server at startup (Sentry FINDASALE-NODEJS-1A pattern).
  try {
    const { scheduleGeocodeBacklogCron } = require('./jobs/geocodeBacklogJob');
    scheduleGeocodeBacklogCron();
  } catch (err: any) {
    console.error('[Geocode Backlog] Non-fatal startup error — cron not scheduled:', err?.message);
  }

  // 2026-07-28: City-coordinate backfill — warms CityCoordinate for every servable
  // city slug so /sales/by-city runs its 35mi radius query instead of silently
  // degrading to exact city-string matching on a cold cache (1,088 of 2,710 slugs
  // with active inventory had no centroid row). Same defensive require() pattern as
  // the geocode backlog above: a missing/corrupt compiled file must not crash-loop
  // the server at startup.
  try {
    const { scheduleCityCoordinateBackfillCron } = require('./jobs/cityCoordinateBackfillJob');
    scheduleCityCoordinateBackfillCron();
  } catch (err: any) {
    console.error('[cityCoordinateBackfill] Non-fatal startup error — cron not scheduled:', err?.message);
  }

  // Feature #75: Tier grace period finalization cron
  startTierGraceCron();

  // D-XP-004 Phase 4: Register referral reward age gate cron (daily at 2 AM UTC)
  scheduleReferralRewardAgeGateCron();

  // Feature #405: Founding Organizer Badge — award first 500 real organizers (nightly 2 AM UTC)
  scheduleFoundingOrgBadgeCron();

  // ADR-077: Register in-house social publisher cron (every 10 minutes)
  scheduleSocialPublisherCron();

  // ADR-083: Register Marketplace Poster cron (every 10 minutes)
  // DISABLED 2026-07-16: ADR-083 server-side Marketplace poster is deprecated (ADR-084 -- no
  // MarketplacePosterAccounts exist, FB has no removal API). This cron only ever marked QUEUED
  // MarketplaceListingJob rows SKIPPED every 10 min, and it grabbed extension-owned REMOVE jobs
  // before they were visible as "pending removal". Removal is now 100% extension-driven
  // (checkPendingRemovals -> /extension/pending-removals). Leaving the schedule call off.
  // scheduleMarketplacePosterCron();

  // Comment/mention engagement monitor (hourly YouTube/X polling) + approved-reply poster (every 30 min)
  scheduleEngagementMonitorCron();

  // ADR-080 Stage 1b: register footage-batch quiet-seal cron (every 5 min)
  scheduleFootageBatchSealCron();

  // Features #58-59: Initialize achievements from code
  syncAchievements();

  // #95: Initialize bid rate limiter (Redis)
  initBidRateLimiter();

  // #94: Initialize coupon validation rate limiter (Redis)
  initCouponRateLimiter();

  // ADR-073 Phase 1: Initialize directory scraper cron (gated by SCRAPER_ENABLED env var)
  // Defensive try/catch: a corrupt/missing compiled source module or an undefined
  // SOURCE_REGISTRY entry must NOT crash-loop the entire server at startup.
  // (Sentry FINDASALE-NODEJS-3G / 1D pattern — same precedent as geocodeBacklog above.)
  try {
    initScraperCron();
  } catch (err: any) {
    console.error('[scraperCron] Non-fatal startup error — scraper cron not scheduled:', err?.message);
    try {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { type: 'scraperCronInitFailure' },
      });
    } catch (_sentryErr) {
      // swallow — Sentry must never turn a logged warning into a crash
    }
  }

  // ADR-074: Initialize metro sync cron (gated by METRO_SYNC_ENABLED env var)
  initMetroSyncCron();

  // ADR-074 Phase 2: Initialize category sync cron (gated by CATEGORY_SYNC_ENABLED env var)
  initCategorySyncCron();

});
