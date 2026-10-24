import { prisma } from "@/lib/db/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AddSourceForm } from "@/components/sources/add-source-form";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { Radio } from "lucide-react";

export default async function SourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sources = await prisma.source.findMany({
    where: { knowledgeBaseId: id },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { documents: true } } },
  });

  return (
    <div className="flex flex-col gap-5">
      {sources.length === 0 ? (
        <EmptyState icon={<Radio className="h-5 w-5" />} title="No sources tracked yet" />
      ) : (
        <div className="flex flex-col gap-3">
          {sources.map((source) => (
            <Card key={source.id}>
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{source.name}</p>
                    <Badge variant="neutral">{source.type.replace("_", " ")}</Badge>
                    {source.status !== "ERROR" && (
                      <Badge variant={source.status === "ACTIVE" ? "success" : "neutral"}>{source.status}</Badge>
                    )}
                  </div>
                  <p className="break-all text-xs text-muted">{source.url}</p>
                  <p className="mt-1 text-xs text-muted">
                    {source._count.documents} document(s) stored · last checked{" "}
                    {source.lastCheckedAt ? timeAgo(source.lastCheckedAt) : "never"}
                    {source.lastSuccessfulFetchAt &&
                      ` · last success ${formatDateTime(source.lastSuccessfulFetchAt)}`}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddSourceForm knowledgeBaseId={id} />
    </div>
  );
}
