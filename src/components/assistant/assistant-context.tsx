"use client";

import { createContext, useContext } from "react";

export interface AssistantContextValue {
  open: boolean;
  toggle: () => void;
  /** Pinned top-right corner of the main content area; the page's trigger renders here. */
  triggerSlot: HTMLElement | null;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);

/** Lets any page open/close the global AI Assistant panel via a per-page
 * trigger button, without prop-drilling through every layout. */
export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant() must be used inside the app shell (ShellWithAssistant).");
  return ctx;
}
