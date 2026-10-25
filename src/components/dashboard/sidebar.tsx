"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, Search, Inbox, Settings, Plus, Library, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarKnowledgeBase {
  id: string;
  name: string;
}

export function Sidebar({
  knowledgeBases,
  inboxCount,
  userEmail,
}: {
  knowledgeBases: SidebarKnowledgeBase[];
  inboxCount: number;
  userEmail?: string;
}) {
  const pathname = usePathname();

  const topNav = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Search", icon: Search },
    { href: "/inbox", label: "Inbox", icon: Inbox, badge: inboxCount },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-white">
      <div className="flex items-center gap-2 px-4 py-4">
        <BookOpen className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold text-foreground">Axion</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {topNav.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-accent-soft text-accent" : "text-foreground hover:bg-surface"
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
      </nav>

      <div className="mt-6 flex flex-1 flex-col overflow-hidden px-2">
        <div className="px-2.5 pb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Knowledge vaults</span>
        </div>

        <div className="flex flex-col gap-0.5 overflow-y-auto">
          <Link
            href="/knowledge"
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
              pathname === "/knowledge" ? "bg-accent-soft text-accent" : "text-foreground hover:bg-surface"
            )}
          >
            <Library className="h-3.5 w-3.5 shrink-0 text-muted" />
            All Knowledge
          </Link>

          {knowledgeBases.map((kb) => {
            const active = pathname?.startsWith(`/kb/${kb.id}`);
            return (
              <Link
                key={kb.id}
                href={`/kb/${kb.id}`}
                className={cn(
                  "truncate rounded-lg px-2.5 py-1.5 pl-8 text-sm transition-colors",
                  active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface hover:text-foreground"
                )}
                title={kb.name}
              >
                {kb.name}
              </Link>
            );
          })}

          <Link
            href="/new"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 pl-8 text-sm text-muted hover:bg-surface hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New knowledge vault
          </Link>
        </div>
      </div>

      {userEmail && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{userEmail.split("@")[0]}</p>
            <p className="truncate text-xs text-muted">{userEmail}</p>
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
