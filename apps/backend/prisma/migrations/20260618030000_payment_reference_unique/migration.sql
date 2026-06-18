-- DAT-10: make Payment.reference UNIQUE as the durable backstop against
-- double-credit. Replaces the plain @@index([reference]) (PER-08) — a unique
-- index serves the same lookup. The column is nullable, and Postgres treats
-- NULLs as distinct, so multiple manual payments WITHOUT a reference are still
-- allowed; only real references (gateway link ids, `delivery:<id>` cash tags)
-- are forced unique, so the webhook can never reconcile two PAID rows for one
-- gateway ref and the door-cash payment can't be inserted twice.

-- DropIndex
DROP INDEX "Payment_reference_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");
