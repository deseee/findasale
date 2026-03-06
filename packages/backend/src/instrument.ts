import dotenv from 'dotenv';
import path from 'path';

// Load env before anything else — modules imported after this will have process.env populated
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import * as Sentry from '@sentry/node';

// Must be imported as the very first module in index.ts.
// Initializes Sentry before any other code runs so all errors are captured.
// Gracefully disabled if SENTRY_DSN is not set (local dev without monitoring).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  enabled: !!process.env.SENTRY_DSN,
});