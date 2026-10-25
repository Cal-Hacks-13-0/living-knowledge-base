"use client";

import { motion, AnimatePresence } from "motion/react";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAssistant } from "./assistant-context";
import { ASSISTANT_LAYOUT_ID, ASSISTANT_SPRING } from "./assistant-motion";

/**
 * Per-page "open the AI Assistant" button — every page gets one except
 * Home/Search/Inbox/Settings. Shares `ASSISTANT_LAYOUT_ID` with
 * `AiAssistantPanel`: Motion morphs this exact button into the panel (and
 * back) rather than sliding a separate surface in — see assistant-motion.ts.
 */
export function AiAssistantTrigger() {
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
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Sparkles className="h-4 w-4" />
          AI Assistant
        </motion.button>
      )}
    </AnimatePresence>
  );
}
