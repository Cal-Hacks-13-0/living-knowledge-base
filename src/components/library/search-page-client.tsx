"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, ExternalLink, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { apiGet } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";

interface SearchEntry {
  id: string;
  title: string;
  summary: string;
  status: string;
  updatedAt: string;
  knowledgeBase: { id: string; name: string };
  category: { id: string; name: string } | null;
  sourceDocument: { id: string; url: string; title: string } | null;
}

export function SearchPageClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) return; // nothing to debounce — render branches on trimmedQuery directly
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const { entries } = await apiGet<{ entries: SearchEntry[] }>(`/api/search?q=${encodeURIComponent(trimmedQuery)}`);
        setResults(entries);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [trimmedQuery]);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Search</h1>
        <p className="mt-1 text-sm text-muted">Search knowledge entries across every knowledge base.</p>
      </div>

      <div className="relative mb-6">
        <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search across all knowledge bases…"
          className="h-10 pl-9"
        />
        {loading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted" />}
      </div>

      {!trimmedQuery && !loading ? (
        <p className="text-sm text-muted">Start typing to search.</p>
      ) : results.length === 0 && !loading ? (
        <EmptyState title="No matches" description={`Nothing found for "${query}".`} />
      ) : (
        <div className="flex flex-col gap-3">
          {results.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Link href={`/kb/${entry.knowledgeBase.id}`} className="text-xs font-medium text-accent hover:underline">
                  {entry.knowledgeBase.name}
                </Link>
                {entry.category && <Badge variant="neutral">{entry.category.name}</Badge>}
                <Badge variant={entry.status === "VERIFIED" ? "success" : entry.status === "OUTDATED" ? "warning" : "neutral"}>
                  {entry.status}
                </Badge>
              </div>
              <p className="text-sm font-semibold text-foreground">{entry.title}</p>
              <p className="mt-0.5 text-sm text-muted">{entry.summary}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                <span>Updated {formatDate(entry.updatedAt)}</span>
                {entry.sourceDocument && (
                  <a href={entry.sourceDocument.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                    Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
