"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Full-stack development",
  "Bubble tea business",
  "Freediving",
  "AI research",
];

const EXAMPLE_GOALS: Record<string, string> = {
  "Full-stack development": "I want to build a knowledge base about full-stack development.",
  "Bubble tea business": "I want to research starting a DIY bubble tea business.",
  Freediving: "I want to build a personal freediving knowledge base.",
  "AI research": "I want to track the latest AI research and model releases.",
};

export function HomeHero({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [goal, setGoal] = useState("");

  function submit(text: string) {
    const value = text.trim();
    if (!value) return;
    router.push(`/new?goal=${encodeURIComponent(value)}`);
  }

  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "gap-3" : "gap-5 py-6")}>
      <h1 className={cn("font-semibold text-foreground text-balance", compact ? "text-xl" : "text-3xl")}>
        Build a living knowledge base with AI
      </h1>
      {!compact && (
        <p className="max-w-lg text-sm text-muted">
          Tell us what you want to learn, track, or build. Our AI will help you set up a
          personalized knowledge base and keep it up to date.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(goal);
        }}
        className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-border bg-white p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-accent/30"
      >
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. I want to learn full-stack development, or I want to research starting a bubble tea business"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Start"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-40"
          disabled={!goal.trim()}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs text-muted">Try an example:</span>
        {EXAMPLES.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => submit(EXAMPLE_GOALS[label])}
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted hover:bg-white hover:text-foreground"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
