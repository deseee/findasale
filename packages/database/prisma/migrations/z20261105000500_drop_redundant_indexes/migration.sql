-- Drop redundant indexes (2026-11-05, database schema review 2026-11-04 item #8 / #15 partial).
--
-- WHAT: 103 btree indexes that can never be the only usable index for a query, because another btree index on the same
-- table starts with exactly the same column(s): either an identical @unique / @@unique / @@id, or a longer index of which
-- they are a strict leading prefix. Every one of them still costs a write on every INSERT/UPDATE of its table.
-- schema.prisma drops the matching @@index lines in the same commit (no Prisma drift: `prisma migrate diff` from a
-- database built from all migrations to the new schema lists exactly these DROP INDEX statements and no other change
-- for these tables).
--
-- SAFETY: each drop is CONDITIONAL. It only runs when at least one covering index (named in the same line, as it exists
-- in a database built from the migration history) is present and valid. If production drifted and the covering index
-- is missing, the redundant one is kept and a NOTICE is logged. Dropping an index never changes data.
-- Index names: the name each index has in a database built from the migrations, plus Prisma's conventional name
-- when it differs (some were created under an older model name, e.g. StaffMember_* for TeamMember).
-- Consignor_portalToken_idx is not in the migration history (declared in schema.prisma only), so it is simply removed
-- from schema.prisma; the conditional drop below covers production in case it was ever created by hand.
--
-- LOCKING: DROP INDEX takes a brief ACCESS EXCLUSIVE lock on its table; no table scan.
-- PRE-CHECK (optional, production): SELECT indexrelid::regclass, indisvalid FROM pg_index WHERE NOT indisvalid;  -- expect 0 rows
-- ROLLBACK: recreate any index from its original migration (git history) with CREATE INDEX IF NOT EXISTS.

CREATE OR REPLACE FUNCTION pg_temp.drop_if_covered(redundant text[], covering text[]) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  idx text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relname = ANY (covering) AND i.indisvalid
  ) THEN
    FOREACH idx IN ARRAY redundant LOOP
      EXECUTE format('DROP INDEX IF EXISTS %I', idx);
    END LOOP;
  ELSE
    RAISE NOTICE 'kept % (no covering index among %)', redundant, covering;
  END IF;
END
$fn$;



-- AffiliateReferral
SELECT pg_temp.drop_if_covered(ARRAY['AffiliateReferral_referrerId_idx'], ARRAY['AffiliateReferral_referrerId_referredUserId_key']); -- (referrerId)

-- ApiKey
SELECT pg_temp.drop_if_covered(ARRAY['api_keys_keyHash_idx'], ARRAY['api_keys_keyHash_key']); -- (keyHash)

-- ApiUsageLog
SELECT pg_temp.drop_if_covered(ARRAY['ApiUsageLog_service_idx'], ARRAY['ApiUsageLog_service_dateKey_key']); -- (service)

-- AppraisalConsensus
SELECT pg_temp.drop_if_covered(ARRAY['idx_consensus_request', 'AppraisalConsensus_requestId_idx'], ARRAY['AppraisalConsensus_requestId_key']); -- (requestId)

-- AppraisalResponse
SELECT pg_temp.drop_if_covered(ARRAY['idx_response_request', 'AppraisalResponse_requestId_idx'], ARRAY['AppraisalResponse_requestId_responderId_key']); -- (requestId)

-- BoothCartLeg
SELECT pg_temp.drop_if_covered(ARRAY['BoothCartLeg_squarePaymentId_idx'], ARRAY['BoothCartLeg_squarePaymentId_key']); -- (squarePaymentId)
SELECT pg_temp.drop_if_covered(ARRAY['BoothCartLeg_stripePaymentIntentId_idx'], ARRAY['BoothCartLeg_stripePaymentIntentId_key']); -- (stripePaymentIntentId)

-- BrandFollow
SELECT pg_temp.drop_if_covered(ARRAY['BrandFollow_userId_idx'], ARRAY['BrandFollow_userId_brandName_key']); -- (userId)

-- BulkLotRefund
SELECT pg_temp.drop_if_covered(ARRAY['BulkLotRefund_purchaseId_idx'], ARRAY['BulkLotRefund_purchaseId_idempotencyKey_key']); -- (purchaseId)

