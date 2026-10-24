"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, X, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RowItem } from "@/components/ui/row-item";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { BlueprintCategory } from "@/lib/ai/schemas";

export function CategoryList({
  categories,
  onChange,
}: {
  categories: BlueprintCategory[];
  onChange: (categories: BlueprintCategory[]) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  function updateCategory(index: number, patch: Partial<BlueprintCategory>) {
    const next = categories.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function removeCategory(index: number) {
    onChange(categories.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  }

  function addCategory() {
    onChange([...categories, { name: "New category", description: "", subtopics: [] }]);
    setEditingIndex(categories.length);
  }

  function addSubtopic(index: number) {
    const next = categories.slice();
    next[index] = {
      ...next[index],
      subtopics: [...next[index].subtopics, { name: "New subtopic", description: "" }],
    };
    onChange(next);
  }

  function updateSubtopic(catIndex: number, subIndex: number, name: string) {
    const next = categories.slice();
    const subtopics = next[catIndex].subtopics.slice();
    subtopics[subIndex] = { ...subtopics[subIndex], name };
    next[catIndex] = { ...next[catIndex], subtopics };
    onChange(next);
  }

  function removeSubtopic(catIndex: number, subIndex: number) {
    const next = categories.slice();
    next[catIndex] = {
      ...next[catIndex],
      subtopics: next[catIndex].subtopics.filter((_, i) => i !== subIndex),
    };
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      {categories.map((category, index) => (
        <div key={index} className="rounded-lg border border-border">
          {editingIndex === index ? (
            <div className="flex flex-col gap-2 p-3">
              <Input
                value={category.name}
                onChange={(e) => updateCategory(index, { name: e.target.value })}
                className="font-medium"
                autoFocus
              />
              <Textarea
                value={category.description}
                onChange={(e) => updateCategory(index, { description: e.target.value })}
                placeholder="Description"
                rows={2}
              />
              <Button size="sm" variant="secondary" onClick={() => setEditingIndex(null)} className="self-end">
                Done
              </Button>
            </div>
          ) : (
            <RowItem
              className="border-0"
              icon={<Layers className="h-4 w-4" />}
              title={category.name}
              subtitle={category.description || `${category.subtopics.length} subtopic(s)`}
              trailing={
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <button type="button" className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setEditingIndex(index)}>
                      <Pencil className="h-3.5 w-3.5" /> Rename / edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => addSubtopic(index)}>
                      <Plus className="h-3.5 w-3.5" /> Add subtopic
                    </DropdownMenuItem>
                    <DropdownMenuItem destructive onSelect={() => removeCategory(index)}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete category
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          )}

          {category.subtopics.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2 pl-10">
              {category.subtopics.map((sub, subIndex) => (
                <div key={subIndex} className="flex items-center gap-2">
                  <span className="text-muted">·</span>
                  <Input
                    value={sub.name}
                    onChange={(e) => updateSubtopic(index, subIndex, e.target.value)}
                    className="h-7 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeSubtopic(index, subIndex)}
                    className="text-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <Button variant="secondary" type="button" onClick={addCategory} className="self-start">
        <Plus className="h-4 w-4" /> Add category
      </Button>
    </div>
  );
}
