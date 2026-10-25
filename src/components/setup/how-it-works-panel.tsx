import { MessageCircle, Sparkles, CheckCircle2, Radar } from "lucide-react";

const STEPS = [
  { icon: MessageCircle, text: "Answer a few questions" },
  { icon: Sparkles, text: "AI generates your knowledge structure" },
  { icon: CheckCircle2, text: "Review and customize" },
  { icon: Radar, text: "Start tracking and get insights" },
];

export function HowItWorksPanel() {
  return (
    <aside className="chrome-glass-clear relative z-10 hidden w-72 shrink-0 flex-col gap-4 px-6 py-10 lg:flex">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">How this works</p>
      <ol className="flex flex-col gap-4">
        {STEPS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="pt-1 text-sm text-foreground">{text}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
