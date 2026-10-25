import path from "node:path";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { VaultSyncCard } from "@/components/dashboard/vault-sync-card";
import { PageEntrance } from "@/components/motion/page-entrance";
import { AnimatedText } from "@/components/motion/animated-text";
import { vaultRoot, kbFolderName } from "@/lib/vault/paths";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
  if (!kb) notFound();

  const vaultPath = path.join(vaultRoot(), kbFolderName(kb.name, kb.id));

  return (
    <PageEntrance className="flex max-w-xl flex-col gap-6">
      <AnimatedText delay={0.16}>
        <SettingsForm
          knowledgeBaseId={id}
          initial={{ name: kb.name, description: kb.description, monitoringFrequency: kb.monitoringFrequency }}
        />
      </AnimatedText>
      <AnimatedText delay={0.3}>
        <VaultSyncCard knowledgeBaseId={id} vaultPath={vaultPath} />
      </AnimatedText>
    </PageEntrance>
  );
}
