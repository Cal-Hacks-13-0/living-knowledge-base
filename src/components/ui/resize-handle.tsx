"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A vertical drag handle for resizing a panel's width. `edge` is the side of
 * the panel the handle sits on: dragging a "right" handle rightwards grows
 * the panel, dragging a "left" handle leftwards grows it. Also operable from
 * the keyboard (←/→ in 16px steps) as an ARIA window splitter.
 *
 * `onResize` receives the proposed width (unclamped) while dragging;
 * `onResizeEnd` fires when the drag or key press finishes.
 */
export function ResizeHandle({
  edge,
  width,
  min,
  max,
  label,
  onResize,
  onResizeEnd,
  onDraggingChange,
  className,
}: {
  edge: "left" | "right";
  width: number;
  min: number;
  max: number;
  label: string;
  onResize: (width: number) => void;
  onResizeEnd?: () => void;
  onDraggingChange?: (dragging: boolean) => void;
  className?: string;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const direction = edge === "right" ? 1 : -1;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
        onDraggingChange?.(true);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onResize(start.current.width + (e.clientX - start.current.x) * direction);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onDraggingChange?.(false);
        onResizeEnd?.();
      }}
      onPointerCancel={() => {
        if (!start.current) return;
        start.current = null;
        onDraggingChange?.(false);
        onResizeEnd?.();
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        let next: number | null = null;
        if (e.key === "ArrowLeft") next = width - step * direction;
        else if (e.key === "ArrowRight") next = width + step * direction;
        if (next === null) return;
        e.preventDefault();
        onResize(next);
        onResizeEnd?.();
      }}
      className={cn(
        "group absolute top-0 z-30 h-full w-2 cursor-col-resize touch-none outline-none",
        edge === "right" ? "-right-1" : "-left-1",
        className
      )}
    >
      {/* Thin line that shows on hover/focus/drag, so the edge reads as grabbable. */}
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover:bg-accent/60 group-focus-visible:bg-accent group-active:bg-accent" />
    </div>
  );
}
