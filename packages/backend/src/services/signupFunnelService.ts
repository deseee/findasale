/**
 * Weekly organizer signup funnel (2026-11-19).
 *
 * One row per week (Monday 00:00 America/Detroit), counting each step of the path from an
 * outreach email to an organizer's first published sale, by the week the step HAPPENED
 * (not cohorts). Read-only: one raw SQL query, no schema change.
 *
 * Steps and where each one is recorded:
 *   outreachSent        DirectoryClaimEmail.touch1..4SentAt (each touch counts once)
 *   newContacts         DirectoryClaimEmail.touch1SentAt (organizers emailed for the first time)
 *   outreachOpened      DirectoryClaimEmail.touch1..4OpenedAt (pixel opens; Apple Mail inflates these)
 *   outreachClicked     DirectoryClaimEmail.touch1..4ClickedAt
 *   saleClaimEmailsSent ClaimEmail.sentAt (scraped-sale claim mail, separate rail)
 *   claimsStarted       ClaimRequest.createdAt (the "Is this your sale?" form)
 *   claimsVerified      ClaimRequest.emailVerifiedAt
 *   claimsApproved      ClaimRequest.reviewedAt where status = APPROVED
 *   instantClaims       Organizer claimed through the signed-in claim (verificationSource
 *                       email_domain_match / self_attested_unverified). That path stores no
 *                       claim time, so it is bucketed by the claiming account's signup week.
 *   organizerSignups    User rows with the ORGANIZER role, by account creation week
 *   signupsFromOutreach organizerSignups whose email was on the outreach list
 *   firstSalesPublished Organizers whose FIRST in-app sale (sourceName IS NULL) was published
 *                       that week (Sale.publishedAt, set on publish in saleController)
 *
 * Excluded everywhere it applies: deleted users, @system.finda.sale / @example.com accounts,
 * and INTERNAL_EMAILS_CSV (Patrick's own and test accounts), plus scraped (unmanaged) organizers.
 *
 * Also returns a snapshot of claim requests waiting on an admin (verified but not reviewed),
 * because a claim sitting in that queue looks exactly like "no signups" from the outside.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const FUNNEL_STEPS = [
  'outreachSent',
  'newContacts',
  'outreachOpened',
  'outreachClicked',
  'saleClaimEmailsSent',
  'claimsStarted',
  'claimsVerified',
  'claimsApproved',
  'instantClaims',
  'organizerSignups',
  'signupsFromOutreach',
  'firstSalesPublished',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];
export type FunnelWeek = { weekStart: string } & Record<FunnelStep, number>;

export interface SignupFunnel {
  timezone: string;
  generatedAt: string;
  weeks: FunnelWeek[]; // newest first; weekStart is the Monday (YYYY-MM-DD, Detroit time)
  claimQueue: { awaitingReview: number; oldestWaitingSince: string | null };
}

const TZ = 'America/Detroit';

function internalEmails(): string[] {
  return (process.env.INTERNAL_EMAILS_CSV || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** YYYY-MM-DD of the Monday that starts the Detroit-time week containing `d`. */
export function detroitWeekStart(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  const local = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
  local.setUTCDate(local.getUTCDate() - Math.max(dow, 0));
  return local.toISOString().slice(0, 10);
}

