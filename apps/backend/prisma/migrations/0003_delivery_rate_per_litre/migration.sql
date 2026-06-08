-- Per-delivery rate snapshot so historical billing is stable across
-- rate edits. Nullable column → safe to add without rewriting any
-- existing Delivery rows. Going forward, the daily-route-gen cron +
-- the on-demand materializer + the bot's activate-subscription path
-- all populate this from the subscription's cached ratePerLitre.

ALTER TABLE "Delivery" ADD COLUMN "ratePerLitre" DECIMAL(8, 2);
