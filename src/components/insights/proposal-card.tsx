"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/client/api";
import { formatDateTime } from "@/lib/utils";

export interface ProposalCardData {
  id: string;
  operation: string;
  proposedContent: string;
  status: string;
  createdAt: string | Date;
  targetEntry: { id: string; title: string; summary: string; content: string; status: string } | null;
}

interface ParsedContent {
  previous: { title: string; summary: string; content: string; status: string } | null;
  proposed: { title: string; summary: string; content: string };
  explanation: string;
}

export function ProposalCard({ proposal }: { proposal: ProposalCardData }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  let parsed: ParsedContent | null = null;
  try {
    parsed = JSON.parse(proposal.proposedContent);
  } catch {
    parsed = null;
  }

  async function act(action: "approve" | "reject") {
    setPending(action);
    try {
      await apiPost(`/api/proposals/${proposal.id}/${action}`);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const isResolved = proposal.status !== "PENDING";

  return (
    <Card className={isResolved ? "opacity-60" : undefined}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <Badge variant="warning">{proposal.operation.replace("_", " ")}</Badge>
          <CardTitle className="mt-1 text-base">
            {parsed?.proposed.title ?? proposal.targetEntry?.title ?? "Proposed knowledge update"}
          </CardTitle>
        </div>
        <p className="shrink-0 text-xs text-muted">{formatDateTime(proposal.createdAt)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {parsed?.explanation && <p className="text-sm text-foreground">{parsed.explanation}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Existing</p>
            {parsed?.previous ? (
              <p className="text-sm text-foreground">{parsed.previous.summary}</p>
            ) : (
              <p className="text-sm text-muted">No existing entry (this would create a new one).</p>
            )}
          </div>
          <div className="rounded-lg border border-accent/30 bg-accent-soft p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Proposed</p>
            <p className="text-sm text-foreground">{parsed?.proposed.summary ?? "—"}</p>
          </div>
        </div>

        {isResolved ? (
          <Badge variant="neutral" className="self-start">
            {proposal.status}
          </Badge>
        ) : (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => act("approve")} disabled={pending !== null}>
              {pending === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => act("reject")} disabled={pending !== null}>
              {pending === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
