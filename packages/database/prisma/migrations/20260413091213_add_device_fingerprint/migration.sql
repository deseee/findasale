-- Platform Safety #118: Device Fingerprinting for Multi-Account Fraud Detection
-- Stores device fingerprint (user agent + screen + timezone + canvas hash) to detect multi-account fraud
-- fraudSuspect flag set to true if 2+ accounts share same fingerprint

-- Add deviceFingerprint to User table
ALTER TABLE "User" ADD COLUMN "deviceFingerprint" TEXT;

-- Add fraudSuspect flag to User table
ALTER TABLE "User" ADD COLUMN "fraudSuspect" BOOLEAN NOT NULL DEFAULT false;

-- Create indexes for fast fraud detection
CREATE INDEX "User_deviceFingerprint_idx" ON "User"("deviceFingerprint");
CREATE INDEX "User_fraudSuspect_idx" ON "User"("fraudSuspect");
