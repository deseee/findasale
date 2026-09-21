/**
 * organizerEmailForwardingService.ts — per-organizer inbound-email routing tokens
 * (ADR-131, section 2.4's "forwarding-alias" generalization path).
 *
 * WHY: to detect a Facebook Marketplace sale via Facebook's own order-confirmation
 * email for MORE than one organizer (Patrick's own inbox only, IMAP, was the original
 * Phase-0 scope -- superseded per Patrick's 2026-09-20 direction that this needs to work
 * for other organizers too), each organizer needs a unique address to forward/filter
 * Facebook's order emails to (e.g. Zapier's Email Parser / Veryfi's per-user @-address
 * pattern, cited in ADR-131 §2.4). This module owns generating and resolving that
 * per-organizer routing token. It is deliberately NOT tied to any inbound-mail vendor --
 * no SendGrid/Mailgun/Postmark payload shape is assumed anywhere here. Whichever vendor
 * Patrick eventually picks, its webhook adapter is expected to parse the recipient
 * address it received, pull out the token (the part after "sold-" and before "@"), and
 * call resolveOrganizerIdByForwardingToken(token) to find the owning organizer -- that
 * adapter is explicit follow-up work, not built here.
 *
 * NOT a secret: unlike an OAuth token or session cookie (SocialAccount, EbayConnection,
 * MarketplacePosterAccount.sessionCookie -- all encrypted at rest via tokenCrypto.ts),
 * this token is functionally PUBLIC the moment an organizer sets up their forward/filter
 * rule -- it's designed to appear in a plaintext email address. It is a routing
 * identifier, not a credential, so it is stored as a plain unique column on Organizer
 * (Organizer.facebookSoldEmailToken), the same way Organizer.customStorefrontSlug is a
 * plain unique public-facing identifier -- not through tokenCrypto's AES-256-GCM
 * envelope, which is reserved for values that grant access to something if leaked.
 *
 * Token generation follows the exact pattern already established by
 * services/referralService.ts's generateReferralCode: crypto.randomBytes + a
 * findUnique-then-retry-on-collision loop, reusing the codebase's own precedent for
 * "generate a random, unique, per-record public token" rather than inventing a new
 * generation scheme. Uses base64url (URL-safe, no padding) instead of referralCode's
 * uppercase-hex, since this token is embedded directly in an email address local-part
 * (`sold-<token>@mail.finda.sale`) and benefits from more entropy per character.
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';

// 18 random bytes -> 24 base64url characters -- short enough to stay a reasonable
// email local-part, long enough (144 bits) that guessing another organizer's address
// is not a practical concern even though the token is not itself secret.
const TOKEN_BYTES = 18;

const FORWARDING_DOMAIN = process.env.FACEBOOK_SOLD_EMAIL_DOMAIN || 'mail.finda.sale';

function generateRawToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Returns organizerId's existing Facebook-sold-email forwarding token, generating and
 * persisting a new cryptographically-random one (with collision-retry, matching
 * referralService.generateReferralCode's pattern) if it doesn't have one yet.
 */
export async function ensureFacebookSoldEmailToken(organizerId: string): Promise<string> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { facebookSoldEmailToken: true },
  });

  if (!organizer) {
    throw new Error(`Organizer ${organizerId} not found`);
  }

  if (organizer.facebookSoldEmailToken) {
    return organizer.facebookSoldEmailToken;
  }

  const token = generateRawToken();

  // mode: 'insensitive' here matches resolveOrganizerIdByForwardingToken's own
  // case-insensitive lookup below -- without it, two organizers could end up with
  // tokens that differ only by case, which would make that case-insensitive
  // resolution ambiguous (Prisma's findFirst on a non-unique-under-this-comparison
  // condition just returns whichever row it finds first).
  const existing = await prisma.organizer.findFirst({
    where: { facebookSoldEmailToken: { equals: token, mode: 'insensitive' } },
    select: { id: true },
  });

  if (existing) {
    // Collision on a 144-bit random value is astronomically unlikely -- recursive
    // retry is safe and matches generateReferralCode's own handling of this case.
    return ensureFacebookSoldEmailToken(organizerId);
  }

  const updated = await prisma.organizer.update({
    where: { id: organizerId },
    data: { facebookSoldEmailToken: token },
    select: { facebookSoldEmailToken: true },
  });

  return updated.facebookSoldEmailToken!;
}

/** Builds the full forwarding address an organizer would set up a forward/filter rule to. */
export function buildFacebookSoldForwardingAddress(token: string): string {
  return `sold-${token}@${FORWARDING_DOMAIN}`;
}

/**
 * Resolves a forwarding token (as extracted by a future vendor-specific webhook adapter
 * from the recipient address it received) back to the owning organizerId. Returns null
 * for an unknown/invalid token -- callers must fail closed, never guess an organizer.
 */
export async function resolveOrganizerIdByForwardingToken(token: string): Promise<string | null> {
  if (!token) return null;
  // Case-insensitive on purpose: the token travels through an inbound email's raw text
  // (Gmail's own confirmation email, and any organizer's mail client along the way), and
  // nothing guarantees that text preserves the exact case it was generated/issued with.
  // See gmailForwardingAutoConfirmService.test.ts's "extracts the target address
  // case-insensitively" test -- this is the layer that guarantee actually lives at.
  const organizer = await prisma.organizer.findFirst({
    where: { facebookSoldEmailToken: { equals: token, mode: 'insensitive' } },
    select: { id: true },
  });
  return organizer?.id ?? null;
}
