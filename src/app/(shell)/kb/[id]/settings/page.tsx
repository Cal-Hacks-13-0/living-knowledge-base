import path from "node:path";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { VaultSyncCard } from "@/components/dashboard/vault-sync-card";
import { vaultRoot, kbFolderName } from "@/lib/vault/paths";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
  if (!kb) notFound();

  const vaultPath = path.join(vaultRoot(), kbFolderName(kb.name, kb.id));

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <SettingsForm
        knowledgeBaseId={id}
        initial={{ name: kb.name, description: kb.description, monitoringFrequency: kb.monitoringFrequency }}
      />
      <VaultSyncCard knowledgeBaseId={id} vaultPath={vaultPath} />
    </div>
  );
}
