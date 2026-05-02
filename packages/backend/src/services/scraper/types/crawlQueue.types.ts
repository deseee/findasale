/**
 * Directory Crawl Management System — Type definitions for queue and crawl operations
 *
 * Supports multiple directory sources (Google Places, HERE Maps, Foursquare, OSM Overpass)
 * with budget tracking, scheduling, and claim outreach pipelines.
 */

/**
 * Supported directory source APIs
 */
export type CrawlSourceName = 'GooglePlaces' | 'HEREPlaces' | 'Foursquare' | 'OSMOverpass';

/**
 * Organizer directory lifecycle status
 * - ACTIVE: Currently operating, eligible for outreach
 * - UNCERTAIN: Conflicting signals or needs re-verification
 * - CLOSED: Marked as permanently closed
 * - REOPENED: Previously closed, now reopened
 */
export type DirectoryStatus = 'ACTIVE' | 'UNCERTAIN' | 'CLOSED' | 'REOPENED';

/**
 * Claim outreach pipeline status
 * - UNCLAIMED: Profile created via scraper, organizer never invited
 * - INVITED: Claim email(s) sent
 * - CLAIMED: Organizer successfully claimed profile
 * - OPTED_OUT: Organizer explicitly declined outreach
 */
export type ClaimStatus = 'UNCLAIMED' | 'INVITED' | 'CLAIMED' | 'OPTED_OUT';

/**
 * Query locale for international support
 * - en: English-language queries
 * - fr: French-language queries (primarily Quebec)
 */
export type CrawlLocale = 'en' | 'fr';

/**
 * Pause reason when crawl queue is paused
 */
export type PauseReason = 'ZERO_RESULTS' | 'BUDGET_EXHAUSTED' | 'MANUAL';

/**
 * Geographic configuration for crawl batches
 */
export interface SubAreaConfig {
  metro: string; // City name, e.g., "New York"
  country: 'US' | 'CA'; // ISO 2-char code
  subAreas: string[]; // Districts/boroughs, e.g., ["Brooklyn", "Manhattan"]
  province?: string; // Canadian province abbreviation, required when country='CA'
}

/**
 * DirectoryCrawlQueue entry — scheduling table for directory source crawls
 *
 * Core responsibilities:
 * - Scheduling next run based on priority and backoff
 * - Tracking budget usage (API requests per period)
 * - Auto-pausing after consecutive zero results
 * - Detecting saturation (API result cap reached)
 * - Managing pagination state for mid-crawl resume
 */
export interface CrawlQueueEntry {
  id: string;
  metro: string;
  subArea: string | null;
  country: string; // "US" or "CA"
  province: string | null; // Canadian province, e.g., "ON", "QC"
  sourceName: CrawlSourceName;
  queryType: string; // e.g., "estate sale organizer"
  locale: CrawlLocale; // "en" or "fr"
  nextRunAt: Date;
  lastRunAt: Date | null;
  lastResultCount: number | null;
  consecutiveZeroRuns: number;
  isPaused: boolean;
  pauseReason: PauseReason | null;
  isSaturated: boolean; // true when lastResultCount = 60
  budgetMonthYear: string; // "2026-05"
  requestsUsedThisPeriod: number;
  requestsBudgetMax: number; // Default 5000 per month
  priority: number; // Higher = runs sooner
  backoffMultiplier: number; // Exponential backoff on failures
  consecutiveErrors: number;
  lastError: string | null;
  pageTokenState: string | null; // Cursor for pagination resume
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Result of a single crawl run
 *
 * Captures success/failure metrics and organizer creation/update counts
 * for audit trail and analytics.
 */
export interface CrawlRunResult {
  queueId: string;
  resultCount: number;
  newOrganizersCreated: number;
  organizersUpdated: number;
  duplicatesSkipped: number;
  errorMessage?: string;
  durationMs?: number;
}

/**
 * Extended run result with full audit trail fields
 * Used for DirectoryCrawlLog persistence
 */
export interface CrawlLogEntry extends CrawlRunResult {
  id: string;
  runAt: Date;
  sourceName: string;
  metro: string;
  subArea: string | null;
  queryType: string;
  createdAt: Date;
}

/**
 * Directory claim email status tracking
 */
export type ClaimEmailStatus = 'PENDING' | 'SENT' | 'BOUNCED' | 'OPTED_OUT' | 'CLAIMED';

/**
 * DirectoryClaimEmail entry — outreach tracking for claim conversion
 *
 * 3-touch email sequence:
 * 1. Initial contact: "We found you on [source], claim your profile"
 * 2. Follow-up (7 days): "Still interested? Claim your listing"
 * 3. Final attempt (14 days): "Last chance to claim your profile"
 *
 * After 3 bounces or opted_out flag, transitions to OPTED_OUT status.
 */
export interface ClaimEmailEntry {
  id: string;
  organizerId: string;
  emailAddress: string;
  sentAt: Date | null;
  status: ClaimEmailStatus;
  attemptCount: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
