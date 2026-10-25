import type { Transition, Variants } from "motion/react";

/**
 * Shared identity for the trigger-button <-> panel morph. Both
 * `AiAssistantTrigger` and `AiAssistantPanel` render a `motion` element with
 * this exact layoutId, and only one of the two is ever mounted at a time —
 * Motion detects the handoff and animates the trigger's measured rect
 * directly into the panel's (and back on close), rather than a slide-in.
 */
export const ASSISTANT_LAYOUT_ID = "ai-assistant-surface";

export const AI_ASSISTANT_PANEL_WIDTH = "26rem";

/** Critically-damped-ish spring — settles in ~500ms with minimal overshoot. */
export const ASSISTANT_SPRING: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 32,
  mass: 0.9,
};

/** Content inside the panel (header/messages/input) fades in once the shape
 * has mostly finished expanding, instead of swimming during the resize. */
export const ASSISTANT_CONTENT_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delayChildren: 0.26, staggerChildren: 0.07 },
  },
};

export const ASSISTANT_CONTENT_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
};
