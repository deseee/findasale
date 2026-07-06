import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { publishDuePosts } from '../services/social/socialPublisherService';

/**
 * Social publisher cron (ADR-077 §3).
 *
 * Every 10 minutes, publishes any SocialPost rows whose scheduledFor has arrived.
 * The engine acts ONLY on DB rows derived from an APPROVED markdown item — it never
 * parses markdown at send-time (the human approval gate is upstream, ADR-077 §3).
 *
 * Wrapped in cronGuard so failures land in Sentry monitors exactly like the other
 * ~40 jobs. alertThreshold surfaces a warning after 3 consecutive failed runs.
 */
export function scheduleSocialPublisherCron(): void {
  cron.schedule(
    '*/10 * * * *',
    cronGuard(
      { jobName: 'socialPublisher', alertThresholdConsecutiveFailures: 3 },
      async () => {
        await publishDuePosts(new Date());
      }
    )
  );

  console.log('[social-publisher-cron] Registered social publisher cron (every 10 minutes)');
}