export async function getSignupFunnel(weeksBack = 8): Promise<SignupFunnel> {
  const weeks = Math.min(Math.max(Math.floor(weeksBack) || 8, 1), 52);
  const now = new Date();

  // Week labels, newest first.
  const labels: string[] = [];
  const cursor = new Date(now);
  for (let i = 0; i < weeks; i++) {
    labels.push(detroitWeekStart(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  // Lower bound with a day of slack for the timezone; rows outside the labelled weeks are dropped below.
  const from = new Date(`${labels[labels.length - 1]}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);

  const internal = internalEmails();
  const internalList = internal.length ? Prisma.join(internal) : Prisma.sql`''`;

  // Timestamps are TIMESTAMP(3) holding UTC; convert to Detroit wall time before the Monday truncation.
  const rows = await prisma.$queryRaw<{ step: string; wk: string; n: bigint }[]>(Prisma.sql`
    WITH real_user AS (
      SELECT u."id", u."email", u."createdAt"
      FROM "User" u
      WHERE u."deletedAt" IS NULL
        AND u."email" NOT LIKE '%@system.finda.sale'
        AND u."email" NOT LIKE '%@example.com'
        AND lower(u."email") NOT IN (${internalList})
    ),
    ev AS (
      SELECT 'outreachSent' AS step, "touch1SentAt" AS t FROM "DirectoryClaimEmail" WHERE "touch1SentAt" >= ${from}
      UNION ALL SELECT 'outreachSent', "touch2SentAt" FROM "DirectoryClaimEmail" WHERE "touch2SentAt" >= ${from}
      UNION ALL SELECT 'outreachSent', "touch3SentAt" FROM "DirectoryClaimEmail" WHERE "touch3SentAt" >= ${from}
      UNION ALL SELECT 'outreachSent', "touch4SentAt" FROM "DirectoryClaimEmail" WHERE "touch4SentAt" >= ${from}
      UNION ALL SELECT 'newContacts', "touch1SentAt" FROM "DirectoryClaimEmail" WHERE "touch1SentAt" >= ${from}
      UNION ALL SELECT 'outreachOpened', "touch1OpenedAt" FROM "DirectoryClaimEmail" WHERE "touch1OpenedAt" >= ${from}
      UNION ALL SELECT 'outreachOpened', "touch2OpenedAt" FROM "DirectoryClaimEmail" WHERE "touch2OpenedAt" >= ${from}
      UNION ALL SELECT 'outreachOpened', "touch3OpenedAt" FROM "DirectoryClaimEmail" WHERE "touch3OpenedAt" >= ${from}
      UNION ALL SELECT 'outreachOpened', "touch4OpenedAt" FROM "DirectoryClaimEmail" WHERE "touch4OpenedAt" >= ${from}
      UNION ALL SELECT 'outreachClicked', "touch1ClickedAt" FROM "DirectoryClaimEmail" WHERE "touch1ClickedAt" >= ${from}
      UNION ALL SELECT 'outreachClicked', "touch2ClickedAt" FROM "DirectoryClaimEmail" WHERE "touch2ClickedAt" >= ${from}
      UNION ALL SELECT 'outreachClicked', "touch3ClickedAt" FROM "DirectoryClaimEmail" WHERE "touch3ClickedAt" >= ${from}
      UNION ALL SELECT 'outreachClicked', "touch4ClickedAt" FROM "DirectoryClaimEmail" WHERE "touch4ClickedAt" >= ${from}
      UNION ALL SELECT 'saleClaimEmailsSent', "sentAt" FROM "ClaimEmail" WHERE "sentAt" >= ${from}
      UNION ALL SELECT 'claimsStarted', "createdAt" FROM "ClaimRequest" WHERE "createdAt" >= ${from}
      UNION ALL SELECT 'claimsVerified', "emailVerifiedAt" FROM "ClaimRequest" WHERE "emailVerifiedAt" >= ${from}
      UNION ALL SELECT 'claimsApproved', "reviewedAt" FROM "ClaimRequest" WHERE "status" = 'APPROVED' AND "reviewedAt" >= ${from}
      UNION ALL
        SELECT 'instantClaims', ru."createdAt"
        FROM "Organizer" o JOIN real_user ru ON ru."id" = o."userId"
        WHERE o."verificationSource" IN ('email_domain_match', 'self_attested_unverified')
          AND ru."createdAt" >= ${from}
      UNION ALL
        SELECT 'organizerSignups', ru."createdAt"
        FROM real_user ru JOIN "User" u ON u."id" = ru."id"
        WHERE 'ORGANIZER' = ANY(u."roles") AND ru."createdAt" >= ${from}
      UNION ALL
        SELECT 'signupsFromOutreach', ru."createdAt"
        FROM real_user ru JOIN "User" u ON u."id" = ru."id"
        WHERE 'ORGANIZER' = ANY(u."roles") AND ru."createdAt" >= ${from}
          AND EXISTS (SELECT 1 FROM "DirectoryClaimEmail" d WHERE lower(d."emailAddress") = lower(ru."email"))
      UNION ALL
        SELECT 'firstSalesPublished', f.first_pub
        FROM (
          SELECT s."organizerId", MIN(s."publishedAt") AS first_pub
          FROM "Sale" s
          WHERE s."sourceName" IS NULL AND s."deletedAt" IS NULL AND s."publishedAt" IS NOT NULL
          GROUP BY s."organizerId"
        ) f
        JOIN "Organizer" o ON o."id" = f."organizerId"
        JOIN real_user ru ON ru."id" = o."userId"
        WHERE o."isUnmanagedListing" = false AND f.first_pub >= ${from} AND f.first_pub <= ${now}
    )
    SELECT step,
           to_char(date_trunc('week', (t AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS wk,
           count(*) AS n
    FROM ev
    GROUP BY 1, 2
  `);

  const byWeek = new Map<string, FunnelWeek>();
  for (const wk of labels) {
    const row = { weekStart: wk } as FunnelWeek;
    for (const s of FUNNEL_STEPS) row[s] = 0;
    byWeek.set(wk, row);
  }
  for (const r of rows) {
    const row = byWeek.get(r.wk);
    if (row && (FUNNEL_STEPS as readonly string[]).includes(r.step)) row[r.step as FunnelStep] = Number(r.n);
  }

  const [awaitingReview, oldest] = await Promise.all([
    prisma.claimRequest.count({ where: { status: 'PENDING', emailVerifiedAt: { not: null } } }),
    prisma.claimRequest.findFirst({
      where: { status: 'PENDING', emailVerifiedAt: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);

  return {
    timezone: TZ,
    generatedAt: now.toISOString(),
    weeks: labels.map((wk) => byWeek.get(wk)!),
    claimQueue: { awaitingReview, oldestWaitingSince: oldest ? oldest.createdAt.toISOString() : null },
  };
}

/** One line per step for logs and the weekly report, e.g. "[SignupFunnel] week 2026-11-09 outreachSent=120 ...". */
export function formatFunnelWeek(w: FunnelWeek): string {
  return `week ${w.weekStart} ` + FUNNEL_STEPS.map((s) => `${s}=${w[s]}`).join(' ');
}
