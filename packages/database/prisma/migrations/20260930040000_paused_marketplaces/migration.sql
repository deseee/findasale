-- Per-marketplace pause (2026-09-30)
--
-- WHY: after a marketplace suspends an organizer's account (Facebook, 2026-09-30) the extension must stop touching
-- THAT marketplace only, while every other channel keeps running. The extension's existing switches are global.
-- Organizer.pausedMarketplaces holds the platform names (e.g. 'FACEBOOK') the organizer paused in the extension
-- popup. Read by the extension, the Add Items page and the autolist/removal endpoints.
--
-- SAFETY: additive only. One column, NOT NULL with an empty-array default, so no existing row needs rewriting and
-- every organizer starts with nothing paused. Idempotent. Apply manually, BEFORE deploying the matching backend build.

ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "pausedMarketplaces" TEXT[] NOT NULL DEFAULT '{}';
