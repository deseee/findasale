-- AlterEnum: add THREADS to SocialPlatform (ADR-105 / roadmap #625)
-- Additive only -- no data migration needed, mirrors the pattern used for
-- MANAGER/STAFF/VIEWER in 20260411000000_team_collab_roles.
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'THREADS';
