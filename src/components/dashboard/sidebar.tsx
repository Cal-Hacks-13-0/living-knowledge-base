"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, Search, Inbox, Settings, Plus, Library, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_IDENTITY } from "@/lib/demo-identity";

export interface SidebarKnowledgeBase {
  id: string;
  name: string;
}

// Forest Green sidebar: Paper White text, Original Sage icons, Deep Sage for the selected item.
const navItem = "rounded-lg px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-icon";
const navIdle = "text-sidebar-foreground hover:bg-sidebar-hover";
const navActive = "bg-sidebar-active text-sidebar-foreground";

export function Sidebar({
  knowledgeBases,
  inboxCount,
}: {
  knowledgeBases: SidebarKnowledgeBase[];
  inboxCount: number;
}) {
  const pathname = usePathname();

  const topNav = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Search", icon: Search },
    { href: "/inbox", label: "Inbox", icon: Inbox, badge: inboxCount },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-4">
        <BookOpen className="h-4 w-4 text-sidebar-icon" />
        <span className="text-sm font-semibold">Axion</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {topNav.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("flex items-center justify-between gap-2 font-medium", navItem, active ? navActive : navIdle)}
            >
              <span className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4", active ? "text-sidebar-foreground" : "text-sidebar-icon")} />
                {label}
              </span>
              {!!badge && (
                <span className="rounded-full bg-sidebar-icon px-1.5 py-0.5 text-[10px] font-semibold text-sidebar">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 flex flex-1 flex-col overflow-hidden px-2">
        <div className="px-2.5 pb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Knowledge vaults</span>
        </div>

        <div className="flex flex-col gap-0.5 overflow-y-auto">
          <Link
            href="/knowledge"
            aria-current={pathname === "/knowledge" ? "page" : undefined}
            className={cn("flex items-center gap-2", navItem, pathname === "/knowledge" ? navActive : navIdle)}
          >
            <Library className="h-3.5 w-3.5 shrink-0 text-sidebar-icon" />
            All Knowledge
          </Link>

          {knowledgeBases.map((kb) => {
            const active = pathname?.startsWith(`/kb/${kb.id}`);
            return (
              <Link
                key={kb.id}
                href={`/kb/${kb.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "truncate pl-8",
                  navItem,
                  active ? navActive : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
                )}
                title={kb.name}
              >
                {kb.name}
              </Link>
            );
          })}

          <Link
            href="/new"
            className={cn(
              "flex items-center gap-2 pl-8 text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
              navItem
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            New knowledge vault
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-sidebar-hover px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-xs font-semibold text-sidebar-foreground"
          >
            {DEMO_IDENTITY.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{DEMO_IDENTITY.name}</p>
            <p className="truncate text-xs text-sidebar-muted">{DEMO_IDENTITY.email}</p>
          </div>
        </div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="rounded-md p-1.5 text-sidebar-icon hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-icon"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
