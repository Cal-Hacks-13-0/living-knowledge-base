"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard, type EntryCardData } from "./entry-card";
import { CategoryManager, type ManagedCategory } from "./category-manager";
import { apiGet } from "@/lib/client/api";

const UNCATEGORIZED_KEY = "__uncategorized__";

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
  const trimmedSearch = search.trim();
  const entries = trimmedSearch ? (searchResults ?? initialEntries) : initialEntries;

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
      const key = entry.category?.id ?? UNCATEGORIZED_KEY;
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
  }, [entries, categories, trimmedSearch]);

  // Show the empty state only when there's truly nothing to display — if
  // categories exist, show the (possibly all-empty) category structure
  // instead, since that's useful on its own ("展示应按照category来").
  const nothingToShow = trimmedSearch ? entries.length === 0 : entries.length === 0 && categories.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search knowledge entries…"
            className="pl-8"
          />
        </div>
      </div>

      <CategoryManager knowledgeBaseId={knowledgeBaseId} categories={categories} onChanged={() => router.refresh()} />

      {nothingToShow ? (
        <EmptyState
          title={loading ? "Searching…" : "No knowledge entries found"}
          description={loading ? undefined : "Run research to populate your knowledge library, or adjust your search."}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.id}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">{group.name}</h2>
                <span className="text-xs text-muted">({group.entries.length})</span>
              </div>
              {group.entries.length === 0 ? (
                <p className="text-sm text-muted">No entries in this category yet.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.entries.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
