"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { apiPost, ApiError } from "@/lib/client/api";

export function RunResearchButton({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function run() {
    setRunning(true);
    setMessage(null);
    try {
      const result = await apiPost<{ status: string; documentsFetched: number; documentsProcessed: number; insightsGenerated: number; errorMessage: string | null }>(
        `/api/knowledge-bases/${knowledgeBaseId}/research`
      );
      setMessage({
        kind: result.status === "FAILED" ? "error" : "success",
        // Keep this friendly — raw per-source fetch errors live on the
        // Sources tab for anyone who wants that detail, not surfaced here.
        text: `Run ${result.status.toLowerCase()} — fetched ${result.documentsFetched}, processed ${result.documentsProcessed}, generated ${result.insightsGenerated} insight(s).`,
      });
      router.refresh();
    } catch (err) {
      const text = err instanceof ApiError ? err.message : "Research run failed to start.";
      setMessage({ kind: "error", text });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={run} disabled={running} size="sm">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
        Run Research Now
      </Button>
      {message && (
        <Alert variant={message.kind === "error" ? "danger" : "default"} className="max-w-md">
          {message.text}
        </Alert>
      )}
    </div>
  );
}
