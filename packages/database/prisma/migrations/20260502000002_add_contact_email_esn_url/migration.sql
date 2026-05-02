-- ADR-073 Phase 2: Contact acquisition fields on Organizer
-- contactEmail: scraped from website /contact page or sale listing descriptions
-- esnCompanyPageUrl: ESN company profile URL, stored as last-resort outreach channel

ALTER TABLE "Organizer" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "esnCompanyPageUrl" TEXT;
