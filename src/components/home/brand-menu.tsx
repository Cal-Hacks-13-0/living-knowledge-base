"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Home, Inbox, LogOut, Search, Settings } from "lucide-react";
import { AxionLogo } from "@/components/brand/axion-logo";
import { cn } from "@/lib/utils";

// Same destinations and icons as the sidebar's top nav (components/dashboard/sidebar.tsx),
// collapsed into the brand mark because the homepage has no sidebar.
export function BrandMenu({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Search", icon: Search },
    { href: "/inbox", label: "Inbox", icon: Inbox, badge: inboxCount },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();

    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const elements = itemRefs.current.filter((el): el is HTMLElement => !!el);
    const current = elements.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = (current + 1) % elements.length;
    else if (e.key === "ArrowUp") next = (current - 1 + elements.length) % elements.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = elements.length - 1;
    else if (e.key === "Tab") setOpen(false);
    if (next !== null) {
      e.preventDefault();
      elements[next]?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <AxionLogo className="h-8 w-auto text-foreground" />
        <span className="text-lg font-semibold text-foreground">Axion</span>
        <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Navigation"
          onKeyDown={handleMenuKeyDown}
          className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-card p-1 shadow-md"
        >
          {items.map(({ href, label, icon: Icon, badge }, i) => {
            const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                href={href}
                role="menuitem"
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:bg-surface",
                  active ? "bg-accent-soft text-accent-strong" : "text-foreground hover:bg-surface"
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
                {!!badge && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
          <div role="separator" className="my-1 h-px bg-border" />
          <form action="/api/auth/logout" method="post">
            <button
              ref={(el) => {
                itemRefs.current[items.length] = el;
              }}
              type="submit"
              role="menuitem"
              tabIndex={-1}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-surface focus-visible:bg-surface"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
