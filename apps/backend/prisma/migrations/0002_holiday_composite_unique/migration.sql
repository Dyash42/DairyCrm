-- HolidayCalendar: switch from date-only unique to (date, scope) composite.
-- Lets a platform-wide holiday and a route-specific holiday coexist on
-- the same date (previously the second insert would overwrite the first).

DROP INDEX IF EXISTS "HolidayCalendar_date_key";

CREATE UNIQUE INDEX "HolidayCalendar_date_scope_key"
  ON "HolidayCalendar"("date", "scope");
