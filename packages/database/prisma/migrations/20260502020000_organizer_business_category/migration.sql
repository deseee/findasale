-- Migration: 20260502020000_organizer_business_category
-- Adds businessCategory field to Organizer model (ADR-077)
-- Populated by Google Places Business Directory Scraper
-- Values: ANTIQUE_MALL | ANTIQUE_DEALER | CONSIGNMENT | THRIFT_STORE | FLEA_MARKET
--         AUCTION_HOUSE | VINTAGE | ESTATE_SALE_CO | LIQUIDATION | USED_FURNITURE

ALTER TABLE "Organizer" ADD COLUMN "businessCategory" TEXT;
