"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, X, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiPatch } from "@/lib/client/api";
import { formatDateTime } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  NEW_DISCOVERY: "New discovery",
  KNOWLEDGE_EXTENSION: "Extension",
  CONTRADICTION: "Contradiction",
  OUTDATED_INFORMATION: "Outdated information",
  ACTIONABLE_OPPORTUNITY: "Actionable opportunity",
};

const TYPE_TONE: Record<string, "default" | "warning" | "danger" | "success"> = {
  NEW_DISCOVERY: "default",
  KNOWLEDGE_EXTENSION: "success",
  CONTRADICTION: "danger",
  OUTDATED_INFORMATION: "warning",
  ACTIONABLE_OPPORTUNITY: "success",
};

export interface InsightCardData {
  id: string;
  title: string;
  type: string;
  summary: string;
  whyItMatters: string;
  recommendedAction: string;
  confidence: number;
  status: string;
  createdAt: string | Date;
  evidence: Array<{
    id: string;
    explanation: string;
    sourceDocument: { id: string; title: string; url: string } | null;
    knowledgeEntry: { id: string; title: string } | null;
  }>;
}

export function InsightCard({ insight }: { insight: InsightCardData }) {
  const router = useRouter();
  const [pending, setPending] = useState<"SAVED" | "DISMISSED" | null>(null);

  async function setStatus(status: "SAVED" | "DISMISSED") {
    setPending(status);
    try {
      await apiPatch(`/api/insights/${insight.id}`, { status });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const isResolved = insight.status === "SAVED" || insight.status === "DISMISSED";

  return (
    <Card className={isResolved ? "opacity-60" : undefined}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant={TYPE_TONE[insight.type] ?? "default"}>{TYPE_LABEL[insight.type] ?? insight.type}</Badge>
            <Badge variant="neutral">{Math.round(insight.confidence * 100)}% confidence</Badge>
            {isResolved && <Badge variant="neutral">{insight.status}</Badge>}
          </div>
          <CardTitle className="text-base">{insight.title}</CardTitle>
        </div>
        <p className="shrink-0 text-xs text-muted">{formatDateTime(insight.createdAt)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-foreground">{insight.summary}</p>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Why it matters</p>
          <p className="text-sm text-foreground">{insight.whyItMatters}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recommended action</p>
          <p className="text-sm text-foreground">{insight.recommendedAction}</p>
        </div>

        {insight.evidence.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sources</p>
            <ul className="mt-1 flex flex-col gap-1">
              {insight.evidence.map((e) => (
                <li key={e.id} className="text-xs">
                  {e.sourceDocument ? (
                    <a
                      href={e.sourceDocument.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-accent-ink hover:underline"
                    >
                      {e.sourceDocument.title} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted">Evidence unavailable</span>
                  )}
                  {e.knowledgeEntry && (
                    <span className="text-muted"> — relates to &ldquo;{e.knowledgeEntry.title}&rdquo;</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isResolved && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => setStatus("SAVED")} disabled={pending !== null}>
              {pending === "SAVED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus("DISMISSED")} disabled={pending !== null}>
              {pending === "DISMISSED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
