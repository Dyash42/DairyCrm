-- PRD §5.1.4: append-only route↔executive re-assignment history. One row per
-- change to a route's assigned executive (ids stored as plain strings with no
-- FK so the audit trail survives executive/route deletion).

-- CreateTable
CREATE TABLE "RouteAssignment" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "executiveId" TEXT,
    "previousExecutiveId" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteAssignment_routeId_createdAt_idx" ON "RouteAssignment"("routeId", "createdAt");
