-- Add a proper Delivery.confirmationSentAt column + index so the
-- delivery-confirm cron no longer has to use a "[wa-sent]" marker
-- string inside `note` for idempotency.
--
-- Safe for live tables: column is nullable with no default, so existing
-- rows aren't touched and no rewrite happens.

ALTER TABLE "Delivery" ADD COLUMN "confirmationSentAt" TIMESTAMP(3);

CREATE INDEX "Delivery_status_confirmationSentAt_idx"
  ON "Delivery"("status", "confirmationSentAt");

-- One-time backfill: rows whose `note` starts with the old "[wa-sent]"
-- marker had their confirmation already sent. Treat those as sent at the
-- updatedAt time (best approximation), then strip the marker so the note
-- field is clean. This is idempotent — re-running has no effect.
UPDATE "Delivery"
   SET "confirmationSentAt" = "updatedAt",
       "note" = NULLIF(trim(both ' ' from regexp_replace("note", '^\[wa-sent\]\s*', '')), '')
 WHERE "note" LIKE '[wa-sent]%';
