"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A static field of small, faint stars filling its positioned parent. Drawn
 * once per size change (no animation, no twinkle); seeded, so it doesn't
 * reshuffle between renders. `density` is stars per 10,000 px².
 */
export function StarField({ density = 2.4, className }: { density?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; // the base background colour still shows

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      let seed = 0x5a17;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const count = Math.round((width * height * density) / 10000);
      for (let i = 0; i < count; i++) {
        const bright = rand() < 0.07;
        const r = bright ? 0.8 + rand() * 0.5 : 0.3 + rand() * 0.45;
        const alpha = bright ? 0.42 + rand() * 0.2 : 0.12 + rand() * 0.26;
        const shade = Math.round(205 + rand() * 50);
        ctx.fillStyle = `rgba(${shade},${shade},${shade + 4},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(rand() * width, rand() * height, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [density]);

  return <canvas ref={canvasRef} aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} />;
}
