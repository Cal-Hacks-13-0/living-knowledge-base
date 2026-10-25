import { KbNav } from "./kb-nav";
import { AiAssistantTrigger } from "@/components/assistant/ai-assistant-trigger";
import { AnimatedHeading } from "@/components/motion/animated-heading";
import { AnimatedText } from "@/components/motion/animated-text";

/**
 * KB header + tab nav + page content, with a per-page AI Assistant trigger.
 * The eyebrow/heading/nav here mount once per knowledge vault (this is part
 * of the route's layout, so Next.js only remounts it when `knowledgeBaseId`
 * changes, not on every tab switch) — switching tabs replays the entrance
 * for that tab's own body content instead, see `PageEntrance`.
 */
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
          <AnimatedText as="p" className="text-xs font-medium uppercase tracking-wide text-muted">
            Knowledge vault
          </AnimatedText>
          <AnimatedHeading as="h1" delay={0.08} className="text-xl font-semibold text-foreground">
            {knowledgeBaseName}
          </AnimatedHeading>
        </div>
        <AiAssistantTrigger />
      </div>
      <AnimatedText delay={0.3}>
        <KbNav knowledgeBaseId={knowledgeBaseId} />
      </AnimatedText>
      <div className="pt-6">{children}</div>
    </div>
  );
}
