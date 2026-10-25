"use client";

import { setCursorTrailEnabled, useCursorTrailEnabled } from "@/lib/client/cursor-trail";
import { AmbientToggle } from "./ambient-toggle";

/**
 * The single "Cursor trail On/Off" pill (bottom-right of the main content
 * area on fluid pages). Renders nothing until the saved preference has been
 * read, so it never flashes the wrong state.
 */
export function CursorTrailToggle({ className }: { className?: string }) {
  const enabled = useCursorTrailEnabled();
  if (enabled === null) return null;
  return (
    <AmbientToggle
      label="Cursor trail"
      enabled={enabled}
      onToggle={() => setCursorTrailEnabled(!enabled)}
      className={className}
    />
  );
}
