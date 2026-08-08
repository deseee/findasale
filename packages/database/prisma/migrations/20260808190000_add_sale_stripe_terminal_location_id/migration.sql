-- Stripe Terminal readiness fix (2026-08-08 audit): cache the Stripe Terminal Location
-- object id created for each sale's physical address. Nullable, additive -- existing rows
-- get NULL and are unaffected until an organizer's first real (non-simulated) Terminal
-- connection-token request for that sale triggers a get-or-create
-- (terminalController.getOrCreateTerminalLocationForSale).
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "stripeTerminalLocationId" TEXT;
