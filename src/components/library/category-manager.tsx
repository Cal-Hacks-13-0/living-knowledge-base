"use client";

import { useState } from "react";
import { Plus, Trash2, Layers, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { RowItem } from "@/components/ui/row-item";
import { Badge } from "@/components/ui/badge";
import { apiPost, apiDelete, ApiError } from "@/lib/client/api";

export interface ManagedCategory {
  id: string;
  name: string;
  description: string;
  _count: { entries: number };
}

export function CategoryManager({
  knowledgeBaseId,
  categories,
  onChanged,
}: {
  knowledgeBaseId: string;
  categories: ManagedCategory[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await apiPost(`/api/knowledge-bases/${knowledgeBaseId}/categories`, {
        name: name.trim(),
        description: description.trim(),
      });
      setName("");
      setDescription("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add category.");
    } finally {
      setAdding(false);
    }
  }

  async function deleteCategory(categoryId: string) {
    setDeletingId(categoryId);
    setError(null);
    try {
      await apiDelete(`/api/knowledge-bases/${knowledgeBaseId}/categories/${categoryId}`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete category.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-foreground"
      >
        <span className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted" /> Manage categories
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border p-4">
          {error && <Alert variant="danger">{error}</Alert>}

          {categories.length === 0 ? (
            <p className="text-sm text-muted">No categories yet — add one below.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {categories.map((c) => (
                <RowItem
                  key={c.id}
                  title={c.name}
                  subtitle={c.description || undefined}
                  trailing={
                    <>
                      <Badge variant="neutral">{c._count.entries}</Badge>
                      <button
                        type="button"
                        onClick={() => deleteCategory(c.id)}
                        disabled={deletingId === c.id}
                        aria-label={`Delete ${c.name}`}
                        className="rounded-md p-1 text-muted hover:bg-surface hover:text-red-600 disabled:opacity-50"
                      >
                        {deletingId === c.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          )}

          <form onSubmit={addCategory} className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Input
              placeholder="New category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-48"
            />
            <Textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={1}
              className="min-h-9 flex-1"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={adding || !name.trim()}>
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
