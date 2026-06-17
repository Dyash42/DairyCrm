-- CreateTable
CREATE TABLE "BotPrompt" (
    "key" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "buttons" JSONB,
    "rows" JSONB,
    "variables" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "BotPrompt_pkey" PRIMARY KEY ("key")
);
