"use client";

import { useEffect, useRef } from "react";
import { useCursorTrailEnabled } from "@/lib/client/cursor-trail";
import { cn } from "@/lib/utils";

/**
 * Background "cursor trail": a soft pool of white-and-amber light that the
 * pointer stirs, like dye in water. A compact CPU stable-fluids solver
 * (semi-Lagrangian advection, vorticity confinement, Jacobi pressure
 * projection, exponential dissipation) on a coarse grid; the dye field is
 * drawn into a canvas the size of the grid and upscaled + lightly blurred by
 * CSS, and screen-blended, so it reads as a soft glowing light trail.
 *
 * - Listens for pointer movement on `regionRef` (passive; never blocks
 *   clicks, selection, drag, or scroll). Mouse/pen only — touch just scrolls.
 * - Runs only while there's light or motion; stops when it has dissipated,
 *   when the tab is hidden, or when the user turns the trail Off (which
 *   also clears it immediately). Never runs under prefers-reduced-motion.
 * - `fixed`: cover the viewport (pages that scroll the whole document);
 *   otherwise fill the region (pages with their own scroll container).
 */

const MIN_CELLS = 64;
const MAX_CELLS = 140;
const PX_PER_CELL = 9;
const PRESSURE_ITERATIONS = 14;
const SPLAT_RADIUS = 1.6; // cells — a fine trail, not a cloud
const FORCE = 0.45;
const VORTICITY = 1.6;
const VELOCITY_DECAY = 0.9; // per second (exponential)
const DYE_DECAY = 0.5; // per second — glows for a few seconds
const WHITE_DYE = 0.6;
const AMBER_DYE = 0.26;
const LIGHT_MAX = 0.42; // peak opacity of the light: a soft glow, not glaring
const MAX_POINTER_SPEED = 900; // cells/s