-- CashierDiscretionGrant
SELECT pg_temp.drop_if_covered(ARRAY['CashierDiscretionGrant_hubId_idx'], ARRAY['CashierDiscretionGrant_hubId_cashierBoothId_key', 'CashierDiscretionGrant_hubId_cashierTeamMemberId_key']); -- (hubId)

-- CategoryDepreciation
SELECT pg_temp.drop_if_covered(ARRAY['CategoryDepreciation_category_idx'], ARRAY['CategoryDepreciation_category_key']); -- (category)

-- ChallengeBadge
SELECT pg_temp.drop_if_covered(ARRAY['ChallengeBadge_userId_idx'], ARRAY['ChallengeBadge_userId_challengeId_key']); -- (userId)

-- ChallengeProgress
SELECT pg_temp.drop_if_covered(ARRAY['ChallengeProgress_userId_challengeId_idx'], ARRAY['ChallengeProgress_userId_challengeId_objectiveId_key']); -- (userId, challengeId)

-- CheckoutEvidence
SELECT pg_temp.drop_if_covered(ARRAY['CheckoutEvidence_purchaseId_idx'], ARRAY['CheckoutEvidence_purchaseId_key']); -- (purchaseId)

-- ClientPayout
SELECT pg_temp.drop_if_covered(ARRAY['ClientPayout_settlementId_idx'], ARRAY['ClientPayout_settlementId_key']); -- (settlementId)

-- CollectorPassport
SELECT pg_temp.drop_if_covered(ARRAY['CollectorPassport_userId_idx'], ARRAY['CollectorPassport_userId_key']); -- (userId)

-- Consignor
SELECT pg_temp.drop_if_covered(ARRAY['Consignor_portalToken_idx'], ARRAY['Consignor_portalToken_key']); -- (portalToken)

-- ConsignorAgreementVersion
SELECT pg_temp.drop_if_covered(ARRAY['ConsignorAgreementVersion_workspaceId_idx'], ARRAY['ConsignorAgreementVersion_workspaceId_version_key']); -- (workspaceId)

-- Coupon
SELECT pg_temp.drop_if_covered(ARRAY['Coupon_code_idx'], ARRAY['Coupon_code_key']); -- (code)

-- CrewInvasionCode
SELECT pg_temp.drop_if_covered(ARRAY['CrewInvasionCode_saleId_idx'], ARRAY['CrewInvasionCode_saleId_crewId_key']); -- (saleId)

-- CrewMember
SELECT pg_temp.drop_if_covered(ARRAY['CrewMember_crewId_idx'], ARRAY['CrewMember_crewId_userId_key']); -- (crewId)

-- CurioScan
SELECT pg_temp.drop_if_covered(ARRAY['CurioScan_convertedToItemId_idx'], ARRAY['CurioScan_convertedToItemId_key']); -- (convertedToItemId)

-- DirectoryClaimEmail
SELECT pg_temp.drop_if_covered(ARRAY['DirectoryClaimEmail_organizerId_idx'], ARRAY['DirectoryClaimEmail_organizerId_sentAt_idx']); -- (organizerId)

-- DiscountRule
SELECT pg_temp.drop_if_covered(ARRAY['DiscountRule_workspaceId_idx'], ARRAY['DiscountRule_workspaceId_tagColor_idx']); -- (workspaceId)

-- EbayConnection
SELECT pg_temp.drop_if_covered(ARRAY['EbayConnection_organizerId_idx'], ARRAY['EbayConnection_organizerId_key']); -- (organizerId)

-- EbayPolicyMapping
SELECT pg_temp.drop_if_covered(ARRAY['EbayPolicyMapping_organizerId_idx'], ARRAY['EbayPolicyMapping_organizerId_key']); -- (organizerId)

-- EncyclopediaVote
SELECT pg_temp.drop_if_covered(ARRAY['EncyclopediaVote_entryId_idx'], ARRAY['EncyclopediaVote_entryId_userId_key']); -- (entryId)

-- FeedbackSuppression
SELECT pg_temp.drop_if_covered(ARRAY['FeedbackSuppression_userId_idx'], ARRAY['FeedbackSuppression_userId_surveyType_key']); -- (userId)

