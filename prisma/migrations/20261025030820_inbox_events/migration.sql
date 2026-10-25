-- CreateTable
CREATE TABLE "InboxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "knowledgeEntryId" TEXT,
    "proposalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "evidence" TEXT,
    "beforeContent" TEXT,
    "afterContent" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InboxEvent_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboxEvent_knowledgeEntryId_fkey" FOREIGN KEY ("knowledgeEntryId") REFERENCES "KnowledgeEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxDigest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rangeKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "InboxEvent_workspaceId_occurredAt_idx" ON "InboxEvent"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "InboxEvent_proposalId_idx" ON "InboxEvent"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxEvent_workspaceId_dedupeKey_key" ON "InboxEvent"("workspaceId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "InboxDigest_workspaceId_kind_rangeKey_key" ON "InboxDigest"("workspaceId", "kind", "rangeKey");
