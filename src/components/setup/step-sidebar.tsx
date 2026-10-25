import Link from "next/link";
import { Check } from "lucide-react";
import { AxionLogo } from "@/components/brand/axion-logo";
import { cn } from "@/lib/utils";

export interface WizardStep {
  key: string;
  label: string;
}

export function StepSidebar({ steps, currentIndex }: { steps: WizardStep[]; currentIndex: number }) {
  return (
    <aside className="chrome-glass-clear relative z-10 flex h-full w-64 shrink-0 flex-col px-4 py-5">
      <Link href="/" className="mb-8 flex items-center gap-2 text-sm font-semibold text-foreground">
        <AxionLogo className="h-6 w-auto text-foreground" />
        Axion
      </Link>
      <nav className="flex flex-col gap-1">
        {steps.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "upcoming";
          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                state === "active" && "bg-accent-soft font-medium text-accent-strong",
                state === "upcoming" && "text-muted",
                state === "done" && "text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                  state === "active" && "bg-accent text-accent-foreground",
                  state === "done" && "bg-accent/15 text-accent-strong",
                  state === "upcoming" && "bg-surface text-muted"
                )}
              >
                {state === "done" ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              {step.label}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