-- FraudSignal
SELECT pg_temp.drop_if_covered(ARRAY['FraudSignal_userId_idx'], ARRAY['FraudSignal_userId_itemId_signalType_key']); -- (userId)

-- HoldInvoice
SELECT pg_temp.drop_if_covered(ARRAY['HoldInvoice_squarePaymentLinkId_idx'], ARRAY['HoldInvoice_squarePaymentLinkId_key']); -- (squarePaymentLinkId)

-- Item
SELECT pg_temp.drop_if_covered(ARRAY['Item_consignorId_idx'], ARRAY['Item_consignorId_status_pickupWindowStartedAt_idx', 'Item_consignorId_status_relistCapFlaggedAt_idx', 'Item_consignorId_status_unclaimedNotifiedAt_idx']); -- (consignorId)
SELECT pg_temp.drop_if_covered(ARRAY['Item_saleId_idx'], ARRAY['Item_saleId_draftStatus_idx', 'Item_saleId_markdownTierApplied_idx', 'Item_saleId_status_idx', 'idx_item_sale_status']); -- (saleId)

-- ItemCompLookup
SELECT pg_temp.drop_if_covered(ARRAY['ItemCompLookup_itemId_idx'], ARRAY['ItemCompLookup_itemId_key']); -- (itemId)

-- ItemTypology
SELECT pg_temp.drop_if_covered(ARRAY['ItemTypology_itemId_idx'], ARRAY['ItemTypology_itemId_key']); -- (itemId)

-- ItemValuation
SELECT pg_temp.drop_if_covered(ARRAY['ItemValuation_itemId_idx'], ARRAY['ItemValuation_itemId_key']); -- (itemId)

-- MarkdownCycle
SELECT pg_temp.drop_if_covered(ARRAY['MarkdownCycle_organizerId_idx'], ARRAY['MarkdownCycle_organizerId_isActive_idx']); -- (organizerId)

-- MarkdownCycleStep
SELECT pg_temp.drop_if_covered(ARRAY['MarkdownCycleStep_cycleId_idx'], ARRAY['MarkdownCycleStep_cycleId_stepOrder_key']); -- (cycleId)

-- MarketplaceAccount
SELECT pg_temp.drop_if_covered(ARRAY['MarketplaceAccount_organizerId_idx'], ARRAY['MarketplaceAccount_organizerId_platform_key']); -- (organizerId)

-- Message
SELECT pg_temp.drop_if_covered(ARRAY['Message_conversationId_idx'], ARRAY['Message_conversationId_createdAt_idx']); -- (conversationId)

-- Organizer
SELECT pg_temp.drop_if_covered(ARRAY['Organizer_contactEmail_idx'], ARRAY['Organizer_contactEmail_isUnmanagedListing_idx']); -- (contactEmail)
SELECT pg_temp.drop_if_covered(ARRAY['Organizer_isClaimed_idx'], ARRAY['Organizer_isClaimed_isUnmanagedListing_idx']); -- (isClaimed)
SELECT pg_temp.drop_if_covered(ARRAY['Organizer_isUnmanagedListing_idx'], ARRAY['Organizer_isUnmanagedListing_createdAt_idx', 'Organizer_isUnmanagedListing_directoryStatus_idx', 'Organizer_isUnmanagedListing_googlePlaceId_idx', 'Organizer_isUnmanagedListing_isStateLicensed_idx', 'Organizer_isUnmanagedListing_websiteEnrichmentExhausted_idx']); -- (isUnmanagedListing)

-- OrganizerReputation
SELECT pg_temp.drop_if_covered(ARRAY['OrganizerReputation_organizerId_idx'], ARRAY['OrganizerReputation_organizerId_key']); -- (organizerId)

-- OutreachAuditLog
SELECT pg_temp.drop_if_covered(ARRAY['OutreachAuditLog_organizerId_idx'], ARRAY['OutreachAuditLog_organizerId_event_idx']); -- (organizerId)

-- POSPaymentLink
SELECT pg_temp.drop_if_covered(ARRAY['POSPaymentLink_squareOrderId_idx'], ARRAY['POSPaymentLink_squareOrderId_key']); -- (squareOrderId)
SELECT pg_temp.drop_if_covered(ARRAY['POSPaymentLink_squarePaymentLinkId_idx'], ARRAY['POSPaymentLink_squarePaymentLinkId_key']); -- (squarePaymentLinkId)

