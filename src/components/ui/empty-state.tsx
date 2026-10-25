import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-12 text-center", className)}>
      {icon && (
        // A small "node" badge — Axion's knowledge-network motif, restrained
        // for an empty state: a quiet circle for the icon, one orange dot
        // standing in for a single not-yet-connected node.
        <div className="relative mb-1 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-muted">
          {icon}
          <span aria-hidden className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
