"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ExternalLink, Info, Loader2, Pencil, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPatch, apiPost, ApiError } from "@/lib/client/api";
import { explainSourceError, sourceProblemLabel, type SourceErrorExplanation } from "@/lib/research/source-errors";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

export interface SourceCardData {
  id: string;
  name: string;
  url: string;
  type: string;
  status: string;
  lastError: string | null;
  lastCheckedAt: string | Date | null;
  lastSuccessfulFetchAt: string | Date | null;
  documentCount: number;
}

/** Items from this source that the last research run fetched but couldn't process. */
export interface ProcessingIssue {
  count: number;
  detail: string;
}

const isWebAddress = (url: string) => /^https?:\/\//i.test(url);

export function SourceCard({
  knowledgeBaseId,
  source,
  processingIssue,
}: {
  knowledgeBaseId: string;
  source: SourceCardData;
  processingIssue?: ProcessingIssue | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState(source.url);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const problem: SourceErrorExplanation | null = source.status === "ERROR" ? explainSourceError(source.lastError) : null;
  const processing = !problem && processingIssue ? explainSourceError(processingIssue.detail) : null;

  async function checkAgain() {
    setBusy("check");
    setActionError(null);
    setNotice(null);
    try {
      const result = await apiPost<{ reachable: boolean; itemCount: number; source: { lastError: string | null } }>(
        `/api/knowledge-bases/${knowledgeBaseId}/sources/${source.id}/check`
      );
      setNotice(
        result.reachable
          ? `Checked just now — Axion can read this source (${result.itemCount} item${result.itemCount === 1 ? "" : "s"} found). New items are added on the next research run.`
          : `Checked just now — still not working: ${explainSourceError(result.source.lastError).title.toLowerCase()}.`
      );
      router.refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't run the check. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveUrl(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setActionError(null);
    setNotice(null);
    try {
      await apiPatch(`/api/knowledge-bases/${knowledgeBaseId}/sources/${source.id}`, { url: draftUrl.trim() });
      setEditing(false);
      await checkAgain(); // see straight away whether the new address works
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't save the address.");
      setBusy(null);
    }
  }

  const actions = new Set(problem?.actions ?? []);

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{source.name}</p>
          <Badge variant="neutral">{source.type.replace("_", " ")}</Badge>
          {problem ? (
            <Badge variant={problem.stage === "access" ? "danger" : "warning"}>{sourceProblemLabel(problem.stage)}</Badge>
          ) : (
            <Badge variant={source.status === "ACTIVE" ? "success" : "neutral"}>{source.status}</Badge>
          )}
        </div>
        <p className="break-all text-xs text-muted">{source.url}</p>
        <p className="text-xs text-muted">
          {source.documentCount} document(s) stored · last checked {source.lastCheckedAt ? timeAgo(source.lastCheckedAt) : "never"}
          {source.lastSuccessfulFetchAt && ` · last success ${formatDateTime(source.lastSuccessfulFetchAt)}`}
        </p>

        {problem && (
          <Explanation explanation={problem} tone={problem.stage === "access" ? "danger" : "warning"}>
            {(actions.size > 0 || isWebAddress(source.url)) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {actions.has("retry") && (
                  <Button type="button" size="sm" variant="secondary" onClick={checkAgain} disabled={busy !== null}>
                    {busy === "check" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Check again
                  </Button>
                )}
                {actions.has("edit_url") && !editing && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={busy !== null}>
                    <Pencil className="h-3.5 w-3.5" /> Edit address
                  </Button>
                )}
                {actions.has("open_site") && isWebAddress(source.url) && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    Open website <ExternalLink className="h-3 w-3" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </div>
            )}
          </Explanation>
        )}

        {processing && processingIssue && (
          <Explanation
            explanation={{
              ...processing,
              message: `Axion reached this source, but couldn't process ${processingIssue.count} new item${processingIssue.count === 1 ? "" : "s"} from it in the last research run. The source itself is working.`,
            }}
            tone="info"
          />
        )}

        {editing && (
          <form onSubmit={saveUrl} className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor={`url-${source.id}`} className="sr-only">
              New address for {source.name}
            </label>
            <Input
              id={`url-${source.id}`}
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://…"
              className="min-w-0 flex-1 basis-64"
              required
              autoFocus
            />
            <Button type="submit" size="sm" disabled={busy !== null || !draftUrl.trim()}>
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save and check
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraftUrl(source.url);
              }}
            >
              Cancel
            </Button>
          </form>
        )}

        <div aria-live="polite">
          {notice && <p className="mt-1 text-xs text-muted">{notice}</p>}
          {actionError && <p className="mt-1 text-xs text-red-600">{actionError}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function Explanation({
  explanation,
  tone,
  children,
}: {
  explanation: SourceErrorExplanation;
  tone: "danger" | "warning" | "info";
  children?: React.ReactNode;
}) {
  const Icon = tone === "info" ? Info : AlertCircle;
  return (
    <div
      className={cn(
        "mt-2 rounded-lg border px-3 py-2.5",
        tone === "danger" && "border-red-200 bg-red-50",
        tone === "warning" && "border-amber-200 bg-amber-50",
        tone === "info" && "border-border bg-surface"
      )}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Icon
          aria-hidden
          className={cn("h-4 w-4 shrink-0", tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-700" : "text-muted")}
        />
        {explanation.title}
        {explanation.temporary && tone !== "info" && <span className="text-xs font-normal text-muted">· usually temporary</span>}
      </p>
      <p className="mt-1 text-sm text-foreground/85">{explanation.message}</p>
      {explanation.nextStep && <p className="mt-1 text-xs text-muted">What you can do: {explanation.nextStep}</p>}
      {children}
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          Technical details
        </summary>
        <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">{explanation.technical}</p>
        {explanation.httpStatus && <p className="mt-1">HTTP status: {explanation.httpStatus}</p>}
      </details>
    </div>
  );
}
