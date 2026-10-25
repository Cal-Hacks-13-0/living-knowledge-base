import type { Easing } from "motion/react";

/** Ease-out, no-bounce curve shared with the AI Assistant's content reveal
 * (see assistant-motion.ts) — reused here so every entrance in the app
 * settles the same way. */
export const ENTRANCE_EASE: Easing = [0.22, 1, 0.36, 1];

export const ENTRANCE_LINE_STAGGER = 0.09;
export const ENTRANCE_LINE_DURATION = 0.6;
export const ENTRANCE_LINE_OFFSET = 20;

export const ENTRANCE_TEXT_DURATION = 0.55;
export const ENTRANCE_TEXT_OFFSET = 16;
export const ENTRANCE_TEXT_STAGGER = 0.08;

export const ENTRANCE_BUTTON_SPRING = { type: "spring" as const, stiffness: 260, damping: 26, mass: 0.6 };
export const ENTRANCE_BUTTON_LABEL_DELAY = 0.14;
export const ENTRANCE_BUTTON_LABEL_DURATION = 0.3;
