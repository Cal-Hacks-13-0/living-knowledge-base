"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Remount boundary for a page body's entrance choreography. Keying on the
 * route means navigating to a new page (or a new major section, e.g. a
 * different knowledge vault) always replays the reveal, while in-place state
 * updates inside the page (typing in a search box, toggling a filter) never
 * do — those re-render this same mounted instance, which Motion's `initial`
 * animations don't repeat for.
 */
export function PageEntrance({ children, className }: { children: React.ReactNode; className?: string }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={cn(className)}>
      {children}
    </div>
  );
}
