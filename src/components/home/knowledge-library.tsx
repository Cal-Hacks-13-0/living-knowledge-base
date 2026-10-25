"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NetworkSphere } from "./network-sphere";
import { AxionWordmark } from "@/components/brand/axion-logo";
import { wordmarkFont } from "@/lib/fonts";

export interface LibraryKnowledgeBase {
  id: string;
  name: string;
  entryCount: number;
  sourceCount: number;
}

// closed → opening → expanded → closing → closed. Hover/focus "peeking" is a
// sub-state of closed (it never changes the phase). Opening is purely local:
// the URL never changes; navigating to a vault is a plain link on its card.
type Phase = "closed" | "opening" | "expanded" | "closing";
type Visual = Phase | "peeking";

// Folder geometry, in px, in the folder button's own coordinate space. The
// peek cards are positioned from these same numbers in CSS and in the
// fan-out math below, so tucked cards line up exactly with the cards that fly.
const FOLDER_W = 264;
const FOLDER_H = 204;
const FRONT_TOP = 56; // top edge of the front flap
const PEEK_W = 184;
const PEEK_H = PEEK_W * 0.75; // cards are aspect 4:3 everywhere
const TUCK_TOP = 62; // a tucked card sits fully behind the front flap
const HOVER_SCALE = 1.1;
const PEEK_SLOTS = [
  { dx: -22, lift: 40, rot: -7 },
  { dx: 4, lift: 30, rot: 2 },
  { dx: 26, lift: 22, rot: 8 },
];
// How many cards float above the folder per breakpoint (2 rows × columns,
// including the "New knowledge vault" card). Everything else is listed below
// the folder, so at most 8 cards ever fly and every vault stays reachable.
const FLOAT_SLOTS = { base: 4, sm: 6, lg: 8 };
// A gentle, deterministic scatter so the floating cards don't sit in a rigid grid.
const FLOAT_TILT = [-2.2, 1.6, -1, 2, -1.6, 1.1, -2, 1.4];
const FLOAT_DROP = [0, -8, 6, -4, 5, -6, 2, -3];
const OPEN_MS = 1450;
const CLOSE_MS = 1050;
const OPEN_STAGGER_MS = 35;
const CLOSE_STAGGER_MS = 30;
// Stage height = viewport minus the (home) layout's h-16 header.
const STAGE_HEIGHT = "calc(100dvh - 4rem)";

// Coming Back to Home after leaving it with the vaults open restores them
// (without replaying the animation); any other arrival starts closed.
const RESTORE_KEY = "axion:vaults-open";
let lastTraversal: { href: string; at: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastTraversal = { href: window.location.href, at: Date.now() };
  });
}

