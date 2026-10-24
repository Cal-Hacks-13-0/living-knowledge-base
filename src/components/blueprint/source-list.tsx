"use client";

import { useState } from "react";
import { Plus, Trash2, Rss, GitFork, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RowItem } from "@/components/ui/row-item";
import type { BlueprintSource } from "@/lib/ai/schemas";

const TYPE_ICON: Record<BlueprintSource["type"], React.ReactNode> = {
  RSS: <Rss className="h-4 w-4" />,
  GITHUB_RELEASES: <GitFork className="h-4 w-4" />,
  HTML: <Globe className="h-4 w-4" />,
};

export function SourceList({
  sources,
  onChange,
}: {
  sources: BlueprintSource[];
  onChange: (sources: BlueprintSource[]) => void;
}) {
  const [draft, setDraft] = useState<{ name: string; url: string; type: BlueprintSource["type"] }>({
    name: "",
    url: "",
    type: "RSS",
  });
  const [addError, setAddError] = useState<string | null>(null);

  function removeSource(index: number) {
    onChange(sources.filter((_, i) => i !== index));
  }

  function addSource() {
    setAddError(null);
    if (!draft.name.trim() || !draft.url.trim()) {
      setAddError("Name and URL are required.");
      return;
    }
    try {
      const url = new URL(draft.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      setAddError("Enter a valid http(s) URL.");
      return;
    }
    onChange([
      ...sources,
      { name: draft.name.trim(), url: draft.url.trim(), type: draft.type, verified: false, rationale: "Added manually by you." },
    ]);
    setDraft({ name: "", url: "", type: "RSS" });
  }

  return (
    <div className="flex flex-col gap-2">
      {sources.map((source, index) => (
        <RowItem
          key={`${source.url}-${index}`}
          icon={TYPE_ICON[source.type]}
          title={source.name}
          subtitle={source.url}
          trailing={
            <button
              type="button"
              onClick={() => removeSource(index)}
              className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground"
              aria-label={`Remove ${source.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          }
        />
      ))}

      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="mb-2 text-xs font-medium text-muted">Add a custom RSS feed, GitHub repo, or URL</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Source name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-40"
          />
          <Input
            placeholder="https://…"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            className="min-w-56 flex-1"
          />
          <Select
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as BlueprintSource["type"] })}
            className="w-40"
          >
            <option value="RSS">RSS feed</option>
            <option value="GITHUB_RELEASES">GitHub releases</option>
            <option value="HTML">HTML page</option>
          </Select>
          <Button type="button" variant="secondary" onClick={addSource}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {addError && <p className="mt-2 text-xs text-red-600">{addError}</p>}
      </div>
    </div>
  );
}
