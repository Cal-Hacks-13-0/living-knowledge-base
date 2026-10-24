"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard, type EntryCardData } from "./entry-card";
import { apiGet } from "@/lib/client/api";

export function LibraryBrowser({
  knowledgeBaseId,
  initialEntries,
  categories,
}: {
  knowledgeBaseId: string;
  initialEntries: EntryCardData[];
  categories: Array<{ id: string; name: string }>;
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        if (categoryId) params.set("categoryId", categoryId);
        const result = await apiGet<EntryCardData[]>(
          `/api/knowledge-bases/${knowledgeBaseId}/entries?${params.toString()}`
        );
        setEntries(result);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [search, categoryId, knowledgeBaseId]);

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
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-56">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title={loading ? "Searching…" : "No knowledge entries found"}
          description={loading ? undefined : "Run research to populate your knowledge library, or adjust your filters."}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
