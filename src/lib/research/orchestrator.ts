import { prisma } from "@/lib/db/prisma";
import { isAiConfigured } from "@/lib/ai/client";
import { extractKnowledge } from "@/lib/ai/extraction-agent";
import { generateInsights, type InsightFinding } from "@/lib/ai/insight-agent";
import { compareAgainstExisting } from "@/lib/knowledge/comparison";
import { getKnowledgeBaseOrThrow, listMonitorableSources } from "@/lib/knowledge/repository";
import { applyComparisonClassification } from "@/lib/knowledge/classification";
import { syncKnowledgeBaseToVaultSafe } from "@/lib/vault/sync";
import { fetchRssSource } from "./rss-fetcher";
import { fetchGithubReleases } from "./github-fetcher";
import { fetchHtmlSource } from "./html-fetcher";
import { filterOutExactDuplicates } from "./deduplicator";
import type { NormalizedDocument } from "./normalizer";
import type { ExtractionResponse, ComparisonResponse } from "@/lib/ai/schemas";
import type { Source } from "@prisma/client";

// Per-run limits — see README "Reliability and Security": caps documents and
// therefore AI token spend per run regardless of how many new items a source
// returns.
const MAX_DOCUMENTS_PROCESSED_PER_RUN = 8;

export class OverlappingRunError extends Error {
  constructor(knowledgeBaseId: string) {
    super(`A research run is already in progress for knowledge base ${knowledgeBaseId}`);
    this.name = "OverlappingRunError";
  }
}

async function fetchFromSource(source: Source) {
  const conditional = { etag: source.etag, lastModified: source.lastModified };
  switch (source.type) {
    case "RSS":
      return fetchRssSource(source.url, conditional);
    case "GITHUB_RELEASES":
      return fetchGithubReleases(source.url, conditional);
    case "HTML":
      return fetchHtmlSource(source.url, conditional);
    default:
      throw new Error(`Unsupported source type: ${source.type}`);
  }
}

interface FetchedDocRecord {
  sourceDocumentId: string;
  sourceId: string;
  doc: NormalizedDocument;
}

