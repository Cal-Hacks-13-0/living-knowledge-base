import { cn } from "@/lib/utils";

/**
 * Axion brand marks. White parts use `currentColor` (so the mark works on
 * dark and light surfaces); the dot is always the brand orange.
 */
export const AXION_ORANGE = "#E8794A";

// The Axion "A": a crossbar-less, flat-topped Λ.
const A_PATH = "M43 0H57L100 100H81L50 28L19 100H0Z";
// Heavier version for the wordmark, matching the weight of the "xion" letters.
const WORDMARK_A_PATH = "M41 0H59L100 100H76L50 36L24 100H0Z";

/** The logo: the A inside a tilted orbit with a small planet, and the orange dot. */
export function AxionLogo({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 132 108"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
    >
      {/* Orbit: tilted ellipse behind the A, planet at its right end. */}
      <ellipse
        cx="66"
        cy="60"
        rx="60"
        ry="17"
        transform="rotate(-17 66 60)"
        stroke="currentColor"
        strokeOpacity="0.85"
        strokeWidth="3"
      />
      <g transform="translate(16 4)">
        <path d={A_PATH} fill="currentColor" />
        <circle cx="50" cy="74" r="12.5" fill={AXION_ORANGE} />
      </g>
      <circle cx="122" cy="40" r="7.5" fill="currentColor" />
    </svg>
  );
}

/**
 * The "Axion" wordmark: the brand A (with the orange dot set low and left)
 * followed by "xion" in the wordmark typeface. `fontClassName` supplies the
 * typeface (see lib/fonts.ts). Renders "Axion" for screen readers.
 */
export function AxionWordmark({ className, fontClassName }: { className?: string; fontClassName?: string }) {
  return (
    <span className={cn("inline-flex items-baseline leading-none", fontClassName, className)}>
      <span className="sr-only">Axion</span>
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        // Sized to the font's cap height so the A sits on the same baseline as "xion".
        className="mr-[0.02em] h-[0.72em] w-[0.72em] self-baseline"
        fill="none"
      >
        <path d={WORDMARK_A_PATH} fill="currentColor" />
        <circle cx="50" cy="78" r="11.5" fill={AXION_ORANGE} />
      </svg>
      <span aria-hidden>xion</span>
    </span>
  );
}
