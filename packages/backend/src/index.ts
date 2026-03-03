import dotenv from 'dotenv';
import path from 'path';

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

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
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
import { authenticate } from './middleware/auth';
import { PrismaClient } from '@prisma/client';
import './jobs/auctionJob';
import './jobs/notificationJob';
import './jobs/emailReminderJob';

// Create a single Prisma instance with connection pooling configuration
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Configure connection pool settings to prevent too many connections
  transactionOptions: {
    maxWait: 5000, // 5 seconds
    timeout: 10000, // 10 seconds
  },
});

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── Security ──────────────────────────────────────────────────────────────

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

// Global rate limit — 200 req / 15 min per IP (prevents brute force and scraping)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// Stricter limit on auth routes — 10 req / 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

// Raw body middleware for Stripe webhooks (must come before json parser)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// JSON parser with 1 MB body size limit to prevent payload attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'FindA.Sale API is running!' });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes); // stricter rate limit on auth
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
app.use('/api/contact', contactRoutes);

// Protected route example
app.get('/api/protected', authenticate, (req, res) => {
  res.json({ message: 'This is a protected route', user: (req as any).user });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FindA.Sale backend running on port ${PORT}`);
  
  // Log environment variables status for debugging
  console.log('Environment variables status:');
  console.log('- STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ Present' : '❌ Missing');
  console.log('- TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ Present' : '❌ Missing');
  console.log('- TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '✅ Present' : '❌ Missing');
  console.log('- DATABASE_URL:', process.env.DATABASE_URL ? '✅ Present' : '❌ Missing');
});
