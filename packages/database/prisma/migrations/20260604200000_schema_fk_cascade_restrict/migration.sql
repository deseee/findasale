-- Migration: 20260604200000_schema_fk_cascade_restrict
-- Purpose: Add missing onDelete behaviors to FK constraints + missing FK indexes
-- Safety: Constraints dropped and re-added. RESTRICT = safe default. CASCADE only fires on parent deletion.
-- Pre-flight: Orphan cleanup runs first to avoid constraint violation errors.

-- ============================================================
-- ORPHAN CLEANUP
-- ============================================================
DELETE FROM "Bid" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "Bid" WHERE "itemId" NOT IN (SELECT "id" FROM "Item");
DELETE FROM "UserBadge" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "Review" WHERE "saleId" NOT IN (SELECT "id" FROM "Sale");
DELETE FROM "PushSubscription" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "LineEntry" WHERE "saleId" NOT IN (SELECT "id" FROM "Sale");
DELETE FROM "LineEntry" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "PointsTransaction" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "Message" WHERE "conversationId" NOT IN (SELECT "id" FROM "Conversation");
DELETE FROM "Follow" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "Follow" WHERE "organizerId" NOT IN (SELECT "id" FROM "Organizer");
DELETE FROM "ItemReservation" WHERE "itemId" NOT IN (SELECT "id" FROM "Item");
DELETE FROM "ItemReservation" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "MissingListingBounty" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "Webhook" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "FraudSignal" WHERE "saleId" NOT IN (SELECT "id" FROM "Sale");
DELETE FROM "FraudSignal" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "BountySubmission" WHERE "organizerId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "BountySubmission" WHERE "itemId" NOT IN (SELECT "id" FROM "Item");
DELETE FROM "Referral" WHERE "referrerId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "Referral" WHERE "referredUserId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "EncyclopediaVote" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "AppraisalRequest" WHERE "submittedByUserId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "AppraisalResponse" WHERE "responderId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "AppraisalDispute" WHERE "raisedByUserId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "Organizer" WHERE "userId" NOT IN (SELECT "id" FROM "User");

-- Delete Messages in orphaned Conversations before deleting those Conversations
DELETE FROM "Message" WHERE "conversationId" IN (
  SELECT "id" FROM "Conversation" WHERE "organizerId" NOT IN (SELECT "id" FROM "Organizer")
);
-- Delete orphaned Conversations (organizerId → Organizer, required FK)
DELETE FROM "Conversation" WHERE "organizerId" NOT IN (SELECT "id" FROM "Organizer");

-- Delete orphaned UserAchievement rows (achievementId → Achievement, required FK)
DELETE FROM "UserAchievement" WHERE "achievementId" NOT IN (SELECT "id" FROM "Achievement");

-- Optional FK orphan cleanup (SET NULL rather than DELETE — preserve the parent record)
UPDATE "Conversation" SET "saleId" = NULL WHERE "saleId" IS NOT NULL AND "saleId" NOT IN (SELECT "id" FROM "Sale");
UPDATE "Item" SET "saleId" = NULL WHERE "saleId" IS NOT NULL AND "saleId" NOT IN (SELECT "id" FROM "Sale");
UPDATE "Favorite" SET "saleId" = NULL WHERE "saleId" IS NOT NULL AND "saleId" NOT IN (SELECT "id" FROM "Sale");
UPDATE "Favorite" SET "itemId" = NULL WHERE "itemId" IS NOT NULL AND "itemId" NOT IN (SELECT "id" FROM "Item");
UPDATE "Purchase" SET "userId" = NULL WHERE "userId" IS NOT NULL AND "userId" NOT IN (SELECT "id" FROM "User");
UPDATE "Purchase" SET "itemId" = NULL WHERE "itemId" IS NOT NULL AND "itemId" NOT IN (SELECT "id" FROM "Item");
UPDATE "Purchase" SET "saleId" = NULL WHERE "saleId" IS NOT NULL AND "saleId" NOT IN (SELECT "id" FROM "Sale");
UPDATE "Purchase" SET "affiliateLinkId" = NULL WHERE "affiliateLinkId" IS NOT NULL AND "affiliateLinkId" NOT IN (SELECT "id" FROM "AffiliateLink");
UPDATE "SaleSubscriber" SET "userId" = NULL WHERE "userId" IS NOT NULL AND "userId" NOT IN (SELECT "id" FROM "User");
UPDATE "Review" SET "organizerId" = NULL WHERE "organizerId" IS NOT NULL AND "organizerId" NOT IN (SELECT "id" FROM "Organizer");
UPDATE "FraudSignal" SET "reviewedByAdminId" = NULL WHERE "reviewedByAdminId" IS NOT NULL AND "reviewedByAdminId" NOT IN (SELECT "id" FROM "User");
UPDATE "SaleRipple" SET "userId" = NULL WHERE "userId" IS NOT NULL AND "userId" NOT IN (SELECT "id" FROM "User");

