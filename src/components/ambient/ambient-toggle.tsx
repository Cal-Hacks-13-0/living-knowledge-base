"use client";

import { cn } from "@/lib/utils";

/**
 * The compact "<label> On/Off" pill used for background-effect switches
 * (Cursor trail in the workspace, 3D motion in the new-vault flow), so every
 * such toggle looks and behaves the same: a `switch` with a lit dot when On.
 */
export function AmbientToggle({
  label,
  enabled,
  onToggle,
  className,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "z-30 flex items-center gap-2 rounded-full border border-white/12 bg-[rgba(24,25,30,0.62)] px-3 py-1.5 text-xs font-medium text-white/85 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.6)] backdrop-blur-md transition-colors hover:bg-[rgba(34,36,42,0.75)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-colors",
          enabled ? "bg-[#ffad60] shadow-[0_0_6px_rgba(255,173,96,0.8)]" : "bg-white/30"
        )}
      />
      {label}
      <span className="text-white/60" aria-hidden>
        {enabled ? "On" : "Off"}
      </span>
    </button>
  );
}
