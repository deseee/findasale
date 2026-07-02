/**
 * Internal Job Runner Controller
 *
 * Single dispatcher endpoint (`POST /api/internal/jobs/run`) that lets GitHub
 * Actions workflows trigger background pipeline jobs over HTTPS. This replaces
 * the in-memory `cron.schedule(...)` calls — Railway restarts silently drop
 * those, leaving the acquisition/outreach pipeline stalled with no signal.
 * GitHub Actions cron is durable and observable; this endpoint is the bridge.
 *
 * Rollout note (S725): the in-memory crons are intentionally LEFT RUNNING
 * alongside this endpoint until a green 24h cycle is confirmed. Cron removal
 * (index.ts wiring + `cron.schedule` calls) is a separate Step 3 dispatch.
 *
 * Auth: `requireSecret` middleware (x-internal-secret header) is applied at the
 * route level in routes/internal.ts — same as every other protected internal
 * route. The dispatcher itself only accepts a job-name from a fixed allowlist,
 * so no IDs / SQL / free user input ever reaches a query.
 *
 * Concurrency: a module-level Set tracks currently-running job names. A second
 * request for an already-running job gets 409 instead of double-running it.
 * This also absorbs GitHub Actions workflow-retry overlap.
 */

import { Request, Response } from 'express';
import { sendOutreachEmails, syncLeadTierGroups } from '../jobs/outreachEmailsCron';
import { runLeadScoringBackfill } from '../services/leadScoringService';
import { runWebsiteEnrichmentBackfill } from '../jobs/websiteEnrichmentJob';
import { emailDiscoveryJob } from '../jobs/emailDiscoveryJob';
import { runOrganizerWebsiteAddressEnrichment } from '../jobs/organizerWebsiteAddressCron';
import { runAutoSeedOutreach } from '../jobs/autoSeedOutreachCron';
import { runMonthlyTrendReport } from '../jobs/monthlyTrendReportJob';
import { runGmailOAuthHealthCheck, runDailySendSummary, runSuspensionDetect } from '../jobs/gmailHealthCron';
import { runDeliverabilityMonitor } from '../jobs/deliverabilityMonitorJob';
import { bounceSuppressService } from '../services/bounceSuppressService';

/**
 * Allowlisted job-name → job logic function.
 * Every value is the runnable logic function of an existing cron job, exported
 * separately from its scheduler so it can be invoked directly here.
 */
const JOB_MAP: Record<string, () => Promise<unknown>> = {
  'outreach-emails': sendOutreachEmails,
  'sync-lead-tier-groups': syncLeadTierGroups,
  'lead-scoring': runLeadScoringBackfill,
  // S1058: was runWebsiteEnrichmentJob (hardcoded enrichBatch(0), single 50-row
  // slice per invocation — permanently stuck rescanning the same unenrichable head
  // once the in-process Sunday cron was removed and this dispatcher became the ONLY
  // automated trigger, run daily). Backfill paginates the full remaining pool each
  // run (up to MAX_BACKFILL_BATCHES) and is safe here: this endpoint responds 202
  // immediately (setImmediate, no HTTP timeout risk) and the runningJobs lock above
  // prevents overlapping runs if one day's backfill is still working when the next
  // day's cron fires. runWebsiteEnrichmentJob() is left in websiteEnrichmentJob.ts,
  // unused, as a still-valid single-batch primitive if ever needed again.
  'website-enrichment': runWebsiteEnrichmentBackfill,
  'email-discovery': emailDiscoveryJob,
  'organizer-website-address': runOrganizerWebsiteAddressEnrichment,
  'auto-seed-outreach': runAutoSeedOutreach,
  'monthly-trend-report': runMonthlyTrendReport,
  'gmail-health-check': runGmailOAuthHealthCheck,
  'daily-send-summary': runDailySendSummary,
  'suspension-detect': runSuspensionDetect,
  'deliverability-monitor': runDeliverabilityMonitor,
  'process-bounces': () => bounceSuppressService.processBounces(),
  'reclassify-bounces': () => bounceSuppressService.reclassifyBounces(),
};

/**
 * In-process lock of currently-running job names. Prevents the same job from
 * running twice concurrently (e.g. a GitHub Actions retry overlapping the
 * original run, or a manual workflow_dispatch firing during a scheduled run).
 */
const runningJobs = new Set<string>();

/**
 * POST /api/internal/jobs/run
 * Body: { "job": "<name>" } where name is one of JOB_MAP's keys.
 *
 * Responses:
 *   202 { ok: true,  job, status: "started" } — job accepted, running in background
 *   400 { ok: false, error: "unknown job" }   — job name not in allowlist
 *   409 { ok: false, error: "job already in progress" } — job is already running
 *
 * The job runs in the background (setImmediate) so the HTTP response returns
 * immediately — long jobs would otherwise hit Railway's 30s proxy timeout.
 */
export async function runInternalJob(req: Request, res: Response): Promise<void> {
  const job = typeof req.body?.job === 'string' ? req.body.job : '';

  const jobFn = JOB_MAP[job];
  if (!jobFn) {
    res.status(400).json({ ok: false, error: 'unknown job' });
    return;
  }

  if (runningJobs.has(job)) {
    console.warn(`[InternalJobRunner] Rejected "${job}" — already in progress`);
    res.status(409).json({ ok: false, error: 'job already in progress' });
    return;
  }

  runningJobs.add(job);
  res.status(202).json({ ok: true, job, status: 'started' });

  // Run in the background — response has already been sent.
  setImmediate(async () => {
    const startedAt = Date.now();
    console.log(`[InternalJobRunner] Starting "${job}"`);
    try {
      await jobFn();
      console.log(`[InternalJobRunner] Completed "${job}" in ${Date.now() - startedAt}ms`);
    } catch (err) {
      console.error(
        `[InternalJobRunner] Job "${job}" failed:`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      runningJobs.delete(job);
    }
  });
}
