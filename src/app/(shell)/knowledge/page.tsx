import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { BookOpen, Sparkles } from "lucide-react";

export default async function HomePage() {
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sources: true, entries: true, insights: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Your knowledge vaults</h1>
          <p className="mt-1 text-sm text-muted">
            Single-user local mode — everything here lives in your local SQLite database.
          </p>
        </div>
        <Link href="/new">
          <Button>
            <Sparkles className="h-4 w-4" /> New knowledge vault
          </Button>
        </Link>
      </div>

      {knowledgeBases.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title="No knowledge vaults yet"
          description='Try a goal like "I want to build a knowledge vault about full-stack development," "Research starting a DIY bubble tea business," or "Build a personal freediving knowledge vault."'
          action={
            <Link href="/new">
              <Button variant="secondary">Get started</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {knowledgeBases.map((kb) => (
            <Link key={kb.id} href={`/kb/${kb.id}`}>
              <Card className="h-full transition-colors hover:border-accent/40">
                <CardContent className="flex flex-col gap-2 p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{kb.name}</p>
                    <Badge variant="neutral">{kb.monitoringFrequency}</Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted">{kb.description}</p>
                  <div className="mt-2 flex gap-4 text-xs text-muted">
                    <span>{kb._count.sources} sources</span>
                    <span>{kb._count.entries} entries</span>
                    <span>{kb._count.insights} insights</span>
                    <span>Updated {timeAgo(kb.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
