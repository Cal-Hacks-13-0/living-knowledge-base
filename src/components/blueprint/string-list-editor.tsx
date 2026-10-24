"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function StringListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  function update(index: number, value: string) {
    const next = items.slice();
    next[index] = value;
    onChange(next);
  }
  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input value={item} onChange={(e) => update(index, e.target.value)} />
          <button type="button" onClick={() => remove(index)} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button variant="link" size="sm" type="button" onClick={() => onChange([...items, ""])} className="self-start px-0">
        <Plus className="h-3.5 w-3.5" /> {placeholder ?? "Add item"}
      </Button>
    </div>
  );
}
