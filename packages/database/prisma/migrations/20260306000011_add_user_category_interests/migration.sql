-- Add categoryInterests field to User model
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "categoryInterests" TEXT[] DEFAULT '{}';
