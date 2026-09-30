import { prisma } from '../lib/prisma';
import { sanitizeText } from '../lib/sanitize';
import { filterQualifiedHolders } from './crewQualification'; // same account-qualification rule Crew Invasion XP uses (anti-farm for the check-in bonus)

/**
 * Crew XP Multiplier — Check if user's crew has visited a sale together today
 * Returns 1.25x multiplier if:
 *   - User is in a crew with 3+ total members
 *   - 2+ OTHER crew members (besides user) checked in to the same sale today
 *   - ANTI-FARM (2026-09-29): the user AND those two other members are all QUALIFIED accounts,
 *     the same rule Crew Invasion XP uses (isQualifiedInvasionMember): account at least 7 days
 *     old, not fraudSuspect, not the sale's own organizer, and at least one prior non-refunded
 *     paid purchase or a check-in at a DIFFERENT sale. Without it, three throwaway accounts in
 *     one crew could check in to the same sale every day and multiply each other's visit XP
 *     (visit XP is spendable). A crew of real, established shoppers is unaffected. A member who
 *     checked in twice counts once (distinct users).
 * Otherwise returns 1.0x (no bonus)
 *
 * Used when awarding XP for visits, purchases, etc. during crew-based activities
 */
export async function checkCrewVisitBonus(
  userId: string,
  saleId: string
): Promise<number> {
  try {
    // Get user's crew membership(s)
    const crewMemberships = await prisma.crewMember.findMany({
      where: { userId },
      select: { crewId: true },
    });

    if (crewMemberships.length === 0) {
      return 1.0; // User not in any crew
    }

    // The user must qualify too: a brand-new or throwaway account never earns the bonus.
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizer: { select: { userId: true } } },
    });
    const organizerUserId: string | null = sale?.organizer?.userId ?? null;
    const now = new Date();
    const selfQualified = await filterQualifiedHolders([userId], saleId, organizerUserId, now);
    if (!selfQualified.has(userId)) {
      return 1.0;
    }

    for (const membership of crewMemberships) {
      // Get all members in this crew
      const crewMembers = await prisma.crewMember.findMany({
        where: { crewId: membership.crewId },
        select: { userId: true },
      });

      // Need at least 3 members total (user + 2 others)
      if (crewMembers.length < 3) {
        continue;
      }

      // Get other crew members' user IDs (exclude self)
      const otherMemberIds = crewMembers
        .map(m => m.userId)
        .filter(id => id !== userId);

      if (otherMemberIds.length < 2) {
        continue;
      }

      // Which other crew members already checked in to this sale today
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const otherVisits = await prisma.pointsTransaction.findMany({
        where: {
          userId: {
            in: otherMemberIds,
          },
          type: 'SALE_CHECKIN',
          saleId,
          createdAt: {
            gte: today,
          },
        },
        select: { userId: true },
      });
      const visitorIds = Array.from(new Set(otherVisits.map((v: { userId: string }) => v.userId)));
      if (visitorIds.length < 2) {
        continue;
      }

      // Only qualified visitors count toward the two.
      const qualifiedVisitors = await filterQualifiedHolders(visitorIds, saleId, organizerUserId, now);
      if (qualifiedVisitors.size >= 2) {
        return 1.25;
      }
    }

    return 1.0; // No crew bonus applies
  } catch (error) {
    console.error('[crewService] Error checking crew visit bonus:', error);
    return 1.0; // Fail safe: no bonus on error
  }
}

// ---------------------------------------------------------------------------
// Shopper Crews: shared rules and input validation (S1100+, 2026-09-29)
// One place for the numbers so the controller, the UI copy and the guide agree.
// ---------------------------------------------------------------------------

/** Hard cap on members in one crew (matches the ADR and the guild primer). */
export const MAX_CREW_MEMBERS = 50;
/** Max crews one account can belong to at once (created or joined). Anti-spam. */
export const MAX_CREWS_PER_USER = 3;
export const CREW_NAME_MIN = 3;
export const CREW_NAME_MAX = 30;
export const CREW_DESCRIPTION_MAX = 500;

export type CrewInputResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };

// Whole-word (token) matches only, so ordinary words are never caught by substring
// accident. Impersonation terms stop a crew from posing as FindA.Sale staff.
const BLOCKED_TOKENS = new Set<string>([
  'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'cunt', 'asshole', 'pussy',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'whore', 'slut', 'rape', 'rapist',
  'nazi', 'hitler', 'kkk',
]);
const IMPERSONATION_TOKENS = new Set<string>([
  'admin', 'administrator', 'moderator', 'official', 'staff', 'support', 'findasale',
]);

function normalizeForTerms(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a');
}

function tokensOf(text: string): string[] {
  return normalizeForTerms(text).split(/[^a-z]+/).filter(Boolean);
}

/** True when the text contains a blocked word as a whole word (plural "s" tolerated). */
export function containsBlockedTerm(text: string): boolean {
  return tokensOf(text).some((t) => {
    const base = t.endsWith('s') ? t.slice(0, -1) : t;
    return BLOCKED_TOKENS.has(t) || BLOCKED_TOKENS.has(base);
  });
}

/** True when a crew name tries to look like FindA.Sale staff or the brand itself. */
export function looksLikeImpersonation(name: string): boolean {
  const squashed = normalizeForTerms(name).replace(/[^a-z]+/g, '');
  if (squashed.includes('findasale')) return true;
  return tokensOf(name).some((t) => IMPERSONATION_TOKENS.has(t));
}