export async function runResearch(
  knowledgeBaseId: string,
  { trigger = "manual" }: { trigger?: "manual" | "scheduled" } = {}
) {
  const existingRun = await prisma.researchRun.findFirst({
    where: { knowledgeBaseId, status: "RUNNING" },
  });
  if (existingRun) throw new OverlappingRunError(knowledgeBaseId);

  const kb = await getKnowledgeBaseOrThrow(knowledgeBaseId);
  const sources = await listMonitorableSources(knowledgeBaseId);

  const run = await prisma.researchRun.create({
    data: { knowledgeBaseId, status: "RUNNING" },
  });

  let documentsFetched = 0;
  let documentsProcessed = 0;
  let insightsGenerated = 0;
  // Every warning/error surfaced in the run's errorMessage, for visibility.
  const runNotes: string[] = [];
  // Only per-source fetch failures count toward "did every source fail?" —
  // a missing API key degrades the run (fetched-but-not-analyzed) rather
  // than failing it outright, so it must not be conflated with source errors.
  let sourcesFailedCount = 0;
  const aiConfigured = isAiConfigured();
  if (!aiConfigured) {
    runNotes.push(
      "ANTHROPIC_API_KEY not configured — documents were fetched and stored, but AI extraction/comparison/insights were skipped."
    );
  }

  try {
    // --- Fetch + normalize + dedup per source --------------------------------
    const storedDocs: FetchedDocRecord[] = [];

    for (const source of sources) {
      try {
        const result = await fetchFromSource(source);
        documentsFetched += result.documents.length;

        const fresh = await filterOutExactDuplicates(source.id, result.documents);
        for (const doc of fresh) {
          try {
            const created = await prisma.sourceDocument.create({
              data: {
                sourceId: source.id,
                externalId: doc.externalId,
                url: doc.url,
                title: doc.title,
                content: doc.content,
                contentHash: doc.contentHash,
                publishedAt: doc.publishedAt,
              },
            });
            storedDocs.push({ sourceDocumentId: created.id, sourceId: source.id, doc });
          } catch (err: unknown) {
            // Unique constraint race (two runs/sources storing the same doc
            // concurrently) — safe to skip, it's already persisted.
            if (!isUniqueConstraintError(err)) throw err;
          }
        }

        await prisma.source.update({
          where: { id: source.id },
          data: {
            lastCheckedAt: new Date(),
            lastSuccessfulFetchAt: new Date(),
            lastError: null,
            etag: result.etag ?? source.etag,
            lastModified: result.lastModified ?? source.lastModified,
            status: "ACTIVE",
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        runNotes.push(`${source.name}: ${message}`);
        sourcesFailedCount += 1;
        await prisma.source.update({
          where: { id: source.id },
          data: { lastCheckedAt: new Date(), lastError: message, status: "ERROR" },
        });
      }
    }

    // --- AI pipeline: extract -> compare -> rank insights -------------------
    const findings: InsightFinding[] = [];
    const findingMeta: Array<{
      sourceDocumentId: string;
      extraction: ExtractionResponse;
      comparison: ComparisonResponse;
    }> = [];

    if (aiConfigured) {
      const toProcess = storedDocs.slice(0, MAX_DOCUMENTS_PROCESSED_PER_RUN);
      for (const { doc, sourceDocumentId } of toProcess) {
        try {
          const extraction = await extractKnowledge({
            knowledgeBaseGoal: kb.userGoal,
            title: doc.title,
            url: doc.url,
            content: doc.content,
          });
          if (!extraction.isRelevant) continue;

          const { comparison } = await compareAgainstExisting(knowledgeBaseId, extraction);
          documentsProcessed += 1;

          findings.push({
            index: findings.length,
            documentTitle: doc.title,
            documentUrl: doc.url,
            extraction,
            comparison,
          });
          findingMeta.push({ sourceDocumentId, extraction, comparison });

          // Knowledge update rules: safe to auto-apply (new drafts), unsafe
          // operations become a proposal awaiting user review — see
          // lib/knowledge/classification.ts (shared with the AI Assistant's
          // "archive this URL" tool so both paths apply identical rules).
          await applyComparisonClassification({
            knowledgeBaseId,
            title: doc.title,
            extraction,
            comparison,
            sourceDocumentId,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          runNotes.push(`AI processing failed for "${doc.title}": ${message}`);
        }
      }

      if (findings.length > 0) {
        try {
          const existingEntries = await prisma.knowledgeEntry.findMany({
            where: { knowledgeBaseId },
            select: { id: true, title: true, summary: true },
            take: 20,
          });
          const preferences = JSON.parse(kb.preferencesJson || "{}");
          const insightResult = await generateInsights({
            userGoal: kb.userGoal,
            preferences,
            findings,
            existingEntries,
          });

          for (const candidate of insightResult.insights) {
            const insight = await prisma.insight.create({
              data: {
                knowledgeBaseId,
                title: candidate.title,
                type: candidate.type,
                summary: candidate.summary,
                whyItMatters: candidate.whyItMatters,
                recommendedAction: candidate.recommendedAction,
                confidence: candidate.confidence,
                status: "PENDING",
              },
            });
            insightsGenerated += 1;

            for (const idx of candidate.evidenceDocumentIndexes) {
              const meta = findingMeta[idx];
              if (!meta) continue;
              await prisma.insightEvidence.create({
                data: {
                  insightId: insight.id,
                  sourceDocumentId: meta.sourceDocumentId,
                  explanation: meta.comparison.explanation,
                },
              });
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          runNotes.push(`Insight generation failed: ${message}`);
        }
      }
    }

    const allSourcesFailed = sources.length > 0 && sourcesFailedCount >= sources.length;
    const status = allSourcesFailed ? "FAILED" : runNotes.length > 0 ? "PARTIAL" : "COMPLETED";

    return prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status,
        completedAt: new Date(),
        documentsFetched,
        documentsProcessed,
        insightsGenerated,
        errorMessage: runNotes.length > 0 ? runNotes.join(" | ").slice(0, 2000) : null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        documentsFetched,
        documentsProcessed,
        insightsGenerated,
        errorMessage: message.slice(0, 2000),
      },
    });
    throw err;
  } finally {
    void trigger; // retained for logging/analytics symmetry with scheduled runs
    // Resync the Markdown vault regardless of outcome — even a partial/failed
    // run may have stored new documents/entries worth reflecting on disk.
    await syncKnowledgeBaseToVaultSafe(knowledgeBaseId);
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002");
}
