"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(listener: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", listener);
  return () => mql.removeEventListener("change", listener);
}

/** The OS "reduce motion" setting; `null` during server rendering and hydration. */
export function usePrefersReducedMotion(): boolean | null {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => null);
}
