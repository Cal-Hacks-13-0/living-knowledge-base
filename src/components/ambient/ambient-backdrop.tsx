"use client";

import { FluidCursor } from "./fluid-cursor";
import { StarField } from "./star-field";
import { NetworkSphere } from "@/components/home/network-sphere";

/**
 * Background layers for a page region, chosen explicitly by the layout that
 * owns the region (never attached to the whole document):
 *
 * - "fluid": dark charcoal starfield + the white/amber cursor fluid (when the
 *   user's Cursor trail preference is On) + a smoked-glass veil.
 * - "stars": near-black with only small stars, which turn with the cursor
 *   like the landing page's star dome (no network) — used by the new-vault
 *   creation flow; no fluid regardless of the saved preference.
 *
 * Render as the first child of a `relative` region element, before the
 * content (which should sit at z-10 or above). Pair with the `.ambient`
 * class on the region so its content uses the dark glass tokens
 * (globals.css). Everything here is pointer-transparent.
 */
export type AmbientMode = "fluid" | "stars";

export function AmbientBackdrop({
  mode,
  regionRef,
}: {
  mode: AmbientMode;
  regionRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className={mode === "fluid" ? "ambient-charcoal absolute inset-0" : "ambient-night absolute inset-0"} />
      {mode === "fluid" ? <StarField density={2.4} /> : <NetworkSphere showGraph={false} fillParent starBoost={1.45} />}
      {mode === "fluid" && <FluidCursor regionRef={regionRef} />}
      {/* Smoked glass: a faint dark tint over the light — a background layer, never over text. */}
      {mode === "fluid" && <div className="absolute inset-0 bg-[rgba(20,21,26,0.22)]" />}
    </div>
  );
}
