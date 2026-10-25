import { KbNav } from "./kb-nav";
import { AiAssistantTrigger } from "@/components/assistant/ai-assistant-trigger";

/** KB header + tab nav + page content, with a per-page AI Assistant trigger. */
export function KbWorkspace({
  knowledgeBaseId,
  knowledgeBaseName,
  children,
}: {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Knowledge base</p>
          <h1 className="text-xl font-semibold text-foreground">{knowledgeBaseName}</h1>
        </div>
        <AiAssistantTrigger />
      </div>
      <KbNav knowledgeBaseId={knowledgeBaseId} />
      <div className="pt-6">{children}</div>
    </div>
  );
}
