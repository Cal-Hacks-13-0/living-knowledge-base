"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { apiDelete, ApiError } from "@/lib/client/api";

/**
 * Permanently deletes the vault. Deletion can't be undone, so it takes two
 * steps: reveal the confirmation, then type the vault's exact name.
 */
export function DeleteVaultCard({ knowledgeBaseId, name }: { knowledgeBaseId: string; name: string }) {
  const router = useRouter();
  const inputId = useId();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim() === name.trim();

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await apiDelete(`/api/knowledge-bases/${knowledgeBaseId}`);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete this vault. Try again.");
      setDeleting(false);
    }
  }

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700">
          <Trash2 className="h-4 w-4" /> Delete vault
        </CardTitle>
        <CardDescription>
          Permanently deletes this knowledge vault with all of its entries, sources, insights, proposed changes,
          research history, Inbox updates, and Markdown export. This can&apos;t be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <Alert variant="danger">{error}</Alert>}
        {!confirming ? (
          <Button variant="destructive" className="w-fit" onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4" /> Delete vault
          </Button>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (matches && !deleting) remove();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={inputId}>
                Type <span className="font-semibold text-foreground">{name}</span> to confirm
              </Label>
              <Input
                id={inputId}
                autoFocus
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={deleting}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" disabled={!matches || deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Permanently delete
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={deleting}
                onClick={() => {
                  setConfirming(false);
                  setTyped("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
