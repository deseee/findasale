-- ADR-131 (2026-09-20): Facebook Marketplace sold-detection via order-confirmation email --
-- vendor-agnostic per-organizer forwarding-alias routing token.
--
-- WHY: to detect a Facebook Marketplace sale from Facebook's own order-confirmation email
-- for more than one organizer (not just Patrick's own inbox), each organizer needs a unique
-- address to forward/filter Facebook's order emails to (e.g. "sold-<token>@mail.finda.sale"),
-- following the industry-standard "per-user forwarding alias" pattern (Zapier Email Parser,
-- Veryfi, TripIt -- cited in ADR-131 section 2.4). This column is the routing token embedded
-- in that address's local-part. See services/organizerEmailForwardingService.ts (token
-- generation + address building + reverse lookup) and
-- services/facebookMarketplaceEmailSoldDetection.ts (vendor-agnostic parsing/matching core
-- that consumes the resolved itemId once a real inbound-mail vendor is chosen and its
-- webhook adapter is built -- explicitly NOT part of this change).
--
-- NOT a secret/credential: unlike SocialAccount.accessToken / EbayConnection.refreshToken /
-- MarketplacePosterAccount.sessionCookie (all encrypted at rest via tokenCrypto.ts's
-- AES-256-GCM envelope), this token is functionally public the moment an organizer sets up
-- their forward rule -- it's designed to appear in a plaintext email address. It follows
-- Organizer.customStorefrontSlug's existing precedent instead: a plain, nullable, unique,
-- public-facing identifier column directly on Organizer.
--
-- SAFETY: purely additive. One nullable column, no default, no backfill -- every existing
-- Organizer row reads this as NULL ("no forwarding token issued yet") until
-- ensureFacebookSoldEmailToken() populates it for an organizer that opts in. No table
-- rewrite risk on PostgreSQL (nullable column with no default is metadata-only). No other
-- column touched, no data moved.
--
-- NOT APPLIED: hand-authored to match schema.prisma exactly, per this project's standing
-- convention when `prisma migrate dev` isn't run against this environment (see e.g.
-- 20260909170000_square_payment_link_columns's own header). This migration file has been
-- created and reviewed but NOT run against any database, local or production -- applying it
-- (prisma migrate deploy against Railway) is a separate, explicitly-authorized deploy step.
--
-- ROLLBACK: ALTER TABLE "Organizer" DROP COLUMN "facebookSoldEmailToken";

-- AlterTable
ALTER TABLE "Organizer" ADD COLUMN     "facebookSoldEmailToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organizer_facebookSoldEmailToken_key" ON "Organizer"("facebookSoldEmailToken");
