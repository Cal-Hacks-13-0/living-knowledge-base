import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export interface EntryCardData {
  id: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  category: { id: string; name: string } | null;
  sourceDocument: { id: string; url: string; title: string } | null;
  insightEvidence: Array<{ insight: { id: string; title: string } | null }>;
}

export function EntryCard({ entry }: { entry: EntryCardData }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {entry.category && <Badge variant="neutral">{entry.category.name}</Badge>}
            <Badge variant={entry.status === "VERIFIED" ? "success" : entry.status === "OUTDATED" ? "warning" : "neutral"}>
              {entry.status}
            </Badge>
          </div>
          <CardTitle className="text-base">{entry.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-foreground">{entry.summary}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>Created {formatDate(entry.createdAt)}</span>
          <span>Updated {formatDate(entry.updatedAt)}</span>
          {entry.sourceDocument && (
            <a href={entry.sourceDocument.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
              Source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {entry.insightEvidence.length > 0 && (
          <p className="text-xs text-muted">
            Related insight: {entry.insightEvidence.map((e) => e.insight?.title).filter(Boolean).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
