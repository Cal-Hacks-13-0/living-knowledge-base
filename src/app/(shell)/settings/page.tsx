import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { isAiConfigured } from "@/lib/ai/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { vaultRoot } from "@/lib/vault/paths";

export default async function GlobalSettingsPage() {
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, monitoringFrequency: true },
  });
  const aiConfigured = isAiConfigured();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">App-level configuration. Per-knowledge-base settings live on each KB&apos;s own Settings tab.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>AI configuration</CardTitle>
            <CardDescription>Required for onboarding questions, blueprint generation, and research runs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant={aiConfigured ? "success" : "danger"}>
              {aiConfigured ? "ANTHROPIC_API_KEY configured" : "ANTHROPIC_API_KEY not set"}
            </Badge>
            {!aiConfigured && (
              <p className="mt-2 text-sm text-muted">
                Add <code className="rounded bg-surface px-1 py-0.5">ANTHROPIC_API_KEY</code> to your{" "}
                <code className="rounded bg-surface px-1 py-0.5">.env</code> file and restart the server.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted">
              Single-user local mode — there is no authentication. Everything here lives in your local SQLite
              database (<code className="rounded bg-surface px-1 py-0.5">prisma/dev.db</code>).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Markdown vault</CardTitle>
            <CardDescription>
              A synced, Obsidian-readable folder of every knowledge base — one subfolder per KB, kept up to date
              automatically. Per-KB sync status and a manual resync button live on each KB&apos;s Settings tab.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="break-all rounded-md bg-surface px-2 py-1.5 text-xs text-foreground">{vaultRoot()}</code>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Knowledge bases</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {knowledgeBases.length === 0 ? (
              <p className="text-sm text-muted">No knowledge bases yet.</p>
            ) : (
              knowledgeBases.map((kb) => (
                <Link
                  key={kb.id}
                  href={`/kb/${kb.id}/settings`}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
                >
                  <span className="text-foreground">{kb.name}</span>
                  <Badge variant="neutral">{kb.monitoringFrequency}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
