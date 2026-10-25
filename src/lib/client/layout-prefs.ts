"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-browser layout preferences for the app shell: sidebar width / collapsed
 * state and the AI Assistant panel width. Kept in localStorage (a per-viewer
 * convenience — losing it just restores the defaults). The server renders the
 * defaults; the stored values apply right after hydration.
 */
export interface LayoutPrefs {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  assistantWidth: number;
}

export const SIDEBAR_DEFAULT_WIDTH = 256;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;
/** Dragging the sidebar narrower than this closes it. */
export const SIDEBAR_COLLAPSE_AT = 140;
export const ASSISTANT_DEFAULT_WIDTH = 416; // 26rem
export const ASSISTANT_MIN_WIDTH = 320;
/** Same maximum as the sidebar, so neither side column can dominate the page. */
export const ASSISTANT_MAX_WIDTH = SIDEBAR_MAX_WIDTH;

const DEFAULTS: LayoutPrefs = {
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  sidebarCollapsed: false,
  assistantWidth: ASSISTANT_DEFAULT_WIDTH,
};
const STORAGE_KEY = "axion:layout";

let current: LayoutPrefs | null = null;
const listeners = new Set<() => void>();

function load(): LayoutPrefs {
  if (current) return current;
  try {
    const stored: LayoutPrefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
    // Re-clamp in case the limits changed since these were saved.
    current = {
      ...stored,
      sidebarWidth: Math.min(Math.max(stored.sidebarWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH),
      assistantWidth: Math.min(Math.max(stored.assistantWidth, ASSISTANT_MIN_WIDTH), ASSISTANT_MAX_WIDTH),
    };
  } catch {
    current = DEFAULTS;
  }
  return current!;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Updates the preferences; `persist: false` skips the localStorage write (e.g. mid-drag). */
export function setLayoutPrefs(patch: Partial<LayoutPrefs>, { persist = true }: { persist?: boolean } = {}) {
  current = { ...load(), ...patch };
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // storage unavailable (private mode etc.) — keep the in-memory value
    }
  }
  listeners.forEach((l) => l());
}

export function useLayoutPrefs(): LayoutPrefs {
  return useSyncExternalStore(subscribe, load, () => DEFAULTS);
}
