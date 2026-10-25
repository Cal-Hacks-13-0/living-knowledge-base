-- DropIndex
DROP INDEX "SourceDocument_sourceId_url_key";

-- CreateIndex
CREATE INDEX "SourceDocument_sourceId_url_idx" ON "SourceDocument"("sourceId", "url");
