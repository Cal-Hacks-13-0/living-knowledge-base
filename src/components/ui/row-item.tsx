import * as React from "react";
import { cn } from "@/lib/utils";

export function RowItem({
  icon,
  title,
  subtitle,
  trailing,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </div>
  );
}
