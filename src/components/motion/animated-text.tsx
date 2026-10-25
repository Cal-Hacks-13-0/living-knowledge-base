"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ENTRANCE_EASE, ENTRANCE_TEXT_DURATION, ENTRANCE_TEXT_OFFSET, ENTRANCE_TEXT_STAGGER } from "./entrance-tokens";

const MOTION_TAG = { div: motion.div, p: motion.p, span: motion.span } as const;

/**
 * Masked block reveal for anything that follows a heading: a supporting
 * paragraph, or (passing an array of children) a handful of staggered
 * groups — stat tiles, cards, nav items. Same mechanics as `AnimatedHeading`
 * (clip mask + rise + fade) but a shorter travel distance, so it reads as
 * "settling in" rather than "being typeset."
 */
export function AnimatedText({
  children,
  as = "div",
  delay = 0,
  stagger = ENTRANCE_TEXT_STAGGER,
  className,
  groupClassName,
}: {
  children: React.ReactNode | React.ReactNode[];
  as?: keyof typeof MOTION_TAG;
  delay?: number;
  stagger?: number;
  className?: string;
  groupClassName?: string;
}) {
  const groups = Array.isArray(children) ? children : [children];
  const MotionTag = MOTION_TAG[as];

  return (
    <div className={className}>
      {groups.map((group, i) => (
        <div key={i} className={cn("overflow-hidden", groupClassName)}>
          <MotionTag
            initial={{ y: ENTRANCE_TEXT_OFFSET, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: ENTRANCE_TEXT_DURATION, delay: delay + i * stagger, ease: ENTRANCE_EASE }}
          >
            {group}
          </MotionTag>
        </div>
      ))}
    </div>
  );
}
