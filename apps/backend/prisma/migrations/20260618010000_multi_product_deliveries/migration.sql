-- Multi-product deliveries (audit DAT-03/DAT-06): a customer can hold multiple
-- active subscriptions (e.g. cow + buffalo milk), so deliveries are keyed per
-- product instead of per customer. The old @@unique([customerId, scheduledFor])
-- silently dropped a 2nd product's delivery via skipDuplicates.

-- DropIndex
DROP INDEX "Delivery_customerId_scheduledFor_key";

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "productId" TEXT,
ADD COLUMN     "subscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "Delivery_subscriptionId_idx" ON "Delivery"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_customerId_productId_scheduledFor_key" ON "Delivery"("customerId", "productId", "scheduledFor");

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