-- ============================================================
-- BLOCK 1: Organizer
-- ============================================================
ALTER TABLE "Organizer" DROP CONSTRAINT IF EXISTS "Organizer_userId_fkey";
ALTER TABLE "Organizer" ADD CONSTRAINT "Organizer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 2: Sale
-- ============================================================
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_organizerId_fkey";
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 3: Item
-- ============================================================
ALTER TABLE "Item" DROP CONSTRAINT IF EXISTS "Item_saleId_fkey";
ALTER TABLE "Item" ADD CONSTRAINT "Item_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 4: Bid
-- ============================================================
ALTER TABLE "Bid" DROP CONSTRAINT IF EXISTS "Bid_userId_fkey";
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bid" DROP CONSTRAINT IF EXISTS "Bid_itemId_fkey";
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 5: Purchase (financial — SET NULL or RESTRICT, never CASCADE)
-- ============================================================
ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_userId_fkey";
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_itemId_fkey";
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_saleId_fkey";
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_affiliateLinkId_fkey";
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_affiliateLinkId_fkey"
  FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 6: Favorite
-- ============================================================
ALTER TABLE "Favorite" DROP CONSTRAINT IF EXISTS "Favorite_saleId_fkey";
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Favorite" DROP CONSTRAINT IF EXISTS "Favorite_itemId_fkey";
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 7: SaleSubscriber
-- ============================================================
ALTER TABLE "SaleSubscriber" DROP CONSTRAINT IF EXISTS "SaleSubscriber_userId_fkey";
ALTER TABLE "SaleSubscriber" ADD CONSTRAINT "SaleSubscriber_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleSubscriber" DROP CONSTRAINT IF EXISTS "SaleSubscriber_saleId_fkey";
ALTER TABLE "SaleSubscriber" ADD CONSTRAINT "SaleSubscriber_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 8: UserBadge
-- ============================================================
ALTER TABLE "UserBadge" DROP CONSTRAINT IF EXISTS "UserBadge_userId_fkey";
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBadge" DROP CONSTRAINT IF EXISTS "UserBadge_badgeId_fkey";
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey"
  FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 9: Review
-- ============================================================
-- Note: Review.userId will be made nullable in migration 20260604300000 — SET NULL applied there
-- For now userId remains required so we use CASCADE to avoid FK violation on user deletion
ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_userId_fkey";
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_saleId_fkey";
ALTER TABLE "Review" ADD CONSTRAINT "Review_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_organizerId_fkey";
ALTER TABLE "Review" ADD CONSTRAINT "Review_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 10: AffiliateLink (financial — RESTRICT)
-- ============================================================
ALTER TABLE "AffiliateLink" DROP CONSTRAINT IF EXISTS "AffiliateLink_userId_fkey";
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AffiliateLink" DROP CONSTRAINT IF EXISTS "AffiliateLink_saleId_fkey";
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 11: PushSubscription
-- ============================================================
ALTER TABLE "PushSubscription" DROP CONSTRAINT IF EXISTS "PushSubscription_userId_fkey";
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 12: LineEntry
-- ============================================================
ALTER TABLE "LineEntry" DROP CONSTRAINT IF EXISTS "LineEntry_saleId_fkey";
ALTER TABLE "LineEntry" ADD CONSTRAINT "LineEntry_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LineEntry" DROP CONSTRAINT IF EXISTS "LineEntry_userId_fkey";
ALTER TABLE "LineEntry" ADD CONSTRAINT "LineEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 13: PointsTransaction
-- ============================================================
ALTER TABLE "PointsTransaction" DROP CONSTRAINT IF EXISTS "PointsTransaction_userId_fkey";
ALTER TABLE "PointsTransaction" ADD CONSTRAINT "PointsTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 14: Conversation
-- ============================================================
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_saleId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_organizerId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 15: Message
-- ============================================================
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_conversationId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Note: Message.senderId will be made nullable in migration 20260604300000
-- For now use CASCADE to avoid FK violation on user deletion
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_senderId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 16: Follow
-- ============================================================
ALTER TABLE "Follow" DROP CONSTRAINT IF EXISTS "Follow_userId_fkey";
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Follow" DROP CONSTRAINT IF EXISTS "Follow_organizerId_fkey";
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 17: ItemReservation
-- ============================================================
ALTER TABLE "ItemReservation" DROP CONSTRAINT IF EXISTS "ItemReservation_itemId_fkey";
ALTER TABLE "ItemReservation" ADD CONSTRAINT "ItemReservation_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemReservation" DROP CONSTRAINT IF EXISTS "ItemReservation_userId_fkey";
ALTER TABLE "ItemReservation" ADD CONSTRAINT "ItemReservation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 18: MissingListingBounty
-- ============================================================
ALTER TABLE "MissingListingBounty" DROP CONSTRAINT IF EXISTS "MissingListingBounty_userId_fkey";
ALTER TABLE "MissingListingBounty" ADD CONSTRAINT "MissingListingBounty_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 19: Webhook
-- ============================================================
ALTER TABLE "Webhook" DROP CONSTRAINT IF EXISTS "Webhook_userId_fkey";
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 20: UserAchievement
-- ============================================================
ALTER TABLE "UserAchievement" DROP CONSTRAINT IF EXISTS "UserAchievement_achievementId_fkey";
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey"
  FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 21: FraudSignal
