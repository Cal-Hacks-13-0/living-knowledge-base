"use client";

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssistant } from "./assistant-context";
import { ASSISTANT_LAYOUT_ID, ASSISTANT_SPRING } from "./assistant-motion";

/**
 * Per-page "open the AI Assistant" button — every page gets one except
 * Home/Search/Inbox/Settings. Shares `ASSISTANT_LAYOUT_ID` with
 * `AiAssistantPanel`: Motion morphs this exact button into the panel (and
 * back) rather than sliding a separate surface in — see assistant-motion.ts.
 *
 * Pages render it where it belongs in their header; the button itself is
 * portaled into the shell's pinned top-right slot (ShellWithAssistant), so it
 * stays put while the page scrolls. What stays in the header is a spacer the
 * size of the button, so titles and actions never run underneath it — only
 * needed when the content column reaches the right edge of the main area.
 */
export function AiAssistantTrigger() {
  const { triggerSlot } = useAssistant();
  return (
    <>
      <span aria-hidden className="h-8 w-32 shrink-0 @min-[1320px]/workspace:hidden" />
      {triggerSlot && createPortal(<TriggerButton />, triggerSlot)}
    </>
  );
}

function TriggerButton() {
  const { open, toggle } = useAssistant();
  return (
    <AnimatePresence>
      {!open && (
        <motion.button
          layout
          layoutId={ASSISTANT_LAYOUT_ID}
          type="button"
          onClick={toggle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ layout: ASSISTANT_SPRING, opacity: { duration: 0.18 } }}
          style={{
            borderTopLeftRadius: 9999,
            borderTopRightRadius: 9999,
            borderBottomLeftRadius: 9999,
            borderBottomRightRadius: 9999,
          }}
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            "pointer-events-auto absolute right-[max(1.5rem,env(safe-area-inset-right))] top-[max(2rem,env(safe-area-inset-top))] shadow-sm"
          )}
        >
          <Sparkles className="h-4 w-4" />
          AI Assistant
        </motion.button>
      )}
    </AnimatePresence>
  );
}
