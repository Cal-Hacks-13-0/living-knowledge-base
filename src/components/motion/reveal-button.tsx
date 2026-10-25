"use client";

import { useEffect } from "react";
import { motion, useMotionTemplate, useReducedMotion, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import {
  ENTRANCE_BUTTON_LABEL_DELAY,
  ENTRANCE_BUTTON_LABEL_DURATION,
  ENTRANCE_BUTTON_SPRING,
  ENTRANCE_EASE,
} from "./entrance-tokens";

/**
 * Masked expansion reveal for a primary CTA: the surface wipes in left to
 * right via a spring-driven `clip-path`, then the label/icon fade up
 * slightly after. The wrapper's box is the button's normal, final size the
 * whole time — clip-path only affects paint, never layout — so nothing else
 * on the page shifts while this plays.
 */
export function RevealButton({
  children,
  delay = 0,
  radius = 8,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  radius?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSpring(0, ENTRANCE_BUTTON_SPRING);
  const clipPath = useMotionTemplate`inset(0 ${useTransform(progress, (v) => (1 - v) * 100)}% 0 0 round ${radius}px)`;

  useEffect(() => {
    if (reduceMotion) {
      progress.jump(1);
      return;
    }
    const timer = setTimeout(() => progress.set(1), delay * 1000);
    return () => clearTimeout(timer);
  }, [reduceMotion, delay, progress]);

  return (
    <span className={cn("inline-block", className)}>
      <motion.span style={{ clipPath, display: "inline-block" }}>
        <motion.span
          style={{ display: "inline-block" }}
          initial={reduceMotion ? undefined : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + ENTRANCE_BUTTON_LABEL_DELAY, duration: ENTRANCE_BUTTON_LABEL_DURATION, ease: ENTRANCE_EASE }}
        >
          {children}
        </motion.span>
      </motion.span>
    </span>
  );
}
