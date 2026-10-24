import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { SettingsForm } from "@/components/dashboard/settings-form";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
  if (!kb) notFound();

  return (
    <SettingsForm
      knowledgeBaseId={id}
      initial={{ name: kb.name, description: kb.description, monitoringFrequency: kb.monitoringFrequency }}
    />
  );
}
