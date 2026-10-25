import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/utils";
import {
  vaultRoot,
  kbFolderName,
  entryFileName,
  insightFileName,
  sourceFileName,
  VAULT_FOLDERS,
  UNCATEGORIZED_DIR,
} from "./paths";
import {
  renderKbOverview,
  renderKnowledgeEntry,
  renderInsight,
  renderSource,
  renderProposal,
} from "./markdown";

async function findExistingKbDir(knowledgeBaseId: string): Promise<string | null> {
  const root = vaultRoot();
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return null; // vault root doesn't exist yet
  }
  for (const dirName of entries) {
    const overviewPath = path.join(root, dirName, "_Overview.md");
    try {
      const content = await fs.readFile(overviewPath, "utf-8");
      const match = content.match(/^id:\s*"([^"]+)"/m);
      if (match && match[1] === knowledgeBaseId) return path.join(root, dirName);
    } catch {
      // not a KB folder (or unreadable) — skip
    }
  }
  return null;
}

async function clearAndRecreate(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Rewrites the Markdown vault folder for one knowledge base from the current
 * database state — a full, idempotent resync (not an incremental patch), so
 * renamed/removed items never leave stale files behind. Safe to call after
 * any mutation; cheap at MVP scale (tens of entries).
 *
 * The vault is a read-through export for external tools/agents (Obsidian,
 * grep, other LLM agents with filesystem access) — SQLite remains the source
 * of truth. See docs/architecture-handoff.md §12.
 */
export async function syncKnowledgeBaseToVault(knowledgeBaseId: string): Promise<string> {
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
  if (!kb) throw new Error(`Knowledge vault not found: ${knowledgeBaseId}`);

  const [categories, sources, entries, insights, proposals] = await Promise.all([
    prisma.knowledgeCategory.findMany({ where: { knowledgeBaseId } }),
    prisma.source.findMany({ where: { knowledgeBaseId } }),
    prisma.knowledgeEntry.findMany({
      where: { knowledgeBaseId },
      include: { category: true, sourceDocument: { include: { source: true } } },
    }),
    prisma.insight.findMany({
      where: { knowledgeBaseId },
      include: { evidence: { include: { sourceDocument: true, knowledgeEntry: true } } },
    }),
    prisma.knowledgeChangeProposal.findMany({
      where: { knowledgeBaseId },
      include: { targetEntry: true },
    }),
  ]);

  const root = vaultRoot();
  await fs.mkdir(root, { recursive: true });

  const desiredDirName = kbFolderName(kb.name, kb.id);
  const desiredDir = path.join(root, desiredDirName);
  const existingDir = await findExistingKbDir(kb.id);
  if (existingDir && existingDir !== desiredDir) {
    await fs.rename(existingDir, desiredDir);
  }
  await fs.mkdir(desiredDir, { recursive: true });

  // --- _Overview.md -----------------------------------------------------
  await fs.writeFile(path.join(desiredDir, "_Overview.md"), renderKbOverview(kb, categories, sources));

  // --- 01_Sources/ --------------------------------------------------------
  const sourcesDir = path.join(desiredDir, VAULT_FOLDERS.sources);
  await clearAndRecreate(sourcesDir);
  for (const source of sources) {
    const documents = await prisma.sourceDocument.findMany({
      where: { sourceId: source.id },
      orderBy: { fetchedAt: "desc" },
    });
    await fs.writeFile(
      path.join(sourcesDir, sourceFileName(source.name, source.id)),
      renderSource(source, documents)
    );
  }

  // --- 02_Knowledge/<category>/ -------------------------------------------
  const knowledgeDir = path.join(desiredDir, VAULT_FOLDERS.knowledge);
  await clearAndRecreate(knowledgeDir);
  for (const entry of entries) {
    const categoryDir = entry.category ? slugify(entry.category.name) : UNCATEGORIZED_DIR;
    const dir = path.join(knowledgeDir, categoryDir);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, entryFileName(entry.title, entry.id)),
      renderKnowledgeEntry(entry, entry.category, entry.sourceDocument)
    );
  }

  // --- 03_Insights/ --------------------------------------------------------
  const insightsDir = path.join(desiredDir, VAULT_FOLDERS.insights);
  await clearAndRecreate(insightsDir);
  for (const insight of insights) {
    await fs.writeFile(
      path.join(insightsDir, insightFileName(insight.title, insight.id)),
      renderInsight(insight, insight.evidence)
    );
  }

  // --- 04_Proposals/ -------------------------------------------------------
  const proposalsDir = path.join(desiredDir, VAULT_FOLDERS.proposals);
  await clearAndRecreate(proposalsDir);
  for (const proposal of proposals) {
    await fs.writeFile(
      path.join(proposalsDir, `${slugify(proposal.operation + "-" + proposal.id)}.md`),
      renderProposal(proposal, proposal.targetEntry)
    );
  }

  return desiredDir;
}

/** Best-effort sync — logs and swallows errors so a vault write issue never
 * breaks the API request that triggered it (the DB write already succeeded). */
export async function syncKnowledgeBaseToVaultSafe(knowledgeBaseId: string): Promise<void> {
  try {
    await syncKnowledgeBaseToVault(knowledgeBaseId);
  } catch (err) {
    console.error(`[vault] sync failed for ${knowledgeBaseId}:`, err);
  }
}

/**
 * Removes a deleted knowledge vault's generated export folder (found by the id
 * in its _Overview.md, so only that vault's own folder under the vault root is
 * touched). Best-effort, like syncing: the database delete already succeeded.
 */
export async function removeKnowledgeBaseFromVaultSafe(knowledgeBaseId: string): Promise<void> {
  try {
    const dir = await findExistingKbDir(knowledgeBaseId);
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  } catch (err) {
    console.error(`[vault] failed to remove export for ${knowledgeBaseId}:`, err);
  }
}
