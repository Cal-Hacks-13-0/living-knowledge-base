"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function KbNav({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const pathname = usePathname();
  const base = `/kb/${knowledgeBaseId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/library`, label: "Vault" },
    { href: `${base}/insights`, label: "Insights" },
    { href: `${base}/sources`, label: "Sources" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = tab.href === base ? pathname === base : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-accent-strong text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
