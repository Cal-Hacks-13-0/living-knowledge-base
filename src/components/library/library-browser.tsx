"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard, type EntryCardData } from "./entry-card";
import { CategoryManager, type ManagedCategory } from "./category-manager";
import { PageEntrance } from "@/components/motion/page-entrance";
import { AnimatedText } from "@/components/motion/animated-text";
import { apiGet, apiPatch, ApiError } from "@/lib/client/api";
import type { CategoryAssignmentResult } from "@/lib/knowledge/categorize";

const UNCATEGORIZED_KEY = "__uncategorized__";

/** The Library groups by top-level category: an entry filed under a subtopic shows under its parent. */
function groupKey(entry: EntryCardData, topLevelIds: Set<string>): string {
  const c = entry.category;
  if (!c) return UNCATEGORIZED_KEY;
  if (topLevelIds.has(c.id)) return c.id;
  if (c.parentId && topLevelIds.has(c.parentId)) return c.parentId;
  return UNCATEGORIZED_KEY; // no valid category assignment
}

export function LibraryBrowser({
  knowledgeBaseId,
  initialEntries,
  categories,
}: {
  knowledgeBaseId: string;
  initialEntries: EntryCardData[];
  categories: ManagedCategory[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<EntryCardData[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Local copy so category moves show immediately; replaced whenever the
  // server sends fresh data (router.refresh()).
  const [allEntries, setAllEntries] = useState(initialEntries);
  const [prevInitialEntries, setPrevInitialEntries] = useState(initialEntries);
  if (initialEntries !== prevInitialEntries) {
    setPrevInitialEntries(initialEntries);
    setAllEntries(initialEntries);
  }
  const trimmedSearch = search.trim();
  const entries = trimmedSearch ? (searchResults ?? allEntries) : allEntries;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState("");
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveNotice, setMoveNotice] = useState<string | null>(null);

  const topLevelIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);
  // Counts from the same entries the page shows, so headings, the category
  // manager and Uncategorized always agree.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of allEntries) {
      const k = groupKey(e, topLevelIds);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [allEntries, topLevelIds]);
  const managedCategories = useMemo(
    () => categories.map((c) => ({ ...c, _count: { entries: counts.get(c.id) ?? 0 } })),
    [categories, counts]
  );

  async function moveEntries(entryIds: string[], categoryId: string | null) {
    if (entryIds.length === 0) return;
    setMoveError(null);
    setMoveNotice(null);
    setMovingIds(new Set(entryIds));
    try {
      const result = await apiPatch<CategoryAssignmentResult>(`/api/knowledge-bases/${knowledgeBaseId}/entries`, {
        entryIds,
        categoryId,
      });
      const moved = new Set([...result.updated, ...result.unchanged].map((e) => e.id));
      const category = result.category ? { ...result.category, parentId: null } : null;
      const apply = (list: EntryCardData[]) => list.map((e) => (moved.has(e.id) ? { ...e, category } : e));
      setAllEntries(apply);
      setSearchResults((r) => (r ? apply(r) : r));
      setSelected((s) => new Set([...s].filter((id) => !moved.has(id))));
      const where = result.category ? `“${result.category.name}”` : "Uncategorized";
      const parts = [`Moved ${result.updated.length} ${result.updated.length === 1 ? "entry" : "entries"} to ${where}.`];
      if (result.unchanged.length > 0) parts.push(`${result.unchanged.length} already there.`);
      if (result.notFound.length > 0) parts.push(`${result.notFound.length} could not be found in this vault and were not changed.`);
      setMoveNotice(parts.join(" "));
      router.refresh(); // reconcile with the server in the background
    } catch (err) {
      setMoveError(err instanceof ApiError ? err.message : "Couldn't move the entries — nothing was changed.");
    } finally {
      setMovingIds(new Set());
    }
  }

  function toggleSelected(id: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Deep link from global search: /kb/:id/library#entry-<id> scrolls to, highlights, and focuses that entry.
  const targetEntryId = useSyncExternalStore(subscribeToHash, readHashEntryId, () => null);
  useEffect(() => {
    if (!targetEntryId) return;
    const el = document.getElementById(`entry-${targetEntryId}`);
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }, [targetEntryId]);

  useEffect(() => {
    if (!trimmedSearch) return; // nothing to debounce — `entries` already falls back to initialEntries
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await apiGet<EntryCardData[]>(
          `/api/knowledge-bases/${knowledgeBaseId}/entries?search=${encodeURIComponent(trimmedSearch)}`
        );
        setSearchResults(result);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [trimmedSearch, knowledgeBaseId]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, EntryCardData[]>();
    for (const entry of entries) {
      const key = groupKey(entry, topLevelIds);
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(entry);
    }
    const isSearching = trimmedSearch.length > 0;
    const ordered = categories
      .map((c) => ({ id: c.id, name: c.name, entries: byCategory.get(c.id) ?? [] }))
      .filter((g) => !isSearching || g.entries.length > 0);
    const uncategorized = byCategory.get(UNCATEGORIZED_KEY) ?? [];
    if (uncategorized.length > 0) {
      ordered.push({ id: UNCATEGORIZED_KEY, name: "Uncategorized", entries: uncategorized });
    }
    return ordered;
  }, [entries, categories, trimmedSearch, topLevelIds]);

  // Show the empty state only when there's truly nothing to display — if
  // categories exist, show the (possibly all-empty) category structure
  // instead, since that's useful on its own ("展示应按照category来").
  const nothingToShow = trimmedSearch ? entries.length === 0 : entries.length === 0 && categories.length === 0;

  return (
    <PageEntrance className="flex flex-col gap-5">
      <AnimatedText delay={0.16} className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search knowledge entries…"
            className="pl-8"
          />
        </div>
      </AnimatedText>

      <AnimatedText delay={0.24}>
        <CategoryManager knowledgeBaseId={knowledgeBaseId} categories={managedCategories} onChanged={() => router.refresh()} />
      </AnimatedText>

      {moveError && <Alert variant="danger">{moveError}</Alert>}
      {moveNotice && !moveError && (
        <p role="status" className="text-sm text-muted">
          {moveNotice}
        </p>
      )}

      {nothingToShow ? (
        <EmptyState
          title={loading ? "Searching…" : "No knowledge entries found"}
          description={loading ? undefined : "Run research to populate your knowledge library, or adjust your search."}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group, i) => (
            <AnimatedText key={group.id} as="div" delay={0.32 + i * 0.07}>
              <section>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">{group.name}</h2>
                  <span className="text-xs text-muted">({group.entries.length})</span>
                  {group.id === UNCATEGORIZED_KEY && categories.length > 0 && (
                    <>
                      <span className="text-xs text-muted">— not in any category yet. Pick a category on each card, or</span>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0 text-xs"
                        onClick={() => setSelected((s) => new Set([...s, ...group.entries.map((e) => e.id)]))}
                      >
                        select all {group.entries.length}
                      </Button>
                    </>
                  )}
                </div>
                {group.entries.length === 0 ? (
                  <p className="text-sm text-muted">No entries in this category yet.</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {group.entries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        highlighted={entry.id === targetEntryId}
                        categoryControls={
                          categories.length > 0
                            ? {
                                categories,
                                currentCategoryId: (() => {
                                  const k = groupKey(entry, topLevelIds);
                                  return k === UNCATEGORIZED_KEY ? null : k;
                                })(),
                                onChange: (categoryId) => moveEntries([entry.id], categoryId),
                                selected: selected.has(entry.id),
                                onSelectedChange: (on) => toggleSelected(entry.id, on),
                                busy: movingIds.has(entry.id),
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            </AnimatedText>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk category actions"
          className="solid-surface sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]"
        >
          <span className="text-sm font-medium text-foreground">{selected.size} selected</span>
          <label className="flex items-center gap-2 text-sm text-muted">
            Move to
            <Select value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)} className="h-8 w-auto text-sm" aria-label="Destination category">
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={UNCATEGORIZED_KEY}>Uncategorized</option>
            </Select>
          </label>
          <Button
            type="button"
            size="sm"
            disabled={!bulkTarget || movingIds.size > 0}
            onClick={() => moveEntries([...selected], bulkTarget === UNCATEGORIZED_KEY ? null : bulkTarget)}
          >
            {movingIds.size > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}
            Move to category
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}
    </PageEntrance>
  );
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHashEntryId(): string | null {
  const match = /^#entry-(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}