-- POSPaymentRequest
SELECT pg_temp.drop_if_covered(ARRAY['POSPaymentRequest_stripePaymentIntentId_idx'], ARRAY['POSPaymentRequest_stripePaymentIntentId_key']); -- (stripePaymentIntentId)

-- PlatformMetrics
SELECT pg_temp.drop_if_covered(ARRAY['idx_platformMetrics_monthYear', 'PlatformMetrics_monthYear_idx'], ARRAY['PlatformMetrics_monthYear_key']); -- (monthYear)

-- PrepTask
SELECT pg_temp.drop_if_covered(ARRAY['PrepTask_saleId_idx'], ARRAY['PrepTask_saleId_done_idx']); -- (saleId)

-- PricingComp
SELECT pg_temp.drop_if_covered(ARRAY['PricingComp_sourceId_idx'], ARRAY['PricingComp_sourceId_externalListingId_key']); -- (sourceId)

-- PricingSourceConfig
SELECT pg_temp.drop_if_covered(ARRAY['PricingSourceConfig_sourceId_idx'], ARRAY['PricingSourceConfig_sourceId_key']); -- (sourceId)

-- Purchase
SELECT pg_temp.drop_if_covered(ARRAY['Purchase_saleId_idx'], ARRAY['Purchase_saleId_status_createdAt_idx']); -- (saleId)

-- ReferralReward
SELECT pg_temp.drop_if_covered(ARRAY['ReferralReward_referrerId_idx'], ARRAY['ReferralReward_referrerId_referredUserId_key']); -- (referrerId)

-- ReferrerReputationScore
SELECT pg_temp.drop_if_covered(ARRAY['ReferrerReputationScore_referrerId_idx'], ARRAY['ReferrerReputationScore_referrerId_key']); -- (referrerId)

-- Review
SELECT pg_temp.drop_if_covered(ARRAY['Review_saleId_idx'], ARRAY['Review_saleId_moderationStatus_createdAt_idx']); -- (saleId)

-- RoleConsent
SELECT pg_temp.drop_if_covered(ARRAY['RoleConsent_subscriptionId_idx'], ARRAY['RoleConsent_subscriptionId_key']); -- (subscriptionId)

-- Sale
SELECT pg_temp.drop_if_covered(ARRAY['Sale_city_idx'], ARRAY['Sale_city_status_endDate_idx']); -- (city)
SELECT pg_temp.drop_if_covered(ARRAY['Sale_organizerId_status_idx'], ARRAY['Sale_organizerId_status_endDate_idx']); -- (organizerId, status)
SELECT pg_temp.drop_if_covered(ARRAY['Sale_sourceName_idx'], ARRAY['Sale_sourceName_sourceUrlFetchFailedAt_idx']); -- (sourceName)
SELECT pg_temp.drop_if_covered(ARRAY['Sale_status_endDate_idx'], ARRAY['Sale_status_endDate_lat_lng_idx']); -- (status, endDate)
SELECT pg_temp.drop_if_covered(ARRAY['Sale_status_startDate_idx'], ARRAY['Sale_status_startDate_endDate_idx']); -- (status, startDate)

-- SaleAssignment
SELECT pg_temp.drop_if_covered(ARRAY['SaleAssignment_saleId_idx'], ARRAY['SaleAssignment_saleId_teamMemberId_key']); -- (saleId)

-- SaleReminder
SELECT pg_temp.drop_if_covered(ARRAY['SaleReminder_userId_idx'], ARRAY['SaleReminder_userId_saleId_reminderType_key']); -- (userId)

-- SaleSettlement
SELECT pg_temp.drop_if_covered(ARRAY['SaleSettlement_saleId_idx'], ARRAY['SaleSettlement_saleId_key']); -- (saleId)

-- SaleShareLink
SELECT pg_temp.drop_if_covered(ARRAY['SaleShareLink_code_idx'], ARRAY['SaleShareLink_code_key']); -- (code)

-- SaleShareLinkClick
SELECT pg_temp.drop_if_covered(ARRAY['SaleShareLinkClick_shareLinkId_idx'], ARRAY['SaleShareLinkClick_shareLinkId_clickerId_key']); -- (shareLinkId)

