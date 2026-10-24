import * as React from "react";
import { cn } from "@/lib/utils";

export function Alert({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "danger" | "warning" }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        variant === "danger" && "border-red-200 bg-red-50 text-red-700",
        variant === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
        variant === "default" && "border-border bg-surface text-foreground",
        className
      )}
      {...props}
    />
  );
}