export function KnowledgeLibrary({ knowledgeBases }: { knowledgeBases: LibraryKnowledgeBase[] }) {
  const [phase, setPhase] = useState<Phase>(() => (shouldRestoreExpanded() ? "expanded" : "closed"));
  const [hovering, setHovering] = useState(false);
  const folderRef = useRef<HTMLButtonElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLUListElement>(null);
  const overflowRef = useRef<HTMLElement>(null);
  const phaseRef = useRef(phase);
  const openedFromPeek = useRef(false);
  const pendingFocus = useRef<"cards" | null>(null);
  // Positions captured just before a layout change, for FLIP-animating the hero/folder into place.
  // `folderVisual` is where the folder is actually drawn (including its idle float), which is
  // where cards must leave from; `folder` is its layout box, which is what FLIP moves.
  const flipFrom = useRef<{ hero: DOMRect; folder: DOMRect; folderVisual: DOMRect } | null>(null);

  const count = knowledgeBases.length;
  const peekCards = knowledgeBases.slice(0, PEEK_SLOTS.length);
  const visual: Visual = phase === "closed" && hovering ? "peeking" : phase;
  const isOpen = phase !== "closed";
  const limits = floatLimits(count);
  const overflowAt = { base: count > limits.base, sm: count > limits.sm, lg: count > limits.lg };

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    lastTraversal = null; // consumed: a later non-Back arrival must start closed
    try {
      sessionStorage.removeItem(RESTORE_KEY);
    } catch {}
    return () => {
      try {
        if (phaseRef.current === "expanded") sessionStorage.setItem(RESTORE_KEY, "1");
      } catch {}
    };
  }, []);

  function captureLayout() {
    if (heroRef.current && folderRef.current) {
      flipFrom.current = {
        hero: heroRef.current.getBoundingClientRect(),
        folder: folderRef.current.getBoundingClientRect(),
        folderVisual: folderVisualRect(folderRef.current),
      };
    }
  }

  function toggle() {
    if (phase === "closed") {
      openedFromPeek.current = hovering;
      pendingFocus.current = "cards";
      if (canAnimate()) {
        captureLayout();
        setPhase("opening");
      } else {
        setPhase("expanded");
      }
    } else if (phase === "expanded") {
      if (canAnimate()) {
        window.scrollTo({ top: 0, behavior: "instant" });
        setPhase("closing");
      } else {
        setPhase("closed");
      }
    }
    // opening/closing: ignore — the transition finishes on its own.
  }

  // Runs before paint so the cards never flash in their final positions, and
  // the hero/folder never visibly jump when the layout changes.
  useLayoutEffect(() => {
    const animations: Animation[] = [];
    const from = flipFrom.current;
    flipFrom.current = null;
    if (from && heroRef.current && folderRef.current) {
      animations.push(...flipIntoPlace(from, heroRef.current, folderRef.current, captionRef.current, phase === "opening"));
    }
    if ((phase === "opening" || phase === "closing") && folderRef.current && floatRef.current) {
      const opening = phase === "opening";
      animations.push(
        ...animateCards(
          from?.folderVisual ?? folderVisualRect(folderRef.current),
          folderVisualRect(folderRef.current),
          floatRef.current,
          overflowRef.current,
          opening,
          opening ? openedFromPeek.current : false
        )
      );
    }
    if (phase !== "opening" && phase !== "closing") return;

    let cancelled = false;
    Promise.allSettled(animations.map((a) => a.finished)).then(() => {
      if (cancelled) return;
      if (phase === "closing") captureLayout();
      setPhase(phase === "opening" ? "expanded" : "closed");
    });
    // Targets are measured when a transition starts; if the viewport changes
    // mid-flight, jump to the end state rather than land on stale positions.
    const finishAll = () => animations.forEach((a) => a.finish());
    window.addEventListener("resize", finishAll);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", finishAll);
    };
  }, [phase]);

  useEffect(() => {
    if (phase === "expanded" && pendingFocus.current === "cards") {
      pendingFocus.current = null;
      floatRef.current?.querySelector<HTMLElement>("[data-float-focus]")?.focus({ preventScroll: true });
    }
  }, [phase]);

  return (
    // `isolate` makes this the stacking context the folder layers and the
    // flying cards share, so a card can pass from behind the front flap to in
    // front of it. Nothing between here and those elements may create its own
    // stacking context (no transform/opacity on the card list or its wrappers).
    <div className="relative isolate flex flex-1 flex-col items-center px-4 pb-10" style={{ minHeight: STAGE_HEIGHT }}>
      {/* Background, behind everything in this stacking context: the cursor-follow
          network sphere, then a soft dark veil that keeps the heading readable. */}
      <NetworkSphere />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_60%_38%_at_50%_14%,rgba(8,8,8,0.82),transparent_75%)]"
      />
      {!isOpen && <div className="flex-1" aria-hidden />}

      <div ref={heroRef} className={cn("flex flex-col items-center text-center", TEXT_HALO, isOpen ? "pt-4 sm:pt-6" : "")}>
        <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-muted sm:text-xs">
          An Autonomous Knowledge System
        </p>
        <h1 className="mt-3 text-6xl text-foreground sm:text-7xl">
          <AxionWordmark fontClassName={wordmarkFont.className} />
        </h1>
        <p className="mt-3 text-base text-balance text-muted sm:text-lg">Discover what you don&apos;t know yet.</p>
      </div>

      {isOpen && (
        <ul
          ref={floatRef}
          id="knowledge-vaults"
          aria-label="My knowledge vaults"
          inert={phase !== "expanded"}
          className="mt-8 flex w-full max-w-[44rem] flex-wrap justify-center gap-3 sm:gap-4"
        >
          {count === 0 ? (
            <li data-float-card className="relative w-full max-w-xs">
              <FloatingCard index={0}>
                <span className={cn("flex flex-col items-center gap-3 rounded-xl px-6 py-7 text-center", GLASS_CARD)}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-foreground">No knowledge vaults yet</span>
                  <Link href="/new" data-float-focus>
                    <Button size="sm" tabIndex={-1}>
                      <Plus className="h-3.5 w-3.5" /> Create your first knowledge vault
                    </Button>
                  </Link>
                </span>
              </FloatingCard>
            </li>
          ) : (
            <>
              {knowledgeBases.map((kb, i) => (
                <li
                  key={kb.id}
                  data-float-card
                  className={cn(FLOAT_ITEM_WIDTH, "relative min-w-0", hiddenBeyond(i, limits))}
                >
                  <FloatingCard index={i}>
                    <Link
                      href={`/kb/${kb.id}`}
                      data-float-focus
                      aria-label={`${kb.name} knowledge vault`}
                      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <VaultCardFace kb={kb} />
                    </Link>
                  </FloatingCard>
                </li>
              ))}
              <li data-float-card className={cn(FLOAT_ITEM_WIDTH, "relative min-w-0")}>
                <FloatingCard index={Math.min(count, limits.lg)}>
                  <Link
                    href="/new"
                    className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/30 bg-white/[0.05] text-sm font-medium text-muted backdrop-blur-[4px] hover:bg-white/[0.09] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <Plus className="h-5 w-5" />
                    New knowledge vault
                  </Link>
                </FloatingCard>
              </li>
            </>
          )}
        </ul>
      )}

      <div className={cn("flex flex-col items-center gap-4", isOpen ? "mt-8" : "mt-8 sm:mt-10")}>
        <button
          ref={folderRef}
          type="button"
          aria-expanded={isOpen}
          aria-controls={isOpen ? "knowledge-vaults" : undefined}
          aria-label={isOpen ? "Close my knowledge vaults" : `Open my knowledge vaults, ${countLabel(count)}`}
          onClick={toggle}
          onPointerEnter={(e) => e.pointerType !== "touch" && setHovering(true)}
          onPointerLeave={() => setHovering(false)}
          onFocus={(e) => e.currentTarget.matches(":focus-visible") && setHovering(true)}
          onBlur={() => setHovering(false)}
          className="relative block cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-8 focus-visible:ring-offset-background"
          style={{ width: FOLDER_W, height: FOLDER_H }}
        >
          <FolderLayer visual={visual} hovering={hovering} z={10}>
            {/* Translucent white glass: low-opacity fills, thin white edges, light backdrop blur. */}
            <span
              className="absolute left-1/2 -bottom-4 h-6 w-[88%] -translate-x-1/2 rounded-full bg-black/60 blur-lg"
              aria-hidden
            />
            <span className="absolute left-3 top-0 h-[22px] w-28 rounded-t-xl border border-b-0 border-white/25 bg-white/[0.09] backdrop-blur-[4px]" />
            <span className="absolute inset-x-0 bottom-0 top-5 rounded-2xl border border-white/20 bg-gradient-to-b from-white/[0.11] to-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-[4px]" />
          </FolderLayer>

          <FolderLayer visual={visual} hovering={hovering} z={20} hidden={phase !== "closed"}>
            {peekCards.map((kb, i) => {
              const slot = PEEK_SLOTS[i];
              const lifted = visual === "peeking";
              return (
                <span
                  key={kb.id}
                  data-folder-motion
                  className="absolute block"
                  style={{
                    left: (FOLDER_W - PEEK_W) / 2 + slot.dx,
                    top: TUCK_TOP,
                    width: PEEK_W,
                    height: PEEK_H,
                    transform: `translateY(${lifted ? -slot.lift : 0}px) rotate(${lifted ? slot.rot : slot.rot / 2}deg)`,
                    transition: `transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 30}ms`,
                  }}
                >
                  <VaultCardFace kb={kb} className="h-full w-full" />
                </span>
              );
            })}
          </FolderLayer>

          <FolderLayer visual={visual} hovering={hovering} z={30}>
            <span
              data-folder-motion
              className="absolute inset-x-0 bottom-0 origin-bottom"
              style={{
                top: FRONT_TOP,
                transform: `perspective(700px) rotateX(${flapAngle(visual)}deg)`,
                transition: "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            >
              <span className="absolute inset-0 rounded-2xl border border-white/30 bg-gradient-to-b from-white/[0.2] to-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(255,255,255,0.08),0_24px_44px_-20px_rgba(0,0,0,0.85)] backdrop-blur-[5px]" />
              <span className="absolute inset-x-4 top-2 h-px bg-white/40" />
              <span className="absolute bottom-4 left-4 rounded-md border border-white/25 bg-white/10 px-2 py-1 text-[11px] font-semibold tracking-wide text-white backdrop-blur-sm">
                Axion
              </span>
            </span>
          </FolderLayer>
        </button>

        <div ref={captionRef} className={cn("flex flex-col items-center text-center", TEXT_HALO)}>
          <h2 className="text-sm font-medium text-foreground">My knowledge vaults</h2>
          <p className="text-xs text-muted">{countLabel(count)}</p>
        </div>
      </div>

      {isOpen && count > 0 && (
        <section
          ref={overflowRef}
          aria-label="More knowledge vaults"
          inert={phase !== "expanded"}
          className={cn(
            "mt-10 w-full max-w-3xl",
            !overflowAt.base && "max-sm:hidden",
            !overflowAt.sm && "sm:max-lg:hidden",
            !overflowAt.lg && "lg:hidden"
          )}
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">More knowledge vaults</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {knowledgeBases.map((kb, i) => (
              <li key={kb.id} className={shownBeyond(i, limits)}>
                <Link
                  href={`/kb/${kb.id}`}
                  className="flex items-center gap-3 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 backdrop-blur-[3px] transition-colors hover:border-white/30 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                    <BookOpen className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{kb.name}</span>
                    <span className="block truncate text-xs text-muted">{itemCounts(kb)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isOpen && <div className="flex-1" aria-hidden />}
    </div>
  );
}

// A soft near-black halo so text stays readable where the network's lines pass behind it.
const TEXT_HALO = "[text-shadow:0_0_14px_#080808,0_0_6px_#080808,0_0_2px_#080808]";

// The vault cards' glass: translucent white over the dark page, readable white text.
const GLASS_CARD =
  "border border-white/20 bg-white/[0.08] backdrop-blur-[4px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_14px_32px_-16px_rgba(0,0,0,0.75)]";

const FLOAT_ITEM_WIDTH =
  // Each basis is a hair under its exact share so sub-pixel rounding never wraps a row early.
  "basis-[calc(50%-0.375rem-0.5px)] sm:basis-[calc((100%-2rem)/3-0.5px)] lg:basis-[calc((100%-3rem)/4-0.5px)]";

/** Resting "suspended" pose; the flying animation runs on the parent <li>, so this never conflicts with it. */
function FloatingCard({ index, children }: { index: number; children: React.ReactNode }) {
  const tilt = FLOAT_TILT[index % FLOAT_TILT.length];
  const drop = FLOAT_DROP[index % FLOAT_DROP.length];
  return (
    <div
      data-folder-motion
      className="transition-transform duration-300 ease-out [transform:translateY(var(--drop))_rotate(var(--tilt))] focus-within:[transform:translateY(calc(var(--drop)-6px))_rotate(0deg)_scale(1.03)] hover:[transform:translateY(calc(var(--drop)-6px))_rotate(0deg)_scale(1.03)]"
      style={{ "--tilt": `${tilt}deg`, "--drop": `${drop}px` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

function VaultCardFace({ kb, className }: { kb: LibraryKnowledgeBase; className?: string }) {
  return (
    <span
      className={cn(
        "flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-xl p-3.5 text-left sm:p-4",
        GLASS_CARD,
        className
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
          <BookOpen className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted sm:text-[11px]">
          Knowledge vault
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="line-clamp-2 text-sm font-semibold text-foreground">{kb.name}</span>
        <span className="truncate text-xs text-muted">{itemCounts(kb)}</span>
      </span>
    </span>
  );
}

/**
 * One full-size layer of the folder (back, cards, or front). Every layer is the
 * size of the folder button and scales around the same bottom-centre origin,
 * so the layers stay registered while they're stacked at different z-indexes.
 * The outer span is what FLIP moves (`translate`), the inner one scales.
 */
function FolderLayer({
  visual,
  hovering,
  z,
  hidden,
  children,
}: {
  visual: Visual;
  hovering: boolean;
  z: number;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      data-folder-layer
      className="pointer-events-none absolute inset-0 block"
      // Hidden instantly: the cards that fly take over from these exact positions.
      style={{ zIndex: z, visibility: hidden ? "hidden" : "visible" }}
    >
      {/* Idle float (globals.css). Its own wrapper so it never fights the hover scale below or
          the FLIP `translate` on the layer above; every layer runs it in sync. */}
      <span data-folder-float className="folder-float absolute inset-0 block">
        <span
          data-folder-motion
          className="absolute inset-0 block origin-bottom"
          style={{
            transform: `scale(${folderScale(visual, hovering)})`,
            transition: "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          {children}
        </span>
      </span>
    </span>
  );
}

/** The folder button's box shifted by the idle float, i.e. where the folder is currently drawn. */
function folderVisualRect(button: HTMLElement): DOMRect {
  const rect = button.getBoundingClientRect();
  const float = button.querySelector<HTMLElement>("[data-folder-float]");
  const layer = float?.parentElement;
  const offset = float && layer ? float.getBoundingClientRect().top - layer.getBoundingClientRect().top : 0;
  return new DOMRect(rect.x, rect.y + offset, rect.width, rect.height);
}

function folderScale(visual: Visual, hovering: boolean): number {
  if (visual === "peeking") return HOVER_SCALE;
  if (visual === "expanded" && hovering) return 1.04; // hints that the open folder closes the collection
  return 1;
}

function flapAngle(visual: Visual): number {
  if (visual === "closed") return 0;
  if (visual === "peeking") return -14;
  return -30;
}

function floatLimits(count: number) {
  // When everything (plus the "New" card) fits, float it all; otherwise keep one slot for "New".
  const fit = (slots: number) => (count + 1 <= slots ? count : slots - 1);
  return { base: fit(FLOAT_SLOTS.base), sm: fit(FLOAT_SLOTS.sm), lg: fit(FLOAT_SLOTS.lg) };
}

/** Classes hiding floating card `i` at the breakpoints where it doesn't fit above the folder. */
function hiddenBeyond(i: number, limits: ReturnType<typeof floatLimits>) {
  return cn(i >= limits.base && "max-sm:hidden", i >= limits.sm && "sm:max-lg:hidden", i >= limits.lg && "lg:hidden");
}

/** The complement of hiddenBeyond, for the list below the folder. */
function shownBeyond(i: number, limits: ReturnType<typeof floatLimits>) {
  return cn(i < limits.base && "max-sm:hidden", i < limits.sm && "sm:max-lg:hidden", i < limits.lg && "lg:hidden");
}

function shouldRestoreExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      sessionStorage.getItem(RESTORE_KEY) === "1" &&
      // The Back/Forward itself must have landed on Home. (Don't compare with
      // location.href here: on a <Link> click it still holds the previous URL while
      // the new page renders.)
      lastTraversal !== null &&
      new URL(lastTraversal.href).pathname === "/" &&
      Date.now() - lastTraversal.at < 1000
    );
  } catch {
    return false;
  }
}

function canAnimate(): boolean {
  return (
    typeof Element.prototype.animate === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * FLIP the hero and folder from where they were before the layout changed to
 * where they are now. When opening, the folder holds its old position until the
 * cards have fanned out of it, then settles into its new spot below them.
 */
function flipIntoPlace(
  from: { hero: DOMRect; folder: DOMRect },
  hero: HTMLElement,
  folder: HTMLElement,
  caption: HTMLElement | null,
  opening: boolean
): Animation[] {
  const animations: Animation[] = [];
  const heroTo = hero.getBoundingClientRect();
  const folderTo = folder.getBoundingClientRect();
  const heroDy = from.hero.top - heroTo.top;
  const folderDx = from.folder.left - folderTo.left;
  const folderDy = from.folder.top - folderTo.top;
  const easing = "cubic-bezier(0.22, 0.8, 0.25, 1)";

  if (heroDy) {
    animations.push(
      hero.animate([{ translate: `0px ${heroDy}px` }, { translate: "0px 0px" }], { duration: opening ? 700 : 450, easing })
    );
  }
  if (folderDx || folderDy) {
    const offset = `${folderDx}px ${folderDy}px`;
    const keyframes: Keyframe[] = opening
      ? [{ translate: offset }, { translate: offset, offset: 0.55 }, { translate: "0px 0px" }]
      : [{ translate: offset }, { translate: "0px 0px" }];
    const timing: KeyframeAnimationOptions = { duration: opening ? 1300 : 450, easing };
    folder.querySelectorAll<HTMLElement>("[data-folder-layer]").forEach((layer) => {
      animations.push(layer.animate(keyframes, timing));
    });
    if (caption) animations.push(caption.animate(keyframes, timing));
  }
  return animations;
}

interface Slot {
  x: number; // centre, viewport px
  y: number;
  width: number;
  rot: number;
}

/** Where card `i` sits inside the folder, matching the peek layer's CSS. */
function folderSlot(folder: DOMRect, i: number, scale: number, lifted: boolean): Slot {
  const slot = PEEK_SLOTS[i] ?? { dx: 0, lift: 0, rot: 0 };
  const cx = FOLDER_W / 2 + slot.dx;
  const cy = TUCK_TOP - (lifted ? slot.lift : 0) + PEEK_H / 2;
  return {
    x: folder.left + FOLDER_W / 2 + (cx - FOLDER_W / 2) * scale,
    y: folder.top + FOLDER_H + (cy - FOLDER_H) * scale,
    width: PEEK_W * scale,
    rot: lifted ? slot.rot : slot.rot / 2,
  };
}

/** Card `i` of `n` fanned out just above the folder opening. */
function fanSlot(folder: DOMRect, i: number, n: number): Slot {
  const k = i - (n - 1) / 2;
  return {
    x: folder.left + FOLDER_W / 2 + k * Math.min(44, 300 / n),
    y: folder.top - 40 + Math.abs(k) * 6,
    width: PEEK_W,
    rot: k * Math.min(7, 40 / n),
  };
}

function toTransform(slot: Slot, card: DOMRect): string {
  const dx = slot.x - (card.left + card.width / 2);
  const dy = slot.y - (card.top + card.height / 2);
  return `translate(${dx}px, ${dy}px) rotate(${slot.rot}deg) scale(${slot.width / card.width})`;
}

const IDENTITY = "translate(0px, 0px) rotate(0deg) scale(1)";

/**
 * FLIP-style: the cards are laid out in their real floating positions above
 * the folder, then animated out of it (tucked → lifted → fanned → floating),
 * or the reverse when closing. z-index steps from behind the front flap (20)
 * to in front of it (40) once a card has cleared the flap's top edge.
 * `folderFrom` is where the folder was when the cards left it (it then moves).
 */
function animateCards(
  folderFrom: DOMRect,
  folderTo: DOMRect,
  list: HTMLElement,
  overflow: HTMLElement | null,
  opening: boolean,
  fromPeek: boolean
): Animation[] {
  // Cards hidden at this breakpoint (display: none) have no box and don't fly.
  const flying = Array.from(list.querySelectorAll<HTMLElement>("[data-float-card]")).filter((el) => el.offsetWidth > 0);
  const n = flying.length;
  const animations: Animation[] = [];

  flying.forEach((el, i) => {
    const card = el.getBoundingClientRect();
    const scale = opening && fromPeek ? HOVER_SCALE : 1;
    const tucked = folderSlot(opening ? folderFrom : folderTo, i, scale, opening && fromPeek);
    const lifted = { ...tucked, y: tucked.y - PEEK_H * 0.6 * scale };
    const keyframes: Keyframe[] = [
      { offset: 0, transform: toTransform(tucked, card), zIndex: 20, easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
      { offset: 0.2, transform: toTransform(lifted, card), zIndex: 20, easing: "cubic-bezier(0.3, 0, 0.3, 1)" },
      { offset: 0.24, zIndex: 40 },
      { offset: 0.48, transform: toTransform(fanSlot(opening ? folderFrom : folderTo, i, n), card), easing: "cubic-bezier(0.25, 0.8, 0.25, 1)" },
      { offset: 1, transform: IDENTITY, zIndex: 40 },
    ];
    if (!opening) {
      keyframes.reverse();
      keyframes.forEach((k) => (k.offset = 1 - (k.offset as number)));
      // Easing applies to the segment after a keyframe, so shift them back one slot.
      const easings = keyframes.map((k) => k.easing);
      keyframes.forEach((k, j) => {
        const e = easings[j + 1];
        if (e) k.easing = e;
        else delete k.easing;
      });
    }
    animations.push(
      el.animate(keyframes, {
        duration: opening ? OPEN_MS : CLOSE_MS,
        delay: opening ? i * OPEN_STAGGER_MS : (n - 1 - i) * CLOSE_STAGGER_MS,
        fill: opening ? "backwards" : "forwards",
      })
    );
  });

  if (overflow && overflow.offsetWidth > 0) {
    animations.push(
      overflow.animate(
        opening
          ? [
              { opacity: 0, transform: "translateY(8px)" },
              { opacity: 1, transform: "translateY(0)" },
            ]
          : [{ opacity: 1 }, { opacity: 0 }],
        opening
          ? { duration: 380, delay: 1050, easing: "ease-out", fill: "backwards" }
          : { duration: 200, easing: "ease-in", fill: "forwards" }
      )
    );
  }

  return animations;
}

function countLabel(count: number): string {
  return count === 0 ? "No knowledge vaults yet" : plural(count, "knowledge vault", "knowledge vaults");
}

function itemCounts(kb: LibraryKnowledgeBase): string {
  return `${plural(kb.entryCount, "entry", "entries")} · ${plural(kb.sourceCount, "source", "sources")}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
