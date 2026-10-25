"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { RevealButton } from "@/components/motion/reveal-button";
import { apiPost, ApiError } from "@/lib/client/api";

export function AddSourceForm({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<"RSS" | "GITHUB_RELEASES" | "HTML">("RSS");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiPost(`/api/knowledge-bases/${knowledgeBaseId}/sources`, { name, url, type });
      setName("");
      setUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add source.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-dashed border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted">Add a source to monitor</p>
      {error && (
        <Alert variant="danger" className="mb-2">
          {error}
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-40" required />
        <Input
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-56 flex-1"
          required
        />
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-40">
          <option value="RSS">RSS feed</option>
          <option value="GITHUB_RELEASES">GitHub releases</option>
          <option value="HTML">HTML page</option>
        </Select>
        <RevealButton delay={0.4}>
          <Button type="submit" variant="secondary" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </RevealButton>
      </div>
    </form>
  );
}
