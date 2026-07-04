-- S1072 Finding #4: collusion/wash-trade checkout guard needs a fast lookup path
-- for matching stripeCardFingerprint between buyer and sale organizer, and between
-- two distinct buyer accounts on the same sale. Additive, safe, no backfill needed.
CREATE INDEX IF NOT EXISTS "User_stripeCardFingerprint_idx" ON "User"("stripeCardFingerprint");
