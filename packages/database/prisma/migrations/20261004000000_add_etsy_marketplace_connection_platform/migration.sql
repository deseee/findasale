-- ADR-135: Etsy connector. Enum value only. Kept in its own migration so no statement in the
-- same transaction uses the new value. Precedent: 20260913000000_add_discogs_marketplace_connection_platform.
ALTER TYPE "MarketplaceConnectionPlatform" ADD VALUE IF NOT EXISTS 'ETSY';