-- SaleWaitlist
SELECT pg_temp.drop_if_covered(ARRAY['SaleWaitlist_saleId_idx'], ARRAY['SaleWaitlist_saleId_userId_key']); -- (saleId)

-- ShopifyListing
SELECT pg_temp.drop_if_covered(ARRAY['ShopifyListing_itemId_idx'], ARRAY['ShopifyListing_itemId_key']); -- (itemId)
SELECT pg_temp.drop_if_covered(ARRAY['ShopifyListing_organizerId_idx'], ARRAY['ShopifyListing_organizerId_shopifyProductId_key']); -- (organizerId)

-- ShopperOrganizerIntroduction
SELECT pg_temp.drop_if_covered(ARRAY['ShopperOrganizerIntroduction_shopperId_idx'], ARRAY['ShopperOrganizerIntroduction_shopperId_organizerId_key']); -- (shopperId)

-- ShopperStamp
SELECT pg_temp.drop_if_covered(ARRAY['ShopperStamp_userId_idx'], ARRAY['ShopperStamp_userId_type_key']); -- (userId)

-- SmartFollow
SELECT pg_temp.drop_if_covered(ARRAY['SmartFollow_userId_idx'], ARRAY['SmartFollow_userId_organizerId_key']); -- (userId)

-- SocialAccount
SELECT pg_temp.drop_if_covered(ARRAY['SocialAccount_platform_idx'], ARRAY['SocialAccount_platform_key']); -- (platform)

-- SourcebookEntry
SELECT pg_temp.drop_if_covered(ARRAY['SourcebookEntry_organizerId_idx'], ARRAY['SourcebookEntry_organizerId_authorId_key']); -- (organizerId)
SELECT pg_temp.drop_if_covered(ARRAY['SourcebookEntry_saleId_idx'], ARRAY['SourcebookEntry_saleId_authorId_key']); -- (saleId)

-- StampMilestone
SELECT pg_temp.drop_if_covered(ARRAY['StampMilestone_userId_idx'], ARRAY['StampMilestone_userId_milestone_key']); -- (userId)

-- TeamMember
SELECT pg_temp.drop_if_covered(ARRAY['StaffMember_workspaceMemberId_idx', 'TeamMember_workspaceMemberId_idx'], ARRAY['StaffMember_workspaceMemberId_key']); -- (workspaceMemberId)

-- TeamMemberAvailability
SELECT pg_temp.drop_if_covered(ARRAY['StaffAvailability_staffMemberId_idx', 'TeamMemberAvailability_teamMemberId_idx'], ARRAY['StaffAvailability_staffMemberId_key']); -- (teamMemberId)

-- TeamMemberPerformance
SELECT pg_temp.drop_if_covered(ARRAY['StaffPerformance_staffMemberId_period_idx', 'TeamMemberPerformance_teamMemberId_period_idx'], ARRAY['StaffPerformance_staffMemberId_period_key']); -- (teamMemberId, period)

-- TrailCompletion
SELECT pg_temp.drop_if_covered(ARRAY['TrailCompletion_trailId_idx'], ARRAY['TrailCompletion_trailId_userId_key']); -- (trailId)

-- TrailHighlight
SELECT pg_temp.drop_if_covered(ARRAY['TrailHighlight_trailId_idx'], ARRAY['TrailHighlight_trailId_itemId_key']); -- (trailId)

-- TrailStop
SELECT pg_temp.drop_if_covered(ARRAY['TrailStop_trailId_idx'], ARRAY['TrailStop_trailId_order_key']); -- (trailId)

-- UGCPhotoLike
SELECT pg_temp.drop_if_covered(ARRAY['UGCPhotoLike_userId_idx'], ARRAY['UGCPhotoLike_userId_photoId_key']); -- (userId)

-- UGCPhotoReaction
SELECT pg_temp.drop_if_covered(ARRAY['UGCPhotoReaction_userId_idx'], ARRAY['UGCPhotoReaction_userId_photoId_type_key']); -- (userId)

-- UnsubscribeToken
SELECT pg_temp.drop_if_covered(ARRAY['UnsubscribeToken_token_idx'], ARRAY['UnsubscribeToken_token_key']); -- (token)

-- UserAchievement
SELECT pg_temp.drop_if_covered(ARRAY['UserAchievement_userId_idx'], ARRAY['UserAchievement_userId_achievementId_key']); -- (userId)