/** URL-safe slug. Accents are stripped, apostrophes and periods dropped, "&" becomes "and". */
export function slugifyCrewName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

const CREW_NAME_PATTERN = /^[A-Za-z0-9À-ɏ][A-Za-z0-9À-ɏ '&.\-]*$/;

/**
 * Validate and normalize a crew name: trimmed, single spaces, 3-30 characters, letters,
 * numbers, spaces and - ' & . only, no blocked terms, no staff impersonation.
 */
export function validateCrewName(raw: unknown): CrewInputResult<{ name: string; slug: string }> {
  if (typeof raw !== 'string') {
    return { ok: false, code: 'INVALID_NAME', message: 'Crew name is required.' };
  }
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < CREW_NAME_MIN || name.length > CREW_NAME_MAX) {
    return {
      ok: false,
      code: 'INVALID_NAME',
      message: `Crew name must be ${CREW_NAME_MIN} to ${CREW_NAME_MAX} characters.`,
    };
  }
  if (!CREW_NAME_PATTERN.test(name)) {
    return {
      ok: false,
      code: 'INVALID_NAME',
      message: "Crew names can use letters, numbers, spaces and these characters: - ' & .",
    };
  }
  if (containsBlockedTerm(name)) {
    return { ok: false, code: 'BLOCKED_NAME', message: 'That crew name is not allowed. Please pick a different one.' };
  }
  if (looksLikeImpersonation(name)) {
    return {
      ok: false,
      code: 'BLOCKED_NAME',
      message: 'Crew names cannot imply they are run by FindA.Sale staff. Please pick a different one.',
    };
  }
  const slug = slugifyCrewName(name);
  if (slug.length < CREW_NAME_MIN) {
    return {
      ok: false,
      code: 'INVALID_NAME',
      message: `Crew name must include at least ${CREW_NAME_MIN} letters or numbers.`,
    };
  }
  return { ok: true, value: { name, slug } };
}

/** Optional description: trimmed, HTML stripped, up to 500 characters, no blocked terms. */
export function validateCrewDescription(raw: unknown): CrewInputResult<string | null> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') {
    return { ok: false, code: 'INVALID_DESCRIPTION', message: 'Description must be text.' };
  }
  const cleaned = sanitizeText(raw).replace(/\s+/g, ' ').trim();
  if (cleaned.length > CREW_DESCRIPTION_MAX) {
    return {
      ok: false,
      code: 'INVALID_DESCRIPTION',
      message: `Description must not exceed ${CREW_DESCRIPTION_MAX} characters.`,
    };
  }
  if (containsBlockedTerm(cleaned)) {
    return { ok: false, code: 'BLOCKED_DESCRIPTION', message: 'That description is not allowed. Please reword it.' };
  }
  return { ok: true, value: cleaned.length ? cleaned : null };
}

// ---------------------------------------------------------------------------
// Account deletion hand-off (2026-09-29)
// ---------------------------------------------------------------------------

/**
 * Run INSIDE the same transaction as `user.delete`, immediately before it.
 *
 * Why: Crew.founderUserId and CrewMember.userId both cascade on user delete (schema is frozen),
 * so deleting a founder's account silently disbands their crew and removes every member. And a
 * plain member's deletion removes their CrewMember row without decrementing Crew.memberCount.
 *
 * What it does (no schema change):
 *   - For every crew the user founded that still has other members: the longest-standing other
 *     member becomes founder (role FOUNDER + Crew.founderUserId), exactly as transferFounder does.
 *     A crew where the user is the only member is left alone; it cascades away harmlessly.
 *   - For every crew the user belongs to that survives (i.e. has other members): memberCount is
 *     decremented by one to account for the membership row that is about to cascade.
 *
 * `db` must be a transaction client (or prisma). Returns counts for logging.
 */
export async function handOffCrewsBeforeUserDeletion(
  userId: string,
  db: any = prisma
): Promise<{ transferred: number; decremented: number }> {
  let transferred = 0;
  let decremented = 0;

  const memberships: Array<{ crewId: string; role: string }> = await db.crewMember.findMany({
    where: { userId },
    select: { crewId: true, role: true },
  });
  if (memberships.length === 0) {
    // A founder always has a FOUNDER membership row; still check the crew row directly.
    const orphanFounded: Array<{ id: string }> = await db.crew.findMany({
      where: { founderUserId: userId },
      select: { id: true },
    });
    if (orphanFounded.length === 0) return { transferred, decremented };
  }

  const founded: Array<{ id: string }> = await db.crew.findMany({
    where: { founderUserId: userId },
    select: { id: true },
  });
  const foundedIds = new Set<string>(founded.map((c) => c.id));
  const crewIds = new Set<string>(memberships.map((m) => m.crewId));
  foundedIds.forEach((id) => crewIds.add(id));

  for (const crewId of Array.from(crewIds)) {
    const successor: { id: string; userId: string } | null = await db.crewMember.findFirst({
      where: { crewId, userId: { not: userId } },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, userId: true },
    });
    if (!successor) continue; // sole member: the crew cascades away with the account

    if (foundedIds.has(crewId)) {
      await db.crewMember.update({ where: { id: successor.id }, data: { role: 'FOUNDER' } });
      await db.crew.update({ where: { id: crewId }, data: { founderUserId: successor.userId } });
      transferred += 1;
    }
    await db.crew.updateMany({
      where: { id: crewId, memberCount: { gt: 1 } },
      data: { memberCount: { decrement: 1 } },
    });
    decremented += 1;
  }

  return { transferred, decremented };
}
