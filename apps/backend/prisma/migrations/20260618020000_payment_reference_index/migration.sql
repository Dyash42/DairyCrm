-- Index Payment.reference (audit PER-08): the payment webhook resolves the
-- pending row by `reference`, and the EOD cash query filters by the
-- `delivery:<id>` reference — both were full table scans as the table grows.
CREATE INDEX "Payment_reference_idx" ON "Payment"("reference");