-- UserRoleSubscription
SELECT pg_temp.drop_if_covered(ARRAY['UserRoleSubscription_userId_idx'], ARRAY['UserRoleSubscription_userId_role_key']); -- (userId)

-- UserShowcase
SELECT pg_temp.drop_if_covered(ARRAY['UserShowcase_userId_idx'], ARRAY['UserShowcase_userId_slotIndex_key']); -- (userId)

-- UspsZoneChartEntry
SELECT pg_temp.drop_if_covered(ARRAY['UspsZoneChartEntry_originZip3_idx'], ARRAY['UspsZoneChartEntry_pkey']); -- (originZip3)

-- VendorBooth
SELECT pg_temp.drop_if_covered(ARRAY['VendorBooth_boothToken_idx'], ARRAY['VendorBooth_boothToken_key']); -- (boothToken)
SELECT pg_temp.drop_if_covered(ARRAY['VendorBooth_hubId_idx'], ARRAY['VendorBooth_hubId_boothNumber_key']); -- (hubId)

-- VendorBoothFeeCharge
SELECT pg_temp.drop_if_covered(ARRAY['VendorBoothFeeCharge_squarePaymentId_idx'], ARRAY['VendorBoothFeeCharge_squarePaymentId_key']); -- (squarePaymentId)
SELECT pg_temp.drop_if_covered(ARRAY['VendorBoothFeeCharge_vendorBoothId_idx'], ARRAY['VendorBoothFeeCharge_vendorBoothId_periodStart_periodEnd_key']); -- (vendorBoothId)

-- VisitStreak
SELECT pg_temp.drop_if_covered(ARRAY['VisitStreak_userId_idx'], ARRAY['VisitStreak_userId_key']); -- (userId)

-- WishlistAlert
SELECT pg_temp.drop_if_covered(ARRAY['WishlistAlert_userId_idx'], ARRAY['WishlistAlert_userId_isActive_idx']); -- (userId)

-- WorkspaceAlert
SELECT pg_temp.drop_if_covered(ARRAY['WorkspaceAlert_workspaceId_idx'], ARRAY['WorkspaceAlert_workspaceId_severity_idx']); -- (workspaceId)

-- WorkspaceChatMessage
SELECT pg_temp.drop_if_covered(ARRAY['WorkspaceChatMessage_chatId_idx'], ARRAY['WorkspaceChatMessage_chatId_createdAt_idx']); -- (chatId)

-- WorkspaceInvite
SELECT pg_temp.drop_if_covered(ARRAY['WorkspaceInvite_inviteToken_idx'], ARRAY['WorkspaceInvite_inviteToken_key']); -- (inviteToken)

-- WorkspaceMember
SELECT pg_temp.drop_if_covered(ARRAY['WorkspaceMember_workspaceId_idx'], ARRAY['WorkspaceMember_workspaceId_organizerId_key', 'WorkspaceMember_workspaceId_userId_key']); -- (workspaceId)

-- WorkspacePermission
SELECT pg_temp.drop_if_covered(ARRAY['WorkspacePermission_workspaceId_role_idx'], ARRAY['WorkspacePermission_workspaceId_role_action_key']); -- (workspaceId, role)

-- WorkspaceRevenueSnapshot
SELECT pg_temp.drop_if_covered(ARRAY['WorkspaceRevenueSnapshot_workspaceId_date_idx'], ARRAY['WorkspaceRevenueSnapshot_workspaceId_date_key']); -- (workspaceId, date)

-- WorkspaceRoleTemplate
SELECT pg_temp.drop_if_covered(ARRAY['WorkspaceRoleTemplate_name_idx'], ARRAY['WorkspaceRoleTemplate_name_key']); -- (name)

-- WorkspaceSaleChat
SELECT pg_temp.drop_if_covered(ARRAY['WorkspaceSaleChat_workspaceId_saleId_idx'], ARRAY['WorkspaceSaleChat_workspaceId_saleId_key']); -- (workspaceId, saleId)

-- WorkspaceSettings
SELECT pg_temp.drop_if_covered(ARRAY['WorkspaceSettings_workspaceId_idx'], ARRAY['WorkspaceSettings_workspaceId_key']); -- (workspaceId)
