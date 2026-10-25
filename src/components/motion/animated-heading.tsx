"use client";

import { createElement } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ENTRANCE_EASE, ENTRANCE_LINE_DURATION, ENTRANCE_LINE_OFFSET, ENTRANCE_LINE_STAGGER } from "./entrance-tokens";

/**
 * Large-heading entrance: each line sits behind its own `overflow-hidden`
 * mask and rises up + fades in, as if being typeset into place rather than
 * floating onto the screen. Pass an array of strings for a heading that
 * should reveal as multiple lines; a single string reveals as one line.
 */
export function AnimatedHeading({
  children,
  as = "h1",
  delay = 0,
  className,
  lineClassName,
}: {
  children: string | string[];
  as?: "h1" | "h2" | "h3";
  delay?: number;
  className?: string;
  lineClassName?: string;
}) {
  const lines = Array.isArray(children) ? children : [children];
  return createElement(
    as,
    { className },
    lines.map((line, i) => (
      <span key={i} className={cn("block overflow-hidden", lineClassName)}>
        <motion.span
          className="block"
          initial={{ y: ENTRANCE_LINE_OFFSET, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            duration: ENTRANCE_LINE_DURATION,
            delay: delay + i * ENTRANCE_LINE_STAGGER,
            ease: ENTRANCE_EASE,
          }}
        >
          {line}
        </motion.span>
      </span>
    ))
  );
}
