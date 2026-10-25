"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon, Loader2, X, BookOpen, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { apiGet } from "@/lib/client/api";
import { cn, formatDate } from "@/lib/utils";

interface VaultResult {
  id: string;
  name: string;
  snippet: string;
  entryCount: number;
}

interface EntryResult {
  id: string;
  title: string;
  snippet: string;
  status: string;
  updatedAt: string;
  knowledgeBase: { id: string; name: string };
  category: { id: string; name: string } | null;
}

interface SearchResponse {
  vaults: VaultResult[];
  entries: EntryResult[];
}

type Option =
  | { kind: "vault"; key: string; href: string; vault: VaultResult }
  | { kind: "entry"; key: string; href: string; entry: EntryResult };

const DEBOUNCE_MS = 250;

/** Shared by the sidebar's and the homepage menu's Search entries (both route to /search). */
export function SearchPageClient() {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<{ query: string; data: SearchResponse } | null>(null);
  const [error, setError] = useState<{ query: string; message: string } | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) return; // empty query: nothing to fetch, the idle state renders instead
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const data = await apiGet<SearchResponse>(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        setResponse({ query: trimmedQuery, data });
        setError(null);
        setActiveIndex(-1);
      } catch (err) {
        if (controller.signal.aborted) return; // superseded by a newer query
        setError({ query: trimmedQuery, message: err instanceof Error ? err.message : "Search failed." });
      }
    }, DEBOUNCE_MS);
    // Aborting also guarantees an older, slower response can't overwrite newer results.
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [trimmedQuery, retryToken]);

  const current = response?.query === trimmedQuery ? response.data : null;
  const failed = error?.query === trimmedQuery ? error.message : null;
  const loading = !!trimmedQuery && !current && !failed;
  // While a new query loads, keep showing the previous results (dimmed) instead of flashing empty.
  const shown = current ?? (trimmedQuery && !failed ? response?.data : null) ?? null;

  const options: Option[] = shown
    ? [
        ...shown.vaults.map((vault) => ({ kind: "vault" as const, key: `vault-${vault.id}`, href: `/kb/${vault.id}`, vault })),
        ...shown.entries.map((entry) => ({
          kind: "entry" as const,
          key: `entry-${entry.id}`,
          href: `/kb/${entry.knowledgeBase.id}/library#entry-${entry.id}`,
          entry,
        })),
      ]
    : [];
  const hasResults = options.length > 0;
  const optionId = (i: number) => `${listId}-option-${i}`;

  function open(option: Option) {
    router.push(option.href);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && hasResults) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp" && hasResults) {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter" && hasResults && current) {
      e.preventDefault();
      open(options[activeIndex >= 0 ? activeIndex : 0]);
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      clear();
    }
  }

  function clear() {
    setQuery("");
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // optionId is derived from a stable useId value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const vaultOptions = options.filter((o) => o.kind === "vault");
  const entryOptions = options.filter((o) => o.kind === "entry");

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Search</h1>
        <p className="mt-1 text-sm text-muted">
          Search knowledge vault names and descriptions, and the titles, summaries, and full text of saved knowledge
          entries.
        </p>
      </div>

      <div className="relative mb-6">
        <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
        <Input
          ref={inputRef}
          autoFocus
          type="text"
          role="combobox"
          aria-label="Search knowledge vaults and entries"
          aria-expanded={hasResults}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          value={query}
          maxLength={200}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search across all knowledge vaults…"
          className="h-10 pl-9 pr-16"
        />
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden />}
          {query && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? "Searching…" : current ? `${options.length} result${options.length === 1 ? "" : "s"}` : ""}
      </p>

      {!trimmedQuery ? (
        <p className="text-sm text-muted">Type to search. Use ↑ ↓ to move through results and Enter to open one.</p>
      ) : failed ? (
        <Alert variant="danger" className="flex items-center justify-between gap-3">
          <span>Search failed: {failed}</span>
          <Button size="sm" variant="secondary" onClick={() => {
              setError(null);
              setRetryToken((t) => t + 1);
            }}>
            Try again
          </Button>
        </Alert>
      ) : current && !hasResults ? (
        <EmptyState
          icon={<SearchIcon className="h-5 w-5" />}
          title="No matches"
          description={`Nothing in your knowledge vaults matches "${trimmedQuery}".`}
        />
      ) : (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          aria-busy={loading}
          className={cn("flex flex-col gap-6 transition-opacity", loading && "opacity-60")}
        >
          {vaultOptions.length > 0 && (
            <ResultGroup label="Knowledge vaults">
              {vaultOptions.map((option) => {
                if (option.kind !== "vault") return null;
                const index = options.indexOf(option);
                return (
                  <ResultRow key={option.key} id={optionId(index)} active={index === activeIndex} onSelect={() => open(option)}>
                    <ResultMeta icon={<BookOpen className="h-3.5 w-3.5" />} type="Knowledge vault">
                      <span>
                        {option.vault.entryCount} entr{option.vault.entryCount === 1 ? "y" : "ies"}
                      </span>
                    </ResultMeta>
                    <p className="text-sm font-semibold text-foreground">{option.vault.name}</p>
                    {option.vault.snippet && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{option.vault.snippet}</p>}
                  </ResultRow>
                );
              })}
            </ResultGroup>
          )}
          {entryOptions.length > 0 && (
            <ResultGroup label="Knowledge entries">
              {entryOptions.map((option) => {
                if (option.kind !== "entry") return null;
                const index = options.indexOf(option);
                const { entry } = option;
                return (
                  <ResultRow key={option.key} id={optionId(index)} active={index === activeIndex} onSelect={() => open(option)}>
                    <ResultMeta icon={<FileText className="h-3.5 w-3.5" />} type="Knowledge entry">
                      <span>in {entry.knowledgeBase.name}</span>
                      {entry.category && <Badge variant="neutral">{entry.category.name}</Badge>}
                      <Badge variant={entry.status === "VERIFIED" ? "success" : entry.status === "OUTDATED" ? "warning" : "neutral"}>
                        {entry.status}
                      </Badge>
                    </ResultMeta>
                    <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                    {entry.snippet && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{entry.snippet}</p>}
                    <p className="mt-1 text-xs text-muted">Updated {formatDate(entry.updatedAt)}</p>
                  </ResultRow>
                );
              })}
            </ResultGroup>
          )}
        </ul>
      )}
    </div>
  );
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li role="presentation">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <ul role="group" aria-label={label} className="flex flex-col gap-2">
        {children}
      </ul>
    </li>
  );
}

function ResultRow({
  id,
  active,
  onSelect,
  children,
}: {
  id: string;
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      // Keep focus in the search box; selection happens on click or Enter.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        "cursor-pointer rounded-lg border px-4 py-3 transition-colors",
        active ? "border-accent/50 bg-accent-soft/60" : "border-border hover:border-accent/30 hover:bg-surface"
      )}
    >
      {children}
    </li>
  );
}

function ResultMeta({ icon, type, children }: { icon: React.ReactNode; type: string; children?: React.ReactNode }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="inline-flex items-center gap-1 font-medium text-accent-strong">
        {icon}
        {type}
      </span>
      {children}
    </div>
  );
}
