-- SECURITY FIX P1: Add tokenVersion field to User model for JWT invalidation on password change
-- When a user changes their password, tokenVersion is incremented
-- JWTs issued before the change are rejected during authentication

ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
