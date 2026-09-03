-- ADR-118: adds a video-generation trigger for build-in-public content (the
-- "press-release" text-card + voiceover video style). Additive only -- no
-- data migration needed, mirrors the pattern used for THREADS in
-- 20260815120000_add_threads_social_platform.
ALTER TYPE "VideoTriggerType" ADD VALUE IF NOT EXISTS 'BUILD_IN_PUBLIC';
