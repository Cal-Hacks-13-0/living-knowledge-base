"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2, FolderTree } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { apiPost, ApiError } from "@/lib/client/api";

export function VaultSyncCard({ knowledgeBaseId, vaultPath }: { knowledgeBaseId: string; vaultPath: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function resync() {
    setSyncing(true);
    setMessage(null);
    try {
      await apiPost(`/api/knowledge-bases/${knowledgeBaseId}/vault/sync`);
      setMessage({ kind: "success", text: "Vault re-synced." });
      router.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Sync failed." });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-accent-ink" /> Markdown vault
        </CardTitle>
        <CardDescription>
          Every entry, insight, source, and proposal is also kept as plain Markdown files on disk — open it in
          Obsidian or point any other file-based agent at it. It re-syncs automatically after research runs,
          approvals, and edits.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {message && <Alert variant={message.kind === "error" ? "danger" : "default"}>{message.text}</Alert>}
        <code className="break-all rounded-md bg-surface px-2 py-1.5 text-xs text-foreground">{vaultPath}</code>
        <Button variant="secondary" size="sm" onClick={resync} disabled={syncing} className="self-start">
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Re-sync now
        </Button>
      </CardContent>
    </Card>
  );
}
