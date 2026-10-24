import path from "node:path";
import { slugify } from "@/lib/utils";

/**
 * Root directory of the Markdown vault — a plain folder of .md files mirroring
 * the database, readable by Obsidian or any other file-based tool/agent. Not
 * the source of truth (SQLite is); this is a synced, human- and
 * agent-readable export. See docs/architecture-handoff.md §12.
 *
 * Read at call time (not module load) so tests can override VAULT_DIR.
 */
export function vaultRoot(): string {
  // The vault directory is intentionally dynamic (env-var configurable, or a
  // temp dir under test) — this is a runtime fs.writeFile target, never a
  // module the bundler needs to trace/include.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.VAULT_DIR || "vault");
}

export function kbFolderName(name: string, knowledgeBaseId: string): string {
  return `${slugify(name)}-${knowledgeBaseId.slice(-8)}`;
}

export function entryFileName(title: string, entryId: string): string {
  return `${slugify(title)}-${entryId.slice(-6)}.md`;
}

export function insightFileName(title: string, insightId: string): string {
  return `${slugify(title)}-${insightId.slice(-6)}.md`;
}

export function sourceFileName(name: string, sourceId: string): string {
  return `${slugify(name)}-${sourceId.slice(-6)}.md`;
}

export const VAULT_FOLDERS = {
  sources: "01_Sources",
  knowledge: "02_Knowledge",
  insights: "03_Insights",
  proposals: "04_Proposals",
} as const;

export const UNCATEGORIZED_DIR = "_uncategorized";
