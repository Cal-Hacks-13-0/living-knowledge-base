"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { RevealButton } from "@/components/motion/reveal-button";
import { apiPost, ApiError } from "@/lib/client/api";

export function RunResearchButton({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      // Source-level failures are recorded on the Sources page and in the run
      // history. Keep the overview quiet after a completed/partial run; its
      // refreshed counts and newly generated insights are the user-facing result.
      await apiPost(`/api/knowledge-bases/${knowledgeBaseId}/research`);
      router.refresh();
    } catch (err) {
      const text = err instanceof ApiError ? err.message : "Research run failed to start.";
      setError(text);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <RevealButton delay={0.24}>
        <Button onClick={run} disabled={running} size="sm">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          Run Research Now
        </Button>
      </RevealButton>
      {error && (
        <Alert variant="danger" className="max-w-md">
          <p>{error}</p>
        </Alert>
      )}
    </div>
  );
}
