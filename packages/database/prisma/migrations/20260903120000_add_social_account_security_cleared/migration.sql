-- ADR-116: gate for automated/auto-send social posting. Default false -- must be
-- flipped by hand only after findasale-hacker's applicable-feature adversarial
-- pass clears a given platform for real posts. Additive, no data risk.
ALTER TABLE "SocialAccount" ADD COLUMN "securityCleared" BOOLEAN NOT NULL DEFAULT false;
