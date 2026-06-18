-- ARC-08: add a PENDING customer state for WhatsApp onboarding leads that have
-- not paid yet. createCustomer (bot onboarding) sets PENDING; activateSubscription
-- promotes to ACTIVE on payment. Abandoned onboardings stay PENDING — a
-- filterable lead segment that the scheduler / active-customer counts /
-- EDG-04 surfacing all ignore (they key on ACTIVE).

-- AlterEnum
ALTER TYPE "CustomerStatus" ADD VALUE 'PENDING';
