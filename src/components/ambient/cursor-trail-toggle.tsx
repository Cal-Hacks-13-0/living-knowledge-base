"use client";

import { setCursorTrailEnabled, useCursorTrailEnabled } from "@/lib/client/cursor-trail";
import { cn } from "@/lib/utils";

/**
 * The single "Cursor trail On/Off" pill (bottom-right of the main content
 * area on fluid pages). Renders nothing until the saved preference has been
 * read, so it never flashes the wrong state.
 */
export function CursorTrailToggle({ className }: { className?: string }) {
  const enabled = useCursorTrailEnabled();
  if (enabled === null) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Cursor trail"
      onClick={() => setCursorTrailEnabled(!enabled)}
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
      Cursor trail
      <span className="text-white/60" aria-hidden>
        {enabled ? "On" : "Off"}
      </span>
    </button>
  );
}
