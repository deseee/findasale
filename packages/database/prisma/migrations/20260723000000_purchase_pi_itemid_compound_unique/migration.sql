-- Fix production regression: migration 20260707120000_purchase_pi_partial_unique added a
-- partial UNIQUE index on Purchase.stripePaymentIntentId alone. That silently reintroduced
-- the exact bug migration 20260409_purchase_pi_non_unique had deliberately fixed three months
-- earlier ("A single Stripe PaymentIntent (multi-item POS cart) can produce multiple Purchase
-- rows. The @unique constraint caused a P2002 error on the second item in any POS cart.").
--
-- Root cause traced via git history: the July 7 index was added by commit 8d6f7c8d
-- ("purchase idempotency guard + partial-unique index (dup tx)") specifically as a
-- defense-in-depth backstop for BUG 1 in createPaymentIntent -- a SINGLE-ITEM duplicate
-- Purchase row on a retried Stripe idempotency key (same stripePaymentIntentId AND same
-- itemId). It was never intended to block the legitimate multi-item case where several
-- DIFFERENT items intentionally share one stripePaymentIntentId (POS Payment Link,
-- Cart Checkout) -- that distinction was lost when the index was scoped to
-- stripePaymentIntentId alone instead of the (stripePaymentIntentId, itemId) pair.
--
-- Since 2026-07-07 this has broken checkout.session.completed for every real 2+-item POS
-- Payment Link sale (uncaught P2002, Stripe retries and eventually gives up -- sale never
-- recorded) and every real 2+-item Cart Checkout sale (caught and logged, but still silently
-- fails to record the sale, no retry). Confirmed by reproducing the failure this session
-- while reconciling one specific stranded sale (POSPaymentLink cmrwdj6hb00aottrxnqm0hr6r).
--
-- Fix: replace the single-column partial unique index with a compound partial unique index
-- on (stripePaymentIntentId, itemId). This still blocks the original bug (two Purchase rows
-- with the SAME PaymentIntent AND the SAME item -- impossible now) while allowing multiple
-- DIFFERENT items to share one PaymentIntent (Postgres unique indexes ignore NULL-vs-NULL,
-- so itemId IS NULL rows such as ALA_CARTE Purchase records are unaffected either way).

DROP INDEX IF EXISTS "Purchase_stripePaymentIntentId_unique";

CREATE UNIQUE INDEX "Purchase_stripePaymentIntentId_itemId_unique"
ON "Purchase" ("stripePaymentIntentId", "itemId")
WHERE "stripePaymentIntentId" IS NOT NULL;
