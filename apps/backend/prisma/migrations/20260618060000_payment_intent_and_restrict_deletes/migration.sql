-- EDG-02 + DAT-09 (audit Batch 12 wave B)
-- DAT-09: protect financial/audit history — a customer with payments or
-- deliveries can no longer be hard-deleted (onDelete Cascade -> Restrict).
-- EDG-02: capture the WhatsApp subscription-activation intent on the Payment so
-- the signature-verified webhook can activate on PAID (no second customer msg).

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_customerId_fkey";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "intentConsumedAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionIntent" JSONB;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
