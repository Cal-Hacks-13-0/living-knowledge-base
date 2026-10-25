"use client";

import { useSyncExternalStore } from "react";

/**
 * The "Cursor trail" preference (the fluid light that follows the pointer on
 * eligible pages). Stored per browser; On unless the user turned it Off.
 * Route eligibility is separate (see components/ambient): creation pages
 * never show the effect but never change this saved value either.
 *
 * During server rendering and hydration the value is unknown (`null`), so
 * nothing starts — or renders a toggle label — until the saved value is read.
 */
const STORAGE_KEY = "axion:cursor-trail";
const listeners = new Set<() => void>();
let current: boolean | null = null;

function read(): boolean {
  if (current !== null) return current;
  try {
    current = localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    current = true;
  }
  return current;
}

export function setCursorTrailEnabled(enabled: boolean) {
  current = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // storage unavailable — keep the in-memory value for this session
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    current = null;
    listener();
  };
  window.addEventListener("storage", onStorage); // keep other tabs in sync
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** `null` until hydrated, then the saved preference (default On). */
export function useCursorTrailEnabled(): boolean | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
