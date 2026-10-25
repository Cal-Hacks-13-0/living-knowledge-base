"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAssistant } from "./assistant-context";

/** Per-page "open the AI Assistant" button — every page gets one except
 * Home/Search/Inbox/Settings, which already have the assistant one click
 * away in context and don't need a dedicated page-level trigger. */
export function AiAssistantTrigger() {
  const { toggle } = useAssistant();
  return (
    <Button variant="secondary" size="sm" onClick={toggle}>
      <Sparkles className="h-4 w-4" /> AI Assistant
    </Button>
  );
}