-- ============================================================
ALTER TABLE "FraudSignal" DROP CONSTRAINT IF EXISTS "FraudSignal_userId_fkey";
ALTER TABLE "FraudSignal" ADD CONSTRAINT "FraudSignal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FraudSignal" DROP CONSTRAINT IF EXISTS "FraudSignal_saleId_fkey";
ALTER TABLE "FraudSignal" ADD CONSTRAINT "FraudSignal_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FraudSignal" DROP CONSTRAINT IF EXISTS "FraudSignal_reviewedByAdminId_fkey";
ALTER TABLE "FraudSignal" ADD CONSTRAINT "FraudSignal_reviewedByAdminId_fkey"
  FOREIGN KEY ("reviewedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 22: BountySubmission
-- ============================================================
ALTER TABLE "BountySubmission" DROP CONSTRAINT IF EXISTS "BountySubmission_organizerId_fkey";
ALTER TABLE "BountySubmission" ADD CONSTRAINT "BountySubmission_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BountySubmission" DROP CONSTRAINT IF EXISTS "BountySubmission_itemId_fkey";
ALTER TABLE "BountySubmission" ADD CONSTRAINT "BountySubmission_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 23: Referral
-- ============================================================
ALTER TABLE "Referral" DROP CONSTRAINT IF EXISTS "Referral_referrerId_fkey";
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey"
  FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Referral" DROP CONSTRAINT IF EXISTS "Referral_referredUserId_fkey";
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey"
  FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 24: Dispute (financial/legal — RESTRICT)
-- ============================================================
ALTER TABLE "Dispute" DROP CONSTRAINT IF EXISTS "Dispute_buyerId_fkey";
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Dispute" DROP CONSTRAINT IF EXISTS "Dispute_sellerId_fkey";
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 25: SaleRipple
-- ============================================================
ALTER TABLE "SaleRipple" DROP CONSTRAINT IF EXISTS "SaleRipple_userId_fkey";
ALTER TABLE "SaleRipple" ADD CONSTRAINT "SaleRipple_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 26: CrewInvasionCode
-- ============================================================
ALTER TABLE "CrewInvasionCode" DROP CONSTRAINT IF EXISTS "CrewInvasionCode_saleId_fkey";
ALTER TABLE "CrewInvasionCode" ADD CONSTRAINT "CrewInvasionCode_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 27: Encyclopedia
-- ============================================================
-- Note: authorId fields will be made nullable in migration 20260604300000
ALTER TABLE "EncyclopediaEntry" DROP CONSTRAINT IF EXISTS "EncyclopediaEntry_authorId_fkey";
ALTER TABLE "EncyclopediaEntry" ADD CONSTRAINT "EncyclopediaEntry_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EncyclopediaRevision" DROP CONSTRAINT IF EXISTS "EncyclopediaRevision_authorId_fkey";
ALTER TABLE "EncyclopediaRevision" ADD CONSTRAINT "EncyclopediaRevision_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EncyclopediaVote" DROP CONSTRAINT IF EXISTS "EncyclopediaVote_userId_fkey";
ALTER TABLE "EncyclopediaVote" ADD CONSTRAINT "EncyclopediaVote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 28: Appraisal
-- ============================================================
ALTER TABLE "AppraisalRequest" DROP CONSTRAINT IF EXISTS "AppraisalRequest_submittedByUserId_fkey";
ALTER TABLE "AppraisalRequest" ADD CONSTRAINT "AppraisalRequest_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppraisalResponse" DROP CONSTRAINT IF EXISTS "AppraisalResponse_responderId_fkey";
ALTER TABLE "AppraisalResponse" ADD CONSTRAINT "AppraisalResponse_responderId_fkey"
  FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppraisalAIRequest" DROP CONSTRAINT IF EXISTS "AppraisalAIRequest_userId_fkey";
ALTER TABLE "AppraisalAIRequest" ADD CONSTRAINT "AppraisalAIRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AppraisalDispute" DROP CONSTRAINT IF EXISTS "AppraisalDispute_raisedByUserId_fkey";
ALTER TABLE "AppraisalDispute" ADD CONSTRAINT "AppraisalDispute_raisedByUserId_fkey"
  FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- BLOCK 29: SaleHub
-- ============================================================
ALTER TABLE "SaleHub" DROP CONSTRAINT IF EXISTS "SaleHub_organizerId_fkey";
ALTER TABLE "SaleHub" ADD CONSTRAINT "SaleHub_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- INDEXES: FK fields missing indexes
-- ============================================================
-- High priority
CREATE INDEX IF NOT EXISTS "Bid_userId_idx" ON "Bid"("userId");
CREATE INDEX IF NOT EXISTS "Bid_itemId_idx" ON "Bid"("itemId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX IF NOT EXISTS "Purchase_userId_idx" ON "Purchase"("userId");
CREATE INDEX IF NOT EXISTS "Purchase_itemId_idx" ON "Purchase"("itemId");
CREATE INDEX IF NOT EXISTS "Purchase_saleId_idx" ON "Purchase"("saleId");
CREATE INDEX IF NOT EXISTS "Purchase_affiliateLinkId_idx" ON "Purchase"("affiliateLinkId");
CREATE INDEX IF NOT EXISTS "SaleTransaction_itemId_idx" ON "SaleTransaction"("itemId");
CREATE INDEX IF NOT EXISTS "PointsTransaction_saleId_idx" ON "PointsTransaction"("saleId");
CREATE INDEX IF NOT EXISTS "PointsTransaction_itemId_idx" ON "PointsTransaction"("itemId");

-- Normal priority
CREATE INDEX IF NOT EXISTS "SaleRipple_saleId_idx" ON "SaleRipple"("saleId");
CREATE INDEX IF NOT EXISTS "SaleRipple_userId_idx" ON "SaleRipple"("userId");
CREATE INDEX IF NOT EXISTS "BountySubmission_itemId_idx" ON "BountySubmission"("itemId");
CREATE INDEX IF NOT EXISTS "BuyingPool_itemId_idx" ON "BuyingPool"("itemId");
CREATE INDEX IF NOT EXISTS "BuyingPool_creatorId_idx" ON "BuyingPool"("creatorId");
CREATE INDEX IF NOT EXISTS "Crew_founderUserId_idx" ON "Crew"("founderUserId");
CREATE INDEX IF NOT EXISTS "Dispute_saleId_idx" ON "Dispute"("saleId");
CREATE INDEX IF NOT EXISTS "Dispute_itemId_idx" ON "Dispute"("itemId");
CREATE INDEX IF NOT EXISTS "FlashDeal_itemId_idx" ON "FlashDeal"("itemId");
CREATE INDEX IF NOT EXISTS "FlashDeal_saleId_idx" ON "FlashDeal"("saleId");
CREATE INDEX IF NOT EXISTS "FraudSignal_reviewedByAdminId_idx" ON "FraudSignal"("reviewedByAdminId");
CREATE INDEX IF NOT EXISTS "Item_saleId_idx" ON "Item"("saleId");
CREATE INDEX IF NOT EXISTS "ItemBundle_saleId_idx" ON "ItemBundle"("saleId");
CREATE INDEX IF NOT EXISTS "MissingListingBounty_itemId_idx" ON "MissingListingBounty"("itemId");
CREATE INDEX IF NOT EXISTS "MissingListingBounty_crewId_idx" ON "MissingListingBounty"("crewId");
CREATE INDEX IF NOT EXISTS "PickupSlot_saleId_idx" ON "PickupSlot"("saleId");
CREATE INDEX IF NOT EXISTS "ReferralFraudSignal_referralRewardId_idx" ON "ReferralFraudSignal"("referralRewardId");
CREATE INDEX IF NOT EXISTS "ReturnRequest_purchaseId_idx" ON "ReturnRequest"("purchaseId");
CREATE INDEX IF NOT EXISTS "SavedSearch_userId_idx" ON "SavedSearch"("userId");
CREATE INDEX IF NOT EXISTS "Webhook_userId_idx" ON "Webhook"("userId");
CREATE INDEX IF NOT EXISTS "Wishlist_userId_idx" ON "Wishlist"("userId");
CREATE INDEX IF NOT EXISTS "WishlistAlert_userId_idx" ON "WishlistAlert"("userId");
CREATE INDEX IF NOT EXISTS "ConsignorSettlementBatch_workspaceId_idx" ON "ConsignorSettlementBatch"("workspaceId");
CREATE INDEX IF NOT EXISTS "CheckoutAttempt_userId_idx" ON "CheckoutAttempt"("userId");
CREATE INDEX IF NOT EXISTS "UnsubscribeToken_userId_idx" ON "UnsubscribeToken"("userId");
