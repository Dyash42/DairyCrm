-- Closes audit DAT-01 (migration drift): these were only ever applied to dev
-- via `prisma db push`, so a `prisma migrate deploy` prod DB lacked them and
-- every location feature + PIN login crashed at runtime. This migration brings
-- the migration history up to the schema.

-- Customer door-pin geolocation (WhatsApp location share / milkman capture).
ALTER TABLE "Customer" ADD COLUMN     "geoUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- Executive PIN auth (mobile unlock without OTP every launch).
ALTER TABLE "User" ADD COLUMN     "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3),
ADD COLUMN     "pinSetAt" TIMESTAMP(3);

-- Single-use, expiring tokens for the self-hosted /pin location page.
CREATE TABLE "LocationToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocationToken_token_key" ON "LocationToken"("token");

-- CreateIndex
CREATE INDEX "LocationToken_customerId_idx" ON "LocationToken"("customerId");

-- AddForeignKey
ALTER TABLE "LocationToken" ADD CONSTRAINT "LocationToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
