/**
 * recruitConfig.ts -- ADR-139 organizer recruit channel configuration.
 *
 * Every variable here is RECRUIT_* (plus RESEND_PLAN_TIER, which only clamps the cap).
 * Nothing here reads the cold-outreach mailbox variables or the transactional key
 * (recruitIsolation.test.ts enforces that by static read). The one exception is the
 * isolation check in recruitTransport.ts, which compares RECRUIT_RESEND_API_KEY against
 * the transactional key in-process without ever logging either value.
 *
 * Defaults ship the channel OFF: transport 'none', env switch unset.
 */

export type RecruitTransportName = 'none' | 'resend_optin' | 'gmail_dedicated';

export const RECRUIT_FLAG_KEY = 'recruit_send_enabled';
export const CONSENT_WORDING_VERSION = 'interest_form:v1';

/** Sequence spacing in days after confirmation: step 1 day 0, step 2 day 3, step 3 day 8. */
export const SEQUENCE_DAY_OFFSETS: Record<number, number> = { 1: 0, 2: 3, 3: 8 };
export const SEQUENCE_LAST_STEP = 3;

/** Confirmation email limits (sales-ops review ADR change 7). */
export const CONFIRM_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const CONFIRM_MAX_EVER = 3;

export interface RecruitConfig {
  sendEnabledEnv: boolean;
  transport: RecruitTransportName;
  dailyCap: number;
  planTier: string;
  bouncePausePct: number;
  bounceWindowDays: number;
  bounceMinSample: number;
  bouncePauseAbsolute: number;
  sendingDomain: string;
  fromEmail: string;
  replyTo: string;
  mailingAddress: string;
  unsubSecret: string;
  frontendUrl: string;
  backendUrl: string;
}

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseTransport(v: string | undefined): RecruitTransportName {
  const t = (v || '').trim().toLowerCase();
  if (t === 'resend_optin' || t === 'gmail_dedicated') return t;
  return 'none';
}

/**
 * Effective daily cap: RECRUIT_DAILY_CAP (default 25) clamped to 1..100, and to 25
 * unless RESEND_PLAN_TIER=pro (the Free plan's 100/day limit is shared with transactional mail).
 */
export function effectiveDailyCap(rawCap: string | undefined, planTier: string | undefined): number {
  let cap = Math.floor(num(rawCap, 25));
  if (cap < 1) cap = 1;
  if (cap > 100) cap = 100;
  if ((planTier || 'free').trim().toLowerCase() !== 'pro' && cap > 25) cap = 25;
  return cap;
}

export function getRecruitConfig(env: NodeJS.ProcessEnv = process.env): RecruitConfig {
  const backendUrl =
    env.BACKEND_URL ||
    (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : 'https://backend-production-153c9.up.railway.app');
  return {
    sendEnabledEnv: env.RECRUIT_SEND_ENABLED === 'true',
    transport: parseTransport(env.RECRUIT_TRANSPORT),
    dailyCap: effectiveDailyCap(env.RECRUIT_DAILY_CAP, env.RESEND_PLAN_TIER),
    planTier: (env.RESEND_PLAN_TIER || 'free').trim().toLowerCase(),
    bouncePausePct: num(env.RECRUIT_BOUNCE_PAUSE_PCT, 3),
    bounceWindowDays: Math.max(1, Math.floor(num(env.RECRUIT_BOUNCE_WINDOW_DAYS, 7))),
    bounceMinSample: Math.max(1, Math.floor(num(env.RECRUIT_BOUNCE_MIN_SAMPLE, 20))),
    bouncePauseAbsolute: Math.max(1, Math.floor(num(env.RECRUIT_BOUNCE_PAUSE_ABSOLUTE, 2))),
    sendingDomain: (env.RECRUIT_SENDING_DOMAIN || 'recruit.finda.sale').trim().toLowerCase(),
    fromEmail: (env.RECRUIT_FROM_EMAIL || '').trim(),
    replyTo: (env.RECRUIT_REPLY_TO || '').trim(),
    mailingAddress: (env.RECRUIT_MAILING_ADDRESS || '').trim(),
    unsubSecret: env.RECRUIT_UNSUB_SECRET || '',
    frontendUrl: (env.FRONTEND_URL || 'https://finda.sale').replace(/\/$/, ''),
    backendUrl: backendUrl.replace(/\/$/, ''),
  };
}
