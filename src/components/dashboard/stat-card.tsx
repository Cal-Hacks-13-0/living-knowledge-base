import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "warning" | "success";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold text-foreground",
          tone === "warning" && "text-amber-600",
          tone === "success" && "text-emerald-600"
        )}
      >
        {value}
      </p>
    </Card>
  );
}
