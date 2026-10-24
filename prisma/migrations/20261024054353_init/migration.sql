-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "userGoal" TEXT NOT NULL,
    "preferencesJson" TEXT NOT NULL DEFAULT '{}',
    "monitoringFrequency" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KnowledgeCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "parentId" TEXT,
    CONSTRAINT "KnowledgeCategory_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgeCategory" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastCheckedAt" DATETIME,
    "lastSuccessfulFetchAt" DATETIME,
    "lastError" TEXT,
    "etag" TEXT,
    "lastModified" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Source_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeEntry_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeEntry_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Insight_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InsightEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "insightId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "knowledgeEntryId" TEXT,
    "explanation" TEXT NOT NULL,
    CONSTRAINT "InsightEvidence_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InsightEvidence_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InsightEvidence_knowledgeEntryId_fkey" FOREIGN KEY ("knowledgeEntryId") REFERENCES "KnowledgeEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "documentsFetched" INTEGER NOT NULL DEFAULT 0,
    "documentsProcessed" INTEGER NOT NULL DEFAULT 0,
    "insightsGenerated" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    CONSTRAINT "ResearchRun_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeChangeProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "insightId" TEXT,
    "targetEntryId" TEXT,
    "operation" TEXT NOT NULL,
    "proposedContent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "KnowledgeChangeProposal_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeChangeProposal_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeChangeProposal_targetEntryId_fkey" FOREIGN KEY ("targetEntryId") REFERENCES "KnowledgeEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "KnowledgeBase_createdAt_idx" ON "KnowledgeBase"("createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeCategory_knowledgeBaseId_idx" ON "KnowledgeCategory"("knowledgeBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCategory_knowledgeBaseId_name_parentId_key" ON "KnowledgeCategory"("knowledgeBaseId", "name", "parentId");

-- CreateIndex
CREATE INDEX "Source_knowledgeBaseId_idx" ON "Source"("knowledgeBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_knowledgeBaseId_url_key" ON "Source"("knowledgeBaseId", "url");

-- CreateIndex
CREATE INDEX "SourceDocument_sourceId_idx" ON "SourceDocument"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_sourceId_contentHash_key" ON "SourceDocument"("sourceId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_sourceId_url_key" ON "SourceDocument"("sourceId", "url");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_knowledgeBaseId_idx" ON "KnowledgeEntry"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_categoryId_idx" ON "KnowledgeEntry"("categoryId");

-- CreateIndex
CREATE INDEX "Insight_knowledgeBaseId_idx" ON "Insight"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "Insight_status_idx" ON "Insight"("status");

-- CreateIndex
CREATE INDEX "InsightEvidence_insightId_idx" ON "InsightEvidence"("insightId");

-- CreateIndex
CREATE INDEX "InsightEvidence_sourceDocumentId_idx" ON "InsightEvidence"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "ResearchRun_knowledgeBaseId_idx" ON "ResearchRun"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "ResearchRun_status_idx" ON "ResearchRun"("status");

-- CreateIndex
CREATE INDEX "KnowledgeChangeProposal_knowledgeBaseId_idx" ON "KnowledgeChangeProposal"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "KnowledgeChangeProposal_status_idx" ON "KnowledgeChangeProposal"("status");
