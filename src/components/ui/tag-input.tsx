"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Chips + free-text entry. Supports a fixed list of suggested options (click
 * to toggle) plus arbitrary custom values typed and confirmed with
 * Enter/comma — used for things like "technologies you're interested in"
 * where the AI-suggested list is a starting point, not a closed set.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Type and press Enter…",
  className,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState("");

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  const unselectedSuggestions = suggestions.filter((s) => !value.includes(s));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-accent/30">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-sm text-accent"
          >
            {tag}
            <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(draft)}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-32 flex-1 border-0 bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted"
        />
      </div>
      {unselectedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unselectedSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted hover:border-accent/40 hover:text-accent"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
