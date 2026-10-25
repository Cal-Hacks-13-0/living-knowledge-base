"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const LAST_PAGE_KEY = "axion:last-page";

/**
 * Remembers the most recent page outside the new-vault flow (per tab), so the
 * flow's Back button can return to wherever the user started it from.
 */
export function RouteMemory() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/new")) return;
    try {
      sessionStorage.setItem(LAST_PAGE_KEY, pathname);
    } catch {
      // storage unavailable — Back falls back to All Knowledge
    }
  }, [pathname]);
  return null;
}

/**
 * Where the new-vault flow's Back should go: the page the user came from, but
 * never the landing page (`/`) or the sign-in page — those (and "no history")
 * fall back to All Knowledge.
 */
export function newVaultReturnPath(): string {
  try {
    const last = sessionStorage.getItem(LAST_PAGE_KEY);
    if (last && last !== "/" && last !== "/login" && !last.startsWith("/new")) return last;
  } catch {
    // fall through
  }
  return "/knowledge";
}
