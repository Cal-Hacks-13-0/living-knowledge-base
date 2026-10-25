"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Chip({
  selected,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        selected
          ? "border-accent-strong bg-accent-soft text-accent-strong"
          : "border-border bg-white text-foreground hover:bg-surface",
        className
      )}
      {...props}
    />
  );
}