export function FluidCursor({
  regionRef,
  fixed = false,
  className,
}: {
  regionRef: React.RefObject<HTMLElement | null>;
  fixed?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enabled = useCursorTrailEnabled() === true;

  useEffect(() => {
    const canvas = canvasRef.current;
    const region = regionRef.current;
    const ctx = canvas?.getContext("2d");
    if (!enabled || !canvas || !region || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = 0;
    let height = 0;
    let left = 0;
    let top = 0;
    let nx = 0;
    let ny = 0;
    let stride = 0;
    let u = new Float32Array(0);
    let v = u, u0 = u, v0 = u, dW = u, dA = u, dW0 = u, dA0 = u, p = u, div = u, curl = u;
    let image: ImageData | null = null;
    const queued: number[] = []; // x, y, vx, vy, strength per splat
    let last: { x: number; y: number; t: number } | null = null;
    let raf = 0;
    let lastFrame = 0;
    let lastPointerAt = 0;

    const IX = (i: number, j: number) => i + stride * j;

    function setup() {
      const rect = fixed ? new DOMRect(0, 0, window.innerWidth, window.innerHeight) : region!.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      left = rect.left;
      top = rect.top;
      nx = Math.round(Math.min(MAX_CELLS, Math.max(MIN_CELLS, width / PX_PER_CELL)));
      ny = Math.max(24, Math.round((nx * height) / width));
      stride = nx + 2;
      const size = stride * (ny + 2);
      [u, v, u0, v0, dW, dA, dW0, dA0, p, div, curl] = Array.from({ length: 11 }, () => new Float32Array(size));
      canvas!.width = nx;
      canvas!.height = ny;
      image = ctx!.createImageData(nx, ny);
      ctx!.clearRect(0, 0, nx, ny);
      last = null;
    }

    function splat(x: number, y: number, vx: number, vy: number, strength: number) {
      const r2 = SPLAT_RADIUS * SPLAT_RADIUS;
      const ra2 = r2 * 1.8 * 1.8;
      const reach = Math.ceil(SPLAT_RADIUS * 2.4);
      const i0 = Math.max(1, Math.floor(x - reach));
      const i1 = Math.min(nx, Math.ceil(x + reach));
      const j0 = Math.max(1, Math.floor(y - reach));
      const j1 = Math.min(ny, Math.ceil(y + reach));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dx = i - x;
          const dy = j - y;
          const d2 = dx * dx + dy * dy;
          const g = Math.exp(-d2 / r2);
          const k = IX(i, j);
          u[k] += vx * g * FORCE;
          v[k] += vy * g * FORCE;
          dW[k] += g * WHITE_DYE * strength;
          // Amber mostly at the rim of the splat, so it mixes in at the edges of the wake.
          const ga = Math.exp(-d2 / ra2) - 0.8 * g;
          if (ga > 0) dA[k] += ga * AMBER_DYE * strength;
        }
      }
    }

    function bounds(f: Float32Array) {
      for (let i = 0; i <= nx + 1; i++) {
        f[IX(i, 0)] = 0;
        f[IX(i, ny + 1)] = 0;
      }
      for (let j = 0; j <= ny + 1; j++) {
        f[IX(0, j)] = 0;
        f[IX(nx + 1, j)] = 0;
      }
    }

    function advect(dst: Float32Array, src: Float32Array, dt: number) {
      for (let j = 1; j <= ny; j++) {
        for (let i = 1; i <= nx; i++) {
          const k = IX(i, j);
          let x = i - dt * u0[k];
          let y = j - dt * v0[k];
          x = Math.min(Math.max(x, 0.5), nx + 0.5);
          y = Math.min(Math.max(y, 0.5), ny + 0.5);
          const ia = Math.floor(x);
          const ja = Math.floor(y);
          const s1 = x - ia;
          const t1 = y - ja;
          const a = IX(ia, ja);
          dst[k] =
            (1 - s1) * ((1 - t1) * src[a] + t1 * src[a + stride]) + s1 * ((1 - t1) * src[a + 1] + t1 * src[a + stride + 1]);
        }
      }
      bounds(dst);
    }

    function step(dt: number) {
      // Pointer splats queued since the last frame.
      for (let q = 0; q < queued.length; q += 5) splat(queued[q], queued[q + 1], queued[q + 2], queued[q + 3], queued[q + 4]);
      queued.length = 0;

      // Vorticity confinement: keeps small eddies curling instead of smearing out.
      for (let j = 1; j <= ny; j++) {
        for (let i = 1; i <= nx; i++) {
          const k = IX(i, j);
          curl[k] = 0.5 * (v[k + 1] - v[k - 1] - (u[k + stride] - u[k - stride]));
        }
      }
      for (let j = 2; j < ny; j++) {
        for (let i = 2; i < nx; i++) {
          const k = IX(i, j);
          const gx = 0.5 * (Math.abs(curl[k + 1]) - Math.abs(curl[k - 1]));
          const gy = 0.5 * (Math.abs(curl[k + stride]) - Math.abs(curl[k - stride]));
          const len = Math.hypot(gx, gy) + 1e-5;
          u[k] += dt * VORTICITY * (gy / len) * curl[k];
          v[k] -= dt * VORTICITY * (gx / len) * curl[k];
        }
      }

      // Advect velocity by itself.
      u0.set(u);
      v0.set(v);
      advect(u, u0, dt);
      advect(v, v0, dt);

      // Pressure projection: make the flow divergence-free (it swirls rather than piles up).
      for (let j = 1; j <= ny; j++) {
        for (let i = 1; i <= nx; i++) {
          const k = IX(i, j);
          div[k] = -0.5 * (u[k + 1] - u[k - 1] + v[k + stride] - v[k - stride]);
          p[k] = 0;
        }
      }
      bounds(div);
      bounds(p);
      for (let it = 0; it < PRESSURE_ITERATIONS; it++) {
        for (let j = 1; j <= ny; j++) {
          for (let i = 1; i <= nx; i++) {
            const k = IX(i, j);
            p[k] = (div[k] + p[k - 1] + p[k + 1] + p[k - stride] + p[k + stride]) / 4;
          }
        }
        bounds(p);
      }
      for (let j = 1; j <= ny; j++) {
        for (let i = 1; i <= nx; i++) {
          const k = IX(i, j);
          u[k] -= 0.5 * (p[k + 1] - p[k - 1]);
          v[k] -= 0.5 * (p[k + stride] - p[k - stride]);
        }
      }
      bounds(u);
      bounds(v);

      // Carry the light along the flow.
      u0.set(u);
      v0.set(v);
      dW0.set(dW);
      dA0.set(dA);
      advect(dW, dW0, dt);
      advect(dA, dA0, dt);

      // Inertia fades; light diffuses (bilinear advection + CSS blur) and dissipates.
      const vd = Math.exp(-VELOCITY_DECAY * dt);
      const dd = Math.exp(-DYE_DECAY * dt);
      let maxDye = 0;
      for (let k = 0; k < u.length; k++) {
        u[k] *= vd;
        v[k] *= vd;
        dW[k] *= dd;
        dA[k] *= dd;
        const d = dW[k] + dA[k];
        if (d > maxDye) maxDye = d;
      }
      return maxDye;
    }

    function render() {
      const data = image!.data;
      let o = 0;
      for (let j = 1; j <= ny; j++) {
        for (let i = 1; i <= nx; i++) {
          const k = IX(i, j);
          // Two lights added together, like light rather than paint: a white core
          // and an orange glow, each softly saturating so nothing blows out.
          const iw = 1 - Math.exp(-dW[k] * 2.2);
          const ia = 1 - Math.exp(-dA[k] * 2.2);
          const r = Math.min(1, iw + ia);
          const g = Math.min(1, iw * 0.97 + ia * 0.55);
          const b = Math.min(1, iw * 0.93 + ia * 0.2);
          const peak = Math.max(r, g, b);
          if (peak < 1e-3) {
            data[o + 3] = 0;
          } else {
            data[o] = (r / peak) * 255;
            data[o + 1] = (g / peak) * 255;
            data[o + 2] = (b / peak) * 255;
            data[o + 3] = peak * LIGHT_MAX * 255;
          }
          o += 4;
        }
      }
      ctx!.putImageData(image!, 0, 0);
    }

    function frame(now: number) {
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 1 / 30) : 1 / 60;
      lastFrame = now;
      const maxDye = step(dt);
      render();
      // Stop once nothing visible remains (rendered alpha < ~2/255); leftover motion is invisible without dye.
      if (maxDye < 0.006 && now - lastPointerAt > 400) {
        // Fully dissipated: clear and stop until the pointer moves again.
        u.fill(0);
        v.fill(0);
        dW.fill(0);
        dA.fill(0);
        ctx!.clearRect(0, 0, nx, ny);
        raf = 0;
        lastFrame = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    const start = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const x = ((e.clientX - left) / width) * nx + 0.5;
      const y = ((e.clientY - top) / height) * ny + 0.5;
      const t = e.timeStamp;
      if (!last) {
        last = { x, y, t }; // first point after entering: no jump, no splat
        return;
      }
      const dt = Math.max((t - last.t) / 1000, 1 / 240);
      let vx = (x - last.x) / dt;
      let vy = (y - last.y) / dt;
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_POINTER_SPEED) {
        vx *= MAX_POINTER_SPEED / speed;
        vy *= MAX_POINTER_SPEED / speed;
      }
      const strength = Math.min(1, speed / 40); // slow drift adds little light
      const dist = Math.hypot(x - last.x, y - last.y);
      const steps = Math.max(1, Math.ceil(dist / 1.5)); // fill the path, no gaps between events
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        queued.push(last.x + (x - last.x) * f, last.y + (y - last.y) * f, vx, vy, strength / steps * Math.min(steps, 3));
      }
      last = { x, y, t };
      lastPointerAt = performance.now();
      start();
    };
    const onLeave = () => {
      last = null; // re-entering elsewhere mustn't draw a streak across the page
    };
    const onVisibility = () => {
      if (document.hidden && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        lastFrame = 0;
      }
    };

    setup();
    const target: HTMLElement | Window = fixed ? window : region;
    target.addEventListener("pointermove", onMove as EventListener, { passive: true });
    if (fixed) document.documentElement.addEventListener("pointerleave", onLeave);
    else region.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    const resizeObserver = new ResizeObserver(() => setup());
    resizeObserver.observe(fixed ? document.documentElement : region);
    // The region can move without resizing (e.g. sidebar width changes); keep its offset fresh.
    const refreshOffset = () => {
      if (fixed) return;
      const rect = region.getBoundingClientRect();
      left = rect.left;
      top = rect.top;
    };
    window.addEventListener("resize", refreshOffset);
    region.addEventListener("pointerenter", refreshOffset);

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      target.removeEventListener("pointermove", onMove as EventListener);
      if (fixed) document.documentElement.removeEventListener("pointerleave", onLeave);
      else region.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", refreshOffset);
      region.removeEventListener("pointerenter", refreshOffset);
      resizeObserver.disconnect();
      ctx.clearRect(0, 0, canvas.width, canvas.height); // Off clears the light immediately
    };
  }, [enabled, fixed, regionRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        "pointer-events-none inset-0 h-full w-full [filter:blur(5px)] mix-blend-screen",
        fixed ? "fixed" : "absolute",
        className
      )}
    />
  );
}
